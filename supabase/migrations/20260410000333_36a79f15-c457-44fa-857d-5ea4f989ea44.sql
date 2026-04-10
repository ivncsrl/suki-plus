
CREATE POLICY "Users can update own transactions"
ON public.transactions
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own transaction items"
ON public.transaction_items
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM transactions t
  WHERE t.id = transaction_items.transaction_id
  AND t.user_id = auth.uid()
));
