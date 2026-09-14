import { create } from 'zustand';

export interface CartItem {
  product_id: number;
  barcode: string;
  name: string;
  unit: string;
  unit_price: number;
  cost_price: number;
  qty: number;
  discount: number;
  subtotal: number;
}

interface CartStore {
  items: CartItem[];
  discount_amount: number;
  addItem: (product: any, qty?: number) => void;
  updateQty: (product_id: number, qty: number) => void;
  removeItem: (product_id: number) => void;
  setDiscount: (amount: number) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getTotal: () => number;
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  discount_amount: 0,

  addItem: (product, qty = 1) => {
    set((state) => {
      const existing = state.items.find((i) => i.product_id === product.id);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.product_id === product.id
              ? { ...i, qty: i.qty + qty, subtotal: (i.qty + qty) * i.unit_price }
              : i
          ),
        };
      }
      const newItem: CartItem = {
        product_id: product.id,
        barcode: product.barcode,
        name: product.name,
        unit: product.unit,
        unit_price: product.sell_price,
        cost_price: product.cost_price,
        qty,
        discount: 0,
        subtotal: qty * product.sell_price,
      };
      return { items: [...state.items, newItem] };
    });
  },

  updateQty: (product_id, qty) => {
    if (qty <= 0) {
      get().removeItem(product_id);
      return;
    }
    set((state) => ({
      items: state.items.map((i) =>
        i.product_id === product_id
          ? { ...i, qty, subtotal: qty * i.unit_price }
          : i
      ),
    }));
  },

  removeItem: (product_id) => {
    set((state) => ({ items: state.items.filter((i) => i.product_id !== product_id) }));
  },

  setDiscount: (amount) => set({ discount_amount: amount }),

  clearCart: () => set({ items: [], discount_amount: 0 }),

  getSubtotal: () => get().items.reduce((s, i) => s + i.subtotal, 0),

  getTotal: () => {
    const { getSubtotal, discount_amount } = get();
    return Math.max(0, getSubtotal() - discount_amount);
  },
}));
