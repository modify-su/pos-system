import { useState, useRef, useEffect, useMemo } from 'react';
import { useCartStore } from '../stores/cartStore';
import { useAuthStore } from '../stores/authStore';
import api from '../api/client';
import BarcodeScanner from '../components/BarcodeScanner';
import { useRealtimeEvent, getSocket } from '../utils/socket';
import {
  Scan, Search, ShoppingCart, Trash2, Plus, Minus,
  CreditCard, Banknote, Smartphone, Printer, Check, X, Receipt,
  Package, Filter, RefreshCw, Zap, ArrowRight
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print';

const fmt = (n: number) => n?.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Product {
  id: number;
  barcode: string;
  name: string;
  category_id: number;
  category_name?: string;
  unit: string;
  cost_price: number;
  sell_price: number;
  stock_qty: number;
  min_stock: number;
  image_url?: string;
  active: number;
}

interface Category {
  id: number;
  name: string;
  description?: string;
  product_count?: number;
}

export default function POSSale() {
  const { items, discount_amount, addItem, updateQty, removeItem, setDiscount, clearCart, getSubtotal, getTotal } = useCartStore();
  const { user } = useAuthStore();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [showScanner, setShowScanner] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'credit'>('cash');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [showCheckout, setShowCheckout] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [lastSale, setLastSale] = useState<any>(null);
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const receiptRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const handlePrint = useReactToPrint({ contentRef: receiptRef });

  // Load catalog & categories
  const loadCatalog = async () => {
    try {
      setLoading(true);
      const [prodRes, catRes] = await Promise.all([
        api.get('/products', { params: { limit: 100 } }),
        api.get('/categories'),
      ]);
      setProducts(prodRes.data);
      setCategories(catRes.data);
    } catch (err: any) {
      setError('ไม่สามารถโหลดข้อมูลสินค้าได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  // Listen to real-time inventory updates
  useRealtimeEvent('inventory:updated', (data) => {
    if (data.items && Array.isArray(data.items)) {
      setProducts((prev) =>
        prev.map((p) => {
          const matched = data.items.find((it: any) => it.product_id === p.id);
          if (matched && typeof matched.new_stock === 'number') {
            return { ...p, stock_qty: matched.new_stock };
          }
          return p;
        })
      );
    } else {
      // Re-fetch in background
      api.get('/products', { params: { limit: 100 } }).then((res) => {
        setProducts(res.data);
      }).catch(() => {});
    }
  });

  // Filtered products based on category and search
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = selectedCategory === null || p.category_id === selectedCategory;
      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.category_name && p.category_name.toLowerCase().includes(q));
      return matchCat && matchSearch;
    });
  }, [products, selectedCategory, search]);

  // Handle Barcode scan result
  const handleBarcodeResult = async (barcode: string, source: 'local' | 'remote' = 'local') => {
    try {
      const { data } = await api.get(`/products/barcode/${barcode}`);
      if (data) {
        if (data.stock_qty <= 0) {
          setError(`สินค้า "${data.name}" หมดสต็อกแล้ว`);
          setTimeout(() => setError(''), 3500);
          return;
        }
        addItem(data);
        setError('');

        // If scanned locally, broadcast to other connected devices (e.g. mobile to PC cashier)
        if (source === 'local') {
          const s = getSocket();
          if (s && s.connected) {
            s.emit('pos:scan', { barcode, senderId: s.id, productName: data.name });
          }
        }
      }
    } catch {
      setError(`ไม่พบสินค้าบาร์โค้ด: ${barcode}`);
      setTimeout(() => setError(''), 3500);
    }
  };

  // Listen to remote barcode scans from mobile phone or other scanners
  useRealtimeEvent('pos:scanned', (data: any) => {
    const s = getSocket();
    if (data && data.barcode && data.senderId !== s?.id) {
      handleBarcodeResult(data.barcode, 'remote');
    }
  });

  // Add product to cart with stock validation
  const handleAddToCart = (product: Product) => {
    if (product.stock_qty <= 0) {
      setError(`สินค้า "${product.name}" หมดสต็อก`);
      setTimeout(() => setError(''), 3000);
      return;
    }
    const inCart = items.find((i) => i.product_id === product.id);
    if (inCart && inCart.qty >= product.stock_qty) {
      setError(`สินค้า "${product.name}" มีในสต็อกเพียง ${product.stock_qty} ${product.unit}`);
      setTimeout(() => setError(''), 3000);
      return;
    }
    addItem(product);
  };

  // Checkout submission
  const handleCheckout = async () => {
    if (items.length === 0) return;
    setProcessing(true);
    setError('');
    try {
      const { data } = await api.post('/sales', {
        items: items.map((i) => ({ product_id: i.product_id, qty: i.qty, unit_price: i.unit_price })),
        discount_amount,
        payment_method: paymentMethod,
        payment_amount: parseFloat(paymentAmount) || getTotal(),
      });
      setLastSale(data);
      clearCart();
      setShowCheckout(false);
      setPaymentAmount('');
      setShowChangeModal(true);
      // Refresh catalog stock
      loadCatalog();
    } catch (err: any) {
      setError(err.response?.data?.message || 'เกิดข้อผิดพลาดในการบันทึกการขาย');
    } finally {
      setProcessing(false);
    }
  };

  const change = parseFloat(paymentAmount) - getTotal();
  const subtotal = getSubtotal();

  // Helper map for cart item counts by product id
  const cartQtyMap = useMemo(() => {
    const map: Record<number, number> = {};
    for (const item of items) {
      map[item.product_id] = item.qty;
    }
    return map;
  }, [items]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left Pane: Products Catalog */}
      <div className="flex-1 flex flex-col p-4 gap-3 overflow-hidden bg-slate-50/70">
        {/* Top Header: Search & Scanner */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" size={20} />
            <input
              ref={searchRef}
              className="input-lg pl-12 pr-10 bg-white shadow-sm"
              placeholder="ค้นหาสินค้าตามชื่อ, บาร์โค้ด หรือหมวดหมู่..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button onClick={() => setShowScanner(true)} className="btn-primary px-5 text-base flex-shrink-0 shadow-sm">
            <Scan size={20} /> สแกนบาร์โค้ด
          </button>
          <button onClick={loadCatalog} className="btn-outline px-3 shadow-sm" title="รีเฟรชสินค้า">
            <RefreshCw size={18} className={loading ? 'animate-spin text-blue-600' : ''} />
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none items-center">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 shadow-sm ${
              selectedCategory === null
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Filter size={13} />
            ทั้งหมด ({products.length})
          </button>
          {categories.map((cat) => {
            const count = products.filter((p) => p.category_id === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shadow-sm ${
                  selectedCategory === cat.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {cat.name} ({count})
              </button>
            );
          })}
        </div>

        {/* Convenience Store Quick Hotkeys (สินค้าขายด่วน) */}
        {products.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            <span className="text-amber-600 font-bold flex items-center gap-1 text-[11px] whitespace-nowrap bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 shadow-2xs">
              <Zap size={13} className="text-amber-500 fill-amber-500" />
              <span>ปุ่มด่วนแคชเชียร์:</span>
            </span>
            {products.slice(0, 6).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleAddToCart(p)}
                className="px-2.5 py-1 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg border border-slate-200 shadow-2xs font-medium whitespace-nowrap transition-all active:scale-95 flex items-center gap-1.5"
                title={`คลิกเพิ่ม ${p.name}`}
              >
                <span className="truncate max-w-[120px]">{p.name}</span>
                <span className="text-blue-600 font-bold font-mono">฿{p.sell_price}</span>
              </button>
            ))}
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center justify-between shadow-sm animate-fadeIn">
            <span className="flex items-center gap-2">
              <X size={16} className="text-red-500" /> {error}
            </span>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Success Receipt Banner */}
        {lastSale && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3.5 flex items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center flex-shrink-0">
                <Check size={18} />
              </div>
              <div>
                <p className="font-semibold text-green-800 text-sm">
                  ขายสำเร็จ! เลขที่ใบเสร็จ: <span className="font-mono">{lastSale.sale_no}</span>
                </p>
                <p className="text-green-700 text-xs">
                  ยอดรวม ฿{fmt(lastSale.total)} | รับเงิน ฿{fmt(lastSale.payment_amount)} | เงินทอน ฿{fmt(lastSale.change_amount)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => handlePrint()} className="btn-success btn-sm">
                <Printer size={14} /> พิมพ์ใบเสร็จ
              </button>
              <button onClick={() => setLastSale(null)} className="text-slate-400 hover:text-slate-700 p-1">
                <X size={18} />
              </button>
            </div>
          </div>
        )}

        {/* Product Cards Grid */}
        <div className="flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
              <RefreshCw size={28} className="animate-spin text-blue-500" />
              <p className="text-sm">กำลังโหลดรายการสินค้า...</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
              <Package size={48} className="text-slate-300" />
              <p className="text-sm font-medium">ไม่พบสินค้าตรงกับเงื่อนไข</p>
              {search && (
                <button onClick={() => setSearch('')} className="text-xs text-blue-600 hover:underline">
                  ล้างคำค้นหา
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5 pb-4">
              {filteredProducts.map((p) => {
                const inCartQty = cartQtyMap[p.id] || 0;
                const isOutOfStock = p.stock_qty <= 0;
                const isLowStock = !isOutOfStock && p.stock_qty <= p.min_stock;

                return (
                  <div
                    key={p.id}
                    onClick={() => !isOutOfStock && handleAddToCart(p)}
                    className={`group bg-white rounded-xl border transition-all duration-200 overflow-hidden flex flex-col justify-between select-none shadow-sm relative ${
                      isOutOfStock
                        ? 'opacity-60 border-slate-200 cursor-not-allowed bg-slate-50'
                        : 'border-slate-200 hover:border-blue-500 hover:shadow-md cursor-pointer active:scale-[0.98]'
                    }`}
                  >
                    {/* In-Cart Floating Badge */}
                    {inCartQty > 0 && (
                      <div className="absolute top-2 right-2 z-10 bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-md flex items-center gap-1 animate-scaleIn">
                        <ShoppingCart size={11} /> {inCartQty}
                      </div>
                    )}

                    {/* Stock Alert Badge */}
                    <div className="absolute top-2 left-2 z-10">
                      {isOutOfStock ? (
                        <span className="badge-red shadow-sm">สินค้าหมด</span>
                      ) : isLowStock ? (
                        <span className="badge-yellow shadow-sm">ใกล้หมด</span>
                      ) : null}
                    </div>

                    {/* Product Image */}
                    <div className="relative w-full h-32 bg-slate-100 overflow-hidden flex items-center justify-center">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                          onError={(e) => {
                            // Fallback to placeholder if image fails
                            (e.target as HTMLElement).style.display = 'none';
                            const parent = (e.target as HTMLElement).parentElement;
                            if (parent) {
                              parent.classList.add('bg-gradient-to-br', 'from-blue-50', 'to-slate-100');
                              const fallback = parent.querySelector('.fallback-icon') as HTMLElement;
                              if (fallback) fallback.style.display = 'flex';
                            }
                          }}
                        />
                      ) : null}
                      <div
                        className="fallback-icon flex flex-col items-center justify-center text-slate-400"
                        style={{ display: p.image_url ? 'none' : 'flex' }}
                      >
                        <Package size={36} className="text-slate-300 group-hover:text-blue-400 transition-colors" />
                        <span className="text-[10px] text-slate-400 font-mono mt-1">{p.barcode?.slice(-4)}</span>
                      </div>
                    </div>

                    {/* Product Details */}
                    <div className="p-3 flex-1 flex flex-col justify-between gap-1.5">
                      <div>
                        <p className="text-xs text-slate-400 line-clamp-1">{p.category_name || 'ทั่วไป'}</p>
                        <h4 className="font-semibold text-slate-800 text-sm line-clamp-2 leading-snug group-hover:text-blue-600 transition-colors">
                          {p.name}
                        </h4>
                      </div>

                      <div className="pt-1.5 border-t border-slate-100 flex items-end justify-between">
                        <div>
                          {/* Stock Quantity */}
                          <p
                            className={`text-xs ${
                              isOutOfStock
                                ? 'text-red-500 font-medium'
                                : isLowStock
                                ? 'text-orange-500 font-medium'
                                : 'text-slate-500'
                            }`}
                          >
                            คงเหลือ: <span className="font-semibold">{p.stock_qty}</span> {p.unit}
                          </p>
                          {/* Price */}
                          <p className="font-bold text-base text-blue-600 leading-tight mt-0.5">
                            ฿{fmt(p.sell_price)}
                          </p>
                        </div>

                        {/* Quick Add Button */}
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                            isOutOfStock
                              ? 'bg-slate-100 text-slate-300'
                              : 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white'
                          }`}
                        >
                          <Plus size={16} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Pane: Shopping Cart (Desktop) */}
      <div className="hidden md:flex w-96 bg-white border-l border-slate-200 flex-col shadow-xl z-20">
        {/* Cart Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-slate-800 text-base">
            <ShoppingCart size={20} className="text-blue-600" />
            <span>ตะกร้าสินค้า</span>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
              {items.reduce((s, i) => s + i.qty, 0)} ชิ้น
            </span>
          </div>
          {items.length > 0 && (
            <button onClick={clearCart} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 font-medium transition-colors">
              <Trash2 size={13} /> ล้างตะกร้า
            </button>
          )}
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-300 p-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                <ShoppingCart size={32} className="text-slate-400" />
              </div>
              <p className="text-sm font-semibold text-slate-500">ยังไม่มีสินค้าในตะกร้า</p>
              <p className="text-xs text-slate-400 mt-1">คลิกเลือกสินค้า หรือสแกนบาร์โค้ดเพื่อขาย</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map((item) => (
                <div key={item.product_id} className="p-3.5 hover:bg-slate-50/80 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">
                        ฿{fmt(item.unit_price)} / {item.unit}
                      </p>
                    </div>
                    <button
                      onClick={() => removeItem(item.product_id)}
                      className="text-slate-300 hover:text-red-500 transition-colors p-0.5"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between mt-2.5">
                    {/* Qty Controls */}
                    <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
                      <button
                        onClick={() => updateQty(item.product_id, item.qty - 1)}
                        className="w-7 h-7 flex items-center justify-center hover:bg-slate-100 text-slate-600 transition-colors"
                      >
                        <Minus size={13} />
                      </button>
                      <span className="w-9 text-center text-xs font-bold text-slate-800">{item.qty}</span>
                      <button
                        onClick={() => updateQty(item.product_id, item.qty + 1)}
                        className="w-7 h-7 flex items-center justify-center hover:bg-slate-100 text-slate-600 transition-colors"
                      >
                        <Plus size={13} />
                      </button>
                    </div>

                    {/* Subtotal */}
                    <p className="font-bold text-blue-600 text-sm">฿{fmt(item.subtotal)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cart Calculation Summary */}
        <div className="border-t border-slate-200 p-4 space-y-2.5 bg-slate-50/50">
          <div className="flex justify-between text-sm text-slate-600">
            <span>ยอดรวมสินค้า</span>
            <span className="font-semibold">฿{fmt(subtotal)}</span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">ส่วนลดท้ายบิล</span>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium">฿</span>
              <input
                type="number"
                min="0"
                className="w-24 text-right border border-slate-300 rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                value={discount_amount || ''}
                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="flex justify-between font-bold text-lg pt-2 border-t border-slate-200 items-baseline">
            <span className="text-slate-800">รวมทั้งสิ้น</span>
            <span className="text-blue-600 text-2xl">฿{fmt(getTotal())}</span>
          </div>

          <button
            onClick={() => setShowCheckout(true)}
            disabled={items.length === 0}
            className="btn-success w-full py-3.5 text-base mt-2 shadow-md flex items-center justify-center gap-2"
          >
            <Receipt size={20} />
            <span>ชำระเงิน (F2)</span>
          </button>
        </div>
      </div>

      {/* Mobile Floating Cart Bar */}
      {items.length > 0 && (
        <div className="md:hidden fixed bottom-16 left-3 right-3 z-20 animate-slideUp">
          <button
            onClick={() => setShowMobileCart(true)}
            className="w-full bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-2xl p-3.5 shadow-2xl flex items-center justify-between font-bold transition-all border border-blue-400/40"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-white text-blue-600 flex items-center justify-center text-xs font-black">
                {items.reduce((s, i) => s + i.qty, 0)}
              </span>
              <span className="text-sm">ดูตะกร้า ({items.length} รายการ)</span>
            </div>
            <div className="flex items-center gap-2 text-base font-mono">
              <span>฿{fmt(getTotal())}</span>
              <span className="text-xs bg-blue-500/80 px-2 py-0.5 rounded-lg font-sans">ชำระเงิน &gt;</span>
            </div>
          </button>
        </div>
      )}

      {/* Mobile Shopping Cart Drawer / Modal */}
      {showMobileCart && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end md:hidden animate-fadeIn">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowMobileCart(false)} />
          <div className="relative bg-white rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl z-10 animate-slideUp">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-800 text-base">
                <ShoppingCart size={20} className="text-blue-600" />
                <span>ตะกร้าสินค้า ({items.reduce((s, i) => s + i.qty, 0)} ชิ้น)</span>
              </div>
              <div className="flex items-center gap-3">
                {items.length > 0 && (
                  <button onClick={clearCart} className="text-xs text-red-500 hover:text-red-700">
                    ล้างตะกร้า
                  </button>
                )}
                <button onClick={() => setShowMobileCart(false)} className="text-slate-400 hover:text-slate-700 p-1">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Item list */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 max-h-60">
              {items.map((item) => (
                <div key={item.product_id} className="p-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                    <p className="text-xs text-slate-400 font-mono">฿{fmt(item.unit_price)} / {item.unit}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
                      <button onClick={() => updateQty(item.product_id, item.qty - 1)} className="w-7 h-7 flex items-center justify-center text-slate-600">
                        <Minus size={12} />
                      </button>
                      <span className="w-8 text-center text-xs font-bold">{item.qty}</span>
                      <button onClick={() => updateQty(item.product_id, item.qty + 1)} className="w-7 h-7 flex items-center justify-center text-slate-600">
                        <Plus size={12} />
                      </button>
                    </div>
                    <span className="font-bold text-blue-600 text-sm font-mono w-16 text-right">฿{fmt(item.subtotal)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Calculations & Checkout */}
            <div className="border-t border-slate-200 p-4 space-y-2 bg-slate-50">
              <div className="flex justify-between text-sm text-slate-600">
                <span>ยอดรวมสินค้า</span>
                <span className="font-semibold font-mono">฿{fmt(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>ส่วนลดท้ายบิล</span>
                <div className="flex items-center gap-1">
                  <span>฿</span>
                  <input
                    type="number"
                    min="0"
                    className="w-20 text-right border border-slate-300 rounded px-2 py-0.5 text-sm bg-white"
                    value={discount_amount || ''}
                    onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="flex justify-between font-bold text-lg pt-2 border-t border-slate-200 items-baseline">
                <span>รวมทั้งสิ้น</span>
                <span className="text-blue-600 text-2xl font-mono">฿{fmt(getTotal())}</span>
              </div>
              <button
                onClick={() => {
                  setShowMobileCart(false);
                  setShowCheckout(true);
                }}
                className="btn-success w-full py-3.5 text-base font-bold shadow-md flex items-center justify-center gap-2 mt-2"
              >
                <Receipt size={20} />
                <span>ไปที่หน้าชำระเงิน</span>
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Checkout Modal */}
      {showCheckout && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-scaleIn">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Receipt size={20} className="text-blue-600" />
                <span>ชำระเงิน</span>
              </h2>
              <button onClick={() => setShowCheckout(false)} className="text-slate-400 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-4 text-center">
                <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">ยอดเงินสุทธิ</p>
                <p className="text-4xl font-black text-blue-600 mt-1">฿{fmt(getTotal())}</p>
              </div>

              {/* Payment Methods */}
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2 uppercase">เลือกช่องทางชำระเงิน</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { v: 'cash', label: 'เงินสด', icon: Banknote },
                    { v: 'transfer', label: 'โอนเงิน', icon: Smartphone },
                    { v: 'credit', label: 'บัตรเครดิต', icon: CreditCard },
                  ].map(({ v, label, icon: Icon }) => (
                    <button
                      key={v}
                      onClick={() => setPaymentMethod(v as any)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-sm font-medium ${
                        paymentMethod === v
                          ? 'border-blue-600 bg-blue-50/80 text-blue-700 shadow-sm'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <Icon size={22} className={paymentMethod === v ? 'text-blue-600' : 'text-slate-400'} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Cash Input */}
              {paymentMethod === 'cash' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase">รับเงินจากลูกค้า</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg pointer-events-none">
                      ฿
                    </span>
                    <input
                      className="input-lg pl-10 text-right font-mono text-xl font-bold text-slate-800"
                      type="number"
                      min={getTotal()}
                      step="0.01"
                      placeholder={`${getTotal().toFixed(2)}`}
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      autoFocus
                    />
                  </div>

                  {paymentAmount && change >= 0 && (
                    <div className="mt-2 p-2.5 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between text-sm">
                      <span className="text-green-800 font-medium">เงินทอน:</span>
                      <span className="text-green-700 font-bold font-mono text-lg">฿{fmt(change)}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mt-3">
                    <button
                      type="button"
                      onClick={() => setPaymentAmount(getTotal().toFixed(2))}
                      className="px-2 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-xs col-span-3 sm:col-span-1 transition-all active:scale-95 shadow-2xs"
                    >
                      พอดี (฿{fmt(getTotal())})
                    </button>
                    {[
                      { v: 20, color: 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100' },
                      { v: 50, color: 'bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100' },
                      { v: 100, color: 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100' },
                      { v: 500, color: 'bg-purple-50 text-purple-800 border-purple-300 hover:bg-purple-100' },
                      { v: 1000, color: 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200' },
                    ].map((bill) => (
                      <button
                        key={bill.v}
                        type="button"
                        onClick={() => setPaymentAmount(String(bill.v))}
                        className={`px-2 py-2.5 rounded-xl border font-bold text-xs font-mono transition-all active:scale-95 shadow-2xs ${bill.color}`}
                      >
                        ฿{bill.v}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {error && <p className="text-red-600 text-sm bg-red-50 p-2.5 rounded-xl border border-red-200">{error}</p>}

              <button
                onClick={handleCheckout}
                disabled={processing || (paymentMethod === 'cash' && parseFloat(paymentAmount) < getTotal())}
                className="btn-success w-full py-3.5 text-base font-bold shadow-md"
              >
                <Check size={20} />
                <span>{processing ? 'กำลังบันทึกรายการ...' : 'ยืนยันการรับชำระเงิน'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Receipt Element for Printing */}
      {lastSale && (
        <div className="hidden">
          <div ref={receiptRef} className="p-4 w-72 font-mono text-xs">
            <div className="text-center mb-3">
              <p className="font-bold text-base">POS System</p>
              <p className="text-xs text-slate-600">ระบบจัดการร้านค้า</p>
              <p>--------------------------------</p>
            </div>
            <p>เลขที่: {lastSale.sale_no}</p>
            <p>วันที่: {new Date(lastSale.created_at).toLocaleString('th-TH')}</p>
            <p>แคชเชียร์: {user?.name}</p>
            <p>ช่องทาง: {lastSale.payment_method}</p>
            <p>--------------------------------</p>
            {lastSale.items?.map((item: any) => (
              <div key={item.id} className="flex justify-between py-0.5">
                <span className="flex-1 truncate pr-1">{item.product_name}</span>
                <span className="whitespace-nowrap">{item.qty}x{item.unit_price}</span>
                <span className="ml-2 font-semibold">{item.subtotal.toFixed(2)}</span>
              </div>
            ))}
            <p>--------------------------------</p>
            <div className="flex justify-between font-bold text-sm">
              <span>ยอดรวมทั้งสิ้น</span>
              <span>฿{fmt(lastSale.total)}</span>
            </div>
            {lastSale.discount_amount > 0 && (
              <div className="flex justify-between text-xs">
                <span>ส่วนลด</span>
                <span>-฿{fmt(lastSale.discount_amount)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs">
              <span>รับเงิน</span>
              <span>฿{fmt(lastSale.payment_amount)}</span>
            </div>
            <div className="flex justify-between text-xs font-semibold">
              <span>เงินทอน</span>
              <span>฿{fmt(lastSale.change_amount)}</span>
            </div>
            <p className="text-center mt-4">ขอบคุณที่ใช้บริการ / Thank you</p>
          </div>
        </div>
      )}

      {/* Mobile Camera Barcode & QR Scanner Modal (Continuous Scan Enabled) */}
      {showScanner && (
        <BarcodeScanner
          continuous={true}
          onScan={(code) => {
            handleBarcodeResult(code);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Big Change Display Modal (Convenience Store Cashier Screen) */}
      {showChangeModal && lastSale && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden p-6 text-center space-y-5 animate-in zoom-in-95 duration-200 border border-slate-100">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
              <Check size={36} strokeWidth={3} />
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">ชำระเงินสำเร็จ</p>
              <p className="text-xs text-slate-500 font-mono mt-0.5">บิลเลขที่: {lastSale.sale_no}</p>
            </div>

            {/* Large Change Display Box */}
            <div className="p-4 bg-emerald-50 border-2 border-emerald-300 rounded-2xl space-y-1.5">
              <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                {lastSale.payment_method === 'cash' ? '💵 เงินทอน' : 'ยอดชำระสำเร็จ'}
              </p>
              <p className="text-4xl sm:text-5xl font-black text-emerald-600 font-mono tracking-tight">
                ฿{fmt(lastSale.payment_method === 'cash' ? lastSale.change_amount : lastSale.total)}
              </p>
              {lastSale.payment_method === 'cash' && (
                <p className="text-[11px] text-emerald-700 font-medium">
                  รับมา ฿{fmt(lastSale.payment_amount)} • ยอดสุทธิ ฿{fmt(lastSale.total)}
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  handlePrint();
                }}
                className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95"
              >
                <Printer size={17} />
                <span>พิมพ์ใบเสร็จ (Print Receipt)</span>
              </button>

              <button
                type="button"
                autoFocus
                onClick={() => {
                  setShowChangeModal(false);
                  searchRef.current?.focus();
                }}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 transition-all active:scale-95"
              >
                <span>เริ่มรายการขายถัดไป (ลูกค้ารายใหม่)</span>
                <ArrowRight size={17} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
