'use client';

import React, { useRef, useState, useEffect } from 'react';
import {
  X, Zap, ZapOff, Grid, Camera, RefreshCw, RotateCcw,
  Crop, FileText, CheckCircle2, Download, Eye, Check, ArrowLeft, Sliders,
  ShieldAlert, Lock, AlertTriangle, ImagePlus
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
  const [cameraErrorMsg, setCameraErrorMsg] = useState<string | null>(null);

  // Gallery & Filter States
  const [photos, setPhotos] = useState<ScannedPhoto[]>([]);
  const [activePhotoIdx, setActivePhotoIdx] = useState<number>(0);
  const [activeFilter, setActiveFilter] = useState<CameraFilterMode>('enhance'); // CamScanner Magic Color
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
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: resolvedMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
      } catch {
        // Fallback for mobile compatibility
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: resolvedMode },
        });
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
        setCameraErrorMsg(t('cameraBlockedStep'));
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraErrorMsg('Perangkat kamera tidak ditemukan pada HP/Komputer Anda.');
      } else {
        setCameraErrorMsg('Gagal membuka kamera. Silakan klik tombol aktifkan di bawah untuk mencoba lagi.');
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

  // 2. Capture Shutter Action
  const handleCapture = async () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    const originalSrc = canvas.toDataURL('image/jpeg', 0.92);

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

  // Select Filter
  const handleSelectFilter = async (mode: CameraFilterMode) => {
    setActiveFilter(mode);
    if (photos.length === 0) return;

    const current = photos[activePhotoIdx];
    if (!current) return;

    const newFilteredSrc = await applyCameraFilter(current.originalSrc, mode);
    setPhotos((prev) =>
      prev.map((p, idx) => (idx === activePhotoIdx ? { ...p, filterMode: mode, filteredSrc: newFilteredSrc } : p))
    );
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
          {/* Top Bar (Cleaned up: Removed HD & 3-dots) */}
          <div className="h-14 shrink-0 flex items-center justify-between px-4 bg-gradient-to-b from-black/90 to-black/30 z-30">
            <button onClick={stopCamera} className="p-2 text-white hover:opacity-80">
              <X className="w-6 h-6" />
            </button>

            <div className="flex items-center gap-4">
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

            {/* Frame Overlay */}
            <div className="absolute inset-6 sm:inset-12 border-2 border-[#00B69A] rounded-2xl pointer-events-none shadow-[0_0_20px_rgba(0,182,154,0.3)] flex items-center justify-center">
              <div className="w-full h-0.5 bg-[#00B69A]/30 animate-pulse" />
            </div>


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
              <div className="w-full p-4 bg-rose-950/60 border border-rose-800/80 rounded-2xl mb-6 text-left flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="text-xs text-rose-200">
                  <p className="font-bold text-rose-300 mb-1">Akses Kamera Dibatasi</p>
                  <p>{cameraErrorMsg}</p>
                </div>
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

      {/* -------------------- PHASE 2: POST-PROCESSING (FULLSCREEN 100DVH) -------------------- */}
      {!isCameraActive && photos.length > 0 && (
        <div className="fixed inset-0 z-50 flex flex-col justify-between bg-slate-950 text-white h-[100dvh] w-screen overflow-hidden">
          {/* Header */}
          <div className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-slate-900">
            <button onClick={() => setIsCameraActive(true)} className="p-2 text-slate-400 hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </button>

            <span className="font-bold text-xs tracking-wide text-slate-200">
              CamScanner ({activePhotoIdx + 1}/{photos.length})
            </span>

            <button onClick={() => setPhotos([])} className="text-xs font-semibold text-rose-400 hover:underline">
              Reset
            </button>
          </div>

          {/* Page Preview Box */}
          <div className="relative flex-1 min-h-0 flex items-center justify-center p-3 overflow-hidden bg-slate-950">
            {currentPhoto && (
              <div className="relative max-w-full max-h-full rounded-2xl overflow-hidden shadow-2xl border border-slate-800 bg-slate-900 flex items-center justify-center">
                <img
                  src={isComparingOriginal ? currentPhoto.originalSrc : currentPhoto.filteredSrc}
                  alt={`Page ${activePhotoIdx + 1}`}
                  className="max-h-[55vh] sm:max-h-[60vh] object-contain transition-transform duration-200"
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
          </div>

          {/* Filter Thumbnails Carousel */}
          <div className="h-14 shrink-0 bg-slate-900/60 border-t border-slate-900 px-3 flex items-center">
            <div className="flex gap-2 overflow-x-auto w-full py-1">
              {[
                { id: 'original', label: 'Original' },
                { id: 'lighten', label: 'Lighten' },
                { id: 'enhance', label: 'Enhance (Magic)' },
                { id: 'magic_pro', label: 'Magic Pro' },
                { id: 'bw', label: 'B&W' },
                { id: 'grayscale', label: 'Grayscale' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => handleSelectFilter(f.id as CameraFilterMode)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border shrink-0 ${
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
              <span className="text-[9px]">Retake</span>
            </button>

            <button onClick={handleRotateCurrent} className="flex flex-col items-center text-slate-400 hover:text-white">
              <RotateCcw className="w-5 h-5 mb-0.5" />
              <span className="text-[9px]">Left</span>
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
