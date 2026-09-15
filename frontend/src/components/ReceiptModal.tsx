import { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Printer, X, FileText } from 'lucide-react';

interface ReceiptItem {
  id?: number;
  product_name: string;
  barcode?: string;
  qty: number;
  unit_price: number;
  discount?: number;
  subtotal: number;
}

export interface ReceiptSale {
  id: number;
  sale_no: string;
  created_at: string;
  cashier_name?: string;
  total: number;
  subtotal?: number;
  discount_amount?: number;
  payment_method: string;
  payment_amount?: number;
  change_amount?: number;
  note?: string;
  items?: ReceiptItem[];
}

interface ReceiptModalProps {
  sale: ReceiptSale | null;
  isReprint?: boolean;
  onClose: () => void;
}

const fmt = (n?: number) => (n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ReceiptModal({ sale, isReprint = false, onClose }: ReceiptModalProps) {
  const receiptRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: `Receipt-${sale?.sale_no || 'POS'}`,
  });

  if (!sale) return null;

  const paymentLabel =
    sale.payment_method === 'cash' ? 'เงินสด (Cash)' :
    sale.payment_method === 'promptpay' ? 'พร้อมเพย์ / โอน (PromptPay)' :
    sale.payment_method === 'credit' ? 'บัตรเครดิต (Credit Card)' : sale.payment_method;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150 backdrop-blur-xs">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150 border border-slate-200">
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-400">
              <FileText size={16} />
            </div>
            <div>
              <h3 className="font-bold text-sm leading-tight">
                {isReprint ? 'พิมพ์ใบเสร็จย้อนหลัง (สำเนา)' : 'ใบเสร็จรับเงิน'}
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">บิลเลขที่: {sale.sale_no}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Receipt Preview Area (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100/80 flex justify-center">
          {/* Paper Receipt (Thermal 80mm / 58mm optimized) */}
          <div
            ref={receiptRef}
            className="w-full max-w-[340px] bg-white text-slate-900 shadow-md p-5 rounded-md font-mono text-[12px] leading-relaxed border border-slate-200 print:shadow-none print:border-none print:m-0 print:p-2 print:w-[80mm] print:max-w-none"
          >
            {/* Header Stamp for Duplicate / Reprint */}
            {isReprint && (
              <div className="mb-3 py-1 px-2 border-2 border-dashed border-red-500 text-red-600 rounded text-center font-bold text-xs">
                *** สำเนาใบเสร็จ / REPRINT COPY ***
              </div>
            )}

            {/* Store Info */}
            <div className="text-center space-y-0.5">
              <h2 className="text-base font-bold text-slate-900 tracking-tight">SMART POS & CONVENIENCE</h2>
              <p className="text-[11px] text-slate-600">ระบบจัดการร้านค้า & จุดขาย</p>
              <p className="text-[10px] text-slate-500">โทร: 02-123-4567 • เลขประจำตัวผู้เสียภาษี: 0105550000000</p>
            </div>

            <div className="border-b border-dashed border-slate-400 my-2.5" />

            {/* Meta details */}
            <div className="space-y-0.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-600">เลขที่บิล:</span>
                <span className="font-bold text-slate-900">{sale.sale_no}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">วันที่:</span>
                <span>{new Date(sale.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">เวลา:</span>
                <span>{new Date(sale.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">พนักงานขาย:</span>
                <span>{sale.cashier_name || 'Cashier'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">ชำระโดย:</span>
                <span className="font-semibold">{paymentLabel}</span>
              </div>
            </div>

            <div className="border-b border-dashed border-slate-400 my-2.5" />

            {/* Items list */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] text-slate-500 font-semibold border-b border-slate-200 pb-1">
                <span>รายการ</span>
                <span>จำนวน x ราคา</span>
                <span>รวม</span>
              </div>

              {sale.items && sale.items.length > 0 ? (
                sale.items.map((item, idx) => (
                  <div key={idx} className="space-y-0.5">
                    <div className="flex justify-between items-start text-[11px]">
                      <span className="flex-1 pr-2 font-medium break-words leading-tight">{item.product_name}</span>
                      <span className="text-slate-600 whitespace-nowrap">{item.qty} x {fmt(item.unit_price)}</span>
                      <span className="w-16 text-right font-bold text-slate-900">{fmt(item.subtotal)}</span>
                    </div>
                    {item.discount ? (
                      <p className="text-[10px] text-red-500 text-right pr-1">-ส่วนลด {fmt(item.discount)}</p>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-center text-slate-400 py-2 text-xs">ไม่มีรายละเอียดสินค้า</p>
              )}
            </div>

            <div className="border-b border-dashed border-slate-400 my-2.5" />

            {/* Totals Breakdown */}
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-600">ยอดรวมสินค้า:</span>
                <span>฿{fmt(sale.subtotal || sale.total)}</span>
              </div>

              {(sale.discount_amount ?? 0) > 0 && (
                <div className="flex justify-between text-red-600 font-medium">
                  <span>ส่วนลดพิเศษ:</span>
                  <span>-฿{fmt(sale.discount_amount)}</span>
                </div>
              )}

              <div className="border-t border-slate-300 pt-1 flex justify-between text-sm font-bold text-slate-900">
                <span>ยอดสุทธิ (Total):</span>
                <span className="text-base text-blue-700">฿{fmt(sale.total)}</span>
              </div>

              <div className="flex justify-between text-slate-700 pt-1">
                <span>รับเงินมา:</span>
                <span>฿{fmt(sale.payment_amount || sale.total)}</span>
              </div>

              <div className="flex justify-between text-emerald-700 font-bold">
                <span>เงินทอน:</span>
                <span>฿{fmt(sale.change_amount || 0)}</span>
              </div>
            </div>

            {sale.note && (
              <div className="mt-2.5 pt-2 border-t border-dashed border-slate-300 text-[10px] text-slate-500">
                <span className="font-semibold">หมายเหตุ:</span> {sale.note}
              </div>
            )}

            <div className="border-b border-dashed border-slate-400 my-2.5" />

            {/* Footer Thank You */}
            <div className="text-center space-y-1 text-[10px] text-slate-500">
              <p className="font-semibold text-slate-700">*** ขอบคุณที่ใช้บริการ / THANK YOU ***</p>
              <p>สินค้าซื้อแล้วเปลี่ยนคืนได้ภายใน 7 วันพร้อมใบเสร็จ</p>
              {isReprint && (
                <p className="text-[9px] text-slate-400 pt-1">
                  พิมพ์ซ้ำเมื่อ: {new Date().toLocaleString('th-TH')}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Modal Bottom Actions */}
        <div className="px-5 py-3.5 bg-white border-t border-slate-200 flex items-center justify-between gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-medium text-sm hover:bg-slate-100 transition-colors"
          >
            ปิดหน้าต่าง
          </button>

          <button
            type="button"
            autoFocus
            onClick={() => handlePrint()}
            className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-blue-500/25 transition-all active:scale-95"
          >
            <Printer size={17} />
            <span>{isReprint ? 'สั่งพิมพ์สำเนาใบเสร็จ' : 'สั่งพิมพ์ใบเสร็จ'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
