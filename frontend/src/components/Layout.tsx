import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useRealtimeEvent, useRealtimeStatus, reconnectSocket } from '../utils/socket';
import {
  LayoutDashboard, ShoppingCart, Package, Tags,
  Warehouse, ArrowDownCircle, ArrowUpCircle, BarChart3,
  LogOut, Store, Menu, X, Smartphone, QrCode,
  Settings as SettingsIcon
} from 'lucide-react';

interface NavItem {
  to?: string;
  icon?: any;
  label: string;
  permission?: string;
  divider?: boolean;
}

const navItems: NavItem[] = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'แดชบอร์ด', permission: 'dashboard' },
  { to: '/pos', icon: ShoppingCart, label: 'ขายสินค้า (POS)', permission: 'pos' },
  { divider: true, label: 'คลังสินค้า' },
  { to: '/inventory', icon: Warehouse, label: 'สต็อกสินค้า', permission: 'inventory' },
  { to: '/stock-in', icon: ArrowDownCircle, label: 'รับสินค้าเข้า', permission: 'stock-in' },
  { to: '/stock-out', icon: ArrowUpCircle, label: 'เบิกจ่ายสินค้า', permission: 'stock-out' },
  { divider: true, label: 'จัดการข้อมูล' },
  { to: '/products', icon: Package, label: 'สินค้า', permission: 'products' },
  { to: '/categories', icon: Tags, label: 'หมวดหมู่', permission: 'categories' },
  { divider: true, label: 'รายงาน & สถิติ' },
  { to: '/reports', icon: BarChart3, label: 'รายงานยอดขาย', permission: 'reports' },
  { divider: true, label: 'ระบบ & สิทธิ์' },
  { to: '/settings', icon: SettingsIcon, label: 'การตั้งค่า & สิทธิ์', permission: 'settings' },
];

