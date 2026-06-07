import { useState, useMemo, useEffect, useCallback } from 'react';
import { Calendar, Trash2, Pencil, Plus, Minus, X, Search, TrendingUp, Package } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { peso, getBusinessDate, getTodayBusinessDate } from '@/lib/format';
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

/** Get date string in local timezone (YYYY-MM-DD) */
const getLocalDateStr = (date: Date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Convert a UTC timestamp to its business date (3 AM boundary) */
const toBusinessDate = (utc: string) => getBusinessDate(utc);

const SalesPage = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [itemsByTxn, setItemsByTxn] = useState<Record<string, TransactionItem[]>>({});
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [chartRange, setChartRange] = useState<7 | 15 | 30>(7);

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
  const [products, setProducts] = useState<{ name: string; selling_price: number; buying_price: number; image_url: string | null; brand: string | null; category: string | null }[]>([]);

  // Add manual sale state
  const [addOpen, setAddOpen] = useState(false);
  const [addDate, setAddDate] = useState(getLocalDateStr());
  const [addItems, setAddItems] = useState<TransactionItem[]>([]);
  const [addSearch, setAddSearch] = useState('');
  const [addManualMode, setAddManualMode] = useState(false);
  const [addNewName, setAddNewName] = useState('');
  const [addNewPrice, setAddNewPrice] = useState('');
  const [addNewCost, setAddNewCost] = useState('');
  const [addNewQty, setAddNewQty] = useState('1');
  const [adding, setAdding] = useState(false);
  const [addQtyInputs, setAddQtyInputs] = useState<Record<number, string>>({});

  const loadTransactions = useCallback(async () => {
    if (!user) return;
    // Fetch lightweight summary rows in batches to bypass PostgREST's
    // 1000-row default cap, so totals/chart include the very first transaction.
    // Items are NOT fetched here — they're lazy-loaded for visible rows only,
    // keeping memory/bandwidth low even with thousands of transactions.
    const PAGE = 1000;
    const all: Transaction[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, total, profit, paid, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error || !data) break;
      for (const t of data) {
        all.push({
          id: t.id,
          total: Number(t.total),
          profit: Number(t.profit),
          paid: Number(t.paid),
          change: Number(t.paid) - Number(t.total),
          created_at: t.created_at,
          items: [],
        });
      }
      if (data.length < PAGE) break;
    }
    setTransactions(all);
    setItemsByTxn({});
  }, [user]);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  useEffect(() => {
    if (!user) return;
    supabase.from('products').select('name, selling_price, buying_price, image_url, brand, category').eq('user_id', user.id)
      .then(({ data }) => setProducts((data || []).map(p => ({ name: p.name, selling_price: Number(p.selling_price), buying_price: Number(p.buying_price), image_url: p.image_url, brand: p.brand, category: p.category }))));
  }, [user]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return transactions.filter(t => {
      const d = toBusinessDate(t.created_at);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      // Product-name search requires items; only filter when items are loaded.
      if (q) {
        const items = itemsByTxn[t.id];
        if (!items || !items.some(i => i.product_name.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [transactions, fromDate, toDate, searchQuery, itemsByTxn]);

  const SALES_PAGE_SIZE = 20;
  const [salesVisible, setSalesVisible] = useState(SALES_PAGE_SIZE);
  useEffect(() => { setSalesVisible(SALES_PAGE_SIZE); }, [fromDate, toDate, searchQuery]);

  // When searching, load items for ALL transactions in the active date range
  // so the search can match against product names.
  useEffect(() => {
    if (!user || !searchQuery.trim()) return;
    const needIds = transactions
      .filter(t => {
        const d = toBusinessDate(t.created_at);
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
        return !itemsByTxn[t.id];
      })
      .map(t => t.id);
    if (needIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const CHUNK = 200;
      const next: Record<string, TransactionItem[]> = {};
      for (let i = 0; i < needIds.length; i += CHUNK) {
        const slice = needIds.slice(i, i + CHUNK);
        const { data } = await supabase
          .from('transaction_items')
          .select('id, transaction_id, product_name, quantity, price, cost')
          .in('transaction_id', slice);
        if (cancelled) return;
        for (const r of (data || [])) {
          const tid = (r as any).transaction_id as string;
          (next[tid] ||= []).push({
            id: r.id,
            product_name: r.product_name,
            quantity: Number(r.quantity),
            price: Number(r.price),
            cost: Number(r.cost),
          });
        }
      }
      if (!cancelled) setItemsByTxn(prev => ({ ...prev, ...next }));
    })();
    return () => { cancelled = true; };
  }, [searchQuery, transactions, fromDate, toDate, user, itemsByTxn]);

  // Lazy-load items for currently visible transactions
  useEffect(() => {
    if (!user) return;
    const visible = filtered.slice(0, salesVisible);
    const needIds = visible.filter(t => !itemsByTxn[t.id]).map(t => t.id);
    if (needIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('transaction_items')
        .select('id, transaction_id, product_name, quantity, price, cost')
        .in('transaction_id', needIds);
      if (cancelled || !data) return;
      const next: Record<string, TransactionItem[]> = {};
      for (const r of data) {
        const tid = (r as any).transaction_id as string;
        (next[tid] ||= []).push({
          id: r.id,
          product_name: r.product_name,
          quantity: Number(r.quantity),
          price: Number(r.price),
          cost: Number(r.cost),
        });
      }
      setItemsByTxn(prev => ({ ...prev, ...next }));
    })();
    return () => { cancelled = true; };
  }, [filtered, salesVisible, user, itemsByTxn]);

  const totalSales = filtered.reduce((s, t) => s + t.total, 0);
  const totalProfit = filtered.reduce((s, t) => s + t.profit, 0);

  const today = getTodayBusinessDate();
  const todaySales = transactions.filter(t => toBusinessDate(t.created_at) === today);
  const todayTotal = todaySales.reduce((s, t) => s + t.total, 0);
  const todayProfit = todaySales.reduce((s, t) => s + t.profit, 0);

  // Chart data: derived from From/To dates if set, else from chartRange buttons
  const usingDateRange = !!(fromDate || toDate);
  const { chartStart, chartEnd, chartDays } = useMemo(() => {
    if (usingDateRange) {
      const end = toDate || fromDate || today;
      const start = fromDate || toDate || today;
      const sd = new Date(start + 'T12:00:00');
      const ed = new Date(end + 'T12:00:00');
      const days = Math.max(1, Math.round((ed.getTime() - sd.getTime()) / 86400000) + 1);
      return { chartStart: sd, chartEnd: ed, chartDays: days };
    }
    const ed = new Date(today + 'T12:00:00');
    const sd = new Date(ed);
    sd.setDate(sd.getDate() - (chartRange - 1));
    return { chartStart: sd, chartEnd: ed, chartDays: chartRange };
  }, [usingDateRange, fromDate, toDate, chartRange, today]);

  const chartData = useMemo(() => {
    const buckets: { date: string; label: string; sales: number; profit: number }[] = [];
    const useShortDay = chartDays <= 7;
    for (let i = 0; i < chartDays; i++) {
      const d = new Date(chartStart);
      d.setDate(d.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${y}-${m}-${day}`;
      buckets.push({
        date: key,
        label: useShortDay
          ? d.toLocaleDateString('en-PH', { weekday: 'short' })
          : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
        sales: 0,
        profit: 0,
      });
    }
    const map = new Map(buckets.map(b => [b.date, b]));
    for (const t of transactions) {
      const bd = toBusinessDate(t.created_at);
      const b = map.get(bd);
      if (b) { b.sales += t.total; b.profit += t.profit; }
    }
    return buckets;
  }, [transactions, chartStart, chartDays]);

  const chartTotals = useMemo(() => ({
    sales: chartData.reduce((s, d) => s + d.sales, 0),
    profit: chartData.reduce((s, d) => s + d.profit, 0),
  }), [chartData]);

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

  // ---- Add Manual Sale ----
  const resetAdd = () => {
    setAddItems([]); setAddNewName(''); setAddNewPrice(''); setAddNewCost(''); setAddNewQty('1');
    setAddDate(getLocalDateStr());
    setAddSearch(''); setAddManualMode(false); setAddQtyInputs({});
  };

  const addProductToCart = (p: { name: string; selling_price: number; buying_price: number }) => {
    setAddItems(prev => {
      const existing = prev.findIndex(i => i.product_name === p.name && i.price === p.selling_price && i.cost === p.buying_price);
      if (existing >= 0) {
        return prev.map((it, i) => i === existing ? { ...it, quantity: Math.round((it.quantity + 1) * 100) / 100 } : it);
      }
      return [...prev, { product_name: p.name, price: p.selling_price, cost: p.buying_price, quantity: 1 }];
    });
  };

  const updateAddItemQty = (idx: number, delta: number) => {
    setAddQtyInputs(prev => { const n = { ...prev }; delete n[idx]; return n; });
    setAddItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const q = Math.round((it.quantity + delta) * 100) / 100;
      return q <= 0 ? it : { ...it, quantity: q };
    }));
  };

  const setAddItemQty = (idx: number, val: string) => {
    setAddQtyInputs(prev => ({ ...prev, [idx]: val }));
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      setAddItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: num } : it));
    }
  };

  const handleAddQtyBlur = (idx: number) => {
    const val = parseFloat(addQtyInputs[idx] || '');
    setAddQtyInputs(prev => { const n = { ...prev }; delete n[idx]; return n; });
    if (isNaN(val) || val <= 0) {
      setAddItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: 1 } : it));
    }
  };

  const addManualItem = () => {
    if (!addNewName.trim()) return;
    const price = parseFloat(addNewPrice) || 0;
    const cost = parseFloat(addNewCost) || 0;
    const qty = parseFloat(addNewQty) || 1;
    setAddItems(prev => [...prev, { product_name: addNewName.trim(), price, cost, quantity: qty }]);
    setAddNewName(''); setAddNewPrice(''); setAddNewCost(''); setAddNewQty('1');
  };

  const addProductsFiltered = useMemo(() => {
    const q = addSearch.toLowerCase().trim();
    if (!q) return [] as typeof products;
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.brand?.toLowerCase().includes(q) ?? false) ||
      (p.category?.toLowerCase().includes(q) ?? false)
    ).slice(0, 24);
  }, [products, addSearch]);

  const addTotal = addItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const addProfit = addItems.reduce((s, i) => s + (i.price - i.cost) * i.quantity, 0);

  const handleAddManualSale = async () => {
    if (!user || addItems.length === 0) return;
    setAdding(true);
    try {
      // Use noon local time on the selected date to avoid timezone/business-day edge cases
      const createdAt = new Date(addDate + 'T12:00:00').toISOString();
      const { data: txn, error: txnErr } = await supabase
        .from('transactions')
        .insert({ user_id: user.id, total: addTotal, profit: addProfit, paid: addTotal, created_at: createdAt })
        .select('id')
        .single();
      if (txnErr || !txn) throw txnErr;
      const items = addItems.map(i => ({
        transaction_id: txn.id,
        product_name: i.product_name,
        quantity: i.quantity,
        price: i.price,
        cost: i.cost,
      }));
      const { error: itErr } = await supabase.from('transaction_items').insert(items);
      if (itErr) throw itErr;
      toast.success('Manual sale added');
      setAddOpen(false);
      resetAdd();
      loadTransactions();
    } catch {
      toast.error('Failed to add sale');
    }
    setAdding(false);
  };

  return (
    <div className="pb-20 max-w-3xl mx-auto px-4 pt-4 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-extrabold">📊 Sales Summary</h1>
        <Button size="sm" className="h-8 text-xs" onClick={() => { resetAdd(); setAddOpen(true); }}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Sale
        </Button>
      </div>

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

      {/* Sales Trend Chart */}
      <div className="bg-card rounded-xl border border-border p-4 mb-4 shadow-mui-1">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h2 className="font-bold text-sm">Sales Trend</h2>
          </div>
          <div className="flex gap-1 items-center">
            {usingDateRange ? (
              <span className="text-[10px] text-muted-foreground font-semibold px-1">
                {chartDays} day{chartDays > 1 ? 's' : ''} (date range)
              </span>
            ) : (
              ([7, 15, 30] as const).map(r => (
                <Button
                  key={r}
                  variant={chartRange === r ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setChartRange(r)}
                >
                  {r}d
                </Button>
              ))
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="rounded-lg bg-primary/5 border border-primary/10 p-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">Sales</p>
            <p className="text-base font-extrabold text-primary leading-tight">{peso(chartTotals.sales)}</p>
          </div>
          <div className="rounded-lg bg-success/5 border border-success/10 p-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">Profit</p>
            <p className="text-base font-extrabold text-success leading-tight">{peso(chartTotals.profit)}</p>
          </div>
        </div>

        <div className="h-44 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                interval={chartDays > 20 ? Math.floor(chartDays / 8) : chartDays > 10 ? 1 : 0}
              />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => v >= 1000 ? `${Math.round(v/1000)}k` : `${v}`} />
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, name: string) => [peso(v), name === 'sales' ? 'Sales' : 'Profit']}
                labelFormatter={(l, payload) => payload?.[0]?.payload?.date || l}
              />
              <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="profit" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
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
        {filtered.slice(0, salesVisible).map(t => (
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
        {filtered.length > salesVisible && (
          <div className="pt-2 flex flex-col items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setSalesVisible(c => c + SALES_PAGE_SIZE)}>
              Load more ({filtered.length - salesVisible} remaining)
            </Button>
            <p className="text-[10px] text-muted-foreground">Showing {Math.min(salesVisible, filtered.length)} of {filtered.length}</p>
          </div>
        )}
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

      {/* Add Manual Sale Dialog — POS-style */}
      <Dialog open={addOpen} onOpenChange={open => { if (!open) { setAddOpen(false); resetAdd(); } }}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader><DialogTitle>Add Manual Sale</DialogTitle></DialogHeader>

          <div className="grid sm:grid-cols-[1fr_300px] gap-4">
            {/* LEFT: Search + product grid */}
            <div className="min-w-0">
              <div>
                <label className="text-[10px] text-muted-foreground font-semibold">Sale Date</label>
                <Input type="date" value={addDate} onChange={e => setAddDate(e.target.value)} className="h-9 text-sm mb-3" />
              </div>

              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search products to add..."
                  value={addSearch}
                  onChange={e => setAddSearch(e.target.value)}
                  className="pl-9 h-9 text-sm bg-card"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[40vh] overflow-y-auto pr-1">
                {addProductsFiltered.map(p => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => addProductToCart(p)}
                    className="group bg-card rounded-xl p-2 text-left border border-border hover:border-primary hover:shadow-md active:scale-[0.98] transition-all flex flex-col"
                  >
                    <div className="aspect-square w-full rounded-lg bg-muted mb-2 overflow-hidden flex items-center justify-center">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <Package className="w-6 h-6 text-muted-foreground/50" />
                      )}
                    </div>
                    {p.brand && (
                      <p className="text-[10px] font-semibold text-foreground/70 uppercase tracking-wide truncate">{p.brand}</p>
                    )}
                    <p className="text-xs font-bold leading-tight line-clamp-2 mb-1">{p.name}</p>
                    <span className="mt-auto text-sm font-extrabold text-primary">{peso(p.selling_price)}</span>
                  </button>
                ))}
                {addProductsFiltered.length === 0 && (
                  <p className="col-span-full text-center text-muted-foreground text-xs py-6">
                    {addSearch.trim() ? 'No products found' : 'Start typing to search products'}
                  </p>
                )}
              </div>

              {/* Manual item toggle */}
              <div className="mt-3 border-t border-border pt-3">
                <Button type="button" variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => setAddManualMode(m => !m)}>
                  {addManualMode ? '− Hide manual item' : '+ Add item not in inventory'}
                </Button>
                {addManualMode && (
                  <div className="space-y-2 mt-2">
                    <Input placeholder="Product name" value={addNewName} onChange={e => setAddNewName(e.target.value)} className="h-8 text-xs" />
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground">Price</label>
                        <Input type="number" inputMode="decimal" value={addNewPrice} onChange={e => setAddNewPrice(e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Cost</label>
                        <Input type="number" inputMode="decimal" value={addNewCost} onChange={e => setAddNewCost(e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Qty</label>
                        <Input type="number" inputMode="decimal" value={addNewQty} onChange={e => setAddNewQty(e.target.value)} className="h-8 text-xs" />
                      </div>
                    </div>
                    <Button type="button" variant="outline" size="sm" className="w-full text-xs" onClick={addManualItem} disabled={!addNewName.trim()}>
                      <Plus className="w-3 h-3 mr-1" /> Add Item
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: Cart */}
            <aside className="space-y-3">
              <div className="bg-card rounded-2xl border border-border p-3">
                <h2 className="font-bold text-sm mb-2">Cart ({addItems.length})</h2>
                {addItems.length === 0 ? (
                  <p className="text-muted-foreground text-xs text-center py-6">Tap a product to add</p>
                ) : (
                  <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                    {addItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{item.product_name}</p>
                          <p className="text-[10px] text-muted-foreground">{peso(item.price)} each</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => updateAddItemQty(idx, -0.25)} className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center active:scale-90"><Minus className="w-3 h-3" /></button>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={addQtyInputs[idx] !== undefined ? addQtyInputs[idx] : String(item.quantity)}
                            onChange={e => setAddItemQty(idx, e.target.value)}
                            onBlur={() => handleAddQtyBlur(idx)}
                            className="w-10 text-center text-xs font-bold bg-background border border-border rounded-md h-6"
                          />
                          <button type="button" onClick={() => updateAddItemQty(idx, 0.25)} className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center active:scale-90"><Plus className="w-3 h-3" /></button>
                        </div>
                        <p className="text-xs font-bold w-14 text-right">{peso(item.price * item.quantity)}</p>
                        <button type="button" onClick={() => setAddItems(prev => prev.filter((_, i) => i !== idx))} className="text-destructive active:scale-90"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="border-t border-border mt-3 pt-2 space-y-1">
                  <div className="flex justify-between text-sm font-bold">
                    <span>Total</span><span className="text-primary">{peso(addTotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Profit</span><span className="text-success font-semibold">{peso(addProfit)}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => { setAddOpen(false); resetAdd(); }}>Cancel</Button>
                <Button size="sm" disabled={adding || addItems.length === 0 || !addDate} onClick={handleAddManualSale}>
                  {adding ? 'Saving...' : 'Save Sale'}
                </Button>
              </div>
            </aside>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SalesPage;
