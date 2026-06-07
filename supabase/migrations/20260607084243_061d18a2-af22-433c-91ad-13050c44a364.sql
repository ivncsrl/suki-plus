
-- Lock down EXECUTE on SECURITY DEFINER functions

-- Trigger-only functions: no one should call them as RPC
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_product_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.track_product_changes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- process_pos_sale: only signed-in users (function validates auth.uid())
REVOKE ALL ON FUNCTION public.process_pos_sale(numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_pos_sale(numeric, jsonb) TO authenticated;

-- Storage: restrict listing of product-images to file owners.
-- Public URLs still work (they bypass RLS), but anonymous listing/enumeration is blocked.
DROP POLICY IF EXISTS "Public read product images" ON storage.objects;

CREATE POLICY "Owners can list own product images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'product-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
