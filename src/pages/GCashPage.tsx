import { useState, useMemo, useEffect, useCallback } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Plus, Trash2, Pencil, Wallet, ArrowUpRight, ArrowDownLeft, Smartphone, FileText, Pencil as PencilIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { peso } from '@/lib/format';
import { toast } from 'sonner';

type GcashType = 'cash_in' | 'cash_out' | 'mobile_load' | 'bills_payment';

const TYPE_META: Record<GcashType, { label: string; icon: any; color: string; sign: 1 | -1 }> = {
  cash_in:        { label: 'Cash-In',       icon: ArrowDownLeft, color: 'text-rose-600',    sign: -1 },
  cash_out:       { label: 'Cash-Out',      icon: ArrowUpRight,  color: 'text-emerald-600', sign:  1 },
  mobile_load:    { label: 'Mobile Load',   icon: Smartphone,    color: 'text-rose-600',    sign: -1 },
  bills_payment:  { label: 'Bills Payment', icon: FileText,      color: 'text-rose-600',    sign: -1 },
};

const TYPES: GcashType[] = ['cash_in', 'cash_out', 'mobile_load', 'bills_payment'];

const todayStr = () => new Date().toISOString().split('T')[0];

const emptyForm = () => ({
  type: 'cash_in' as GcashType,
  amount: '',
  fee: '',
  customer_name: '',
  reference_number: '',
  notes: '',
  transaction_date: todayStr(),
});

