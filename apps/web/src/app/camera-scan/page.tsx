'use client';

import React, { useRef, useState, useEffect } from 'react';
import {
  X, Zap, ZapOff, Grid, Camera, RefreshCw, RotateCcw,
  Crop, FileText, CheckCircle2, Download, Eye, Check, ArrowLeft, Sliders,
  ShieldAlert, Lock, AlertTriangle, ImagePlus, ChevronLeft, ChevronRight, Plus, Trash2, Layers
} from 'lucide-react';
import { applyCameraFilter, CameraFilterMode } from '@/utils/cameraFilter';
import { ScannerCropModal } from '@/components/ScannerCropModal';
import { OcrResultModal } from '@/components/OcrResultModal';
import { PDFDocument, degrees } from 'pdf-lib';
import { saveAs } from 'file-saver';
import { saveHistoryItem } from '@/utils/historyDB';
import { GranularProgressModal } from '@/components/GranularProgressModal';
import toast from 'react-hot-toast';
import { useLanguage } from '@/context/LanguageContext';

interface ScannedPhoto {
  id: string;
  originalSrc: string;
  filteredSrc: string;
  filterMode: CameraFilterMode;
  rotation: number;
}

type ScanMode = 'scan' | 'id_card';
type IDCardType = 'general' | 'driver_license' | 'id_card' | 'passport' | 'bank_card';
type CameraAspectRatio = 'full' | '4:3' | '3:4' | '1:1' | '16:9';

const PAGE_DIMS: Record<string, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  legal: [612, 1008],
  a3: [841.89, 1190.55],
  a5: [419.53, 595.28],
};

