
-- GCash settings (wallet balance per user)
CREATE TABLE public.gcash_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_balance numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gcash_settings TO authenticated;
GRANT ALL ON public.gcash_settings TO service_role;

ALTER TABLE public.gcash_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own gcash settings" ON public.gcash_settings
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER gcash_settings_updated_at
  BEFORE UPDATE ON public.gcash_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- GCash transactions
CREATE TABLE public.gcash_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('cash_in','cash_out','mobile_load','bills_payment')),
  amount numeric NOT NULL CHECK (amount > 0),
  fee numeric NOT NULL DEFAULT 0 CHECK (fee >= 0),
  customer_name text,
  reference_number text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gcash_transactions TO authenticated;
GRANT ALL ON public.gcash_transactions TO service_role;

ALTER TABLE public.gcash_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own gcash transactions" ON public.gcash_transactions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX gcash_transactions_user_created_idx
  ON public.gcash_transactions(user_id, created_at DESC);

-- Helper: wallet delta for a row (positive = increases wallet)
CREATE OR REPLACE FUNCTION public.gcash_wallet_delta(p_type text, p_amount numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_type
    WHEN 'cash_out' THEN p_amount       -- customer's GCash in, you give cash → wallet up
    WHEN 'cash_in' THEN -p_amount       -- customer cash, you send GCash → wallet down
    WHEN 'mobile_load' THEN -p_amount   -- load deducted from wallet
    WHEN 'bills_payment' THEN -p_amount -- bill paid from wallet
    ELSE 0
  END;
$$;
REVOKE EXECUTE ON FUNCTION public.gcash_wallet_delta(text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gcash_wallet_delta(text, numeric) TO authenticated;

-- Ensure settings row exists for a user
CREATE OR REPLACE FUNCTION public.ensure_gcash_settings(p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.gcash_settings(user_id) VALUES (p_user)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ensure_gcash_settings(uuid) FROM PUBLIC, anon, authenticated;

-- Trigger to keep wallet balance in sync
CREATE OR REPLACE FUNCTION public.sync_gcash_wallet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_user := NEW.user_id;
    PERFORM public.ensure_gcash_settings(v_user);
    UPDATE public.gcash_settings
       SET wallet_balance = wallet_balance + public.gcash_wallet_delta(NEW.type, NEW.amount)
     WHERE user_id = v_user;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_user := OLD.user_id;
    UPDATE public.gcash_settings
       SET wallet_balance = wallet_balance - public.gcash_wallet_delta(OLD.type, OLD.amount)
     WHERE user_id = v_user;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    v_user := NEW.user_id;
    UPDATE public.gcash_settings
       SET wallet_balance = wallet_balance
                          - public.gcash_wallet_delta(OLD.type, OLD.amount)
                          + public.gcash_wallet_delta(NEW.type, NEW.amount)
     WHERE user_id = v_user;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sync_gcash_wallet() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER gcash_transactions_sync_wallet
  AFTER INSERT OR UPDATE OR DELETE ON public.gcash_transactions
  FOR EACH ROW EXECUTE FUNCTION public.sync_gcash_wallet();
