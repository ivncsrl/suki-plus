-- Add tracking columns for price changes and restocks
ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS price_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS stock_updated_at timestamptz;

-- Trigger to update price_updated_at when buying or selling price changes
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
    -- Track restock: stock increased
    IF NEW.stock IS DISTINCT FROM OLD.stock AND NEW.stock > OLD.stock THEN
      NEW.stock_updated_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS track_product_changes_trigger ON public.products;
CREATE TRIGGER track_product_changes_trigger
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.track_product_changes();

-- Backfill existing rows
UPDATE public.products 
SET price_updated_at = COALESCE(price_updated_at, updated_at),
    stock_updated_at = COALESCE(stock_updated_at, updated_at);

-- Update process_pos_sale to NOT bump stock_updated_at on sale (only restocks)
-- Sales decrease stock; the trigger only updates stock_updated_at when stock increases, so it's fine.