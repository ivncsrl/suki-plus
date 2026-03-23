import { Product, Transaction, Expense } from './types';

const KEYS = {
  products: 'tindahan-products',
  transactions: 'tindahan-transactions',
  expenses: 'tindahan-expenses',
};

function get<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
}

function set<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

// Products
export const getProducts = (): Product[] => get(KEYS.products, []);
export const saveProducts = (p: Product[]) => set(KEYS.products, p);

export const addProduct = (p: Product) => {
  const all = getProducts();
  all.push(p);
  saveProducts(all);
};

export const updateProduct = (p: Product) => {
  const all = getProducts().map(x => x.id === p.id ? p : x);
  saveProducts(all);
};

export const deleteProduct = (id: string) => {
  saveProducts(getProducts().filter(x => x.id !== id));
};

export const deductStock = (items: { productId: string; quantity: number }[]) => {
  const all = getProducts();
  items.forEach(({ productId, quantity }) => {
    const p = all.find(x => x.id === productId);
    if (p) p.stock = Math.max(0, p.stock - quantity);
  });
  saveProducts(all);
};

// Transactions
export const getTransactions = (): Transaction[] => get(KEYS.transactions, []);
export const addTransaction = (t: Transaction) => {
  const all = getTransactions();
  all.push(t);
  set(KEYS.transactions, all);
};

// Expenses
export const getExpenses = (): Expense[] => get(KEYS.expenses, []);
export const addExpense = (e: Expense) => {
  const all = getExpenses();
  all.push(e);
  set(KEYS.expenses, all);
};

export const deleteExpense = (id: string) => {
  set(KEYS.expenses, getExpenses().filter(x => x.id !== id));
};
