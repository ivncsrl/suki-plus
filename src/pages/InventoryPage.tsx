import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Pencil, Trash2, AlertTriangle, X, Search, Filter, Tag, CheckSquare, MoveRight, ChevronDown, Clock, PackagePlus, ImagePlus, Loader2, Globe } from 'lucide-react';
import WebImagePicker from '@/components/WebImagePicker';
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
const emptyForm = { name: '', brand: '', category: '', stock: '', buyingPrice: '', sellingPrice: '', imageUrl: '' };

interface Product {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  stock: number;
  buying_price: number;
  selling_price: number;
  image_url: string | null;
  price_updated_at: string | null;
  stock_updated_at: string | null;
  created_at: string;
}

interface HistoryEntry {
  id: string;
  product_id: string;
  change_type: 'price' | 'restock';
  old_buying_price: number | null;
  new_buying_price: number | null;
  old_selling_price: number | null;
  new_selling_price: number | null;
  old_stock: number | null;
  new_stock: number | null;
  created_at: string;
}

const formatRelative = (dateStr: string | null) => {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
};

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkMove, setShowBulkMove] = useState(false);
  const [bulkMoveTarget, setBulkMoveTarget] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyByProduct, setHistoryByProduct] = useState<Record<string, HistoryEntry[]>>({});
  const [uploadingImage, setUploadingImage] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('products').select('*').eq('user_id', user.id).order('name');
    setProducts((data || []).map(p => ({ ...p, buying_price: Number(p.buying_price), selling_price: Number(p.selling_price), stock: Number(p.stock) })) as Product[]);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Lazy-load history when expanding
  useEffect(() => {
    if (!expandedId || !user || historyByProduct[expandedId]) return;
    (async () => {
      const { data } = await supabase
        .from('product_history')
        .select('*')
        .eq('product_id', expandedId)
        .order('created_at', { ascending: false })
        .limit(20);
      setHistoryByProduct(prev => ({ ...prev, [expandedId]: (data as HistoryEntry[]) || [] }));
    })();
  }, [expandedId, user, historyByProduct]);

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
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.brand && p.brand.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
      );
    }
    return result;
  }, [products, search, categoryFilter]);

  const totalValue = products.reduce((s, p) => s + p.buying_price * p.stock, 0);
  const totalRevenue = products.reduce((s, p) => s + p.selling_price * p.stock, 0);
  const totalProfit = totalRevenue - totalValue;

  const handleImageUpload = async (file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return; }
    setUploadingImage(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from('product-images').getPublicUrl(path);
      setForm(f => ({ ...f, imageUrl: data.publicUrl }));
      toast.success('Image uploaded');
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async () => {
    if (!user || !form.name.trim()) return;
    try {
      const payload = {
        name: form.name.trim(),
        brand: form.brand.trim() || null,
        category: form.category.trim(),
        stock: parseFloat(form.stock) || 0,
        buying_price: parseFloat(form.buyingPrice) || 0,
        selling_price: parseFloat(form.sellingPrice) || 0,
        image_url: form.imageUrl || null,
      };
      if (editId) {
        const { error } = await supabase.from('products').update(payload).eq('id', editId);
        if (error) throw error;
        // Invalidate cached history so next expand re-fetches
        setHistoryByProduct(prev => { const n = { ...prev }; delete n[editId]; return n; });
        toast.success('Product updated');
      } else {
        const { error } = await supabase.from('products').insert({ user_id: user.id, ...payload });
        if (error) throw error;
        toast.success('Product added');
      }
      setForm(emptyForm); setEditId(null); setShowForm(false); load();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const startEdit = (p: Product) => {
    setForm({
      name: p.name,
      brand: p.brand || '',
      category: p.category || '',
      stock: String(p.stock),
      buyingPrice: String(p.buying_price),
      sellingPrice: String(p.selling_price),
      imageUrl: p.image_url || '',
    });
    setEditId(p.id); setShowForm(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget || !user) return;
    const product = deleteTarget;
    setDeleteTarget(null);
    await supabase.from('products').delete().eq('id', product.id);
    load();
    toast.success(`"${product.name}" deleted`, {
      action: {
        label: 'Undo',
        onClick: async () => {
          await supabase.from('products').insert({
            user_id: user.id,
            name: product.name,
            brand: product.brand,
            category: product.category || '',
            stock: product.stock,
            buying_price: product.buying_price,
            selling_price: product.selling_price,
            image_url: product.image_url,
          });
          load();
          toast.success(`"${product.name}" restored`);
        },
      },
      duration: 6000,
    });
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

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(p => p.id)));
  };

  const handleBulkMove = async () => {
    if (!user || selectedIds.size === 0) return;
    const target = bulkMoveTarget === '__uncategorized__' ? '' : bulkMoveTarget;
    const { error } = await supabase.from('products').update({ category: target }).in('id', Array.from(selectedIds)).eq('user_id', user.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Moved ${selectedIds.size} product(s)`);
    setSelectedIds(new Set());
    setShowBulkMove(false);
    setBulkMoveTarget('');
    load();
  };

  const isSelecting = selectedIds.size > 0;

  const renderHistory = (productId: string) => {
    const entries = historyByProduct[productId];
    if (!entries) return <p className="text-[11px] text-muted-foreground italic">Loading history...</p>;
    const priceChanges = entries.filter(e => e.change_type === 'price');
    const restocks = entries.filter(e => e.change_type === 'restock');
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="font-semibold text-foreground">Price Changes</p>
          </div>
          {priceChanges.length === 0 ? (
            <p className="text-muted-foreground italic pl-5">No changes yet</p>
          ) : (
            <ul className="space-y-1 pl-5 list-disc marker:text-muted-foreground">
              {priceChanges.slice(0, 5).map(e => (
                <li key={e.id}>
                  <span className="text-muted-foreground">{formatRelative(e.created_at)}: </span>
                  {e.old_selling_price !== e.new_selling_price && (
                    <span>Sell {peso(Number(e.old_selling_price))} → <span className="font-semibold">{peso(Number(e.new_selling_price))}</span></span>
                  )}
                  {e.old_selling_price !== e.new_selling_price && e.old_buying_price !== e.new_buying_price && <span>, </span>}
                  {e.old_buying_price !== e.new_buying_price && (
                    <span>Buy {peso(Number(e.old_buying_price))} → <span className="font-semibold">{peso(Number(e.new_buying_price))}</span></span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <PackagePlus className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="font-semibold text-foreground">Restocks</p>
          </div>
          {restocks.length === 0 ? (
            <p className="text-muted-foreground italic pl-5">No restocks yet</p>
          ) : (
            <ul className="space-y-1 pl-5 list-disc marker:text-muted-foreground">
              {restocks.slice(0, 5).map(e => (
                <li key={e.id}>
                  <span className="text-muted-foreground">{formatRelative(e.created_at)}: </span>
                  <span className="font-semibold">+{Number(e.new_stock) - Number(e.old_stock)}</span>
                  <span className="text-muted-foreground"> ({Number(e.old_stock)} → {Number(e.new_stock)})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="pb-20 max-w-3xl mx-auto px-4 pt-4 animate-fade-in">
      <div className="flex justify-between items-center mb-3">
        <h1 className="text-xl font-extrabold">📦 Inventory</h1>
        <div className="flex gap-2">
          {isSelecting && (
            <Button size="sm" variant="outline" onClick={() => setShowBulkMove(true)}>
              <MoveRight className="w-4 h-4 mr-1" /> Move ({selectedIds.size})
            </Button>
          )}
          {isSelecting && (
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              <X className="w-4 h-4" />
            </Button>
          )}
          {categories.length > 0 && !isSelecting && (
            <Button size="sm" variant="outline" onClick={() => setShowCategoryManager(true)}>
              <Tag className="w-4 h-4 mr-1" /> Categories
            </Button>
          )}
          {!isSelecting && (
            <Button size="sm" onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          )}
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

      {filtered.length > 0 && (
        <div className="flex items-center gap-2 mb-2">
          <button onClick={selectAll} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <CheckSquare className="w-3.5 h-3.5" />
            {selectedIds.size === filtered.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {products.length === 0 && <p className="text-center text-muted-foreground py-8">No products yet. Tap "Add" to start!</p>}
        {filtered.length === 0 && products.length > 0 && <p className="text-center text-muted-foreground py-4">No matching products</p>}
        {filtered.map(p => {
          const isExpanded = expandedId === p.id;
          return (
            <div key={p.id} className={`bg-card rounded-xl border ${p.stock <= LOW_STOCK ? 'border-destructive/50' : 'border-border'} ${selectedIds.has(p.id) ? 'ring-2 ring-primary' : ''} overflow-hidden`}>
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : p.id)}
                className="w-full p-3 text-left active:bg-muted/30 transition-colors"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      onClick={e => e.stopPropagation()}
                      className="w-4 h-4 rounded border-border accent-primary shrink-0"
                    />
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="w-10 h-10 rounded-md object-cover border border-border shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <ImagePlus className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-bold text-sm truncate">{p.name}</h3>
                        {p.stock <= LOW_STOCK && <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {p.brand && <span className="font-semibold">{p.brand}</span>}
                        {p.brand && p.category && <span> · </span>}
                        {p.category}
                      </p>
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
                <div className="grid grid-cols-4 gap-1 mt-2 text-[11px]">
                  <div><span className="text-muted-foreground">Stock:</span> <span className="font-bold">{p.stock}</span></div>
                  <div><span className="text-muted-foreground">Buy:</span> <span className="font-bold">{peso(p.buying_price)}</span></div>
                  <div><span className="text-muted-foreground">Sell:</span> <span className="font-bold">{peso(p.selling_price)}</span></div>
                  <div><span className="text-muted-foreground">Profit:</span> <span className="font-bold text-success">{peso(p.selling_price - p.buying_price)}</span></div>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-border bg-muted/20 px-3 py-2.5 space-y-3 animate-fade-in">
                  {renderHistory(p.id)}
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" className="flex-1 h-9" onClick={() => startEdit(p)}>
                      <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
                    </Button>
                    <Button size="sm" variant="destructive" className="flex-1 h-9" onClick={() => setDeleteTarget(p)}>
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[60] bg-foreground/40 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-background rounded-2xl p-5 w-full max-w-lg animate-fade-in shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-extrabold text-lg">{editId ? 'Edit Product' : 'New Product'}</h3>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              {/* Image uploader */}
              <div className="flex items-center gap-3">
                <div className="w-20 h-20 rounded-lg border border-border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  {form.imageUrl ? (
                    <img src={form.imageUrl} alt="Product" className="w-full h-full object-cover" />
                  ) : (
                    <ImagePlus className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 space-y-1.5">
                  <label className="block">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }}
                    />
                    <Button asChild size="sm" variant="outline" className="w-full" disabled={uploadingImage}>
                      <span className="cursor-pointer">
                        {uploadingImage ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <ImagePlus className="w-4 h-4 mr-1.5" />}
                        {form.imageUrl ? 'Change image' : 'Upload image'}
                      </span>
                    </Button>
                  </label>
                  {form.imageUrl && (
                    <Button size="sm" variant="ghost" className="w-full h-8 text-destructive" onClick={() => setForm({ ...form, imageUrl: '' })}>
                      Remove image
                    </Button>
                  )}
                </div>
              </div>

              <Input placeholder="Product name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-11" />
              <Input placeholder="Brand (optional)" value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} className="h-11" />
              <CategoryCombobox value={form.category} onChange={val => setForm({ ...form, category: val })} categories={categories} />
              <div className="grid grid-cols-3 gap-2">
                <Input type="number" inputMode="decimal" placeholder="Stock" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} className="h-11" />
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

      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Delete Product</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <span className="font-bold text-foreground">"{deleteTarget?.name}"</span>? You can undo this right after.
          </p>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" className="flex-1" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-1" /> Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showBulkMove} onOpenChange={setShowBulkMove}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Move {selectedIds.size} Product(s) to Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={bulkMoveTarget} onValueChange={setBulkMoveTarget}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Select target category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__uncategorized__">Uncategorized</SelectItem>
                {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={handleBulkMove} disabled={!bulkMoveTarget} className="w-full h-11 font-bold">
              <MoveRight className="w-4 h-4 mr-1" /> Move Products
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InventoryPage;
