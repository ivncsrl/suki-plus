
-- Product variants table
CREATE TABLE public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  buying_price numeric NOT NULL DEFAULT 0,
  selling_price numeric NOT NULL DEFAULT 0,
  stock numeric,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_variants_product ON public.product_variants(product_id);
CREATE INDEX idx_product_variants_user ON public.product_variants(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own variants" ON public.product_variants
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own variants" ON public.product_variants
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own variants" ON public.product_variants
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own variants" ON public.product_variants
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add variant tracking to transaction_items
ALTER TABLE public.transaction_items ADD COLUMN IF NOT EXISTS variant_id uuid;
ALTER TABLE public.transaction_items ADD COLUMN IF NOT EXISTS variant_name text;

-- Updated POS sale RPC supporting optional variant_id per item
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
  v_product RECORD;
  v_variant RECORD;
  v_quantity numeric;
  v_track boolean := false;
  v_variant_id uuid;
  v_sell numeric;
  v_buy numeric;
  v_stock numeric;
  v_name text;
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

    SELECT id, name, selling_price, buying_price, stock
    INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::uuid AND user_id = auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;

    v_variant_id := NULLIF(v_item->>'variant_id','')::uuid;
    IF v_variant_id IS NOT NULL THEN
      SELECT id, name, selling_price, buying_price, stock INTO v_variant
      FROM public.product_variants
      WHERE id = v_variant_id AND product_id = v_product.id AND user_id = auth.uid();
      IF NOT FOUND THEN RAISE EXCEPTION 'Variant not found'; END IF;
      v_sell := v_variant.selling_price;
      v_buy := v_variant.buying_price;
      v_stock := v_variant.stock;
      v_name := v_product.name || ' - ' || v_variant.name;
    ELSE
      v_sell := v_product.selling_price;
      v_buy := v_product.buying_price;
      v_stock := v_product.stock;
      v_name := v_product.name;
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

    SELECT id, name, selling_price, buying_price INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::uuid AND user_id = auth.uid();

    v_variant_id := NULLIF(v_item->>'variant_id','')::uuid;
    IF v_variant_id IS NOT NULL THEN
      SELECT id, name, selling_price, buying_price INTO v_variant
      FROM public.product_variants
      WHERE id = v_variant_id AND product_id = v_product.id AND user_id = auth.uid();
      v_sell := v_variant.selling_price;
      v_buy := v_variant.buying_price;
      v_name := v_product.name || ' - ' || v_variant.name;
    ELSE
      v_sell := v_product.selling_price;
      v_buy := v_product.buying_price;
      v_name := v_product.name;
    END IF;

    INSERT INTO public.transaction_items (transaction_id, product_name, quantity, price, cost, variant_id, variant_name)
    VALUES (v_transaction_id, v_name, v_quantity, v_sell, v_buy, v_variant_id,
            CASE WHEN v_variant_id IS NOT NULL THEN v_variant.name ELSE NULL END);

    IF v_track THEN
      IF v_variant_id IS NOT NULL THEN
        UPDATE public.product_variants
           SET stock = GREATEST(0, COALESCE(stock,0) - v_quantity)
         WHERE id = v_variant_id AND user_id = auth.uid();
      ELSE
        UPDATE public.products
           SET stock = GREATEST(0, COALESCE(stock, 0) - v_quantity)
         WHERE id = v_product.id AND user_id = auth.uid();
      END IF;
    END IF;
  END LOOP;

  RETURN v_transaction_id;
END;
$function$;
