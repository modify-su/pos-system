import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  Camera, X, Scan, Zap, ZapOff, RefreshCw,
  Image as ImageIcon, Keyboard, CheckCircle2,
  AlertCircle, Video, Smartphone, Monitor, Tablet,
} from 'lucide-react';

interface Props { onScan: (barcode: string) => void; onClose: () => void; }
interface CameraDevice { id: string; label: string; }

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

const SUPPORTED_FORMATS: Html5QrcodeSupportedFormats[] = [
  Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93, Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.DATA_MATRIX, Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
];

function isIRCamera(label: string): boolean {
  return /\bIR\b|Infrared|infrared|ToF|depth|face auth/i.test(label);
}

function playScanFeedback() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx(); const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination); osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15);
    }
  } catch { /* ignore */ }
  try { if ('vibrate' in navigator) navigator.vibrate([70, 40, 70]); } catch { /* ignore */ }
}

function waitForLayout(elementId: string, timeout = 1500): Promise<void> {
  return new Promise(resolve => {
    const start = Date.now();
    function check() {
      const el = document.getElementById(elementId);
      if (el && el.clientWidth > 0) resolve();
      else if (Date.now() - start > timeout) resolve();
      else requestAnimationFrame(check);
    }
    requestAnimationFrame(check);
  });
}

