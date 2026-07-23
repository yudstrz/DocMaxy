'use client';

import React, { useState } from 'react';
import { SortableGrid, PDFDocument as LocalPDFDocument } from '@/components/SortableGrid';
import { generatePDFThumbnail } from '@/utils/pdf';
import { PDFDocument } from 'pdf-lib';
import { saveAs } from 'file-saver';
import toast from 'react-hot-toast';
import { CheckCircle2, Download } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

const yieldToBrowser = () => new Promise<void>((r) => setTimeout(r, 0));

function parsePageString(pagesStr: string | undefined, totalPages: number): number[] {
  if (!pagesStr || !pagesStr.trim()) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }

  const indices: number[] = [];
  const parts = pagesStr.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);

      if (!isNaN(start) && !isNaN(end)) {
        const step = start <= end ? 1 : -1;
        const validStart = Math.max(1, Math.min(start, totalPages));
        const validEnd = Math.max(1, Math.min(end, totalPages));

        if (step === 1) {
          for (let i = validStart; i <= validEnd; i++) indices.push(i - 1);
        } else {
          for (let i = validStart; i >= validEnd; i--) indices.push(i - 1);
        }
      }
    } else {
      const pageNum = parseInt(trimmed, 10);
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
        indices.push(pageNum - 1);
      }
    }
  }

  return indices.length > 0 ? indices : Array.from({ length: totalPages }, (_, i) => i);
}

export default function MergePage() {
  const { t } = useLanguage();
  const [documents, setDocuments] = useState<LocalPDFDocument[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string>('');

  const handleAddFiles = async (files: FileList | File[]) => {
    setDownloadUrl(null);
    const newDocs: LocalPDFDocument[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      thumbnail: null,
    }));
    setDocuments((prev) => [...prev, ...newDocs]);
    for (const doc of newDocs) {
      const thumb = await generatePDFThumbnail(doc.file).catch(() => null);
      setDocuments((prev) => prev.map((p) => (p.id === doc.id ? { ...p, thumbnail: thumb } : p)));
    }
  };

  const handlePageInputChange = (id: string, value: string) => {
    setDocuments((prev) => prev.map((doc) => (doc.id === id ? { ...doc, pages: value } : doc)));
  };

  const handleMerge = async () => {
    if (documents.length < 2) {
      toast.error('Pilih minimal 2 file PDF untuk digabungkan.');
      return;
    }

    const totalMB = documents.reduce((s, d) => s + d.file.size, 0) / 1048576;
    if (totalMB > 300)
      toast(`Total file besar (${totalMB.toFixed(0)} MB) — proses mungkin beberapa menit.`, { duration: 8000 });

    setIsProcessing(true);
    setDownloadUrl(null);
    setProgress(null);
    try {
      const mergedPdf = await PDFDocument.create();

      for (let di = 0; di < documents.length; di++) {
        const doc = documents[di];
        setProgress({ current: di + 1, total: documents.length, label: `${doc.file.name}` });
        await yieldToBrowser();

        const fileBuffer = await doc.file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
        const pageCount = pdfDoc.getPageCount();

        const indices = parsePageString(doc.pages, pageCount);

        for (let pi = 0; pi < indices.length; pi++) {
          if (pi > 0 && pi % 10 === 0) {
            setProgress({
              current: di + 1,
              total: documents.length,
              label: `${doc.file.name} — ${pi}/${indices.length}`,
            });
            await yieldToBrowser();
          }
          try {
            const [copied] = await mergedPdf.copyPages(pdfDoc, [indices[pi]]);
            mergedPdf.addPage(copied);
          } catch (e) {
            console.warn('Skipping invalid page index', indices[pi]);
          }
        }
      }

      setProgress({ current: documents.length, total: documents.length, label: 'Menyimpan...' });
      await yieldToBrowser();

      const pdfBytes = await mergedPdf.save();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      setDownloadUrl(URL.createObjectURL(blob));
      setDownloadFilename(`Merged_Document_${Date.now()}.pdf`);
      toast.success(t('successMerged'));
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
            {t('mergeTitle')}
          </h1>
          <p className="mt-4 max-w-2xl text-xl text-slate-500 dark:text-slate-400 mx-auto">
            {t('mergeDesc')}
          </p>
        </div>

        <SortableGrid
          items={documents}
          setItems={setDocuments}
          onAddFiles={handleAddFiles}
          showPageInput={true}
          onPageInputChange={handlePageInputChange}
        />

        {documents.length >= 2 && !downloadUrl && (
          <div className="max-w-3xl mx-auto mt-12 bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="flex flex-col items-center gap-4">
              {isProcessing && progress && (
                <div className="w-full max-w-md">
                  <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400 mb-2">
                    <span className="truncate max-w-xs">{progress.label}</span>
                    <span>
                      {progress.current}/{progress.total}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-3">
                    <div
                      className="bg-indigo-600 dark:bg-indigo-500 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
              {isProcessing && !progress && (
                <div className="w-full max-w-md">
                  <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-3">
                    <div className="bg-indigo-600 dark:bg-indigo-500 h-3 rounded-full animate-pulse w-full" />
                  </div>
                </div>
              )}
              <button
                onClick={handleMerge}
                disabled={isProcessing}
                className="w-full sm:w-auto px-12 py-4 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white font-bold text-lg rounded-2xl shadow-lg transition-all disabled:opacity-50"
              >
                {isProcessing ? t('processing') : `${t('mergeTitle')} (${documents.length})`}
              </button>
            </div>
          </div>
        )}

        {downloadUrl && (
          <div className="mt-8 max-w-3xl mx-auto p-8 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-3xl flex flex-col items-center text-center animate-in fade-in zoom-in duration-300">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 dark:text-emerald-400 mb-3" />
            <h3 className="text-2xl font-bold text-emerald-900 dark:text-emerald-200 mb-3">
              {t('successMerged')}
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
