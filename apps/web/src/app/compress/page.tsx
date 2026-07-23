'use client';

import React, { useState } from 'react';
import { SortableGrid, PDFDocument as LocalPDFDocument } from '@/components/SortableGrid';
import { generatePDFThumbnail } from '@/utils/pdf';
import { PDFDocument } from 'pdf-lib';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { Settings2, ArrowDownToLine, Zap, SlidersHorizontal, CheckCircle2, Download, Sparkles, ArrowRight } from 'lucide-react';
import { saveHistoryItem } from '@/utils/historyDB';
import { useClipboardPaste } from '@/hooks/useClipboardPaste';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { GranularProgressModal } from '@/components/GranularProgressModal';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { useLanguage } from '@/context/LanguageContext';
import toast from 'react-hot-toast';

// Preset compression levels
const COMPRESSION_LEVELS = [
  {
    id: 'extreme',
    label: 'Ekstrem',
    desc: 'Ukuran paling kecil, kualitas lebih rendah',
    estimatedReductionRatio: 0.25, // ~75% savings
    icon: ArrowDownToLine,
    scale: 1.0,
    quality: 0.5,
  },
  {
    id: 'recommended',
    label: 'Rekomendasi',
    desc: 'Keseimbangan terbaik ukuran & kualitas',
    estimatedReductionRatio: 0.45, // ~55% savings
    icon: Zap,
    scale: 1.5,
    quality: 0.72,
  },
  {
    id: 'less',
    label: 'Rendah',
    desc: 'Ukuran lebih besar, kualitas lebih baik',
    estimatedReductionRatio: 0.75, // ~25% savings
    icon: Settings2,
    scale: 2.0,
    quality: 0.88,
  },
  {
    id: 'custom',
    label: 'Kustom',
    desc: 'Tentukan sendiri target ukuran akhir',
    estimatedReductionRatio: 0.50,
    icon: SlidersHorizontal,
    scale: 1.5,
    quality: 0.72,
  },
];

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

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

