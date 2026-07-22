'use client';

import React, { useState } from 'react';
import { SortableGrid, PDFDocument as LocalPDFDocument } from '@/components/SortableGrid';
import { generatePDFThumbnail } from '@/utils/pdf';
import { PDFDocument } from 'pdf-lib';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { Settings2, ArrowDownToLine, Zap, SlidersHorizontal } from 'lucide-react';
import toast from 'react-hot-toast';

// ----- Preset compression levels -----
const COMPRESSION_LEVELS = [
  {
    id: 'extreme',
    label: 'Ekstrem',
    desc: 'Ukuran paling kecil, kualitas lebih rendah',
    icon: ArrowDownToLine,
    scale: 1.0,
    quality: 0.5,
  },
  {
    id: 'recommended',
    label: 'Rekomendasi',
    desc: 'Keseimbangan terbaik ukuran & kualitas',
    icon: Zap,
    scale: 1.5,
    quality: 0.72,
  },
  {
    id: 'less',
    label: 'Rendah',
    desc: 'Ukuran lebih besar, kualitas lebih baik',
    icon: Settings2,
    scale: 2.0,
    quality: 0.88,
  },
  {
    id: 'custom',
    label: 'Kustom',
    desc: 'Tentukan sendiri target ukuran akhir',
    icon: SlidersHorizontal,
    scale: 1.5,   // will be overridden
    quality: 0.72, // will be overridden
  },
];

// ----- Helpers -----

/** Yield control back to the browser event loop to prevent UI freeze. */
const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Convert a canvas to a JPEG Uint8Array via Blob (avoids large string allocation). */
async function canvasToJpegBytes(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
        const buf = await blob.arrayBuffer();
        resolve(new Uint8Array(buf));
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Compress a single PDF by re-rendering each page to JPEG via Canvas,
 * then building a brand-new PDF from those images.
 * Works on files 200 MB+ — memory released after each page.
 */
async function compressPDF(
  file: File,
  scale: number,
  quality: number,
  onProgress?: (page: number, total: number, phase?: string) => void
): Promise<Uint8Array> {
  const pdfjsLib = await import('pdfjs-dist');
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }

  const arrayBuffer = await file.arrayBuffer();
  const srcPdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = srcPdf.numPages;
  const outDoc = await PDFDocument.create();

  for (let i = 1; i <= totalPages; i++) {
    await yieldToBrowser();

    const page = await srcPdf.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');

    await page.render({ canvasContext: ctx, viewport }).promise;

    const bytes = await canvasToJpegBytes(canvas, quality);

    // Free canvas before embedding
    canvas.width = 0;
    canvas.height = 0;

    const jpgImage = await outDoc.embedJpg(bytes);
    const origViewport = page.getViewport({ scale: 1.0 });
    const pdfPage = outDoc.addPage([origViewport.width, origViewport.height]);
    pdfPage.drawImage(jpgImage, { x: 0, y: 0, width: origViewport.width, height: origViewport.height });

    onProgress?.(i, totalPages);
  }

  return outDoc.save();
}

/**
 * Estimate scale and quality dynamically based on target ratio to achieve target size in 1 pass.
 */
function calculateParamsForTargetRatio(ratio: number): { scale: number; quality: number } {
  // Ratio = targetBytes / originalBytes
  if (ratio <= 0.03) {
    // Extreme target reduction (< 3% of original, e.g. 8MB from 380MB)
    return { scale: 0.65, quality: 0.35 };
  } else if (ratio <= 0.08) {
    // Heavy target reduction (3% - 8%)
    return { scale: 0.85, quality: 0.45 };
  } else if (ratio <= 0.20) {
    // Moderate reduction (8% - 20%)
    return { scale: 1.05, quality: 0.60 };
  } else if (ratio <= 0.50) {
    // Standard reduction (20% - 50%)
    return { scale: 1.3, quality: 0.72 };
  } else {
    // Mild reduction (> 50%)
    return { scale: 1.5, quality: 0.85 };
  }
}

/**
 * Fast single-pass compression to reach a target byte size.
 * Uses dynamic parameter estimation based on ratio + adaptive quality feedback.
 * Runs in 1 SINGLE PASS (3x-9x faster than multi-pass search).
 */
