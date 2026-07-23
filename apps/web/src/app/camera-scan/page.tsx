'use client';

import React, { useRef, useState, useEffect } from 'react';
import {
  X, Zap, ZapOff, Grid, MoreVertical, Camera, RefreshCw, RotateCcw,
  Crop, FileText, CheckCircle2, Download, Layers, ShieldCheck, Sparkles,
  ArrowLeft, Check, Copy, Eye, CreditCard
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

export default function CameraScanPage() {
  const { t } = useLanguage();
  // Mode States
  const [scanMode, setScanMode] = useState<ScanMode>('scan');
  const [captureBatchMode, setCaptureBatchMode] = useState<'single' | 'batch'>('single');
  const [idCardType, setIdCardType] = useState<IDCardType>('id_card');

  // Camera & Stream States
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [flashOn, setFlashOn] = useState(false);
  const [showGrid, setShowGrid] = useState(true);

  // Gallery & Filter States
  const [photos, setPhotos] = useState<ScannedPhoto[]>([]);
  const [activePhotoIdx, setActivePhotoIdx] = useState<number>(0);
  const [activeFilter, setActiveFilter] = useState<CameraFilterMode>('enhance'); // CamScanner Magic Color
  const [isComparingOriginal, setIsComparingOriginal] = useState(false);

  // Modals & Progress
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [isOcrModalOpen, setIsOcrModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // 1. Start Camera Stream
  const startCamera = async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraActive(true);
    } catch (err: any) {
      toast.error('Gagal membuka kamera. Pastikan izin kamera telah diberikan.');
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
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

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [facingMode]);

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

    // Apply CamScanner Magic Color Enhance filter by default
    const filteredSrc = await applyCameraFilter(originalSrc, activeFilter);

    const newPhoto: ScannedPhoto = {
      id: crypto.randomUUID(),
      originalSrc,
      filteredSrc,
      filterMode: activeFilter,
      rotation: 0,
    };

    setPhotos((prev) => [...prev, newPhoto]);
    toast.success('Halaman terfoto!');

    if (captureBatchMode === 'single') {
      setActivePhotoIdx(photos.length);
      stopCamera();
    }
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

  // Change filter for current photo
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

  // Rotate current photo 90 deg
  const handleRotateCurrent = () => {
    if (photos.length === 0) return;
    setPhotos((prev) =>
      prev.map((p, idx) => (idx === activePhotoIdx ? { ...p, rotation: (p.rotation - 90) % 360 } : p))
    );
  };

  const currentPhoto = photos[activePhotoIdx];

  // Export to PDF
  const handleGeneratePDF = async () => {
    if (photos.length === 0) return;

    setIsProcessing(true);
    setDownloadUrl(null);

    try {
      const pdfDoc = await PDFDocument.create();

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const res = await fetch(photo.filteredSrc);
        const imgBuffer = await res.arrayBuffer();

        const embeddedJpg = await pdfDoc.embedJpg(imgBuffer);

        let width = embeddedJpg.width;
        let height = embeddedJpg.height;

        const page = pdfDoc.addPage([width, height]);
        page.drawImage(embeddedJpg, {
          x: 0,
          y: 0,
          width,
          height,
          rotate: photo.rotation !== 0 ? degrees(photo.rotation) : undefined,
        });

        setProgress({ current: i + 1, total: photos.length });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);

      const filename = `CamScanner_${Date.now()}.pdf`;
      await saveHistoryItem(filename, 'Camera Scan to PDF', blob);
      toast.success('PDF Scanner berhasil dibuat!');
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyusun PDF.');
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between font-sans select-none overflow-x-hidden">
      {/* -------------------- PHASE 1: CAMERA VIEWFINDER -------------------- */}
      {isCameraActive && (
        <div className="relative flex-1 flex flex-col justify-between bg-black">
          {/* Top Bar */}
          <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
            <button onClick={stopCamera} className="p-2 text-white hover:opacity-80">
              <X className="w-6 h-6" />
            </button>

            <div className="flex items-center gap-6">
              <button onClick={toggleFlash} className="p-1 text-white">
                {flashOn ? <Zap className="w-5 h-5 text-amber-400 fill-amber-400" /> : <ZapOff className="w-5 h-5 text-slate-400" />}
              </button>

              <button onClick={() => setShowGrid(!showGrid)} className="p-1">
                <Grid className={`w-5 h-5 ${showGrid ? 'text-[#00B69A]' : 'text-slate-400'}`} />
              </button>

              <span className="px-2 py-0.5 border border-[#00B69A] text-[#00B69A] text-[10px] font-extrabold rounded">
                HD
              </span>

              <button className="p-1 text-slate-400">
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Camera Video Stream & Alignment Overlays */}
          <div className="relative flex-1 flex items-center justify-center bg-black overflow-hidden">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />

            {/* Rule-of-thirds Alignment Grid */}
            {showGrid && (
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-25 border border-white/40">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="border border-white/30" />
                ))}
              </div>
            )}

            {/* Live Document Detection Frame Overlay */}
            <div className="absolute inset-8 sm:inset-16 border-2 border-[#00B69A] rounded-2xl pointer-events-none shadow-[0_0_20px_rgba(0,182,154,0.3)] flex items-center justify-center">
              <div className="w-full h-0.5 bg-[#00B69A]/30 animate-pulse" />
            </div>

            {/* Single vs Batch Floating Pill */}
            {scanMode === 'scan' && (
              <div className="absolute bottom-6 z-20 flex bg-slate-900/80 backdrop-blur-md rounded-full p-1 border border-slate-800">
                <button
                  onClick={() => setCaptureBatchMode('single')}
                  className={`px-5 py-1.5 rounded-full text-xs font-bold transition-all ${
                    captureBatchMode === 'single' ? 'bg-slate-700 text-white' : 'text-slate-400'
                  }`}
                >
                  Single
                </button>
                <button
                  onClick={() => setCaptureBatchMode('batch')}
                  className={`px-5 py-1.5 rounded-full text-xs font-bold transition-all ${
                    captureBatchMode === 'batch' ? 'bg-slate-700 text-white' : 'text-slate-400'
                  }`}
                >
                  Batch
                </button>
              </div>
            )}

            {/* ID Cards Mode Options */}
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
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap backdrop-blur-md transition-all ${
                      idCardType === card.id ? 'bg-[#00B69A] text-white shadow-md' : 'bg-slate-900/80 text-slate-300'
                    }`}
                  >
                    {card.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Bottom Mode Carousel & Shutter Area */}
          <div className="bg-black pb-8 pt-4 px-6 flex flex-col items-center gap-4">
            {/* Mode Carousel */}
            <div className="flex items-center gap-6 text-xs font-bold tracking-wider text-slate-400 uppercase">
              <button onClick={() => setScanMode('scan')} className={scanMode === 'scan' ? 'text-[#00B69A] border-b-2 border-[#00B69A] pb-1' : ''}>
                Scan
              </button>
              <button onClick={() => setScanMode('id_card')} className={scanMode === 'id_card' ? 'text-[#00B69A] border-b-2 border-[#00B69A] pb-1' : ''}>
                ID Cards
              </button>
            </div>

            {/* Shutter Bar */}
            <div className="w-full flex items-center justify-between">
              <label className="cursor-pointer flex flex-col items-center text-slate-400 hover:text-white">
                <div className="p-2.5 bg-slate-900 rounded-2xl mb-1">
                  <Layers className="w-6 h-6 text-slate-300" />
                </div>
                <span className="text-[10px]">Import Files</span>
                <input type="file" accept="image/*,application/pdf" multiple onChange={handleImportFiles} className="hidden" />
              </label>

              {/* Shutter Button */}
              <button
                onClick={handleCapture}
                className="w-20 h-20 rounded-full border-4 border-[#00B69A] p-1 flex items-center justify-center transition-transform active:scale-95 shadow-[0_0_25px_rgba(0,182,154,0.4)]"
              >
                <div className="w-full h-full bg-white rounded-full" />
              </button>

              {photos.length > 0 ? (
                <button
                  onClick={() => setIsCameraActive(false)}
                  className="relative p-1 bg-slate-900 border border-[#00B69A] rounded-2xl overflow-hidden w-12 h-14"
                >
                  <img src={photos[photos.length - 1].filteredSrc} alt="Thumb" className="w-full h-full object-cover" />
                  <span className="absolute bottom-0 right-0 bg-[#00B69A] text-white text-[10px] font-bold px-1 rounded-tl">
                    {photos.length}
                  </span>
                </button>
              ) : (
                <button onClick={() => setFacingMode(facingMode === 'user' ? 'environment' : 'user')} className="flex flex-col items-center text-slate-400">
                  <div className="p-2.5 bg-slate-900 rounded-2xl mb-1">
                    <RefreshCw className="w-6 h-6 text-slate-300" />
                  </div>
                  <span className="text-[10px]">Switch</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* -------------------- PHASE 2: POST-PROCESSING & FILTER EDITOR -------------------- */}
      {!isCameraActive && photos.length > 0 && (
        <div className="flex-1 flex flex-col justify-between bg-slate-950">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-900">
            <button onClick={() => setIsCameraActive(true)} className="p-2 text-slate-400 hover:text-white">
              <ArrowLeft className="w-6 h-6" />
            </button>

            <span className="font-bold text-sm tracking-wide text-slate-200">
              CamScanner Document ({activePhotoIdx + 1}/{photos.length})
            </span>

            <button onClick={() => setPhotos([])} className="text-xs font-semibold text-rose-400 hover:underline">
              Reset
            </button>
          </div>

          {/* Page Preview Box with Compare Option */}
          <div className="relative flex-1 flex items-center justify-center p-4 min-h-[50vh]">
            {currentPhoto && (
              <div className="relative max-w-full max-h-[60vh] rounded-2xl overflow-hidden shadow-2xl border border-slate-800 bg-slate-900 flex items-center justify-center">
                <img
                  src={isComparingOriginal ? currentPhoto.originalSrc : currentPhoto.filteredSrc}
                  alt={`Page ${activePhotoIdx + 1}`}
                  className="max-h-[55vh] object-contain transition-transform duration-200"
                  style={{ transform: `rotate(${currentPhoto.rotation}deg)` }}
                />

                {/* Compare Hold Button */}
                <button
                  onMouseDown={() => setIsComparingOriginal(true)}
                  onMouseUp={() => setIsComparingOriginal(false)}
                  onTouchStart={() => setIsComparingOriginal(true)}
                  onTouchEnd={() => setIsComparingOriginal(false)}
                  className="absolute bottom-3 right-3 bg-slate-900/80 backdrop-blur-md text-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-700 active:bg-[#00B69A] active:text-white"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Compare</span>
                </button>
              </div>
            )}
          </div>

          {/* Filter Thumbnails Carousel */}
          <div className="bg-slate-900/60 border-t border-slate-900 p-4">
            <div className="flex justify-center gap-3 overflow-x-auto pb-2">
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
                  className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all border shrink-0 ${
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
          <div className="p-4 bg-black border-t border-slate-900 flex items-center justify-between px-6">
            <button onClick={() => setIsCameraActive(true)} className="flex flex-col items-center text-slate-400 hover:text-white">
              <Camera className="w-5 h-5 mb-1" />
              <span className="text-[10px]">Retake</span>
            </button>

            <button onClick={handleRotateCurrent} className="flex flex-col items-center text-slate-400 hover:text-white">
              <RotateCcw className="w-5 h-5 mb-1" />
              <span className="text-[10px]">Left</span>
            </button>

            <button onClick={() => setIsCropModalOpen(true)} className="flex flex-col items-center text-slate-400 hover:text-white">
              <Crop className="w-5 h-5 mb-1 text-[#00B69A]" />
              <span className="text-[10px]">Crop</span>
            </button>

            <button onClick={() => setIsOcrModalOpen(true)} className="flex flex-col items-center text-slate-400 hover:text-white">
              <FileText className="w-5 h-5 mb-1" />
              <span className="text-[10px]">Extract Text</span>
            </button>

            {/* Save Checkmark */}
            <button
              onClick={handleGeneratePDF}
              className="w-12 h-12 bg-[#00B69A] hover:bg-[#00a38a] text-white rounded-2xl flex items-center justify-center shadow-lg transition-transform active:scale-95"
            >
              <Check className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      {/* Download Box */}
      {downloadUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-slate-900 p-8 rounded-3xl border border-slate-800 text-center max-w-md">
            <CheckCircle2 className="w-14 h-14 text-[#00B69A] mx-auto mb-3" />
            <h3 className="text-xl font-bold text-white mb-2 flex items-center justify-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-[#00B69A]" />
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
