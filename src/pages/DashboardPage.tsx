import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { peso, getBusinessDayStart, getBusinessDate } from '@/lib/format';
import { ShoppingCart, Package, TrendingUp, LogOut, CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface DayPoint {
  date: string;       // YYYY-MM-DD
  label: string;      // Mon, Tue
  sales: number;
  profit: number;
}

interface DashboardData {
  storeName: string;
  todaySales: number;
  todayProfit: number;
  todayTxnCount: number;
  totalProducts: number;
  weekSales: number;
  weekProfit: number;
  weekTxnCount: number;
  weekData: DayPoint[];
}

const DashboardPage = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData>({
    storeName: 'My Store', todaySales: 0, todayProfit: 0, todayTxnCount: 0, totalProducts: 0,
    weekSales: 0, weekProfit: 0, weekTxnCount: 0, weekData: [],
  });
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const businessDayStart = getBusinessDayStart();

      // Week starts on Monday at 3 AM (business day start)
      const weekStartDate = new Date(businessDayStart);
      const dow = weekStartDate.getDay(); // 0=Sun..6=Sat
      const offsetToMonday = (dow + 6) % 7; // Mon=0
      weekStartDate.setDate(weekStartDate.getDate() - offsetToMonday);
      const weekStartIso = weekStartDate.toISOString();

      const [profileRes, productsRes, weekTxnRes] = await Promise.all([
        supabase.from('profiles').select('store_name').eq('user_id', user.id).single(),
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('transactions').select('total, profit, created_at').eq('user_id', user.id).gte('created_at', weekStartIso),
      ]);

      const productCount = productsRes.count || 0;
      const txns = weekTxnRes.data || [];

      // Build 7-day buckets Mon..Sun starting from weekStartDate
      const weekData: DayPoint[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStartDate);
        d.setDate(d.getDate() + i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        weekData.push({
          date: `${y}-${m}-${day}`,
          label: d.toLocaleDateString('en-PH', { weekday: 'short' }),
          sales: 0,
          profit: 0,
        });
      }
      const byDate = new Map(weekData.map(p => [p.date, p]));

      let weekSales = 0, weekProfit = 0;
      let todaySales = 0, todayProfit = 0, todayTxnCount = 0;
      const todayKey = getBusinessDate(new Date().toISOString());

      for (const t of txns) {
        const bd = getBusinessDate(t.created_at);
        const point = byDate.get(bd);
        if (point) {
          point.sales += Number(t.total);
          point.profit += Number(t.profit);
        }
        weekSales += Number(t.total);
        weekProfit += Number(t.profit);
        if (bd === todayKey) {
          todaySales += Number(t.total);
          todayProfit += Number(t.profit);
          todayTxnCount += 1;
        }
      }

      setData({
        storeName: profileRes.data?.store_name || 'My Store',
        todaySales, todayProfit, todayTxnCount,
        totalProducts: products.length,
        lowStockProducts: products.filter(p => p.stock <= 5).sort((a, b) => a.stock - b.stock),
        weekSales, weekProfit, weekTxnCount: txns.length, weekData,
      });
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) return <div className="flex items-center justify-center min-h-screen text-muted-foreground">Loading...</div>;

  return (
    <div className="pb-20 max-w-3xl mx-auto px-4 pt-4 animate-fade-in">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-extrabold">🏪 {data.storeName}</h1>
          <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={signOut} className="text-muted-foreground">
          <LogOut className="w-5 h-5" />
        </Button>
      </div>

      {/* Today's Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-card rounded-xl border border-border p-4 shadow-mui-1">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingCart className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground">Today's Sales</span>
          </div>
          <p className="text-2xl font-extrabold text-primary">{peso(data.todaySales)}</p>
          <p className="text-[10px] text-muted-foreground">{data.todayTxnCount} transaction{data.todayTxnCount !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-mui-1">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-success" />
            <span className="text-xs font-semibold text-muted-foreground">Today's Profit</span>
          </div>
          <p className="text-2xl font-extrabold text-success">{peso(data.todayProfit)}</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <button onClick={() => navigate('/pos')} className="bg-primary text-primary-foreground rounded-xl p-4 text-left active:scale-95 transition-transform shadow-mui-1 hover:shadow-mui-2">
          <ShoppingCart className="w-6 h-6 mb-1" />
          <span className="font-bold text-sm block">New Sale</span>
          <span className="text-xs opacity-80">Open POS</span>
        </button>
        <button onClick={() => navigate('/inventory')} className="bg-secondary text-secondary-foreground rounded-xl p-4 text-left active:scale-95 transition-transform shadow-mui-1 hover:shadow-mui-2">
          <Package className="w-6 h-6 mb-1" />
          <span className="font-bold text-sm block">Inventory</span>
          <span className="text-xs opacity-80">{data.totalProducts} products</span>
        </button>
      </div>

      {/* This Week dashboard */}
      <div className="bg-card rounded-xl border border-border p-4 mb-4 shadow-mui-1">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CalendarRange className="w-4 h-4 text-primary" />
            <h2 className="font-bold text-sm">This Week</h2>
          </div>
          <span className="text-[10px] text-muted-foreground">Mon – Sun</span>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="rounded-lg bg-primary/5 border border-primary/10 p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Sales</p>
            <p className="text-lg font-extrabold text-primary leading-tight">{peso(data.weekSales)}</p>
          </div>
          <div className="rounded-lg bg-success/5 border border-success/10 p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Profit</p>
            <p className="text-lg font-extrabold text-success leading-tight">{peso(data.weekProfit)}</p>
          </div>
          <div className="rounded-lg bg-secondary border border-border p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Sales</p>
            <p className="text-lg font-extrabold leading-tight">{data.weekTxnCount}</p>
            <p className="text-[10px] text-muted-foreground">transactions</p>
          </div>
        </div>

        <div className="h-44 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.weekData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
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

    </div>
  );
};

export default DashboardPage;
