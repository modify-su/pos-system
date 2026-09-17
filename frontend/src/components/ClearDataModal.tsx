import { useState } from 'react';
import api from '../api/client';
import {
  X,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Package,
  ShoppingCart,
  Warehouse,
  Tags,
  RefreshCw,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';

interface ClearDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (message: string) => void;
}

type ClearTarget = 'sales' | 'inventory' | 'products' | 'categories' | 'test_data' | 'all';

interface ActionConfig {
  target: ClearTarget;
  title: string;
  badge: string;
  icon: any;
  desc: string;
  warning: string;
  buttonText: string;
  color: 'amber' | 'rose' | 'red' | 'purple' | 'blue';
  showRestoreStock?: boolean;
  showResetStock?: boolean;
}

const CLEAR_ACTIONS: ActionConfig[] = [
  {
    target: 'sales',
    title: 'เคลียร์ประวัติยอดขาย (บิลขาย & ใบเสร็จ)',
    badge: 'ประวัติการขาย',
    icon: ShoppingCart,
    desc: 'ลบรายการบิลขายและใบเสร็จทั้งหมด ยอดสรุปและรายงานการขายจะถูกรีเซ็ต',
    warning: 'ประวัติบิลขายจะถูกลบถาวร ไม่สามารถกู้คืนได้',
    buttonText: 'เคลียร์ประวัติการขาย',
    color: 'amber',
    showRestoreStock: true,
  },
  {
    target: 'inventory',
    title: 'เคลียร์ประวัติคลังสินค้า (รับเข้า / เบิกจ่าย / ความเคลื่อนไหว)',
    badge: 'คลังสินค้า',
    icon: Warehouse,
    desc: 'ลบประวัติความเคลื่อนไหวสต็อก (Stock Movements), ประวัติรับเข้า (PO), และประวัติใบเบิกจ่ายสินค้า',
    warning: 'ประวัติความเคลื่อนไหวทั้งหมดจะถูกล้าง แต่จำนวนสินค้าปัจจุบันยังคงอยู่',
    buttonText: 'เคลียร์ประวัติคลังสินค้า',
    color: 'rose',
  },
  {
    target: 'products',
    title: 'เคลียร์รายการสินค้าทั้งหมด',
    badge: 'ข้อมูลสินค้า',
    icon: Package,
    desc: 'ลบสินค้าทุกรายการออกจากฐานข้อมูล เพื่อเริ่มต้นลงรายการสินค้าใหม่ตั้งแต่ต้น',
    warning: '⚠️ สินค้าทุกรายการ รวมถึงบาร์โค้ดและรูปภาพจะถูกลบออกจากระบบ',
    buttonText: 'เคลียร์สินค้าทั้งหมด',
    color: 'red',
  },
  {
    target: 'categories',
    title: 'เคลียร์หมวดหมู่สินค้าทั้งหมด',
    badge: 'หมวดหมู่',
    icon: Tags,
    desc: 'ลบหมวดหมู่สินค้าทั้งหมดออกจากระบบ (สินค้าที่ผูกไว้จะกลายเป็นไม่มีหมวดหมู่)',
    warning: 'หมวดหมู่จะถูกล้างทั้งหมด',
    buttonText: 'เคลียร์หมวดหมู่ทั้งหมด',
    color: 'purple',
  },
  {
    target: 'test_data',
    title: 'เคลียร์ข้อมูลทดสอบระบบ (ยอดขาย + ประวัติสต็อก)',
    badge: 'รีเซ็ตทดสอบ',
    icon: Sparkles,
    desc: 'ล้างประวัติการขาย ใบเสร็จ และประวัติสต็อกทดสอบทั้งหมด เพื่อเตรียมพร้อมเปิดร้านจริง',
    warning: 'ข้อมูลการขายและการเคลื่อนไหวทั้งหมดจะถูกลบ',
    buttonText: 'เคลียร์ข้อมูลทดสอบ',
    color: 'blue',
    showResetStock: true,
  },
  {
    target: 'all',
    title: 'ล้างข้อมูลระบบทั้งหมด (Full System Reset)',
    badge: 'ล้างระบบทั้งหมด',
    icon: ShieldAlert,
    desc: 'ลบข้อมูลสินค้า หมวดหมู่ ยอดขาย และประวัติสต็อกทั้งหมด คืนค่าระบบกลับสู่สถานะว่างเปล่า',
    warning: '⚠️ ข้อมูลทุกอย่างในระบบจะถูกลบอย่างสมบูรณ์แบบ กรุณาสำรองข้อมูลก่อนหากจำเป็น',
    buttonText: 'ล้างข้อมูลระบบทั้งหมด',
    color: 'red',
  },
];

