import { useEffect, useState, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import api from '../api/client';
import BarcodeScanner from '../components/BarcodeScanner';
import BarcodeView from '../components/BarcodeView';
import QRCodeView from '../components/QRCodeView';
import BarcodeLabelModal, { type LabelItem } from '../components/BarcodeLabelModal';
import { useRealtimeEvent } from '../utils/socket';
import {
  Scan, Trash2, Save, Package, Search, Plus, X,
  UploadCloud, Link as LinkIcon, Loader2, Eye,
  Check, ArrowRight, RefreshCw, Layers, Printer, Tag
} from 'lucide-react';

const fmt = (n: number) => n?.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface StockInItem {
  product_id: number;
  name: string;
  barcode: string;
  unit: string;
  cost_price: number;
  qty: number;
  image_url?: string;
  category_name?: string;
}

export default function StockIn() {
  const [note, setNote] = useState('');
  const [items, setItems] = useState<StockInItem[]>([]);
  const [showScanner, setShowScanner] = useState(false);
  const [search, setSearch] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [tab, setTab] = useState<'form' | 'history'>('form');

  // New Product Modal State
  const [showNewProductModal, setShowNewProductModal] = useState(false);
  const [newProductForm, setNewProductForm] = useState<any>({
    barcode: '',
    name: '',
    category_id: '',
    unit: 'ชิ้น',
    cost_price: 0,
    sell_price: 0,
    min_stock: 5,
    image_url: '',
    initial_qty: 1,
  });
  const [imageMode, setImageMode] = useState<'upload' | 'url'>('upload');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [savingProduct, setSavingProduct] = useState(false);

  // Not found barcode alert/prompt
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null);

  // View PO Detail Modal
  const [selectedPO, setSelectedPO] = useState<any>(null);
  const [loadingPOId, setLoadingPOId] = useState<number | null>(null);

  // Labels and Printing
  const [createdPOResult, setCreatedPOResult] = useState<any>(null);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [labelModalData, setLabelModalData] = useState<{
    docNo?: string;
    docType?: 'PO' | 'REQ' | 'DIS' | 'PRODUCT';
    items: LabelItem[];
    title?: string;
  } | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const poPrintRef = useRef<HTMLDivElement>(null);
  const handlePrintPO = useReactToPrint({
    contentRef: poPrintRef,
    documentTitle: `PO_Receipt_${selectedPO?.po_no || Date.now()}`,
  });

  useEffect(() => {
    loadCategories();
    loadHistory();
  }, []);

  // Realtime updates
  useRealtimeEvent('inventory:updated', () => {
    if (tab === 'history') {
      loadHistory();
    }
  });

  const loadCategories = async () => {
    try {
      const res = await api.get('/categories');
      setCategories(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadHistory = async () => {
    try {
      const res = await api.get('/inventory/purchase-orders', { params: { limit: 30 } });
      setHistory(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const searchProduct = async (q: string) => {
    if (!q.trim()) {
      setProducts([]);
      return;
    }
    try {
      const res = await api.get('/products', { params: { search: q, limit: 12 } });
      setProducts(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const addProductToList = (p: any, initialQty = 1) => {
    setItems((prev) => {
      const existingIdx = prev.findIndex((i) => i.product_id === p.id);
      if (existingIdx >= 0) {
        // Increment quantity if already in list
        return prev.map((item, idx) =>
          idx === existingIdx ? { ...item, qty: item.qty + initialQty } : item
        );
      }
      return [
        {
          product_id: p.id,
          name: p.name,
          barcode: p.barcode,
          unit: p.unit || 'ชิ้น',
          cost_price: p.cost_price || 0,
          qty: initialQty,
          image_url: p.image_url,
          category_name: p.category_name,
        },
        ...prev,
      ];
    });
    setProducts([]);
    setSearch('');
    setBarcodeInput('');
    setNotFoundBarcode(null);
  };

  const handleBarcodeLookup = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    try {
      const { data } = await api.get(`/products/barcode/${trimmed}`);
      if (data && data.id) {
        addProductToList(data, 1);
        setSuccess(`เพิ่มสินค้า "${data.name}" ลงในรายการแล้ว (+1)`);
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch {
      // Product not found with this barcode
      setNotFoundBarcode(trimmed);
      setShowScanner(false);
      openNewProductModal(trimmed);
    }
  };

  const handleBarcodeInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleBarcodeLookup(barcodeInput);
  };

  const updateItemField = (idx: number, field: keyof StockInItem, val: any) => {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, [field]: val } : it))
    );
  };

  const adjustQty = (idx: number, delta: number) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i === idx) {
          const nextQty = Math.max(1, it.qty + delta);
          return { ...it, qty: nextQty };
        }
        return it;
      })
    );
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const totalAmount = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.cost_price) || 0), 0);
  const totalQty = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);

  // Save Stock-In
  const handleSaveStockIn = async () => {
    if (items.length === 0) return;
    setSaving(true);
    try {
      const res = await api.post('/inventory/stock-in', {
        items: items.map((i) => ({
          product_id: i.product_id,
          qty: Number(i.qty) || 1,
          cost_price: Number(i.cost_price) || 0,
        })),
        note,
      });
      setCreatedPOResult(res.data);
      setSuccess(`บันทึกรับสินค้าเข้าคลังสำเร็จ! เลขที่ PO: ${res.data.po_no} (${items.length} รายการ)`);
      setItems([]);
      setNote('');
      loadHistory();
      setTimeout(() => setSuccess(''), 10000);
    } catch (err: any) {
      alert(err.response?.data?.message || 'เกิดข้อผิดพลาดในการบันทึกรับเข้า');
    } finally {
      setSaving(false);
    }
  };

  // Open New Product Modal
  const openNewProductModal = (prefilledBarcode = '') => {
    setNewProductForm({
      barcode: prefilledBarcode || generateRandomBarcode(),
      name: '',
      category_id: categories[0]?.id || '',
      unit: 'ชิ้น',
      cost_price: 0,
      sell_price: 0,
      min_stock: 5,
      image_url: '',
      initial_qty: 1,
    });
    setImageMode('upload');
    setUploadError('');
    setShowNewProductModal(true);
    setNotFoundBarcode(null);
  };

  // Generate 13-digit barcode
  const generateRandomBarcode = () => {
    return '885' + Math.floor(1000000000 + Math.random() * 9000000000).toString();
  };

  // Handle Image Upload for New Product
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setUploadError('ขนาดไฟล์ต้องไม่เกิน 5MB');
      return;
    }

    const formData = new FormData();
    formData.append('image', file);

    try {
      setUploading(true);
      setUploadError('');
      const res = await api.post('/products/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setNewProductForm((prev: any) => ({ ...prev, image_url: res.data.url }));
    } catch (err: any) {
      setUploadError(err.response?.data?.message || 'อัปโหลดรูปภาพล้มเหลว');
    } finally {
      setUploading(false);
    }
  };

  // Save New Product and Add to Current Stock-In List
  const handleSaveNewProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductForm.name.trim()) {
      alert('กรุณากรอกชื่อสินค้า');
      return;
    }

    setSavingProduct(true);
    try {
      const payload = {
        barcode: newProductForm.barcode || generateRandomBarcode(),
        name: newProductForm.name.trim(),
        category_id: newProductForm.category_id ? Number(newProductForm.category_id) : null,
        unit: newProductForm.unit || 'ชิ้น',
        cost_price: Number(newProductForm.cost_price) || 0,
        sell_price: Number(newProductForm.sell_price) || 0,
        stock_qty: 0, // Stock will be added by stock-in receipt
        min_stock: Number(newProductForm.min_stock) || 5,
        image_url: newProductForm.image_url || '',
      };

      const res = await api.post('/products', payload);
      const createdProduct = res.data;

      // Automatically add newly created product to stock-in items list
      addProductToList(
        {
          ...createdProduct,
          category_name: categories.find((c) => c.id === Number(newProductForm.category_id))?.name,
        },
        Number(newProductForm.initial_qty) || 1
      );

      setShowNewProductModal(false);
      setSuccess(`สร้างสินค้าใหม่ "${createdProduct.name}" และเพิ่มในรายการรับเข้าเรียบร้อย!`);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err: any) {
      alert(err.response?.data?.message || 'ไม่สามารถสร้างสินค้าได้');
    } finally {
      setSavingProduct(false);
    }
  };

  // Open PO details
  const viewPoDetail = async (poId: number) => {
    setLoadingPOId(poId);
    try {
      const res = await api.get(`/inventory/purchase-orders/${poId}`);
      setSelectedPO(res.data);
    } catch (err) {
      alert('ไม่สามารถโหลดรายละเอียด PO ได้');
    } finally {
      setLoadingPOId(null);
    }
  };

  // Delete a single PO and rollback stock
  const handleDeletePO = async (poId: number, poNo: string) => {
    if (!confirm(`คุณต้องการลบ/ยกเลิกเอกสารรับเข้า PO: ${poNo} ใช่หรือไม่?\n\n⚠️ ระบบจะทำการปรับคืนสต็อกสินค้าที่เคยรับเข้าในเอกสารนี้ให้อัตโนมัติ`)) {
      return;
    }
    try {
      const res = await api.delete(`/inventory/purchase-orders/${poId}`);
      alert(res.data?.message || 'ลบรายการสำเร็จ');
      if (selectedPO?.id === poId) setSelectedPO(null);
      loadHistory();
    } catch (err: any) {
      alert(err.response?.data?.message || 'เกิดข้อผิดพลาดในการลบรายการ');
    }
  };

  // Clear all PO history and rollback stock
  const handleClearAllHistory = async () => {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการเคลียร์ประวัติเอกสารรับเข้าทั้งหมด?\n\n⚠️ คำเตือน: ระบบจะทำการปรับคืนสต็อกสินค้าทั้งหมดที่เคยรับเข้ากลับคืน')) {
      return;
    }
    try {
      const res = await api.delete('/inventory/purchase-orders');
      alert(res.data?.message || 'ล้างประวัติการรับเข้าทั้งหมดสำเร็จ');
      if (selectedPO) setSelectedPO(null);
      loadHistory();
    } catch (err: any) {
      alert(err.response?.data?.message || 'เกิดข้อผิดพลาดในการล้างประวัติ');
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
            <Package className="text-blue-600" size={26} />
            รับสินค้าเข้าคลัง (Stock-In)
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            สแกนบาร์โค้ด หรือค้นหาเพื่อรับเข้าสินค้า พร้อมเพิ่มสินค้าใหม่และรูปภาพได้ทันที
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowScanner(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-all active:scale-95 shadow-sm"
          >
            <Scan size={17} />
            สแกนกล้อง
          </button>
          <button
            onClick={() => openNewProductModal()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-all active:scale-95"
          >
            <Plus size={17} />
            เพิ่มสินค้าใหม่
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setTab('form')}
          className={`px-4 py-2 rounded-xl font-medium text-sm transition-all flex items-center gap-2 ${
            tab === 'form'
              ? 'bg-blue-600 text-white shadow-sm font-semibold'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Package size={16} />
          รับสินค้าเข้า ({items.length})
        </button>
        <button
          onClick={() => setTab('history')}
          className={`px-4 py-2 rounded-xl font-medium text-sm transition-all flex items-center gap-2 ${
            tab === 'history'
              ? 'bg-blue-600 text-white shadow-sm font-semibold'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Layers size={16} />
          ประวัติการรับเข้า ({history.length})
        </button>
      </div>

      {/* Notification Banner */}
      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-800 text-sm shadow-sm animate-in fade-in duration-200 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Check size={19} className="text-emerald-600 flex-shrink-0" />
              <span className="font-semibold">{success}</span>
            </div>
            <button onClick={() => setSuccess('')} className="text-emerald-600 hover:text-emerald-800">
              <X size={17} />
            </button>
          </div>

          {createdPOResult && (
            <div className="pt-2 border-t border-emerald-200/80 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => viewPoDetail(createdPOResult.id)}
                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
              >
                <Eye size={14} />
                ดูเอกสาร & บาร์โค้ด PO ({createdPOResult.po_no})
              </button>
              <button
                type="button"
                onClick={() => {
                  setLabelModalData({
                    docNo: createdPOResult.po_no,
                    docType: 'PO',
                    title: `พิมพ์สติกเกอร์บาร์โค้ด & QR สินค้ารับเข้า PO: ${createdPOResult.po_no}`,
                    items: (createdPOResult.items || []).map((i: any) => ({
                      ...i,
                      name: i.product_name || i.name,
                    })),
                  });
                  setShowLabelModal(true);
                }}
                className="px-3 py-1.5 bg-white hover:bg-emerald-100/70 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
              >
                <Tag size={14} className="text-emerald-600" />
                พิมพ์สติกเกอร์บาร์โค้ด & QR สินค้าที่เพิ่งรับเข้า
              </button>
            </div>
          )}
        </div>
      )}

      {/* Not Found Barcode Prompt */}
      {notFoundBarcode && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div>
            <p className="font-semibold flex items-center gap-2">
              <span>⚠️ ไม่พบสินค้าที่มีบาร์โค้ด:</span>
              <span className="font-mono bg-amber-100 px-2 py-0.5 rounded border border-amber-300 text-amber-900">
                {notFoundBarcode}
              </span>
            </p>
            <p className="text-xs text-amber-700 mt-1">ต้องการสร้างข้อมูลสินค้าใหม่ด้วยบาร์โค้ดนี้เลยหรือไม่?</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openNewProductModal(notFoundBarcode)}
              className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Plus size={14} /> สร้างสินค้านี้ทันที
            </button>
            <button
              onClick={() => setNotFoundBarcode(null)}
              className="px-2.5 py-1.5 rounded-lg text-amber-700 hover:bg-amber-100 text-xs font-medium"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* Tab 1: Form */}
      {tab === 'form' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left: Input & Table */}
          <div className="lg:col-span-2 space-y-4">
            {/* Action Card: Search & Barcode Scan Input */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row gap-2.5">
                {/* Search Product by Name/Barcode */}
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" size={17} />
                  <input
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                    placeholder="พิมพ์ชื่อสินค้า หรือบาร์โค้ดเพื่อค้นหา..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      searchProduct(e.target.value);
                    }}
                  />
                  {/* Search Results Dropdown */}
                  {products.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-20 max-h-72 overflow-y-auto divide-y divide-slate-100">
                      {products.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => addProductToList(p)}
                          className="p-3 hover:bg-blue-50/70 cursor-pointer text-sm flex items-center gap-3 transition-colors group"
                        >
                          {/* Image Thumbnail */}
                          <div className="w-11 h-11 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                            {p.image_url ? (
                              <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                            ) : (
                              <Package size={20} className="text-slate-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-800 truncate group-hover:text-blue-600">{p.name}</p>
                            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                              <span className="font-mono">{p.barcode}</span>
                              <span>•</span>
                              <span>คงเหลือ {p.stock_qty} {p.unit}</span>
                              <span>•</span>
                              <span className="text-slate-600 font-medium">ทุน ฿{fmt(p.cost_price)}</span>
                            </div>
                          </div>
                          <button className="px-3 py-1 rounded-lg bg-blue-50 group-hover:bg-blue-600 group-hover:text-white text-blue-600 font-medium text-xs transition-all flex items-center gap-1">
                            <span>เพิ่ม</span>
                            <ArrowRight size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quick Barcode Enter / USB Scanner input */}
                <form onSubmit={handleBarcodeInputSubmit} className="flex gap-1.5 sm:w-64">
                  <div className="relative flex-1">
                    <Scan className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                    <input
                      ref={barcodeInputRef}
                      className="w-full pl-9 pr-2 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                      placeholder="ยิงบาร์โค้ด / Enter..."
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold transition-all active:scale-95"
                  >
                    รับเข้า
                  </button>
                </form>
              </div>

              {/* Note / Details */}
              <div>
                <input
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="หมายเหตุการรับเข้า เช่น เลขที่ใบส่งของ, บริษัทผู้ผลิต หรือรายละเอียดเพิ่มเติม..."
                />
              </div>
            </div>

            {/* Items Table Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-800 text-sm">รายการสินค้าที่จะรับเข้าคลัง</h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                    {items.length} รายการ
                  </span>
                </div>
                {items.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('ล้างรายการสินค้าทั้งหมดที่กำลังรับเข้าใช่ไหม?')) setItems([]);
                    }}
                    className="text-xs text-red-600 hover:text-red-800 hover:bg-red-50 px-2.5 py-1 rounded-lg border border-red-200 font-semibold flex items-center gap-1 transition-colors"
                  >
                    <Trash2 size={13} /> เคลียร์รายการ
                  </button>
                )}
              </div>

              {items.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-center w-14">รูปสินค้า</th>
                        <th className="px-4 py-3">ข้อมูลสินค้า</th>
                        <th className="px-4 py-3 text-center min-w-44">จำนวนรับเข้า (กรอกเอง)</th>
                        <th className="px-4 py-3 text-right w-32">ราคาทุนต่อหน่วย</th>
                        <th className="px-4 py-3 text-right w-28">รวม (฿)</th>
                        <th className="px-3 py-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                          {/* Product Image */}
                          <td className="px-4 py-3 text-center">
                            <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center mx-auto flex-shrink-0 shadow-sm">
                              {item.image_url ? (
                                <img
                                  src={item.image_url}
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    // fallback if image link breaks
                                    (e.target as any).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <Package size={22} className="text-slate-400" />
                              )}
                            </div>
                          </td>

                          {/* Product Name & Barcode */}
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-800 text-sm leading-snug">{item.name}</p>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1">
                              <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-600">
                                {item.barcode}
                              </span>
                              <span>หน่วย: <span className="font-medium text-slate-700">{item.unit}</span></span>
                              <button
                                type="button"
                                onClick={() => {
                                  setLabelModalData({
                                    docNo: 'RECEIVE',
                                    docType: 'PO',
                                    title: `พิมพ์สติกเกอร์: ${item.name}`,
                                    items: [{ ...item, product_name: item.name }]
                                  });
                                  setShowLabelModal(true);
                                }}
                                className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md hover:bg-blue-100 transition-colors font-medium"
                                title="พิมพ์ป้ายสติกเกอร์สินค้าชิ้นนี้"
                              >
                                <Tag size={12} />
                                พิมพ์สติกเกอร์ ({item.qty} ดวง)
                              </button>
                            </div>
                            <div className="mt-1.5">
                              <BarcodeView value={item.barcode} height={20} width={1.0} displayValue={false} />
                            </div>
                          </td>

                          {/* Manual Quantity Input & Step Buttons */}
                          <td className="px-4 py-3">
                            <div className="flex flex-col items-center gap-1.5">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => adjustQty(idx, -1)}
                                  className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-sm transition-all active:scale-95"
                                  title="ลด 1"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min="1"
                                  value={item.qty}
                                  onChange={(e) => updateItemField(idx, 'qty', parseInt(e.target.value) || 1)}
                                  className="w-20 px-2 py-1.5 text-center font-bold text-slate-800 bg-white border border-slate-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-inner"
                                />
                                <button
                                  type="button"
                                  onClick={() => adjustQty(idx, 1)}
                                  className="w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-sm transition-all active:scale-95"
                                  title="เพิ่ม 1"
                                >
                                  +
                                </button>
                              </div>

                               {/* Convenience Store Pack & Carton Multipliers */}
                              <div className="flex flex-wrap items-center justify-center gap-1 max-w-[200px]">
                                {[
                                  { label: '+6 แพ็ค', step: 6 },
                                  { label: '+12 โหล', step: 12 },
                                  { label: '+24 ลัง', step: 24 },
                                  { label: '+50', step: 50 },
                                  { label: '+100', step: 100 },
                                ].map((btn) => (
                                  <button
                                    key={btn.step}
                                    type="button"
                                    onClick={() => adjustQty(idx, btn.step)}
                                    className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 rounded-md border border-slate-200 transition-all active:scale-95 shadow-2xs"
                                    title={`เพิ่ม ${btn.step} ชิ้น`}
                                  >
                                    {btn.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </td>

                          {/* Cost Price */}
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-slate-400 text-xs">฿</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.cost_price}
                                onChange={(e) => updateItemField(idx, 'cost_price', parseFloat(e.target.value) || 0)}
                                className="w-24 px-2 py-1.5 text-right font-medium text-slate-800 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          </td>

                          {/* Subtotal */}
                          <td className="px-4 py-3 text-right font-bold text-slate-800 font-mono text-sm">
                            ฿{fmt((Number(item.qty) || 0) * (Number(item.cost_price) || 0))}
                          </td>

                          {/* Delete */}
                          <td className="px-3 py-3 text-center">
                            <button
                              onClick={() => removeItem(idx)}
                              className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                              title="ลบรายการ"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-16 px-4 space-y-3">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400 border border-slate-200">
                    <Package size={32} />
                  </div>
                  <p className="font-semibold text-slate-700">ยังไม่มีสินค้าในรายการรับเข้า</p>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    ค้นหาชื่อสินค้าด้านบน สแกนบาร์โค้ด หรือกดปุ่ม <strong>"+ เพิ่มสินค้าใหม่"</strong> เพื่อบันทึกสินค้าใหม่ลงในคลัง
                  </p>
                  <div className="pt-2 flex justify-center gap-2">
                    <button
                      onClick={() => openNewProductModal()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
                    >
                      <Plus size={15} /> เพิ่มสินค้าใหม่
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Summary Card */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4 sticky top-4">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2 border-b border-slate-100 pb-3">
                <Check size={18} className="text-emerald-600" />
                สรุปการรับเข้าคลัง
              </h3>

              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">จำนวนรายการ</span>
                  <span className="font-semibold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-full text-xs font-mono">
                    {items.length} รายการ
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">จำนวนสินค้ารวมทั้งหมด</span>
                  <span className="font-bold text-blue-600 font-mono text-base">
                    {totalQty.toLocaleString()} ชิ้น
                  </span>
                </div>
                <div className="border-t border-slate-100 pt-3 flex justify-between items-baseline">
                  <span className="font-bold text-slate-800">มูลค่ารวมทั้งสิ้น</span>
                  <span className="text-2xl font-black text-emerald-600 font-mono">
                    ฿{fmt(totalAmount)}
                  </span>
                </div>
              </div>

              {/* Submit Button */}
              <button
                onClick={handleSaveStockIn}
                disabled={items.length === 0 || saving}
                className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 text-base transition-all active:scale-98"
              >
                <Save size={19} />
                {saving ? 'กำลังบันทึกข้อมูล...' : 'ยืนยันรับสินค้าเข้าคลัง'}
              </button>

              {/* Print Sticker Labels */}
              <button
                type="button"
                onClick={() => {
                  setLabelModalData({
                    docNo: 'RECEIVE',
                    docType: 'PO',
                    title: 'พิมพ์สติกเกอร์บาร์โค้ด & QR สินค้ารับเข้า',
                    items: items.map((i) => ({ ...i, product_name: i.name })),
                  });
                  setShowLabelModal(true);
                }}
                disabled={items.length === 0}
                className="w-full py-2.5 px-3 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-40 shadow-sm active:scale-95"
              >
                <Tag size={15} className="text-blue-600" />
                พิมพ์สติกเกอร์ Barcode / QR Code ({items.length} รายการ)
              </button>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500 space-y-1">
                <p className="font-medium text-slate-700">💡 คำแนะนำ:</p>
                <p>• เมื่อกดยืนยัน จำนวนสินค้าในสต็อกจะถูกบวกเพิ่มทันที</p>
                <p>• หากราคาทุนเปลี่ยน ระบบจะอัปเดตราคาทุนของสินค้านั้นให้เป็นราคาใหม่</p>
                <p>• หน้าจอ POS และ Dashboard จะอัปเดตแบบเรียลไทม์อัตโนมัติ</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: History */}
      {tab === 'history' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-slate-800">ประวัติเอกสารรับสินค้าเข้า (Purchase Orders)</h3>
            <div className="flex items-center gap-2">
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllHistory}
                  className="text-xs text-red-600 hover:text-red-800 hover:bg-red-50 px-2.5 py-1.5 rounded-lg border border-red-200 font-semibold flex items-center gap-1 transition-colors"
                  title="ล้างประวัติการรับเข้าทั้งหมดและปรับคืนสต็อก"
                >
                  <Trash2 size={13} /> เคลียร์ประวัติทั้งหมด
                </button>
              )}
              <button
                type="button"
                onClick={loadHistory}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
              >
                <RefreshCw size={13} /> รีเฟรช
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">เลขที่ PO</th>
                  <th className="px-4 py-3">ผู้บันทึก</th>
                  <th className="px-4 py-3 text-right">มูลค่ารวม</th>
                  <th className="px-4 py-3">หมายเหตุ</th>
                  <th className="px-4 py-3">วันที่รับเข้า</th>
                  <th className="px-4 py-3 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.length > 0 ? (
                  history.map((po) => (
                    <tr key={po.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-blue-600">{po.po_no}</td>
                      <td className="px-4 py-3 text-slate-700 font-medium">{po.user_name || '-'}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">฿{fmt(po.total_amount)}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs max-w-xs truncate">{po.note || '-'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {new Date(po.created_at).toLocaleString('th-TH')}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => viewPoDetail(po.id)}
                            disabled={loadingPOId === po.id}
                            className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-semibold transition-all inline-flex items-center gap-1 disabled:opacity-50"
                            title="ดูรายละเอียดสินค้าในบิล"
                          >
                            {loadingPOId === po.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Eye size={13} />
                            )}
                            รายการ
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePO(po.id, po.po_no)}
                            className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="ลบ/ยกเลิกเอกสารรับเข้านี้ (ปรับคืนสต็อก)"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-slate-400">
                      ยังไม่มีประวัติการรับเข้า
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: เพิ่มสินค้าใหม่พร้อมรูปภาพ (Add New Product Modal) */}
      {showNewProductModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto border border-slate-100">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white/95 backdrop-blur-md z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Plus size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">เพิ่มสินค้าใหม่และรับเข้าทันที</h2>
                  <p className="text-xs text-slate-400">กรอกข้อมูลสินค้าและเลือกรูปภาพเพื่อบันทึกเข้าสู่ระบบ</p>
                </div>
              </div>
              <button
                onClick={() => setShowNewProductModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveNewProduct} className="p-6 space-y-5">
              {/* Product Image Section */}
              <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <span>📸 รูปภาพสินค้า</span>
                  </label>
                  <div className="flex rounded-lg bg-slate-200 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setImageMode('upload')}
                      className={`px-3 py-1 rounded-md font-medium transition-all ${
                        imageMode === 'upload' ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <UploadCloud size={13} className="inline mr-1" /> อัปโหลดไฟล์
                    </button>
                    <button
                      type="button"
                      onClick={() => setImageMode('url')}
                      className={`px-3 py-1 rounded-md font-medium transition-all ${
                        imageMode === 'url' ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
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
                        <div className="flex items-center gap-2 text-sm text-blue-600 py-3">
                          <Loader2 size={20} className="animate-spin" /> กำลังอัปโหลดรูปภาพ...
                        </div>
                      ) : (
                        <div className="text-center py-2">
                          <UploadCloud size={30} className="mx-auto text-slate-400 group-hover:text-blue-500 transition-colors mb-1" />
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
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={newProductForm.image_url || ''}
                      placeholder="วาง URL รูปภาพ เช่น https://images.unsplash.com/... หรือ ลิงก์รูปภาพ"
                      onChange={(e) => setNewProductForm({ ...newProductForm, image_url: e.target.value })}
                    />
                  </div>
                )}

                {uploadError && (
                  <p className="text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-200">
                    ⚠️ {uploadError}
                  </p>
                )}

                {/* Image Preview */}
                {newProductForm.image_url && (
                  <div className="flex items-center gap-3 p-2.5 bg-white rounded-xl border border-slate-200">
                    <div className="w-16 h-16 rounded-lg bg-slate-100 overflow-hidden border border-slate-200 flex-shrink-0">
                      <img
                        src={newProductForm.image_url}
                        alt="Preview"
                        className="w-full h-full object-cover"
                        onError={(e) => ((e.target as any).style.display = 'none')}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-700">รูปภาพตัวอย่าง</p>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">{newProductForm.image_url}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNewProductForm({ ...newProductForm, image_url: '' })}
                      className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50"
                    >
                      ลบรูป
                    </button>
                  </div>
                )}
              </div>

              {/* Product Info Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    รหัสบาร์โค้ด <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      required
                      className="flex-1 px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={newProductForm.barcode}
                      onChange={(e) => setNewProductForm({ ...newProductForm, barcode: e.target.value })}
                      placeholder="เช่น 8850123456789"
                    />
                    <button
                      type="button"
                      onClick={() => setNewProductForm({ ...newProductForm, barcode: generateRandomBarcode() })}
                      className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-medium"
                      title="สุ่มบาร์โค้ดใหม่"
                    >
                      สุ่ม
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ชื่อสินค้า <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newProductForm.name}
                    onChange={(e) => setNewProductForm({ ...newProductForm, name: e.target.value })}
                    placeholder="เช่น ซองฟอยล์ 50 ซอง หรือ เมล็ดพันธุ์ 3 กรัม"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">หมวดหมู่สินค้า</label>
                  <select
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newProductForm.category_id}
                    onChange={(e) => setNewProductForm({ ...newProductForm, category_id: e.target.value })}
                  >
                    <option value="">-- เลือกหมวดหมู่ --</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">หน่วยนับ</label>
                  <input
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newProductForm.unit}
                    onChange={(e) => setNewProductForm({ ...newProductForm, unit: e.target.value })}
                    placeholder="เช่น ชิ้น, ซอง, แพ็ค, ถุง"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ราคาทุนต่อหน่วย (฿)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newProductForm.cost_price}
                    onChange={(e) => setNewProductForm({ ...newProductForm, cost_price: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ราคาขายหน้าร้าน (฿)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newProductForm.sell_price}
                    onChange={(e) => setNewProductForm({ ...newProductForm, sell_price: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    จำนวนที่รับเข้าครั้งนี้ (กรอกเอง)
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="w-full px-3.5 py-2.5 bg-blue-50/60 border border-blue-300 rounded-xl text-base font-bold text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newProductForm.initial_qty}
                    onChange={(e) => setNewProductForm({ ...newProductForm, initial_qty: parseInt(e.target.value) || 1 })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">แจ้งเตือนสต็อกขั้นต่ำ</label>
                  <input
                    type="number"
                    min="0"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newProductForm.min_stock}
                    onChange={(e) => setNewProductForm({ ...newProductForm, min_stock: e.target.value })}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewProductModal(false)}
                  className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={savingProduct || uploading}
                  className="px-6 py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-500/20 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                >
                  {savingProduct ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> กำลังบันทึก...
                    </>
                  ) : (
                    <>
                      <Plus size={16} /> บันทึกและเพิ่มในรายการรับเข้า
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: รายละเอียดเอกสาร PO (PO Detail Modal) */}
      {selectedPO && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 md:p-6 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl max-h-[92vh] flex flex-col border border-slate-100 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                  <Package size={20} />
                </div>
                <div>
                  <h2 className="text-base md:text-lg font-bold text-slate-800 flex items-center gap-2">
                    <span>เอกสารรับเข้า PO:</span>
                    <span className="font-mono text-blue-600">{selectedPO.po_no}</span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    วันที่: {new Date(selectedPO.created_at).toLocaleString('th-TH')} | ผู้บันทึก: {selectedPO.user_name || 'เจ้าหน้าที่'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPO(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-200/60 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {/* Document Barcode & QR Code Section */}
              <div className="bg-gradient-to-br from-slate-50 to-blue-50/40 p-4 rounded-2xl border border-blue-100 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
                <div className="space-y-1 text-center sm:text-left">
                  <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider bg-blue-100/70 px-2 py-0.5 rounded-full">
                    รหัสเอกสารรับเข้าคลัง (PO Barcode & QR)
                  </span>
                  <p className="text-sm font-bold text-slate-800 font-mono mt-1">{selectedPO.po_no}</p>
                  <p className="text-xs text-slate-500">
                    ยิงบาร์โค้ดหรือสแกน QR เพื่อค้นหาและตรวจสอบเอกสารนี้ในระบบได้ทันที
                  </p>
                </div>

                <div className="flex items-center gap-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex-shrink-0">
                  <div className="text-center">
                    <BarcodeView value={selectedPO.po_no} width={1.4} height={36} fontSize={10} />
                  </div>
                  <div className="w-px h-12 bg-slate-200" />
                  <div className="flex flex-col items-center">
                    <QRCodeView value={selectedPO.po_no} size={54} margin={1} />
                    <span className="text-[9px] font-mono text-slate-400 mt-0.5">SCAN PO</span>
                  </div>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-xs font-bold text-slate-700">
                  รายการสินค้าในบิล ({selectedPO.items?.length || 0} รายการ)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setLabelModalData({
                        docNo: selectedPO.po_no,
                        docType: 'PO',
                        title: `พิมพ์สติกเกอร์สินค้า PO: ${selectedPO.po_no}`,
                        items: (selectedPO.items || []).map((i: any) => ({
                          ...i,
                          name: i.product_name,
                        })),
                      });
                      setShowLabelModal(true);
                    }}
                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95"
                  >
                    <Tag size={14} />
                    พิมพ์สติกเกอร์ Barcode & QR สินค้าทั้งหมด
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrintPO()}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
                  >
                    <Printer size={14} />
                    พิมพ์ใบรับสินค้าเข้าคลัง
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeletePO(selectedPO.id, selectedPO.po_no)}
                    className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95"
                    title="ลบเอกสารนี้และปรับคืนสต็อก"
                  >
                    <Trash2 size={14} />
                    ลบเอกสารนี้
                  </button>
                </div>
              </div>

              {/* Items Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-sm">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-xs text-slate-600 uppercase border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 text-center w-14">รูป</th>
                      <th className="px-4 py-2.5">ชื่อสินค้า / บาร์โค้ด</th>
                      <th className="px-4 py-2.5 text-center">จำนวน</th>
                      <th className="px-4 py-2.5 text-right">ราคาทุน</th>
                      <th className="px-4 py-2.5 text-right">รวม</th>
                      <th className="px-4 py-2.5 text-center w-24">ป้ายสติกเกอร์</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedPO.items?.map((item: any) => (
                      <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-2.5 text-center">
                          <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center mx-auto">
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.product_name} className="w-full h-full object-cover" />
                            ) : (
                              <Package size={18} className="text-slate-400" />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="font-semibold text-slate-800 text-sm">{item.product_name}</p>
                          <p className="text-xs font-mono text-slate-400 mt-0.5">{item.barcode}</p>
                          <div className="mt-1">
                            <BarcodeView value={item.barcode} height={16} width={0.9} displayValue={false} />
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center font-bold text-slate-800">
                          {item.qty} {item.unit || ''}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono">฿{fmt(item.cost_price)}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-emerald-600 font-mono">
                          ฿{fmt(item.subtotal || item.qty * item.cost_price)}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setLabelModalData({
                                docNo: selectedPO.po_no,
                                docType: 'PO',
                                title: `พิมพ์สติกเกอร์: ${item.product_name}`,
                                items: [{ ...item, name: item.product_name }],
                              });
                              setShowLabelModal(true);
                            }}
                            className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors inline-flex items-center gap-1 text-xs font-semibold"
                            title="พิมพ์สติกเกอร์สินค้าชิ้นนี้"
                          >
                            <Tag size={13} />
                            <span>พิมพ์ป้าย</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary */}
              <div className="flex justify-between items-center px-5 py-3.5 bg-slate-50 rounded-2xl border border-slate-200 font-bold">
                <span className="text-slate-700">มูลค่ารวมทั้งสิ้น</span>
                <span className="text-2xl text-emerald-600 font-mono">฿{fmt(selectedPO.total_amount)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Printable PO Receipt (hidden off-screen for useReactToPrint) */}
      {selectedPO && (
        <div className="hidden">
          <div ref={poPrintRef} className="p-8 w-[190mm] font-sans text-slate-800 text-xs">
            <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4 mb-5">
              <div>
                <h1 className="text-xl font-bold uppercase tracking-wider text-slate-900">
                  ใบรับสินค้าเข้าคลัง (PURCHASE ORDER RECEIPT)
                </h1>
                <p className="text-xs text-slate-600 mt-1">ระบบบริหารจัดการคลังสินค้าและจุดจำหน่าย (POS & Warehouse)</p>
                <div className="mt-2 text-xs space-y-0.5">
                  <p><strong>เลขที่เอกสาร:</strong> <span className="font-mono">{selectedPO.po_no}</span></p>
                  <p><strong>วันที่รับเข้า:</strong> {new Date(selectedPO.created_at).toLocaleString('th-TH')}</p>
                  <p><strong>ผู้บันทึก:</strong> {selectedPO.user_name || 'เจ้าหน้าที่'}</p>
                  {selectedPO.note && <p><strong>หมายเหตุ:</strong> {selectedPO.note}</p>}
                </div>
              </div>

              {/* Barcode & QR Code on Document */}
              <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-300 text-center">
                <div>
                  <BarcodeView value={selectedPO.po_no} width={1.3} height={32} fontSize={9} />
                </div>
                <div className="flex flex-col items-center">
                  <QRCodeView value={selectedPO.po_no} size={50} margin={0} />
                  <span className="text-[8px] font-mono text-slate-500 mt-0.5">{selectedPO.po_no}</span>
                </div>
              </div>
            </div>

            <table className="w-full border-collapse border border-slate-300 text-xs mb-6">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 p-2 text-center w-10">ลำดับ</th>
                  <th className="border border-slate-300 p-2 text-left">รหัสบาร์โค้ด</th>
                  <th className="border border-slate-300 p-2 text-left">รายการสินค้า</th>
                  <th className="border border-slate-300 p-2 text-center w-20">จำนวน</th>
                  <th className="border border-slate-300 p-2 text-center w-16">หน่วย</th>
                  <th className="border border-slate-300 p-2 text-right w-24">ราคาทุน (฿)</th>
                  <th className="border border-slate-300 p-2 text-right w-28">รวม (฿)</th>
                </tr>
              </thead>
              <tbody>
                {selectedPO.items?.map((item: any, idx: number) => (
                  <tr key={idx}>
                    <td className="border border-slate-300 p-2 text-center">{idx + 1}</td>
                    <td className="border border-slate-300 p-2 font-mono">
                      {item.barcode}
                      <div className="mt-0.5">
                        <BarcodeView value={item.barcode} height={14} width={0.9} displayValue={false} />
                      </div>
                    </td>
                    <td className="border border-slate-300 p-2 font-semibold">{item.product_name}</td>
                    <td className="border border-slate-300 p-2 text-center font-bold">{item.qty}</td>
                    <td className="border border-slate-300 p-2 text-center">{item.unit || 'ชิ้น'}</td>
                    <td className="border border-slate-300 p-2 text-right font-mono">{fmt(item.cost_price)}</td>
                    <td className="border border-slate-300 p-2 text-right font-bold font-mono">
                      {fmt(item.subtotal || item.qty * item.cost_price)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-bold">
                  <td colSpan={5} className="border border-slate-300 p-2 text-right">มูลค่ารวมทั้งสิ้น:</td>
                  <td colSpan={2} className="border border-slate-300 p-2 text-right text-sm font-mono text-emerald-700">
                    ฿{fmt(selectedPO.total_amount)}
                  </td>
                </tr>
              </tfoot>
            </table>

            <div className="grid grid-cols-3 gap-8 mt-12 text-center text-xs">
              <div>
                <p className="border-b border-slate-400 pb-8"></p>
                <p className="mt-2 font-medium">ผู้รับสินค้าเข้าคลัง</p>
                <p className="text-[10px] text-slate-400">วันที่: ____/____/________</p>
              </div>
              <div>
                <p className="border-b border-slate-400 pb-8"></p>
                <p className="mt-2 font-medium">ผู้ตรวจนับ / QC</p>
                <p className="text-[10px] text-slate-400">วันที่: ____/____/________</p>
              </div>
              <div>
                <p className="border-b border-slate-400 pb-8"></p>
                <p className="mt-2 font-medium">ผู้จัดการคลัง / ผู้อนุมัติ</p>
                <p className="text-[10px] text-slate-400">วันที่: ____/____/________</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Barcode & QR Label Printing Modal */}
      {showLabelModal && labelModalData && (
        <BarcodeLabelModal
          title={labelModalData.title}
          docNo={labelModalData.docNo}
          docType={labelModalData.docType}
          items={labelModalData.items}
          onClose={() => {
            setShowLabelModal(false);
            setLabelModalData(null);
          }}
        />
      )}

      {/* Camera Barcode Scanner Modal (Continuous Scan Enabled) */}
      {showScanner && (
        <BarcodeScanner
          continuous={true}
          onScan={(code) => {
            handleBarcodeLookup(code);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