async function compressPDF(
  file: File,
  scale: number,
  quality: number,
  onProgress?: (page: number, total: number) => void
): Promise<Uint8Array> {
  const pdfjsLib = await import('pdfjs-dist');
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
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

export default function CompressPage() {
  const { t } = useLanguage();
  const [documents, setDocuments] = useState<LocalPDFDocument[]>([]);
  const [level, setLevel] = useState('recommended');
  const [targetMB, setTargetMB] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; fileName: string } | null>(null);
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

  useClipboardPaste((pastedFiles) => {
    const pdfs = pastedFiles.filter((f) => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    if (pdfs.length > 0) handleAddFiles(pdfs);
  });

  useKeyboardShortcuts({
    onOpenFileDialog: () => {
      document.querySelector<HTMLInputElement>('input[type="file"]')?.click();
    },
    onSubmitAction: () => {
      if (documents.length > 0 && !isProcessing) handleCompress();
    },
  });

  const handleCompress = async () => {
    if (documents.length === 0) { toast.error('Pilih minimal 1 file PDF.'); return; }

    setIsProcessing(true);
    setDownloadUrl(null);

    const preset = COMPRESSION_LEVELS.find((l) => l.id === level) ?? COMPRESSION_LEVELS[1];

    try {
      const totalOriginal = documents.reduce((sum, d) => sum + d.file.size, 0);
      setOriginalSize(totalOriginal);

      const results: { name: string; bytes: Uint8Array }[] = [];

      for (const doc of documents) {
        const baseName = doc.file.name.replace(/\.[^/.]+$/, '');
        const compressedBytes = await compressPDF(
          doc.file,
          preset.scale,
          preset.quality,
          (page, total) => setProgress({ current: page, total, fileName: doc.file.name })
        );

        results.push({ name: `${baseName}_compressed.pdf`, bytes: compressedBytes });
      }

      const totalCompressed = results.reduce((sum, r) => sum + r.bytes.length, 0);
      setCompressedSize(totalCompressed);

      if (results.length === 1) {
        const blob = new Blob([results[0].bytes as BlobPart], { type: 'application/pdf' });
        const name = `${documents[0].file.name.replace(/\.[^/.]+$/, '')} (Compressed).pdf`;
        setDownloadUrl(URL.createObjectURL(blob));
        setDownloadFilename(name);
        await saveHistoryItem(name, 'Compress PDF', blob);
      } else {
        const zip = new JSZip();
        results.forEach((r) => zip.file(r.name, r.bytes));
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const name = `Compressed_Files_${Date.now()}.zip`;
        setDownloadUrl(URL.createObjectURL(zipBlob));
        setDownloadFilename(name);
        await saveHistoryItem(name, 'Compress PDF (ZIP)', zipBlob);
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

  const selectedPreset = COMPRESSION_LEVELS.find((l) => l.id === level) || COMPRESSION_LEVELS[1];
  const estimatedMB = level === 'custom' && targetMB
    ? parseFloat(targetMB) || 0
    : totalOriginalMB * selectedPreset.estimatedReductionRatio;
  const estimatedSavings = totalOriginalMB > 0
    ? Math.max(0, Math.round((1 - estimatedMB / totalOriginalMB) * 100))
    : 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4 sm:px-6 lg:px-8 transition-colors">
      <main className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight sm:text-5xl">
            {t('compressTitle')}
          </h1>
          <p className="mt-4 max-w-2xl text-xl text-slate-500 dark:text-slate-400 mx-auto">
            Perkecil ukuran file PDF sesuai kebutuhan. (100% di perangkat Anda, tanpa upload ke server)
          </p>
        </div>

        <SortableGrid items={documents} setItems={setDocuments} onAddFiles={handleAddFiles} />

        {/* Real-time Estimator Box */}
        {documents.length > 0 && !downloadUrl && (
          <div className="max-w-4xl mx-auto mt-8 p-4 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 rounded-2xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <div className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
                <span>Ukuran Awal: </span>
                <span className="font-bold text-slate-900 dark:text-white">{totalOriginalMB.toFixed(2)} MB</span>
                <ArrowRight className="w-3.5 h-3.5 inline mx-1.5 text-slate-400" />
                <span>Estimasi Hasil: </span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">~{estimatedMB.toFixed(2)} MB</span>
                <span className="ml-2 bg-indigo-200 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 px-2 py-0.5 rounded-full text-xs">
                  Hemat ~{estimatedSavings}%
                </span>
              </div>
            </div>
          </div>
        )}

        {documents.length > 0 && !downloadUrl && (
          <div className="max-w-4xl mx-auto mt-6 bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800">
            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-6 text-center">
              {t('compressionLevel')}
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {COMPRESSION_LEVELS.map((lvl) => (
                <button
                  key={lvl.id}
                  onClick={() => setLevel(lvl.id)}
                  className={`p-5 rounded-2xl border-2 text-left transition-all ${
                    level === lvl.id
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-300'
                  }`}
                >
                  <lvl.icon className={`w-7 h-7 mb-3 ${level === lvl.id ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <h4 className="font-bold text-base mb-1">{lvl.label}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">{lvl.desc}</p>
                </button>
              ))}
            </div>

            <div className="flex justify-center border-t border-slate-100 dark:border-slate-800 pt-6">
              <button
                onClick={handleCompress}
                disabled={isProcessing}
                className="w-full sm:w-auto px-12 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg rounded-2xl shadow-lg transition-all disabled:opacity-50"
              >
                {isProcessing ? 'Memproses di perangkat...' : 'Kompres PDF Sekarang'}
              </button>
            </div>
          </div>
        )}

        {downloadUrl && (
          <div className="mt-8 max-w-3xl mx-auto p-8 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-3xl flex flex-col items-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 dark:text-emerald-400 mb-3" />
            <h3 className="text-2xl font-bold text-emerald-800 dark:text-emerald-200 mb-3">Berhasil Dikompres!</h3>
            {originalSize > 0 && (
              <p className="text-emerald-700 dark:text-emerald-300 mb-4 text-center">
                {formatSize(originalSize)} → {formatSize(compressedSize)}{' '}
                <span className="font-semibold">(hemat {Math.round((1 - compressedSize / originalSize) * 100)}%)</span>
              </p>
            )}
            <button
              onClick={() => saveAs(downloadUrl, downloadFilename)}
              className="w-full sm:w-auto px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg rounded-2xl shadow-md flex items-center gap-2"
            >
              <Download className="w-5 h-5" />
              <span>{t('download')}</span>
            </button>
          </div>
        )}
      </main>

      <FloatingActionBar
        totalCount={documents.length}
        onClearAll={() => setDocuments([])}
      />

      <GranularProgressModal
        isOpen={isProcessing && progress !== null}
        current={progress?.current || 0}
        total={progress?.total || 0}
        fileName={progress?.fileName}
        stepDescription="Mengompresi Halaman PDF..."
      />
    </div>
  );
}
