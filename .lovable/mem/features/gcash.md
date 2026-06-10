---
name: GCash Page
description: GCash cash-in/out, mobile load, and bills payment tracking with auto wallet balance
type: feature
---
- Page at `/gcash`. Tracks four transaction types: cash_in, cash_out, mobile_load, bills_payment.
- `gcash_settings` stores per-user wallet_balance; `gcash_transactions` stores each txn with amount, fee, customer_name, reference_number, notes.
- Wallet effects via DB trigger `sync_gcash_wallet`: cash_out +amount; cash_in / mobile_load / bills_payment −amount. Edits and deletes adjust automatically.
- User can manually set/correct wallet balance via the pencil button on the balance card (upsert to gcash_settings).
- Service fee is per-transaction (user-entered) and shown separately as profit earned; not part of wallet delta.
