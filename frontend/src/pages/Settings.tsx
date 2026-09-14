import { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuthStore } from '../stores/authStore';
import {
  Users, Shield, Store, Plus, Edit2, Trash2,
  X, AlertCircle, Save, RefreshCw, CheckCircle2,
  LayoutDashboard, ShoppingCart, Warehouse, ArrowDownCircle,
  ArrowUpCircle, Package, Tags, BarChart3, Settings as SettingsIcon,
  Lock, Eye, EyeOff, UserCheck, UserX
} from 'lucide-react';

interface UserData {
  id: number;
  username: string;
  name: string;
  role: 'admin' | 'cashier' | 'storekeeper';
  active: number;
  permissions: string[] | null;
  created_at?: string;
}

interface StoreInfo {
  name: string;
  tax_id: string;
  phone: string;
  address: string;
  receipt_footer: string;
}

const ALL_MENU_PERMISSIONS = [
  {
    key: 'dashboard',
    label: 'แดชบอร์ด & สถิติ',
    desc: 'ดูสรุปยอดขาย กำไร กราฟวิเคราะห์ และแจ้งเตือนสต็อก',
    icon: LayoutDashboard,
    color: 'text-blue-600 bg-blue-50 border-blue-200',
  },
  {
    key: 'pos',
    label: 'ขายสินค้าหน้าร้าน (POS)',
    desc: 'ระบบคิดเงิน สแกนบาร์โค้ด รับชำระเงิน พิมพ์ใบเสร็จ',
    icon: ShoppingCart,
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  },
  {
    key: 'inventory',
    label: 'สต็อกสินค้าคงคลัง',
    desc: 'ตรวจสอบสต็อก ปรับยอด และดูประวัติความเคลื่อนไหว',
    icon: Warehouse,
    color: 'text-amber-600 bg-amber-50 border-amber-200',
  },
  {
    key: 'stock-in',
    label: 'รับสินค้าเข้าคลัง',
    desc: 'บันทึกรับเข้า สร้างสินค้าใหม่ สแกนรับ พิมพ์ป้ายบาร์โค้ด',
    icon: ArrowDownCircle,
    color: 'text-cyan-600 bg-cyan-50 border-cyan-200',
  },
  {
    key: 'stock-out',
    label: 'เบิกจ่ายสินค้า',
    desc: 'สแกนเบิกสินค้า ตัดสต็อกทันที ขออนุมัติเบิก พิมพ์ใบเบิก',
    icon: ArrowUpCircle,
    color: 'text-purple-600 bg-purple-50 border-purple-200',
  },
  {
    key: 'products',
    label: 'จัดการข้อมูลสินค้า',
    desc: 'เพิ่ม แก้ไข ลบสินค้า กำหนดราคา รูปภาพ และบาร์โค้ด',
    icon: Package,
    color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
  },
  {
    key: 'categories',
    label: 'หมวดหมู่สินค้า',
    desc: 'จัดการกลุ่มหมวดหมู่สินค้าสำหรับการจัดหมวดหมู่',
    icon: Tags,
    color: 'text-orange-600 bg-orange-50 border-orange-200',
  },
  {
    key: 'reports',
    label: 'รายงาน & การวิเคราะห์',
    desc: 'รายงานยอดขาย มูลค่าสต็อก กำไร และส่งออกไฟล์ Excel',
    icon: BarChart3,
    color: 'text-rose-600 bg-rose-50 border-rose-200',
  },
  {
    key: 'settings',
    label: 'การตั้งค่า & สิทธิ์ผู้ใช้',
    desc: 'จัดการบัญชีผู้ใช้งาน กำหนดสิทธิ์เมนู ข้อมูลร้านค้า',
    icon: SettingsIcon,
    color: 'text-slate-600 bg-slate-100 border-slate-200',
  },
];

const DEFAULT_ROLE_PERMS: Record<string, string[]> = {
  admin: ['dashboard', 'pos', 'inventory', 'stock-in', 'stock-out', 'products', 'categories', 'reports', 'settings'],
  cashier: ['dashboard', 'pos', 'stock-out'],
  storekeeper: ['dashboard', 'inventory', 'stock-in', 'stock-out'],
};

