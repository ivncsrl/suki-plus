
CREATE OR REPLACE FUNCTION public.process_pos_sale(p_paid numeric, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_transaction_id uuid;
  v_total numeric := 0;
  v_profit numeric := 0;
  v_item jsonb;
  v_quantity numeric;
  v_track boolean := false;
  v_variant_id uuid;
  v_product_id uuid;
  v_sell numeric;
  v_buy numeric;
  v_stock numeric;
  v_name text;
  v_variant_name text;
  v_prod_name text;
  v_var_name text;
  v_var_sell numeric;
  v_var_buy numeric;
  v_var_stock numeric;
  v_prod_sell numeric;
  v_prod_buy numeric;
  v_prod_stock numeric;
  v_found boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to process a sale';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Sale must include at least one item';
  END IF;

  SELECT COALESCE(track_inventory, false) INTO v_track FROM public.profiles WHERE user_id = auth.uid();

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_quantity := (v_item->>'quantity')::numeric;
    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for sale item';
    END IF;

    v_product_id := (v_item->>'product_id')::uuid;
    v_variant_id := NULLIF(v_item->>'variant_id','')::uuid;

    SELECT name, selling_price, buying_price, stock
      INTO v_prod_name, v_prod_sell, v_prod_buy, v_prod_stock
      FROM public.products
     WHERE id = v_product_id AND user_id = auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;

    IF v_variant_id IS NOT NULL THEN
      SELECT name, selling_price, buying_price, stock
        INTO v_var_name, v_var_sell, v_var_buy, v_var_stock
        FROM public.product_variants
       WHERE id = v_variant_id AND product_id = v_product_id AND user_id = auth.uid();
      IF NOT FOUND THEN RAISE EXCEPTION 'Variant not found'; END IF;
      v_sell := v_var_sell;
      v_buy := v_var_buy;
      v_stock := v_var_stock;
      v_name := v_prod_name || ' - ' || v_var_name;
    ELSE
      v_sell := v_prod_sell;
      v_buy := v_prod_buy;
      v_stock := v_prod_stock;
      v_name := v_prod_name;
    END IF;

    IF v_track AND COALESCE(v_stock, 0) < v_quantity THEN
      RAISE EXCEPTION 'Not enough stock for %', v_name;
    END IF;

    v_total := v_total + (v_sell * v_quantity);
    v_profit := v_profit + ((v_sell - v_buy) * v_quantity);
  END LOOP;

  IF p_paid < v_total THEN
    RAISE EXCEPTION 'Paid amount is less than total sale amount';
  END IF;

  INSERT INTO public.transactions (user_id, total, profit, paid)
  VALUES (auth.uid(), v_total, v_profit, p_paid)
  RETURNING id INTO v_transaction_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_quantity := (v_item->>'quantity')::numeric;
    v_product_id := (v_item->>'product_id')::uuid;
    v_variant_id := NULLIF(v_item->>'variant_id','')::uuid;

    SELECT name, selling_price, buying_price
      INTO v_prod_name, v_prod_sell, v_prod_buy
      FROM public.products
     WHERE id = v_product_id AND user_id = auth.uid();

    IF v_variant_id IS NOT NULL THEN
      SELECT name, selling_price, buying_price
        INTO v_var_name, v_var_sell, v_var_buy
        FROM public.product_variants
       WHERE id = v_variant_id AND product_id = v_product_id AND user_id = auth.uid();
      v_sell := v_var_sell;
      v_buy := v_var_buy;
      v_name := v_prod_name || ' - ' || v_var_name;
      v_variant_name := v_var_name;
    ELSE
      v_sell := v_prod_sell;
      v_buy := v_prod_buy;
      v_name := v_prod_name;
      v_variant_name := NULL;
    END IF;

    INSERT INTO public.transaction_items (transaction_id, product_name, quantity, price, cost, variant_id, variant_name)
    VALUES (v_transaction_id, v_name, v_quantity, v_sell, v_buy, v_variant_id, v_variant_name);

    IF v_track THEN
      IF v_variant_id IS NOT NULL THEN
        UPDATE public.product_variants
           SET stock = GREATEST(0, COALESCE(stock,0) - v_quantity)
         WHERE id = v_variant_id AND user_id = auth.uid();
      ELSE
        UPDATE public.products
           SET stock = GREATEST(0, COALESCE(stock, 0) - v_quantity)
         WHERE id = v_product_id AND user_id = auth.uid();
      END IF;
    END IF;
  END LOOP;

  RETURN v_transaction_id;
END;
$function$;
