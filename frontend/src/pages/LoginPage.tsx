import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import StoreLogo from '../components/StoreLogo';
import { Eye, EyeOff, LogIn, ShieldCheck, ShoppingCart, Package } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuthStore();
  const { storeInfo, fetchStoreInfo } = useSettingsStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetchStoreInfo();
  }, []);

  const handleSubmit = async (e?: React.FormEvent, customUser?: string, customPass?: string) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError('');
    const u = (customUser ?? username).trim();
    const p = (customPass ?? password).trim();

    if (!u || !p) {
      setError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
      setLoading(false);
      return;
    }

    try {
      await login(u, p);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    handleSubmit(undefined, u, p);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-700 to-blue-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-6 flex flex-col items-center">
          <div className="mb-4">
            <StoreLogo logo={storeInfo?.logo} size="xl" className="shadow-lg" />
          </div>
          <h1 className="text-3xl font-bold text-white">
            {storeInfo?.logo?.store_name || storeInfo?.name || 'POS System'}
          </h1>
          <p className="text-blue-200 mt-1 text-sm">
            {storeInfo?.logo?.store_slogan || 'ระบบจัดการร้านค้าและคลังสินค้าครบวงจร'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8">
          <h2 className="text-xl font-bold text-slate-800 mb-5">เข้าสู่ระบบ</h2>

          {error && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-2 animate-shake">
              <span className="text-base leading-none">⚠️</span>
              <span className="font-medium text-xs sm:text-sm leading-relaxed">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                ชื่อผู้ใช้ (Username)
              </label>
              <input
                className="input"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="เช่น admin, cashier, storekeeper"
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                รหัสผ่าน (Password)
              </label>
              <div className="relative">
                <input
                  className="input pr-12"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="กรอกรหัสผ่าน"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 flex items-center justify-center cursor-pointer"
                  title={showPass ? 'ซ่อนรหัสผ่าน' : 'ดูรหัสผ่าน'}
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base mt-2 shadow-md">
              <LogIn size={20} />
              {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>

          {/* Quick Login Section */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              คลิกเพื่อเข้าสู่ระบบด่วน (Demo Accounts)
            </p>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => handleQuickLogin('admin', 'admin1234')}
                className="w-full flex items-center justify-between p-2.5 rounded-xl border border-blue-200 bg-blue-50/60 hover:bg-blue-100/80 active:scale-[0.99] transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center text-sm shadow-sm group-hover:scale-105 transition-transform">
                    <ShieldCheck size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800">ผู้ดูแลระบบ (Admin)</div>
                    <div className="text-[11px] text-slate-500 font-mono">admin / admin1234</div>
                  </div>
                </div>
                <span className="text-xs text-blue-600 font-semibold group-hover:translate-x-0.5 transition-transform">
                  เข้าใช้งาน &rarr;
                </span>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => handleQuickLogin('cashier', 'cashier1234')}
                className="w-full flex items-center justify-between p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100/80 active:scale-[0.99] transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-sm shadow-sm group-hover:scale-105 transition-transform">
                    <ShoppingCart size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800">พนักงานแคชเชียร์ (Cashier)</div>
                    <div className="text-[11px] text-slate-500 font-mono">cashier / cashier1234</div>
                  </div>
                </div>
                <span className="text-xs text-emerald-600 font-semibold group-hover:translate-x-0.5 transition-transform">
                  เข้าใช้งาน &rarr;
                </span>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => handleQuickLogin('storekeeper', 'store1234')}
                className="w-full flex items-center justify-between p-2.5 rounded-xl border border-purple-200 bg-purple-50/60 hover:bg-purple-100/80 active:scale-[0.99] transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center text-sm shadow-sm group-hover:scale-105 transition-transform">
                    <Package size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800">พนักงานคลัง (Storekeeper)</div>
                    <div className="text-[11px] text-slate-500 font-mono">storekeeper / store1234</div>
                  </div>
                </div>
                <span className="text-xs text-purple-600 font-semibold group-hover:translate-x-0.5 transition-transform">
                  เข้าใช้งาน &rarr;
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