export default function Layout() {
  const { user, logout, hasPermission } = useAuthStore();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type?: 'info' | 'success' | 'warn' } | null>(null);
  const realtimeConnected = useRealtimeStatus();

  // Realtime notification toasts
  useRealtimeEvent('sale:created', (data) => {
    setToast({
      message: `🛒 บิลขายใหม่ ${data.sale?.sale_no || ''} ยอด ฿${data.sale?.total?.toLocaleString() || 0}`,
      type: 'success',
    });
    setTimeout(() => setToast(null), 4000);
  });

  useRealtimeEvent('inventory:updated', (data) => {
    if (data.action !== 'sale') {
      const actName = data.action === 'stock_in' ? 'รับสินค้าเข้า' :
                      data.action === 'direct_stock_out' ? 'เบิกจ่ายตัดสต็อก' :
                      data.action === 'adjust' ? 'ปรับปรุงสต็อก' : 'อัปเดตสต็อก';
      setToast({
        message: `📦 อัปเดตคลังสินค้าแบบเรียลไทม์: ${actName}`,
        type: 'info',
      });
      setTimeout(() => setToast(null), 3500);
    }
  });

  useRealtimeEvent('requisition:updated', (data) => {
    setToast({
      message: `📋 คำขอเบิกสินค้า (${data.action === 'approved' ? 'อนุมัติแล้ว' : data.action === 'created' ? 'สร้างคำขอใหม่' : data.action})`,
      type: 'warn',
    });
    setTimeout(() => setToast(null), 3500);
  });

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Filter items by user permissions and clean up empty divider headers
  const filterVisibleNav = () => {
    const allowed = navItems.filter(item => {
      if (item.divider) return true;
      return item.permission ? hasPermission(item.permission) : true;
    });

    const result: NavItem[] = [];
    for (let i = 0; i < allowed.length; i++) {
      const item = allowed[i];
      if (item.divider) {
        // Look ahead to check if there are any non-divider items under this section
        let hasChildren = false;
        for (let j = i + 1; j < allowed.length; j++) {
          if (allowed[j].divider) break;
          hasChildren = true;
          break;
        }
        if (hasChildren) {
          result.push(item);
        }
      } else {
        result.push(item);
      }
    }
    return result;
  };

  const visibleItems = filterVisibleNav();

  // Determine current host/IP for mobile connection
  const mobileHost = window.location.hostname === 'localhost' ? '192.168.1.109' : window.location.hostname;
  const mobileUrl = `http://${mobileHost}:5173`;

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-slate-100 relative">
      {/* Mobile Top Header (Visible on mobile only) */}
      <header className="md:hidden bg-slate-900 text-white px-4 py-3 flex items-center justify-between shadow-md z-30 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
            <Store className="text-blue-400" size={18} />
          </div>
          <div>
            <p className="font-bold text-sm leading-tight text-white">POS System</p>
            <p className="text-[10px] text-slate-400">ระบบจัดการร้านค้า</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {realtimeConnected ? (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>เรียลไทม์</span>
            </span>
          ) : (
            <button
              onClick={reconnectSocket}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-medium active:scale-95"
              title="แตะเพื่อเชื่อมต่อใหม่"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              <span>แตะต่อใหม่</span>
            </button>
          )}

          <button
            onClick={() => setShowQrModal(true)}
            className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white active:scale-95 transition-all"
            title="QR Code เชื่อมต่อมือถือ"
          >
            <Smartphone size={18} className="text-blue-400" />
          </button>
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white active:scale-95 transition-all"
          >
            <Menu size={20} />
          </button>
        </div>
      </header>

      {/* Desktop Sidebar (Hidden on mobile) */}
      <aside className="hidden md:flex w-60 flex-shrink-0 bg-slate-900 text-slate-300 flex-col">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
              <Store className="text-blue-400" size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="font-bold text-white text-sm leading-tight truncate">POS System</p>
                {realtimeConnected ? (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-medium" title="เชื่อมต่อเซิร์ฟเวอร์เรียลไทม์แล้ว">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>สด</span>
                  </span>
                ) : (
                  <button
                    onClick={reconnectSocket}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-medium hover:bg-rose-500/30 transition-colors"
                    title="คลิกเพื่อเชื่อมต่อใหม่"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                    <span>ต่อใหม่</span>
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">ระบบจัดการร้านค้า</p>
            </div>
          </div>
        </div>

        {/* Navigation items */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {visibleItems.map((item, idx) => {
            if (item.divider) {
              return (
                <div key={idx} className="pt-4 pb-1 px-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{item.label}</p>
                </div>
              );
            }
            const Icon = item.icon!;
            return (
              <NavLink
                key={item.to}
                to={item.to!}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 group
                  ${isActive
                    ? 'bg-blue-600 text-white shadow-sm font-medium'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <Icon size={18} className="flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Mobile Quick Connect Banner */}
        <div className="px-3 pb-2">
          <button
            onClick={() => setShowQrModal(true)}
            className="w-full bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 rounded-xl p-2.5 text-left flex items-center gap-2.5 transition-colors group"
          >
            <div className="w-7 h-7 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <QrCode size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate">ใช้งานบนมือถือ</p>
              <p className="text-[10px] text-slate-400 truncate">สแกน QR เชื่อมต่อ iOS/Android</p>
            </div>
          </button>
        </div>

        {/* User Card */}
        <div className="px-3 py-3 border-t border-slate-700">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-slate-800">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{user?.name}</p>
              <p className="text-slate-400 text-xs truncate">{user?.role}</p>
            </div>
            <button onClick={handleLogout} className="text-slate-400 hover:text-red-400 transition-colors p-1" title="ออกจากระบบ">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0 relative">
        {/* Realtime Toast Notification Banner */}
        {toast && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-200 pointer-events-auto">
            <div className={`px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-3 text-sm font-medium border backdrop-blur-md ${
              toast.type === 'success' ? 'bg-slate-900 text-emerald-300 border-emerald-500/50 shadow-emerald-950/20' :
              toast.type === 'warn' ? 'bg-slate-900 text-amber-300 border-amber-500/50 shadow-amber-950/20' :
              'bg-slate-900 text-blue-300 border-blue-500/50 shadow-blue-950/20'
            }`}>
              <span>{toast.message}</span>
              <button onClick={() => setToast(null)} className="text-slate-400 hover:text-white ml-1">
                <X size={14} />
              </button>
            </div>
          </div>
        )}
        <Outlet />
      </main>

      {/* Mobile Bottom Navigation Bar (Visible on mobile only) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 flex items-center justify-around z-30 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
        {hasPermission('pos') && (
          <NavLink
            to="/pos"
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 text-[10px] font-medium py-1 px-3 rounded-xl transition-all ${
                isActive ? 'text-blue-600 font-bold bg-blue-50' : 'text-slate-500'
              }`
            }
          >
            <ShoppingCart size={19} />
            <span>ขาย POS</span>
          </NavLink>
        )}

        {hasPermission('inventory') && (
          <NavLink
            to="/inventory"
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 text-[10px] font-medium py-1 px-3 rounded-xl transition-all ${
                isActive ? 'text-blue-600 font-bold bg-blue-50' : 'text-slate-500'
              }`
            }
          >
            <Warehouse size={19} />
            <span>สต็อก</span>
          </NavLink>
        )}

        {hasPermission('stock-out') && (
          <NavLink
            to="/stock-out"
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 text-[10px] font-medium py-1 px-3 rounded-xl transition-all ${
                isActive ? 'text-blue-600 font-bold bg-blue-50' : 'text-slate-500'
              }`
            }
          >
            <ArrowUpCircle size={19} />
            <span>เบิกจ่าย</span>
          </NavLink>
        )}

        {hasPermission('dashboard') && (
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 text-[10px] font-medium py-1 px-3 rounded-xl transition-all ${
                isActive ? 'text-blue-600 font-bold bg-blue-50' : 'text-slate-500'
              }`
            }
          >
            <LayoutDashboard size={19} />
            <span>แดชบอร์ด</span>
          </NavLink>
        )}

        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center gap-0.5 text-[10px] font-medium py-1 px-3 rounded-xl text-slate-500 hover:text-slate-900"
        >
          <Menu size={19} />
          <span>เมนู</span>
        </button>
      </nav>

      {/* Mobile Slide-Out Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden animate-fadeIn">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer Body */}
          <div className="relative w-72 max-w-[80vw] bg-slate-900 text-slate-300 h-full flex flex-col shadow-2xl z-10 animate-slideRight">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                  <Store className="text-blue-400" size={18} />
                </div>
                <div>
                  <p className="font-bold text-white text-sm">POS System</p>
                  <p className="text-[10px] text-slate-400">ระบบจัดการร้านค้า</p>
                </div>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="text-slate-400 hover:text-white p-1">
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {visibleItems.map((item, idx) => {
                if (item.divider) {
                  return (
                    <div key={idx} className="pt-3 pb-1 px-2">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{item.label}</p>
                    </div>
                  );
                }
                const Icon = item.icon!;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to!}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                        isActive
                          ? 'bg-blue-600 text-white font-medium shadow-sm'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                      }`
                    }
                  >
                    <Icon size={18} className="flex-shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>

            {/* Mobile User Profile & Logout */}
            <div className="p-3 border-t border-slate-700 bg-slate-800/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                    {user?.name?.charAt(0) || 'U'}
                  </div>
                  <div className="truncate">
                    <p className="text-white text-xs font-semibold truncate">{user?.name}</p>
                    <p className="text-slate-400 text-[10px] truncate">{user?.role}</p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-1.5 text-slate-400 hover:text-red-400 transition-colors"
                  title="ออกจากระบบ"
                >
                  <LogOut size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Connect QR Code Modal */}
      {showQrModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center space-y-4 animate-scaleIn">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2 text-blue-600">
                <Smartphone size={20} />
                <h3 className="font-bold text-slate-800 text-base">ใช้งานผ่านมือถือ (iOS / Android)</h3>
              </div>
              <button onClick={() => setShowQrModal(false)} className="text-slate-400 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              นำกล้องมือถือ iPhone (iOS) หรือ Android มาสแกน QR Code นี้เพื่อเปิดใช้งานระบบทันที (เชื่อมต่อ Wi-Fi เดียวกัน)
            </p>

            {/* QR Code Image */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 inline-block shadow-inner">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(mobileUrl)}`}
                alt="Mobile Connection QR"
                className="w-48 h-48 mx-auto rounded-lg"
              />
            </div>

            <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200 text-left text-[11px] text-amber-800 space-y-1">
              <p className="font-semibold">📶 เครือข่าย Wi-Fi ที่ต้องเชื่อมต่อ:</p>
              <p className="text-xs font-bold text-amber-900">• เชื่อมต่อ Wi-Fi เดียวกันกับคอมพิวเตอร์ (เช่น Wi-Fi ที่บ้าน/ร้าน)</p>
              <p className="text-[10px] text-amber-700">*หมายเหตุ: หากมือถือใช้เน็ตซิม (4G/5G) จะเชื่อมต่อไม่ได้ ต้องต่อ Wi-Fi เท่านั้น</p>
            </div>

            <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 text-left text-[11px] text-emerald-800 space-y-1">
              <p className="font-semibold">⚡ ซิงค์ข้อมูลเรียลไทม์ (Real-time Sync):</p>
              <p>• เมื่อเข้าสู่ระบบ จะมีจุดไฟเขียว <span className="font-bold text-emerald-700">🟢 เรียลไทม์</span> แสดงที่แถบด้านบน</p>
              <p>• ยิงบาร์โค้ดจากมือถือ รายการจะเด้งไปที่หน้าจอคอมพิวเตอร์ทันที</p>
              <p>• ขายสินค้าหรือรับของเข้าสต็อก ข้อมูลอัปเดตตรงกันทันทีแบบสดๆ</p>
            </div>

            <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 text-left space-y-1">
              <p className="text-[11px] font-semibold text-blue-800">🌐 หรือพิมพ์ลิงก์นี้ใน Safari หรือ Chrome บนมือถือ:</p>
              <p className="text-xs font-mono font-bold text-blue-700 break-all select-all">{mobileUrl}</p>
            </div>

            <div className="text-left text-[11px] text-slate-500 space-y-1 pt-1 border-t border-slate-100">
              <p>💡 <strong>ติดตั้งเป็นแอป (PWA):</strong></p>
              <p>• <strong>iOS (Safari):</strong> กดปุ่ม Share ➡️ เลือก <em>"เพิ่มไปยังหน้าจอโฮม (Add to Home Screen)"</em></p>
              <p>• <strong>Android (Chrome):</strong> กด 3 จุด ➡️ เลือก <em>"ติดตั้งแอป (Install App)"</em></p>
            </div>

            <button onClick={() => setShowQrModal(false)} className="btn-primary w-full py-2.5 text-sm font-semibold">
              ตกลง
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
