import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import POSSale from './pages/POSSale';
import Products from './pages/Products';
import Categories from './pages/Categories';
import StockIn from './pages/StockIn';
import StockOut from './pages/StockOut';
import Inventory from './pages/Inventory';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import { ShieldAlert } from 'lucide-react';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuthStore();
  const isAuth = !!user || !!token;
  return isAuth ? <>{children}</> : <Navigate to="/login" replace />;
}

function AccessDenied({ permission }: { permission: string }) {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center animate-fadeIn">
      <div className="w-16 h-16 rounded-2xl bg-rose-100 border border-rose-200 text-rose-600 flex items-center justify-center mb-4 shadow-sm">
        <ShieldAlert size={32} />
      </div>
      <h2 className="text-xl font-bold text-slate-800 mb-1">ไม่มีสิทธิ์เข้าถึงหน้านี้ (Access Denied)</h2>
      <p className="text-sm text-slate-500 max-w-md mb-6 leading-relaxed">
        บัญชีผู้ใช้งานของคุณ (<span className="font-semibold text-slate-700">{user?.name}</span> - บทบาท {user?.role})
        ไม่ได้รับสิทธิ์ในการเข้าถึงเมนู <code className="px-2 py-0.5 rounded bg-slate-100 font-mono text-rose-600 text-xs">{permission}</code> กรุณาติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์การใช้งาน
      </p>
      <button
        onClick={() => navigate('/dashboard')}
        className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
      >
        กลับไปยังหน้าแรก
      </button>
    </div>
  );
}

function PermissionRoute({ permission, children }: { permission: string; children: React.ReactNode }) {
  const { hasPermission } = useAuthStore();
  if (!hasPermission(permission)) {
    return <AccessDenied permission={permission} />;
  }
  return <>{children}</>;
}

export default function App() {
  const { checkSession } = useAuthStore();

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route
            path="dashboard"
            element={
              <PermissionRoute permission="dashboard">
                <Dashboard />
              </PermissionRoute>
            }
          />
          <Route
            path="pos"
            element={
              <PermissionRoute permission="pos">
                <POSSale />
              </PermissionRoute>
            }
          />
          <Route
            path="products"
            element={
              <PermissionRoute permission="products">
                <Products />
              </PermissionRoute>
            }
          />
          <Route
            path="categories"
            element={
              <PermissionRoute permission="categories">
                <Categories />
              </PermissionRoute>
            }
          />
          <Route
            path="inventory"
            element={
              <PermissionRoute permission="inventory">
                <Inventory />
              </PermissionRoute>
            }
          />
          <Route
            path="stock-in"
            element={
              <PermissionRoute permission="stock-in">
                <StockIn />
              </PermissionRoute>
            }
          />
          <Route
            path="stock-out"
            element={
              <PermissionRoute permission="stock-out">
                <StockOut />
              </PermissionRoute>
            }
          />
          <Route
            path="reports"
            element={
              <PermissionRoute permission="reports">
                <Reports />
              </PermissionRoute>
            }
          />
          <Route
            path="settings"
            element={
              <PermissionRoute permission="settings">
                <Settings />
              </PermissionRoute>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