export default function Settings() {
  const { user: currentUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'store'>('users');
  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Users State
  const [users, setUsers] = useState<UserData[]>([]);
  const [searchUser, setSearchUser] = useState('');
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);

  // User Form State
  const [formUsername, setFormUsername] = useState('');
  const [formName, setFormName] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formRole, setFormRole] = useState<'admin' | 'cashier' | 'storekeeper'>('cashier');
  const [formActive, setFormActive] = useState(true);
  const [formPermissions, setFormPermissions] = useState<string[]>([]);

  // Role Defaults State
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>(DEFAULT_ROLE_PERMS);

  // Store Profile State
  const [storeInfo, setStoreInfo] = useState<StoreInfo>({
    name: 'ระบบจัดการคลังและจุดขาย (Smart POS & Warehouse)',
    tax_id: '',
    phone: '',
    address: '',
    receipt_footer: 'ขอบคุณที่ใช้บริการ / Thank you',
  });

  const notifySuccess = (msg: string) => {
    setSuccessMsg(msg);
    setErrorMsg(null);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  const notifyError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 5000);
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersRes, settingsRes] = await Promise.all([
        api.get('/users'),
        api.get('/settings'),
      ]);

      setUsers(usersRes.data || []);

      if (settingsRes.data) {
        if (settingsRes.data.role_permissions) {
          setRolePermissions(settingsRes.data.role_permissions);
        }
        if (settingsRes.data.store_info) {
          setStoreInfo(settingsRes.data.store_info);
        }
      }
    } catch (err: any) {
      notifyError(err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลการตั้งค่าได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Open Create User Modal
  const handleOpenCreateModal = () => {
    setEditingUser(null);
    setFormUsername('');
    setFormName('');
    setFormPassword('');
    setShowPassword(false);
    setFormRole('cashier');
    setFormActive(true);
    // Use cashier default permissions
    const defaults = rolePermissions.cashier || DEFAULT_ROLE_PERMS.cashier;
    setFormPermissions([...defaults]);
    setIsUserModalOpen(true);
  };

  // Open Edit User Modal
  const handleOpenEditModal = (u: UserData) => {
    setEditingUser(u);
    setFormUsername(u.username);
    setFormName(u.name);
    setFormPassword('');
    setShowPassword(false);
    setFormRole(u.role);
    setFormActive(u.active === 1);

    // If user has specific permissions, use them, otherwise use role defaults
    if (u.permissions && Array.isArray(u.permissions) && u.permissions.length > 0) {
      setFormPermissions([...u.permissions]);
    } else {
      const defaults = rolePermissions[u.role] || DEFAULT_ROLE_PERMS[u.role] || [];
      setFormPermissions([...defaults]);
    }

    setIsUserModalOpen(true);
  };

  // Handle Role change in form -> option to auto sync permissions
  const handleRoleChange = (newRole: 'admin' | 'cashier' | 'storekeeper') => {
    setFormRole(newRole);
    if (newRole === 'admin') {
      setFormPermissions(ALL_MENU_PERMISSIONS.map(p => p.key));
    } else {
      const defaults = rolePermissions[newRole] || DEFAULT_ROLE_PERMS[newRole] || [];
      setFormPermissions([...defaults]);
    }
  };

  // Toggle permission item checkbox
  const togglePermission = (permKey: string) => {
    if (formPermissions.includes(permKey)) {
      setFormPermissions(formPermissions.filter(k => k !== permKey));
    } else {
      setFormPermissions([...formPermissions, permKey]);
    }
  };

  // Select all permissions
  const handleSelectAllPerms = () => {
    setFormPermissions(ALL_MENU_PERMISSIONS.map(p => p.key));
  };

  // Clear all permissions
  const handleClearAllPerms = () => {
    // Keep dashboard for safety
    setFormPermissions(['dashboard']);
  };

  // Reset to current role defaults
  const handleResetToRoleDefaults = () => {
    const defaults = rolePermissions[formRole] || DEFAULT_ROLE_PERMS[formRole] || [];
    setFormPermissions([...defaults]);
  };

  // Save User (Create or Update)
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formUsername.trim() || !formName.trim()) {
      notifyError('กรุณากรอก Username และชื่อผู้ใช้งาน');
      return;
    }

    if (!editingUser && !formPassword.trim()) {
      notifyError('กรุณากำหนดรหัสผ่านสำหรับผู้ใช้งานใหม่');
      return;
    }

    if (formPassword.trim() && formPassword.trim().length < 4) {
      notifyError('รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร');
      return;
    }

    try {
      setSaveLoading(true);

      const payload: any = {
        name: formName.trim(),
        role: formRole,
        active: formActive ? 1 : 0,
        permissions: formPermissions,
      };

      if (!editingUser) {
        payload.username = formUsername.trim();
        payload.password = formPassword.trim();
        await api.post('/users', payload);
        notifySuccess('สร้างผู้ใช้งานใหม่เรียบร้อยแล้ว');
      } else {
        if (formPassword.trim()) {
          payload.password = formPassword.trim();
        }
        await api.put(`/users/${editingUser.id}`, payload);
        notifySuccess('บันทึกการแก้ไขข้อมูลผู้ใช้งานเรียบร้อยแล้ว');
      }

      setIsUserModalOpen(false);
      await fetchData();
    } catch (err: any) {
      notifyError(err.response?.data?.message || 'เกิดข้อผิดพลาดในการบันทึกผู้ใช้');
    } finally {
      setSaveLoading(false);
    }
  };

  // Delete User
  const handleDeleteUser = async (u: UserData) => {
    if (u.id === currentUser?.id) {
      notifyError('คุณไม่สามารถลบบัญชีที่กำลังล็อกอินอยู่ได้');
      return;
    }

    if (!confirm(`คุณต้องการลบหรือระงับผู้ใช้งาน "${u.name} (${u.username})" ใช่หรือไม่?`)) {
      return;
    }

    try {
      const res = await api.delete(`/users/${u.id}`);
      notifySuccess(res.data?.message || 'ลบผู้ใช้งานสำเร็จ');
      await fetchData();
    } catch (err: any) {
      notifyError(err.response?.data?.message || 'ไม่สามารถลบผู้ใช้งานได้');
    }
  };

  // Toggle user active status quickly from table
  const handleToggleUserActive = async (u: UserData) => {
    if (u.id === currentUser?.id) {
      notifyError('คุณไม่สามารถปิดการใช้งานบัญชีตนเองได้');
      return;
    }

    try {
      const newStatus = u.active === 1 ? 0 : 1;
      await api.put(`/users/${u.id}`, { active: newStatus });
      notifySuccess(`${newStatus === 1 ? 'เปิด' : 'ระงับ'}การใช้งาน "${u.name}" สำเร็จ`);
      await fetchData();
    } catch (err: any) {
      notifyError(err.response?.data?.message || 'ไม่สามารถเปลี่ยนสถานะได้');
    }
  };

  // Toggle Role Template Permission
  const toggleRoleDefaultPerm = (role: string, permKey: string) => {
    // Admin must keep settings
    if (role === 'admin' && permKey === 'settings') {
      return;
    }

    setRolePermissions(prev => {
      const currentList = prev[role] || [];
      const updated = currentList.includes(permKey)
        ? currentList.filter(k => k !== permKey)
        : [...currentList, permKey];
      return {
        ...prev,
        [role]: updated,
      };
    });
  };

  // Save Role Defaults
  const handleSaveRoleDefaults = async () => {
    try {
      setSaveLoading(true);
      await api.put('/settings/roles', rolePermissions);
      notifySuccess('บันทึกสิทธิ์เริ่มต้นของแต่ละบทบาทเรียบร้อยแล้ว');
      await fetchData();
    } catch (err: any) {
      notifyError(err.response?.data?.message || 'เกิดข้อผิดพลาดในการบันทึกสิทธิ์บทบาท');
    } finally {
      setSaveLoading(false);
    }
  };

  // Save Store Profile
  const handleSaveStoreProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaveLoading(true);
      await api.put('/settings/store', storeInfo);
      notifySuccess('บันทึกข้อมูลร้านค้าเรียบร้อยแล้ว');
      await fetchData();
    } catch (err: any) {
      notifyError(err.response?.data?.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูลร้าน');
    } finally {
      setSaveLoading(false);
    }
  };

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(searchUser.toLowerCase()) ||
    u.username.toLowerCase().includes(searchUser.toLowerCase()) ||
    u.role.toLowerCase().includes(searchUser.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-blue-600/10 border border-blue-200 flex items-center justify-center text-blue-600 flex-shrink-0">
            <SettingsIcon size={26} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800">ตั้งค่าระบบและการเข้าถึง</h1>
            <p className="text-xs md:text-sm text-slate-500 mt-0.5">
              จัดการบัญชีผู้ใช้งาน สิทธิ์การเข้าถึงเมนูต่างๆ และข้อมูลร้านค้า
            </p>
          </div>
        </div>

        {/* Global Refresh */}
        <button
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm font-medium transition-all self-start sm:self-auto"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin text-blue-600' : ''} />
          <span>รีเฟรชข้อมูล</span>
        </button>
      </div>

      {/* Toast Notification Alerts */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl flex items-center gap-3 animate-fadeIn">
          <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0" />
          <span className="text-sm font-medium">{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-center gap-3 animate-fadeIn">
          <AlertCircle size={20} className="text-rose-600 flex-shrink-0" />
          <span className="text-sm font-medium">{errorMsg}</span>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 space-x-2 md:space-x-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab('users')}
          className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'users'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <Users size={18} />
          <span>ผู้ใช้งาน & สิทธิ์รายบุคคล</span>
          <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600 font-semibold">
            {users.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('roles')}
          className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'roles'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <Shield size={18} />
          <span>สิทธิ์เริ่มต้นตามบทบาท</span>
        </button>

        <button
          onClick={() => setActiveTab('store')}
          className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'store'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <Store size={18} />
          <span>ข้อมูลร้านค้า & ทั่วไป</span>
        </button>
      </div>

      {/* TAB 1: USERS & GRANULAR PERMISSIONS */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="ค้นหาชื่อผู้ใช้, นามสกุล หรือบทบาท..."
                value={searchUser}
                onChange={(e) => setSearchUser(e.target.value)}
                className="w-full px-4 py-2.5 pl-10 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm"
              />
              <Users size={18} className="absolute left-3.5 top-3 text-slate-400 pointer-events-none" />
            </div>

            {/* Add User Button */}
            <button
              onClick={handleOpenCreateModal}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold bg-blue-600 text-white hover:bg-blue-700 active:scale-95 transition-all text-sm shadow-sm"
            >
              <Plus size={18} />
              <span>เพิ่มผู้ใช้งานใหม่</span>
            </button>
          </div>

          {/* User Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-4">ผู้ใช้งาน</th>
                    <th className="py-3.5 px-4">Username</th>
                    <th className="py-3.5 px-4">บทบาท (Role)</th>
                    <th className="py-3.5 px-4">สิทธิ์การเข้าถึงเมนู</th>
                    <th className="py-3.5 px-4 text-center">สถานะ</th>
                    <th className="py-3.5 px-4 text-right">การกระทำ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        ไม่พบผู้ใช้งานตามเงื่อนไขที่ค้นหา
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      // Determine resolved permissions count
                      const userPerms = u.permissions && u.permissions.length > 0
                        ? u.permissions
                        : rolePermissions[u.role] || DEFAULT_ROLE_PERMS[u.role] || [];
                      const isCustom = !!(u.permissions && u.permissions.length > 0);

                      return (
                        <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-sm flex-shrink-0">
                                {u.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-semibold text-slate-800 leading-tight">{u.name}</p>
                                {u.id === currentUser?.id && (
                                  <span className="text-[10px] text-blue-600 font-medium bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                    คุณ (ล็อกอินอยู่)
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 font-mono text-slate-600 text-xs">
                            {u.username}
                          </td>

                          <td className="py-3.5 px-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                              u.role === 'admin'
                                ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                : u.role === 'cashier'
                                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                : 'bg-blue-100 text-blue-700 border border-blue-200'
                            }`}>
                              {u.role === 'admin' ? '👑 ผู้ดูแลระบบ' : u.role === 'cashier' ? '🛒 แคชเชียร์' : '📦 พนักงานคลัง'}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5 flex-wrap max-w-md">
                              {u.role === 'admin' ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-lg border border-purple-200">
                                  <Shield size={13} />
                                  เต็มสิทธิ์ทุกเมนู (9/9)
                                </span>
                              ) : (
                                <>
                                  <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg">
                                    {userPerms.length} จาก 9 เมนู
                                  </span>
                                  {isCustom ? (
                                    <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-medium">
                                      กำหนดเฉพาะตัว
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                                      ตามบทบาท
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            <button
                              onClick={() => handleToggleUserActive(u)}
                              disabled={u.id === currentUser?.id}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                                u.active === 1
                                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                  : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                              } ${u.id === currentUser?.id ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
                              title={u.id === currentUser?.id ? 'ไม่สามารถเปลี่ยนสถานะตนเอง' : 'คลิกเพื่อเปลี่ยนสถานะ'}
                            >
                              {u.active === 1 ? (
                                <>
                                  <UserCheck size={13} />
                                  เปิดใช้งาน
                                </>
                              ) : (
                                <>
                                  <UserX size={13} />
                                  ระงับการใช้งาน
                                </>
                              )}
                            </button>
                          </td>

                          <td className="py-3.5 px-4 text-right space-x-1">
                            <button
                              onClick={() => handleOpenEditModal(u)}
                              className="p-1.5 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title="แก้ไขข้อมูลและสิทธิ์"
                            >
                              <Edit2 size={16} />
                            </button>

                            {u.id !== currentUser?.id && (
                              <button
                                onClick={() => handleDeleteUser(u)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                title="ลบผู้ใช้งาน"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ROLE DEFAULT TEMPLATES */}
      {activeTab === 'roles' && (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3 text-blue-900 text-sm">
            <AlertCircle size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">สิทธิ์เริ่มต้นตามบทบาท (Role Default Templates)</p>
              <p className="text-xs text-blue-700 mt-0.5">
                กำหนดสิทธิ์เมนูเริ่มต้นให้กับผู้ใช้งานในแต่ละบทบาท หากผู้ใช้งานไม่ได้กำหนดสิทธิ์เฉพาะตัว
                ระบบจะใช้สิทธิ์เริ่มต้นของบทบาทนั้นๆ โดยอัตโนมัติ
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 1. Admin Role */}
            <div className="bg-white rounded-2xl border border-purple-200 shadow-sm overflow-hidden flex flex-col">
              <div className="bg-gradient-to-r from-purple-500 to-indigo-600 p-4 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-base">
                    <span>👑 ผู้ดูแลระบบ (Admin)</span>
                  </div>
                  <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-mono">
                    Full Access
                  </span>
                </div>
                <p className="text-xs text-purple-100 mt-1">
                  เข้าถึงและจัดการได้ทุกเมนูในระบบ (ไม่สามารถปลดสิทธิ์ตั้งค่าได้เพื่อความปลอดภัย)
                </p>
              </div>

              <div className="p-4 flex-1 space-y-2.5">
                {ALL_MENU_PERMISSIONS.map((perm) => {
                  const Icon = perm.icon;
                  const isChecked = rolePermissions.admin?.includes(perm.key) ?? true;
                  const isLocked = perm.key === 'settings' || perm.key === 'dashboard';

                  return (
                    <label
                      key={perm.key}
                      className={`flex items-start gap-3 p-2.5 rounded-xl border transition-all ${
                        isChecked ? 'bg-purple-50/50 border-purple-200' : 'bg-slate-50 border-slate-200 opacity-60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isLocked}
                        onChange={() => toggleRoleDefaultPerm('admin', perm.key)}
                        className="mt-1 w-4 h-4 text-purple-600 rounded focus:ring-purple-500 border-slate-300"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Icon size={15} className="text-purple-600" />
                          <span className="font-semibold text-xs text-slate-800">{perm.label}</span>
                          {isLocked && (
                            <span title="บังคับเปิดสำหรับ Admin">
                              <Lock size={12} className="text-slate-400" />
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">{perm.desc}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 2. Cashier Role */}
            <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm overflow-hidden flex flex-col">
              <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-4 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-base">
                    <span>🛒 แคชเชียร์ (Cashier)</span>
                  </div>
                  <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-mono">
                    {rolePermissions.cashier?.length || 0} เมนู
                  </span>
                </div>
                <p className="text-xs text-emerald-100 mt-1">
                  เหมาะสำหรับพนักงานขายหน้าร้าน คิดเงิน และเบิกจ่ายสินค้า
                </p>
              </div>

              <div className="p-4 flex-1 space-y-2.5">
                {ALL_MENU_PERMISSIONS.map((perm) => {
                  const Icon = perm.icon;
                  const isChecked = rolePermissions.cashier?.includes(perm.key) ?? false;

                  return (
                    <label
                      key={perm.key}
                      className={`flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${
                        isChecked ? 'bg-emerald-50/50 border-emerald-200' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleRoleDefaultPerm('cashier', perm.key)}
                        className="mt-1 w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 border-slate-300"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Icon size={15} className="text-emerald-600" />
                          <span className="font-semibold text-xs text-slate-800">{perm.label}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">{perm.desc}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 3. Storekeeper Role */}
            <div className="bg-white rounded-2xl border border-blue-200 shadow-sm overflow-hidden flex flex-col">
              <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-4 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-base">
                    <span>📦 พนักงานคลัง (Storekeeper)</span>
                  </div>
                  <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-mono">
                    {rolePermissions.storekeeper?.length || 0} เมนู
                  </span>
                </div>
                <p className="text-xs text-blue-100 mt-1">
                  เหมาะสำหรับฝ่ายรับของเข้าคลัง เช็คสต็อก และเบิกจ่ายของ
                </p>
              </div>

              <div className="p-4 flex-1 space-y-2.5">
                {ALL_MENU_PERMISSIONS.map((perm) => {
                  const Icon = perm.icon;
                  const isChecked = rolePermissions.storekeeper?.includes(perm.key) ?? false;

                  return (
                    <label
                      key={perm.key}
                      className={`flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${
                        isChecked ? 'bg-blue-50/50 border-blue-200' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleRoleDefaultPerm('storekeeper', perm.key)}
                        className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-slate-300"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Icon size={15} className="text-blue-600" />
                          <span className="font-semibold text-xs text-slate-800">{perm.label}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">{perm.desc}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Save Button for Role Defaults */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleSaveRoleDefaults}
              disabled={saveLoading}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 active:scale-95 transition-all shadow-md text-sm"
            >
              <Save size={18} />
              <span>{saveLoading ? 'กำลังบันทึก...' : 'บันทึกสิทธิ์เริ่มต้นตามบทบาท'}</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: STORE PROFILE & GENERAL SETTINGS */}
      {activeTab === 'store' && (
        <form onSubmit={handleSaveStoreProfile} className="max-w-3xl space-y-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-800">ข้อมูลร้านค้า และการออกใบเสร็จ</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              ข้อมูลนี้จะปรากฏที่หัวกระดาษและท้ายกระดาษของใบเสร็จรับเงิน ใบรับของ และใบเบิกจ่ายสินค้า
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-1">
              <label className="text-xs font-bold text-slate-700">ชื่อร้าน / ชื่อสถานประกอบการ *</label>
              <input
                type="text"
                required
                value={storeInfo.name}
                onChange={(e) => setStoreInfo({ ...storeInfo, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="เช่น ร้านสมาร์ทมาร์ท สาขาหลัก"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">เลขประจำตัวผู้เสียภาษี (Tax ID)</label>
              <input
                type="text"
                value={storeInfo.tax_id}
                onChange={(e) => setStoreInfo({ ...storeInfo, tax_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="เลข 13 หลัก เช่น 0105558000000"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">เบอร์โทรศัพท์ติดต่อ</label>
              <input
                type="text"
                value={storeInfo.phone}
                onChange={(e) => setStoreInfo({ ...storeInfo, phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="เช่น 02-123-4567, 089-123-4567"
              />
            </div>

            <div className="md:col-span-2 space-y-1">
              <label className="text-xs font-bold text-slate-700">ที่อยู่ร้านค้า</label>
              <textarea
                rows={2}
                value={storeInfo.address}
                onChange={(e) => setStoreInfo({ ...storeInfo, address: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="เลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์"
              />
            </div>

            <div className="md:col-span-2 space-y-1">
              <label className="text-xs font-bold text-slate-700">ข้อความท้ายใบเสร็จ (Receipt Footer)</label>
              <input
                type="text"
                value={storeInfo.receipt_footer}
                onChange={(e) => setStoreInfo({ ...storeInfo, receipt_footer: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="เช่น ขอบคุณที่ใช้บริการ / สินค้าซื้อแล้วไม่รับเปลี่ยนคืน"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              type="submit"
              disabled={saveLoading}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 active:scale-95 transition-all shadow-sm text-sm"
            >
              <Save size={18} />
              <span>{saveLoading ? 'กำลังบันทึก...' : 'บันทึกข้อมูลร้านค้า'}</span>
            </button>
          </div>
        </form>
      )}

      {/* USER CREATE / EDIT MODAL */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-scaleIn">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  {editingUser ? <Edit2 size={18} /> : <Plus size={20} />}
                </div>
                <div>
                  <h3 className="font-bold text-base">
                    {editingUser ? `แก้ไขผู้ใช้งาน: ${editingUser.name}` : 'เพิ่มผู้ใช้งานใหม่'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    กำหนดบทบาทและสิทธิ์การเข้าถึงเมนูต่างๆ ของระบบ
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsUserModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveUser} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              {/* Basic Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Username (ใช้สำหรับเข้าสู่ระบบ) *</label>
                  <input
                    type="text"
                    required
                    disabled={!!editingUser}
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
                    placeholder="เช่น somchai_pos"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">ชื่อ-นามสกุล ผู้ใช้งาน *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="เช่น นายสมชาย ใจดี"
                  />
                </div>

                {/* Password field */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">
                      {editingUser ? 'เปลี่ยนรหัสผ่านใหม่ (เว้นว่างไว้ถ้าไม่เปลี่ยน)' : 'รหัสผ่าน (Password) *'}
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required={!editingUser}
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={editingUser ? '•••••••• (ไม่เปลี่ยนไม่ต้องกรอก)' : 'อย่างน้อย 4 ตัวอักษร'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Role field */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">บทบาทหลัก (Role)</label>
                  <select
                    value={formRole}
                    onChange={(e) => handleRoleChange(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="cashier">🛒 พนักงานแคชเชียร์ (Cashier)</option>
                    <option value="storekeeper">📦 พนักงานคลังสินค้า (Storekeeper)</option>
                    <option value="admin">👑 ผู้ดูแลระบบ (Admin)</option>
                  </select>
                </div>
              </div>

              {/* Status active toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <p className="text-xs font-bold text-slate-800">สถานะการเข้าใช้งานระบบ</p>
                  <p className="text-[11px] text-slate-500">หากปิดการใช้งาน ผู้ใช้นี้จะไม่สามารถล็อกอินเข้าสู่ระบบได้</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formActive}
                    onChange={(e) => setFormActive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* Granular Menu Permissions Checklist */}
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                      <Shield size={16} className="text-blue-600" />
                      กำหนดสิทธิ์การเข้าถึงเมนู (Granular Menu Permissions)
                    </h4>
                    <p className="text-xs text-slate-500">
                      ทำเครื่องหมายเพื่ออนุญาตให้เข้าถึงเมนูและหน้าการทำงานนั้นๆ
                    </p>
                  </div>

                  {/* Quick select helpers */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={handleResetToRoleDefaults}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                    >
                      ตามบทบาท
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectAllPerms}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors"
                    >
                      เลือกทั้งหมด
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAllPerms}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 transition-colors"
                    >
                      ล้างสิทธิ์
                    </button>
                  </div>
                </div>

                {formRole === 'admin' && (
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-800 flex items-center gap-2">
                    <Shield size={16} className="text-purple-600 flex-shrink-0" />
                    <span>ผู้ดูแลระบบ (Admin) จะมีสิทธิ์เข้าถึงทุกเมนูโดยอัตโนมัติ</span>
                  </div>
                )}

                {/* Permissions Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {ALL_MENU_PERMISSIONS.map((perm) => {
                    const Icon = perm.icon;
                    const isChecked = formPermissions.includes(perm.key);
                    const isLocked = formRole === 'admin' && (perm.key === 'settings' || perm.key === 'dashboard');

                    return (
                      <div
                        key={perm.key}
                        onClick={() => !isLocked && togglePermission(perm.key)}
                        className={`flex items-start gap-3 p-3 rounded-xl border transition-all select-none ${
                          isChecked
                            ? 'bg-blue-50/70 border-blue-300 shadow-sm'
                            : 'bg-white border-slate-200 hover:bg-slate-50'
                        } ${isLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
                      >
                        <div className="pt-0.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isLocked}
                            onChange={() => {}} // Handled by parent div onClick
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-slate-300 pointer-events-none"
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`p-1 rounded-lg ${perm.color}`}>
                              <Icon size={14} />
                            </span>
                            <span className="font-bold text-xs text-slate-800">{perm.label}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1 leading-snug">{perm.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  ยกเลิก
                </button>

                <button
                  type="submit"
                  disabled={saveLoading}
                  className="inline-flex items-center gap-2 px-6 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
                >
                  <Save size={16} />
                  <span>{saveLoading ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