export default function ClearDataModal({ isOpen, onClose, onSuccess }: ClearDataModalProps) {
  const [selectedAction, setSelectedAction] = useState<ActionConfig | null>(null);
  const [restoreStock, setRestoreStock] = useState(false);
  const [resetStock, setResetStock] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (!isOpen) return null;

  const handleSelect = (action: ActionConfig) => {
    setSelectedAction(action);
    setRestoreStock(false);
    setResetStock(false);
    setConfirmText('');
    setFeedback(null);
  };

  const handleExecuteClear = async () => {
    if (!selectedAction) return;

    // Safety confirmation for critical destructive actions
    if (selectedAction.target === 'products' || selectedAction.target === 'all') {
      if (confirmText.trim().toUpperCase() !== 'CONFIRM' && confirmText.trim() !== 'ยืนยัน') {
        alert('กรุณาพิมพ์คำว่า CONFIRM หรือ ยืนยัน เพื่อยืนยันการลบ');
        return;
      }
    }

    setLoading(true);
    setFeedback(null);

    try {
      const res = await api.post('/settings/clear-data', {
        target: selectedAction.target,
        restore_stock: restoreStock,
        reset_stock: resetStock,
      });

      const msg = res.data?.message || 'ดำเนินการเคลียร์ข้อมูลเรียบร้อยแล้ว';
      setFeedback({ type: 'success', message: msg });
      if (onSuccess) onSuccess(msg);

      setTimeout(() => {
        setSelectedAction(null);
        setConfirmText('');
        onClose();
      }, 1500);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.message || err.message || 'เกิดข้อผิดพลาดในการเคลียร์ข้อมูล',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scaleIn">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
              <Trash2 size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base text-white leading-tight">
                เคลียร์รายการ / ล้างข้อมูลระบบ
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                เลือกรายการข้อมูลที่ต้องการล้างออกจากฐานข้อมูล
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {feedback && (
            <div
              className={`p-4 rounded-xl text-sm font-medium flex items-center gap-2.5 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertTriangle size={18} className="text-rose-600 flex-shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          {!selectedAction ? (
            /* Action Selection Grid */
            <div className="space-y-3">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
                <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>ข้อควรระวัง:</strong> การเคลียร์รายการจะลบข้อมูลออกจากฐานข้อมูลโดยตรง
                  กรุณาตรวจสอบให้แน่ใจก่อนทำการกดยืนยันในแต่ละหัวข้อ
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {CLEAR_ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <div
                      key={action.target}
                      onClick={() => handleSelect(action)}
                      className="p-4 rounded-xl border border-slate-200 hover:border-blue-400 hover:shadow-md bg-white transition-all cursor-pointer group flex items-start gap-3.5"
                    >
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105 ${
                          action.color === 'amber'
                            ? 'bg-amber-100 text-amber-700'
                            : action.color === 'rose'
                            ? 'bg-rose-100 text-rose-700'
                            : action.color === 'red'
                            ? 'bg-red-100 text-red-700'
                            : action.color === 'purple'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        <Icon size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-slate-800 group-hover:text-blue-600 transition-colors">
                            {action.title}
                          </h4>
                          <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-slate-100 text-slate-600">
                            {action.badge}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                          {action.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Confirmation Step */
            <div className="space-y-4 animate-fadeIn">
              <button
                type="button"
                onClick={() => setSelectedAction(null)}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
              >
                ← กลับไปเลือกหัวข้ออื่น
              </button>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                <div className="flex items-center gap-2.5 font-bold text-slate-800 text-sm">
                  <selectedAction.icon size={18} className="text-rose-600" />
                  <span>{selectedAction.title}</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {selectedAction.desc}
                </p>
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-start gap-2">
                  <AlertTriangle size={15} className="text-rose-600 flex-shrink-0 mt-0.5" />
                  <span>{selectedAction.warning}</span>
                </div>
              </div>

              {/* Options */}
              {selectedAction.showRestoreStock && (
                <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={restoreStock}
                    onChange={(e) => setRestoreStock(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      คืนจำนวนสต็อกสินค้าที่เคยขายกลับเข้าคลัง
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      หากเลือกข้อนี้ สินค้าทุกชิ้นที่เคยขายไปจะถูกบวกยอดสต็อกกลับคืนเหมือนก่อนขาย
                    </span>
                  </div>
                </label>
              )}

              {selectedAction.showResetStock && (
                <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={resetStock}
                    onChange={(e) => setResetStock(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      รีเซ็ตจำนวนสต็อกสินค้าคงเหลือทุกชิ้นเป็น 0
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      ปรับยอดคงเหลือสินค้าทุกรายการเป็น 0 ชิ้นเพื่อเริ่มนับสต็อกจริงใหม่
                    </span>
                  </div>
                </label>
              )}

              {/* Strict Confirmation Input for Dangerous Actions */}
              {(selectedAction.target === 'products' || selectedAction.target === 'all') && (
                <div className="p-4 rounded-xl bg-red-50/70 border border-red-200 space-y-2">
                  <p className="text-xs font-bold text-red-900">
                    พิมพ์คำว่า "CONFIRM" หรือ "ยืนยัน" ในช่องด้านล่างเพื่อปลดล็อกปุ่ม:
                  </p>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="พิมพ์ CONFIRM เพื่อยืนยัน"
                    className="w-full px-3 py-2 bg-white border border-red-300 rounded-lg text-sm text-red-900 font-semibold focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedAction(null)}
                  disabled={loading}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleExecuteClear}
                  disabled={
                    loading ||
                    ((selectedAction.target === 'products' || selectedAction.target === 'all') &&
                      confirmText.trim().toUpperCase() !== 'CONFIRM' &&
                      confirmText.trim() !== 'ยืนยัน')
                  }
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>กำลังเคลียร์ข้อมูล...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={14} />
                      <span>{selectedAction.buttonText}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
