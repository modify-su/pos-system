import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
} from 'html5-qrcode';
import {
  Camera,
  X,
  Scan,
  Zap,
  ZapOff,
  RefreshCw,
  Image as ImageIcon,
  Keyboard,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface Props {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

// All standard 1D and 2D barcode / QR code formats
const SUPPORTED_FORMATS: Html5QrcodeSupportedFormats[] = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
];

// Audio beep + Haptic vibration helper
function playScanFeedback() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime); // C6 note
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    }
  } catch {
    // Ignore audio policy restrictions
  }

  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([70, 40, 70]);
    }
  } catch {
    // Ignore vibration restrictions
  }
}

export default function BarcodeScanner({ onScan, onClose }: Props) {
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const fileCaptureInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [isCameraStarting, setIsCameraStarting] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannedResult, setScannedResult] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'camera' | 'manual'>('camera');
  const [manualCode, setManualCode] = useState('');
  const [processingFile, setProcessingFile] = useState(false);

  // Handle successful scan
  const handleSuccess = useCallback((code: string) => {
    const cleanCode = code.trim();
    if (!cleanCode) return;

    setScannedResult(cleanCode);
    playScanFeedback();

    if (html5QrCodeRef.current?.isScanning) {
      html5QrCodeRef.current.stop().catch(() => {});
    }

    setTimeout(() => {
      onScan(cleanCode);
      onClose();
    }, 450);
  }, [onScan, onClose]);

  // Stop camera helper
  const stopCamera = useCallback(async () => {
    try {
      if (html5QrCodeRef.current) {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        html5QrCodeRef.current.clear();
        html5QrCodeRef.current = null;
      }
    } catch {
      // Ignore cleanup error
    }
  }, []);

  // Start live camera
  const startCamera = useCallback(async (facing: 'environment' | 'user') => {
    await stopCamera();
    setCameraError(null);
    setIsCameraStarting(true);
    setTorchOn(false);

    try {
      const scanner = new Html5Qrcode('qr-reader-viewport', {
        formatsToSupport: SUPPORTED_FORMATS,
        verbose: false,
      });
      html5QrCodeRef.current = scanner;

      const scanConfig = {
        fps: 15,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const w = Math.floor(Math.min(viewfinderWidth * 0.85, 340));
          const h = Math.floor(Math.min(viewfinderHeight * 0.65, 240));
          return { width: Math.max(w, 200), height: Math.max(h, 130) };
        },
      };

      try {
        // Attempt 1: Facing mode (environment / user) without rigid aspect ratio
        await scanner.start(
          { facingMode: facing },
          scanConfig,
          (decodedText) => {
            handleSuccess(decodedText);
          },
          () => {
            // Ignored per-frame decode failure
          }
        );
      } catch (firstErr) {
        console.warn('FacingMode camera start failed, trying getCameras fallback...', firstErr);
        // Attempt 2: Enumerate cameras and pick back camera ID
        const cameras = await Html5Qrcode.getCameras();
        if (!cameras || cameras.length === 0) {
          throw firstErr;
        }
        const backCamera =
          cameras.find((c) =>
            c.label.toLowerCase().includes('back') ||
            c.label.toLowerCase().includes('rear') ||
            c.label.toLowerCase().includes('environment')
          ) || cameras[cameras.length - 1];

        await scanner.start(
          backCamera.id,
          scanConfig,
          (decodedText) => {
            handleSuccess(decodedText);
          },
          () => {}
        );
      }

      // Check if torch/flashlight is supported
      try {
        const stream = (document.querySelector('#qr-reader-viewport video') as HTMLVideoElement)?.srcObject as MediaStream;
        const track = stream?.getVideoTracks()[0];
        const capabilities = (track?.getCapabilities && track.getCapabilities()) || {};
        setHasTorch('torch' in capabilities);
      } catch {
        setHasTorch(false);
      }
    } catch (err: unknown) {
      console.warn('Camera start error:', err);
      let msg = 'ไม่สามารถเปิดกล้องสดได้';
      const isLineOrInApp = /Line|FBAN|FBAV|Instagram|Messenger/i.test(navigator.userAgent);

      if (isLineOrInApp) {
        msg = 'ตรวจพบว่าเปิดผ่านแอป LINE / Messenger — กรุณาแตะปุ่ม 3 จุด (⋮) ด้านล่างขวา แล้วเลือก "เปิดในเบราว์เซอร์อื่น" (Chrome/Safari) หรือแตะปุ่ม "📸 ถ่ายรูปสแกน" ด้านล่างนี้ได้ทันทีครับ';
      } else if (window.isSecureContext === false) {
        msg = 'กล้องสดบนมือถือถูกจำกัดโดยระบบความปลอดภัยของเบราว์เซอร์ (ต้องใช้ HTTPS) — คุณสามารถกดปุ่ม "ถ่ายรูปสแกน" ด้านล่างเพื่อสแกนได้ทันที 100%';
      } else if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'NotAllowedError') {
        msg = 'กรุณากดอนุญาต (Allow) สิทธิ์การเข้าถึงกล้องถ่ายรูปในการตั้งค่าเบราว์เซอร์มือถือ';
      }
      setCameraError(msg);
    } finally {
      setIsCameraStarting(false);
    }
  }, [handleSuccess, stopCamera]);

  // Toggle Torch/Flashlight
  const toggleTorch = async () => {
    try {
      const stream = (document.querySelector('#qr-reader-viewport video') as HTMLVideoElement)?.srcObject as MediaStream;
      const track = stream?.getVideoTracks()[0];
      if (track) {
        await track.applyConstraints({
          advanced: [{ torch: !torchOn } as unknown as MediaTrackConstraintSet],
        });
        setTorchOn(!torchOn);
      }
    } catch (e) {
      console.warn('Torch toggle error:', e);
    }
  };

  // Switch between front and rear cameras
  const switchCamera = () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    startCamera(nextFacing);
  };

  // Handle image upload / camera snap photo scan
  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessingFile(true);
    setCameraError(null);

    try {
      const tempScanner = new Html5Qrcode('qr-reader-file-worker', {
        formatsToSupport: SUPPORTED_FORMATS,
        verbose: false,
      });
      const decodedText = await tempScanner.scanFile(file, false);
      tempScanner.clear();
      handleSuccess(decodedText);
    } catch {
      setCameraError('ไม่พบบาร์โค้ดหรือ QR Code ในภาพที่ถ่าย กรุณาลองถ่ายใหม่อีกครั้งให้ชัดเจนขึ้น');
    } finally {
      setProcessingFile(false);
      e.target.value = '';
    }
  };

  // Initialize camera on mount
  useEffect(() => {
    if (activeTab === 'camera') {
      startCamera(facingMode);
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [activeTab]);

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-3 backdrop-blur-xs animate-fadeIn">
      {/* Hidden container for image decoding worker */}
      <div
        id="qr-reader-file-worker"
        style={{
          position: 'fixed',
          top: '-9999px',
          left: '-9999px',
          width: '300px',
          height: '300px',
          pointerEvents: 'none',
          opacity: 0,
        }}
      />

      {/* Hidden file inputs for Mobile Camera Capture & Gallery */}
      <input
        ref={fileCaptureInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileScan}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileScan}
      />

      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b bg-slate-50">
          <div className="flex items-center gap-2 text-blue-600 font-semibold text-sm sm:text-base">
            <Scan size={19} className="text-blue-600" />
            <span>สแกนบาร์โค้ด / QR Code</span>
          </div>

          <div className="flex items-center gap-1">
            {/* Tab switch */}
            <div className="flex bg-slate-200/80 p-0.5 rounded-lg text-xs mr-2">
              <button
                type="button"
                onClick={() => setActiveTab('camera')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1 ${
                  activeTab === 'camera' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Camera size={13} /> กล้อง
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('manual')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1 ${
                  activeTab === 'manual' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Keyboard size={13} /> พิมพ์รหัส
              </button>
            </div>

            <button
              onClick={() => {
                stopCamera();
                onClose();
              }}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-center">
          {activeTab === 'camera' ? (
            <div className="relative">
              {/* Scanner Viewport */}
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3] flex items-center justify-center border-2 border-slate-700 shadow-inner">
                <div id="qr-reader-viewport" className="w-full h-full object-cover" />

                {/* Laser scan line & target frame animation */}
                {!cameraError && !isCameraStarting && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    {/* Viewfinder Reticle */}
                    <div className="w-[82%] h-[68%] border-2 border-blue-400/80 rounded-xl relative shadow-[0_0_20px_rgba(59,130,246,0.3)]">
                      {/* 4 Corner Markers */}
                      <div className="absolute -top-1.5 -left-1.5 w-5 h-5 border-t-4 border-l-4 border-blue-500 rounded-tl-sm" />
                      <div className="absolute -top-1.5 -right-1.5 w-5 h-5 border-t-4 border-r-4 border-blue-500 rounded-tr-sm" />
                      <div className="absolute -bottom-1.5 -left-1.5 w-5 h-5 border-b-4 border-l-4 border-blue-500 rounded-bl-sm" />
                      <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 border-b-4 border-r-4 border-blue-500 rounded-br-sm" />

                      {/* Moving Laser Beam */}
                      <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_8px_rgba(239,68,68,0.9)] animate-pulse scan-beam-line" />
                    </div>
                  </div>
                )}

                {/* Loading state */}
                {isCameraStarting && !cameraError && (
                  <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center text-white gap-2 p-4 text-center">
                    <RefreshCw size={32} className="animate-spin text-blue-400" />
                    <p className="text-sm font-medium">กำลังเปิดกล้องถ่ายรูป...</p>
                    <p className="text-xs text-slate-400">กรุณากดอนุญาต (Allow) หากระบบถามการเข้าถึงกล้อง</p>
                  </div>
                )}

                {/* Processing photo file indicator */}
                {processingFile && (
                  <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center text-white gap-2 p-4 text-center z-10">
                    <RefreshCw size={32} className="animate-spin text-green-400" />
                    <p className="text-sm font-medium">กำลังถอดรหัสบาร์โค้ดจากภาพ...</p>
                  </div>
                )}

                {/* Camera controls overlay (Torch & Switch camera) */}
                {!cameraError && !isCameraStarting && (
                  <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
                    {hasTorch && (
                      <button
                        type="button"
                        onClick={toggleTorch}
                        className={`p-2 rounded-full backdrop-blur-md transition-all shadow-md ${
                          torchOn ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300' : 'bg-black/50 text-white hover:bg-black/70'
                        }`}
                        title="เปิด/ปิดไฟฉาย"
                      >
                        {torchOn ? <Zap size={18} /> : <ZapOff size={18} />}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={switchCamera}
                      className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-md transition-all shadow-md"
                      title="สลับกล้องหน้า/หลัง"
                    >
                      <RefreshCw size={18} />
                    </button>
                  </div>
                )}

                {/* Success feedback overlay */}
                {scannedResult && (
                  <div className="absolute inset-0 bg-green-900/90 flex flex-col items-center justify-center text-white gap-2 p-4 text-center animate-scaleIn z-20">
                    <CheckCircle2 size={48} className="text-green-300 animate-bounce" />
                    <p className="text-xs uppercase tracking-wider text-green-200">สแกนสำเร็จ</p>
                    <p className="text-lg font-mono font-bold bg-white/20 px-3 py-1 rounded-lg break-all">
                      {scannedResult}
                    </p>
                  </div>
                )}
              </div>

              {/* Error Notice & Mobile Help */}
              {cameraError && (
                <div className="mt-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2.5 shadow-xs">
                  <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-amber-950 mb-0.5">{cameraError}</p>
                    <p className="text-amber-800 text-[11px] leading-relaxed">
                      💡 แนะนำ: ใช้ปุ่ม <b>"📸 ถ่ายรูปสแกน"</b> ด้านล่าง ซึ่งทำงานร่วมกับกล้องมือถือได้ 100% ทุกระบบปฏิบัติการ (iOS / Android)
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Manual Input Tab */
            <div className="py-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                กรอกหมายเลขบาร์โค้ด หรือ รหัสสินค้า
              </label>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (manualCode.trim()) {
                    handleSuccess(manualCode.trim());
                  }
                }}
                className="space-y-3"
              >
                <div className="relative">
                  <input
                    type="text"
                    autoFocus
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="เช่น 8850006011052 หรือ สแกนจากเครื่องอ่าน"
                    className="w-full px-3.5 py-3 border border-slate-300 rounded-xl font-mono text-base focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-inner"
                  />
                  {manualCode && (
                    <button
                      type="button"
                      onClick={() => setManualCode('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!manualCode.trim()}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-xl text-sm transition-all shadow-sm active:scale-98 flex items-center justify-center gap-2"
                >
                  <Scan size={17} /> ค้นหา / เลือกสินค้านี้
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Mobile Action Buttons Bar */}
        <div className="p-3 bg-slate-50 border-t flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            {/* Direct Camera Capture for Mobile (100% reliable on HTTP & HTTPS) */}
            <button
              type="button"
              onClick={() => fileCaptureInputRef.current?.click()}
              className="py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
            >
              <Camera size={16} />
              <span>📸 ถ่ายรูปสแกน</span>
            </button>

            {/* Gallery Upload */}
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="py-2.5 px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-medium flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all"
            >
              <ImageIcon size={15} className="text-slate-500" />
              <span>เลือกจากอัลบั้ม</span>
            </button>
          </div>

          <p className="text-[11px] text-center text-slate-500">
            รองรับทั้ง Barcode สินค้าทั่วไป (EAN-13, Code-128) และ QR Code ทุกรูปแบบ
          </p>
        </div>
      </div>

      {/* Internal CSS for laser beam scanner animation */}
      <style>{`
        @keyframes scanBeamAnim {
          0% { top: 12%; opacity: 0.6; }
          50% { top: 88%; opacity: 1; }
          100% { top: 12%; opacity: 0.6; }
        }
        .scan-beam-line {
          animation: scanBeamAnim 2.2s ease-in-out infinite;
        }
        #qr-reader-viewport video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
        }
      `}</style>
    </div>
  );
}
