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
  Video,
  Smartphone,
  Monitor,
  Tablet,
} from 'lucide-react';

interface Props {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

interface CameraDevice {
  id: string;
  label: string;
}

// โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
// Device detection
// โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
function detectDevice(): 'mobile' | 'tablet' | 'desktop' {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPod/.test(ua);
  const isIPad = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroidPhone = /Android/.test(ua) && /Mobile/.test(ua);
  const isAndroidTablet = /Android/.test(ua) && !/Mobile/.test(ua);
  if (isIOS || isAndroidPhone) return 'mobile';
  if (isIPad || isAndroidTablet) return 'tablet';
  return 'desktop';
}

function isInAppBrowser(): boolean {
  return /Line|FBAN|FBAV|Instagram|Messenger|MicroMessenger|Twitter/i.test(navigator.userAgent);
}

// โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
// Barcode formats
// โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
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

// Skip IR cameras on desktop
function isIRCamera(label: string): boolean {
  return /\bIR\b|Infrared|infrared|ๆทฑๅบฆ|ToF|depth|face auth/i.test(label);
}

// Audio beep + haptic
function playScanFeedback() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15);
    }
  } catch { /* ignore */ }
  try { if ('vibrate' in navigator) navigator.vibrate([70, 40, 70]); } catch { /* ignore */ }
}

