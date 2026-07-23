'use client';

import React, { useState } from 'react';
import { SortableGrid, PDFDocument as LocalPDFDocument } from '@/components/SortableGrid';
import { generatePDFThumbnail } from '@/utils/pdf';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import toast from 'react-hot-toast';
import { CheckCircle2, Download } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

const yieldToBrowser = () => new Promise<void>((r) => setTimeout(r, 0));

export default function SplitPage() {
  const { t } = useLanguage();
  const [documents, setDocuments] = useState<LocalPDFDocument[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ page: number; total: number } | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string>('');
  const [mode, setMode] = useState<'all' | 'extract'>('all');
  const [pages, setPages] = useState('');
  const [resultMode, setResultMode] = useState<'zip' | 'single'>('zip');

  const handleAddFiles = async (files: FileList | File[]) => {
    setDownloadUrl(null);
    const newDocs: LocalPDFDocument[] = Array.from(files)
      .slice(0, 1)
      .map((file) => ({
        id: crypto.randomUUID(),
        file,
        thumbnail: null,
      }));
    setDocuments(newDocs);
    for (const doc of newDocs) {
      const thumb = await generatePDFThumbnail(doc.file).catch(() => null);
      setDocuments((prev) => prev.map((p) => (p.id === doc.id ? { ...p, thumbnail: thumb } : p)));
    }
  };

  const handleSplit = async () => {
    if (documents.length === 0) {
      toast.error(t('noFilesSelected'));
      return;
    }

    const fileMB = documents[0].file.size / 1048576;
    if (fileMB > 300)
      toast(`File besar (${fileMB.toFixed(0)} MB) — proses mungkin beberapa menit.`, { duration: 8000 });

    setIsProcessing(true);
    setDownloadUrl(null);
    setProgress(null);
    try {
      const fileBuffer = await documents[0].file.arrayBuffer();
      await yieldToBrowser();
      const pdfDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
      const totalPages = pdfDoc.getPageCount();

      if (mode === 'extract') {
        const pageIndices = pages
          .split(',')
          .map((p) => parseInt(p.trim()) - 1)
          .filter((p) => !isNaN(p) && p >= 0 && p < totalPages);
        if (pageIndices.length === 0) throw new Error('Nomor halaman tidak valid.');

        const newPdf = await PDFDocument.create();
        const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
        copiedPages.forEach((page) => newPdf.addPage(page));

        const pdfBytes = await newPdf.save();
        const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
        setResultMode('single');
        setDownloadUrl(URL.createObjectURL(blob));
        const originalName = documents[0].file.name.replace(/\.[^/.]+$/, '');
        setDownloadFilename(`${originalName} (Extracted).pdf`);
      } else {
        const zip = new JSZip();
        const baseName = documents[0].file.name.replace(/\.[^/.]+$/, '');

        for (let i = 0; i < totalPages; i++) {
          setProgress({ page: i + 1, total: totalPages });
          if (i % 5 === 0) await yieldToBrowser();

          const newPdf = await PDFDocument.create();
          const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
          newPdf.addPage(copiedPage);
          const pdfBytes = await newPdf.save();
          zip.file(`${baseName}_page${i + 1}.pdf`, pdfBytes);
        }

        setProgress(null);
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        setResultMode('zip');
        setDownloadUrl(URL.createObjectURL(zipBlob));
        setDownloadFilename(`Split_Files_${Date.now()}.zip`);
      }
      toast.success(t('successSplit'));
    } catch (e: any) {
      toast.error(e.message || 'Gagal memproses file.');
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
      <main className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight sm:text-5xl">
            {t('splitTitle')}
          </h1>
          <p className="mt-4 max-w-2xl text-xl text-slate-500 dark:text-slate-400 mx-auto">
            {t('splitDesc')}
          </p>
        </div>

        <SortableGrid items={documents} setItems={setDocuments} onAddFiles={handleAddFiles} />

        {documents.length > 0 && !downloadUrl && (
          <div className="max-w-3xl mx-auto mt-12 bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="flex gap-4 mb-6">
              {(['all', 'extract'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                    mode === m
                      ? 'bg-indigo-600 dark:bg-indigo-500 text-white shadow-md'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {m === 'all' ? 'Pisahkan Semua Halaman' : t('extractPages')}
                </button>
              ))}
            </div>
            {mode === 'extract' && (
              <input
                type="text"
                value={pages}
                onChange={(e) => setPages(e.target.value)}
                placeholder="Contoh: 1, 3, 5-8"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 mb-6 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            )}
            {isProcessing && progress && (
              <div className="mb-4">
                <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400 mb-2">
                  <span>
                    Memisahkan halaman {progress.page} dari {progress.total}...
                  </span>
                  <span>{Math.round((progress.page / progress.total) * 100)}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-3">
                  <div
                    className="bg-indigo-600 dark:bg-indigo-500 h-3 rounded-full transition-all duration-200"
                    style={{ width: `${Math.round((progress.page / progress.total) * 100)}%` }}
                  />
                </div>
              </div>
            )}
            {isProcessing && !progress && (
              <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-3 mb-4">
                <div className="bg-indigo-600 dark:bg-indigo-500 h-3 rounded-full animate-pulse w-full" />
              </div>
            )}
            <div className="flex justify-center">
              <button
                onClick={handleSplit}
                disabled={isProcessing}
                className="w-full sm:w-auto px-12 py-4 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white font-bold text-lg rounded-2xl shadow-lg transition-all disabled:opacity-50"
              >
                {isProcessing ? t('processing') : t('splitTitle')}
              </button>
            </div>
          </div>
        )}

        {downloadUrl && (
          <div className="mt-8 max-w-3xl mx-auto p-8 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-3xl flex flex-col items-center text-center animate-in fade-in zoom-in duration-300">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 dark:text-emerald-400 mb-3" />
            <h3 className="text-2xl font-bold text-emerald-900 dark:text-emerald-200 mb-3">
              {t('successSplit')}
            </h3>
            <button
              onClick={() => saveAs(downloadUrl, downloadFilename)}
              className="w-full sm:w-auto px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg rounded-2xl shadow-md transition-all flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5" />
              <span>{t('download')}</span>
            </button>
            <button
              onClick={() => {
                setDownloadUrl(null);
                setDocuments([]);
              }}
              className="mt-4 text-emerald-700 dark:text-emerald-400 text-sm underline hover:opacity-80"
            >
              {t('convertAnother')}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
