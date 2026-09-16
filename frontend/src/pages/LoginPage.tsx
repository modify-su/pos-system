import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import StoreLogo from '../components/StoreLogo';
import { Eye, EyeOff, LogIn } from 'lucide-react';

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-700 to-blue-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="mb-4">
            <StoreLogo logo={storeInfo?.logo} size="xl" className="shadow-lg" />
          </div>
          <h1 className="text-3xl font-bold text-white">
            {storeInfo?.logo?.store_name || storeInfo?.name || 'POS System'}
          </h1>
          <p className="text-blue-200 mt-1">
            {storeInfo?.logo?.store_slogan || 'ระบบจัดการร้านค้าครบวงจร'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-bold text-slate-800 mb-6">เข้าสู่ระบบ</h2>

          {error && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-2">
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
                placeholder="กรอกชื่อผู้ใช้งาน"
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
            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base mt-2">
              <LogIn size={20} />
              {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
