
-- 1. Add brand and image_url to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS image_url text;

-- 2. Create product_history table
CREATE TABLE IF NOT EXISTS public.product_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  change_type text NOT NULL CHECK (change_type IN ('price', 'restock')),
  old_buying_price numeric,
  new_buying_price numeric,
  old_selling_price numeric,
  new_selling_price numeric,
  old_stock numeric,
  new_stock numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_history_product ON public.product_history(product_id, created_at DESC);

ALTER TABLE public.product_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own product history" ON public.product_history
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own product history" ON public.product_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own product history" ON public.product_history
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own product history" ON public.product_history
  FOR DELETE USING (auth.uid() = user_id);

-- 3. Update trigger to also log history rows
CREATE OR REPLACE FUNCTION public.track_product_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.price_updated_at := now();
    NEW.stock_updated_at := now();
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.buying_price IS DISTINCT FROM OLD.buying_price
       OR NEW.selling_price IS DISTINCT FROM OLD.selling_price THEN
      NEW.price_updated_at := now();
    END IF;
    IF NEW.stock IS DISTINCT FROM OLD.stock AND NEW.stock > OLD.stock THEN
      NEW.stock_updated_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- AFTER trigger to insert history records
CREATE OR REPLACE FUNCTION public.log_product_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.buying_price IS DISTINCT FROM OLD.buying_price
       OR NEW.selling_price IS DISTINCT FROM OLD.selling_price THEN
      INSERT INTO public.product_history (product_id, user_id, change_type, old_buying_price, new_buying_price, old_selling_price, new_selling_price)
      VALUES (NEW.id, NEW.user_id, 'price', OLD.buying_price, NEW.buying_price, OLD.selling_price, NEW.selling_price);
    END IF;
    IF NEW.stock IS DISTINCT FROM OLD.stock AND NEW.stock > OLD.stock THEN
      INSERT INTO public.product_history (product_id, user_id, change_type, old_stock, new_stock)
      VALUES (NEW.id, NEW.user_id, 'restock', OLD.stock, NEW.stock);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_product_history_trigger ON public.products;
CREATE TRIGGER log_product_history_trigger
  AFTER UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.log_product_history();

-- 4. Create public storage bucket for product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: public read, owner-scoped write (folder = user_id)
CREATE POLICY "Public read product images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

CREATE POLICY "Users upload own product images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own product images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'product-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own product images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'product-images' AND auth.uid()::text = (storage.foldername(name))[1]);