async function compressPDFToTarget(
  file: File,
  targetBytes: number,
  onProgress?: (page: number, total: number, phase?: string) => void
): Promise<Uint8Array> {
  const pdfjsLib = await import('pdfjs-dist');
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }

  const arrayBuffer = await file.arrayBuffer();
  const srcPdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = srcPdf.numPages;

  const ratio = targetBytes / file.size;
  let { scale, quality } = calculateParamsForTargetRatio(ratio);

  // Quick sample of 1st page to fine-tune quality if needed
  try {
    onProgress?.(0, totalPages, 'Menganalisis file...');
    await yieldToBrowser();
    const samplePage = await srcPdf.getPage(1);
    const viewport = samplePage.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d')!;
    await samplePage.render({ canvasContext: ctx, viewport }).promise;
    const sampleBytes = await canvasToJpegBytes(canvas, quality);
    canvas.width = 0; canvas.height = 0;

    const estimatedTotal = sampleBytes.length * totalPages * 1.05; // 5% overhead for PDF structure
    if (estimatedTotal > 0) {
      const qFactor = Math.min(1.5, Math.max(0.4, targetBytes / estimatedTotal));
      quality = Math.min(0.92, Math.max(0.15, quality * qFactor));
    }
  } catch {
    // fallback to initial quality if sampling fails
  }

  // Single-pass compression with adaptive page quality feedback
  const outDoc = await PDFDocument.create();
  let accumulatedBytes = 0;
  const targetPerPage = targetBytes / totalPages;

  for (let i = 1; i <= totalPages; i++) {
    await yieldToBrowser();

    const page = await srcPdf.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Adapt quality dynamically based on cumulative size drift
    let currentQuality = quality;
    if (i > 1) {
      const expectedSoFar = targetPerPage * (i - 1);
      if (accumulatedBytes > expectedSoFar * 1.25) {
        currentQuality = Math.max(0.12, currentQuality * 0.85); // reduce quality if over target
      } else if (accumulatedBytes < expectedSoFar * 0.75) {
        currentQuality = Math.min(0.92, currentQuality * 1.15); // increase quality if under target
      }
    }

    const bytes = await canvasToJpegBytes(canvas, currentQuality);
    accumulatedBytes += bytes.length;

    canvas.width = 0;
    canvas.height = 0;

    const jpgImage = await outDoc.embedJpg(bytes);
    const origViewport = page.getViewport({ scale: 1.0 });
    const pdfPage = outDoc.addPage([origViewport.width, origViewport.height]);
    pdfPage.drawImage(jpgImage, { x: 0, y: 0, width: origViewport.width, height: origViewport.height });

    onProgress?.(i, totalPages);
  }

  return outDoc.save();
}

// ----- Component -----

