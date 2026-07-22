'use client';

import React, { useState } from 'react';
import { SortableGrid, PDFDocument as LocalPDFDocument } from '@/components/SortableGrid';
import { generatePDFThumbnail } from '@/utils/pdf';
import { PDFDocument } from 'pdf-lib';
import { saveAs } from 'file-saver';
import toast from 'react-hot-toast';

const yieldToBrowser = () => new Promise<void>((r) => setTimeout(r, 0));

export default function MergePage() {
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
      setDocuments((prev) => prev.map((p) => p.id === doc.id ? { ...p, thumbnail: thumb } : p));
    }
  };

  const handleMerge = async () => {
    if (documents.length < 2) {
      toast.error('Pilih minimal 2 file PDF untuk digabungkan.');
      return;
    }

    const totalMB = documents.reduce((s, d) => s + d.file.size, 0) / 1048576;
    if (totalMB > 300)
      toast(`Total file besar (${totalMB.toFixed(0)} MB) — proses mungkin beberapa menit, jangan tutup tab.`, { duration: 8000, icon: '⏳' });

    setIsProcessing(true);
    setDownloadUrl(null);
    setProgress(null);
    try {
      const mergedPdf = await PDFDocument.create();

      for (let di = 0; di < documents.length; di++) {
        const doc = documents[di];
        setProgress({ current: di + 1, total: documents.length, label: `Memuat: ${doc.file.name}` });
        await yieldToBrowser();

        const fileBuffer = await doc.file.arrayBuffer();
        const pdfDoc     = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
        const pageCount  = pdfDoc.getPageCount();

        // Copy page-by-page with periodic yield (prevents UI freeze on large PDFs)
        const indices = pdfDoc.getPageIndices();
        for (let pi = 0; pi < indices.length; pi++) {
          if (pi > 0 && pi % 10 === 0) {
            setProgress({ current: di + 1, total: documents.length, label: `${doc.file.name} — halaman ${pi}/${pageCount}` });
            await yieldToBrowser();
          }
          const [copied] = await mergedPdf.copyPages(pdfDoc, [indices[pi]]);
          mergedPdf.addPage(copied);
        }
      }

      setProgress({ current: documents.length, total: documents.length, label: 'Menyimpan PDF...' });
      await yieldToBrowser();

      const pdfBytes = await mergedPdf.save();
      const blob     = new Blob([pdfBytes as any], { type: 'application/pdf' });
      setDownloadUrl(URL.createObjectURL(blob));
      setDownloadFilename(`Merged_Document_${Date.now()}.pdf`);
      toast.success('Berhasil digabungkan!');
    } catch (e: any) {
      toast.error(e.message || 'Gagal memproses file.');
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight sm:text-5xl">
            Gabungkan PDF
          </h1>
          <p className="mt-4 max-w-2xl text-xl text-slate-500 mx-auto">
            Atur urutan file PDF Anda, lalu gabungkan menjadi satu dokumen. Pemrosesan dilakukan aman di browser Anda tanpa upload!
          </p>
        </div>

        <SortableGrid items={documents} setItems={setDocuments} onAddFiles={handleAddFiles} />

        {documents.length >= 2 && !downloadUrl && (
          <div className="max-w-3xl mx-auto mt-12 bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
            <div className="flex flex-col items-center gap-4">
              {isProcessing && progress && (
                <div className="w-full max-w-md">
                  <div className="flex justify-between text-sm text-slate-500 mb-2">
                    <span className="truncate max-w-xs">{progress.label}</span>
                    <span>{progress.current}/{progress.total}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-3">
                    <div
                      className="bg-orange-500 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
              {isProcessing && !progress && (
                <div className="w-full max-w-md">
                  <div className="w-full bg-slate-200 rounded-full h-3">
                    <div className="bg-orange-500 h-3 rounded-full animate-pulse" style={{ width: '100%' }} />
                  </div>
                </div>
              )}
              <button
                onClick={handleMerge}
                disabled={isProcessing}
                className="w-full sm:w-auto px-12 py-4 bg-orange-500 hover:bg-orange-600 text-white font-bold text-lg rounded-2xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? 'Memproses...' : `Gabungkan ${documents.length} File`}
              </button>
            </div>
          </div>
        )}

        {downloadUrl && (
          <div className="mt-8 max-w-3xl mx-auto p-8 bg-green-50 border border-green-200 rounded-3xl flex flex-col items-center animate-in fade-in zoom-in duration-300">
            <h3 className="text-2xl font-bold text-green-800 mb-3">🎉 Berhasil Digabungkan!</h3>
            <button onClick={() => saveAs(downloadUrl, downloadFilename)}
              className="w-full sm:w-auto px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-bold text-lg rounded-2xl shadow-md transition-all">
              Unduh PDF Gabungan
            </button>
            <button onClick={() => { setDownloadUrl(null); setDocuments([]); }}
              className="mt-4 text-green-700 hover:text-green-900 text-sm underline">
              Gabungkan file lainnya
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
