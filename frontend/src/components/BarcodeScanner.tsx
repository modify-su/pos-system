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
  AlertCircle,
  Video
} from 'lucide-react';

interface Props {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

interface CameraDevice {
  id: string;
  label: string;
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
  const isMountedRef = useRef(true);
  const isStartingRef = useRef(false);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const availableCamerasRef = useRef<CameraDevice[]>([]);
  const activeCameraIdRef = useRef<string>('');

  const fileCaptureInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string>('');
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

  // Completely stop camera and release hardware tracks
  const forceStopCamera = useCallback(async () => {
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

    try {
      const video = document.querySelector('#qr-reader-viewport video') as HTMLVideoElement;
      if (video && video.srcObject) {
        const stream = video.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
        video.srcObject = null;
      }
    } catch {
      // Ignore video cleanup error
    }
  }, []);

  // Start live camera
  const startCamera = useCallback(async (preferredCameraId?: string) => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    setCameraError(null);
    setIsCameraStarting(true);
    setTorchOn(false);

    // Stop previous instance before starting new one
    await forceStopCamera();

    // Delay to allow operating system and browser to release camera hardware
    await new Promise((r) => setTimeout(r, 120));
    if (!isMountedRef.current) {
      isStartingRef.current = false;
      return;
    }

    try {
      // 1. Discover available cameras
      let camList = availableCamerasRef.current;
      if (camList.length === 0) {
        try {
          if (navigator.mediaDevices?.getUserMedia) {
            const probe = await navigator.mediaDevices.getUserMedia({ video: true });
            probe.getTracks().forEach((t) => t.stop());
          }
        } catch {
          // Probe may fail if permission denied
        }

        try {
          const rawCams = await Html5Qrcode.getCameras();
          if (rawCams && rawCams.length > 0) {
            camList = rawCams.map((c, idx) => ({
              id: c.id,
              label: c.label || `กล้อง ${idx + 1}`,
            }));
            availableCamerasRef.current = camList;
            if (isMountedRef.current) {
              setAvailableCameras(camList);
            }
          }
        } catch {
          camList = [];
        }
      }

      // 2. Determine target camera ID
      let targetId = preferredCameraId || activeCameraIdRef.current;
      if (!targetId && camList.length > 0) {
        const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
        if (isMobile) {
          // Rear camera for mobile
          const back = camList.find((c) =>
            /back|rear|environment|หลัง/i.test(c.label)
          ) || camList[camList.length - 1];
          targetId = back.id;
        } else {
          // Primary camera for PC / laptop
          targetId = camList[0].id;
        }
      }

      if (targetId) {
        activeCameraIdRef.current = targetId;
        if (isMountedRef.current) {
          setActiveCameraId(targetId);
        }
      }

      // 3. Initialize Html5Qrcode scanner
      const scanner = new Html5Qrcode('qr-reader-viewport', {
        formatsToSupport: SUPPORTED_FORMATS,
        verbose: false,
      });
      html5QrCodeRef.current = scanner;

      // Scan full frame (without restricting qrbox to avoid shaded border overlay)
      const scanConfig = {
        fps: 15,
      };

      // 4. Start scanner with camera ID or fallback facingMode
      if (targetId) {
        await scanner.start(
          targetId,
          scanConfig,
          (decodedText) => handleSuccess(decodedText),
          () => {}
        );
      } else {
        const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
        await scanner.start(
          { facingMode: isMobile ? 'environment' : 'user' },
          scanConfig,
          (decodedText) => handleSuccess(decodedText),
          () => {}
        );
      }

      // 5. Check if torch is supported
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
      const isSecure = window.isSecureContext !== false;

      if (isLineOrInApp) {
        msg = 'ตรวจพบว่าเปิดผ่านแอป LINE / Messenger — กรุณาแตะปุ่ม 3 จุด (⋮) ด้านล่างขวา แล้วเลือก "เปิดในเบราว์เซอร์อื่น" (Chrome/Safari) หรือแตะปุ่ม "ถ่ายรูปสแกน" ด้านล่างนี้';
      } else if (!isSecure) {
        msg = 'กล้องสดถูกจำกัดโดยระบบความปลอดภัยของเบราว์เซอร์ (ต้องใช้ HTTPS หรือ localhost) — สามารถกดปุ่ม "ถ่ายรูปสแกน" ด้านล่างเพื่อสแกนได้ทันที';
      } else if (err && typeof err === 'object' && 'name' in err) {
        const errName = (err as { name: string }).name;
        if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
          msg = 'กรุณากดอนุญาต (Allow) สิทธิ์การเข้าถึงกล้องถ่ายรูปในการตั้งค่าเบราว์เซอร์';
        } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
          msg = 'กล้องกำลังถูกใช้งานโดยโปรแกรมอื่น (เช่น Zoom, Meet, Line) กรุณาปิดโปรแกรมอื่นแล้วลองใหม่';
        }
      }
      setCameraError(msg);
    } finally {
      isStartingRef.current = false;
      if (isMountedRef.current) {
        setIsCameraStarting(false);
      }
    }
  }, [forceStopCamera, handleSuccess]);

  // Switch to specific camera ID
  const switchCameraTo = useCallback(async (newCameraId: string) => {
    activeCameraIdRef.current = newCameraId;
    setActiveCameraId(newCameraId);
    await startCamera(newCameraId);
  }, [startCamera]);

  // Switch to next camera in list
  const switchCamera = useCallback(async () => {
    const cams = availableCamerasRef.current;
    if (cams.length <= 1) {
      await startCamera();
      return;
    }
    const currId = activeCameraIdRef.current;
    const currIdx = cams.findIndex((c) => c.id === currId);
    const nextIdx = currIdx >= 0 ? (currIdx + 1) % cams.length : 1;
    const nextCam = cams[nextIdx];
    await switchCameraTo(nextCam.id);
  }, [startCamera, switchCameraTo]);

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

  // Initialize camera on mount and cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;

    if (activeTab === 'camera') {
      startCamera();
    } else {
      forceStopCamera();
    }

    return () => {
      isMountedRef.current = false;
      forceStopCamera();
    };
  }, [activeTab]);

  const activeCamLabel = availableCameras.find((c) => c.id === activeCameraId)?.label;

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
                forceStopCamera();
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
              {/* Camera Selector Bar if multiple cameras detected */}
              {availableCameras.length > 1 && (
                <div className="flex items-center gap-2 mb-2 p-1.5 bg-slate-100 rounded-xl border border-slate-200">
                  <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 pl-1 flex-shrink-0">
                    <Video size={14} className="text-blue-600" />
                    <span>เลือกกล้อง:</span>
                  </span>
                  <select
                    value={activeCameraId}
                    onChange={(e) => switchCameraTo(e.target.value)}
                    className="flex-1 text-xs bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 truncate"
                  >
                    {availableCameras.map((cam, idx) => (
                      <option key={cam.id} value={cam.id}>
                        กล้อง {idx + 1}: {cam.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={switchCamera}
                    className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center gap-1 flex-shrink-0 transition-all active:scale-95 shadow-xs"
                    title="สลับเป็นกล้องอีกตัว"
                  >
                    <RefreshCw size={12} /> สลับกล้อง
                  </button>
                </div>
              )}

              {/* Scanner Viewport Box */}
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3] border-2 border-slate-700 shadow-inner flex items-center justify-center">
                <div
                  id="qr-reader-viewport"
                  className="w-full h-full"
                  style={{ width: '100%', height: '100%', minHeight: '240px' }}
                />

                {/* Laser scan line & target frame animation */}
                {!cameraError && !isCameraStarting && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
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

                {/* Active Camera Badge */}
                {!cameraError && !isCameraStarting && activeCamLabel && (
                  <div className="absolute bottom-2 left-2 z-10 pointer-events-none">
                    <span className="text-[10px] text-slate-200 bg-black/60 px-2 py-0.5 rounded-full flex items-center gap-1 backdrop-blur-xs">
                      <Video size={10} className="text-blue-400" />
                      <span className="truncate max-w-[160px]">{activeCamLabel}</span>
                    </span>
                  </div>
                )}

                {/* Loading state */}
                {isCameraStarting && !cameraError && (
                  <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center text-white gap-2 p-4 text-center z-20">
                    <RefreshCw size={32} className="animate-spin text-blue-400" />
                    <p className="text-sm font-medium">กำลังเปิดกล้องถ่ายรูป...</p>
                    <p className="text-xs text-slate-400">กรุณากดอนุญาต (Allow) หากระบบถามการเข้าถึงกล้อง</p>
                  </div>
                )}

                {/* Processing photo file indicator */}
                {processingFile && (
                  <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center text-white gap-2 p-4 text-center z-20">
                    <RefreshCw size={32} className="animate-spin text-green-400" />
                    <p className="text-sm font-medium">กำลังถอดรหัสบาร์โค้ดจากภาพ...</p>
                  </div>
                )}

                {/* Camera controls overlay (Torch & Switch camera) */}
                {!cameraError && !isCameraStarting && (
                  <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
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

                    {availableCameras.length > 1 && (
                      <button
                        type="button"
                        onClick={switchCamera}
                        className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-md transition-all shadow-md flex items-center gap-1 text-xs"
                        title="สลับกล้อง"
                      >
                        <RefreshCw size={17} />
                        <span className="text-[10px] font-mono px-0.5">
                          {availableCameras.findIndex((c) => c.id === activeCameraId) + 1}/{availableCameras.length}
                        </span>
                      </button>
                    )}
                  </div>
                )}

                {/* Success feedback overlay */}
                {scannedResult && (
                  <div className="absolute inset-0 bg-green-900/90 flex flex-col items-center justify-center text-white gap-2 p-4 text-center animate-scaleIn z-30">
                    <CheckCircle2 size={48} className="text-green-300 animate-bounce" />
                    <p className="text-xs uppercase tracking-wider text-green-200">สแกนสำเร็จ</p>
                    <p className="text-lg font-mono font-bold bg-white/20 px-3 py-1 rounded-lg break-all">
                      {scannedResult}
                    </p>
                  </div>
                )}
              </div>

              {/* Helpful Troubleshooting for Black Screen */}
              <div className="mt-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1.5 shadow-xs">
                <div className="font-semibold flex items-center justify-between text-amber-950">
                  <span className="flex items-center gap-1.5">
                    💡 <span>ทำไมภาพถึงเป็นสีดำ? (วิธีแก้ไข):</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => startCamera(activeCameraIdRef.current)}
                    className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 text-[11px]"
                  >
                    <RefreshCw size={12} /> รีสตาร์ทกล้อง
                  </button>
                </div>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-800">
                  {availableCameras.length > 1 && (
                    <li>
                      <b>ลองสลับกล้อง</b>: กดเลือก <b>กล้อง 2</b> ในเมนูด้านบน (โน้ตบุ๊กบางรุ่นแยกกล้องปกติกับกล้อง IR อินฟราเรด)
                    </li>
                  )}
                  <li>
                    <b>กดปุ่มเปิดกล้องที่คีย์บอร์ด</b>: โน้ตบุ๊ก (ASUS / Lenovo / MSI) ให้กด <b>Fn + F10</b> เพื่อเปิดฮาร์ดแวร์กล้อง
                  </li>
                  <li>
                    <b>เปิดฝาสไลด์หน้ากล้อง</b>: ตรวจดูแถบสไลด์สีส้ม/ดำเหนือจอภาพว่าไม่ได้เลื่อนปิดบังหน้าเลนส์
                  </li>
                </ul>
              </div>

              {/* Error Notice & Mobile Help */}
              {cameraError && (
                <div className="mt-2.5 p-3 bg-red-50 border border-red-200 rounded-xl text-red-900 text-xs flex items-start gap-2.5 shadow-xs">
                  <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1.5">
                    <p className="font-semibold text-red-950">{cameraError}</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startCamera()}
                        className="px-2.5 py-1 bg-red-200 hover:bg-red-300 text-red-900 font-semibold rounded-lg text-xs transition-all"
                      >
                        ลองใหม่อีกครั้ง
                      </button>
                    </div>
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
              <span>ถ่ายรูปสแกน</span>
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

      {/* Internal CSS for laser beam scanner animation & video layout */}
      <style>{`
        @keyframes scanBeamAnim {
          0% { top: 12%; opacity: 0.6; }
          50% { top: 88%; opacity: 1; }
          100% { top: 12%; opacity: 0.6; }
        }
        .scan-beam-line {
          animation: scanBeamAnim 2.2s ease-in-out infinite;
        }
        #qr-reader-viewport {
          width: 100% !important;
          height: 100% !important;
          position: relative !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          overflow: hidden !important;
        }
        #qr-reader-viewport video {
          width: 100% !important;
          height: 100% !important;
          max-height: 100% !important;
          object-fit: cover !important;
          display: block !important;
        }
        #qr-shaded-region {
          border-color: rgba(0, 0, 0, 0.45) !important;
          border-radius: 0.75rem !important;
          pointer-events: none !important;
        }
      `}</style>
    </div>
  );
}