// Wait for DOM element to have real width (fixes clientWidth=0 in modal)
function waitForLayout(elementId: string, timeout = 1500): Promise<void> {
  return new Promise(resolve => {
    const start = Date.now();
    function check() {
      const el = document.getElementById(elementId);
      if (el && el.clientWidth > 0) { resolve(); }
      else if (Date.now() - start > timeout) { resolve(); }
      else { requestAnimationFrame(check); }
    }
    requestAnimationFrame(check);
  });
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
  const [mobileFacing, setMobileFacing] = useState<'environment' | 'user'>('environment');
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [isCameraStarting, setIsCameraStarting] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannedResult, setScannedResult] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'camera' | 'manual'>('camera');
  const [manualCode, setManualCode] = useState('');
  const [processingFile, setProcessingFile] = useState(false);
  const [isBlackFrame, setIsBlackFrame] = useState(false); // true = camera is IR/black


  const deviceType = detectDevice();
  const inApp = isInAppBrowser();

  const handleSuccess = useCallback((code: string) => {
    const clean = code.trim();
    if (!clean) return;
    setScannedResult(clean);
    playScanFeedback();
    if (html5QrCodeRef.current?.isScanning) html5QrCodeRef.current.stop().catch(() => {});
    setTimeout(() => { onScan(clean); onClose(); }, 450);
  }, [onScan, onClose]);

  const forceStopCamera = useCallback(async () => {
    try {
      if (html5QrCodeRef.current) {
        if (html5QrCodeRef.current.isScanning) await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
        html5QrCodeRef.current = null;
      }
    } catch { /* ignore */ }
    try {
      const video = document.querySelector('#qr-reader-viewport video') as HTMLVideoElement;
      if (video?.srcObject) {
        (video.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        video.srcObject = null;
      }
    } catch { /* ignore */ }
  }, []);

  // โ”€โ”€ MOBILE: use facingMode only, never deviceId โ”€โ”€
  const startMobile = useCallback(async (scanner: Html5Qrcode, facing: 'environment' | 'user') => {
    const cfg = { fps: 12 };
    const onDec = (t: string) => handleSuccess(t);
    const onErr = () => {};
    try {
      await scanner.start({ facingMode: { exact: facing } }, cfg, onDec, onErr);
    } catch {
      try { await scanner.start({ facingMode: facing }, cfg, onDec, onErr); }
      catch {
        const fallback = facing === 'environment' ? 'user' : 'environment';
        await scanner.start({ facingMode: fallback }, cfg, onDec, onErr);
        if (isMountedRef.current) setMobileFacing(fallback);
      }
    }
  }, [handleSuccess]);

  // โ”€โ”€ TABLET: same strategy as mobile โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
  const startTablet = useCallback(async (scanner: Html5Qrcode, facing: 'environment' | 'user') => {
    const cfg = { fps: 12 };
    const onDec = (t: string) => handleSuccess(t);
    const onErr = () => {};
    try { await scanner.start({ facingMode: facing }, cfg, onDec, onErr); }
    catch {
      const fallback = facing === 'environment' ? 'user' : 'environment';
      await scanner.start({ facingMode: fallback }, cfg, onDec, onErr);
      if (isMountedRef.current) setMobileFacing(fallback);
    }
  }, [handleSuccess]);

  // โ”€โ”€ DESKTOP: enumerate cameras, filter IR โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
  const startDesktop = useCallback(async (scanner: Html5Qrcode, preferredId?: string) => {
    const cfg = { fps: 15 };
    const onDec = (t: string) => handleSuccess(t);
    const onErr = () => {};

    let camList = availableCamerasRef.current;
    if (camList.length === 0) {
      try { const p = await navigator.mediaDevices.getUserMedia({ video: true }); p.getTracks().forEach(t => t.stop()); } catch { /* permission */ }
      try {
        const raw = await Html5Qrcode.getCameras();
        if (raw?.length > 0) {
          const filtered = raw.map((c, i) => ({ id: c.id, label: c.label || `เธเธฅเนเธญเธ ${i + 1}` })).filter(c => !isIRCamera(c.label));
          camList = filtered.length > 0 ? filtered : raw.map((c, i) => ({ id: c.id, label: c.label || `เธเธฅเนเธญเธ ${i + 1}` }));
          availableCamerasRef.current = camList;
          if (isMountedRef.current) setAvailableCameras(camList);
        }
      } catch { camList = []; }
    }

    let targetId = preferredId || activeCameraIdRef.current;
    if (!targetId && camList.length > 0) {
      const preferred = camList.find(c => /back|rear|environment|\b0\b/i.test(c.label));
      targetId = preferred?.id ?? camList[0].id;
    }

    if (targetId) {
      activeCameraIdRef.current = targetId;
      if (isMountedRef.current) setActiveCameraId(targetId);
      await scanner.start(targetId, cfg, onDec, onErr);
    } else {
      await scanner.start({ facingMode: 'user' }, cfg, onDec, onErr);
    }
  }, [handleSuccess]);

  // โ”€โ”€ Master startCamera โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
  const startCamera = useCallback(async (preferredCameraId?: string, preferredFacing?: 'environment' | 'user') => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setCameraError(null);
    setIsCameraStarting(true);
    setTorchOn(false);
    setIsBlackFrame(false);

    await forceStopCamera();
    // โ… Wait for modal to paint (fixes html5-qrcode clientWidth=0 black screen)
    await waitForLayout('qr-reader-viewport');
    await new Promise(r => setTimeout(r, 150));
    if (!isMountedRef.current) { isStartingRef.current = false; return; }

    try {
      const scanner = new Html5Qrcode('qr-reader-viewport', { formatsToSupport: SUPPORTED_FORMATS, verbose: false });
      html5QrCodeRef.current = scanner;
      const facing = preferredFacing ?? mobileFacing;

      if (deviceType === 'mobile') await startMobile(scanner, facing);
      else if (deviceType === 'tablet') await startTablet(scanner, facing);
      else await startDesktop(scanner, preferredCameraId);

      try {
        const video = document.querySelector('#qr-reader-viewport video') as HTMLVideoElement;
        const track = (video?.srcObject as MediaStream)?.getVideoTracks()[0];
        setHasTorch('torch' in (track?.getCapabilities?.() ?? {}));
      } catch { setHasTorch(false); }

      // ✅ Black frame detector: sample video pixels after 1.5s
      // If average brightness < 8/255, it's likely an IR camera → show warning
      setTimeout(() => {
        if (!isMountedRef.current) return;
        try {
          const video = document.querySelector('#qr-reader-viewport video') as HTMLVideoElement;
          if (!video || video.readyState < 2) return;
          const canvas = document.createElement('canvas');
          canvas.width = 32; canvas.height = 32;
          const ctx2d = canvas.getContext('2d');
          if (!ctx2d) return;
          ctx2d.drawImage(video, 0, 0, 32, 32);
          const data = ctx2d.getImageData(0, 0, 32, 32).data;
          let sum = 0;
          for (let i = 0; i < data.length; i += 4) {
            sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
          }
          const avgBrightness = sum / (32 * 32); // 0–255
          if (avgBrightness < 10 && isMountedRef.current) {
            setIsBlackFrame(true);
          } else {
            setIsBlackFrame(false);
          }
        } catch { /* ignore canvas errors */ }
      }, 1800);

    } catch (err: unknown) {
      console.warn('[BarcodeScanner] error:', err);
      let msg = 'เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เน€เธเธดเธ”เธเธฅเนเธญเธเธชเธ”เนเธ”เน';
      if (inApp) msg = 'เธ•เธฃเธงเธเธเธเน€เธเธดเธ”เธเนเธฒเธเนเธญเธ LINE/Messenger โ€” เธเธ” โฎ เนเธฅเนเธงเน€เธฅเธทเธญเธ "เน€เธเธดเธ”เนเธเน€เธเธฃเธฒเธงเนเน€เธเธญเธฃเน" เธซเธฃเธทเธญเธเธ” "เธ–เนเธฒเธขเธฃเธนเธเธชเนเธเธ" เธ”เนเธฒเธเธฅเนเธฒเธ';
      else if (!window.isSecureContext) msg = 'เธ•เนเธญเธเนเธเน HTTPS โ€” เธเธ” "เธ–เนเธฒเธขเธฃเธนเธเธชเนเธเธ" เธ”เนเธฒเธเธฅเนเธฒเธเนเธ—เธเนเธ”เนเน€เธฅเธข';
      else if (err && typeof err === 'object' && 'name' in err) {
        const n = (err as { name: string }).name;
        if (n === 'NotAllowedError' || n === 'PermissionDeniedError') msg = 'เธเธฃเธธเธ“เธฒเธเธ” Allow เธชเธดเธ—เธเธดเนเธเธฅเนเธญเธเนเธเธเธฒเธฃเธ•เธฑเนเธเธเนเธฒเน€เธเธฃเธฒเธงเนเน€เธเธญเธฃเน';
        else if (n === 'NotReadableError' || n === 'TrackStartError') msg = 'เธเธฅเนเธญเธเธ–เธนเธเนเธเนเธเธฒเธเนเธ”เธขเนเธเธฃเนเธเธฃเธกเธญเธทเนเธ เธเธฃเธธเธ“เธฒเธเธดเธ”เนเธญเธเธญเธทเนเธเธเนเธญเธ';
        else if (n === 'OverconstrainedError') msg = 'เนเธกเนเธเธเธเธฅเนเธญเธเธ—เธตเนเธฃเธญเธเธฃเธฑเธ โ€” เธฅเธญเธ "เธชเธฅเธฑเธเธเธฅเนเธญเธ" เธซเธฃเธทเธญ "เธ–เนเธฒเธขเธฃเธนเธเธชเนเธเธ"';
      }
      setCameraError(msg);
    } finally {
      isStartingRef.current = false;
      if (isMountedRef.current) setIsCameraStarting(false);
    }
  }, [forceStopCamera, startMobile, startTablet, startDesktop, deviceType, mobileFacing, inApp]);

  const switchCameraTo = useCallback(async (newId: string) => {
    activeCameraIdRef.current = newId;
    setActiveCameraId(newId);
    isStartingRef.current = false;
    await startCamera(newId);
  }, [startCamera]);

  const switchCamera = useCallback(async () => {
    isStartingRef.current = false;
    if (deviceType === 'mobile' || deviceType === 'tablet') {
      const next = mobileFacing === 'environment' ? 'user' : 'environment';
      setMobileFacing(next);
      await startCamera(undefined, next);
    } else {
      const cams = availableCamerasRef.current;
      if (cams.length <= 1) { await startCamera(); return; }
      const idx = cams.findIndex(c => c.id === activeCameraIdRef.current);
      await switchCameraTo(cams[(idx + 1) % cams.length].id);
    }
  }, [deviceType, mobileFacing, startCamera, switchCameraTo]);

  const toggleTorch = async () => {
    try {
      const video = document.querySelector('#qr-reader-viewport video') as HTMLVideoElement;
      const track = (video?.srcObject as MediaStream)?.getVideoTracks()[0];
      if (track) { await track.applyConstraints({ advanced: [{ torch: !torchOn } as unknown as MediaTrackConstraintSet] }); setTorchOn(t => !t); }
    } catch (e) { console.warn('Torch:', e); }
  };

  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessingFile(true); setCameraError(null);
    try {
      const tmp = new Html5Qrcode('qr-reader-file-worker', { formatsToSupport: SUPPORTED_FORMATS, verbose: false });
      const text = await tmp.scanFile(file, false);
      tmp.clear(); handleSuccess(text);
    } catch { setCameraError('เนเธกเนเธเธเธเธฒเธฃเนเนเธเนเธ”เนเธเธ เธฒเธ เธเธฃเธธเธ“เธฒเธ–เนเธฒเธขเนเธซเธกเนเนเธซเนเธเธฑเธ”เน€เธเธเธเธถเนเธ'); }
    finally { setProcessingFile(false); e.target.value = ''; }
  };

  useEffect(() => {
    isMountedRef.current = true;
    isStartingRef.current = false; // reset StrictMode double-call guard
    if (activeTab === 'camera') startCamera();
    else forceStopCamera();
    return () => { isMountedRef.current = false; forceStopCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const activeCamLabel =
    deviceType === 'mobile' || deviceType === 'tablet'
      ? mobileFacing === 'environment' ? '๐“ท เธเธฅเนเธญเธเธซเธฅเธฑเธ' : '๐คณ เธเธฅเนเธญเธเธซเธเนเธฒ'
      : availableCameras.find(c => c.id === activeCameraId)?.label;

  const DeviceBadge = () => {
    if (deviceType === 'mobile')
      return <span className="flex items-center gap-1 text-[10px] font-medium text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full"><Smartphone size={10} /> เธกเธทเธญเธ–เธทเธญ</span>;
    if (deviceType === 'tablet')
      return <span className="flex items-center gap-1 text-[10px] font-medium text-purple-600 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full"><Tablet size={10} /> เนเธ—เนเธเน€เธฅเนเธ•</span>;
    return <span className="flex items-center gap-1 text-[10px] font-medium text-slate-600 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded-full"><Monitor size={10} /> เธเธญเธกเธเธดเธงเน€เธ•เธญเธฃเน</span>;
  };

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-3 backdrop-blur-xs animate-fadeIn">
      <div id="qr-reader-file-worker" style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: '300px', height: '300px', opacity: 0, pointerEvents: 'none' }} />
      <input ref={fileCaptureInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileScan} />
      <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileScan} />

      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
          <div className="flex items-center gap-2">
            <Scan size={18} className="text-blue-600" />
            <span className="font-semibold text-sm text-slate-800">เธชเนเธเธเธเธฒเธฃเนเนเธเนเธ” / QR Code</span>
            <DeviceBadge />
          </div>
          <div className="flex items-center gap-1">
            <div className="flex bg-slate-200/80 p-0.5 rounded-lg text-xs mr-1">
              <button type="button" onClick={() => setActiveTab('camera')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1 ${activeTab === 'camera' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'}`}>
                <Camera size={12} /> เธเธฅเนเธญเธ
              </button>
              <button type="button" onClick={() => setActiveTab('manual')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1 ${activeTab === 'manual' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'}`}>
                <Keyboard size={12} /> เธเธดเธกเธเนเธฃเธซเธฑเธช
              </button>
            </div>
            <button onClick={() => { forceStopCamera(); onClose(); }}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {activeTab === 'camera' ? (
            <>
              {/* DESKTOP: camera dropdown (multiple cameras) */}
              {deviceType === 'desktop' && availableCameras.length > 1 && (
                <div className="flex items-center gap-2 p-2 bg-slate-100 rounded-xl border border-slate-200">
                  <Video size={14} className="text-blue-600 flex-shrink-0" />
                  <span className="text-xs font-semibold text-slate-700 flex-shrink-0">เน€เธฅเธทเธญเธเธเธฅเนเธญเธ:</span>
                  <select value={activeCameraId} onChange={e => switchCameraTo(e.target.value)}
                    className="flex-1 text-xs bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0">
                    {availableCameras.map((cam, i) => (
                      <option key={cam.id} value={cam.id}>เธเธฅเนเธญเธ {i + 1}: {cam.label}</option>
                    ))}
                  </select>
                  <button type="button" onClick={switchCamera}
                    className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center gap-1 flex-shrink-0 transition-all active:scale-95">
                    <RefreshCw size={11} /> เธชเธฅเธฑเธ
                  </button>
                </div>
              )}

              {/* DESKTOP: single camera info bar */}
              {deviceType === 'desktop' && availableCameras.length === 1 && (
                <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-100 rounded-xl border border-slate-200 text-xs text-slate-600">
                  <Monitor size={13} className="text-slate-500 flex-shrink-0" />
                  <span className="truncate flex-1">{availableCameras[0].label}</span>
                  <button type="button" onClick={() => { isStartingRef.current = false; startCamera(); }}
                    className="ml-auto text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 flex-shrink-0">
                    <RefreshCw size={11} /> เธฃเธตเธชเธ•เธฒเธฃเนเธ—
                  </button>
                </div>
              )}

              {/* MOBILE / TABLET: frontโ€“back toggle */}
              {(deviceType === 'mobile' || deviceType === 'tablet') && (
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs text-slate-600 flex items-center gap-1.5">
                    {deviceType === 'mobile'
                      ? <Smartphone size={13} className="text-blue-500" />
                      : <Tablet size={13} className="text-purple-500" />}
                    <span>เนเธเน: <b>{mobileFacing === 'environment' ? 'เธเธฅเนเธญเธเธซเธฅเธฑเธ' : 'เธเธฅเนเธญเธเธซเธเนเธฒ'}</b></span>
                  </span>
                  <button type="button" onClick={switchCamera}
                    className="text-xs text-blue-600 font-medium flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200 transition-all">
                    <RefreshCw size={12} /> เธชเธฅเธฑเธเธเธฅเนเธญเธเธซเธเนเธฒ/เธซเธฅเธฑเธ
                  </button>
                </div>
              )}

              {/* Viewport */}
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3] border-2 border-slate-700 shadow-inner">
                <div id="qr-reader-viewport" className="w-full h-full"
                  style={{ width: '100%', height: '100%', minHeight: '240px', minWidth: '240px' }} />

                {/* Scan reticle */}
                {!cameraError && !isCameraStarting && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
                    <div className="w-[80%] h-[65%] border-2 border-blue-400/80 rounded-xl relative shadow-[0_0_20px_rgba(59,130,246,0.3)]">
                      <div className="absolute -top-1.5 -left-1.5 w-5 h-5 border-t-4 border-l-4 border-blue-500 rounded-tl-sm" />
                      <div className="absolute -top-1.5 -right-1.5 w-5 h-5 border-t-4 border-r-4 border-blue-500 rounded-tr-sm" />
                      <div className="absolute -bottom-1.5 -left-1.5 w-5 h-5 border-b-4 border-l-4 border-blue-500 rounded-bl-sm" />
                      <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 border-b-4 border-r-4 border-blue-500 rounded-br-sm" />
                      <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_8px_rgba(239,68,68,0.9)] scan-beam-line" />
                    </div>
                  </div>
                )}

                {/* Camera label */}
                {!cameraError && !isCameraStarting && activeCamLabel && (
                  <div className="absolute bottom-2 left-2 z-10 pointer-events-none">
                    <span className="text-[10px] text-white bg-black/60 px-2 py-0.5 rounded-full flex items-center gap-1 backdrop-blur-sm">
                      <Video size={9} className="text-blue-400" />
                      <span className="truncate max-w-[180px]">{activeCamLabel}</span>
                    </span>
                  </div>
                )}

                {/* Loading */}
                {isCameraStarting && !cameraError && (
                  <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center text-white gap-2.5 p-4 text-center z-20">
                    <RefreshCw size={32} className="animate-spin text-blue-400" />
                    <p className="text-sm font-medium">เธเธณเธฅเธฑเธเน€เธเธดเธ”เธเธฅเนเธญเธ...</p>
                    <p className="text-xs text-slate-400">เธเธฃเธธเธ“เธฒเธเธ” Allow เธซเธฒเธเธฃเธฐเธเธเธ–เธฒเธกเธชเธดเธ—เธเธดเนเธเธฅเนเธญเธ</p>
                    {deviceType !== 'desktop' && <p className="text-[11px] text-blue-300 mt-1">๐’ก เธซเธฃเธทเธญเธเธ” "เธ–เนเธฒเธขเธฃเธนเธเธชเนเธเธ" เธ”เนเธฒเธเธฅเนเธฒเธ</p>}
                  </div>
                )}

                {/* Processing file */}
                {processingFile && (
                  <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center text-white gap-2 z-20">
                    <RefreshCw size={32} className="animate-spin text-green-400" />
                    <p className="text-sm font-medium">เธเธณเธฅเธฑเธเธ–เธญเธ”เธฃเธซเธฑเธชเธเธฒเธเธ เธฒเธ...</p>
                  </div>
                )}

                {/* Controls: torch + switch */}
                {!cameraError && !isCameraStarting && (
                  <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
                    {hasTorch && (
                      <button type="button" onClick={toggleTorch}
                        className={`p-2 rounded-full backdrop-blur-md shadow-md transition-all ${torchOn ? 'bg-amber-400 text-slate-900 ring-2 ring-amber-300' : 'bg-black/50 text-white hover:bg-black/70'}`}>
                        {torchOn ? <Zap size={17} /> : <ZapOff size={17} />}
                      </button>
                    )}
                    <button type="button" onClick={switchCamera}
                      className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-md shadow-md transition-all">
                      <RefreshCw size={16} />
                    </button>
                  </div>
                )}

                {/* Success */}
                {scannedResult && (
                  <div className="absolute inset-0 bg-green-900/90 flex flex-col items-center justify-center text-white gap-2 p-4 text-center z-30 animate-scaleIn">
                    <CheckCircle2 size={48} className="text-green-300 animate-bounce" />
                    <p className="text-xs uppercase tracking-wider text-green-200">เธชเนเธเธเธชเธณเน€เธฃเนเธ</p>
                    <p className="text-lg font-mono font-bold bg-white/20 px-3 py-1 rounded-lg break-all">{scannedResult}</p>
                  </div>
                )}
              </div>

              {/* ⚠️ Black frame / IR camera auto-detected warning */}
              {isBlackFrame && !cameraError && !isCameraStarting && (
                <div className="p-3 bg-orange-50 border-2 border-orange-300 rounded-xl text-orange-900 text-xs flex items-start gap-2.5 shadow-sm">
                  <span className="text-lg flex-shrink-0 mt-0.5">⚠️</span>
                  <div className="flex-1 space-y-2">
                    <p className="font-bold text-orange-950">ตรวจพบกล้อง IR (ภาพมืด) — กล้องนี้ไม่รองรับการสแกน</p>
                    <p className="text-[11px] leading-relaxed">
                      {deviceType === 'desktop'
                        ? 'กล้อง USB2.0 HD UVC WebCam ที่ตรวจพบเป็นกล้อง Infrared สำหรับ Face ID ภาพจะมืดเสมอ กรุณาลองกดปุ่ม "ถ่ายรูปสแกน" ด้านล่าง หรือเชื่อมต่อกล้องภายนอก'
                        : 'กล้องที่เลือกอยู่ส่งภาพมืด ลองสลับกล้องหน้า/หลัง'}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-0.5">
                      {deviceType === 'desktop' && availableCameras.length > 1 && (
                        <button type="button" onClick={switchCamera}
                          className="px-2.5 py-1 bg-orange-200 hover:bg-orange-300 text-orange-900 font-semibold rounded-lg text-xs transition-all flex items-center gap-1">
                          <RefreshCw size={11} /> สลับกล้อง RGB
                        </button>
                      )}
                      {(deviceType === 'mobile' || deviceType === 'tablet') && (
                        <button type="button" onClick={switchCamera}
                          className="px-2.5 py-1 bg-orange-200 hover:bg-orange-300 text-orange-900 font-semibold rounded-lg text-xs transition-all flex items-center gap-1">
                          <RefreshCw size={11} /> สลับกล้อง
                        </button>
                      )}
                      <button type="button" onClick={() => fileCaptureInputRef.current?.click()}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs transition-all flex items-center gap-1">
                        <Camera size={11} /> ถ่ายรูปสแกน (แนะนำ)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Error */}
              {cameraError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-900 text-xs flex items-start gap-2.5">
                  <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1.5">
                    <p className="font-semibold">{cameraError}</p>
                    <button type="button" onClick={() => { isStartingRef.current = false; startCamera(); }}
                      className="px-2.5 py-1 bg-red-200 hover:bg-red-300 text-red-900 font-semibold rounded-lg text-xs transition-all">
                      เธฅเธญเธเนเธซเธกเนเธญเธตเธเธเธฃเธฑเนเธ
                    </button>
                  </div>
                </div>
              )}

              {/* Device-specific tips */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                <div className="font-semibold flex items-center justify-between">
                  <span>๐’ก เธซเธฒเธเธเธฅเนเธญเธเธกเธทเธ” / เนเธกเนเธ—เธณเธเธฒเธ:</span>
                  <button type="button" onClick={() => { isStartingRef.current = false; startCamera(); }}
                    className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 text-[11px]">
                    <RefreshCw size={11} /> เธฃเธตเธชเธ•เธฒเธฃเนเธ—เธเธฅเนเธญเธ
                  </button>
                </div>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-800">
                  {(deviceType === 'mobile' || deviceType === 'tablet') && (
                    <>
                      <li><b>เธงเธดเธเธตเธ—เธตเนเธเนเธฒเธขเธ—เธตเนเธชเธธเธ”:</b> เธเธ” <b>"เธ–เนเธฒเธขเธฃเธนเธเธชเนเธเธ"</b> เธ”เนเธฒเธเธฅเนเธฒเธ โ€” เนเธเนเนเธ”เน 100% เธ—เธธเธเธฃเธธเนเธ</li>
                      {inApp && <li><b>LINE/Facebook:</b> เธเธ” โฎ เนเธฅเนเธงเน€เธฅเธทเธญเธ <b>"เน€เธเธดเธ”เนเธเน€เธเธฃเธฒเธงเนเน€เธเธญเธฃเน"</b> (Chrome/Safari)</li>}
                      <li>เธเธ” <b>"เธชเธฅเธฑเธเธเธฅเนเธญเธเธซเธเนเธฒ/เธซเธฅเธฑเธ"</b> เธซเธฒเธเธ เธฒเธเนเธกเนเนเธชเธ”เธ</li>
                    </>
                  )}
                  {deviceType === 'desktop' && (
                    <>
                      <li><b>ASUS/HP Laptop:</b> เธเธ” <b>Fn+F10</b> เน€เธเธทเนเธญเน€เธเธดเธ”เธเธฅเนเธญเธ เนเธฅเธฐเธ•เธฃเธงเธเธเธฒเธเธดเธ”เน€เธฅเธเธชเน</li>
                      <li>เธ–เนเธฒเธเธฅเนเธญเธเธกเธทเธ” เธฅเธญเธ <b>"เธชเธฅเธฑเธเธเธฅเนเธญเธ"</b> เน€เธเธทเนเธญเน€เธเธฅเธตเนเธขเธเธเธฒเธ IR โ’ RGB</li>
                      <li>เธเธ” <b>"เธ–เนเธฒเธขเธฃเธนเธเธชเนเธเธ"</b> เน€เธเนเธเธงเธดเธเธตเธชเธณเธฃเธญเธ</li>
                    </>
                  )}
                </ul>
              </div>
            </>
          ) : (
            /* Manual input */
            <div className="py-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">เธเธฃเธญเธเธซเธกเธฒเธขเน€เธฅเธเธเธฒเธฃเนเนเธเนเธ” เธซเธฃเธทเธญ เธฃเธซเธฑเธชเธชเธดเธเธเนเธฒ</label>
              <form onSubmit={e => { e.preventDefault(); if (manualCode.trim()) handleSuccess(manualCode.trim()); }} className="space-y-3">
                <div className="relative">
                  <input type="text" autoFocus value={manualCode} onChange={e => setManualCode(e.target.value)}
                    placeholder="เน€เธเนเธ 8850006011052 เธซเธฃเธทเธญเธชเนเธเธเธเธฒเธเน€เธเธฃเธทเนเธญเธเธญเนเธฒเธ"
                    className="w-full px-3.5 py-3 border border-slate-300 rounded-xl font-mono text-base focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-inner" />
                  {manualCode && (
                    <button type="button" onClick={() => setManualCode('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X size={16} />
                    </button>
                  )}
                </div>
                <button type="submit" disabled={!manualCode.trim()}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-xl text-sm transition-all active:scale-98 flex items-center justify-center gap-2">
                  <Scan size={16} /> เธเนเธเธซเธฒ / เน€เธฅเธทเธญเธเธชเธดเธเธเนเธฒเธเธตเน
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div className="p-3 bg-slate-50 border-t flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => fileCaptureInputRef.current?.click()}
              className="py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all">
              <Camera size={15} /> เธ–เนเธฒเธขเธฃเธนเธเธชเนเธเธ
            </button>
            <button type="button" onClick={() => galleryInputRef.current?.click()}
              className="py-2.5 px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-medium flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all">
              <ImageIcon size={14} className="text-slate-500" /> เน€เธฅเธทเธญเธเธเธฒเธเธญเธฑเธฅเธเธฑเนเธก
            </button>
          </div>
          <p className="text-[11px] text-center text-slate-500">เธฃเธญเธเธฃเธฑเธ EAN-13, Code-128, QR Code เนเธฅเธฐเธเธฒเธฃเนเนเธเนเธ”เธ—เธธเธเธฃเธนเธเนเธเธ</p>
        </div>
      </div>

      <style>{`
        @keyframes scanBeamAnim {
          0%   { top: 12%; opacity: 0.6; }
          50%  { top: 88%; opacity: 1;   }
          100% { top: 12%; opacity: 0.6; }
        }
        .scan-beam-line { animation: scanBeamAnim 2.2s ease-in-out infinite; }
        #qr-reader-viewport {
          width: 100% !important; height: 100% !important;
          min-width: 240px !important; min-height: 240px !important;
          position: relative !important;
          display: flex !important; align-items: center !important; justify-content: center !important;
          overflow: hidden !important;
        }
        #qr-reader-viewport video {
          width: 100% !important; height: 100% !important; max-height: 100% !important;
          object-fit: cover !important; display: block !important;
          min-width: 240px !important; min-height: 240px !important;
        }
        #qr-shaded-region { border-color: rgba(0,0,0,0.45) !important; border-radius: 0.75rem !important; pointer-events: none !important; }
        @keyframes scaleIn { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .animate-scaleIn { animation: scaleIn 0.2s ease-out; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-fadeIn { animation: fadeIn 0.15s ease-out; }
      `}</style>
    </div>
  );
}
