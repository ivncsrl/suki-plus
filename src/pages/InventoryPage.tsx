import { useState } from 'react';
import { Plus, Pencil, Trash2, AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Product } from '@/lib/types';
import { getProducts, addProduct, updateProduct, deleteProduct, saveProducts } from '@/lib/store';
import { peso, genId } from '@/lib/format';

const LOW_STOCK = 5;

const emptyForm = { name: '', category: '', stock: '', buyingPrice: '', sellingPrice: '' };

const InventoryPage = () => {
  const [products, setProducts] = useState<Product[]>(() => getProducts());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);

  const refresh = () => setProducts(getProducts());

  const totalValue = products.reduce((s, p) => s + p.buyingPrice * p.stock, 0);
  const totalRevenue = products.reduce((s, p) => s + p.sellingPrice * p.stock, 0);
  const totalProfit = totalRevenue - totalValue;

  const handleSubmit = () => {
    const p: Product = {
      id: editId || genId(),
      name: form.name.trim(),
      category: form.category.trim(),
      stock: parseInt(form.stock) || 0,
      buyingPrice: parseFloat(form.buyingPrice) || 0,
      sellingPrice: parseFloat(form.sellingPrice) || 0,
    };
    if (!p.name) return;
    if (editId) {
      updateProduct(p);
    } else {
      addProduct(p);
    }
    setForm(emptyForm);
    setEditId(null);
    setShowForm(false);
    refresh();
  };

  const startEdit = (p: Product) => {
    setForm({
      name: p.name,
      category: p.category,
      stock: String(p.stock),
      buyingPrice: String(p.buyingPrice),
      sellingPrice: String(p.sellingPrice),
    });
    setEditId(p.id);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    deleteProduct(id);
    refresh();
  };

  return (
    <div className="pb-20 max-w-lg mx-auto px-4 pt-4 animate-fade-in">
      <div className="flex justify-between items-center mb-3">
        <h1 className="text-xl font-extrabold">📦 Inventory</h1>
        <Button size="sm" onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Add
        </Button>
      </div>

      {/* Summary Cards */}
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

      {/* Product List */}
      <div className="space-y-2">
        {products.length === 0 && (
          <p className="text-center text-muted-foreground py-8">No products yet. Tap "Add" to start!</p>
        )}
        {products.map(p => (
          <div
            key={p.id}
            className={`bg-card rounded-xl border p-3 ${p.stock <= LOW_STOCK ? 'border-destructive/50' : 'border-border'}`}
          >
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-sm truncate">{p.name}</h3>
                  {p.stock <= LOW_STOCK && <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />}
                </div>
                {p.category && <p className="text-[10px] text-muted-foreground">{p.category}</p>}
              </div>
              <div className="flex gap-1 ml-2">
                <button onClick={() => startEdit(p)} className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center active:scale-90">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(p.id)} className="w-7 h-7 rounded-md bg-destructive/10 flex items-center justify-center active:scale-90 text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1 mt-2 text-[11px]">
              <div><span className="text-muted-foreground">Stock:</span> <span className="font-bold">{p.stock}</span></div>
              <div><span className="text-muted-foreground">Buy:</span> <span className="font-bold">{peso(p.buyingPrice)}</span></div>
              <div><span className="text-muted-foreground">Sell:</span> <span className="font-bold">{peso(p.sellingPrice)}</span></div>
              <div><span className="text-muted-foreground">Profit:</span> <span className="font-bold text-success">{peso(p.sellingPrice - p.buyingPrice)}</span></div>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit Form Modal */}
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
              <Button onClick={handleSubmit} className="w-full h-11 font-bold">
                {editId ? 'Update Product' : 'Add Product'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryPage;
