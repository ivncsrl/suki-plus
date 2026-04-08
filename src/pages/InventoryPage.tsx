import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Pencil, Trash2, AlertTriangle, X, Search, Filter, Tag, CheckSquare, MoveRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { peso } from '@/lib/format';
import { toast } from 'sonner';
import CategoryCombobox from '@/components/CategoryCombobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('__all__');
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('products').select('*').eq('user_id', user.id).order('name');
    setProducts((data || []).map(p => ({ ...p, buying_price: Number(p.buying_price), selling_price: Number(p.selling_price) })));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const categories = useMemo(() => {
    const cats = products.map(p => p.category).filter((c): c is string => !!c && c.trim() !== '');
    return [...new Set(cats)].sort();
  }, [products]);

  const filtered = useMemo(() => {
    let result = products;
    if (categoryFilter === '__uncategorized__') {
      result = result.filter(p => !p.category || p.category.trim() === '');
    } else if (categoryFilter !== '__all__') {
      result = result.filter(p => p.category === categoryFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(q) || (p.category && p.category.toLowerCase().includes(q)));
    }
    return result;
  }, [products, search, categoryFilter]);

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

  const handleRenameCategory = async () => {
    if (!user || !editingCategory || !newCategoryName.trim()) return;
    const trimmed = newCategoryName.trim();
    if (trimmed === editingCategory) { setEditingCategory(null); return; }
    const { error } = await supabase.from('products').update({ category: trimmed }).eq('user_id', user.id).eq('category', editingCategory);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Renamed "${editingCategory}" → "${trimmed}"`);
      if (categoryFilter === editingCategory) setCategoryFilter(trimmed);
      setEditingCategory(null);
      setNewCategoryName('');
      load();
    }
  };

  return (
    <div className="pb-20 max-w-3xl mx-auto px-4 pt-4 animate-fade-in">
      <div className="flex justify-between items-center mb-3">
        <h1 className="text-xl font-extrabold">📦 Inventory</h1>
        <div className="flex gap-2">
          {categories.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setShowCategoryManager(true)}>
              <Tag className="w-4 h-4 mr-1" /> Categories
            </Button>
          )}
          <Button size="sm" onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-10" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[140px] h-10">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All</SelectItem>
            <SelectItem value="__uncategorized__">Uncategorized</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
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
        {filtered.length === 0 && products.length > 0 && <p className="text-center text-muted-foreground py-4">No matching products</p>}
        {filtered.map(p => (
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
        <div className="fixed inset-0 z-[60] bg-foreground/40 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-background rounded-2xl p-5 w-full max-w-lg animate-fade-in shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-extrabold text-lg">{editId ? 'Edit Product' : 'New Product'}</h3>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <Input placeholder="Product name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-11" />
              <CategoryCombobox value={form.category} onChange={val => setForm({ ...form, category: val })} categories={categories} />
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

      <Dialog open={showCategoryManager} onOpenChange={setShowCategoryManager}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Manage Categories</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {categories.map(cat => (
              <div key={cat} className="flex items-center gap-2">
                {editingCategory === cat ? (
                  <>
                    <Input
                      value={newCategoryName}
                      onChange={e => setNewCategoryName(e.target.value)}
                      className="h-9 flex-1"
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && handleRenameCategory()}
                    />
                    <Button size="sm" onClick={handleRenameCategory} className="h-9">Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingCategory(null)} className="h-9 px-2">
                      <X className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium">{cat}</span>
                    <span className="text-xs text-muted-foreground">{products.filter(p => p.category === cat).length} items</span>
                    <Button size="sm" variant="ghost" onClick={() => { setEditingCategory(cat); setNewCategoryName(cat); }} className="h-8 px-2">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
            {categories.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No categories yet</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InventoryPage;
