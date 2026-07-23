'use client';

import React, { useState } from 'react';
import { SortableGrid, PDFDocument } from '@/components/SortableGrid';
import { generatePDFThumbnail } from '@/utils/pdf';
import { convertPdfToMarkdown } from '@/utils/pdfToMarkdown';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import toast from 'react-hot-toast';
import { CheckCircle2, Download } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export default function PdfToMarkdownPage() {
  const { t } = useLanguage();
  const [documents, setDocuments] = useState<PDFDocument[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string>('');
  const [resultMode, setResultMode] = useState<'zip' | 'single'>('single');
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const handleAddFiles = async (files: FileList | File[]) => {
    setDownloadUrl(null);
    const newDocs: PDFDocument[] = Array.from(files).map((file) => ({
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

  const handleConvert = async () => {
    if (documents.length === 0) {
      toast.error(t('noFilesSelected'));
      return;
    }
    setIsProcessing(true);
    setDownloadUrl(null);
    setProgress({ current: 0, total: 0 });

    try {
      const results: { name: string; content: string }[] = [];

      for (const doc of documents) {
        const markdown = await convertPdfToMarkdown(doc.file, (current, total) =>
          setProgress({ current, total })
        );
        const baseName = doc.file.name.replace(/\.[^/.]+$/, '');
        results.push({ name: `${baseName}.md`, content: markdown });
      }

      if (results.length === 1) {
        const blob = new Blob([results[0].content], { type: 'text/markdown;charset=utf-8' });
        setResultMode('single');
        setDownloadUrl(URL.createObjectURL(blob));
        const originalName = documents[0].file.name.replace(/\.[^/.]+$/, '');
        setDownloadFilename(`${originalName} (Converted).md`);
      } else {
        const zip = new JSZip();
        for (const r of results) {
          zip.file(r.name, r.content);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        setResultMode('zip');
        setDownloadUrl(URL.createObjectURL(zipBlob));
        setDownloadFilename(`PDF_to_Markdown_${Date.now()}.zip`);
      }

      toast.success(t('successTitle'));
    } catch (e: any) {
      toast.error(e.message || 'Gagal memproses file.');
    } finally {
      setIsProcessing(false);
    }
  };

  const progressPercent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
      <main className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight sm:text-5xl">
            {t('pdfToMdTitle')}
          </h1>
          <p className="mt-4 max-w-2xl text-xl text-slate-500 dark:text-slate-400 mx-auto">
            {t('pdfToMdDesc')}
          </p>
        </div>

        <SortableGrid items={documents} setItems={setDocuments} onAddFiles={handleAddFiles} />

        {documents.length > 0 && !downloadUrl && (
          <div className="max-w-3xl mx-auto mt-12 bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800">
            {isProcessing && (
              <div className="w-full">
                <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-3 mb-2">
                  <div
                    className="bg-emerald-500 h-3 rounded-full transition-all"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                  Halaman {progress.current} / {progress.total}
                </p>
              </div>
            )}
            <div className="flex justify-center mt-4">
              <button
                onClick={handleConvert}
                disabled={isProcessing}
                className="w-full sm:w-auto px-12 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg rounded-2xl shadow-lg transition-all disabled:opacity-50"
              >
                {isProcessing ? t('processing') : t('pdfToMdTitle')}
              </button>
            </div>
          </div>
        )}

        {downloadUrl && (
          <div className="mt-8 max-w-3xl mx-auto p-8 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-3xl flex flex-col items-center text-center animate-in fade-in zoom-in duration-300">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 dark:text-emerald-400 mb-3" />
            <h3 className="text-2xl font-bold text-emerald-900 dark:text-emerald-200 mb-3">
              {t('successTitle')}
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
