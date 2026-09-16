import { useState, useEffect } from 'react';
import api from '../api/client';
import { useRealtimeEvent } from '../utils/socket';
import {
  Search, Calendar, Filter, Printer,
  RefreshCw, X, Receipt, FileSpreadsheet, FileJson,
  ChevronLeft, ChevronRight, Clock, Trash2, AlertTriangle,
  CheckCircle2, AlertCircle
} from 'lucide-react';
import ReceiptModal, { type ReceiptSale } from './ReceiptModal';

interface SalesHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const fmt = (n?: number) => (n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SalesHistoryModal({ isOpen, onClose }: SalesHistoryModalProps) {
  const [sales, setSales] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [datePreset, setDatePreset] = useState<'today' | 'yesterday' | '7days' | 'month' | 'all'>('today');
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState('all');

  // Selected sale for receipt preview / reprint
  const [selectedReceiptSale, setSelectedReceiptSale] = useState<ReceiptSale | null>(null);
  const [isReprintModalOpen, setIsReprintModalOpen] = useState(false);
  const [loadingSaleId, setLoadingSaleId] = useState<number | null>(null);

  // Delete single sale state
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [restoreStockOnDelete, setRestoreStockOnDelete] = useState(true);
  const [deleting, setDeleting] = useState(false);

  // Clear sales history state
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearScope, setClearScope] = useState<'range' | 'all'>('range');
  const [restoreStockOnClear, setRestoreStockOnClear] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);

  // Feedback Toast
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Calculate Date Preset Range
  const applyPreset = (preset: 'today' | 'yesterday' | '7days' | 'month' | 'all') => {
    setDatePreset(preset);
    setPage(1);
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (preset === 'today') {
      setFrom(todayStr);
      setTo(todayStr);
    } else if (preset === 'yesterday') {
      const y = new Date();
      y.setDate(now.getDate() - 1);
      const yStr = y.toISOString().slice(0, 10);
      setFrom(yStr);
      setTo(yStr);
    } else if (preset === '7days') {
      const d7 = new Date();
      d7.setDate(now.getDate() - 6);
      setFrom(d7.toISOString().slice(0, 10));
      setTo(todayStr);
    } else if (preset === 'month') {
      const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
      setFrom(mStart.toISOString().slice(0, 10));
      setTo(todayStr);
    } else if (preset === 'all') {
      setFrom('');
      setTo('');
    }
  };

  const loadSales = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/sales', {
        params: {
          from: from || undefined,
          to: to || undefined,
          search: search.trim() || undefined,
          payment_method: paymentMethod !== 'all' ? paymentMethod : undefined,
          page,
          limit,
        },
      });
      setSales(data.sales || []);
      setTotalCount(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error('Failed to load sales history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSales();
    }
  }, [isOpen, page, from, to, paymentMethod]);

  // Real-time listener: refresh sales history when a new sale happens anywhere
  useRealtimeEvent('sale:created', () => {
    if (isOpen) loadSales();
  });
  useRealtimeEvent('sale:deleted', () => {
    if (isOpen) loadSales();
  });
  useRealtimeEvent('sales:cleared', () => {
    if (isOpen) loadSales();
  });

  const handleDeleteSale = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      const res = await api.delete(`/sales/${deleteTarget.id}`, {
        params: { restore_stock: restoreStockOnDelete },
      });
      setFeedback({ type: 'success', message: res.data?.message || `ลบรายการบิลขาย ${deleteTarget.sale_no} สำเร็จ` });
      setDeleteTarget(null);
      await loadSales();
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.response?.data?.message || err.message || 'เกิดข้อผิดพลาดในการลบรายการ' });
    } finally {
      setDeleting(false);
    }
  };

  const handleClearHistory = async () => {
    try {
      setClearing(true);
      const res = await api.post('/sales/clear', {
        clear_all: clearScope === 'all',
        from: clearScope === 'range' ? from : undefined,
        to: clearScope === 'range' ? to : undefined,
        restore_stock: restoreStockOnClear,
      });
      setFeedback({ type: 'success', message: res.data?.message || 'เคลียร์ประวัติยอดขายเรียบร้อยแล้ว' });
      setShowClearModal(false);
      setClearConfirmText('');
      await loadSales();
      setTimeout(() => setFeedback(null), 5000);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.response?.data?.message || err.message || 'เกิดข้อผิดพลาดในการเคลียร์ประวัติ' });
    } finally {
      setClearing(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadSales();
  };

  // Open Receipt for viewing and reprinting
  const handleOpenReceipt = async (saleId: number) => {
    try {
      setLoadingSaleId(saleId);
      const { data } = await api.get(`/sales/${saleId}`);
      setSelectedReceiptSale(data);
      setIsReprintModalOpen(true);
    } catch (err) {
      alert('ไม่สามารถโหลดรายละเอียดใบเสร็จได้');
    } finally {
      setLoadingSaleId(null);
    }
  };

  // Export / Backup data to Excel or JSON
  const handleExport = async (format: 'excel' | 'json') => {
    try {
      setExporting(true);
      const res = await api.get('/sales/export', {
        params: {
          from: from || undefined,
          to: to || undefined,
          search: search.trim() || undefined,
          payment_method: paymentMethod !== 'all' ? paymentMethod : undefined,
          format,
        },
        responseType: 'blob',
      });

      const blob = new Blob([res.data], {
        type: format === 'excel'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/json',
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `sales-backup-${from || 'all'}-to-${to || 'today'}.${format === 'excel' ? 'xlsx' : 'json'}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('เกิดข้อผิดพลาดในการส่งออกสำรองข้อมูล: ' + (err.message || ''));
    } finally {
      setExporting(false);
    }
  };

  if (!isOpen) return null;

  // Calculate sum for current page
  const pageTotalRevenue = sales.reduce((acc, s) => acc + (s.total || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150 backdrop-blur-xs">
      <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] border border-slate-200">
        {/* Header Bar */}
        <div className="px-5 py-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-blue-400">
              <Receipt size={20} />
            </div>
            <div>
              <h2 className="font-bold text-base leading-tight">ประวัติบิลขาย & พิมพ์ใบเสร็จย้อนหลัง</h2>
              <p className="text-xs text-slate-400">ค้นหาบิลย้อนหลัง พิมพ์สำเนาใบเสร็จ และสำรองข้อมูลการขาย</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Backup to Excel */}
            <button
              onClick={() => handleExport('excel')}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
              title="ดาวน์โหลดไฟล์สรุปบิลขายและรายละเอียดสินค้าเป็น Excel"
            >
              <FileSpreadsheet size={15} />
              <span>{exporting ? 'กำลังส่งออก...' : 'สำรองข้อมูล (Excel)'}</span>
            </button>

            {/* Backup to JSON */}
            <button
              onClick={() => handleExport('json')}
              disabled={exporting}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium transition-all disabled:opacity-50"
              title="ดาวน์โหลดไฟล์สำรองข้อมูล JSON แบบละเอียด"
            >
              <FileJson size={15} />
              <span>JSON</span>
            </button>

            {/* Clear Sales History */}
            <button
              onClick={() => {
                setShowClearModal(true);
                setClearConfirmText('');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 hover:text-white border border-red-500/30 text-xs font-semibold shadow-sm transition-all"
              title="เคลียร์ประวัติยอดขาย"
            >
              <Trash2 size={14} />
              <span>เคลียร์ประวัติ</span>
            </button>

            {/* Refresh */}
            <button
              onClick={loadSales}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
              title="รีเฟรชข้อมูล"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin text-blue-400' : ''} />
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3 flex-shrink-0">
          {/* Top filter row: Presets & Search */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Date Presets */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              <span className="text-xs text-slate-500 font-medium mr-1 flex items-center gap-1">
                <Calendar size={13} /> ช่วงเวลา:
              </span>
              {[
                { id: 'today', label: 'วันนี้' },
                { id: 'yesterday', label: 'เมื่อวาน' },
                { id: '7days', label: '7 วันล่าสุด' },
                { id: 'month', label: 'เดือนนี้' },
                { id: 'all', label: 'ทั้งหมด' },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    datePreset === p.id
                      ? 'bg-blue-600 text-white shadow-xs font-bold'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Search form */}
            <form onSubmit={handleSearchSubmit} className="flex-1 sm:max-w-xs flex gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                <input
                  type="text"
                  placeholder="ค้นหาเลขบิล, ชื่อแคชเชียร์..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => { setSearch(''); setPage(1); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <button
                type="submit"
                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                ค้นหา
              </button>
            </form>
          </div>

          {/* Secondary filter row: Custom Date Range & Payment Method */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-200/60 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-500">ตั้งแต่วันที่:</span>
              <input
                type="date"
                value={from}
                onChange={(e) => { setFrom(e.target.value); setDatePreset('all'); setPage(1); }}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded-md text-xs font-mono"
              />
              <span className="text-slate-500">ถึง:</span>
              <input
                type="date"
                value={to}
                onChange={(e) => { setTo(e.target.value); setDatePreset('all'); setPage(1); }}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded-md text-xs font-mono"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-500 flex items-center gap-1">
                <Filter size={13} /> ชำระโดย:
              </span>
              <select
                value={paymentMethod}
                onChange={(e) => { setPaymentMethod(e.target.value); setPage(1); }}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded-md text-xs"
              >
                <option value="all">ทั้งหมดทุกช่องทาง</option>
                <option value="cash">💵 เงินสด (Cash)</option>
                <option value="promptpay">📱 พร้อมเพย์/โอน (PromptPay)</option>
                <option value="credit">💳 บัตรเครดิต (Credit Card)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Mini KPI Bar */}
        <div className="px-5 py-2.5 bg-blue-50/70 border-b border-blue-100 flex items-center justify-between text-xs text-blue-900 font-medium flex-shrink-0">
          <div>
            พบข้อมูลทั้งหมด: <span className="font-bold text-blue-700">{totalCount.toLocaleString()}</span> บิล
          </div>
          <div className="flex items-center gap-4">
            <div>
              ยอดขายหน้านี้: <span className="font-bold text-emerald-600 font-mono">฿{fmt(pageTotalRevenue)}</span>
            </div>
            <div className="text-slate-400">|</div>
            <div>
              หน้า <span className="font-bold text-blue-700">{page}</span> จาก {totalPages}
            </div>
          </div>
        </div>

        {/* Sales Table Area */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <RefreshCw className="animate-spin text-blue-600 mx-auto" size={28} />
              <p className="text-xs text-slate-500 font-medium">กำลังค้นหาข้อมูลบิลขาย...</p>
            </div>
          ) : sales.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <Receipt className="text-slate-300 mx-auto" size={42} />
              <p className="text-sm font-semibold text-slate-700">ไม่พบรายการบิลขาย</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                ลองปรับเปลี่ยนช่วงเวลาวันที่ หรือคำค้นหาเลขที่บิลใหม่อีกครั้ง
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100/90 text-slate-600 uppercase font-semibold border-b border-slate-200 sticky top-0 z-10 backdrop-blur-xs">
                  <tr>
                    <th className="px-4 py-3">เลขที่บิล</th>
                    <th className="px-4 py-3">วันที่ - เวลา</th>
                    <th className="px-4 py-3">แคชเชียร์</th>
                    <th className="px-4 py-3 text-center">รายการ</th>
                    <th className="px-4 py-3">ช่องทางชำระ</th>
                    <th className="px-4 py-3 text-right">ยอดสุทธิ</th>
                    <th className="px-4 py-3 text-center">การกระทำ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-blue-700">
                        {sale.sale_no}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Clock size={12} className="text-slate-400" />
                          <span>{new Date(sale.created_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })}</span>
                          <span className="font-mono text-slate-400">{new Date(sale.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-medium">
                        {sale.cashier_name || 'Cashier'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                          {sale.items_count || 1} ชิ้น
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                          sale.payment_method === 'cash' ? 'bg-emerald-100 text-emerald-700' :
                          sale.payment_method === 'promptpay' ? 'bg-blue-100 text-blue-700' :
                          'bg-purple-100 text-purple-700'
                        }`}>
                          {sale.payment_method === 'cash' ? '💵 เงินสด' :
                           sale.payment_method === 'promptpay' ? '📱 พร้อมเพย์' : '💳 บัตรเครดิต'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 text-sm">
                        ฿{fmt(sale.total)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenReceipt(sale.id)}
                            disabled={loadingSaleId === sale.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-xs transition-all active:scale-95 disabled:opacity-50"
                          >
                            {loadingSaleId === sale.id ? (
                              <RefreshCw size={13} className="animate-spin" />
                            ) : (
                              <Printer size={13} />
                            )}
                            <span>ดูบิล / พิมพ์ซ้ำ</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteTarget(sale);
                              setRestoreStockOnDelete(true);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-medium text-xs border border-red-200 transition-all active:scale-95"
                            title="ลบรายการบิลขายนี้"
                          >
                            <Trash2 size={13} />
                            <span>ลบ</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Pagination */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-shrink-0 text-xs">
          <div className="text-slate-500">
            แสดงรายการที่ {(page - 1) * limit + (sales.length > 0 ? 1 : 0)} ถึง {(page - 1) * limit + sales.length} จาก {totalCount} รายการ
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="หน้าก่อนหน้า"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 py-1 bg-white border border-slate-300 rounded-lg font-mono font-semibold text-slate-700">
              {page} / {totalPages || 1}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="หน้าถัดไป"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Embedded Reprint / Receipt Modal */}
      {isReprintModalOpen && selectedReceiptSale && (
        <ReceiptModal
          sale={selectedReceiptSale}
          isReprint={true}
          onClose={() => {
            setIsReprintModalOpen(false);
            setSelectedReceiptSale(null);
          }}
        />
      )}

      {/* Feedback Toast */}
      {feedback && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border animate-fadeIn transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle size={20} className="text-red-600 shrink-0" />
          )}
          <span className="text-sm font-medium">{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-600 ml-2">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Delete Single Sale Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center gap-3 text-red-600 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">ยืนยันการลบรายการขาย</h3>
                  <p className="text-xs text-slate-500">เลขที่บิล: <span className="font-mono font-bold text-blue-600">{deleteTarget.sale_no}</span></p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 text-xs space-y-2 mb-4">
                <div className="flex justify-between">
                  <span className="text-slate-500">วันที่-เวลา:</span>
                  <span className="font-medium text-slate-800">{new Date(deleteTarget.created_at).toLocaleString('th-TH')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">แคชเชียร์:</span>
                  <span className="font-medium text-slate-800">{deleteTarget.cashier_name || deleteTarget.cashier || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">ช่องทางชำระเงิน:</span>
                  <span className="font-medium text-slate-800">{deleteTarget.payment_method}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-sm">
                  <span className="font-semibold text-slate-700">ยอดรวมทั้งสิ้น:</span>
                  <span className="font-mono font-bold text-red-600 text-base">฿{fmt(deleteTarget.total)}</span>
                </div>
              </div>

              <label className="flex items-start gap-3 p-3 bg-blue-50/60 border border-blue-100 rounded-xl cursor-pointer hover:bg-blue-50 transition-colors mb-5">
                <input
                  type="checkbox"
                  checked={restoreStockOnDelete}
                  onChange={(e) => setRestoreStockOnDelete(e.target.checked)}
                  className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <div className="text-xs">
                  <p className="font-bold text-blue-900">คืนสต็อกสินค้ากลับเข้าระบบ (แนะนำ)</p>
                  <p className="text-blue-600/80 mt-0.5">บวกจำนวนสินค้าที่เคยตัดขายในบิลนี้กลับเข้าคลังสินค้าอัตโนมัติ</p>
                </div>
              </label>

              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDeleteSale}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Trash2 size={14} />
                  <span>{deleting ? 'กำลังลบ...' : 'ยืนยันลบรายการ'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clear Sales History Modal */}
      {showClearModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => !clearing && setShowClearModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center gap-3 text-red-600 mb-4">
                <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">เคลียร์ประวัติยอดขาย</h3>
                  <p className="text-xs text-slate-500">ลบข้อมูลรายการขายออกจากฐานข้อมูล</p>
                </div>
              </div>

              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 leading-relaxed mb-4">
                ⚠️ <strong>คำเตือนสำคัญ:</strong> การเคลียร์ประวัติจะลบรายการบิลขายและประวัติใบเสร็จที่เลือกออกจากฐานข้อมูลอย่างถาวร ยอดสรุปและรายงานจะถูกคำนวณใหม่ และไม่สามารถกู้คืนข้อมูลเดิมได้
              </div>

              <div className="space-y-2 mb-4">
                <label className="block text-xs font-bold text-slate-700">เลือกขอบเขตที่ต้องการเคลียร์:</label>

                <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  clearScope === 'range' ? 'bg-blue-50/70 border-blue-300 ring-1 ring-blue-300' : 'bg-slate-50 border-slate-200'
                }`}>
                  <input
                    type="radio"
                    name="clearScopeHistory"
                    value="range"
                    checked={clearScope === 'range'}
                    onChange={() => setClearScope('range')}
                    className="mt-0.5 text-blue-600"
                  />
                  <div className="text-xs">
                    <p className="font-bold text-slate-800">
                      เคลียร์เฉพาะช่วงวันที่เลือก ({from || 'เริ่มต้น'} ถึง {to || 'ปัจจุบัน'})
                    </p>
                    <p className="text-slate-500 mt-0.5">
                      ลบเฉพาะบิลขายที่เกิดขึ้นในช่วงวันที่ระบุในตัวกรองปัจจุบัน ({totalCount} รายการ)
                    </p>
                  </div>
                </label>

                <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  clearScope === 'all' ? 'bg-red-50/70 border-red-300 ring-1 ring-red-300' : 'bg-slate-50 border-slate-200'
                }`}>
                  <input
                    type="radio"
                    name="clearScopeHistory"
                    value="all"
                    checked={clearScope === 'all'}
                    onChange={() => setClearScope('all')}
                    className="mt-0.5 text-red-600"
                  />
                  <div className="text-xs">
                    <p className="font-bold text-red-900">
                      เคลียร์ประวัติยอดขายทั้งหมด (All Time)
                    </p>
                    <p className="text-slate-500 mt-0.5">
                      ล้างประวัติการขายทั้งหมดในระบบ เหมาะสำหรับรีเซ็ตระบบหลังการทดสอบขาย
                    </p>
                  </div>
                </label>
              </div>

              <label className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors mb-4">
                <input
                  type="checkbox"
                  checked={restoreStockOnClear}
                  onChange={(e) => setRestoreStockOnClear(e.target.checked)}
                  className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <div className="text-xs">
                  <p className="font-semibold text-slate-800">คืนสต็อกสินค้าที่เคยตัดขายกลับเข้าระบบ</p>
                  <p className="text-slate-500 mt-0.5">
                    ติ๊กถูกหากต้องการคืนจำนวนสินค้ากลับเข้าสต็อก (หากเป็นการล้างข้อมูลทดสอบ ไม่ต้องติ๊กเลือก)
                  </p>
                </div>
              </label>

              {clearScope === 'all' && (
                <div className="mb-4 bg-amber-50 p-3 rounded-xl border border-amber-200">
                  <p className="text-xs text-amber-800 font-medium mb-1.5">
                    เพื่อความปลอดภัย กรุณาพิมพ์คำว่า <strong className="font-mono bg-amber-200 px-1.5 py-0.5 rounded text-amber-900">ยืนยัน</strong> เพื่อดำเนินการ:
                  </p>
                  <input
                    type="text"
                    value={clearConfirmText}
                    onChange={(e) => setClearConfirmText(e.target.value)}
                    placeholder="พิมพ์ ยืนยัน ที่นี่"
                    className="w-full px-3 py-1.5 text-xs border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={clearing}
                  onClick={() => setShowClearModal(false)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={clearing || (clearScope === 'all' && clearConfirmText !== 'ยืนยัน')}
                  onClick={handleClearHistory}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                >
                  <Trash2 size={14} />
                  <span>{clearing ? 'กำลังเคลียร์ข้อมูล...' : 'ยืนยันเคลียร์ประวัติ'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
