
CREATE POLICY "Users can delete own transactions"
ON public.transactions
FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own transaction items"
ON public.transaction_items
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM transactions t
  WHERE t.id = transaction_items.transaction_id
  AND t.user_id = auth.uid()
));
