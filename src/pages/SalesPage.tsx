import { useState, useMemo, useEffect, useCallback } from 'react';
import { Calendar, Trash2, Pencil, Plus, Minus, X, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { peso } from '@/lib/format';
import { toast } from 'sonner';

interface TransactionItem {
  id?: string;
  product_name: string;
  quantity: number;
  price: number;
  cost: number;
}

interface Transaction {
  id: string;
  total: number;
  profit: number;
  paid: number;
  change: number;
  created_at: string;
  items: TransactionItem[];
}

/** Get today's date string in local timezone (YYYY-MM-DD) */
const getLocalDateStr = (date: Date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Convert a UTC timestamp to local date string */
const toLocalDate = (utc: string) => getLocalDateStr(new Date(utc));

const SalesPage = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Delete state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Edit state
  const [editTxn, setEditTxn] = useState<Transaction | null>(null);
  const [editItems, setEditItems] = useState<TransactionItem[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemCost, setNewItemCost] = useState('');
  const [newItemQty, setNewItemQty] = useState('1');
  const [editPassword, setEditPassword] = useState('');
  const [saving, setSaving] = useState(false);

  // Products for autocomplete
  const [products, setProducts] = useState<{ name: string; selling_price: number; buying_price: number }[]>([]);

  const loadTransactions = useCallback(async () => {
    if (!user) return;
    const { data: txns } = await supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (!txns) return;

    const txnIds = txns.map(t => t.id);
    const { data: items } = await supabase.from('transaction_items').select('*').in('transaction_id', txnIds);

    setTransactions(txns.map(t => ({
      id: t.id,
      total: Number(t.total),
      profit: Number(t.profit),
      paid: Number(t.paid),
      change: Number(t.change),
      created_at: t.created_at,
      items: (items || []).filter(i => i.transaction_id === t.id).map(i => ({
        id: i.id,
        product_name: i.product_name,
        quantity: i.quantity,
        price: Number(i.price),
        cost: Number(i.cost),
      })),
    })));
  }, [user]);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  useEffect(() => {
    if (!user) return;
    supabase.from('products').select('name, selling_price, buying_price').eq('user_id', user.id)
      .then(({ data }) => setProducts((data || []).map(p => ({ name: p.name, selling_price: Number(p.selling_price), buying_price: Number(p.buying_price) }))));
  }, [user]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return transactions.filter(t => {
      const d = toLocalDate(t.created_at);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      if (q && !t.items.some(i => i.product_name.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [transactions, fromDate, toDate, searchQuery]);

  const totalSales = filtered.reduce((s, t) => s + t.total, 0);
  const totalProfit = filtered.reduce((s, t) => s + t.profit, 0);

  const today = getLocalDateStr();
  const todaySales = transactions.filter(t => toLocalDate(t.created_at) === today);
  const todayTotal = todaySales.reduce((s, t) => s + t.total, 0);
  const todayProfit = todaySales.reduce((s, t) => s + t.profit, 0);

  // ---- Delete ----
  const handleDelete = async () => {
    if (!deleteId || !user) return;
    setDeleting(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email!, password });
      if (authError) { toast.error('Incorrect password'); setDeleting(false); return; }
      await supabase.from('transaction_items').delete().eq('transaction_id', deleteId);
      await supabase.from('transactions').delete().eq('id', deleteId);
      setTransactions(prev => prev.filter(t => t.id !== deleteId));
      toast.success('Transaction deleted');
      setDeleteId(null); setPassword('');
    } catch { toast.error('Failed to delete'); }
    setDeleting(false);
  };

  // ---- Edit ----
  const openEdit = (t: Transaction) => {
    setEditTxn(t);
    setEditItems(t.items.map(i => ({ ...i })));
    setNewItemName(''); setNewItemPrice(''); setNewItemCost(''); setNewItemQty('1');
    setEditPassword('');
  };

  const removeEditItem = (idx: number) => setEditItems(prev => prev.filter((_, i) => i !== idx));

  const updateEditItemQty = (idx: number, val: string) => {
    const num = parseFloat(val);
    setEditItems(prev => prev.map((item, i) => i === idx ? { ...item, quantity: isNaN(num) ? 0 : num } : item));
  };

  const addNewItem = () => {
    if (!newItemName.trim()) return;
    const price = parseFloat(newItemPrice) || 0;
    const cost = parseFloat(newItemCost) || 0;
    const qty = parseFloat(newItemQty) || 1;
    setEditItems(prev => [...prev, { product_name: newItemName.trim(), price, cost, quantity: qty }]);
    setNewItemName(''); setNewItemPrice(''); setNewItemCost(''); setNewItemQty('1');
  };

  const selectProduct = (name: string) => {
    const p = products.find(pr => pr.name === name);
    if (p) {
      setNewItemName(p.name);
      setNewItemPrice(String(p.selling_price));
      setNewItemCost(String(p.buying_price));
    }
  };

  const editTotal = editItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const editProfit = editItems.reduce((s, i) => s + (i.price - i.cost) * i.quantity, 0);

  const handleSaveEdit = async () => {
    if (!editTxn || !user || editItems.length === 0) return;
    setSaving(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email!, password: editPassword });
      if (authError) { toast.error('Incorrect password'); setSaving(false); return; }

      // Update transaction totals
      await supabase.from('transactions').update({
        total: editTotal,
        profit: editProfit,
      }).eq('id', editTxn.id);

      // Delete old items and insert new
      await supabase.from('transaction_items').delete().eq('transaction_id', editTxn.id);
      const newItems = editItems.map(i => ({
        transaction_id: editTxn.id,
        product_name: i.product_name,
        quantity: i.quantity,
        price: i.price,
        cost: i.cost,
      }));
      await supabase.from('transaction_items').insert(newItems);

      toast.success('Transaction updated');
      setEditTxn(null); setEditPassword('');
      loadTransactions();
    } catch { toast.error('Failed to update'); }
    setSaving(false);
  };

  return (
    <div className="pb-20 max-w-3xl mx-auto px-4 pt-4 animate-fade-in">
      <h1 className="text-xl font-extrabold mb-3">📊 Sales Summary</h1>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-card rounded-lg p-3 border border-border">
          <p className="text-[10px] text-muted-foreground font-semibold">Today's Sales</p>
          <p className="text-lg font-extrabold text-primary">{peso(todayTotal)}</p>
        </div>
        <div className="bg-card rounded-lg p-3 border border-border">
          <p className="text-[10px] text-muted-foreground font-semibold">Today's Profit</p>
          <p className="text-lg font-extrabold text-success">{peso(todayProfit)}</p>
        </div>
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search product sold..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="h-9 text-sm pl-9"
        />
      </div>

      <div className="flex gap-2 mb-3">
        <div className="flex-1">
          <label className="text-[10px] text-muted-foreground font-semibold">From</label>
          <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-muted-foreground font-semibold">To</label>
          <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-9 text-sm" />
        </div>
      </div>

      {(fromDate || toDate) && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="bg-secondary rounded-lg p-2 text-center">
            <p className="text-[10px] text-muted-foreground font-semibold">Filtered Sales</p>
            <p className="text-sm font-extrabold">{peso(totalSales)}</p>
          </div>
          <div className="bg-secondary rounded-lg p-2 text-center">
            <p className="text-[10px] text-muted-foreground font-semibold">Filtered Profit</p>
            <p className="text-sm font-extrabold text-success">{peso(totalProfit)}</p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">No transactions yet</p>}
        {filtered.map(t => (
          <div key={t.id} className="bg-card rounded-xl border border-border p-3">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(t.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold text-primary">{peso(t.total)}</span>
                <button onClick={() => openEdit(t)} className="text-muted-foreground hover:text-primary transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setDeleteId(t.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              {t.items.map((item, i) => (
                <span key={i}>{item.product_name} ×{item.quantity}{i < t.items.length - 1 ? ', ' : ''}</span>
              ))}
            </div>
            <div className="text-xs font-semibold text-success mt-1">Profit: {peso(t.profit)}</div>
          </div>
        ))}
      </div>

      {/* Delete Dialog */}
      <Dialog open={!!deleteId} onOpenChange={open => { if (!open) { setDeleteId(null); setPassword(''); } }}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Confirm Delete</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Enter your account password to delete this transaction.</p>
          <Input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleDelete()} />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => { setDeleteId(null); setPassword(''); }}>Cancel</Button>
            <Button variant="destructive" size="sm" disabled={!password || deleting} onClick={handleDelete}>{deleting ? 'Deleting...' : 'Delete'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTxn} onOpenChange={open => { if (!open) { setEditTxn(null); setEditPassword(''); } }}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Transaction</DialogTitle></DialogHeader>

          <div className="space-y-2">
            {editItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-secondary/50 rounded-lg p-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{item.product_name}</p>
                  <p className="text-[10px] text-muted-foreground">{peso(item.price)} each</p>
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={item.quantity}
                  onChange={e => updateEditItemQty(idx, e.target.value)}
                  className="w-14 text-center text-xs font-bold bg-background border border-border rounded-md h-7 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <p className="text-xs font-bold w-14 text-right">{peso(item.price * item.quantity)}</p>
                <button onClick={() => removeEditItem(idx)} className="text-destructive"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>

          {/* Add new item */}
          <div className="border-t border-border pt-3 mt-2">
            <p className="text-xs font-bold mb-2">Add Item</p>
            <div className="space-y-2">
              <div className="relative">
                <Input placeholder="Product name" value={newItemName} onChange={e => setNewItemName(e.target.value)} className="h-8 text-xs" list="edit-products" />
                <datalist id="edit-products">
                  {products.map(p => <option key={p.name} value={p.name} />)}
                </datalist>
              </div>
              {newItemName && products.some(p => p.name === newItemName) && !newItemPrice && (
                <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={() => selectProduct(newItemName)}>
                  Auto-fill price from inventory
                </Button>
              )}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">Price</label>
                  <Input type="number" inputMode="decimal" value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)} className="h-8 text-xs" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Cost</label>
                  <Input type="number" inputMode="decimal" value={newItemCost} onChange={e => setNewItemCost(e.target.value)} className="h-8 text-xs" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Qty</label>
                  <Input type="number" inputMode="decimal" value={newItemQty} onChange={e => setNewItemQty(e.target.value)} className="h-8 text-xs" />
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={addNewItem} disabled={!newItemName.trim()}>
                <Plus className="w-3 h-3 mr-1" /> Add Item
              </Button>
            </div>
          </div>

          <div className="border-t border-border pt-2 mt-2 space-y-1">
            <div className="flex justify-between text-sm font-bold">
              <span>New Total</span><span className="text-primary">{peso(editTotal)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>New Profit</span><span className="text-success font-semibold">{peso(editProfit)}</span>
            </div>
          </div>

          <div className="border-t border-border pt-3 mt-2">
            <p className="text-xs text-muted-foreground mb-2">Enter your password to save changes.</p>
            <Input type="password" placeholder="Password" value={editPassword} onChange={e => setEditPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveEdit()} />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => { setEditTxn(null); setEditPassword(''); }}>Cancel</Button>
            <Button size="sm" disabled={!editPassword || saving || editItems.length === 0} onClick={handleSaveEdit}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SalesPage;
