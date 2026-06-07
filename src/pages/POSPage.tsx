import { useState, useMemo, useCallback, useEffect } from 'react';
import { Search, Plus, Minus, Trash2, CheckCircle, X, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { peso } from '@/lib/format';
import { toast } from 'sonner';

interface Product {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  stock: number;
  buying_price: number;
  selling_price: number;
  image_url: string | null;
  package_type: string | null;
  size_value: string | null;
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
  const [qtyInputs, setQtyInputs] = useState<Record<string, string>>({});

  const loadProducts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('products').select('*').eq('user_id', user.id).gt('stock', 0);
    setProducts((data || []).map(p => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      category: p.category,
      stock: Number(p.stock),
      buying_price: Number(p.buying_price),
      selling_price: Number(p.selling_price),
      image_url: p.image_url,
      package_type: p.package_type,
      size_value: p.size_value,
    })));
  }, [user]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return [];
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.brand?.toLowerCase().includes(q) ?? false) ||
      (p.category?.toLowerCase().includes(q) ?? false)
    );
  }, [products, search]);

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
    setQtyInputs(prev => { const next = { ...prev }; delete next[id]; return next; });
    setCart(prev => prev.map(c => {
      if (c.product.id !== id) return c;
      const newQty = Math.round((c.quantity + delta) * 100) / 100;
      if (newQty <= 0 || newQty > c.product.stock) return c;
      return { ...c, quantity: newQty };
    }));
  };

  const setQty = (id: string, value: string) => {
    setQtyInputs(prev => ({ ...prev, [id]: value }));
    const num = parseFloat(value);
    if (!isNaN(num) && num > 0) {
      setCart(prev => prev.map(c => {
        if (c.product.id !== id) return c;
        if (num > c.product.stock) return c;
        return { ...c, quantity: num };
      }));
    }
  };

  const getQtyDisplay = (id: string, quantity: number) =>
    qtyInputs[id] !== undefined ? qtyInputs[id] : String(quantity);

  const handleQtyBlur = (id: string) => {
    const val = parseFloat(qtyInputs[id] || '');
    setQtyInputs(prev => { const next = { ...prev }; delete next[id]; return next; });
    if (isNaN(val) || val <= 0) {
      setCart(prev => prev.map(c => c.product.id === id ? { ...c, quantity: 1 } : c));
    }
  };

  const removeFromCart = (id: string) => {
    setQtyInputs(prev => { const next = { ...prev }; delete next[id]; return next; });
    setCart(prev => prev.filter(c => c.product.id !== id));
  };

  const paidNum = parseFloat(paid) || 0;
  const change = paidNum - total;

  const checkout = async () => {
    if (!user || cart.length === 0 || paidNum < total) return;
    setProcessing(true);
    try {
      const saleItems = cart.map(c => ({ product_id: c.product.id, quantity: c.quantity }));
      const { error } = await supabase.rpc('process_pos_sale' as never, {
        p_paid: paidNum,
        p_items: saleItems,
      } as never);
      if (error) throw error;

      setReceipt({ items: cart, total, paid: paidNum, change });
      setCart([]);
      setQtyInputs({});
      setPaid('');
      await loadProducts();
      toast.success('Sale completed!');
    } catch (err: any) {
      toast.error(err.message || 'Checkout failed');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="pb-24 max-w-6xl mx-auto px-4 pt-4 animate-fade-in">
      <h1 className="text-2xl font-extrabold mb-4 tracking-tight">🛒 Point of Sale</h1>

      <div className="grid lg:grid-cols-[1fr_380px] gap-4">
        {/* LEFT: Products */}
        <div className="min-w-0">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, brand, or category..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-card"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filtered.map(p => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                className="group bg-card rounded-2xl p-3 text-left border border-border hover:border-primary hover:shadow-md active:scale-[0.98] transition-all flex flex-col"
              >
                <div className="aspect-square w-full rounded-xl bg-muted mb-3 overflow-hidden flex items-center justify-center">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <Package className="w-8 h-8 text-muted-foreground/50" />
                  )}
                </div>
                {p.brand && (
                  <p className="text-[11px] font-semibold text-foreground/70 uppercase tracking-wide truncate">
                    {p.brand}
                  </p>
                )}
                <p className="text-sm font-bold leading-tight line-clamp-2 mb-0.5">{p.name}</p>
                {(p.package_type || p.size_value) && (
                  <p className="text-xs text-muted-foreground mb-1.5">
                    {[p.package_type, p.size_value].filter(Boolean).join(' · ')}
                  </p>
                )}
                <div className="mt-auto flex items-end justify-between gap-2">
                  <span className="text-base font-extrabold text-primary">{peso(p.selling_price)}</span>
                  <span className="text-[10px] text-muted-foreground font-semibold">Stock: {p.stock}</span>
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="col-span-full text-center text-muted-foreground text-sm py-12">
                {products.length === 0
                  ? 'Add products in Inventory first'
                  : search.trim()
                    ? 'No products found'
                    : 'Start typing to search products by name, brand, or category'}
              </p>
            )}
          </div>
        </div>

        {/* RIGHT: Cart + Total (sticky on desktop) */}
        <aside className="lg:sticky lg:top-4 lg:self-start space-y-3">
          <div className="bg-card rounded-2xl border border-border p-4">
            <h2 className="font-bold text-sm mb-3">Cart ({cart.length})</h2>
            {cart.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-6">Tap a product to add</p>
            ) : (
              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {cart.map(c => (
                  <div key={c.product.id} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{c.product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {peso(c.product.selling_price)} each
                        {(c.product.package_type || c.product.size_value) && (
                          <span className="ml-1.5">· {[c.product.package_type, c.product.size_value].filter(Boolean).join(' · ')}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateQty(c.product.id, -0.25)} className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center active:scale-90"><Minus className="w-3 h-3" /></button>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={getQtyDisplay(c.product.id, c.quantity)}
                        onChange={e => setQty(c.product.id, e.target.value)}
                        onBlur={() => handleQtyBlur(c.product.id)}
                        className="w-12 text-center text-sm font-bold bg-background border border-border rounded-md h-7"
                      />
                      <button onClick={() => updateQty(c.product.id, 0.25)} className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center active:scale-90"><Plus className="w-3 h-3" /></button>
                    </div>
                    <p className="text-sm font-bold w-16 text-right">{peso(c.product.selling_price * c.quantity)}</p>
                    <button onClick={() => removeFromCart(c.product.id)} className="text-destructive active:scale-90"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-border mt-3 pt-3 flex justify-between items-center">
              <span className="font-bold">Total</span>
              <span className="text-xl font-extrabold text-primary">{peso(total)}</span>
            </div>
          </div>

          {cart.length > 0 && (
            <div className="bg-card rounded-2xl border border-border p-4 animate-fade-in">
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
        </aside>
      </div>

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
