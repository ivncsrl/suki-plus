ALTER TABLE public.gcash_transactions ADD COLUMN transaction_date date NOT NULL DEFAULT CURRENT_DATE;

UPDATE public.gcash_transactions SET transaction_date = created_at::date;

-- Drop the default so future app inserts must supply the date explicitly
ALTER TABLE public.gcash_transactions ALTER COLUMN transaction_date DROP DEFAULT;