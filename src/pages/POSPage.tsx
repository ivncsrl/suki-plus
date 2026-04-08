import { useState, useMemo, useCallback, useEffect } from 'react';
import { Search, Plus, Minus, Trash2, CheckCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { peso } from '@/lib/format';
import { toast } from 'sonner';

interface Product {
  id: string;
  name: string;
  category: string;
  stock: number;
  buying_price: number;
  selling_price: number;
}

interface CartItem {
  product: Product;
  quantity: number;
}

const POSPage = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [paid, setPaid] = useState('');
  const [receipt, setReceipt] = useState<{ items: CartItem[]; total: number; paid: number; change: number } | null>(null);
  const [processing, setProcessing] = useState(false);

  const loadProducts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('products').select('*').eq('user_id', user.id).gt('stock', 0);
    setProducts((data || []).map(p => ({ ...p, buying_price: Number(p.buying_price), selling_price: Number(p.selling_price) })));
  }, [user]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const filtered = useMemo(
    () => products.filter(p => p.name.toLowerCase().includes(search.toLowerCase())),
    [products, search]
  );

  const total = useMemo(() => cart.reduce((s, c) => s + c.product.selling_price * c.quantity, 0), [cart]);

  const addToCart = useCallback((product: Product) => {
    setCart(prev => {
      const existing = prev.find(c => c.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return prev;
        return prev.map(c => c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { product, quantity: 1 }];
    });
  }, []);

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev.map(c => {
      if (c.product.id !== id) return c;
      const newQty = c.quantity + delta;
      if (newQty <= 0 || newQty > c.product.stock) return c;
      return { ...c, quantity: newQty };
    }));
  };

  const removeFromCart = (id: string) => setCart(prev => prev.filter(c => c.product.id !== id));

  const paidNum = parseFloat(paid) || 0;
  const change = paidNum - total;

  const checkout = async () => {
    if (!user || cart.length === 0 || paidNum < total) return;
    setProcessing(true);
    try {
      const profit = cart.reduce((s, c) => s + (c.product.selling_price - c.product.buying_price) * c.quantity, 0);

      const { data: txn, error: txnError } = await supabase.from('transactions').insert({
        user_id: user.id, total, profit, paid: paidNum, change,
      }).select('id').single();
      if (txnError) throw txnError;

      const items = cart.map(c => ({
        transaction_id: txn.id,
        product_name: c.product.name,
        quantity: c.quantity,
        price: c.product.selling_price,
        cost: c.product.buying_price,
      }));
      const { error: itemsError } = await supabase.from('transaction_items').insert(items);
      if (itemsError) throw itemsError;

      // Deduct stock
      for (const c of cart) {
        await supabase.from('products').update({ stock: c.product.stock - c.quantity }).eq('id', c.product.id);
      }

      setReceipt({ items: cart, total, paid: paidNum, change });
      setCart([]);
      setPaid('');
      loadProducts();
      toast.success('Sale completed!');
    } catch (err: any) {
      toast.error(err.message || 'Checkout failed');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="pb-20 max-w-3xl mx-auto px-4 pt-4 animate-fade-in">
      <h1 className="text-xl font-extrabold mb-3">🛒 Point of Sale</h1>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-11 bg-card" />
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4 max-h-44 overflow-y-auto">
        {filtered.map(p => (
          <button key={p.id} onClick={() => addToCart(p)} className="bg-card rounded-lg p-2 text-center border border-border hover:border-primary active:scale-95 transition-all">
            <p className="text-xs font-bold truncate">{p.name}</p>
            <p className="text-primary font-extrabold text-sm">{peso(p.selling_price)}</p>
            <p className="text-[10px] text-muted-foreground">Stock: {p.stock}</p>
          </button>
        ))}
        {filtered.length === 0 && <p className="col-span-3 text-center text-muted-foreground text-sm py-4">{products.length === 0 ? 'Add products in Inventory first' : 'No products found'}</p>}
      </div>

      <div className="bg-card rounded-xl border border-border p-3 mb-4">
        <h2 className="font-bold text-sm mb-2">Cart ({cart.length})</h2>
        {cart.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-3">Tap a product to add</p>
        ) : (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {cart.map(c => (
              <div key={c.product.id} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{c.product.name}</p>
                  <p className="text-xs text-muted-foreground">{peso(c.product.selling_price)} each</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => updateQty(c.product.id, -1)} className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center active:scale-90"><Minus className="w-3 h-3" /></button>
                  <span className="w-7 text-center text-sm font-bold">{c.quantity}</span>
                  <button onClick={() => updateQty(c.product.id, 1)} className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center active:scale-90"><Plus className="w-3 h-3" /></button>
                </div>
                <p className="text-sm font-bold w-16 text-right">{peso(c.product.selling_price * c.quantity)}</p>
                <button onClick={() => removeFromCart(c.product.id)} className="text-destructive active:scale-90"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="border-t border-border mt-3 pt-3 flex justify-between items-center">
          <span className="font-bold">Total</span>
          <span className="text-lg font-extrabold text-primary">{peso(total)}</span>
        </div>
      </div>

      {cart.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-3 mb-4 animate-fade-in">
          <label className="text-sm font-bold mb-1 block">Amount Paid</label>
          <Input type="number" inputMode="decimal" placeholder="0.00" value={paid} onChange={e => setPaid(e.target.value)} className="h-12 text-lg font-bold bg-background mb-2" />
          {paidNum > 0 && (
            <div className={`text-center text-lg font-extrabold ${change >= 0 ? 'text-success' : 'text-destructive'}`}>
              Change: {peso(Math.max(0, change))}
            </div>
          )}
          <Button onClick={checkout} disabled={paidNum < total || processing} className="w-full h-12 mt-2 text-base font-bold">
            <CheckCircle className="w-5 h-5 mr-1" /> {processing ? 'Processing...' : 'Complete Sale'}
          </Button>
        </div>
      )}

      {receipt && (
        <div className="fixed inset-0 z-50 bg-foreground/40 flex items-center justify-center p-4" onClick={() => setReceipt(null)}>
          <div className="bg-background rounded-2xl p-5 w-full max-w-sm animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-extrabold text-lg">✅ Sale Complete!</h3>
              <button onClick={() => setReceipt(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-1 mb-3">
              {receipt.items.map((c, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>{c.product.name} ×{c.quantity}</span>
                  <span className="font-semibold">{peso(c.product.selling_price * c.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-2 space-y-1">
              <div className="flex justify-between font-bold"><span>Total</span><span>{peso(receipt.total)}</span></div>
              <div className="flex justify-between text-sm"><span>Paid</span><span>{peso(receipt.paid)}</span></div>
              <div className="flex justify-between font-bold text-success"><span>Change</span><span>{peso(receipt.change)}</span></div>
            </div>
            <Button onClick={() => setReceipt(null)} className="w-full mt-4 h-11">Done</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default POSPage;