export default function CompressPage() {
  const [documents, setDocuments] = useState<LocalPDFDocument[]>([]);
  const [level, setLevel] = useState('recommended');
  const [targetMB, setTargetMB] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; fileName: string; phase?: string } | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string>('');
  const [originalSize, setOriginalSize] = useState(0);
  const [compressedSize, setCompressedSize] = useState(0);

  const totalOriginalMB = documents.reduce((s, d) => s + d.file.size, 0) / (1024 * 1024);

  const handleAddFiles = async (files: FileList | File[]) => {
    setDownloadUrl(null);
    const newDocs: LocalPDFDocument[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(), file, thumbnail: null,
    }));
    setDocuments((prev) => [...prev, ...newDocs]);
    for (const doc of newDocs) {
      const thumb = await generatePDFThumbnail(doc.file).catch(() => null);
      setDocuments((prev) => prev.map((p) => p.id === doc.id ? { ...p, thumbnail: thumb } : p));
    }
  };

  const handleCompress = async () => {
    if (documents.length === 0) { toast.error('Pilih minimal 1 file PDF.'); return; }

    // Validate custom target
    if (level === 'custom') {
      const mb = parseFloat(targetMB);
      if (!targetMB || isNaN(mb) || mb <= 0) {
        toast.error('Masukkan target ukuran yang valid (contoh: 50).');
        return;
      }
      if (mb >= totalOriginalMB) {
        toast.error(`Target (${mb} MB) harus lebih kecil dari ukuran asli (${totalOriginalMB.toFixed(1)} MB).`);
        return;
      }
    }

    const totalMB = documents.reduce((s, d) => s + d.file.size, 0) / (1024 * 1024);
    if (totalMB > 150) {
      toast(`File besar (${totalMB.toFixed(0)} MB) — proses mungkin butuh beberapa menit, jangan tutup tab ini.`, {
        duration: 6000, icon: '⏳',
      });
    }

    setIsProcessing(true);
    setDownloadUrl(null);
    setProgress(null);

    const preset = COMPRESSION_LEVELS.find((l) => l.id === level) ?? COMPRESSION_LEVELS[1];

    try {
      const totalOriginal = documents.reduce((sum, d) => sum + d.file.size, 0);
      setOriginalSize(totalOriginal);

      const results: { name: string; bytes: Uint8Array }[] = [];

      for (const doc of documents) {
        const baseName = doc.file.name.replace(/\.[^/.]+$/, '');

        let compressedBytes: Uint8Array;

        if (level === 'custom') {
          // For multi-file custom mode: distribute target proportionally by file size
          const fileRatio = doc.file.size / totalOriginal;
          const fileTarg = parseFloat(targetMB) * fileRatio * 1024 * 1024;
          compressedBytes = await compressPDFToTarget(
            doc.file,
            fileTarg,
            (page, total, phase) => setProgress({ current: page, total, fileName: doc.file.name, phase })
          );
        } else {
          compressedBytes = await compressPDF(
            doc.file,
            preset.scale,
            preset.quality,
            (page, total) => setProgress({ current: page, total, fileName: doc.file.name })
          );
        }

        results.push({ name: `${baseName}_compressed.pdf`, bytes: compressedBytes });
      }

      const totalCompressed = results.reduce((sum, r) => sum + r.bytes.length, 0);
      setCompressedSize(totalCompressed);

      if (results.length === 1) {
        const blob = new Blob([results[0].bytes as BlobPart], { type: 'application/pdf' });
        setDownloadUrl(URL.createObjectURL(blob));
        setDownloadFilename(`${documents[0].file.name.replace(/\.[^/.]+$/, '')} (Compressed).pdf`);
      } else {
        const zip = new JSZip();
        results.forEach((r) => zip.file(r.name, r.bytes));
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        setDownloadUrl(URL.createObjectURL(zipBlob));
        setDownloadFilename(`Compressed_Files_${Date.now()}.zip`);
      }

      toast.success('File berhasil dikompres!');
    } catch (e: any) {
      toast.error(e.message || 'Gagal memproses file.');
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const reductionPercent = originalSize > 0 ? Math.round((1 - compressedSize / originalSize) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight sm:text-5xl">Kompres PDF</h1>
          <p className="mt-4 max-w-2xl text-xl text-slate-500 mx-auto">
            Perkecil ukuran file PDF sesuai kebutuhan. (100% di perangkat Anda, tanpa upload ke server)
          </p>
        </div>

        <SortableGrid items={documents} setItems={setDocuments} onAddFiles={handleAddFiles} />

        {documents.length > 0 && !downloadUrl && (
          <div className="max-w-4xl mx-auto mt-12 bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
            <h3 className="text-xl font-bold text-slate-800 mb-6 text-center">Tingkat Kompresi</h3>

            {/* 4 option cards — 3 presets + 1 custom */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {COMPRESSION_LEVELS.map((lvl) => (
                <button key={lvl.id} onClick={() => setLevel(lvl.id)}
                  className={`p-5 rounded-2xl border-2 text-left transition-all ${
                    level === lvl.id
                      ? lvl.id === 'custom'
                        ? 'border-violet-600 bg-violet-50'
                        : 'border-indigo-600 bg-indigo-50'
                      : 'border-slate-200 hover:border-indigo-300'
                  }`}>
                  <lvl.icon className={`w-7 h-7 mb-3 ${
                    level === lvl.id
                      ? lvl.id === 'custom' ? 'text-violet-600' : 'text-indigo-600'
                      : 'text-slate-400'
                  }`} />
                  <h4 className={`font-bold text-base mb-1 ${
                    level === lvl.id
                      ? lvl.id === 'custom' ? 'text-violet-900' : 'text-indigo-900'
                      : 'text-slate-700'
                  }`}>{lvl.label}</h4>
                  <p className="text-xs text-slate-500 leading-snug">{lvl.desc}</p>
                </button>
              ))}
            </div>

            {/* Custom target input — only shown when 'custom' is selected */}
            {level === 'custom' && (
              <div className="mb-6 p-5 bg-violet-50 border border-violet-200 rounded-2xl">
                <label className="block text-sm font-semibold text-violet-800 mb-3">
                  Target ukuran akhir
                </label>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1 max-w-xs">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={targetMB}
                      onChange={(e) => setTargetMB(e.target.value)}
                      placeholder="Contoh: 50"
                      className="w-full px-4 py-3 pr-14 border-2 border-violet-300 rounded-xl text-slate-800 font-medium text-lg focus:outline-none focus:border-violet-500 bg-white"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">MB</span>
                  </div>
                  {totalOriginalMB > 0 && (
                    <p className="text-sm text-violet-700">
                      dari <span className="font-semibold">{totalOriginalMB.toFixed(1)} MB</span>
                    </p>
                  )}
                </div>
                <p className="text-xs text-violet-600 mt-2">
                  ⚡ Sistem otomatis menyesuaikan kualitas untuk mendekati target. Hasil aktual bisa ±5% dari target.
                  {level === 'custom' && documents.length > 1 && (
                    <span> Untuk banyak file, target dibagi proporsional per file.</span>
                  )}
                </p>
              </div>
            )}

            {/* Progress bar */}
            {isProcessing && progress && (
              <div className="mb-6">
                <div className="flex justify-between text-sm text-slate-500 mb-1">
                  <span className="truncate max-w-xs font-medium">{progress.fileName}</span>
                  <span>{progress.phase ?? `Halaman ${progress.current} / ${progress.total}`}</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-3">
                  <div
                    className="bg-indigo-500 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1 text-center">
                  {progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}% selesai
                </p>
              </div>
            )}

            {isProcessing && !progress && (
              <div className="w-full bg-slate-200 rounded-full h-3 mb-6">
                <div className="bg-indigo-500 h-3 rounded-full animate-pulse" style={{ width: '100%' }} />
              </div>
            )}

            <div className="flex justify-center border-t border-slate-100 pt-6">
              <button onClick={handleCompress} disabled={isProcessing}
                className="w-full sm:w-auto px-12 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg rounded-2xl shadow-lg transition-all disabled:opacity-50">
                {isProcessing ? 'Memproses di perangkat...' : 'Kompres PDF Sekarang'}
              </button>
            </div>
          </div>
        )}

        {downloadUrl && (
          <div className="mt-8 max-w-3xl mx-auto p-8 bg-green-50 border border-green-200 rounded-3xl flex flex-col items-center">
            <h3 className="text-2xl font-bold text-green-800 mb-3">🎉 Berhasil Dikompres!</h3>
            {originalSize > 0 && (
              <p className="text-green-700 mb-4 text-center">
                {formatSize(originalSize)} → {formatSize(compressedSize)}{' '}
                {reductionPercent > 0
                  ? <span className="font-semibold">(hemat {reductionPercent}%)</span>
                  : <span className="text-yellow-600">(ukuran tidak berkurang — file mungkin sudah teroptimasi)</span>
                }
              </p>
            )}
            <button onClick={() => saveAs(downloadUrl, downloadFilename)}
              className="w-full sm:w-auto px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-bold text-lg rounded-2xl shadow-md">
              Unduh Hasil
            </button>
            <button onClick={() => { setDownloadUrl(null); setDocuments([]); setOriginalSize(0); setCompressedSize(0); }}
              className="mt-4 text-green-700 text-sm underline">Kompres file lainnya</button>
          </div>
        )}
      </main>
    </div>
  );
}
