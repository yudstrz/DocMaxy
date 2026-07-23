'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Camera, RefreshCw, Trash2, CheckCircle2, Download, Sliders, Image as ImageIcon, Sparkles } from 'lucide-react';
import { applyCameraFilter, CameraFilterMode } from '@/utils/cameraFilter';
import { PDFDocument } from 'pdf-lib';
import { saveAs } from 'file-saver';
import { saveHistoryItem } from '@/utils/historyDB';
import { GranularProgressModal } from '@/components/GranularProgressModal';
import toast from 'react-hot-toast';

interface ScannedPhoto {
  id: string;
  originalSrc: string;
  filteredSrc: string;
  filterMode: CameraFilterMode;
}

export default function CameraScanPage() {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [photos, setPhotos] = useState<ScannedPhoto[]>([]);
  const [globalFilter, setGlobalFilter] = useState<CameraFilterMode>('contrast');

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Start Camera Stream
  const startCamera = async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
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
      toast.error('Tidak dapat mengakses kamera. Pastikan izin kamera telah diberikan.');
      setIsCameraActive(false);
    }
  };

  // Stop Camera Stream
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Capture Shutter Photo
  const capturePhoto = async () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    const originalSrc = canvas.toDataURL('image/jpeg', 0.9);
    const filteredSrc = await applyCameraFilter(originalSrc, globalFilter);

    const newPhoto: ScannedPhoto = {
      id: crypto.randomUUID(),
      originalSrc,
      filteredSrc,
      filterMode: globalFilter,
    };

    setPhotos((prev) => [...prev, newPhoto]);
    toast.success('Foto halaman berhasil diambil! 📸');
  };

  // Change filter for a photo or globally
  const handleApplyFilterToAll = async (filter: CameraFilterMode) => {
    setGlobalFilter(filter);
    const updated = await Promise.all(
      photos.map(async (p) => ({
        ...p,
        filterMode: filter,
        filteredSrc: await applyCameraFilter(p.originalSrc, filter),
      }))
    );
    setPhotos(updated);
  };

  const deletePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  // Convert all scanned photos into 1 multi-page PDF
  const handleGeneratePDF = async () => {
    if (photos.length === 0) {
      toast.error('Ambil minimal 1 foto dokumen.');
      return;
    }

    setIsProcessing(true);
    setDownloadUrl(null);

    try {
      const pdfDoc = await PDFDocument.create();

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const res = await fetch(photo.filteredSrc);
        const imgBuffer = await res.arrayBuffer();

        const embeddedJpg = await pdfDoc.embedJpg(imgBuffer);
        const page = pdfDoc.addPage([embeddedJpg.width, embeddedJpg.height]);
        page.drawImage(embeddedJpg, {
          x: 0,
          y: 0,
          width: embeddedJpg.width,
          height: embeddedJpg.height,
        });

        setProgress({ current: i + 1, total: photos.length });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);

      const filename = `DocMaxy_Scan_${Date.now()}.pdf`;
      await saveHistoryItem(filename, 'Camera Scan to PDF', blob);
      toast.success('Foto berhasil dikonversi ke PDF! 📄');
    } catch (err: any) {
      toast.error(err.message || 'Gagal membuat dokumen PDF.');
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 transition-colors">
      <main className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-3 bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 rounded-2xl mb-4 shadow-sm">
            <Camera className="w-8 h-8" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Pindai ke PDF via Kamera
          </h1>
          <p className="mt-3 max-w-2xl text-base sm:text-lg text-slate-600 dark:text-slate-400 mx-auto">
            Memfoto dokumen fisik menggunakan kamera HP / Webcam. Filter otomatis agar bersih seperti hasil mesin scanner!
          </p>
        </div>

        {/* Camera Control / Viewfinder */}
        <div className="max-w-2xl mx-auto bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 mb-10">
          {!isCameraActive ? (
            <div className="text-center py-10">
              <Camera className="w-16 h-16 text-rose-500 mx-auto mb-4 animate-bounce" />
              <button
                onClick={startCamera}
                className="px-8 py-4 bg-rose-600 hover:bg-rose-700 text-white font-bold text-base rounded-2xl shadow-lg transition-all flex items-center gap-2 mx-auto"
              >
                <Camera className="w-5 h-5" />
                <span>Buka Kamera Scanner</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3] flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />

                {/* Switch Camera */}
                <button
                  type="button"
                  onClick={() => {
                    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
                    startCamera();
                  }}
                  className="absolute top-4 right-4 bg-slate-900/60 hover:bg-slate-900 text-white p-3 rounded-full backdrop-blur-sm transition-colors"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={stopCamera}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-xs font-semibold"
                >
                  Tutup Kamera
                </button>

                <button
                  onClick={capturePhoto}
                  className="px-8 py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm rounded-2xl shadow-lg transition-all flex items-center gap-2"
                >
                  <Camera className="w-5 h-5" />
                  <span>Ambil Foto ({photos.length})</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Captured Photos Gallery */}
        {photos.length > 0 && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">
                  Filter Document Mode:
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { id: 'contrast', label: 'Kontras Tinggi' },
                  { id: 'bw', label: 'Dokumen B&W' },
                  { id: 'grayscale', label: 'Grayscale' },
                  { id: 'original', label: 'Asli' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => handleApplyFilterToAll(f.id as CameraFilterMode)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      globalFilter === f.id
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-rose-50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {photos.map((photo, index) => (
                <div
                  key={photo.id}
                  className="relative group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2 shadow-sm"
                >
                  <div className="w-full aspect-[3/4] bg-slate-100 dark:bg-slate-950 rounded-xl overflow-hidden mb-2">
                    <img
                      src={photo.filteredSrc}
                      alt={`Scan ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="flex items-center justify-between px-1 text-xs font-bold text-slate-700 dark:text-slate-300">
                    <span>Halaman {index + 1}</span>
                    <button
                      onClick={() => deletePhoto(photo.id)}
                      className="text-rose-500 hover:text-rose-700 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-center pt-6">
              <button
                onClick={handleGeneratePDF}
                disabled={isProcessing}
                className="px-10 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base rounded-2xl shadow-xl transition-all disabled:opacity-50 flex items-center gap-2"
              >
                <Download className="w-5 h-5" />
                <span>Gabungkan {photos.length} Foto ke 1 PDF</span>
              </button>
            </div>
          </div>
        )}

        {/* Download Box */}
        {downloadUrl && (
          <div className="mt-8 max-w-xl mx-auto p-8 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-3xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 dark:text-emerald-400 mb-3" />
            <h3 className="text-2xl font-bold text-emerald-900 dark:text-emerald-200 mb-1">
              🎉 PDF Hasil Scan Siap!
            </h3>
            <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-6">
              Foto scanner dokumen telah digabungkan menjadi 1 file PDF.
            </p>
            <button
              onClick={() => saveAs(downloadUrl, `Scanned_Document_${Date.now()}.pdf`)}
              className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base rounded-2xl shadow-md transition-all flex items-center gap-2"
            >
              <Download className="w-5 h-5" />
              <span>Unduh File PDF</span>
            </button>
          </div>
        )}
      </main>

      <GranularProgressModal
        isOpen={isProcessing && progress !== null}
        current={progress?.current || 0}
        total={progress?.total || 0}
        stepDescription="Mengonversi Foto Scan ke PDF..."
      />
    </div>
  );
}
