import { useState, useMemo, useEffect } from 'react';
import { Calendar, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { peso } from '@/lib/format';
import { toast } from 'sonner';

interface Transaction {
  id: string;
  total: number;
  profit: number;
  created_at: string;
  items: { product_name: string; quantity: number; price: number }[];
}

const SalesPage = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: txns } = await supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (!txns) return;

      const txnIds = txns.map(t => t.id);
      const { data: items } = await supabase.from('transaction_items').select('*').in('transaction_id', txnIds);

      setTransactions(txns.map(t => ({
        id: t.id,
        total: Number(t.total),
        profit: Number(t.profit),
        created_at: t.created_at,
        items: (items || []).filter(i => i.transaction_id === t.id).map(i => ({
          product_name: i.product_name,
          quantity: i.quantity,
          price: Number(i.price),
        })),
      })));
    };
    load();
  }, [user]);

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      const d = t.created_at.slice(0, 10);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });
  }, [transactions, fromDate, toDate]);

  const totalSales = filtered.reduce((s, t) => s + t.total, 0);
  const totalProfit = filtered.reduce((s, t) => s + t.profit, 0);

  const today = new Date().toISOString().slice(0, 10);
  const todaySales = transactions.filter(t => t.created_at.slice(0, 10) === today);
  const todayTotal = todaySales.reduce((s, t) => s + t.total, 0);
  const todayProfit = todaySales.reduce((s, t) => s + t.profit, 0);

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
              <span className="text-sm font-extrabold text-primary">{peso(t.total)}</span>
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
    </div>
  );
};

export default SalesPage;
