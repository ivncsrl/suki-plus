import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Pencil, Trash2, AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { peso } from '@/lib/format';
import { toast } from 'sonner';
import CategoryCombobox from '@/components/CategoryCombobox';

const LOW_STOCK = 5;
const emptyForm = { name: '', category: '', stock: '', buyingPrice: '', sellingPrice: '' };

interface Product {
  id: string;
  name: string;
  category: string | null;
  stock: number;
  buying_price: number;
  selling_price: number;
}

const InventoryPage = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('products').select('*').eq('user_id', user.id).order('name');
    setProducts((data || []).map(p => ({ ...p, buying_price: Number(p.buying_price), selling_price: Number(p.selling_price) })));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const totalValue = products.reduce((s, p) => s + p.buying_price * p.stock, 0);
  const totalRevenue = products.reduce((s, p) => s + p.selling_price * p.stock, 0);
  const totalProfit = totalRevenue - totalValue;

  const handleSubmit = async () => {
    if (!user || !form.name.trim()) return;
    try {
      if (editId) {
        const { error } = await supabase.from('products').update({
          name: form.name.trim(), category: form.category.trim(),
          stock: parseInt(form.stock) || 0,
          buying_price: parseFloat(form.buyingPrice) || 0,
          selling_price: parseFloat(form.sellingPrice) || 0,
        }).eq('id', editId);
        if (error) throw error;
        toast.success('Product updated');
      } else {
        const { error } = await supabase.from('products').insert({
          user_id: user.id, name: form.name.trim(), category: form.category.trim(),
          stock: parseInt(form.stock) || 0,
          buying_price: parseFloat(form.buyingPrice) || 0,
          selling_price: parseFloat(form.sellingPrice) || 0,
        });
        if (error) throw error;
        toast.success('Product added');
      }
      setForm(emptyForm); setEditId(null); setShowForm(false); load();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const startEdit = (p: Product) => {
    setForm({ name: p.name, category: p.category || '', stock: String(p.stock), buyingPrice: String(p.buying_price), sellingPrice: String(p.selling_price) });
    setEditId(p.id); setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('products').delete().eq('id', id);
    load();
  };

  return (
    <div className="pb-20 max-w-lg mx-auto px-4 pt-4 animate-fade-in">
      <div className="flex justify-between items-center mb-3">
        <h1 className="text-xl font-extrabold">📦 Inventory</h1>
        <Button size="sm" onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Add
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-card rounded-lg p-2 border border-border text-center">
          <p className="text-[10px] text-muted-foreground font-semibold">Cost Value</p>
          <p className="text-sm font-extrabold">{peso(totalValue)}</p>
        </div>
        <div className="bg-card rounded-lg p-2 border border-border text-center">
          <p className="text-[10px] text-muted-foreground font-semibold">Potential Rev.</p>
          <p className="text-sm font-extrabold text-primary">{peso(totalRevenue)}</p>
        </div>
        <div className="bg-card rounded-lg p-2 border border-border text-center">
          <p className="text-[10px] text-muted-foreground font-semibold">Potential Profit</p>
          <p className="text-sm font-extrabold text-success">{peso(totalProfit)}</p>
        </div>
      </div>

      <div className="space-y-2">
        {products.length === 0 && <p className="text-center text-muted-foreground py-8">No products yet. Tap "Add" to start!</p>}
        {products.map(p => (
          <div key={p.id} className={`bg-card rounded-xl border p-3 ${p.stock <= LOW_STOCK ? 'border-destructive/50' : 'border-border'}`}>
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-sm truncate">{p.name}</h3>
                  {p.stock <= LOW_STOCK && <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />}
                </div>
                {p.category && <p className="text-[10px] text-muted-foreground">{p.category}</p>}
              </div>
              <div className="flex gap-1 ml-2">
                <button onClick={() => startEdit(p)} className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center active:scale-90"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => handleDelete(p.id)} className="w-7 h-7 rounded-md bg-destructive/10 flex items-center justify-center active:scale-90 text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1 mt-2 text-[11px]">
              <div><span className="text-muted-foreground">Stock:</span> <span className="font-bold">{p.stock}</span></div>
              <div><span className="text-muted-foreground">Buy:</span> <span className="font-bold">{peso(p.buying_price)}</span></div>
              <div><span className="text-muted-foreground">Sell:</span> <span className="font-bold">{peso(p.selling_price)}</span></div>
              <div><span className="text-muted-foreground">Profit:</span> <span className="font-bold text-success">{peso(p.selling_price - p.buying_price)}</span></div>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-foreground/40 flex items-end justify-center" onClick={() => setShowForm(false)}>
          <div className="bg-background rounded-t-2xl p-5 w-full max-w-lg animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-extrabold text-lg">{editId ? 'Edit Product' : 'New Product'}</h3>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <Input placeholder="Product name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-11" />
              <Input placeholder="Category (optional)" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="h-11" />
              <div className="grid grid-cols-3 gap-2">
                <Input type="number" inputMode="numeric" placeholder="Stock" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} className="h-11" />
                <Input type="number" inputMode="decimal" placeholder="Buy price" value={form.buyingPrice} onChange={e => setForm({ ...form, buyingPrice: e.target.value })} className="h-11" />
                <Input type="number" inputMode="decimal" placeholder="Sell price" value={form.sellingPrice} onChange={e => setForm({ ...form, sellingPrice: e.target.value })} className="h-11" />
              </div>
              <Button onClick={handleSubmit} className="w-full h-11 font-bold">{editId ? 'Update Product' : 'Add Product'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryPage;
