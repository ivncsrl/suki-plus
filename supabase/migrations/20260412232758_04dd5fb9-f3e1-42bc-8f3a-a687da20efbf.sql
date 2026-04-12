ALTER TABLE public.products
ALTER COLUMN stock TYPE numeric(10,2)
USING stock::numeric(10,2);

ALTER TABLE public.products
ALTER COLUMN stock SET DEFAULT 0;

ALTER TABLE public.transaction_items
ALTER COLUMN quantity TYPE numeric(10,2)
USING quantity::numeric(10,2);

CREATE OR REPLACE FUNCTION public.process_pos_sale(
  p_paid numeric,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_transaction_id uuid;
  v_total numeric := 0;
  v_profit numeric := 0;
  v_change numeric := 0;
  v_item jsonb;
  v_product RECORD;
  v_quantity numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to process a sale';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Sale must include at least one item';
  END IF;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity := (v_item->>'quantity')::numeric;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for sale item';
    END IF;

    SELECT id, name, selling_price, buying_price, stock
    INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::uuid
      AND user_id = auth.uid()
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found';
    END IF;

    IF v_quantity > v_product.stock THEN
      RAISE EXCEPTION 'Not enough stock for %', v_product.name;
    END IF;

    v_total := v_total + (v_product.selling_price * v_quantity);
    v_profit := v_profit + ((v_product.selling_price - v_product.buying_price) * v_quantity);
  END LOOP;

  IF p_paid < v_total THEN
    RAISE EXCEPTION 'Paid amount is less than total sale amount';
  END IF;

  v_change := p_paid - v_total;

  INSERT INTO public.transactions (user_id, total, profit, paid, change)
  VALUES (auth.uid(), v_total, v_profit, p_paid, v_change)
  RETURNING id INTO v_transaction_id;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity := (v_item->>'quantity')::numeric;

    SELECT id, name, selling_price, buying_price, stock
    INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::uuid
      AND user_id = auth.uid()
    FOR UPDATE;

    INSERT INTO public.transaction_items (transaction_id, product_name, quantity, price, cost)
    VALUES (
      v_transaction_id,
      v_product.name,
      v_quantity,
      v_product.selling_price,
      v_product.buying_price
    );

    UPDATE public.products
    SET stock = stock - v_quantity
    WHERE id = v_product.id
      AND user_id = auth.uid();
  END LOOP;

  RETURN v_transaction_id;
END;
$$;