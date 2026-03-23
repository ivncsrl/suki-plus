import { useState, useMemo } from 'react';
import { Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { getTransactions } from '@/lib/store';
import { peso } from '@/lib/format';
import { Transaction } from '@/lib/types';

const SalesPage = () => {
  const [transactions] = useState<Transaction[]>(() => getTransactions().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      const d = t.date.slice(0, 10);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });
  }, [transactions, fromDate, toDate]);

  const totalSales = filtered.reduce((s, t) => s + t.total, 0);
  const totalProfit = filtered.reduce((s, t) => s + t.profit, 0);

  const today = new Date().toISOString().slice(0, 10);
  const todaySales = transactions.filter(t => t.date.slice(0, 10) === today);
  const todayTotal = todaySales.reduce((s, t) => s + t.total, 0);
  const todayProfit = todaySales.reduce((s, t) => s + t.profit, 0);

  return (
    <div className="pb-20 max-w-lg mx-auto px-4 pt-4 animate-fade-in">
      <h1 className="text-xl font-extrabold mb-3">📊 Sales Summary</h1>

      {/* Today's Summary */}
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

      {/* Filters */}
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

      {/* Filtered Summary */}
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

      {/* Transaction Log */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-8">No transactions yet</p>
        )}
        {filtered.map(t => (
          <div key={t.id} className="bg-card rounded-xl border border-border p-3">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(t.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="text-sm font-extrabold text-primary">{peso(t.total)}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {t.items.map((item, i) => (
                <span key={i}>{item.name} ×{item.quantity}{i < t.items.length - 1 ? ', ' : ''}</span>
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
