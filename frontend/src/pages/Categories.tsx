import { useEffect, useState } from 'react';
import api from '../api/client';
import { Plus, Edit2, Trash2, X, Save } from 'lucide-react';

export default function Categories() {
  const [cats, setCats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', description: '' });

  const load = async () => {
    setLoading(true);
    const res = await api.get('/categories');
    setCats(res.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm({ name: '', description: '' }); setModal(true); };
  const openEdit = (c: any) => { setEditing(c); setForm({ name: c.name, description: c.description || '' }); setModal(true); };

  const handleSave = async () => {
    try {
      if (editing) await api.put(`/categories/${editing.id}`, form);
      else await api.post('/categories', form);
      setModal(false);
      load();
    } catch (err: any) { alert(err.response?.data?.message || 'เกิดข้อผิดพลาด'); }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`ลบหมวดหมู่ "${name}" ใช่ไหม?`)) return;
    try { await api.delete(`/categories/${id}`); load(); }
    catch (err: any) { alert(err.response?.data?.message || 'ไม่สามารถลบได้'); }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">หมวดหมู่สินค้า</h1>
        <button onClick={openNew} className="btn-primary"><Plus size={18} /> เพิ่มหมวดหมู่</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {loading ? <p className="text-slate-400">กำลังโหลด...</p> : cats.map(c => (
          <div key={c.id} className="card group">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-slate-800">{c.name}</h3>
                {c.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{c.description}</p>}
                <p className="text-xs text-blue-600 font-medium mt-2">{c.product_count} สินค้า</p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(c)} className="text-slate-400 hover:text-blue-600"><Edit2 size={15} /></button>
                <button onClick={() => handleDelete(c.id, c.name)} className="text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-96 shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{editing ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่'}</h2>
              <button onClick={() => setModal(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อหมวดหมู่ *</label>
                <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="ชื่อหมวดหมู่" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">รายละเอียด</label>
                <textarea className="input resize-none h-20" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="รายละเอียด..." />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setModal(false)} className="btn-secondary flex-1">ยกเลิก</button>
                <button onClick={handleSave} disabled={!form.name} className="btn-primary flex-1"><Save size={16} /> บันทึก</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
