import { useEffect, useState } from 'react';
import api from '../api/client';
import { useRealtimeEvent } from '../utils/socket';
import {
  Search, Plus, Edit2, Trash2, X, Save, Package,
  UploadCloud, Link as LinkIcon, Image as ImageIcon, Loader2,
  QrCode, Sparkles
} from 'lucide-react';
import BarcodeLabelModal, { type LabelItem } from '../components/BarcodeLabelModal';
import BarcodeView from '../components/BarcodeView';
import QRCodeView from '../components/QRCodeView';

const fmt = (n: number) => n?.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Products() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [labelModalData, setLabelModalData] = useState<{
    title: string;
    docNo?: string;
    items: LabelItem[];
  } | null>(null);

  // Image upload state
  const [imageMode, setImageMode] = useState<'upload' | 'url'>('upload');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const load = async () => {
    setLoading(true);
    const [pRes, cRes] = await Promise.all([
      api.get('/products', { params: { search, category_id: catFilter, limit: 200 } }),
      api.get('/categories'),
    ]);
    setProducts(pRes.data);
    setCategories(cRes.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [search, catFilter]);

  // Real-time synchronization
  useRealtimeEvent('inventory:updated', () => {
    load();
  });

  const openNew = () => {
    setEditing(null);
    setForm({ unit: 'ชิ้น', cost_price: 0, sell_price: 0, stock_qty: 0, min_stock: 5, image_url: '' });
    setImageMode('upload');
    setUploadError('');
    setModal(true);
  };

  const openEdit = (p: any) => {
    setEditing(p);
    setForm({ ...p, image_url: p.image_url || '' });
    setImageMode(p.image_url?.startsWith('/uploads') ? 'upload' : 'url');
    setUploadError('');
    setModal(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    setUploading(true);
    setUploadError('');
    try {
      const res = await api.post('/products/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setForm((prev: any) => ({ ...prev, image_url: res.data.url }));
    } catch (err: any) {
      setUploadError(err.response?.data?.message || 'เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ');
    } finally {
      setUploading(false);
      // Reset input value so same file can be re-selected if needed
      e.target.value = '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/products/${editing.id}`, form);
      } else {
        await api.post('/products', form);
      }
      setModal(false);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`ลบสินค้า "${name}" ใช่ไหม?`)) return;
    await api.delete(`/products/${id}`);
    load();
  };

  const handleOpenProductBarcode = (p: any) => {
    setLabelModalData({
      title: `สร้างและพิมพ์บาร์โค้ด & QR Code: ${p.name}`,
      docNo: p.barcode,
      items: [
        {
          product_id: p.id,
          name: p.name,
          barcode: p.barcode,
          qty: Math.max(1, p.stock_qty || 1),
          unit: p.unit || 'ชิ้น',
          sell_price: p.sell_price,
          cost_price: p.cost_price,
        },
      ],
    });
    setShowLabelModal(true);
  };

  const handleOpenBatchBarcode = () => {
    if (products.length === 0) {
      alert('ไม่พบรายการสินค้าสำหรับสร้าง Barcode / QR Code');
      return;
    }
    setLabelModalData({
      title: `พิมพ์สติกเกอร์บาร์โค้ด & QR Code สินค้า (${products.length} รายการ)`,
      docNo: `PRD-${Date.now().toString().slice(-6)}`,
      items: products.map((p) => ({
        product_id: p.id,
        name: p.name,
        barcode: p.barcode,
        qty: Math.max(1, p.stock_qty || 1),
        unit: p.unit || 'ชิ้น',
        sell_price: p.sell_price,
        cost_price: p.cost_price,
      })),
    });
    setShowLabelModal(true);
  };

  const handleGenerateNewBarcode = () => {
    const newCode = `ITM${Date.now()}${Math.floor(Math.random() * 9000 + 1000)}`;
    setForm((prev: any) => ({ ...prev, barcode: newCode }));
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-slate-800">จัดการสินค้า</h1>
        <div className="flex items-center gap-2">
          {products.length > 0 && (
            <button
              type="button"
              onClick={handleOpenBatchBarcode}
              className="btn-outline flex items-center gap-1.5 text-slate-700 hover:text-blue-600 hover:border-blue-300 transition-all cursor-pointer"
              title="พิมพ์สติกเกอร์บาร์โค้ดและ QR Code ของสินค้าทั้งหมด"
            >
              <QrCode size={16} className="text-blue-600" />
              <span>สร้าง Barcode / QR Code</span>
            </button>
          )}
          <button onClick={openNew} className="btn-primary">
            <Plus size={18} /> เพิ่มสินค้า
          </button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" size={18} />
          <input className="input pl-11" placeholder="ค้นหาสินค้า..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-44" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="">ทุกหมวดหมู่</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th className="w-14 text-center">รูป</th>
              <th>บาร์โค้ด</th>
              <th>ชื่อสินค้า</th>
              <th>หมวดหมู่</th>
              <th>หน่วย</th>
              <th className="text-right">ราคาทุน</th>
              <th className="text-right">ราคาขาย</th>
              <th className="text-center">สต็อก</th>
              <th className="text-center">สต็อกขั้นต่ำ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="text-center py-8 text-slate-400">กำลังโหลด...</td></tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-12 text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Package size={40} className="text-slate-300" />
                    <p className="text-sm font-medium text-slate-600">ยังไม่มีรายการสินค้าในระบบ</p>
                    <p className="text-xs text-slate-400">สามารถกดปุ่ม "เพิ่มสินค้า" เพื่อเริ่มเพิ่มสินค้าของคุณ</p>
                  </div>
                </td>
              </tr>
            ) : products.map(p => (
              <tr key={p.id}>
                <td className="text-center">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center border border-slate-200 mx-auto">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                          const fallback = (e.target as HTMLElement).parentElement?.querySelector('.fallback-icon') as HTMLElement;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div
                      className="fallback-icon items-center justify-center"
                      style={{ display: p.image_url ? 'none' : 'flex' }}
                    >
                      <Package size={18} className="text-slate-400" />
                    </div>
                  </div>
                </td>
                <td className="font-mono text-xs text-slate-500">{p.barcode}</td>
                <td className="font-medium">{p.name}</td>
                <td className="text-slate-500 text-sm">{p.category_name}</td>
                <td className="text-slate-500 text-sm">{p.unit}</td>
                <td className="text-right text-sm">฿{fmt(p.cost_price)}</td>
                <td className="text-right font-medium text-blue-600">฿{fmt(p.sell_price)}</td>
                <td className="text-center">
                  <span className={`font-bold ${p.stock_qty <= p.min_stock ? 'text-red-600' : 'text-slate-800'}`}>{p.stock_qty}</span>
                </td>
                <td className="text-center text-slate-500">{p.min_stock}</td>
                <td>
                  <div className="flex gap-1 justify-end">
                    <button
                      type="button"
                      onClick={() => handleOpenProductBarcode(p)}
                      className="btn-outline btn-sm text-blue-600 hover:bg-blue-50"
                      title="สร้างและพิมพ์ Barcode / QR Code"
                    >
                      <QrCode size={13} />
                    </button>
                    <button onClick={() => openEdit(p)} className="btn-outline btn-sm" title="แก้ไขสินค้า"><Edit2 size={13} /></button>
                    <button onClick={() => handleDelete(p.id, p.name)} className="btn-danger btn-sm" title="ลบสินค้า"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold">{editing ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h2>
              <button onClick={() => setModal(false)}><X size={22} className="text-slate-400 hover:text-slate-700" /></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              {/* Product Image Section */}
              <div className="col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    <ImageIcon size={16} className="text-blue-600" />
                    รูปภาพสินค้า
                  </label>
                  <div className="flex gap-1 bg-slate-200 p-0.5 rounded-lg text-xs">
                    <button
                      type="button"
                      onClick={() => setImageMode('upload')}
                      className={`px-3 py-1 rounded-md font-medium transition-all ${
                        imageMode === 'upload' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <UploadCloud size={13} className="inline mr-1" /> อัปโหลดไฟล์
                    </button>
                    <button
                      type="button"
                      onClick={() => setImageMode('url')}
                      className={`px-3 py-1 rounded-md font-medium transition-all ${
                        imageMode === 'url' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <LinkIcon size={13} className="inline mr-1" /> ลิงก์ URL
                    </button>
                  </div>
                </div>

                {imageMode === 'upload' ? (
                  <div>
                    <label className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-colors bg-white group">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        disabled={uploading}
                        className="hidden"
                      />
                      {uploading ? (
                        <div className="flex items-center gap-2 text-sm text-blue-600 py-2">
                          <Loader2 size={20} className="animate-spin" /> กำลังอัปโหลดรูปภาพ...
                        </div>
                      ) : (
                        <div className="text-center py-2">
                          <UploadCloud size={32} className="mx-auto text-slate-400 group-hover:text-blue-500 transition-colors mb-1" />
                          <p className="text-sm font-medium text-slate-700 group-hover:text-blue-600">
                            คลิกเพื่อเลือกไฟล์รูปภาพจากอุปกรณ์
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">รองรับไฟล์ JPG, PNG, WEBP, GIF (สูงสุด 5MB)</p>
                        </div>
                      )}
                    </label>
                  </div>
                ) : (
                  <div>
                    <input
                      className="input bg-white"
                      value={form.image_url || ''}
                      placeholder="วาง URL รูปภาพ เช่น https://images.unsplash.com/... หรือ URL รูปภาพ"
                      onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                    />
                    <p className="text-xs text-slate-400 mt-1">สามารถใส่ลิงก์รูปภาพจากอินเทอร์เน็ตได้โดยตรง</p>
                  </div>
                )}

                {uploadError && (
                  <p className="text-xs text-red-600 mt-2 bg-red-50 p-2 rounded-lg border border-red-200">
                    ⚠️ {uploadError}
                  </p>
                )}

                {/* Preview if image_url exists */}
                {form.image_url && (
                  <div className="mt-3 flex items-center gap-3 p-2 bg-white rounded-lg border border-slate-200">
                    <div className="w-16 h-16 rounded-lg bg-slate-100 overflow-hidden border border-slate-200 flex-shrink-0">
                      <img
                        src={form.image_url}
                        alt="Product preview"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-700 truncate">ตัวอย่างรูปภาพสินค้า</p>
                      <p className="text-[11px] text-slate-400 truncate font-mono">{form.image_url}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, image_url: '' })}
                      className="btn-danger btn-sm text-xs py-1 px-2.5"
                    >
                      <Trash2 size={13} /> ลบรูป
                    </button>
                  </div>
                )}
              </div>

              {/* Barcode field with generate button and preview */}
              <div className="col-span-2 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    <QrCode size={16} className="text-blue-600" />
                    รหัสบาร์โค้ด (Barcode / QR Code)
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateNewBarcode}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                    title="สุ่มสร้างรหัสบาร์โค้ดใหม่"
                  >
                    <Sparkles size={13} />
                    <span>สร้างรหัสใหม่</span>
                  </button>
                </div>
                <input
                  className="input bg-white font-mono text-sm"
                  value={form.barcode || ''}
                  placeholder="เว้นว่างเพื่อให้ระบบสร้างให้อัตโนมัติ (เช่น ITM1789...)"
                  onChange={e => setForm({ ...form, barcode: e.target.value })}
                />
                {form.barcode && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-200/80 flex items-center justify-around gap-4 bg-white p-2.5 rounded-lg">
                    <div className="text-center">
                      <p className="text-[10px] text-slate-400 font-bold mb-1">ตัวอย่าง Barcode</p>
                      <BarcodeView value={form.barcode} height={32} fontSize={10} />
                    </div>
                    <div className="w-px h-12 bg-slate-200" />
                    <div className="text-center flex flex-col items-center">
                      <p className="text-[10px] text-slate-400 font-bold mb-1">ตัวอย่าง QR Code</p>
                      <QRCodeView value={form.barcode} size={48} />
                    </div>
                  </div>
                )}
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อสินค้า *</label>
                <input
                  className="input"
                  value={form.name || ''}
                  placeholder="ชื่อสินค้า"
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">รายละเอียด</label>
                <input
                  className="input"
                  value={form.description || ''}
                  placeholder="รายละเอียดสินค้า"
                  onChange={e => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">หมวดหมู่</label>
                <select className="input" value={form.category_id || ''} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                  <option value="">-- เลือกหมวดหมู่ --</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">หน่วย</label>
                <input className="input" value={form.unit || ''} onChange={e => setForm({ ...form, unit: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ราคาทุน (฿)</label>
                <input className="input" type="number" min="0" step="0.01" value={form.cost_price || ''}
                  onChange={e => setForm({ ...form, cost_price: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ราคาขาย (฿)</label>
                <input className="input" type="number" min="0" step="0.01" value={form.sell_price || ''}
                  onChange={e => setForm({ ...form, sell_price: e.target.value })} />
              </div>
              {!editing && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">สต็อกเริ่มต้น</label>
                  <input className="input" type="number" min="0" value={form.stock_qty || ''}
                    onChange={e => setForm({ ...form, stock_qty: e.target.value })} />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">สต็อกขั้นต่ำ</label>
                <input className="input" type="number" min="0" value={form.min_stock || ''}
                  onChange={e => setForm({ ...form, min_stock: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setModal(false)} className="btn-secondary flex-1">ยกเลิก</button>
              <button onClick={handleSave} disabled={!form.name || saving} className="btn-primary flex-1">
                <Save size={16} /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode & QR Label Printing Modal */}
      {showLabelModal && labelModalData && (
        <BarcodeLabelModal
          title={labelModalData.title}
          docNo={labelModalData.docNo}
          docType="PRODUCT"
          items={labelModalData.items}
          onClose={() => {
            setShowLabelModal(false);
            setLabelModalData(null);
          }}
        />
      )}
    </div>
  );
}