function sampleBrightness(): number {
  try {
    const video = document.querySelector('#qr-reader-viewport video') as HTMLVideoElement;
    if (!video || video.readyState < 2) return 255;
    const c = document.createElement('canvas'); c.width = 32; c.height = 32;
    const g = c.getContext('2d'); if (!g) return 255;
    g.drawImage(video, 0, 0, 32, 32);
    const d = g.getImageData(0, 0, 32, 32).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
    return sum / (32 * 32);
  } catch { return 255; }
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
  const [isBlackFrame, setIsBlackFrame] = useState(false);

  const deviceType = detectDevice();
  const inApp = isInAppBrowser();

  const handleSuccess = useCallback((code: string) => {
    const clean = code.trim(); if (!clean) return;
    setScannedResult(clean); playScanFeedback();
    if (html5QrCodeRef.current?.isScanning) html5QrCodeRef.current.stop().catch(() => {});
    setTimeout(() => { onScan(clean); onClose(); }, 450);
  }, [onScan, onClose]);

  const forceStopCamera = useCallback(async () => {
    try {
      if (html5QrCodeRef.current) {
        if (html5QrCodeRef.current.isScanning) await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear(); html5QrCodeRef.current = null;
      }
    } catch { /* ignore */ }
    try {
      const video = document.querySelector('#qr-reader-viewport video') as HTMLVideoElement;
      if (video?.srcObject) { (video.srcObject as MediaStream).getTracks().forEach(t => t.stop()); video.srcObject = null; }
    } catch { /* ignore */ }
  }, []);

  const startMobile = useCallback(async (scanner: Html5Qrcode, facing: 'environment' | 'user') => {
    const cfg = { fps: 12 }; const onDec = (t: string) => handleSuccess(t); const onErr = () => {};
    try { await scanner.start({ facingMode: { exact: facing } }, cfg, onDec, onErr); }
    catch {
      try { await scanner.start({ facingMode: facing }, cfg, onDec, onErr); }
      catch {
        const fb = facing === 'environment' ? 'user' : 'environment';
        await scanner.start({ facingMode: fb }, cfg, onDec, onErr);
        if (isMountedRef.current) setMobileFacing(fb);
      }
    }
  }, [handleSuccess]);

  const startTablet = useCallback(async (scanner: Html5Qrcode, facing: 'environment' | 'user') => {
    const cfg = { fps: 12 }; const onDec = (t: string) => handleSuccess(t); const onErr = () => {};
    try { await scanner.start({ facingMode: facing }, cfg, onDec, onErr); }
    catch {
      const fb = facing === 'environment' ? 'user' : 'environment';
      await scanner.start({ facingMode: fb }, cfg, onDec, onErr);
      if (isMountedRef.current) setMobileFacing(fb);
    }
  }, [handleSuccess]);

  const startDesktop = useCallback(async (scanner: Html5Qrcode, preferredId?: string) => {
    const cfg = { fps: 15 }; const onDec = (t: string) => handleSuccess(t); const onErr = () => {};
    let camList = availableCamerasRef.current;
    if (camList.length === 0) {
      try { const p = await navigator.mediaDevices.getUserMedia({ video: true }); p.getTracks().forEach(t => t.stop()); } catch { /* ok */ }
      try {
        const raw = await Html5Qrcode.getCameras();
        if (raw?.length > 0) {
          const filtered = raw.map((c, i) => ({ id: c.id, label: c.label || ('Camera ' + (i + 1)) })).filter(c => !isIRCamera(c.label));
          camList = filtered.length > 0 ? filtered : raw.map((c, i) => ({ id: c.id, label: c.label || ('Camera ' + (i + 1)) }));
          availableCamerasRef.current = camList;
          if (isMountedRef.current) setAvailableCameras(camList);
        }
      } catch { camList = []; }
    }
    let targetId = preferredId || activeCameraIdRef.current;
    if (!targetId && camList.length > 0) {
      const pref = camList.find(c => /back|rear|environment/i.test(c.label));
      targetId = pref?.id ?? camList[0].id;
    }
    if (targetId) {
      activeCameraIdRef.current = targetId;
      if (isMountedRef.current) setActiveCameraId(targetId);
      await scanner.start(targetId, cfg, onDec, onErr);
    } else { await scanner.start({ facingMode: 'user' }, cfg, onDec, onErr); }
  }, [handleSuccess]);

  const startCamera = useCallback(async (preferredCameraId?: string, preferredFacing?: 'environment' | 'user') => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setCameraError(null); setIsCameraStarting(true); setTorchOn(false); setIsBlackFrame(false);
    await forceStopCamera();
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
      setTimeout(() => {
        if (!isMountedRef.current) return;
        const avg = sampleBrightness();
        if (isMountedRef.current) setIsBlackFrame(avg < 10);
      }, 1800);
    } catch (err: unknown) {
      console.warn('[BarcodeScanner]', err);
      let msg = 'ไม่สามารถเปิดกล้องได้';
      if (inApp) msg = 'เปิดผ่าน LINE/Messenger — กด "เปิดในเบราว์เซอร์" หรือกด "ถ่ายรูปสแกน" ด้านล่าง';
      else if (!window.isSecureContext) msg = 'ต้องใช้ HTTPS — กด "ถ่ายรูปสแกน" ด้านล่าง';
      else if (err && typeof err === 'object' && 'name' in err) {
        const n = (err as { name: string }).name;
        if (n === 'NotAllowedError' || n === 'PermissionDeniedError') msg = 'กรุณากด Allow สิทธิ์กล้องในการตั้งค่าเบราว์เซอร์';
        else if (n === 'NotReadableError' || n === 'TrackStartError') msg = 'กล้องถูกใช้งานโดยโปรแกรมอื่น กรุณาปิดแอปอื่นก่อน';
        else if (n === 'OverconstrainedError') msg = 'ไม่พบกล้องที่รองรับ — กด "สลับกล้อง" หรือ "ถ่ายรูปสแกน"';
      }
      setCameraError(msg);
    } finally { isStartingRef.current = false; if (isMountedRef.current) setIsCameraStarting(false); }
  }, [forceStopCamera, startMobile, startTablet, startDesktop, deviceType, mobileFacing, inApp]);

  const switchCameraTo = useCallback(async (newId: string) => {
    activeCameraIdRef.current = newId; setActiveCameraId(newId);
    isStartingRef.current = false; await startCamera(newId);
  }, [startCamera]);

  const switchCamera = useCallback(async () => {
    isStartingRef.current = false;
    if (deviceType === 'mobile' || deviceType === 'tablet') {
      const next = mobileFacing === 'environment' ? 'user' : 'environment';
      setMobileFacing(next); await startCamera(undefined, next);
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
    } catch { /* ignore */ }
  };

  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setProcessingFile(true); setCameraError(null);
    try {
      const tmp = new Html5Qrcode('qr-reader-file-worker', { formatsToSupport: SUPPORTED_FORMATS, verbose: false });
      const text = await tmp.scanFile(file, false); tmp.clear(); handleSuccess(text);
    } catch { setCameraError('ไม่พบบาร์โค้ดในภาพ กรุณาถ่ายใหม่ให้ชัดเจนขึ้น'); }
    finally { setProcessingFile(false); e.target.value = ''; }
  };

  const handleClose = useCallback(() => {
    onClose();
    try {
      if (html5QrCodeRef.current) {
        const scanner = html5QrCodeRef.current;
        html5QrCodeRef.current = null;
        if (scanner.isScanning) {
          scanner.stop().catch(() => {}).finally(() => {
            try { scanner.clear(); } catch {}
          });
        } else {
          try { scanner.clear(); } catch {}
        }
      }
    } catch { /* ignore */ }
    try {
      const video = document.querySelector('#qr-reader-viewport video') as HTMLVideoElement;
      if (video?.srcObject) {
        (video.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        video.srcObject = null;
      }
    } catch { /* ignore */ }
  }, [onClose]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  useEffect(() => {
    isMountedRef.current = true; isStartingRef.current = false;
    if (activeTab === 'camera') startCamera(); else forceStopCamera();
    return () => { isMountedRef.current = false; forceStopCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const activeCamLabel =
    deviceType === 'mobile' || deviceType === 'tablet'
      ? (mobileFacing === 'environment' ? 'กล้องหลัง' : 'กล้องหน้า')
      : availableCameras.find(c => c.id === activeCameraId)?.label;

  const DeviceBadge = () => {
    if (deviceType === 'mobile') return <span className="text-[10px] font-medium text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Smartphone size={9}/> มือถือ</span>;
    if (deviceType === 'tablet') return <span className="text-[10px] font-medium text-purple-600 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Tablet size={9}/> แท็บเล็ต</span>;
    return <span className="text-[10px] font-medium text-slate-600 bg-slate-100 border border-slate-300 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Monitor size={9}/> คอมพิวเตอร์</span>;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div id="qr-reader-file-worker" style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: '300px', height: '300px', opacity: 0, pointerEvents: 'none' }} />
      <input ref={fileCaptureInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileScan} />
      <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileScan} />

      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col" style={{ maxHeight: '94vh', overflow: 'hidden' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Scan size={17} className="text-blue-600 flex-shrink-0" />
            <span className="font-semibold text-sm text-slate-800 truncate">สแกนบาร์โค้ด / QR</span>
            <DeviceBadge />
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            <div className="flex bg-slate-200/80 p-0.5 rounded-lg text-xs">
              <button type="button" onClick={() => setActiveTab('camera')}
                className={'px-2 py-1 rounded-md font-medium transition-all flex items-center gap-0.5 ' + (activeTab === 'camera' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600')}>
                <Camera size={11}/> กล้อง
              </button>
              <button type="button" onClick={() => setActiveTab('manual')}
                className={'px-2 py-1 rounded-md font-medium transition-all flex items-center gap-0.5 ' + (activeTab === 'manual' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600')}>
                <Keyboard size={11}/> พิมพ์รหัส
              </button>
            </div>
            <button
              type="button"
              onClick={handleClose}
              title="ปิดหน้าต่าง (Esc)"
              aria-label="ปิดหน้าต่างสแกน"
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-200 active:bg-slate-300 transition-colors ml-1 flex-shrink-0 cursor-pointer"
            >
              <X size={20} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {activeTab === 'camera' ? (
            <>
              {/* DESKTOP: camera dropdown */}
              {deviceType === 'desktop' && availableCameras.length > 1 && (
                <div className="flex items-center gap-2 p-2 bg-slate-100 rounded-xl border border-slate-200">
                  <Video size={13} className="text-blue-600 flex-shrink-0" />
                  <span className="text-xs font-semibold text-slate-700 flex-shrink-0">เลือกกล้อง:</span>
                  <select value={activeCameraId} onChange={e => switchCameraTo(e.target.value)}
                    className="flex-1 text-xs bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0">
                    {availableCameras.map((cam, i) => (
                      <option key={cam.id} value={cam.id}>กล้อง {i + 1}: {cam.label}</option>
                    ))}
                  </select>
                  <button type="button" onClick={switchCamera}
                    className="px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center gap-1 flex-shrink-0 transition-all active:scale-95">
                    <RefreshCw size={10}/> สลับ
                  </button>
                </div>
              )}
              {deviceType === 'desktop' && availableCameras.length === 1 && (
                <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-100 rounded-xl border border-slate-200 text-xs text-slate-600">
                  <Monitor size={12} className="text-slate-500 flex-shrink-0" />
                  <span className="truncate flex-1">{availableCameras[0].label}</span>
                  <button type="button" onClick={() => { isStartingRef.current = false; startCamera(); }}
                    className="ml-auto text-blue-600 font-medium flex items-center gap-1 flex-shrink-0">
                    <RefreshCw size={10}/> รีสตาร์ท
                  </button>
                </div>
              )}

              {/* MOBILE/TABLET */}
              {(deviceType === 'mobile' || deviceType === 'tablet') && (
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs text-slate-600 flex items-center gap-1">
                    {deviceType === 'mobile' ? <Smartphone size={12} className="text-blue-500"/> : <Tablet size={12} className="text-purple-500"/>}
                    กำลังใช้: <b className="ml-0.5">{mobileFacing === 'environment' ? 'กล้องหลัง' : 'กล้องหน้า'}</b>
                  </span>
                  <button type="button" onClick={switchCamera}
                    className="text-xs text-blue-600 font-medium flex items-center gap-1 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 transition-all hover:bg-blue-100">
                    <RefreshCw size={11}/> สลับกล้องหน้า/หลัง
                  </button>
                </div>
              )}

              {/* Viewport */}
              <div className="relative rounded-2xl overflow-hidden bg-black border-2 border-slate-700" style={{ aspectRatio: '4/3' }}>
                <div id="qr-reader-viewport" style={{ width: '100%', height: '100%', minHeight: '220px', minWidth: '220px' }} />

                {!cameraError && !isCameraStarting && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
                    <div className="border-2 border-blue-400/80 rounded-xl relative" style={{ width: '80%', height: '65%' }}>
                      <div className="absolute -top-1.5 -left-1.5 w-5 h-5 border-t-4 border-l-4 border-blue-500 rounded-tl-sm" />
                      <div className="absolute -top-1.5 -right-1.5 w-5 h-5 border-t-4 border-r-4 border-blue-500 rounded-tr-sm" />
                      <div className="absolute -bottom-1.5 -left-1.5 w-5 h-5 border-b-4 border-l-4 border-blue-500 rounded-bl-sm" />
                      <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 border-b-4 border-r-4 border-blue-500 rounded-br-sm" />
                      <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent scan-beam-line" />
                    </div>
                  </div>
                )}

                {!cameraError && !isCameraStarting && activeCamLabel && (
                  <div className="absolute bottom-2 left-2 z-10 pointer-events-none">
                    <span className="text-[10px] text-white bg-black/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Video size={9} className="text-blue-400" />
                      <span className="truncate" style={{ maxWidth: '160px' }}>{activeCamLabel}</span>
                    </span>
                  </div>
                )}

                {isCameraStarting && !cameraError && (
                  <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center text-white gap-2 p-4 text-center z-20">
                    <RefreshCw size={30} className="animate-spin text-blue-400" />
                    <p className="text-sm font-medium">กำลังเปิดกล้อง...</p>
                    <p className="text-xs text-slate-400">กรุณากด Allow หากระบบถามสิทธิ์กล้อง</p>
                    {deviceType !== 'desktop' && <p className="text-xs text-blue-300 mt-1">หรือกด ถ่ายรูปสแกน ด้านล่าง</p>}
                  </div>
                )}

                {processingFile && (
                  <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center text-white gap-2 z-20">
                    <RefreshCw size={30} className="animate-spin text-green-400" />
                    <p className="text-sm font-medium">กำลังถอดรหัสจากภาพ...</p>
                  </div>
                )}

                {!cameraError && !isCameraStarting && (
                  <div className="absolute top-2 right-2 flex items-center gap-1.5 z-20">
                    {hasTorch && (
                      <button type="button" onClick={toggleTorch}
                        className={'p-2 rounded-full shadow-md transition-all ' + (torchOn ? 'bg-amber-400 text-slate-900 ring-2 ring-amber-300' : 'bg-black/50 text-white hover:bg-black/70')}>
                        {torchOn ? <Zap size={16}/> : <ZapOff size={16}/>}
                      </button>
                    )}
                    <button type="button" onClick={switchCamera}
                      className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white shadow-md transition-all">
                      <RefreshCw size={15}/>
                    </button>
                  </div>
                )}

                {scannedResult && (
                  <div className="absolute inset-0 bg-green-900/90 flex flex-col items-center justify-center text-white gap-2 p-4 text-center z-30 animate-scaleIn">
                    <CheckCircle2 size={46} className="text-green-300 animate-bounce" />
                    <p className="text-xs uppercase tracking-wider text-green-200">สแกนสำเร็จ</p>
                    <p className="text-lg font-mono font-bold bg-white/20 px-3 py-1 rounded-lg break-all">{scannedResult}</p>
                  </div>
                )}
              </div>

              {/* Black frame warning */}
              {isBlackFrame && !cameraError && !isCameraStarting && (
                <div className="p-3 bg-orange-50 border-2 border-orange-300 rounded-xl text-orange-900 text-xs flex items-start gap-2">
                  <span className="text-base flex-shrink-0">⚠️</span>
                  <div className="flex-1 space-y-1.5">
                    <p className="font-bold text-orange-950">ตรวจพบกล้อง IR — ภาพจะมืดเสมอ</p>
                    <p className="text-[11px] leading-relaxed">
                      {deviceType === 'desktop'
                        ? 'กล้องนี้เป็น Infrared camera (Face ID) ไม่สามารถสแกนบาร์โค้ดได้ กรุณากดปุ่ม "ถ่ายรูปสแกน" ด้านล่าง'
                        : 'กล้องส่งภาพมืด ลองสลับกล้องหน้า/หลัง'}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {availableCameras.length > 1 && (
                        <button type="button" onClick={switchCamera}
                          className="px-2.5 py-1 bg-orange-200 hover:bg-orange-300 text-orange-900 font-semibold rounded-lg text-xs flex items-center gap-1">
                          <RefreshCw size={10}/> สลับกล้อง RGB
                        </button>
                      )}
                      {(deviceType === 'mobile' || deviceType === 'tablet') && (
                        <button type="button" onClick={switchCamera}
                          className="px-2.5 py-1 bg-orange-200 hover:bg-orange-300 text-orange-900 font-semibold rounded-lg text-xs flex items-center gap-1">
                          <RefreshCw size={10}/> สลับกล้อง
                        </button>
                      )}
                      <button type="button" onClick={() => fileCaptureInputRef.current?.click()}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs flex items-center gap-1">
                        <Camera size={10}/> ถ่ายรูปสแกน (แนะนำ)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {cameraError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-900 text-xs flex items-start gap-2">
                  <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1.5">
                    <p className="font-semibold">{cameraError}</p>
                    <button type="button" onClick={() => { isStartingRef.current = false; startCamera(); }}
                      className="px-2.5 py-1 bg-red-200 hover:bg-red-300 text-red-900 font-semibold rounded-lg text-xs">
                      ลองใหม่อีกครั้ง
                    </button>
                  </div>
                </div>
              )}

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                <div className="font-semibold flex items-center justify-between">
                  <span>หากกล้องมืด / ไม่ทำงาน:</span>
                  <button type="button" onClick={() => { isStartingRef.current = false; startCamera(); }}
                    className="text-blue-600 font-medium flex items-center gap-1 text-[11px]">
                    <RefreshCw size={10}/> รีสตาร์ทกล้อง
                  </button>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800">
                  {(deviceType === 'mobile' || deviceType === 'tablet') && (<>
                    <li>กด <b>ถ่ายรูปสแกน</b> ด้านล่าง — ใช้ได้ 100% ทุกรุ่น</li>
                    {inApp && <li><b>LINE/Facebook:</b> กด ⋮ เลือก เปิดในเบราว์เซอร์</li>}
                    <li>กด <b>สลับกล้องหน้า/หลัง</b> หากภาพไม่แสดง</li>
                  </>)}
                  {deviceType === 'desktop' && (<>
                    <li><b>ASUS/HP:</b> กด Fn+F10 เปิดกล้อง และตรวจฝาปิดเลนส์</li>
                    <li>กด <b>สลับกล้อง</b> เพื่อเปลี่ยนจาก IR เป็น RGB</li>
                    <li>กด <b>ถ่ายรูปสแกน</b> ด้านล่างเป็นวิธีสำรอง</li>
                  </>)}
                </ul>
              </div>
            </>
          ) : (
            <div className="py-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">กรอกหมายเลขบาร์โค้ด หรือ รหัสสินค้า</label>
              <form onSubmit={e => { e.preventDefault(); if (manualCode.trim()) handleSuccess(manualCode.trim()); }} className="space-y-3">
                <div className="relative">
                  <input type="text" autoFocus value={manualCode} onChange={e => setManualCode(e.target.value)}
                    placeholder="เช่น 8850006011052"
                    className="w-full px-3.5 py-3 border border-slate-300 rounded-xl font-mono text-base focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-inner" />
                  {manualCode && (
                    <button type="button" onClick={() => setManualCode('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X size={16}/>
                    </button>
                  )}
                </div>
                <button type="submit" disabled={!manualCode.trim()}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-xl text-sm flex items-center justify-center gap-2">
                  <Scan size={15}/> ค้นหา / เลือกสินค้านี้
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Bottom */}
        <div className="p-3 bg-slate-50 border-t flex-shrink-0 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => fileCaptureInputRef.current?.click()}
              className="py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-sm">
              <Camera size={15}/> ถ่ายรูปสแกน
            </button>
            <button type="button" onClick={() => galleryInputRef.current?.click()}
              className="py-2.5 px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-medium flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-sm">
              <ImageIcon size={14} className="text-slate-500"/> เลือกจากอัลบั้ม
            </button>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-full py-2 px-3 rounded-xl bg-slate-200/80 hover:bg-slate-300 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-98 transition-all cursor-pointer"
          >
            <X size={15} /> ปิดหน้าต่างสแกน
          </button>
          <p className="text-[11px] text-center text-slate-500">รองรับ EAN-13, Code-128, QR Code ทุกรูปแบบ</p>
        </div>
      </div>

      <style>{`
        @keyframes scanBeamAnim { 0%,100%{top:12%;opacity:.6}50%{top:88%;opacity:1} }
        .scan-beam-line { animation: scanBeamAnim 2.2s ease-in-out infinite; }
        #qr-reader-viewport { width:100%!important;height:100%!important;min-width:220px!important;min-height:220px!important;position:relative!important;display:flex!important;align-items:center!important;justify-content:center!important;overflow:hidden!important; }
        #qr-reader-viewport video { width:100%!important;height:100%!important;max-height:100%!important;object-fit:cover!important;display:block!important;min-width:220px!important;min-height:220px!important; }
        #qr-shaded-region { border-color:rgba(0,0,0,0.45)!important;border-radius:.75rem!important;pointer-events:none!important; }
        @keyframes scaleIn{from{transform:scale(.85);opacity:0}to{transform:scale(1);opacity:1}}
        .animate-scaleIn{animation:scaleIn .2s ease-out}
      `}</style>
    </div>
  );
}
