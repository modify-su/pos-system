import { useEffect } from 'react';
import { X, ShoppingCart, ChevronLeft, ChevronRight, Package, Barcode, Tag, Plus } from 'lucide-react';

interface ProductImageModalProps {
  product: {
    id: number;
    barcode: string;
    name: string;
    category_name?: string;
    unit?: string;
    sell_price: number;
    stock_qty?: number;
    min_stock?: number;
    image_url?: string;
  } | null;
  onClose: () => void;
  onAddToCart?: (product: any) => void;
  inCartQty?: number;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

const fmt = (n?: number) => (n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ProductImageModal({
  product,
  onClose,
  onAddToCart,
  inCartQty = 0,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
}: ProductImageModalProps) {
  // Handle keyboard events (Esc to close, Left/Right arrows to navigate)
  useEffect(() => {
    if (!product) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && hasPrev && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'ArrowRight' && hasNext && onNext) {
        e.preventDefault();
        onNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [product, hasPrev, hasNext, onPrev, onNext, onClose]);

  if (!product) return null;

  const isOutOfStock = typeof product.stock_qty === 'number' && product.stock_qty <= 0;
  const isLowStock =
    !isOutOfStock &&
    typeof product.stock_qty === 'number' &&
    typeof product.min_stock === 'number' &&
    product.stock_qty <= product.min_stock;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200 flex flex-col my-auto animate-scaleIn select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
              <Package size={18} />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-800">ภาพสินค้า & รายละเอียด</h3>
              <p className="text-[11px] text-slate-500 font-mono">บาร์โค้ด: {product.barcode || '-'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200/80 hover:bg-slate-300 text-slate-600 flex items-center justify-center transition-colors"
            title="ปิดหน้าต่าง (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Large Image Showcase Area */}
        <div className="relative w-full h-72 sm:h-96 bg-gradient-to-b from-slate-100 to-slate-50 flex items-center justify-center overflow-hidden border-b border-slate-100">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="max-w-full max-h-full object-contain p-4 transition-transform duration-300 hover:scale-105"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-400 p-6 text-center">
              <div className="w-20 h-20 rounded-2xl bg-white shadow-sm border border-slate-200 flex items-center justify-center mb-3">
                <Package size={40} className="text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-600">ไม่มีภาพสินค้าในระบบ</p>
              <p className="text-xs text-slate-400 mt-1">สามารถอัปโหลดภาพสินค้าได้ที่เมนู "จัดการสินค้า"</p>
            </div>
          )}

          {/* Navigation Overlay Buttons (Left / Right) */}
          {hasPrev && onPrev && (
            <button
              onClick={onPrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 hover:bg-white text-slate-700 shadow-md border border-slate-200 flex items-center justify-center transition-all hover:scale-110 active:scale-95"
              title="ดูสินค้าก่อนหน้า (ปุ่มลูกศรซ้าย ⬅)"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          {hasNext && onNext && (
            <button
              onClick={onNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 hover:bg-white text-slate-700 shadow-md border border-slate-200 flex items-center justify-center transition-all hover:scale-110 active:scale-95"
              title="ดูสินค้าถัดไป (ปุ่มลูกศรขวา ➡)"
            >
              <ChevronRight size={20} />
            </button>
          )}

          {/* Floating Category Badge */}
          {product.category_name && (
            <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-xs text-slate-700 text-xs font-semibold px-2.5 py-1 rounded-lg shadow-sm border border-slate-200 flex items-center gap-1.5">
              <Tag size={12} className="text-blue-600" />
              <span>{product.category_name}</span>
            </div>
          )}

          {/* Floating Stock Badge */}
          {typeof product.stock_qty === 'number' && (
            <div className="absolute top-3 right-3">
              {isOutOfStock ? (
                <span className="badge-red shadow-sm">สินค้าหมด (0 {product.unit || 'ชิ้น'})</span>
              ) : isLowStock ? (
                <span className="badge-yellow shadow-sm">ใกล้หมด (เหลือ {product.stock_qty} {product.unit || 'ชิ้น'})</span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-800 shadow-sm border border-emerald-200">
                  คงเหลือ: {product.stock_qty} {product.unit || 'ชิ้น'}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Product Details Section */}
        <div className="p-5 space-y-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug">
              {product.name}
            </h2>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-500">
              <span className="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-md font-mono">
                <Barcode size={13} className="text-slate-600" />
                {product.barcode}
              </span>
              <span>หน่วย: <strong className="text-slate-700">{product.unit || 'ชิ้น'}</strong></span>
              {typeof product.stock_qty === 'number' && (
                <span>
                  คงเหลือในสต็อก:{' '}
                  <strong className={isOutOfStock ? 'text-red-600' : 'text-slate-800'}>
                    {product.stock_qty} {product.unit || 'ชิ้น'}
                  </strong>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <div>
              <p className="text-xs text-slate-400">ราคาขายต่อหน่วย</p>
              <p className="text-2xl sm:text-3xl font-black text-blue-600 font-mono">
                ฿{fmt(product.sell_price)}
              </p>
            </div>

            {/* In Cart Indicator */}
            {inCartQty > 0 && (
              <div className="text-right">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-full text-xs font-bold">
                  <ShoppingCart size={13} /> อยู่ในตะกร้าแล้ว: {inCartQty} {product.unit || 'ชิ้น'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-400 hidden sm:block">
            กด <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] text-slate-600 font-mono">Esc</kbd> เพื่อปิด
            {hasPrev || hasNext ? ' | กด ⬅ ➡ เพื่อเปลี่ยนสินค้า' : ''}
          </div>

          <div className="flex items-center gap-2 ml-auto w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary px-4 py-2 text-sm flex-1 sm:flex-initial"
            >
              ปิด
            </button>

            {onAddToCart && (
              <button
                type="button"
                disabled={isOutOfStock}
                onClick={() => {
                  onAddToCart(product);
                }}
                className="btn-primary px-5 py-2 text-sm flex-1 sm:flex-initial shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Plus size={16} />
                <span>เพิ่มลงตะกร้า (+1)</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
