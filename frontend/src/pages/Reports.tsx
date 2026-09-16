import { useEffect, useState } from 'react';
import api from '../api/client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts';
import {
  Download, RefreshCw, FileText, Package, Trash2,
  AlertTriangle, CheckCircle2, X, AlertCircle, Eye, CheckSquare, Square
} from 'lucide-react';
import { useRealtimeEvent } from '../utils/socket';
import ReceiptModal, { type ReceiptSale } from '../components/ReceiptModal';

const fmt = (n: number) => n?.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function exportCSV(data: any[], filename: string) {
  if (!data.length) return;
  const keys = Object.keys(data[0]);
  const csv = [keys.join(','), ...data.map(row => keys.map(k => `"${row[k] ?? ''}"`).join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${filename}.csv`;
  a.click();
}

export default function Reports() {
  const [tab, setTab] = useState<'sales' | 'inventory'>('sales');
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [groupBy, setGroupBy] = useState('day');
  const [salesData, setSalesData] = useState<any>(null);
  const [inventoryData, setInventoryData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Delete single sale state
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [restoreStockOnDelete, setRestoreStockOnDelete] = useState(true);
  const [deleting, setDeleting] = useState(false);

  // Bulk delete state
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [restoreStockOnBulk, setRestoreStockOnBulk] = useState(true);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Clear sales history state
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearScope, setClearScope] = useState<'range' | 'all'>('range');
  const [restoreStockOnClear, setRestoreStockOnClear] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);

  // View Receipt Modal state
  const [selectedReceiptSale, setSelectedReceiptSale] = useState<ReceiptSale | null>(null);
  const [loadingReceiptId, setLoadingReceiptId] = useState<number | null>(null);

  // Toast / feedback message
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadSales = async () => {
    setLoading(true);
    try {
      const res = await api.get('/reports/sales', { params: { from, to, group_by: groupBy } });
      setSalesData(res.data);
      setSelectedIds([]);
    } catch (err: any) {
      console.error('Failed to load sales report:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadInventory = async () => {
    setLoading(true);
    try {
      const res = await api.get('/reports/inventory');
      setInventoryData(res.data);
    } catch (err: any) {
      console.error('Failed to load inventory report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'sales') loadSales();
    else loadInventory();
  }, [tab]);

  // Real-time synchronization
  useRealtimeEvent('sale:created', () => {
    if (tab === 'sales') loadSales();
  });
  useRealtimeEvent('sale:deleted', () => {
    if (tab === 'sales') loadSales();
  });
  useRealtimeEvent('sales:cleared', () => {
    if (tab === 'sales') loadSales();
  });

  const handleOpenReceipt = async (saleId: number) => {
    try {
      setLoadingReceiptId(saleId);
      const { data } = await api.get(`/sales/${saleId}`);
      setSelectedReceiptSale(data);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: 'ไม่สามารถโหลดรายละเอียดใบเสร็จได้: ' + (err.response?.data?.message || err.message)
      });
    } finally {
      setLoadingReceiptId(null);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (!salesData?.details?.length) return;
    if (selectedIds.length === salesData.details.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(salesData.details.map((s: any) => s.id));
    }
  };

  const handleDeleteSale = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      const res = await api.delete(`/sales/${deleteTarget.id}`, {
        params: { restore_stock: restoreStockOnDelete }
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

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      setBulkDeleting(true);
      const res = await api.post('/sales/bulk-delete', {
        ids: selectedIds,
        restore_stock: restoreStockOnBulk
      });
      setFeedback({ type: 'success', message: res.data?.message || `ลบรายการขายที่เลือกสำเร็จ ${selectedIds.length} รายการ` });
      setSelectedIds([]);
      setShowBulkDeleteModal(false);
      await loadSales();
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.response?.data?.message || err.message || 'เกิดข้อผิดพลาดในการลบรายการ' });
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleClearHistory = async () => {
    try {
      setClearing(true);
      const res = await api.post('/sales/clear', {
        clear_all: clearScope === 'all',
        from: clearScope === 'range' ? from : undefined,
        to: clearScope === 'range' ? to : undefined,
        restore_stock: restoreStockOnClear
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

  const totalRevenue = salesData?.summary?.reduce((s: number, r: any) => s + r.revenue, 0) || 0;
  const totalCount   = salesData?.summary?.reduce((s: number, r: any) => s + r.count, 0) || 0;

  return (
    <div className="p-6 space-y-4">
      {/* Feedback Toast Notification */}
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
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-600 ml-2"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">รายงาน</h1>
      </div>

      {/* ========================================================================= */}
      {/* 📌 [จุดปรับแต่งและขยายแถบแท็บหน้ารายงาน: Reports Tabs Bar]                   */}
      {/* ปรับขนาดปุ่มแท็บรายงาน: 'px-4 py-2 text-sm' (ปรับเป็น 'px-6 py-3 text-base') */}
      {/* ========================================================================= */}
      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { key: 'sales', label: 'รายงานยอดขาย', icon: FileText },
          { key: 'inventory', label: 'รายงานสินค้าคงคลัง', icon: Package },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${tab === key ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {tab === 'sales' && (
        <>
          {/* Filters & Action Buttons */}
          <div className="card flex flex-wrap gap-4 items-end justify-between">
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">จากวันที่</label>
                <input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">ถึงวันที่</label>
                <input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">จัดกลุ่มตาม</label>
                <select className="input" value={groupBy} onChange={e => setGroupBy(e.target.value)}>
                  <option value="day">รายวัน</option>
                  <option value="week">รายสัปดาห์</option>
                  <option value="month">รายเดือน</option>
                </select>
              </div>
              <button onClick={loadSales} disabled={loading} className="btn-primary">
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> {loading ? 'กำลังโหลด...' : 'ค้นหา'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              {/* Bulk Delete Button when items are checked */}
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowBulkDeleteModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium shadow-sm transition-all active:scale-95"
                  title="ลบรายการที่เลือก"
                >
                  <Trash2 size={16} /> ลบที่เลือก ({selectedIds.length})
                </button>
              )}

              <button onClick={() => salesData?.details && exportCSV(salesData.details, `sales_${from}_${to}`)}
                className="btn-outline">
                <Download size={16} /> Export CSV
              </button>

              {/* Clear History Button */}
              <button
                type="button"
                onClick={() => {
                  setShowClearModal(true);
                  setClearConfirmText('');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 border border-red-300 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg text-sm font-medium transition-all shadow-xs"
                title="เคลียร์ประวัติยอดขาย"
              >
                <Trash2 size={16} /> เคลียร์ประวัติ
              </button>
            </div>
          </div>

          {/* KPIs */}
          {salesData && (
            <div className="grid grid-cols-3 gap-4">
              <div className="card text-center">
                <p className="text-slate-500 text-sm">ยอดขายรวม</p>
                <p className="text-3xl font-bold text-blue-600 mt-1">฿{fmt(totalRevenue)}</p>
              </div>
              <div className="card text-center">
                <p className="text-slate-500 text-sm">จำนวนรายการ</p>
                <p className="text-3xl font-bold text-slate-800 mt-1">{totalCount.toLocaleString()}</p>
              </div>
              <div className="card text-center">
                <p className="text-slate-500 text-sm">ยอดเฉลี่ย/รายการ</p>
                <p className="text-3xl font-bold text-slate-800 mt-1">
                  ฿{totalCount > 0 ? fmt(totalRevenue / totalCount) : '0.00'}
                </p>
              </div>
            </div>
          )}

          {/* Chart */}
          {salesData?.summary?.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-slate-700 mb-4">ยอดขายตามช่วงเวลา</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={salesData.summary}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `฿${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => `฿${fmt(v)}`} />
                  <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} name="ยอดขาย" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Detail Table */}
          {salesData?.details?.length > 0 && (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-10 text-center">
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        className="text-slate-400 hover:text-blue-600 transition-colors inline-flex items-center justify-center p-1"
                        title={selectedIds.length === salesData.details.length ? 'ยกเลิกเลือกทั้งหมด' : 'เลือกทั้งหมด'}
                      >
                        {selectedIds.length > 0 && selectedIds.length === salesData.details.length ? (
                          <CheckSquare size={17} className="text-blue-600" />
                        ) : (
                          <Square size={17} />
                        )}
                      </button>
                    </th>
                    <th>เลขที่</th>
                    <th>วันที่</th>
                    <th>แคชเชียร์</th>
                    <th>ช่องทาง</th>
                    <th className="text-right">ส่วนลด</th>
                    <th className="text-right">ยอดรวม</th>
                    <th className="text-center w-36">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {salesData.details.map((s: any) => {
                    const isSelected = selectedIds.includes(s.id);
                    return (
                      <tr key={s.sale_no} className={isSelected ? 'bg-blue-50/40' : ''}>
                        <td className="text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(s.id)}
                            className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer align-middle"
                          />
                        </td>
                        <td className="font-mono text-sm font-semibold text-blue-700">{s.sale_no}</td>
                        <td className="text-sm text-slate-500">{new Date(s.created_at).toLocaleString('th-TH')}</td>
                        <td className="text-sm">{s.cashier || '-'}</td>
                        <td>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            s.payment_method === 'cash' ? 'bg-emerald-100 text-emerald-700' :
                            s.payment_method === 'promptpay' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                          }`}>
                            {s.payment_method === 'cash' ? 'เงินสด' : s.payment_method === 'promptpay' ? 'พร้อมเพย์' : 'บัตร'}
                          </span>
                        </td>
                        <td className="text-right text-sm">{s.discount_amount > 0 ? `฿${fmt(s.discount_amount)}` : '-'}</td>
                        <td className="text-right font-semibold font-mono">฿{fmt(s.total)}</td>
                        <td className="text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenReceipt(s.id)}
                              disabled={loadingReceiptId === s.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors active:scale-95 disabled:opacity-50"
                              title="ดูรายละเอียดบิล / พิมพ์ใบเสร็จ"
                            >
                              <Eye size={13} /> {loadingReceiptId === s.id ? '...' : 'ดูบิล'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteTarget(s);
                                setRestoreStockOnDelete(true);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors active:scale-95"
                              title="ลบรายการบิลนี้"
                            >
                              <Trash2 size={13} /> ลบ
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'inventory' && (
        <>
          <div className="flex justify-end gap-2">
            <button onClick={loadInventory} className="btn-outline"><RefreshCw size={16} /> รีเฟรช</button>
            <button onClick={() => inventoryData?.products && exportCSV(inventoryData.products, 'inventory_report')}
              className="btn-outline"><Download size={16} /> Export CSV</button>
          </div>

          {inventoryData && (
            <div className="grid grid-cols-3 gap-4">
              <div className="card text-center">
                <p className="text-slate-500 text-sm">สินค้าทั้งหมด</p>
                <p className="text-3xl font-bold text-slate-800 mt-1">{inventoryData.products?.length}</p>
                <p className="text-xs text-slate-400">รายการ</p>
              </div>
              <div className="card text-center">
                <p className="text-slate-500 text-sm">สินค้าใกล้หมด</p>
                <p className="text-3xl font-bold text-orange-600 mt-1">{inventoryData.lowStockCount}</p>
                <p className="text-xs text-slate-400">รายการ</p>
              </div>
              <div className="card text-center">
                <p className="text-slate-500 text-sm">มูลค่าสต็อกรวม</p>
                <p className="text-3xl font-bold text-blue-600 mt-1">฿{fmt(inventoryData.totalValue)}</p>
                <p className="text-xs text-slate-400">บาท</p>
              </div>
            </div>
          )}

          {inventoryData?.products && (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>บาร์โค้ด</th>
                    <th>ชื่อสินค้า</th>
                    <th>หมวดหมู่</th>
                    <th className="text-right">ราคาทุน</th>
                    <th className="text-center">สต็อก</th>
                    <th className="text-right">มูลค่า</th>
                    <th className="text-center">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryData.products.map((p: any) => (
                    <tr key={p.id}>
                      <td className="font-mono text-xs text-slate-500">{p.barcode}</td>
                      <td className="font-medium text-sm">{p.name}</td>
                      <td className="text-slate-500 text-sm">{p.category_name}</td>
                      <td className="text-right text-sm">฿{fmt(p.cost_price)}</td>
                      <td className="text-center font-bold">{p.stock_qty} {p.unit}</td>
                      <td className="text-right font-medium">฿{fmt(p.stock_value)}</td>
                      <td className="text-center">
                        {p.stock_qty === 0 ? <span className="badge-red">หมด</span>
                          : p.stock_qty <= p.min_stock ? <span className="badge-yellow">ใกล้หมด</span>
                          : <span className="badge-green">ปกติ</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
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
                  <span className="font-medium text-slate-800">{deleteTarget.cashier || '-'}</span>
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

              {/* Option to restore stock */}
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
                  className="btn-secondary px-4 py-2 text-xs font-semibold"
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

      {/* Bulk Delete Modal */}
      {showBulkDeleteModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => !bulkDeleting && setShowBulkDeleteModal(false)}
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
                  <h3 className="text-lg font-bold text-slate-800">ยืนยันการลบรายการที่เลือก</h3>
                  <p className="text-xs text-slate-500">เลือกไว้ทั้งหมด <strong className="text-red-600 font-bold">{selectedIds.length}</strong> รายการ</p>
                </div>
              </div>

              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 leading-relaxed mb-4">
                ⚠️ รายการบิลขายที่เลือกจะถูกลบออกจากระบบอย่างถาวร ยอดรายงานจะถูกคำนวณใหม่
              </div>

              <label className="flex items-start gap-3 p-3 bg-blue-50/60 border border-blue-100 rounded-xl cursor-pointer hover:bg-blue-50 transition-colors mb-5">
                <input
                  type="checkbox"
                  checked={restoreStockOnBulk}
                  onChange={(e) => setRestoreStockOnBulk(e.target.checked)}
                  className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <div className="text-xs">
                  <p className="font-bold text-blue-900">คืนสต็อกสินค้ากลับเข้าระบบ (แนะนำ)</p>
                  <p className="text-blue-600/80 mt-0.5">บวกจำนวนสินค้าที่เคยตัดขายในบิลเหล่านี้กลับเข้าคลังสินค้าอัตโนมัติ</p>
                </div>
              </label>

              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={bulkDeleting}
                  onClick={() => setShowBulkDeleteModal(false)}
                  className="btn-secondary px-4 py-2 text-xs font-semibold"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={bulkDeleting}
                  onClick={handleBulkDelete}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Trash2 size={14} />
                  <span>{bulkDeleting ? 'กำลังลบ...' : `ยืนยันลบ (${selectedIds.length} รายการ)`}</span>
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

              {/* Warning box */}
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 leading-relaxed mb-4">
                ⚠️ <strong>คำเตือนสำคัญ:</strong> การเคลียร์ประวัติจะลบรายการบิลขายและประวัติใบเสร็จที่เลือกออกจากฐานข้อมูลอย่างถาวร ยอดสรุปและรายงานจะถูกคำนวณใหม่ และไม่สามารถกู้คืนข้อมูลเดิมได้
              </div>

              {/* Scope Selection */}
              <div className="space-y-2 mb-4">
                <label className="block text-xs font-bold text-slate-700">เลือกขอบเขตที่ต้องการเคลียร์:</label>

                <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  clearScope === 'range' ? 'bg-blue-50/70 border-blue-300 ring-1 ring-blue-300' : 'bg-slate-50 border-slate-200'
                }`}>
                  <input
                    type="radio"
                    name="clearScope"
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
                      ลบเฉพาะบิลขายที่เกิดขึ้นในช่วงวันที่ระบุในตัวกรองปัจจุบัน ({salesData?.details?.length || 0} รายการ)
                    </p>
                  </div>
                </label>

                <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  clearScope === 'all' ? 'bg-red-50/70 border-red-300 ring-1 ring-red-300' : 'bg-slate-50 border-slate-200'
                }`}>
                  <input
                    type="radio"
                    name="clearScope"
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

              {/* Restore stock option */}
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

              {/* Safety Confirmation Input if All Scope is selected */}
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
                  className="btn-secondary px-4 py-2 text-xs font-semibold"
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

      {/* Receipt Modal for Viewing / Reprints */}
      {selectedReceiptSale && (
        <ReceiptModal
          sale={selectedReceiptSale}
          isReprint={true}
          onClose={() => setSelectedReceiptSale(null)}
        />
      )}
    </div>
  );
}
