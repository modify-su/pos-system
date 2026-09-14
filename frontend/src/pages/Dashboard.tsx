import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import api from '../api/client';
import { useRealtimeEvent } from '../utils/socket';
import {
  TrendingUp, TrendingDown, ShoppingCart,
  AlertTriangle, ClipboardList, DollarSign, RefreshCw,
  ArrowDownCircle, ArrowUpCircle, ExternalLink, Clock,
  ChevronRight, ArrowRight
} from 'lucide-react';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const fmt = (n: number) => n?.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function KpiCard({ title, value, subtitle, icon: Icon, color, growth }: any) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4.5 flex items-start gap-4 transition-all hover:shadow-md">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${color} shadow-sm`}>
        <Icon size={24} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</p>
        <p className="text-2xl font-bold text-slate-800 leading-tight mt-1">{value}</p>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        {growth !== undefined && (
          <div className={`flex items-center gap-1 text-xs mt-1 font-semibold ${parseFloat(growth) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {parseFloat(growth) >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            <span>{growth}% จากเดือนที่แล้ว</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/reports/dashboard');
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadSilently = useCallback(async () => {
    try {
      const res = await api.get('/reports/dashboard');
      setData(res.data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => { load(); }, []);

  // Listen to realtime events for live refresh
  useRealtimeEvent('sale:created', () => {
    loadSilently();
  });

  useRealtimeEvent('inventory:updated', () => {
    loadSilently();
  });

  useRealtimeEvent('requisition:updated', () => {
    loadSilently();
  });

  useRealtimeEvent('dashboard:refresh', () => {
    loadSilently();
  });

  if (loading) return (
    <div className="flex items-center justify-center h-full min-h-[70vh]">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent" />
    </div>
  );

  if (!data) return null;

  const paymentLabel: Record<string, string> = { cash: 'เงินสด', transfer: 'โอนเงิน', credit: 'บัตรเครดิต' };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800">แดชบอร์ด & ภาพรวมธุรกิจ</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            {new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm font-semibold transition-all self-start sm:self-auto active:scale-95"
        >
          <RefreshCw size={16} />
          <span>รีเฟรชข้อมูล</span>
        </button>
      </div>

      {/* KPI Sales Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title="ยอดขายวันนี้"
          value={`฿${fmt(data.today.revenue)}`}
          subtitle={`${data.today.count} รายการ`}
          icon={ShoppingCart}
          color="bg-blue-600"
        />
        <KpiCard
          title="กำไรวันนี้"
          value={`฿${fmt(data.today.profit)}`}
          subtitle="กำไรขั้นต้น (Gross Profit)"
          icon={DollarSign}
          color="bg-emerald-600"
        />
        <KpiCard
          title="ยอดขายเดือนนี้"
          value={`฿${fmt(data.thisMonth.revenue)}`}
          subtitle={`${data.thisMonth.count} รายการ`}
          icon={TrendingUp}
          color="bg-indigo-600"
          growth={data.thisMonth.growth}
        />
        <KpiCard
          title="กำไรเดือนนี้"
          value={`฿${fmt(data.thisMonth.profit)}`}
          subtitle="กำไรขั้นต้น (Gross Profit)"
          icon={DollarSign}
          color="bg-teal-600"
        />
      </div>

      {/* Inventory & Warehouse High-level Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-4.5 border border-slate-200 shadow-sm text-center">
          <p className="text-slate-500 text-xs font-semibold uppercase">สินค้าทั้งหมดในระบบ</p>
          <p className="text-3xl font-bold text-slate-800 mt-1">{data.inventory.totalProducts}</p>
          <p className="text-xs text-slate-400 mt-0.5">รายการสินค้าพร้อมขาย</p>
        </div>

        <Link
          to="/inventory"
          className={`bg-white rounded-2xl p-4.5 border shadow-sm text-center transition-all hover:shadow-md group ${
            data.inventory.lowStock > 0 ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'
          }`}
        >
          <p className="text-amber-700 text-xs font-semibold uppercase flex items-center justify-center gap-1.5">
            <AlertTriangle size={15} className="text-amber-600" />
            <span>สินค้าใกล้หมดสต็อก</span>
          </p>
          <p className="text-3xl font-bold text-amber-600 mt-1 group-hover:scale-105 transition-transform">
            {data.inventory.lowStock}
          </p>
          <p className="text-xs text-amber-600/80 mt-0.5">ต้องสั่งซื้อ / รับสินค้าเพิ่ม</p>
        </Link>

        <Link
          to="/stock-out"
          className={`bg-white rounded-2xl p-4.5 border shadow-sm text-center transition-all hover:shadow-md group ${
            data.inventory.pendingReqs > 0 ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200'
          }`}
        >
          <p className="text-blue-700 text-xs font-semibold uppercase flex items-center justify-center gap-1.5">
            <ClipboardList size={15} className="text-blue-600" />
            <span>รอการอนุมัติเบิกจ่าย</span>
          </p>
          <p className="text-3xl font-bold text-blue-600 mt-1 group-hover:scale-105 transition-transform">
            {data.inventory.pendingReqs}
          </p>
          <p className="text-xs text-blue-600/80 mt-0.5">คลิกเพื่อตรวจสอบและอนุมัติ</p>
        </Link>
      </div>

      {/* Warehouse In & Out Overview */}
      {data.warehouse && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Stock In Summary */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <ArrowDownCircle size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">การรับสินค้าเข้าคลัง (Stock-In)</h3>
                  <p className="text-xs text-slate-500">สรุปยอดการรับสินค้าเข้าสต็อกทั้งหมด</p>
                </div>
              </div>
              <Link
                to="/stock-in"
                className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-xl transition-all active:scale-95"
              >
                <span>ไปหน้ารับเข้า</span>
                <ExternalLink size={13} />
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-100">
              <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-100">
                <p className="text-xs text-slate-600">รับเข้าเดือนนี้</p>
                <p className="text-xl font-bold text-emerald-700 font-mono mt-0.5">
                  ฿{fmt(data.warehouse.stockInMonth?.total || 0)}
                </p>
                <p className="text-[11px] text-emerald-600/80 font-medium mt-0.5">
                  {data.warehouse.stockInMonth?.count || 0} ใบสั่งซื้อ (PO)
                </p>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <p className="text-xs text-slate-600">รับเข้าวันนี้</p>
                <p className="text-xl font-bold text-slate-800 font-mono mt-0.5">
                  ฿{fmt(data.warehouse.stockInToday?.total || 0)}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {data.warehouse.stockInToday?.count || 0} ใบสั่งซื้อ (PO)
                </p>
              </div>
            </div>
          </div>

          {/* Stock Out Summary */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <ArrowUpCircle size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">การเบิกจ่ายสินค้า (Stock-Out)</h3>
                  <p className="text-xs text-slate-500">สรุปการเบิกใช้ ตัดสต็อก และคำขอเบิก</p>
                </div>
              </div>
              <Link
                to="/stock-out"
                className="text-xs font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-xl transition-all active:scale-95"
              >
                <span>ไปหน้าเบิกจ่าย</span>
                <ExternalLink size={13} />
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-100">
              <div className="bg-purple-50/60 p-3 rounded-xl border border-purple-100">
                <p className="text-xs text-slate-600">เบิกจ่ายเดือนนี้</p>
                <p className="text-xl font-bold text-purple-700 font-mono mt-0.5">
                  {(data.warehouse.stockOutMonth?.totalQty || 0).toLocaleString()} <span className="text-sm font-normal">ชิ้น</span>
                </p>
                <p className="text-[11px] text-purple-600/80 font-medium mt-0.5">
                  {data.warehouse.stockOutMonth?.count || 0} รายการที่อนุมัติแล้ว
                </p>
              </div>

              <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-200/60">
                <p className="text-xs text-slate-600">รอการอนุมัติเบิก</p>
                <p className="text-xl font-bold text-amber-700 font-mono mt-0.5">
                  {data.warehouse.pendingRequisitions?.length || data.inventory.pendingReqs || 0} <span className="text-sm font-normal">รายการ</span>
                </p>
                <p className="text-[11px] text-amber-600 font-medium mt-0.5">
                  คลิกเพื่ออนุมัติในหน้าเบิกจ่าย
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pending Requisitions Alert Card (if any pending) */}
      {data.warehouse?.pendingRequisitions && data.warehouse.pendingRequisitions.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center flex-shrink-0">
                <ClipboardList size={18} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm">
                  มีรายการคำขอเบิกสินค้าที่รอการอนุมัติ ({data.warehouse.pendingRequisitions.length} รายการ)
                </h3>
                <p className="text-xs text-slate-500">
                  ผู้ขอเบิกได้ส่งรายการเข้าระบบ กรุณาตรวจสอบและอนุมัติเพื่อตัดสต็อกจริง
                </p>
              </div>
            </div>

            <Link
              to="/stock-out"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 text-white hover:bg-amber-700 text-xs font-bold transition-all shadow-sm self-start sm:self-auto active:scale-95"
            >
              <span>ไปอนุมัติที่หน้าเบิกจ่าย</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            {data.warehouse.pendingRequisitions.map((req: any) => (
              <div key={req.id} className="bg-white p-3 rounded-xl border border-amber-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-blue-700">{req.req_no}</span>
                  <span className="text-[10px] text-amber-700 font-semibold bg-amber-100 px-2 py-0.5 rounded-full">
                    รออนุมัติ
                  </span>
                </div>
                <p className="text-xs font-semibold text-slate-800 truncate" title={req.reason}>
                  {req.reason}
                </p>
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                  <span>ผู้ขอ: {req.requester_name || 'พนักงาน'}</span>
                  <span className="font-mono font-bold text-slate-700">{req.total_requested_qty} ชิ้น</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Daily Revenue Chart */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 text-base">ยอดขาย 14 วันย้อนหลัง</h3>
            <span className="text-xs text-slate-400">เปรียบเทียบยอดขาย vs กำไร</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.dailySales}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={v => v?.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `฿${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => `฿${fmt(v)}`} labelFormatter={l => `วันที่ ${l}`} />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2.5} dot={false} name="ยอดขาย" />
              <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2.5} dot={false} name="กำไร" strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Payment Pie */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
          <h3 className="font-bold text-slate-800 text-base mb-2">ช่องทางชำระเงิน (เดือนนี้)</h3>
          {data.paymentMethods && data.paymentMethods.length > 0 ? (
            <>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.paymentMethods}
                      dataKey="total"
                      nameKey="payment_method"
                      cx="50%"
                      cy="50%"
                      innerRadius={42}
                      outerRadius={70}
                      paddingAngle={3}
                      label={false}
                    >
                      {data.paymentMethods.map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => `฿${fmt(v)}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 pt-3 border-t border-slate-100 text-xs">
                {data.paymentMethods.map((p: any, i: number) => (
                  <div key={p.payment_method} className="flex items-center justify-between py-0.5">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-slate-600 font-medium">{paymentLabel[p.payment_method] || p.payment_method}</span>
                    </span>
                    <span className="font-bold text-slate-800 font-mono">฿{fmt(p.total)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-56 flex flex-col items-center justify-center text-slate-400 text-xs text-center space-y-1">
              <p className="font-semibold text-slate-500">ยังไม่มีรายการชำระเงินในเดือนนี้</p>
              <p className="text-[11px] text-slate-400">เมื่อมีการขายหน้าร้าน ระบบจะแสดงสัดส่วนที่นี่</p>
            </div>
          )}
        </div>
      </div>

      {/* Charts Row 2: Top Products & Category Revenue */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Top Products */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 text-base mb-4">สินค้าขายดี Top 10 (เดือนนี้)</h3>
          {data.topProducts && data.topProducts.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.topProducts} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="product_name" tick={{ fontSize: 10 }} width={120} />
                <Tooltip formatter={(v: any) => `${v} ชิ้น`} />
                <Bar dataKey="total_qty" fill="#3b82f6" radius={[0, 6, 6, 0]} name="จำนวนที่ขายได้" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs text-center space-y-1">
              <p className="font-semibold text-slate-500">ยังไม่มีข้อมูลการขายสินค้าในเดือนนี้</p>
              <p className="text-[11px] text-slate-400">สินค้าขายดีจะคำนวณจากบิลขายหน้าร้าน POS</p>
            </div>
          )}
        </div>

        {/* Category Revenue */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 text-base mb-4">ยอดขายตามหมวดหมู่ (เดือนนี้)</h3>
          {data.categoryRevenue && data.categoryRevenue.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.categoryRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `฿${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => `฿${fmt(v)}`} />
                <Bar dataKey="revenue" fill="#8b5cf6" radius={[6, 6, 0, 0]} name="ยอดขายรวม" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs text-center space-y-1">
              <p className="font-semibold text-slate-500">ยังไม่มีข้อมูลยอดขายตามหมวดหมู่ในเดือนนี้</p>
              <p className="text-[11px] text-slate-400">ระบบจะจัดกลุ่มยอดขายตามหมวดหมู่อัตโนมัติ</p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Stock Movements Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Clock size={18} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">ความเคลื่อนไหวสต็อกล่าสุด (Recent Movements)</h3>
              <p className="text-xs text-slate-500">ประวัติการรับเข้า เบิกจ่าย และตัดสต็อกขายหน้าร้านแบบเรียลไทม์</p>
            </div>
          </div>

          <Link
            to="/inventory"
            className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl transition-all"
          >
            <span>ดูประวัติทั้งหมด</span>
            <ChevronRight size={14} />
          </Link>
        </div>

        {data.warehouse?.recentMovements && data.warehouse.recentMovements.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-xs">
                <tr>
                  <th className="py-3 px-4">ประเภท</th>
                  <th className="py-3 px-4">สินค้า</th>
                  <th className="py-3 px-4 text-right">จำนวน</th>
                  <th className="py-3 px-4">หมายเหตุ / เลขที่อ้างอิง</th>
                  <th className="py-3 px-4">ผู้ทำรายการ</th>
                  <th className="py-3 px-4 text-right">วันเวลา</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.warehouse.recentMovements.map((m: any) => (
                  <tr key={m.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        m.type === 'IN'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : m.type === 'OUT'
                          ? 'bg-purple-100 text-purple-800 border border-purple-200'
                          : 'bg-blue-100 text-blue-800 border border-blue-200'
                      }`}>
                        {m.type === 'IN' ? '📥 รับเข้า' : m.type === 'OUT' ? '📤 เบิกจ่าย' : '🛒 ขาย POS'}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <div>
                        <p className="font-semibold text-slate-800 text-xs">{m.product_name || '-'}</p>
                        {m.barcode && (
                          <p className="text-[10px] text-slate-400 font-mono">{m.barcode}</p>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-right font-mono font-bold">
                      <span className={m.type === 'IN' ? 'text-emerald-600' : 'text-slate-800'}>
                        {m.type === 'IN' ? `+${m.qty}` : `-${m.qty}`}
                      </span>
                      <span className="text-[10px] text-slate-400 ml-1 font-normal">{m.unit || 'ชิ้น'}</span>
                    </td>

                    <td className="py-3 px-4 text-xs text-slate-600 max-w-xs truncate" title={m.note}>
                      {m.note || '-'}
                    </td>

                    <td className="py-3 px-4 text-xs text-slate-600">
                      {m.user_name || '-'}
                    </td>

                    <td className="py-3 px-4 text-right text-xs text-slate-400 font-mono">
                      {m.created_at ? new Date(m.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center text-slate-400 text-xs space-y-1">
            <p className="font-semibold text-slate-600">ยังไม่มีประวัติความเคลื่อนไหวสินค้า</p>
            <p>เมื่อมีการรับเข้า เบิกจ่าย หรือขายหน้าร้าน POS ข้อมูลจะบันทึกและแสดงที่นี่แบบเรียลไทม์</p>
          </div>
        )}
      </div>
    </div>
  );
}
