ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS receipt_number text;

CREATE POLICY "Users can update own expenses"
ON public.expenses
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);