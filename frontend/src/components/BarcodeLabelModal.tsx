import { useState, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import BarcodeView from './BarcodeView';
import QRCodeView from './QRCodeView';
import { X, Printer, Tag, Sparkles } from 'lucide-react';

export interface LabelItem {
  id?: number | string;
  product_id?: number;
  name?: string;
  product_name?: string;
  barcode: string;
  qty?: number;
  unit?: string;
  sell_price?: number;
  cost_price?: number;
}

interface BarcodeLabelModalProps {
  title?: string;
  docNo?: string;
  docType?: 'PO' | 'REQ' | 'DIS' | 'PRODUCT';
  items: LabelItem[];
  onClose: () => void;
}

export default function BarcodeLabelModal({
  title = 'พิมพ์สติกเกอร์บาร์โค้ด & QR Code',
  docNo,
  docType: _docType = 'PO',
  items,
  onClose,
}: BarcodeLabelModalProps) {
  // Config state
  const [labelType, setLabelType] = useState<'barcode' | 'qrcode' | 'dual'>('barcode');
  const [paperFormat, setPaperFormat] = useState<'thermal' | 'a4'>('thermal');
  const [copiesMode, setCopiesMode] = useState<'actual' | 'one' | 'custom'>('actual');
  const [customCopies, setCustomCopies] = useState<number>(1);
  const [showPrice, setShowPrice] = useState(true);
  const [showDocNo, setShowDocNo] = useState(true);
  const [selectedItemIds, setSelectedItemIds] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    items.forEach((item, idx) => {
      initial[item.barcode || idx.toString()] = true;
    });
    return initial;
  });

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Labels_${docNo || 'items'}_${Date.now()}`,
  });

  const toggleSelect = (key: string) => {
    setSelectedItemIds((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const selectAll = (val: boolean) => {
    const next: Record<string, boolean> = {};
    items.forEach((item, idx) => {
      next[item.barcode || idx.toString()] = val;
    });
    setSelectedItemIds(next);
  };

  // Build the list of labels to render based on copies
  const activeItems = items.filter((item, idx) => selectedItemIds[item.barcode || idx.toString()]);

  const labelsToPrint: { item: LabelItem; copyIndex: number }[] = [];
  activeItems.forEach((item) => {
    let count = 1;
    if (copiesMode === 'actual') {
      count = Math.max(1, Math.min(200, Number(item.qty) || 1));
    } else if (copiesMode === 'custom') {
      count = Math.max(1, Math.min(200, customCopies));
    }
    for (let c = 0; c < count; c++) {
      labelsToPrint.push({ item, copyIndex: c + 1 });
    }
  });

  const fmt = (n?: number) => (n !== undefined ? n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '0');

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
              <Tag size={18} />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-bold text-slate-800">{title}</h2>
              {docNo && (
                <p className="text-xs text-slate-500 font-mono">
                  อ้างอิงเอกสาร: <span className="font-bold text-blue-600">{docNo}</span> ({activeItems.length} รายการที่เลือก | รวม {labelsToPrint.length} ดวง)
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body: Left Controls, Right Preview */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
          {/* Settings Panel (col-span-5) */}
          <div className="lg:col-span-5 p-5 space-y-5 bg-white">
            {/* Style Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                1. รูปแบบโค้ดบนสติกเกอร์
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setLabelType('barcode')}
                  className={`p-2.5 rounded-xl border text-center transition-all ${
                    labelType === 'barcode'
                      ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold shadow-sm ring-2 ring-blue-500/20'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600 text-xs'
                  }`}
                >
                  <p className="text-xs font-bold">1D Barcode</p>
                  <p className="text-[10px] text-slate-400">บาร์โค้ดแท่ง</p>
                </button>
                <button
                  type="button"
                  onClick={() => setLabelType('qrcode')}
                  className={`p-2.5 rounded-xl border text-center transition-all ${
                    labelType === 'qrcode'
                      ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold shadow-sm ring-2 ring-blue-500/20'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600 text-xs'
                  }`}
                >
                  <p className="text-xs font-bold">2D QR Code</p>
                  <p className="text-[10px] text-slate-400">คิวอาร์โค้ด</p>
                </button>
                <button
                  type="button"
                  onClick={() => setLabelType('dual')}
                  className={`p-2.5 rounded-xl border text-center transition-all ${
                    labelType === 'dual'
                      ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold shadow-sm ring-2 ring-blue-500/20'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600 text-xs'
                  }`}
                >
                  <p className="text-xs font-bold">คู่ (Barcode+QR)</p>
                  <p className="text-[10px] text-slate-400">ครบทั้งสอง</p>
                </button>
              </div>
            </div>

            {/* Paper Format */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                2. ประเภทกระดาษ / เครื่องพิมพ์
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaperFormat('thermal')}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    paperFormat === 'thermal'
                      ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold shadow-sm'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <p className="text-xs font-semibold">เครื่องพิมพ์สติกเกอร์ความร้อน</p>
                  <p className="text-[10px] text-slate-400">Thermal Label (50x30 mm)</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPaperFormat('a4')}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    paperFormat === 'a4'
                      ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold shadow-sm'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <p className="text-xs font-semibold">กระดาษสติกเกอร์ A4</p>
                  <p className="text-[10px] text-slate-400">แผ่น A4 ตาราง 3x8 ดวง</p>
                </button>
              </div>
            </div>

            {/* Number of Copies */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                3. จำนวนดวงสติกเกอร์ที่จะพิมพ์
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer p-2 rounded-xl hover:bg-slate-50 border border-slate-200">
                  <input
                    type="radio"
                    name="copiesMode"
                    checked={copiesMode === 'actual'}
                    onChange={() => setCopiesMode('actual')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span>ตามจำนวนที่ทำรายการจริง (เช่น รับ 50 ซอง = พิมพ์ 50 ดวง)</span>
                </label>
                <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer p-2 rounded-xl hover:bg-slate-50 border border-slate-200">
                  <input
                    type="radio"
                    name="copiesMode"
                    checked={copiesMode === 'one'}
                    onChange={() => setCopiesMode('one')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span>1 ดวงต่อ 1 รายการ (เหมาะสำหรับติดป้ายชั้นวาง/เชลฟ์)</span>
                </label>
                <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer p-2 rounded-xl hover:bg-slate-50 border border-slate-200">
                  <input
                    type="radio"
                    name="copiesMode"
                    checked={copiesMode === 'custom'}
                    onChange={() => setCopiesMode('custom')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span>กำหนดจำนวนเอง:</span>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    disabled={copiesMode !== 'custom'}
                    value={customCopies}
                    onChange={(e) => setCustomCopies(parseInt(e.target.value) || 1)}
                    className="w-16 px-2 py-0.5 border border-slate-300 rounded text-center text-xs font-bold"
                  />
                  <span>ดวงต่อรายการ</span>
                </label>
              </div>
            </div>

            {/* Option Toggles */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-4 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPrice}
                  onChange={(e) => setShowPrice(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span className="text-slate-700">แสดงราคาขาย</span>
              </label>
              {docNo && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showDocNo}
                    onChange={(e) => setShowDocNo(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span className="text-slate-700">แสดงเลขอ้างอิง {docNo}</span>
                </label>
              )}
            </div>

            {/* Item Checklist */}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700">เลือกสินค้าที่จะพิมพ์ ({activeItems.length}/{items.length})</span>
                <div className="flex gap-2 text-[11px] text-blue-600">
                  <button type="button" onClick={() => selectAll(true)} className="hover:underline">เลือกทั้งหมด</button>
                  <span>|</span>
                  <button type="button" onClick={() => selectAll(false)} className="hover:underline">ไม่เลือกเลย</button>
                </div>
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                {items.map((it, idx) => {
                  const key = it.barcode || idx.toString();
                  const isChecked = !!selectedItemIds[key];
                  return (
                    <label
                      key={key}
                      className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer border transition-colors ${
                        isChecked ? 'bg-blue-50/50 border-blue-200' : 'bg-slate-50 border-transparent text-slate-400'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelect(key)}
                          className="rounded text-blue-600"
                        />
                        <span className="font-medium truncate text-slate-800">{it.name || it.product_name}</span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-500 flex-shrink-0 ml-2">
                        {it.qty ? `${it.qty} ${it.unit || 'ชิ้น'}` : it.barcode}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Live Preview & Print Container (col-span-7) */}
          <div className="lg:col-span-7 p-5 bg-slate-100/60 flex flex-col justify-between overflow-hidden">
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={14} className="text-amber-500" />
                  ตัวอย่างก่อนพิมพ์ (Print Preview) - รวม {labelsToPrint.length} ดวง
                </p>
                <span className="text-[11px] text-slate-400">
                  {paperFormat === 'thermal' ? 'ฉลากเดี่ยว 50x30mm' : 'ตารางแผ่น A4'}
                </span>
              </div>

              {/* Scrollable Preview Area */}
              <div className="max-h-[52vh] overflow-y-auto p-4 bg-white rounded-2xl border border-slate-200 shadow-inner">
                {labelsToPrint.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    กรุณาเลือกรายการสินค้าอย่างน้อย 1 รายการเพื่อดูตัวอย่าง
                  </div>
                ) : (
                  <div
                    ref={printRef}
                    className={`print-container ${
                      paperFormat === 'thermal'
                        ? 'flex flex-col gap-3 items-center'
                        : 'grid grid-cols-3 gap-2'
                    }`}
                  >
                    {labelsToPrint.map(({ item, copyIndex: _copyIndex }, i) => {
                      const name = item.name || item.product_name || 'สินค้า';
                      const barcode = item.barcode || '0000000000000';
                      const price = item.sell_price;

                      return (
                        <div
                          key={i}
                          className={`bg-white border border-slate-300 rounded-lg p-2.5 text-center flex flex-col justify-between relative shadow-sm page-break-inside-avoid ${
                            paperFormat === 'thermal'
                              ? 'w-[52mm] min-h-[32mm] my-1'
                              : 'w-full min-h-[30mm]'
                          }`}
                          style={{
                            boxSizing: 'border-box',
                            breakInside: 'avoid',
                          }}
                        >
                          {/* Product Title */}
                          <div className="overflow-hidden mb-1">
                            <p className="font-bold text-[11px] text-slate-900 leading-tight line-clamp-2">
                              {name}
                            </p>
                          </div>

                          {/* Code Graphics */}
                          <div className="my-auto flex items-center justify-center gap-1.5 py-0.5">
                            {labelType === 'barcode' && (
                              <BarcodeView
                                value={barcode}
                                width={1.3}
                                height={28}
                                fontSize={10}
                                margin={1}
                              />
                            )}

                            {labelType === 'qrcode' && (
                              <div className="flex flex-col items-center">
                                <QRCodeView value={barcode} size={64} margin={1} />
                                <span className="font-mono text-[9px] font-bold text-slate-700 tracking-wider mt-0.5">
                                  {barcode}
                                </span>
                              </div>
                            )}

                            {labelType === 'dual' && (
                              <div className="flex items-center justify-between w-full px-1 gap-1">
                                <div className="flex-1 overflow-hidden flex flex-col items-center">
                                  <BarcodeView
                                    value={barcode}
                                    width={1.0}
                                    height={24}
                                    fontSize={9}
                                    margin={0}
                                  />
                                </div>
                                <div className="flex-shrink-0">
                                  <QRCodeView value={barcode} size={48} margin={0} />
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Footer Info: Price & Doc Reference */}
                          <div className="flex items-center justify-between text-[9px] text-slate-600 pt-1 border-t border-slate-100 mt-1">
                            {showDocNo && docNo ? (
                              <span className="font-mono text-[8px] text-slate-400 truncate max-w-[90px]">
                                #{docNo}
                              </span>
                            ) : (
                              <span></span>
                            )}
                            {showPrice && price !== undefined && (
                              <span className="font-bold text-slate-900 text-[10px]">
                                ฿{fmt(price)} {item.unit ? `/${item.unit}` : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 flex items-center justify-between border-t border-slate-200 mt-3">
              <span className="text-xs text-slate-500 font-medium">
                พร้อมพิมพ์ {labelsToPrint.length} ป้ายสติกเกอร์
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-all"
                >
                  ปิดหน้าต่าง
                </button>
                <button
                  type="button"
                  onClick={() => handlePrint()}
                  disabled={labelsToPrint.length === 0}
                  className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-500/20 inline-flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                >
                  <Printer size={15} />
                  สั่งพิมพ์สติกเกอร์ ({labelsToPrint.length} ดวง)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
