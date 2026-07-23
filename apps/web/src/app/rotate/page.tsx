'use client';

import React, { useState } from 'react';
import { SortableGrid, PDFDocument as LocalPDFDocument } from '@/components/SortableGrid';
import { generatePDFThumbnail } from '@/utils/pdf';
import { PDFDocument, degrees } from 'pdf-lib';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import toast from 'react-hot-toast';
import { CheckCircle2, Download } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

const ANGLES = [
  { label: '↺ 90° Left', value: 270 },
  { label: '↻ 90° Right', value: 90 },
  { label: '↕ 180°', value: 180 },
];

export default function RotatePage() {
  const { t } = useLanguage();
  const [documents, setDocuments] = useState<LocalPDFDocument[]>([]);
  const [angle, setAngle] = useState(90);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string>('');
  const [resultMode, setResultMode] = useState<'zip' | 'single'>('zip');

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

  const handleRotate = async () => {
    if (documents.length === 0) {
      toast.error(t('noFilesSelected'));
      return;
    }
    setIsProcessing(true);
    setDownloadUrl(null);
    try {
      const results: { name: string; bytes: Uint8Array }[] = [];

      for (const doc of documents) {
        const fileBuffer = await doc.file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
        const pages = pdfDoc.getPages();
        pages.forEach((page) => {
          const currentRotation = page.getRotation().angle;
          page.setRotation(degrees((currentRotation + angle) % 360));
        });
        const pdfBytes = await pdfDoc.save();
        const baseName = doc.file.name.replace(/\.[^/.]+$/, '');
        results.push({ name: `${baseName}_rotated.pdf`, bytes: pdfBytes });
      }

      if (results.length === 1) {
        const blob = new Blob([results[0].bytes as any], { type: 'application/pdf' });
        setResultMode('single');
        setDownloadUrl(URL.createObjectURL(blob));
        const originalName = documents[0].file.name.replace(/\.[^/.]+$/, '');
        setDownloadFilename(`${originalName} (Rotated).pdf`);
      } else {
        const zip = new JSZip();
        results.forEach((res) => zip.file(res.name, res.bytes));
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        setResultMode('zip');
        setDownloadUrl(URL.createObjectURL(zipBlob));
        setDownloadFilename(`Rotated_Files_${Date.now()}.zip`);
      }
      toast.success(t('successRotated'));
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
            {t('rotateTitle')}
          </h1>
          <p className="mt-4 max-w-2xl text-xl text-slate-500 dark:text-slate-400 mx-auto">
            {t('rotateDesc')}
          </p>
        </div>

        <SortableGrid items={documents} setItems={setDocuments} onAddFiles={handleAddFiles} />

        {documents.length > 0 && !downloadUrl && (
          <div className="max-w-3xl mx-auto mt-12 bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800">
            <p className="text-center font-semibold text-slate-700 dark:text-slate-300 mb-4">
              Pilih Arah Rotasi / Select Rotation Angle
            </p>
            <div className="flex gap-4 justify-center mb-6">
              {ANGLES.map((a) => (
                <button
                  key={a.value}
                  onClick={() => setAngle(a.value)}
                  className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                    angle === a.value
                      ? 'bg-indigo-600 dark:bg-indigo-500 text-white shadow-lg'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
            {isProcessing && (
              <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-3 mb-4">
                <div
                  className="bg-indigo-600 dark:bg-indigo-500 h-3 rounded-full animate-pulse"
                  style={{ width: '100%' }}
                />
              </div>
            )}
            <div className="flex justify-center">
              <button
                onClick={handleRotate}
                disabled={isProcessing}
                className="w-full sm:w-auto px-12 py-4 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white font-bold text-lg rounded-2xl shadow-lg transition-all disabled:opacity-50"
              >
                {isProcessing ? t('processing') : t('rotateTitle')}
              </button>
            </div>
          </div>
        )}

        {downloadUrl && (
          <div className="mt-8 max-w-3xl mx-auto p-8 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-3xl flex flex-col items-center text-center animate-in fade-in zoom-in duration-300">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 dark:text-emerald-400 mb-3" />
            <h3 className="text-2xl font-bold text-emerald-900 dark:text-emerald-200 mb-3">
              {t('successRotated')}
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
