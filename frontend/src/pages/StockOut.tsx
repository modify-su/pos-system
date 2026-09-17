import { useEffect, useState, useRef } from 'react';
import api from '../api/client';
import BarcodeScanner from '../components/BarcodeScanner';
import BarcodeView from '../components/BarcodeView';
import QRCodeView from '../components/QRCodeView';
import BarcodeLabelModal, { type LabelItem } from '../components/BarcodeLabelModal';
import {
  Scan, Trash2, Save, ClipboardList, Check, X, Search,
  Printer, ArrowUpRight, Zap, FileText, AlertCircle, Sparkles, Plus, Minus,
  Tag, Loader2, Package, RefreshCw
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useReactToPrint } from 'react-to-print';
import { useRealtimeEvent } from '../utils/socket';

const fmt = (n: number) => n?.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

interface DisburseItem {
  product_id: number;
  name: string;
  barcode: string;
  unit: string;
  stock_qty: number;
  qty: number;
  image_url?: string;
}

export default function StockOut() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<'form' | 'history'>('form');
  const [mode, setMode] = useState<'direct' | 'request'>('direct'); // direct = เบิกจ่ายทันที, request = ส่งขออนุมัติ

  const [items, setItems] = useState<DisburseItem[]>([]);
  const [reason, setReason] = useState('เบิกเพื่อบรรจุสินค้า');
  const [customReason, setCustomReason] = useState('');
  const [recipient, setRecipient] = useState('');
  const [department, setDepartment] = useState('ฝ่ายผลิต/บรรจุ');
  const [note, setNote] = useState('');

  const [search, setSearch] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [quickPicks, setQuickPicks] = useState<any[]>([]);
  const [showScanner, setShowScanner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [scanNotice, setScanNotice] = useState<{
    type: 'not_found' | 'out_of_stock' | 'success';
    code: string;
    productName?: string;
    stock?: number;
    unit?: string;
  } | null>(null);

  const [lastVoucher, setLastVoucher] = useState<any>(null);
  const [viewingVoucher, setViewingVoucher] = useState<any>(null);
  const [loadingVoucherId, setLoadingVoucherId] = useState<number | null>(null);
  const [reqs, setReqs] = useState<any[]>([]);
  const [approving, setApproving] = useState<any>(null);

  // Label Printing Modal
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [labelModalData, setLabelModalData] = useState<{
    docNo?: string;
    docType?: 'PO' | 'REQ' | 'DIS' | 'PRODUCT';
    items: LabelItem[];
    title?: string;
  } | null>(null);

  const voucherPrintRef = useRef<HTMLDivElement>(null);
  const handlePrintVoucher = useReactToPrint({ contentRef: voucherPrintRef });

  const handleViewVoucher = async (reqId: number) => {
    try {
      setLoadingVoucherId(reqId);
      const res = await api.get(`/inventory/requisitions/${reqId}`);
      setViewingVoucher(res.data);
    } catch {
      alert('ไม่สามารถโหลดรายละเอียดเอกสารเบิกจ่ายได้');
    } finally {
      setLoadingVoucherId(null);
    }
  };

  // Load requisitions history and quick picks
  useEffect(() => {
    loadReqs();
    loadQuickPicks();
  }, []);

  // Real-time synchronization
  useRealtimeEvent('inventory:updated', () => {
    loadQuickPicks();
    loadReqs();
  });
  useRealtimeEvent('requisition:updated', () => {
    loadReqs();
  });

  const loadReqs = async () => {
    try {
      const res = await api.get('/inventory/requisitions');
      setReqs(res.data);
    } catch { /* ignore */ }
  };

  const handleDeleteReq = async (reqId: number, reqNo: string) => {
    if (!confirm(`ต้องการลบรายการเบิก ${reqNo} ใช่หรือไม่?`)) return;
    try {
      const res = await api.delete(`/inventory/requisitions/${reqId}`);
      alert(res.data?.message || 'ลบรายการสำเร็จ');
      loadReqs();
      loadQuickPicks();
    } catch (err: any) {
      alert(err.response?.data?.message || 'เกิดข้อผิดพลาดในการลบรายการ');
    }
  };

  const handleClearAllReqHistory = async () => {
    if (reqs.length === 0) {
      alert('ยังไม่มีประวัติการเบิกจ่ายสินค้าในระบบ');
      return;
    }
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการเคลียร์ประวัติการเบิกจ่ายทั้งหมด?')) return;
    try {
      const res = await api.delete('/inventory/requisitions');
      alert(res.data?.message || 'ล้างประวัติการเบิกจ่ายทั้งหมดสำเร็จ');
      loadReqs();
      loadQuickPicks();
    } catch (err: any) {
      alert(err.response?.data?.message || 'เกิดข้อผิดพลาดในการล้างประวัติ');
    }
  };

  const loadQuickPicks = async () => {
    try {
      const res = await api.get('/products', { params: { limit: 8 } });
      setQuickPicks(res.data);
    } catch { /* ignore */ }
  };

  const searchProduct = async (q: string) => {
    if (!q.trim()) { setProducts([]); return; }
    try {
      const res = await api.get('/products', { params: { search: q, limit: 10 } });
      setProducts(res.data);
    } catch { /* ignore */ }
  };

  // Add item by barcode or scan
  const handleBarcode = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    try {
      const { data } = await api.get(`/products/barcode/${trimmed}`);
      if (data) {
        if (data.stock_qty <= 0) {
          setScanNotice({
            type: 'out_of_stock',
            code: trimmed,
            productName: data.name,
            stock: 0,
            unit: data.unit || 'ชิ้น',
          });
          return;
        }
        addProduct(data);
        setBarcodeInput('');
        setScanNotice({
          type: 'success',
          code: trimmed,
          productName: data.name,
          stock: data.stock_qty,
          unit: data.unit || 'ชิ้น',
        });
        setTimeout(() => setScanNotice((curr) => (curr?.type === 'success' ? null : curr)), 4000);
      }
    } catch {
      setScanNotice({
        type: 'not_found',
        code: trimmed,
      });
    }
  };

  const addProduct = (p: any, defaultQty: number = 1) => {
    if (p.stock_qty <= 0) {
      setScanNotice({
        type: 'out_of_stock',
        code: p.barcode || '',
        productName: p.name,
        stock: 0,
        unit: p.unit || 'ชิ้น',
      });
      return;
    }

    setItems((prev) => {
      const existing = prev.find((i) => i.product_id === p.id);
      if (existing) {
        const nextQty = existing.qty + defaultQty;
        if (nextQty > p.stock_qty) {
          setErrorMsg(`สินค้า "${p.name}" มีในคลังเพียง ${p.stock_qty} ${p.unit}`);
          setTimeout(() => setErrorMsg(''), 4000);
          return prev;
        }
        return prev.map((i) => (i.product_id === p.id ? { ...i, qty: nextQty } : i));
      } else {
        const initialQty = Math.min(defaultQty, p.stock_qty);
        return [
          ...prev,
          {
            product_id: p.id,
            name: p.name,
            barcode: p.barcode,
            unit: p.unit,
            stock_qty: p.stock_qty,
            qty: initialQty,
            image_url: p.image_url,
          },
        ];
      }
    });

    setProducts([]);
    setSearch('');
    setErrorMsg('');
  };

  const updateItemQty = (idx: number, newQty: number) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const validQty = Math.max(1, Math.min(newQty, item.stock_qty));
        return { ...item, qty: validQty };
      })
    );
  };

  // Execute disbursement (Direct or Request)
  const handleSubmit = async () => {
    if (items.length === 0) return;
    setSaving(true);
    setErrorMsg('');

    const finalReason = reason === 'อื่นๆ' ? customReason : reason;

    try {
      if (mode === 'direct') {
        // Direct Stock-Out (ตัดสต็อกทันที)
        const res = await api.post('/inventory/direct-stock-out', {
          items: items.map((i) => ({ product_id: i.product_id, qty: i.qty })),
          reason: finalReason,
          recipient,
          department,
          note,
        });
        setLastVoucher(res.data);
        setSuccessMsg(`เบิกจ่ายสำเร็จ! เลขที่ใบเบิก: ${res.data.req_no} (ตัดสต็อกเรียบร้อยแล้ว)`);
      } else {
        // Request for Approval (สร้างคำขอเบิก)
        const res = await api.post('/inventory/requisitions', {
          items: items.map((i) => ({ product_id: i.product_id, qty: i.qty })),
          reason: `${finalReason} ${recipient ? `(ผู้รับ: ${recipient})` : ''} ${department ? `(${department})` : ''}`.trim(),
          note,
        });
        setLastVoucher(res.data);
        setSuccessMsg(`ส่งคำขอเบิกสำเร็จ! เลขที่คำขอ: ${res.data.req_no} (รอผู้จัดการอนุมัติ)`);
      }

      setItems([]);
      setCustomReason('');
      setRecipient('');
      setNote('');
      loadReqs();
      loadQuickPicks();
      setTimeout(() => setSuccessMsg(''), 6000);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'เกิดข้อผิดพลาดในการทำรายการ');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (req: any) => {
    try {
      const approvedItems = req.items?.map((ri: any) => ({
        req_item_id: ri.id,
        qty_approved: ri.qty_requested,
      })) || [];
      await api.put(`/inventory/requisitions/${req.id}/approve`, { approved_items: approvedItems });
      loadReqs();
      loadQuickPicks();
      setApproving(null);
    } catch (err: any) {
      alert(err.response?.data?.message || 'เกิดข้อผิดพลาด');
    }
  };

  const handleReject = async (reqId: number) => {
    if (!confirm('ยืนยันการปฏิเสธคำขอเบิกนี้?')) return;
    try {
      await api.put(`/inventory/requisitions/${reqId}/reject`);
      loadReqs();
    } catch (err: any) {
      alert(err.response?.data?.message || 'เกิดข้อผิดพลาด');
    }
  };

  const statusBadge: Record<string, string> = {
    pending: 'badge-yellow',
    approved: 'badge-green',
    rejected: 'badge-red',
  };
  const statusLabel: Record<string, string> = { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ปฏิเสธ' };

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ArrowUpRight className="text-blue-600" size={26} />
            <span>เบิกจ่ายสินค้าจากคลัง (Stock Out)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            สแกนบาร์โค้ดหรือค้นหารายการสินค้าเพื่อเบิกจ่ายออกจากคลังสินค้าอย่างแม่นยำ
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Mobile / Desktop Camera Scan Button */}
          <button
            type="button"
            onClick={() => setShowScanner(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-all active:scale-95"
          >
            <Scan size={17} />
            <span>สแกนกล้องเพื่อเบิก</span>
          </button>

          {/* Mode Selector */}
          <div className="flex items-center gap-1.5 bg-slate-200/80 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setMode('direct')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                mode === 'direct' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Zap size={14} /> เบิกจ่ายทันที (ตัดสต็อกเลย)
            </button>
            <button
              onClick={() => setMode('request')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                mode === 'request' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText size={14} /> สร้างคำขอเบิก (รออนุมัติ)
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setTab('form')}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
            tab === 'form' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Plus size={16} /> ทำรายการเบิกสินค้า
        </button>
        <button
          onClick={() => { setTab('history'); loadReqs(); }}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
            tab === 'history' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ClipboardList size={16} /> ประวัติการเบิกจ่าย ({reqs.length})
        </button>
      </div>

      {/* Notification Banners */}
      {successMsg && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-800 font-medium flex items-center justify-between shadow-sm animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <Check size={20} className="text-green-600 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          {lastVoucher && (
            <button onClick={() => handlePrintVoucher()} className="btn-success btn-sm">
              <Printer size={14} /> พิมพ์ใบเบิกสินค้า
            </button>
          )}
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center justify-between shadow-sm animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="text-red-500 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')} className="text-red-400 hover:text-red-700">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Scanned Barcode Feedback Prompts */}
      {scanNotice && scanNotice.type === 'not_found' && (
        <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl text-amber-900 shadow-md animate-fadeIn flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={22} />
            <div>
              <p className="font-bold text-amber-950 text-sm sm:text-base flex items-center gap-2 flex-wrap">
                <span>กล้องสแกนสำเร็จ: รหัสบาร์โค้ด</span>
                <span className="font-mono bg-amber-200/90 px-2.5 py-0.5 rounded-md border border-amber-300 text-amber-950 font-bold">
                  {scanNotice.code}
                </span>
              </p>
              <p className="text-xs text-amber-800 mt-1">
                ⚠️ ยังไม่มีสินค้ารหัสนี้ในระบบคลังสินค้า กรุณาไปที่เมนู <b>"รับสินค้าเข้า"</b> เพื่อลงทะเบียนและรับสต็อกเข้าก่อนทำรายการเบิกจ่าย
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            <a
              href="/stock-in"
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs flex items-center gap-1.5 shadow-sm transition-all whitespace-nowrap"
            >
              <Package size={15} /> ไปหน้ารับเข้าสินค้า
            </a>
            <button
              onClick={() => setScanNotice(null)}
              className="px-3 py-2 rounded-xl bg-amber-200/70 hover:bg-amber-300 text-amber-900 text-xs font-semibold"
            >
              ปิด
            </button>
          </div>
        </div>
      )}

      {scanNotice && scanNotice.type === 'out_of_stock' && (
        <div className="p-4 bg-red-50 border-2 border-red-300 rounded-2xl text-red-900 shadow-md animate-fadeIn flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={22} />
            <div>
              <p className="font-bold text-red-950 text-sm sm:text-base flex items-center gap-2 flex-wrap">
                <span>กล้องสแกนสำเร็จ: {scanNotice.productName}</span>
                <span className="font-mono bg-red-100 px-2 py-0.5 rounded-md border border-red-200 text-red-700 text-xs">
                  ({scanNotice.code})
                </span>
              </p>
              <p className="text-xs text-red-800 mt-1">
                ❌ สินค้านี้มีสต็อกคงเหลือ <b>0 {scanNotice.unit || 'ชิ้น'}</b> ในคลัง ไม่สามารถเบิกจ่ายได้
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            <a
              href="/stock-in"
              className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-xs flex items-center gap-1.5 shadow-sm transition-all whitespace-nowrap"
            >
              <Package size={15} /> รับสต็อกเข้าเพิ่ม
            </a>
            <button
              onClick={() => setScanNotice(null)}
              className="px-3 py-2 rounded-xl bg-red-100 hover:bg-red-200 text-red-800 text-xs font-semibold"
            >
              ปิด
            </button>
          </div>
        </div>
      )}

      {scanNotice && scanNotice.type === 'success' && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-800 text-xs sm:text-sm shadow-sm flex items-center justify-between gap-2 animate-fadeIn">
          <div className="flex items-center gap-2">
            <Check className="text-emerald-600 flex-shrink-0" size={18} />
            <span>
              กล้องสแกนสำเร็จ: เพิ่ม <b>"{scanNotice.productName}"</b> ลงในรายการเบิกแล้ว (คงเหลือ {scanNotice.stock} {scanNotice.unit})
            </span>
          </div>
          <button onClick={() => setScanNotice(null)} className="text-emerald-600 hover:text-emerald-800">
            <X size={16} />
          </button>
        </div>
      )}

      {tab === 'form' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Left Column: Product Selection & Table */}
          <div className="xl:col-span-2 space-y-4">
            {/* Input & Barcode Scan Bar */}
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <Search size={16} className="text-blue-600" />
                  <span>ค้นหาหรือสแกนสินค้าเพื่อเบิก</span>
                </span>
                <button
                  onClick={() => setShowScanner(true)}
                  className="btn-primary btn-sm bg-blue-600 hover:bg-blue-700"
                >
                  <Scan size={14} /> เปิดกล้องสแกนบาร์โค้ด
                </button>
              </div>

              {/* Fast Barcode Reader Input + Search Input */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {/* Manual or Scanner Input */}
                <div className="relative">
                  <Scan className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" size={18} />
                  <input
                    className="input pl-11 font-mono text-sm"
                    placeholder="ยิงบาร์โค้ด หรือพิมพ์รหัสแล้ว Enter..."
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && barcodeInput) {
                        handleBarcode(barcodeInput);
                      }
                    }}
                  />
                </div>

                {/* Name / Keyword Search */}
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" size={18} />
                  <input
                    className="input pl-11 text-sm"
                    placeholder="ค้นหาชื่อสินค้า เช่น ซอง, เมล็ดพันธุ์..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      searchProduct(e.target.value);
                    }}
                  />

                  {/* Dropdown Search Results */}
                  {products.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-64 overflow-y-auto divide-y divide-slate-100">
                      {products.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => addProduct(p)}
                          className="px-3.5 py-2.5 hover:bg-blue-50/80 cursor-pointer text-sm flex items-center justify-between transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                              {p.image_url ? (
                                <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-[10px] font-mono text-slate-400">{p.barcode?.slice(-3)}</span>
                              )}
                            </div>
                            <div className="truncate">
                              <p className="font-semibold text-slate-800 text-xs truncate">{p.name}</p>
                              <p className="text-[11px] text-slate-400 font-mono">
                                รหัส: {p.barcode} | คงเหลือ: <span className="text-blue-600 font-semibold">{p.stock_qty}</span> {p.unit}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-md font-semibold flex-shrink-0">
                            + เลือกเบิก
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Pick Tags (เช่น ซองบรรจุ, เมล็ดพันธุ์) */}
              {quickPicks.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-1 text-xs text-slate-500 mb-1.5">
                    <Sparkles size={13} className="text-amber-500" />
                    <span>สินค้าแนะนำ/เบิกบ่อย (คลิกเพื่อเพิ่มด่วน):</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {quickPicks.map((qp) => (
                      <button
                        key={qp.id}
                        type="button"
                        onClick={() => addProduct(qp, 50)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 hover:border-blue-300 rounded-lg text-xs transition-colors flex items-center gap-1 text-slate-700"
                        title={`คงเหลือ ${qp.stock_qty} ${qp.unit}`}
                      >
                        <span>{qp.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({qp.stock_qty} {qp.unit})</span>
                        <span className="text-blue-600 font-bold ml-0.5">+50</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Selected Items for Withdrawal Table */}
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
                  <ClipboardList size={18} className="text-blue-600" />
                  <span>รายการสินค้าที่ต้องการเบิก ({items.length} รายการ)</span>
                </div>
                {items.length > 0 && (
                  <button
                    onClick={() => setItems([])}
                    className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                  >
                    ล้างรายการทั้งหมด
                  </button>
                )}
              </div>

              {items.length > 0 ? (
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>สินค้า</th>
                        <th className="text-center w-28">คงเหลือในคลัง</th>
                        <th className="text-center w-52">จำนวนที่เบิก</th>
                        <th className="text-center w-28">คงเหลือหลังเบิก</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => {
                        const remaining = item.stock_qty - item.qty;
                        const isOver = remaining < 0;

                        return (
                          <tr key={item.product_id} className={isOver ? 'bg-red-50/70' : ''}>
                            {/* Product Info */}
                            <td>
                              <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                                  {item.image_url ? (
                                    <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-[10px] font-mono text-slate-400">{item.barcode?.slice(-3)}</span>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-semibold text-slate-800 text-sm truncate">{item.name}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-xs text-slate-400 font-mono">{item.barcode}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setLabelModalData({
                                          docNo: 'DISBURSE',
                                          docType: 'DIS',
                                          title: `พิมพ์สติกเกอร์: ${item.name}`,
                                          items: [{ ...item, product_name: item.name }],
                                        });
                                        setShowLabelModal(true);
                                      }}
                                      className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded font-medium"
                                      title="พิมพ์สติกเกอร์สินค้าชิ้นนี้"
                                    >
                                      <Tag size={10} />
                                      ป้าย ({item.qty} ดวง)
                                    </button>
                                  </div>
                                  <div className="mt-1">
                                    <BarcodeView value={item.barcode} height={16} width={0.9} displayValue={false} />
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Current Stock */}
                            <td className="text-center">
                              <span className="font-semibold text-slate-700 text-sm">{fmt(item.stock_qty)}</span>
                              <span className="text-xs text-slate-400 ml-1">{item.unit}</span>
                            </td>

                            {/* Withdrawal Quantity with Fast Buttons */}
                            <td className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => updateItemQty(idx, item.qty - 1)}
                                  className="w-7 h-7 rounded border border-slate-300 hover:bg-slate-100 flex items-center justify-center text-slate-600"
                                >
                                  <Minus size={12} />
                                </button>
                                <input
                                  type="number"
                                  min="1"
                                  max={item.stock_qty}
                                  className="input text-center w-16 font-bold text-sm py-1 px-1 text-blue-600"
                                  value={item.qty}
                                  onChange={(e) => updateItemQty(idx, parseInt(e.target.value) || 1)}
                                />
                                <button
                                  type="button"
                                  onClick={() => updateItemQty(idx, item.qty + 1)}
                                  className="w-7 h-7 rounded border border-slate-300 hover:bg-slate-100 flex items-center justify-center text-slate-600"
                                >
                                  <Plus size={12} />
                                </button>
                              </div>

                              {/* Quick +10, +50 buttons */}
                              <div className="flex items-center justify-center gap-1 mt-1">
                                <button
                                  type="button"
                                  onClick={() => updateItemQty(idx, item.qty + 10)}
                                  className="text-[10px] bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded text-slate-600 font-semibold"
                                >
                                  +10
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateItemQty(idx, item.qty + 50)}
                                  className="text-[10px] bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded text-blue-700 font-semibold"
                                >
                                  +50
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateItemQty(idx, 50)}
                                  className="text-[10px] bg-amber-50 hover:bg-amber-100 px-1.5 py-0.5 rounded text-amber-700 font-semibold"
                                >
                                  เซ็ต 50
                                </button>
                              </div>
                            </td>

                            {/* Remaining Stock */}
                            <td className="text-center">
                              <span
                                className={`font-bold text-sm ${
                                  isOver ? 'text-red-600' : remaining <= 10 ? 'text-orange-600' : 'text-green-600'
                                }`}
                              >
                                {fmt(remaining)}
                              </span>
                              <span className="text-xs text-slate-400 ml-1">{item.unit}</span>
                            </td>

                            {/* Delete Button */}
                            <td>
                              <button
                                onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                                className="text-slate-400 hover:text-red-600 p-1 transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-10 text-slate-400 bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
                  <ClipboardList size={40} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-sm font-semibold text-slate-600">ยังไม่มีรายการสินค้าที่เลือก</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    สแกนบาร์โค้ด หรือค้นหาชื่อสินค้า เช่น "ซองบรรจุ 50 ซอง" หรือ "เมล็ดพันธุ์ 3 กรัม"
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Requisition Details & Confirmation */}
          <div className="space-y-4">
            <div className="card space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="font-bold text-slate-800 text-sm">ข้อมูลการเบิกจ่าย</span>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                    mode === 'direct' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {mode === 'direct' ? '⚡ เบิกจ่ายตัดสต็อกทันที' : '📋 ขออนุมัติเบิก'}
                </span>
              </div>

              {/* Purpose / Reason */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  วัตถุประสงค์การเบิก *
                </label>
                <select
                  className="input text-sm"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                >
                  <option value="เบิกเพื่อบรรจุสินค้า">เบิกเพื่อบรรจุสินค้า (Packaging)</option>
                  <option value="เบิกเพื่อเพาะปลูก/ทดลอง">เบิกเพื่อเพาะปลูก / ทดลอง</option>
                  <option value="เบิกเติมสินค้าหน้าร้าน (POS)">เบิกเติมสินค้าหน้าร้าน (POS Refill)</option>
                  <option value="เบิกใช้ภายในแผนก">เบิกใช้ภายในแผนก</option>
                  <option value="สินค้าชำรุด/สูญหาย/หมดอายุ">สินค้าชำรุด / สูญหาย / หมดอายุ</option>
                  <option value="อื่นๆ">อื่นๆ (ระบุเอง)</option>
                </select>

                {reason === 'อื่นๆ' && (
                  <input
                    className="input text-sm mt-2"
                    placeholder="ระบุเหตุผลการเบิก..."
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                  />
                )}
              </div>

              {/* Recipient Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ชื่อผู้รับสินค้า / ผู้เบิก
                </label>
                <input
                  className="input text-sm"
                  placeholder="เช่น นายสมชาย, น.ส.ใจดี"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                />
              </div>

              {/* Department */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  แผนก / ตำแหน่ง
                </label>
                <input
                  className="input text-sm"
                  placeholder="เช่น ฝ่ายบรรจุ, แปลงเพาะชำ, หน้าร้าน"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                />
              </div>

              {/* Additional Note */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  หมายเหตุเพิ่มเติม
                </label>
                <textarea
                  className="input text-sm h-18 resize-none"
                  placeholder="บันทึกรายละเอียดเพิ่มเติม เช่น ล็อตการผลิต หรือวัตถุประสงค์เฉพาะ..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              {/* Summary Counter */}
              <div className="p-3 bg-slate-50 rounded-xl space-y-1 text-xs text-slate-600 border border-slate-200">
                <div className="flex justify-between">
                  <span>จำนวนรายการที่เบิก:</span>
                  <span className="font-bold text-slate-800">{items.length} รายการ</span>
                </div>
                <div className="flex justify-between">
                  <span>จำนวนชิ้นรวมทั้งหมด:</span>
                  <span className="font-bold text-blue-600 text-sm">
                    {items.reduce((sum, i) => sum + i.qty, 0)} ชิ้น
                  </span>
                </div>
              </div>

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={items.length === 0 || saving}
                className={`w-full py-3.5 text-base font-bold shadow-md flex items-center justify-center gap-2 ${
                  mode === 'direct' ? 'btn-success' : 'btn-primary'
                }`}
              >
                {saving ? (
                  <span>กำลังบันทึก...</span>
                ) : mode === 'direct' ? (
                  <>
                    <Zap size={18} />
                    <span>ยืนยันเบิกจ่ายสินค้า (ตัดสต็อกทันที)</span>
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    <span>ส่งคำขอเบิกสินค้า</span>
                  </>
                )}
              </button>

              {/* Print Labels Button */}
              <button
                type="button"
                onClick={() => {
                  setLabelModalData({
                    docNo: mode === 'direct' ? 'DISBURSE' : 'REQUISITION',
                    docType: 'DIS',
                    title: 'พิมพ์สติกเกอร์ Barcode & QR สินค้าที่เบิก',
                    items: items.map((i) => ({ ...i, product_name: i.name })),
                  });
                  setShowLabelModal(true);
                }}
                disabled={items.length === 0}
                className="w-full py-2.5 px-3 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-40 shadow-sm active:scale-95"
              >
                <Tag size={15} className="text-blue-600" />
                พิมพ์สติกเกอร์ Barcode / QR สินค้าที่เบิก ({items.length} รายการ)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Tab */}
      {tab === 'history' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-slate-700">รายการประวัติการเบิกจ่าย ({reqs.length})</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClearAllReqHistory}
                className="text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200 font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
                title="ล้างประวัติการเบิกจ่ายทั้งหมด"
              >
                <Trash2 size={14} className="text-rose-500" />
                <span>เคลียร์ประวัติเบิกจ่าย</span>
              </button>
              <button
                type="button"
                onClick={loadReqs}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-blue-50 transition-colors cursor-pointer"
              >
                <RefreshCw size={13} /> รีเฟรช
              </button>
            </div>
          </div>

          {reqs.length === 0 ? (
            <div className="card text-center py-12 text-slate-400">
              <ClipboardList size={40} className="mx-auto text-slate-300 mb-2" />
              <p>ยังไม่มีประวัติการเบิกสินค้า</p>
            </div>
          ) : (
            reqs.map((req) => (
              <div key={req.id} className="card hover:shadow-md transition-shadow">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-800 text-base">{req.req_no}</span>
                      <span className={statusBadge[req.status]}>{statusLabel[req.status]}</span>
                      {req.req_no?.startsWith('DIS') && (
                        <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">
                          เบิกจ่ายทันที
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      ผู้ทำรายการ: <span className="font-medium text-slate-700">{req.user_name}</span> | วันที่:{' '}
                      {new Date(req.created_at).toLocaleString('th-TH')}
                    </p>
                    {req.reason && (
                      <p className="text-sm text-slate-700 bg-slate-50 px-2.5 py-1 rounded-lg inline-block">
                        วัตถุประสงค์: <span className="font-medium">{req.reason}</span>
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleViewVoucher(req.id)}
                      disabled={loadingVoucherId === req.id}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm transition-all active:scale-95 disabled:opacity-50"
                    >
                      {loadingVoucherId === req.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <FileText size={13} className="text-blue-600" />
                      )}
                      ดูใบเบิก & โค้ด
                    </button>

                    {req.status === 'pending' && user?.role === 'admin' && (
                      <>
                        <button onClick={() => setApproving(req)} className="btn-success btn-sm">
                          <Check size={14} /> อนุมัติการเบิก
                        </button>
                        <button onClick={() => handleReject(req.id)} className="btn-danger btn-sm">
                          <X size={14} /> ปฏิเสธ
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDeleteReq(req.id, req.req_no)}
                      className="p-1.5 rounded-xl border border-slate-200 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="ลบรายการเบิกนี้"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}


      {/* Approve Modal */}
      {approving && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 animate-scaleIn">
            <h3 className="text-lg font-bold text-slate-800">ยืนยันการอนุมัติเบิกสินค้า</h3>
            <p className="text-sm text-slate-600">
              เลขที่คำขอ: <span className="font-mono font-bold text-blue-600">{approving.req_no}</span>
            </p>
            <p className="text-xs text-slate-500">
              เมื่ออนุมัติ ระบบจะตัดสต็อกสินค้าในคลังตามจำนวนที่ขอโดยอัตโนมัติทันที
            </p>
            <div className="flex gap-2.5 pt-2">
              <button onClick={() => setApproving(null)} className="btn-secondary flex-1">
                ยกเลิก
              </button>
              <button onClick={() => handleApprove(approving)} className="btn-success flex-1 font-semibold">
                <Check size={16} /> ยืนยันอนุมัติ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Voucher Modal (On-Screen Interactive Modal) */}
      {(viewingVoucher || lastVoucher) && (() => {
        const activeVoucher = viewingVoucher || lastVoucher;
        const closeVoucherModal = () => {
          setViewingVoucher(null);
          setLastVoucher(null);
        };

        return (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 md:p-6 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl max-h-[92vh] flex flex-col border border-slate-100 overflow-hidden">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h2 className="text-base md:text-lg font-bold text-slate-800 flex items-center gap-2">
                      <span>ใบเบิกจ่ายสินค้า:</span>
                      <span className="font-mono text-blue-600">{activeVoucher.req_no}</span>
                    </h2>
                    <p className="text-xs text-slate-500">
                      ผู้ทำรายการ: {activeVoucher.user_name || user?.name} | วันที่: {new Date(activeVoucher.created_at || Date.now()).toLocaleString('th-TH')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeVoucherModal}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-200/60 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-5 overflow-y-auto flex-1">
                {/* Document Barcode & QR Code Section */}
                <div className="bg-gradient-to-br from-slate-50 to-blue-50/40 p-4 rounded-2xl border border-blue-100 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
                  <div className="space-y-1 text-center sm:text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider bg-blue-100/70 px-2 py-0.5 rounded-full">
                        รหัสใบเบิกสินค้า (Voucher Barcode & QR)
                      </span>
                      <span className={statusBadge[activeVoucher.status] || 'badge-blue'}>
                        {statusLabel[activeVoucher.status] || activeVoucher.status}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-slate-800 font-mono mt-1">{activeVoucher.req_no}</p>
                    {activeVoucher.reason && (
                      <p className="text-xs text-slate-600">วัตถุประสงค์: <strong>{activeVoucher.reason}</strong></p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex-shrink-0">
                    <div className="text-center">
                      <BarcodeView value={activeVoucher.req_no} width={1.4} height={36} fontSize={10} />
                    </div>
                    <div className="w-px h-12 bg-slate-200" />
                    <div className="flex flex-col items-center">
                      <QRCodeView value={activeVoucher.req_no} size={54} margin={1} />
                      <span className="text-[9px] font-mono text-slate-400 mt-0.5">SCAN REQ</span>
                    </div>
                  </div>
                </div>

                {/* Actions Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="text-xs font-bold text-slate-700">
                    รายการสินค้าที่เบิก ({activeVoucher.items?.length || 0} รายการ)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setLabelModalData({
                          docNo: activeVoucher.req_no,
                          docType: 'DIS',
                          title: `พิมพ์สติกเกอร์สินค้าใบเบิก: ${activeVoucher.req_no}`,
                          items: (activeVoucher.items || []).map((i: any) => ({
                            ...i,
                            name: i.product_name,
                            qty: i.qty_approved || i.qty_requested || i.qty || 1,
                          })),
                        });
                        setShowLabelModal(true);
                      }}
                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95"
                    >
                      <Tag size={14} />
                      พิมพ์สติกเกอร์ Barcode & QR สำหรับของที่เบิก
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePrintVoucher()}
                      className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
                    >
                      <Printer size={14} />
                      พิมพ์ใบเบิกสินค้า (Voucher)
                    </button>
                  </div>
                </div>

                {/* Items Table */}
                <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-sm">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs text-slate-600 uppercase border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5 text-center w-12">ลำดับ</th>
                        <th className="px-4 py-2.5">ชื่อสินค้า / บาร์โค้ด</th>
                        <th className="px-4 py-2.5 text-center">จำนวนที่เบิก</th>
                        <th className="px-4 py-2.5 text-center w-20">หน่วย</th>
                        <th className="px-4 py-2.5 text-center w-24">ป้ายสติกเกอร์</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeVoucher.items?.map((item: any, idx: number) => {
                        const qty = item.qty_approved || item.qty_requested || item.qty || 1;
                        return (
                          <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                            <td className="px-4 py-2.5 text-center text-xs text-slate-400">{idx + 1}</td>
                            <td className="px-4 py-2.5">
                              <p className="font-semibold text-slate-800 text-sm">{item.product_name || item.name}</p>
                              <p className="text-xs font-mono text-slate-400 mt-0.5">{item.barcode}</p>
                              {item.barcode && (
                                <div className="mt-1">
                                  <BarcodeView value={item.barcode} height={16} width={0.9} displayValue={false} />
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-center font-bold text-slate-800 text-sm">
                              {fmt(qty)}
                            </td>
                            <td className="px-4 py-2.5 text-center text-xs text-slate-600">
                              {item.unit || 'ชิ้น'}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setLabelModalData({
                                    docNo: activeVoucher.req_no,
                                    docType: 'DIS',
                                    title: `พิมพ์สติกเกอร์: ${item.product_name || item.name}`,
                                    items: [{
                                      ...item,
                                      name: item.product_name || item.name,
                                      qty,
                                    }],
                                  });
                                  setShowLabelModal(true);
                                }}
                                className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors inline-flex items-center gap-1 text-xs font-semibold"
                                title="พิมพ์สติกเกอร์สำหรับสินค้านี้"
                              >
                                <Tag size={13} />
                                <span>พิมพ์ป้าย</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Printable Stock Disbursement Voucher (hidden off-screen for useReactToPrint) */}
      {(viewingVoucher || lastVoucher) && (() => {
        const activeVoucher = viewingVoucher || lastVoucher;
        return (
          <div className="hidden">
            <div ref={voucherPrintRef} className="p-8 w-[190mm] font-sans text-slate-800 text-xs">
              <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4 mb-5">
                <div>
                  <h1 className="text-xl font-bold uppercase tracking-wider text-slate-900">
                    ใบเบิกจ่ายสินค้าจากคลัง (STOCK OUT VOUCHER)
                  </h1>
                  <p className="text-xs text-slate-600 mt-1">ระบบบริหารจัดการคลังสินค้าและจุดจำหน่าย (POS & Warehouse)</p>
                  <div className="mt-2 text-xs space-y-0.5">
                    <p><strong>เลขที่เอกสาร:</strong> <span className="font-mono">{activeVoucher.req_no}</span></p>
                    <p><strong>วันที่/เวลา:</strong> {new Date(activeVoucher.created_at || Date.now()).toLocaleString('th-TH')}</p>
                    <p><strong>วัตถุประสงค์:</strong> {activeVoucher.reason || 'เบิกสินค้า'}</p>
                    <p><strong>ผู้ทำรายการ:</strong> {activeVoucher.user_name || user?.name}</p>
                    <p><strong>สถานะ:</strong> {activeVoucher.status === 'approved' ? 'อนุมัติแล้ว (ตัดสต็อกแล้ว)' : 'รออนุมัติ'}</p>
                  </div>
                </div>

                {/* Barcode & QR Code on Voucher Header */}
                <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-300 text-center">
                  <div>
                    <BarcodeView value={activeVoucher.req_no} width={1.3} height={32} fontSize={9} />
                  </div>
                  <div className="flex flex-col items-center">
                    <QRCodeView value={activeVoucher.req_no} size={50} margin={0} />
                    <span className="text-[8px] font-mono text-slate-500 mt-0.5">{activeVoucher.req_no}</span>
                  </div>
                </div>
              </div>

              <table className="w-full border-collapse border border-slate-300 text-xs mb-6">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 p-2 text-center w-12">ลำดับ</th>
                    <th className="border border-slate-300 p-2 text-left">รหัสบาร์โค้ด</th>
                    <th className="border border-slate-300 p-2 text-left">รายการสินค้า</th>
                    <th className="border border-slate-300 p-2 text-center w-24">จำนวนที่เบิก</th>
                    <th className="border border-slate-300 p-2 text-center w-20">หน่วยนับ</th>
                  </tr>
                </thead>
                <tbody>
                  {activeVoucher.items?.map((item: any, idx: number) => {
                    const qty = item.qty_approved || item.qty_requested || item.qty || 1;
                    return (
                      <tr key={idx}>
                        <td className="border border-slate-300 p-2 text-center">{idx + 1}</td>
                        <td className="border border-slate-300 p-2 font-mono">
                          {item.barcode || '-'}
                          {item.barcode && (
                            <div className="mt-0.5">
                              <BarcodeView value={item.barcode} height={14} width={0.9} displayValue={false} />
                            </div>
                          )}
                        </td>
                        <td className="border border-slate-300 p-2 font-semibold">{item.product_name || item.name}</td>
                        <td className="border border-slate-300 p-2 text-center font-bold text-sm">
                          {fmt(qty)}
                        </td>
                        <td className="border border-slate-300 p-2 text-center">{item.unit || 'ชิ้น'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="grid grid-cols-3 gap-8 mt-12 text-center text-xs">
                <div>
                  <p className="border-b border-slate-400 pb-8"></p>
                  <p className="mt-2 font-medium">ผู้ขอเบิกสินค้า</p>
                  <p className="text-[10px] text-slate-400">วันที่: ____/____/________</p>
                </div>
                <div>
                  <p className="border-b border-slate-400 pb-8"></p>
                  <p className="mt-2 font-medium">ผู้จ่ายของ (คลังสินค้า)</p>
                  <p className="text-[10px] text-slate-400">วันที่: ____/____/________</p>
                </div>
                <div>
                  <p className="border-b border-slate-400 pb-8"></p>
                  <p className="mt-2 font-medium">ผู้อนุมัติ / ผู้รับสินค้า</p>
                  <p className="text-[10px] text-slate-400">วันที่: ____/____/________</p>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Barcode & QR Label Printing Modal */}
      {showLabelModal && labelModalData && (
        <BarcodeLabelModal
          title={labelModalData.title}
          docNo={labelModalData.docNo}
          docType={labelModalData.docType}
          items={labelModalData.items}
          onClose={() => {
            setShowLabelModal(false);
            setLabelModalData(null);
          }}
        />
      )}

      {/* Camera Barcode & QR Scanner Modal (Continuous Scan Enabled) */}
      {showScanner && (
        <BarcodeScanner
          continuous={true}
          onScan={(code) => {
            handleBarcode(code);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