const GCashPage = () => {
  const { user } = useAuth();
  const [walletBalance, setWalletBalance] = useState(0);
  const [txns, setTxns] = useState<any[]>([]);
  const [filter, setFilter] = useState<'All' | GcashType>('All');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showSetBalance, setShowSetBalance] = useState(false);
  const [newBalance, setNewBalance] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: settings }, { data: list }] = await Promise.all([
      supabase.from('gcash_settings').select('wallet_balance').eq('user_id', user.id).maybeSingle(),
      supabase.from('gcash_transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]);
    if (!settings) {
      await supabase.from('gcash_settings').insert({ user_id: user.id, wallet_balance: 0 });
      setWalletBalance(0);
    } else {
      setWalletBalance(Number(settings.wallet_balance));
    }
    setTxns((list || []).map(t => ({ ...t, amount: Number(t.amount), fee: Number(t.fee) })));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => filter === 'All' ? txns : txns.filter(t => t.type === filter),
    [txns, filter]
  );

  const totals = useMemo(() => {
    let inAmt = 0, outAmt = 0, load = 0, bills = 0, fees = 0;
    for (const t of txns) {
      fees += t.fee;
      if (t.type === 'cash_in') inAmt += t.amount;
      else if (t.type === 'cash_out') outAmt += t.amount;
      else if (t.type === 'mobile_load') load += t.amount;
      else if (t.type === 'bills_payment') bills += t.amount;
    }
    return { inAmt, outAmt, load, bills, fees, count: txns.length };
  }, [txns]);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (t: any) => {
    setEditingId(t.id);
    setForm({
      type: t.type,
      amount: String(t.amount),
      fee: String(t.fee || ''),
      customer_name: t.customer_name || '',
      reference_number: t.reference_number || '',
      notes: t.notes || '',
      transaction_date: t.transaction_date || todayStr(),
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!user) return;
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    const fee = parseFloat(form.fee) || 0;
    const payload = {
      type: form.type,
      amount,
      fee,
      customer_name: form.customer_name.trim() || null,
      reference_number: form.reference_number.trim() || null,
      notes: form.notes.trim() || null,
      transaction_date: form.transaction_date,
    };
    try {
      if (editingId) {
        const { error } = await supabase.from('gcash_transactions').update(payload).eq('id', editingId);
        if (error) throw error;
        toast.success('Transaction updated');
      } else {
        const { error } = await supabase.from('gcash_transactions').insert({ user_id: user.id, ...payload });
        if (error) throw error;
        toast.success('Transaction recorded');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const { error } = await supabase.from('gcash_transactions').delete().eq('id', confirmDelete);
    if (error) { toast.error(error.message); return; }
    toast.success('Transaction deleted');
    setConfirmDelete(null);
    load();
  };

  const handleSetBalance = async () => {
    if (!user) return;
    const v = parseFloat(newBalance);
    if (isNaN(v) || v < 0) { toast.error('Enter a valid balance'); return; }
    const { error } = await supabase.from('gcash_settings').upsert({ user_id: user.id, wallet_balance: v });
    if (error) { toast.error(error.message); return; }
    toast.success('Wallet balance updated');
    setShowSetBalance(false);
    setNewBalance('');
    load();
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">GCash</h1>
            <p className="text-sm text-muted-foreground">Cash-in, Cash-out, Load & Bills</p>
          </div>
          <Button onClick={openNew} className="gap-1"><Plus className="w-4 h-4" /> New</Button>
        </header>

        {/* Wallet balance */}
        <div className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground rounded-xl p-5 shadow-mui-2">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm opacity-90"><Wallet className="w-4 h-4" /> GCash Wallet Balance</div>
              <div className="text-3xl font-bold mt-1">{peso(walletBalance)}</div>
            </div>
            <button
              onClick={() => { setNewBalance(String(walletBalance)); setShowSetBalance(true); }}
              className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition"
              aria-label="Set balance"
            >
              <PencilIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-3 text-xs opacity-90">Total service fees earned: <span className="font-semibold">{peso(totals.fees)}</span></div>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-2 gap-3">
          <SummaryTile label="Cash-In" value={totals.inAmt} icon={ArrowDownLeft} tint="bg-rose-50 text-rose-700" />
          <SummaryTile label="Cash-Out" value={totals.outAmt} icon={ArrowUpRight} tint="bg-emerald-50 text-emerald-700" />
          <SummaryTile label="Mobile Load" value={totals.load} icon={Smartphone} tint="bg-violet-50 text-violet-700" />
          <SummaryTile label="Bills Payment" value={totals.bills} icon={FileText} tint="bg-amber-50 text-amber-700" />
        </div>

        {/* Filter */}
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
          {(['All', ...TYPES] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f as any)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${
                filter === f ? 'bg-primary text-primary-foreground shadow-mui-1' : 'bg-muted text-foreground'
              }`}
            >
              {f === 'All' ? 'All' : TYPE_META[f as GcashType].label}
            </button>
          ))}
        </div>

        {/* Transactions */}
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Wallet className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>No transactions yet</p>
            </div>
          )}
          {filtered.map(t => {
            const meta = TYPE_META[t.type as GcashType];
            const Icon = meta.icon;
            return (
              <div key={t.id} className="bg-card rounded-lg p-3 shadow-mui-1 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full grid place-items-center bg-muted ${meta.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold truncate">{meta.label}</div>
                    <div className={`font-bold ${meta.color}`}>
                      {meta.sign > 0 ? '+' : '−'}{peso(t.amount)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <div className="truncate">
                      {t.customer_name && <span>{t.customer_name} · </span>}
                      {new Date(t.created_at).toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' })}
                      {t.reference_number && <span> · Ref {t.reference_number}</span>}
                    </div>
                    {t.fee > 0 && <span className="text-emerald-600 font-semibold">Fee {peso(t.fee)}</span>}
                  </div>
                  {t.notes && <div className="text-xs text-muted-foreground mt-0.5 truncate">{t.notes}</div>}
                </div>
                <div className="flex flex-col gap-1">
                  <button onClick={() => openEdit(t)} className="p-1.5 rounded hover:bg-muted" aria-label="Edit">
                    <Pencil className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button onClick={() => setConfirmDelete(t.id)} className="p-1.5 rounded hover:bg-destructive/10" aria-label="Delete">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* New / Edit dialog */}
      <Dialog open={showForm} onOpenChange={(o) => { if (!o) { setShowForm(false); setEditingId(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Transaction' : 'New GCash Transaction'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">Type</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {TYPES.map(t => {
                  const meta = TYPE_META[t];
                  const Icon = meta.icon;
                  const active = form.type === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, type: t }))}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition ${
                        active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card'
                      }`}
                    >
                      <Icon className="w-4 h-4" /> {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Amount (₱)</Label>
                <Input inputMode="decimal" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <Label className="text-sm">Service Fee (₱)</Label>
                <Input inputMode="decimal" value={form.fee} onChange={e => setForm(f => ({ ...f, fee: e.target.value }))} placeholder="0.00" />
              </div>
            </div>
            <div>
              <Label className="text-sm">Customer name (optional)</Label>
              <Input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="e.g. Aling Maria" />
            </div>
            <div>
              <Label className="text-sm">
                {form.type === 'mobile_load' ? 'Mobile number' : 'Reference number'} (optional)
              </Label>
              <Input value={form.reference_number} onChange={e => setForm(f => ({ ...f, reference_number: e.target.value }))} placeholder={form.type === 'mobile_load' ? '09XX XXX XXXX' : 'Ref #'} />
            </div>
            <div>
              <Label className="text-sm">Notes (optional)</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Globe 100, Meralco bill…" />
            </div>
            <div className="text-xs text-muted-foreground bg-muted rounded-md p-2">
              {form.type === 'cash_out'
                ? 'Wallet balance will increase by the amount. Give cash to customer from your drawer.'
                : 'Wallet balance will decrease by the amount.'}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
            <Button onClick={handleSubmit}>{editingId ? 'Save' : 'Record'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set wallet balance dialog */}
      <Dialog open={showSetBalance} onOpenChange={setShowSetBalance}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set GCash Wallet Balance</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-sm">Current balance (₱)</Label>
            <Input inputMode="decimal" value={newBalance} onChange={e => setNewBalance(e.target.value)} placeholder="0.00" />
            <p className="text-xs text-muted-foreground">Use this to set your starting balance or correct any discrepancy.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowSetBalance(false)}>Cancel</Button>
            <Button onClick={handleSetBalance}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this transaction?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">The wallet balance will be adjusted automatically. This cannot be undone.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const SummaryTile = ({ label, value, icon: Icon, tint }: { label: string; value: number; icon: any; tint: string }) => (
  <div className="bg-card rounded-lg p-3 shadow-mui-1">
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${tint}`}>
      <Icon className="w-3 h-3" /> {label}
    </div>
    <div className="text-lg font-bold mt-1">{peso(value)}</div>
  </div>
);

export default GCashPage;