export default function CameraScanPage() {
  const { t, lang } = useLanguage();

  // Mode States
  const [scanMode, setScanMode] = useState<ScanMode>('scan');
  const [captureBatchMode, setCaptureBatchMode] = useState<'single' | 'batch'>('single');
  const [idCardType, setIdCardType] = useState<IDCardType>('id_card');

  // Camera & Stream States
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [aspectRatio, setAspectRatio] = useState<CameraAspectRatio>('full');
  const [cameraErrorMsg, setCameraErrorMsg] = useState<string | null>(null);

  // Gallery & Filter States
  const [photos, setPhotos] = useState<ScannedPhoto[]>([]);
  const [activePhotoIdx, setActivePhotoIdx] = useState<number>(0);
  const [activeFilter, setActiveFilter] = useState<CameraFilterMode>('sharp_text'); // Document Sharp Text default
  const [filterScope, setFilterScope] = useState<'current' | 'all'>('current'); // Apply to current vs all
  const [isComparingOriginal, setIsComparingOriginal] = useState(false);

  // Advanced PDF Export Settings State
  const [isPdfSettingsOpen, setIsPdfSettingsOpen] = useState(false);
  const [pdfPageSize, setPdfPageSize] = useState<'original' | 'a4' | 'letter' | 'legal' | 'a3' | 'a5'>('a4');
  const [pdfMargin, setPdfMargin] = useState<'none' | 'small' | 'normal'>('none');
  const [pdfOrientation, setPdfOrientation] = useState<'auto' | 'portrait' | 'landscape'>('auto');
  const [pdfQuality, setPdfQuality] = useState<'high' | 'medium' | 'compact'>('high');

  // Modals & Progress
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [isOcrModalOpen, setIsOcrModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // 1. Start Camera Stream with mobile fallback
  // Accepts optional facingMode param so switch can pass new value directly
  // without relying on a useEffect that causes DOM flash.
  const startCamera = async (mode?: 'user' | 'environment') => {
    const resolvedMode = mode ?? facingMode;
    setCameraErrorMsg(null);
    setIsRequestingPermission(true);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Browser Anda tidak mendukung API Kamera.');
      }

      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      let stream: MediaStream | null = null;
      try {
        // Request highest resolution stream available (up to 4K / 1080p Full HD)
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: resolvedMode, width: { ideal: 3840, min: 1920 }, height: { ideal: 2160, min: 1080 } },
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: resolvedMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
          });
        } catch {
          // Fallback for basic mobile compatibility
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: resolvedMode },
          });
        }
      }

      streamRef.current = stream;

      // Ensure camera is "visible" before attaching stream
      setIsCameraActive(true);

      // Use rAF to ensure video element is in DOM before assigning srcObject
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.muted = true;
        await videoRef.current.play().catch(() => {});
      }

      setCameraErrorMsg(null);
    } catch (err: any) {
      console.error('Camera Start Error:', err);
      setIsCameraActive(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        // Permission denied by user
        setCameraErrorMsg(
          lang === 'id'
            ? 'Izin kamera ditolak. Setelah mengizinkan di pengaturan browser, tekan tombol di bawah atau refresh halaman ini.'
            : 'Camera permission denied. After allowing in browser settings, tap the button below or refresh this page.'
        );
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraErrorMsg(
          lang === 'id'
            ? 'Kamera tidak ditemukan. Pastikan perangkat Anda memiliki kamera yang terhubung.'
            : 'No camera found. Make sure your device has a connected camera.'
        );
      } else if (err.name === 'NotReadableError' || err.name === 'AbortError') {
        // Camera is already in use by another app or tab
        setCameraErrorMsg(
          lang === 'id'
            ? 'Kamera sedang digunakan oleh aplikasi lain. Tutup aplikasi kamera lainnya lalu coba lagi.'
            : 'Camera is in use by another app. Close other camera apps and try again.'
        );
      } else if (err.name === 'OverconstrainedError') {
        // Constraints not satisfied — retry with minimal constraints
        setCameraErrorMsg(
          lang === 'id'
            ? 'Kamera tidak mendukung resolusi yang diminta. Coba lagi.'
            : 'Camera does not support the requested resolution. Please try again.'
        );
      } else {
        setCameraErrorMsg(
          lang === 'id'
            ? 'Gagal membuka kamera. Tekan tombol di bawah untuk mencoba lagi.'
            : 'Failed to open camera. Tap the button below to try again.'
        );
      }
    } finally {
      setIsRequestingPermission(false);
      setIsSwitchingCamera(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  // Switch camera without stopping the stream first (avoids DOM flash)
  const switchCamera = async () => {
    if (isSwitchingCamera) return;
    const newMode: 'user' | 'environment' = facingMode === 'user' ? 'environment' : 'user';
    setIsSwitchingCamera(true);
    setFacingMode(newMode);
    await startCamera(newMode);
  };

  const toggleFlash = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track && 'applyConstraints' in track) {
      try {
        const nextState = !flashOn;
        await (track as any).applyConstraints({
          advanced: [{ torch: nextState }],
        });
        setFlashOn(nextState);
      } catch {
        toast.error('Lampu kilat tidak didukung pada perangkat ini.');
      }
    }
  };

  // No facingMode dependency — switching is handled by switchCamera() directly
  useEffect(() => {
    return () => stopCamera();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watch for browser camera permission changes (e.g. user grants after initial denial)
  // This auto-retries startCamera when the user enables the permission from browser settings
  useEffect(() => {
    if (!navigator.permissions) return;
    let permissionStatus: PermissionStatus | null = null;

    navigator.permissions.query({ name: 'camera' as PermissionName }).then((status) => {
      permissionStatus = status;
      status.onchange = () => {
        if (status.state === 'granted' && !isCameraActive) {
          setCameraErrorMsg(null);
          startCamera();
        }
      };
    }).catch(() => {
      // Permissions API not supported — silently ignore
    });

    return () => {
      if (permissionStatus) permissionStatus.onchange = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCameraActive]);

  // 2. Capture Shutter Action with Aspect Ratio Cropping
  const handleCapture = async () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const vW = video.videoWidth || 1280;
    const vH = video.videoHeight || 720;

    let cropX = 0;
    let cropY = 0;
    let cropW = vW;
    let cropH = vH;

    if (aspectRatio !== 'full') {
      let targetRatio = 1;
      if (aspectRatio === '4:3') targetRatio = 4 / 3;
      else if (aspectRatio === '3:4') targetRatio = 3 / 4;
      else if (aspectRatio === '1:1') targetRatio = 1;
      else if (aspectRatio === '16:9') targetRatio = 16 / 9;

      const currentRatio = vW / vH;
      if (currentRatio > targetRatio) {
        // Video is wider than target aspect ratio -> crop width
        cropH = vH;
        cropW = vH * targetRatio;
        cropX = (vW - cropW) / 2;
        cropY = 0;
      } else {
        // Video is taller than target aspect ratio -> crop height
        cropW = vW;
        cropH = vW / targetRatio;
        cropX = 0;
        cropY = (vH - cropH) / 2;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(cropW);
    canvas.height = Math.round(cropH);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
    const originalSrc = canvas.toDataURL('image/jpeg', 0.98);

    const filteredSrc = await applyCameraFilter(originalSrc, activeFilter);

    const newPhoto: ScannedPhoto = {
      id: crypto.randomUUID(),
      originalSrc,
      filteredSrc,
      filterMode: activeFilter,
      rotation: 0,
    };

    setPhotos((prev) => {
      const updated = [...prev, newPhoto];

      // In Single mode: close camera immediately after capture
      if (captureBatchMode === 'single') {
        // Use setTimeout so state flush happens before we close camera
        setTimeout(() => {
          setActivePhotoIdx(updated.length - 1);
          setIsCameraActive(false);
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
          }
        }, 50);
      }
      // In Batch mode: stay in camera, keep shooting
      return updated;
    });

    toast.success(captureBatchMode === 'single' ? t('successTitle') : 'Foto ditambahkan! Lanjutkan mengambil foto.');
  };

  // Import from local files / gallery
  const handleImportFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newPhotos: ScannedPhoto[] = [];
    for (const file of files) {
      const reader = new FileReader();
      const originalSrc = await new Promise<string>((res) => {
        reader.onload = () => res(reader.result as string);
        reader.readAsDataURL(file);
      });

      const filteredSrc = await applyCameraFilter(originalSrc, activeFilter);
      newPhotos.push({
        id: crypto.randomUUID(),
        originalSrc,
        filteredSrc,
        filterMode: activeFilter,
        rotation: 0,
      });
    }

    setPhotos((prev) => [...prev, ...newPhotos]);
    stopCamera();
  };

  // Select Filter (Current Photo vs All Photos)
  const handleSelectFilter = async (mode: CameraFilterMode) => {
    setActiveFilter(mode);
    if (photos.length === 0) return;

    if (filterScope === 'all') {
      const toastId = toast.loading(
        lang === 'id' ? `Menerapkan filter ke semua ${photos.length} foto...` : `Applying filter to all ${photos.length} photos...`
      );
      try {
        const updatedPhotos = await Promise.all(
          photos.map(async (photo) => {
            const filteredSrc = await applyCameraFilter(photo.originalSrc, mode);
            return { ...photo, filterMode: mode, filteredSrc };
          })
        );
        setPhotos(updatedPhotos);
        toast.success(
          lang === 'id' ? `Filter diterapkan ke ${photos.length} foto!` : `Filter applied to all ${photos.length} photos!`,
          { id: toastId }
        );
      } catch {
        toast.error(lang === 'id' ? 'Gagal menerapkan filter' : 'Failed to apply filter', { id: toastId });
      }
    } else {
      const current = photos[activePhotoIdx];
      if (!current) return;

      const newFilteredSrc = await applyCameraFilter(current.originalSrc, mode);
      setPhotos((prev) =>
        prev.map((p, idx) => (idx === activePhotoIdx ? { ...p, filterMode: mode, filteredSrc: newFilteredSrc } : p))
      );
    }
  };

  // Delete individual photo
  const handleDeleteCurrentPhoto = () => {
    if (photos.length === 0) return;
    setPhotos((prev) => {
      const updated = prev.filter((_, idx) => idx !== activePhotoIdx);
      if (updated.length === 0) {
        setIsCameraActive(true);
      } else if (activePhotoIdx >= updated.length) {
        setActivePhotoIdx(updated.length - 1);
      }
      return updated;
    });
    toast.success(lang === 'id' ? 'Foto dihapus' : 'Photo deleted');
  };

  // Rotate photo
  const handleRotateCurrent = () => {
    if (photos.length === 0) return;
    setPhotos((prev) =>
      prev.map((p, idx) => (idx === activePhotoIdx ? { ...p, rotation: (p.rotation - 90) % 360 } : p))
    );
  };

  const currentPhoto = photos[activePhotoIdx];

  // Advanced PDF Generation
  const handleGeneratePDF = async () => {
    if (photos.length === 0) return;

    setIsProcessing(true);
    setDownloadUrl(null);
    setIsPdfSettingsOpen(false);

    try {
      const pdfDoc = await PDFDocument.create();
      const qualityRatio = pdfQuality === 'high' ? 0.92 : pdfQuality === 'medium' ? 0.78 : 0.60;

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];

        let finalDataUrl = photo.filteredSrc;
        if (pdfQuality !== 'high') {
          const img = new Image();
          img.src = photo.filteredSrc;
          await new Promise((res) => { img.onload = res; });
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            finalDataUrl = canvas.toDataURL('image/jpeg', qualityRatio);
          }
        }

        const res = await fetch(finalDataUrl);
        const imgBuffer = await res.arrayBuffer();
        const embeddedJpg = await pdfDoc.embedJpg(imgBuffer);

        let imgW = embeddedJpg.width;
        let imgH = embeddedJpg.height;

        let pageWidth = imgW;
        let pageHeight = imgH;

        if (pdfPageSize !== 'original') {
          const baseDims = PAGE_DIMS[pdfPageSize] || PAGE_DIMS.a4;
          const [w, h] = baseDims;

          if (pdfOrientation === 'portrait') {
            pageWidth = Math.min(w, h);
            pageHeight = Math.max(w, h);
          } else if (pdfOrientation === 'landscape') {
            pageWidth = Math.max(w, h);
            pageHeight = Math.min(w, h);
          } else {
            if (imgW > imgH) {
              pageWidth = Math.max(w, h);
              pageHeight = Math.min(w, h);
            } else {
              pageWidth = Math.min(w, h);
              pageHeight = Math.max(w, h);
            }
          }
        }

        const page = pdfDoc.addPage([pageWidth, pageHeight]);
        const marginPt = pdfMargin === 'small' ? 14.17 : pdfMargin === 'normal' ? 28.35 : 0;

        if (pdfPageSize === 'original' && marginPt === 0) {
          page.drawImage(embeddedJpg, {
            x: 0,
            y: 0,
            width: imgW,
            height: imgH,
            rotate: photo.rotation !== 0 ? degrees(photo.rotation) : undefined,
          });
        } else {
          const availW = pageWidth - marginPt * 2;
          const availH = pageHeight - marginPt * 2;
          const scale = Math.min(availW / imgW, availH / imgH);
          const drawW = imgW * scale;
          const drawH = imgH * scale;
          const x = marginPt + (availW - drawW) / 2;
          const y = marginPt + (availH - drawH) / 2;

          page.drawImage(embeddedJpg, {
            x,
            y,
            width: drawW,
            height: drawH,
            rotate: photo.rotation !== 0 ? degrees(photo.rotation) : undefined,
          });
        }

        setProgress({ current: i + 1, total: photos.length });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);

      const filename = `CamScanner_${Date.now()}.pdf`;
      await saveHistoryItem(filename, 'Camera Scan to PDF', blob);
      toast.success(t('successTitle'));
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyusun PDF.');
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  return (
    <div className="font-sans select-none overflow-hidden">
      {/* -------------------- PHASE 1: CAMERA VIEWFINDER (FULLSCREEN 100DVH) -------------------- */}
      {isCameraActive && (
        <div className="fixed inset-0 z-50 flex flex-col justify-between bg-black h-[100dvh] w-screen overflow-hidden">
          {/* Top Bar with Flash, Grid & Aspect Ratio Selector */}
          <div className="h-14 shrink-0 flex items-center justify-between px-3 bg-gradient-to-b from-black/90 to-black/30 z-30">
            <button onClick={stopCamera} className="p-2 text-white hover:opacity-80">
              <X className="w-6 h-6" />
            </button>

            {/* Aspect Ratio Pill Selector */}
            <div className="flex items-center bg-slate-900/90 backdrop-blur-md rounded-full p-0.5 border border-slate-800">
              {(['full', '4:3', '3:4', '1:1', '16:9'] as CameraAspectRatio[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setAspectRatio(r)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-all ${
                    aspectRatio === r
                      ? 'bg-[#00B69A] text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {r === 'full' ? 'Full' : r}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <button onClick={toggleFlash} className="p-2 text-white">
                {flashOn ? <Zap className="w-5 h-5 text-amber-400 fill-amber-400" /> : <ZapOff className="w-5 h-5 text-slate-400" />}
              </button>

              <button onClick={() => setShowGrid(!showGrid)} className="p-2">
                <Grid className={`w-5 h-5 ${showGrid ? 'text-[#00B69A]' : 'text-slate-400'}`} />
              </button>
            </div>
          </div>

          {/* Camera Stream & Overlays */}
          <div className="relative flex-1 min-h-0 bg-black overflow-hidden flex items-center justify-center">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />

            {/* Grid */}
            {showGrid && (
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-25 border border-white/40">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="border border-white/30" />
                ))}
              </div>
            )}

            {/* Active Aspect Ratio Frame & Mask (Only shown when ratio != 'full') */}
            {aspectRatio !== 'full' && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                <div
                  className={`relative border-2 border-[#00B69A] rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] flex items-center justify-center transition-all ${
                    aspectRatio === '4:3'
                      ? 'w-[85vw] aspect-[4/3] max-h-[65vh]'
                      : aspectRatio === '3:4'
                      ? 'h-[65vh] aspect-[3/4] max-w-[85vw]'
                      : aspectRatio === '1:1'
                      ? 'w-[75vw] h-[75vw] max-w-[60vh] max-h-[60vh]'
                      : aspectRatio === '16:9'
                      ? 'w-[90vw] aspect-[16/9] max-h-[65vh]'
                      : ''
                  }`}
                >
                  <div className="w-full h-0.5 bg-[#00B69A]/30 animate-pulse" />
                  {/* Corner Accent Indicators */}
                  <div className="absolute -top-0.5 -left-0.5 w-4 h-4 border-t-2 border-l-2 border-[#00B69A] rounded-tl-sm" />
                  <div className="absolute -top-0.5 -right-0.5 w-4 h-4 border-t-2 border-r-2 border-[#00B69A] rounded-tr-sm" />
                  <div className="absolute -bottom-0.5 -left-0.5 w-4 h-4 border-b-2 border-l-2 border-[#00B69A] rounded-bl-sm" />
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 border-b-2 border-r-2 border-[#00B69A] rounded-br-sm" />
                </div>
              </div>
            )}


            {/* ID Cards Mode */}
            {scanMode === 'id_card' && (
              <div className="absolute bottom-4 z-20 flex gap-2 overflow-x-auto px-4 max-w-full">
                {[
                  { id: 'general', label: 'General' },
                  { id: 'driver_license', label: 'Driver License' },
                  { id: 'id_card', label: 'ID Card (KTP)' },
                  { id: 'passport', label: 'Passport' },
                ].map((card) => (
                  <button
                    key={card.id}
                    onClick={() => setIdCardType(card.id as IDCardType)}
                    className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap backdrop-blur-md transition-all ${
                      idCardType === card.id ? 'bg-[#00B69A] text-white shadow-md' : 'bg-slate-900/80 text-slate-300'
                    }`}
                  >
                    {card.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Shutter Bar */}
          <div className="h-32 shrink-0 bg-black flex flex-col items-center justify-between pb-3 pt-2 px-6">
            {/* Top row: Scan/ID Cards mode tabs + Single/Batch pill (when in Scan mode) */}
            <div className="flex items-center gap-4 text-xs font-bold tracking-wider">
              <div className="flex items-center gap-4 text-slate-400 uppercase">
                <button onClick={() => setScanMode('scan')} className={scanMode === 'scan' ? 'text-[#00B69A] border-b-2 border-[#00B69A] pb-0.5' : ''}>
                  Scan
                </button>
                <button onClick={() => setScanMode('id_card')} className={scanMode === 'id_card' ? 'text-[#00B69A] border-b-2 border-[#00B69A] pb-0.5' : ''}>
                  ID Cards
                </button>
              </div>

              {/* Single / Batch pill — only shown in Scan mode, lives here so it never overlaps the frame */}
              {scanMode === 'scan' && (
                <>
                  <div className="w-px h-4 bg-slate-700" />
                  <div className="flex bg-slate-900 rounded-full p-0.5 border border-slate-800">
                    <button
                      onClick={() => setCaptureBatchMode('single')}
                      className={`px-3 py-0.5 rounded-full text-[10px] font-bold transition-all ${
                        captureBatchMode === 'single' ? 'bg-slate-700 text-white' : 'text-slate-500'
                      }`}
                    >
                      Single
                    </button>
                    <button
                      onClick={() => setCaptureBatchMode('batch')}
                      className={`px-3 py-0.5 rounded-full text-[10px] font-bold transition-all ${
                        captureBatchMode === 'batch' ? 'bg-slate-700 text-white' : 'text-slate-500'
                      }`}
                    >
                      Batch
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="w-full flex items-center justify-between">
              <label className="cursor-pointer flex flex-col items-center text-slate-400 hover:text-white w-24 items-start">
                <div className="p-2 bg-slate-900 rounded-xl mb-0.5 border border-slate-800 ml-2">
                  <FileText className="w-5 h-5 text-slate-300" />
                </div>
                <span className="text-[9px] ml-4">Import</span>
                <input type="file" accept="image/*,application/pdf" multiple onChange={handleImportFiles} className="hidden" />
              </label>

              <button
                onClick={handleCapture}
                className="w-16 h-16 shrink-0 rounded-full border-4 border-[#00B69A] p-1 flex items-center justify-center transition-transform active:scale-95 shadow-[0_0_20px_rgba(0,182,154,0.4)]"
              >
                <div className="w-full h-full bg-white rounded-full" />
              </button>

              <div className="flex items-center gap-3 w-24 justify-end">
                {/* Switch Camera Button (Always visible so users can switch cameras anytime) */}
                <button
                  onClick={switchCamera}
                  disabled={isSwitchingCamera}
                  className="flex flex-col items-center text-slate-400 disabled:opacity-50"
                >
                  <div className="p-2 bg-slate-900 rounded-xl mb-0.5 border border-slate-800">
                    <RefreshCw className={`w-4 h-4 text-slate-300 ${isSwitchingCamera ? 'animate-spin' : ''}`} />
                  </div>
                  <span className="text-[9px]">Switch</span>
                </button>

                {/* Photo Gallery Thumbnail (Only visible when at least 1 photo has been taken) */}
                {photos.length > 0 && (
                  <button
                    onClick={() => setIsCameraActive(false)}
                    className="relative p-0.5 bg-slate-900 border border-[#00B69A] rounded-xl overflow-hidden w-10 h-10 shrink-0"
                  >
                    <img src={photos[photos.length - 1].filteredSrc} alt="Thumb" className="w-full h-full object-cover" />
                    <span className="absolute bottom-0 right-0 bg-[#00B69A] text-white text-[8px] font-bold px-1 rounded-tl">
                      {photos.length}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -------------------- DEDICATED CAMERA PERMISSION & ACTIVATION SCREEN -------------------- */}
      {!isCameraActive && photos.length === 0 && (
        <div className="min-h-[85vh] flex flex-col items-center justify-center p-6 bg-slate-950 text-center text-white">
          <div className="p-6 md:p-8 bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl max-w-md w-full flex flex-col items-center">
            {/* Glowing Camera Shield Icon */}
            <div className="w-20 h-20 rounded-full bg-[#00B69A]/20 border-2 border-[#00B69A] flex items-center justify-center mb-5 shadow-[0_0_30px_rgba(0,182,154,0.3)] animate-pulse">
              <Camera className="w-10 h-10 text-[#00B69A]" />
            </div>

            <h2 className="text-2xl font-bold text-white mb-2">
              {t('cameraPermissionTitle')}
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 mb-6 leading-relaxed">
              {t('cameraPermissionDesc')}
            </p>

            {/* Error Message Box if permission blocked */}
            {cameraErrorMsg && (
              <div className="w-full p-4 bg-rose-950/60 border border-rose-800/80 rounded-2xl mb-4 text-left flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-rose-200">
                    <p className="font-bold text-rose-300 mb-1">
                      {lang === 'id' ? 'Gagal Membuka Kamera' : 'Camera Failed to Open'}
                    </p>
                    <p className="leading-relaxed">{cameraErrorMsg}</p>
                  </div>
                </div>
                {/* Refresh page button — needed when browser requires reload after permission change */}
                <button
                  onClick={() => window.location.reload()}
                  className="w-full py-2 bg-rose-800/60 hover:bg-rose-700/70 border border-rose-700 text-rose-200 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors active:scale-95"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                    <path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                  </svg>
                  <span>{lang === 'id' ? 'Refresh Halaman & Coba Lagi' : 'Refresh Page & Try Again'}</span>
                </button>
              </div>
            )}

            {/* Main Action Button */}
            <button
              onClick={() => startCamera()}
              disabled={isRequestingPermission}
              className="w-full py-4 bg-[#00B69A] hover:bg-[#00a38a] disabled:bg-[#00B69A]/70 text-white font-extrabold text-sm rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2.5 active:scale-95 mb-6"
            >
              {isRequestingPermission ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                  <span>{lang === 'id' ? 'Menunggu izin browser...' : 'Waiting for browser permission...'}</span>
                </>
              ) : (
                <>
                  <Camera className="w-5 h-5" />
                  <span>{t('allowCameraButton')}</span>
                </>
              )}
            </button>

            {/* Browser Permission Guide Box */}
            <div className="w-full p-4 bg-slate-950/80 border border-slate-800 rounded-2xl text-left mb-6">
              <p className="text-xs font-bold text-slate-300 flex items-center gap-1.5 mb-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>{t('cameraBlockedGuide')}</span>
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {t('cameraBlockedStep')}
              </p>
            </div>

            {/* Alternative Import Action */}
            <label className="cursor-pointer w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 border border-slate-700">
              <ImagePlus className="w-4 h-4 text-cyan-400" />
              <span>{t('importGalleryAlt')}</span>
              <input type="file" accept="image/*,.pdf" multiple onChange={handleImportFiles} className="hidden" />
            </label>
          </div>
        </div>
      )}

      {/* -------------------- PHASE 2: BATCH PHOTO STUDIO & POST-PROCESSING -------------------- */}
      {!isCameraActive && photos.length > 0 && (
        <div className="fixed inset-0 z-50 flex flex-col justify-between bg-slate-950 text-white h-[100dvh] w-screen overflow-hidden">
          {/* Header Bar with Navigation & Delete */}
          <div className="h-14 shrink-0 flex items-center justify-between px-3 border-b border-slate-900 bg-slate-950/90 z-20">
            <button onClick={() => setIsCameraActive(true)} className="p-2 text-slate-300 hover:text-white flex items-center gap-1">
              <ArrowLeft className="w-5 h-5" />
              <span className="text-xs font-semibold hidden sm:inline">{lang === 'id' ? 'Kamera' : 'Camera'}</span>
            </button>

            {/* Page Counter & Quick Prev/Next Arrows */}
            <div className="flex items-center gap-2 bg-slate-900/90 px-3 py-1 rounded-full border border-slate-800">
              <button
                disabled={activePhotoIdx === 0}
                onClick={() => setActivePhotoIdx((prev) => Math.max(0, prev - 1))}
                className="text-slate-400 hover:text-white disabled:opacity-30 p-0.5"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-bold text-xs text-slate-200 tracking-wide">
                {activePhotoIdx + 1} / {photos.length}
              </span>
              <button
                disabled={activePhotoIdx === photos.length - 1}
                onClick={() => setActivePhotoIdx((prev) => Math.min(photos.length - 1, prev + 1))}
                className="text-slate-400 hover:text-white disabled:opacity-30 p-0.5"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleDeleteCurrentPhoto}
                title={lang === 'id' ? 'Hapus Foto Ini' : 'Delete Photo'}
                className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-xl transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button onClick={() => setPhotos([])} className="text-xs font-semibold text-slate-400 hover:text-rose-400 px-2 py-1">
                Reset
              </button>
            </div>
          </div>

          {/* Page Preview Box with Side Navigation Arrows */}
          <div className="relative flex-1 min-h-0 flex items-center justify-center p-2 sm:p-4 overflow-hidden bg-slate-950">
            {/* Left Chevron Button */}
            {photos.length > 1 && (
              <button
                disabled={activePhotoIdx === 0}
                onClick={() => setActivePhotoIdx((prev) => Math.max(0, prev - 1))}
                className="absolute left-2 z-20 p-2 bg-slate-900/80 hover:bg-slate-800 text-white rounded-full border border-slate-700/80 shadow-lg disabled:opacity-20 active:scale-95 transition-all"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            {currentPhoto && (
              <div className="relative max-w-full max-h-full rounded-2xl overflow-hidden shadow-2xl border border-slate-800 bg-slate-900 flex items-center justify-center">
                <img
                  src={isComparingOriginal ? currentPhoto.originalSrc : currentPhoto.filteredSrc}
                  alt={`Page ${activePhotoIdx + 1}`}
                  className="max-h-[48vh] sm:max-h-[55vh] object-contain transition-transform duration-200"
                  style={{ transform: `rotate(${currentPhoto.rotation}deg)` }}
                />

                <button
                  onMouseDown={() => setIsComparingOriginal(true)}
                  onMouseUp={() => setIsComparingOriginal(false)}
                  onTouchStart={() => setIsComparingOriginal(true)}
                  onTouchEnd={() => setIsComparingOriginal(false)}
                  className="absolute bottom-3 right-3 bg-slate-900/80 backdrop-blur-md text-slate-200 px-3 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 border border-slate-700 active:bg-[#00B69A] active:text-white"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Compare</span>
                </button>
              </div>
            )}

            {/* Right Chevron Button */}
            {photos.length > 1 && (
              <button
                disabled={activePhotoIdx === photos.length - 1}
                onClick={() => setActivePhotoIdx((prev) => Math.min(photos.length - 1, prev + 1))}
                className="absolute right-2 z-20 p-2 bg-slate-900/80 hover:bg-slate-800 text-white rounded-full border border-slate-700/80 shadow-lg disabled:opacity-20 active:scale-95 transition-all"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* Photo Thumbnail Strip (Daftar / Thumbnail Semua Foto Batch) */}
          <div className="h-16 shrink-0 bg-slate-950 border-t border-slate-900 px-3 flex items-center">
            <div className="flex gap-2 overflow-x-auto w-full py-1 scrollbar-thin">
              {photos.map((photo, idx) => (
                <button
                  key={photo.id}
                  onClick={() => setActivePhotoIdx(idx)}
                  className={`relative shrink-0 w-12 h-14 rounded-xl overflow-hidden border-2 transition-all ${
                    activePhotoIdx === idx
                      ? 'border-[#00B69A] ring-2 ring-[#00B69A]/30 scale-105 z-10'
                      : 'border-slate-800 opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={photo.filteredSrc} alt={`Thumb ${idx + 1}`} className="w-full h-full object-cover" />
                  <span className={`absolute bottom-0 right-0 text-[8px] font-bold px-1 rounded-tl ${
                    activePhotoIdx === idx ? 'bg-[#00B69A] text-white' : 'bg-slate-900/90 text-slate-300'
                  }`}>
                    #{idx + 1}
                  </span>
                </button>
              ))}

              {/* Add Photo / Snap More Button in Thumbnail Strip */}
              <button
                onClick={() => setIsCameraActive(true)}
                className="shrink-0 w-12 h-14 rounded-xl border-2 border-dashed border-slate-700 hover:border-[#00B69A] bg-slate-900/50 flex flex-col items-center justify-center text-slate-400 hover:text-[#00B69A] transition-colors"
                title={lang === 'id' ? 'Tambah Foto Ke Batch' : 'Add Photo to Batch'}
              >
                <Plus className="w-5 h-5 mb-0.5" />
                <span className="text-[8px] font-bold">+ Tambah</span>
              </button>
            </div>
          </div>

          {/* Filter Bar + Scope Toggle (Terapkan ke Foto Ini vs Semua Foto) */}
          <div className="h-13 shrink-0 bg-slate-900/70 border-t border-slate-800 px-3 flex items-center gap-2">
            {/* Filter Scope Toggle */}
            <div className="flex bg-slate-950 rounded-xl p-0.5 border border-slate-800 shrink-0">
              <button
                onClick={() => setFilterScope('current')}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                  filterScope === 'current' ? 'bg-[#00B69A] text-white shadow-sm' : 'text-slate-400'
                }`}
              >
                {lang === 'id' ? 'Foto Ini' : 'This Photo'}
              </button>
              <button
                onClick={() => setFilterScope('all')}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 ${
                  filterScope === 'all' ? 'bg-[#00B69A] text-white shadow-sm' : 'text-slate-400'
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>{lang === 'id' ? 'Semua Foto' : 'All Photos'}</span>
              </button>
            </div>

            <div className="w-px h-5 bg-slate-800 shrink-0" />

            {/* Filter Carousel */}
            <div className="flex gap-1.5 overflow-x-auto w-full py-1">
              {[
                { id: 'sharp_text', label: 'Teks Tajam (Fokus)' },
                { id: 'enhance', label: 'Magic Color' },
                { id: 'magic_color', label: 'Warna Berwarna' },
                { id: 'bw', label: 'Hitam Putih (B&W)' },
                { id: 'grayscale', label: 'Grayscale' },
                { id: 'lighten', label: 'Terangkan' },
                { id: 'original', label: 'Asli (Original)' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => handleSelectFilter(f.id as CameraFilterMode)}
                  className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition-all border shrink-0 ${
                    activeFilter === f.id
                      ? 'border-[#00B69A] bg-[#00B69A]/20 text-[#00B69A]'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Action Bar */}
          <div className="h-16 shrink-0 bg-black border-t border-slate-900 flex items-center justify-between px-6">
            <button onClick={() => setIsCameraActive(true)} className="flex flex-col items-center text-slate-400 hover:text-white">
              <Camera className="w-5 h-5 mb-0.5" />
              <span className="text-[9px]">{lang === 'id' ? '+ Foto' : '+ Photo'}</span>
            </button>

            <button onClick={handleRotateCurrent} className="flex flex-col items-center text-slate-400 hover:text-white">
              <RotateCcw className="w-5 h-5 mb-0.5" />
              <span className="text-[9px]">Rotate</span>
            </button>

            <button onClick={() => setIsCropModalOpen(true)} className="flex flex-col items-center text-slate-400 hover:text-white">
              <Crop className="w-5 h-5 mb-0.5 text-[#00B69A]" />
              <span className="text-[9px]">Crop</span>
            </button>

            <button onClick={() => setIsOcrModalOpen(true)} className="flex flex-col items-center text-slate-400 hover:text-white">
              <FileText className="w-5 h-5 mb-0.5" />
              <span className="text-[9px]">OCR Text</span>
            </button>

            <button
              onClick={() => setIsPdfSettingsOpen(true)}
              className="w-11 h-11 bg-[#00B69A] hover:bg-[#00a38a] text-white rounded-xl flex items-center justify-center shadow-lg transition-transform active:scale-95"
            >
              <Check className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* -------------------- ADVANCED PDF EXPORT SETTINGS MODAL -------------------- */}
      {isPdfSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-white">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-[#00B69A]" />
                <h3 className="font-bold text-lg">{t('pdfSettingsTitle')}</h3>
              </div>
              <button onClick={() => setIsPdfSettingsOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Paper Size */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {t('pageSize')}
                </label>
                <select
                  value={pdfPageSize}
                  onChange={(e) => setPdfPageSize(e.target.value as any)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:ring-2 focus:ring-[#00B69A] outline-none"
                >
                  <option value="original">Original (Fit Image Size)</option>
                  <option value="a4">A4 (210 x 297 mm)</option>
                  <option value="letter">Letter (US, 8.5 x 11 in)</option>
                  <option value="legal">Legal (US, 8.5 x 14 in)</option>
                  <option value="a3">A3 (297 x 420 mm)</option>
                  <option value="a5">A5 (148 x 210 mm)</option>
                </select>
              </div>

              {/* Page Margin */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {t('pdfMarginLabel')}
                </label>
                <select
                  value={pdfMargin}
                  onChange={(e) => setPdfMargin(e.target.value as any)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:ring-2 focus:ring-[#00B69A] outline-none"
                >
                  <option value="none">{t('marginNone')}</option>
                  <option value="small">{t('marginSmall')}</option>
                  <option value="normal">{t('marginNormal')}</option>
                </select>
              </div>

              {/* Page Orientation */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {t('orientation')}
                </label>
                <select
                  value={pdfOrientation}
                  onChange={(e) => setPdfOrientation(e.target.value as any)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:ring-2 focus:ring-[#00B69A] outline-none"
                >
                  <option value="auto">{t('orientAuto')}</option>
                  <option value="portrait">{t('orientPortrait')}</option>
                  <option value="landscape">{t('orientLandscape')}</option>
                </select>
              </div>

              {/* Image Quality / Compression */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {t('quality')}
                </label>
                <select
                  value={pdfQuality}
                  onChange={(e) => setPdfQuality(e.target.value as any)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:ring-2 focus:ring-[#00B69A] outline-none"
                >
                  <option value="high">{t('qualityHigh')}</option>
                  <option value="medium">{t('qualityMedium')}</option>
                  <option value="compact">{t('qualityCompact')}</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-6 mt-4 border-t border-slate-800">
              <button
                onClick={() => setIsPdfSettingsOpen(false)}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleGeneratePDF}
                className="flex-1 py-3 bg-[#00B69A] hover:bg-[#00a38a] text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>{t('generateAndDownload')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Download Box */}
      {downloadUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-slate-900 p-8 rounded-3xl border border-slate-800 text-center max-w-md">
            <CheckCircle2 className="w-14 h-14 text-[#00B69A] mx-auto mb-3" />
            <h3 className="text-xl font-bold text-white mb-2 flex items-center justify-center gap-2">
              <span>PDF Scan Ready</span>
            </h3>
            <p className="text-xs text-slate-400 mb-6">Dokumen hasil scanner CamScanner siap diunduh.</p>
            <div className="flex gap-3">
              <button onClick={() => setDownloadUrl(null)} className="flex-1 py-3 bg-slate-800 text-slate-300 font-bold text-xs rounded-xl">
                Tutup
              </button>
              <button
                onClick={() => saveAs(downloadUrl, `CamScanner_Doc_${Date.now()}.pdf`)}
                className="flex-1 py-3 bg-[#00B69A] text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>Unduh PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Crop Modal */}
      {currentPhoto && (
        <ScannerCropModal
          isOpen={isCropModalOpen}
          imageSrc={currentPhoto.originalSrc}
          onConfirmCrop={(croppedSrc) => {
            setPhotos((prev) =>
              prev.map((p, idx) => (idx === activePhotoIdx ? { ...p, filteredSrc: croppedSrc } : p))
            );
          }}
          onClose={() => setIsCropModalOpen(false)}
        />
      )}

      {/* OCR Result Modal */}
      {currentPhoto && (
        <OcrResultModal
          isOpen={isOcrModalOpen}
          imageSrc={currentPhoto.filteredSrc}
          onClose={() => setIsOcrModalOpen(false)}
        />
      )}

      <GranularProgressModal
        isOpen={isProcessing && progress !== null}
        current={progress?.current || 0}
        total={progress?.total || 0}
        stepDescription="Menyusun Dokumen CamScanner PDF..."
      />
    </div>
  );
}
