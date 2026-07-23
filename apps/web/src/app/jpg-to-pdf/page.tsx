'use client';

import React, { useState } from 'react';
import { SortableGrid, PDFDocument as LocalPDFDocument } from '@/components/SortableGrid';
import { PDFDocument, PageSizes } from 'pdf-lib';
import { saveAs } from 'file-saver';
import toast from 'react-hot-toast';
import { CheckCircle2, Download } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

const PAPER_SIZES: Record<string, { label: string; dims: [number, number] | null }> = {
  original: { label: 'Original (Fit Image)', dims: null },
  a3: { label: 'A3 (297 x 420 mm)', dims: PageSizes.A3 },
  a4: { label: 'A4 (Standard, 210 x 297 mm)', dims: PageSizes.A4 },
  a5: { label: 'A5 (148 x 210 mm)', dims: PageSizes.A5 },
  letter: { label: 'Letter (US, 8.5 x 11 in)', dims: PageSizes.Letter },
  legal: { label: 'Legal (US, 8.5 x 14 in)', dims: PageSizes.Legal },
};

export default function Img2PdfPage() {
  const { t } = useLanguage();
  const [documents, setDocuments] = useState<LocalPDFDocument[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string>('');
  const [pageSize, setPageSize] = useState<string>('original');

  const handleAddFiles = async (files: FileList | File[]) => {
    setDownloadUrl(null);
    const newDocs: LocalPDFDocument[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      thumbnail: URL.createObjectURL(file),
    }));
    setDocuments((prev) => [...prev, ...newDocs]);
  };

  const handleConvert = async () => {
    if (documents.length === 0) {
      toast.error(t('noFilesSelected'));
      return;
    }
    setIsProcessing(true);
    setDownloadUrl(null);
    try {
      const pdfDoc = await PDFDocument.create();

      for (const doc of documents) {
        const fileBuffer = await doc.file.arrayBuffer();
        let image;

        if (
          doc.file.type === 'image/jpeg' ||
          doc.file.name.toLowerCase().endsWith('.jpg') ||
          doc.file.name.toLowerCase().endsWith('.jpeg')
        ) {
          image = await pdfDoc.embedJpg(fileBuffer);
        } else if (doc.file.type === 'image/png' || doc.file.name.toLowerCase().endsWith('.png')) {
          image = await pdfDoc.embedPng(fileBuffer);
        } else {
          continue;
        }

        const dims = image.scale(1);

        let paperWidth = dims.width;
        let paperHeight = dims.height;
        const selectedSize = PAPER_SIZES[pageSize]?.dims;

        if (selectedSize) {
          paperWidth = selectedSize[0];
          paperHeight = selectedSize[1];
        }

        const page = pdfDoc.addPage([paperWidth, paperHeight]);

        if (!selectedSize) {
          page.drawImage(image, {
            x: 0,
            y: 0,
            width: dims.width,
            height: dims.height,
          });
        } else {
          const scaleFactor = Math.min(paperWidth / dims.width, paperHeight / dims.height);
          const drawWidth = dims.width * scaleFactor;
          const drawHeight = dims.height * scaleFactor;
          const x = (paperWidth - drawWidth) / 2;
          const y = (paperHeight - drawHeight) / 2;

          page.drawImage(image, {
            x,
            y,
            width: drawWidth,
            height: drawHeight,
          });
        }
      }

      if (pdfDoc.getPageCount() === 0) {
        throw new Error('Tidak ada gambar valid (Hanya JPG/PNG didukung).');
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      setDownloadUrl(URL.createObjectURL(blob));
      if (documents.length === 1) {
        const originalName = documents[0].file.name.replace(/\.[^/.]+$/, '');
        setDownloadFilename(`${originalName} (Converted).pdf`);
      } else {
        setDownloadFilename(`Images_to_PDF_${Date.now()}.pdf`);
      }
      toast.success(t('successTitle'));
    } catch (e: any) {
      toast.error(e.message || 'Gagal memproses file.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
      <main className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight sm:text-5xl">
            {t('jpgToPdfTitle')}
          </h1>
          <p className="mt-4 max-w-2xl text-xl text-slate-500 dark:text-slate-400 mx-auto">
            {t('jpgToPdfDesc')}
          </p>
        </div>

        <SortableGrid
          items={documents}
          setItems={setDocuments}
          onAddFiles={handleAddFiles}
          accept="image/jpeg, image/png, .jpg, .jpeg, .png"
          uploadLabel={t('selectFiles')}
        />

        {documents.length > 0 && !downloadUrl && (
          <div className="max-w-3xl mx-auto mt-12 bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800">
            {isProcessing && (
              <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-3 mb-6">
                <div
                  className="bg-indigo-600 dark:bg-indigo-500 h-3 rounded-full animate-pulse"
                  style={{ width: '100%' }}
                />
              </div>
            )}
            <div className="flex flex-col items-center justify-center gap-6">
              <div className="flex flex-col items-center w-full max-w-sm">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Ukuran Kertas / Paper Size (PDF)
                </label>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  {Object.entries(PAPER_SIZES).map(([key, config]) => (
                    <option key={key} value={key}>
                      {config.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleConvert}
                disabled={isProcessing}
                className="w-full sm:w-auto px-12 py-4 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white font-bold text-lg rounded-2xl shadow-lg transition-all disabled:opacity-50"
              >
                {isProcessing ? t('processing') : t('jpgToPdfTitle')}
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
