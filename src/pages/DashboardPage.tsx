import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { peso } from '@/lib/format';
import { ShoppingCart, Package, TrendingUp, AlertTriangle, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface DashboardData {
  storeName: string;
  todaySales: number;
  todayProfit: number;
  todayTxnCount: number;
  totalProducts: number;
  lowStockProducts: { id: string; name: string; stock: number }[];
}

const DashboardPage = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData>({
    storeName: 'My Store', todaySales: 0, todayProfit: 0, todayTxnCount: 0, totalProducts: 0, lowStockProducts: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const today = new Date().toISOString().slice(0, 10);

      const [profileRes, productsRes, txnRes] = await Promise.all([
        supabase.from('profiles').select('store_name').eq('user_id', user.id).single(),
        supabase.from('products').select('id, name, stock').eq('user_id', user.id),
        supabase.from('transactions').select('total, profit').eq('user_id', user.id).gte('created_at', today + 'T00:00:00').lte('created_at', today + 'T23:59:59'),
      ]);

      const products = productsRes.data || [];
      const txns = txnRes.data || [];

      setData({
        storeName: profileRes.data?.store_name || 'My Store',
        todaySales: txns.reduce((s, t) => s + Number(t.total), 0),
        todayProfit: txns.reduce((s, t) => s + Number(t.profit), 0),
        todayTxnCount: txns.length,
        totalProducts: products.length,
        lowStockProducts: products.filter(p => p.stock <= 5).sort((a, b) => a.stock - b.stock),
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
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingCart className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground">Today's Sales</span>
          </div>
          <p className="text-2xl font-extrabold text-primary">{peso(data.todaySales)}</p>
          <p className="text-[10px] text-muted-foreground">{data.todayTxnCount} transaction{data.todayTxnCount !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-success" />
            <span className="text-xs font-semibold text-muted-foreground">Today's Profit</span>
          </div>
          <p className="text-2xl font-extrabold text-success">{peso(data.todayProfit)}</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <button onClick={() => navigate('/pos')} className="bg-primary text-primary-foreground rounded-xl p-4 text-left active:scale-95 transition-transform">
          <ShoppingCart className="w-6 h-6 mb-1" />
          <span className="font-bold text-sm block">New Sale</span>
          <span className="text-xs opacity-80">Open POS</span>
        </button>
        <button onClick={() => navigate('/inventory')} className="bg-secondary text-secondary-foreground rounded-xl p-4 text-left active:scale-95 transition-transform">
          <Package className="w-6 h-6 mb-1" />
          <span className="font-bold text-sm block">Inventory</span>
          <span className="text-xs opacity-80">{data.totalProducts} products</span>
        </button>
      </div>

      {/* Low Stock Alerts */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <h2 className="font-bold text-sm">Low Stock Alerts</h2>
          <span className="text-[10px] bg-destructive/10 text-destructive font-bold px-1.5 py-0.5 rounded-full">{data.lowStockProducts.length}</span>
        </div>
        {data.lowStockProducts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3">All stocked up! 🎉</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {data.lowStockProducts.map(p => (
              <div key={p.id} className="flex justify-between items-center text-sm">
                <span className="truncate font-medium">{p.name}</span>
                <span className={`font-bold ${p.stock === 0 ? 'text-destructive' : 'text-accent-foreground'}`}>
                  {p.stock === 0 ? 'OUT' : `${p.stock} left`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
