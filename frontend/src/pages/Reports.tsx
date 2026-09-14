import { useEffect, useState } from 'react';
import api from '../api/client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts';
import { Download, RefreshCw, FileText, Package } from 'lucide-react';

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

  const loadSales = async () => {
    setLoading(true);
    const res = await api.get('/reports/sales', { params: { from, to, group_by: groupBy } });
    setSalesData(res.data);
    setLoading(false);
  };

  const loadInventory = async () => {
    setLoading(true);
    const res = await api.get('/reports/inventory');
    setInventoryData(res.data);
    setLoading(false);
  };

  useEffect(() => {
    if (tab === 'sales') loadSales();
    else loadInventory();
  }, [tab]);

  const totalRevenue = salesData?.summary?.reduce((s: number, r: any) => s + r.revenue, 0) || 0;
  const totalCount   = salesData?.summary?.reduce((s: number, r: any) => s + r.count, 0) || 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">รายงาน</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { key: 'sales', label: 'รายงานยอดขาย', icon: FileText },
          { key: 'inventory', label: 'รายงานสินค้าคงคลัง', icon: Package },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm ${tab === key ? 'bg-blue-600 text-white' : 'bg-white text-slate-600'}`}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {tab === 'sales' && (
        <>
          {/* Filters */}
          <div className="card flex flex-wrap gap-4 items-end">
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
              <RefreshCw size={16} /> {loading ? 'กำลังโหลด...' : 'ค้นหา'}
            </button>
            <button onClick={() => salesData?.details && exportCSV(salesData.details, `sales_${from}_${to}`)}
              className="btn-outline">
              <Download size={16} /> Export CSV
            </button>
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
                    <th>เลขที่</th>
                    <th>วันที่</th>
                    <th>แคชเชียร์</th>
                    <th>ช่องทาง</th>
                    <th className="text-right">ส่วนลด</th>
                    <th className="text-right">ยอดรวม</th>
                  </tr>
                </thead>
                <tbody>
                  {salesData.details.map((s: any) => (
                    <tr key={s.sale_no}>
                      <td className="font-mono text-sm">{s.sale_no}</td>
                      <td className="text-sm text-slate-500">{new Date(s.created_at).toLocaleString('th-TH')}</td>
                      <td className="text-sm">{s.cashier}</td>
                      <td><span className="badge-blue">{s.payment_method}</span></td>
                      <td className="text-right text-sm">{s.discount_amount > 0 ? `฿${fmt(s.discount_amount)}` : '-'}</td>
                      <td className="text-right font-semibold">฿{fmt(s.total)}</td>
                    </tr>
                  ))}
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
    </div>
  );
}
