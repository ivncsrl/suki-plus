import { useState, useMemo, useEffect, useCallback } from 'react';
import { Plus, Trash2, TrendingDown, TrendingUp, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { peso } from '@/lib/format';
import { toast } from 'sonner';

const TYPES = ['Product', 'Gasoline', 'Travel', 'Restock Trip', 'Other'] as const;

const ExpensesPage = () => {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ type: 'Other', description: '', amount: '', date: new Date().toISOString().slice(0, 10), destination: '', receipt_number: '' });
  const [filterType, setFilterType] = useState('All');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalSalesProfit, setTotalSalesProfit] = useState(0);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: exp }, { data: txns }] = await Promise.all([
      supabase.from('expenses').select('*').eq('user_id', user.id).order('date', { ascending: false }),
      supabase.from('transactions').select('total, profit').eq('user_id', user.id),
    ]);
    setExpenses((exp || []).map(e => ({ ...e, amount: Number(e.amount) })));
    setTotalRevenue((txns || []).reduce((s, t) => s + Number(t.total), 0));
    setTotalSalesProfit((txns || []).reduce((s, t) => s + Number(t.profit), 0));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return expenses.filter(e => {
      if (filterType !== 'All' && e.type !== filterType) return false;
      if (fromDate && e.date < fromDate) return false;
      if (toDate && e.date > toDate) return false;
      return true;
    });
  }, [expenses, filterType, fromDate, toDate]);

  const totalExpenses = filtered.reduce((s, e) => s + e.amount, 0);
  const allExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const cogs = totalRevenue - totalSalesProfit;
  const netProfit = totalRevenue - cogs - allExpenses;

  const resetForm = () => setForm({ type: 'Other', description: '', amount: '', date: new Date().toISOString().slice(0, 10), destination: '', receipt_number: '' });

  const handleSubmit = async () => {
    if (!user || !form.amount) return;
    try {
      const payload = {
        type: form.type,
        description: form.description.trim(),
        amount: parseFloat(form.amount) || 0,
        date: form.date,
        destination: (form.type === 'Travel' || form.type === 'Restock Trip') ? form.destination.trim() || null : null,
        receipt_number: form.receipt_number.trim() || null,
      };
      if (editingId) {
        const { error } = await supabase.from('expenses').update(payload).eq('id', editingId);
        if (error) throw error;
        toast.success('Expense updated');
      } else {
        const { error } = await supabase.from('expenses').insert({ user_id: user.id, ...payload });
        if (error) throw error;
        toast.success('Expense added');
      }
      resetForm();
      setEditingId(null);
      setShowForm(false);
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleEdit = (e: any) => {
    setEditingId(e.id);
    setForm({
      type: e.type,
      description: e.description || '',
      amount: String(e.amount),
      date: e.date,
      destination: e.destination || '',
      receipt_number: e.receipt_number || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('expenses').delete().eq('id', id);
    load();
  };

  return (
    <div className="pb-20 max-w-3xl mx-auto px-4 pt-4 animate-fade-in">
      <div className="flex justify-between items-center mb-3">
        <h1 className="text-xl font-extrabold">💸 Expenses</h1>
        <Button size="sm" onClick={() => setShowForm(true)}><Plus className="w-4 h-4 mr-1" /> Add</Button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="bg-card rounded-lg p-2 border border-border text-center">
          <p className="text-[10px] text-muted-foreground font-semibold flex items-center justify-center gap-0.5"><TrendingUp className="w-3 h-3" /> Total Revenue</p>
          <p className="text-sm font-extrabold text-success">{peso(totalRevenue)}</p>
        </div>
        <div className="bg-card rounded-lg p-2 border border-border text-center">
          <p className="text-[10px] text-muted-foreground font-semibold">Cost of Goods</p>
          <p className="text-sm font-extrabold text-foreground">{peso(cogs)}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-card rounded-lg p-2 border border-border text-center">
          <p className="text-[10px] text-muted-foreground font-semibold flex items-center justify-center gap-0.5"><TrendingDown className="w-3 h-3" /> Expenses</p>
          <p className="text-sm font-extrabold text-destructive">{peso(allExpenses)}</p>
        </div>
        <div className={`rounded-lg p-2 border text-center ${netProfit >= 0 ? 'bg-success/10 border-success/30' : 'bg-destructive/10 border-destructive/30'}`}>
          <p className="text-[10px] text-muted-foreground font-semibold">Net Profit</p>
          <p className={`text-sm font-extrabold ${netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>{peso(netProfit)}</p>
        </div>
      </div>
      </div>

      <div className="flex gap-2 mb-2 overflow-x-auto">
        {['All', ...TYPES].map(t => (
          <button key={t} onClick={() => setFilterType(t)} className={`text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap transition-colors active:scale-95 ${filterType === t ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>{t}</button>
        ))}
      </div>

      <div className="flex gap-2 mb-3">
        <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-9 text-sm flex-1" />
        <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-9 text-sm flex-1" />
      </div>

      {(filterType !== 'All' || fromDate || toDate) && (
        <p className="text-xs text-muted-foreground mb-2">Filtered total: <span className="font-bold">{peso(totalExpenses)}</span></p>
      )}

      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">No expenses recorded</p>}
        {filtered.map(e => (
          <div key={e.id} className="bg-card rounded-xl border border-border p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">{e.type}</span>
                <span className="text-[10px] text-muted-foreground">{new Date(e.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</span>
              </div>
              {e.description && <p className="text-xs mt-0.5 truncate">{e.description}</p>}
              {e.destination && <p className="text-[10px] text-muted-foreground">📍 {e.destination}</p>}
              {e.receipt_number && <p className="text-[10px] text-muted-foreground">🧾 #{e.receipt_number}</p>}
            </div>
            <p className="text-sm font-extrabold text-destructive">{peso(e.amount)}</p>
            <button onClick={() => handleEdit(e)} className="text-primary/70 active:scale-90"><Pencil className="w-4 h-4" /></button>
            <button onClick={() => handleDelete(e.id)} className="text-destructive/60 active:scale-90"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>

      <Dialog open={showForm} onOpenChange={(o) => { setShowForm(o); if (!o) { setEditingId(null); resetForm(); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-extrabold text-lg">{editingId ? 'Edit Expense' : 'New Expense'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              {TYPES.map(t => (
                <button key={t} onClick={() => setForm({ ...form, type: t })} className={`text-xs font-semibold px-3 py-1.5 rounded-full active:scale-95 ${form.type === t ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>{t}</button>
              ))}
            </div>
            <Input placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="h-11" />
            <Input type="number" inputMode="decimal" placeholder="Amount (₱)" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="h-11" />
            <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="h-11" />
            <Input placeholder="Receipt number (optional)" value={form.receipt_number} onChange={e => setForm({ ...form, receipt_number: e.target.value })} className="h-11" />
            {(form.type === 'Travel' || form.type === 'Restock Trip') && (
              <Input placeholder="Destination city (optional)" value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })} className="h-11" />
            )}
            <Button onClick={handleSubmit} className="w-full h-11 font-bold">{editingId ? 'Save Changes' : 'Add Expense'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExpensesPage;
