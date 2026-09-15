import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { Store, Eye, EyeOff, LogIn } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin1234');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(username, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setLoading(true);
    setError('');
    try {
      await login(u, p);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const accounts = [
    { u: 'admin', p: 'admin1234', r: 'ผู้ดูแลระบบ', color: 'bg-blue-100 text-blue-700' },
    { u: 'cashier', p: 'cashier1234', r: 'แคชเชียร์', color: 'bg-green-100 text-green-700' },
    { u: 'storekeeper', p: 'store1234', r: 'พนักงานคลัง', color: 'bg-orange-100 text-orange-700' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-700 to-blue-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-lg mb-4">
            <Store className="text-blue-600" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-white">POS System</h1>
          <p className="text-blue-200 mt-1">ระบบจัดการร้านค้าครบวงจร</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-bold text-slate-800 mb-6">เข้าสู่ระบบ</h2>

          {error && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm space-y-2.5">
              <div className="flex items-start gap-2">
                <span className="text-base leading-none">⚠️</span>
                <span className="font-medium text-xs sm:text-sm leading-relaxed">{error}</span>
              </div>
              <div className="pt-2 border-t border-red-200/60 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-red-600 font-medium">คลิกเพื่อเข้าด้วย admin ทันที:</span>
                <button
                  type="button"
                  onClick={() => handleQuickLogin('admin', 'admin1234')}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-xs transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  คลิกเข้าสู่ระบบ (admin)
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-slate-700">ชื่อผู้ใช้ (Username)</label>
                <span className="text-xs text-slate-400 font-mono">ค่าเริ่มต้น: admin</span>
              </div>
              <input
                className="input"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                required
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-slate-700">รหัสผ่าน (Password)</label>
                <span className="text-xs text-blue-600 font-mono font-medium">ค่าเริ่มต้น: admin1234</span>
              </div>
              <div className="relative">
                <input
                  className="input pr-12"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="admin1234 หรือ 1234"
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
            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base mt-2">
              <LogIn size={20} />
              {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>

          {/* Quick accounts */}
          <div className="mt-6 pt-6 border-t border-slate-100">
            <p className="text-xs text-slate-500 mb-3 font-medium flex items-center justify-between">
              <span>บัญชีสำหรับทดสอบ:</span>
              <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                แตะคลิกเดียวเข้าระบบได้เลย
              </span>
            </p>
            <div className="space-y-2">
              {accounts.map(a => (
                <button
                  type="button"
                  key={a.u}
                  onClick={() => handleQuickLogin(a.u, a.p)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs ${a.color} hover:opacity-90 hover:shadow-sm transition-all border border-black/5 flex items-center justify-between group active:scale-98 cursor-pointer`}
                  title={`คลิกเพื่อเข้าสู่ระบบด้วยบัญชี ${a.u}`}
                >
                  <div>
                    <span className="font-bold text-sm">{a.u}</span>
                    <span className="text-slate-600 ml-2 font-mono text-xs">(รหัส: {a.p})</span>
                  </div>
                  <span className="font-semibold text-xs opacity-80 group-hover:opacity-100 flex items-center gap-1">
                    <span>{a.r}</span>
                    <span className="text-sm font-bold">➔</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
