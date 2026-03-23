export interface Product {
  id: string;
  name: string;
  category: string;
  stock: number;
  buyingPrice: number;
  sellingPrice: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface Transaction {
  id: string;
  date: string;
  items: { name: string; quantity: number; price: number; cost: number }[];
  total: number;
  profit: number;
  paid: number;
  change: number;
}

export interface Expense {
  id: string;
  type: 'Gasoline' | 'Travel' | 'Restock Trip' | 'Other';
  description: string;
  amount: number;
  date: string;
  destination?: string;
}
