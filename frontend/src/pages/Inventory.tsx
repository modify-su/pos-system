import { useEffect, useState } from 'react';
import api from '../api/client';
import { useRealtimeEvent } from '../utils/socket';
import { AlertTriangle, Search, RefreshCw } from 'lucide-react';

const fmt = (n: number) => n?.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Inventory() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [movements, setMovements] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [adjustModal, setAdjustModal] = useState(false);
  const [newQty, setNewQty] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [tab, setTab] = useState<'stock' | 'movements'>('stock');

  const load = async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        api.get('/products', { params: { search, category_id: catFilter, low_stock: lowOnly, limit: 200 } }),
        api.get('/categories'),
      ]);
      setProducts(pRes.data);
      setCategories(cRes.data);
    } finally {
      setLoading(false);
    }
  };

  const loadMovements = async () => {
    const res = await api.get('/inventory/movements', { params: { limit: 100 } });
    setMovements(res.data);
  };

  useEffect(() => { load(); }, [search, catFilter, lowOnly]);
  useEffect(() => { if (tab === 'movements') loadMovements(); }, [tab]);

  // Realtime inventory listener
  useRealtimeEvent('inventory:updated', () => {
    Promise.all([
      api.get('/products', { params: { search, category_id: catFilter, low_stock: lowOnly, limit: 200 } }),
      tab === 'movements' ? api.get('/inventory/movements', { params: { limit: 100 } }) : Promise.resolve(null),
    ]).then(([pRes, mRes]) => {
      if (pRes) setProducts(pRes.data);
      if (mRes) setMovements(mRes.data);
    }).catch(() => {});
  });

  const handleAdjust = async () => {
    try {
      await api.post('/inventory/adjust', {
        product_id: selectedProduct.id,
        new_qty: parseInt(newQty),
        note: adjustNote,
      });
      setAdjustModal(false);
      setSelectedProduct(null);
      setNewQty('');
      setAdjustNote('');
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'เกิดข้อผิดพลาด');
    }
  };

  const typeLabel: Record<string, { label: string; color: string }> = {
    IN: { label: 'รับเข้า', color: 'badge-green' },
    SALE: { label: 'ขาย', color: 'badge-blue' },
    OUT: { label: 'เบิกออก', color: 'badge-red' },
    ADJUST_IN: { label: 'ปรับเพิ่ม', color: 'badge-yellow' },
    ADJUST_OUT: { label: 'ปรับลด', color: 'badge-red' },
    initial: { label: 'สต็อกเริ่มต้น', color: 'badge-gray' },
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">สต็อกสินค้า</h1>
        <button onClick={load} className="btn-outline"><RefreshCw size={16} /> รีเฟรช</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab('stock')} className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${tab === 'stock' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>
          สต็อกปัจจุบัน
        </button>
        <button onClick={() => setTab('movements')} className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${tab === 'movements' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>
          ประวัติการเคลื่อนไหว
        </button>
      </div>

      {tab === 'stock' && (
        <>
          {/* Filters */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" size={18} />
              <input className="input pl-11" placeholder="ค้นหาสินค้า..." value={search}
                onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="input w-44" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
              <option value="">ทุกหมวดหมู่</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-slate-300 cursor-pointer text-sm text-slate-700 hover:bg-slate-50">
              <input type="checkbox" checked={lowOnly} onChange={e => setLowOnly(e.target.checked)} className="accent-orange-500" />
              <AlertTriangle size={15} className="text-orange-500" /> สินค้าใกล้หมดเท่านั้น
            </label>
          </div>

          {/* Table */}
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>บาร์โค้ด</th>
                  <th>ชื่อสินค้า</th>
                  <th>หมวดหมู่</th>
                  <th className="text-right">ราคาทุน</th>
                  <th className="text-right">ราคาขาย</th>
                  <th className="text-center">คงเหลือ</th>
                  <th className="text-center">สถานะ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="text-center py-8 text-slate-400">กำลังโหลด...</td></tr>
                ) : products.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-slate-400">ไม่พบสินค้า</td></tr>
                ) : products.map(p => (
                  <tr key={p.id} className={p.stock_qty <= p.min_stock ? '!bg-orange-50' : ''}>
                    <td className="font-mono text-xs text-slate-500">{p.barcode}</td>
                    <td className="font-medium">{p.name}</td>
                    <td className="text-slate-500 text-sm">{p.category_name}</td>
                    <td className="text-right text-sm">฿{fmt(p.cost_price)}</td>
                    <td className="text-right text-sm font-medium">฿{fmt(p.sell_price)}</td>
                    <td className="text-center">
                      <span className={`font-bold text-lg ${p.stock_qty <= p.min_stock ? 'text-red-600' : 'text-slate-800'}`}>
                        {p.stock_qty}
                      </span>
                      <span className="text-xs text-slate-400 ml-1">{p.unit}</span>
                    </td>
                    <td className="text-center">
                      {p.stock_qty === 0 ? <span className="badge-red">หมด</span>
                        : p.stock_qty <= p.min_stock ? <span className="badge-yellow">ใกล้หมด</span>
                        : <span className="badge-green">ปกติ</span>}
                    </td>
                    <td>
                      <button
                        onClick={() => { setSelectedProduct(p); setNewQty(String(p.stock_qty)); setAdjustModal(true); }}
                        className="btn-outline btn-sm"
                      >
                        ปรับสต็อก
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'movements' && (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>วันที่</th>
                <th>สินค้า</th>
                <th>ประเภท</th>
                <th className="text-center">จำนวน</th>
                <th className="text-center">ก่อน</th>
                <th className="text-center">หลัง</th>
                <th>หมายเหตุ</th>
                <th>ผู้ดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {movements.map(m => (
                <tr key={m.id}>
                  <td className="text-xs text-slate-500">{new Date(m.created_at).toLocaleString('th-TH')}</td>
                  <td className="font-medium text-sm">{m.product_name}</td>
                  <td><span className={typeLabel[m.type]?.color || 'badge-gray'}>{typeLabel[m.type]?.label || m.type}</span></td>
                  <td className="text-center font-bold">{m.qty}</td>
                  <td className="text-center text-slate-500">{m.qty_before}</td>
                  <td className="text-center font-semibold">{m.qty_after}</td>
                  <td className="text-xs text-slate-500 max-w-40 truncate">{m.note}</td>
                  <td className="text-xs text-slate-500">{m.user_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Adjust Modal */}
      {adjustModal && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-96 shadow-2xl p-6">
            <h3 className="text-lg font-bold mb-1">ปรับสต็อก</h3>
            <p className="text-slate-500 text-sm mb-4">{selectedProduct.name}</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">จำนวนใหม่ (ปัจจุบัน: {selectedProduct.stock_qty})</label>
                <input className="input" type="number" min="0" value={newQty} onChange={e => setNewQty(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">หมายเหตุ</label>
                <input className="input" value={adjustNote} onChange={e => setAdjustNote(e.target.value)} placeholder="เหตุผลในการปรับ..." />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setAdjustModal(false)} className="btn-secondary flex-1">ยกเลิก</button>
                <button onClick={handleAdjust} className="btn-primary flex-1">บันทึก</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
