'use client';

import React, { useState } from 'react';
import { SortableGrid, PDFDocument } from '@/components/SortableGrid';
import { generatePDFThumbnail } from '@/utils/pdf';
import { convertPdfToMarkdown } from '@/utils/pdfToMarkdown';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import toast from 'react-hot-toast';

export default function PdfToMarkdownPage() {
  const [documents, setDocuments] = useState<PDFDocument[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [resultMode, setResultMode] = useState<'zip' | 'single'>('single');
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const handleAddFiles = async (files: FileList | File[]) => {
    setDownloadUrl(null);
    const newDocs: PDFDocument[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(), file, thumbnail: null,
    }));
    setDocuments((prev) => [...prev, ...newDocs]);
    for (const doc of newDocs) {
      const thumb = await generatePDFThumbnail(doc.file).catch(() => null);
      setDocuments((prev) => prev.map((p) => p.id === doc.id ? { ...p, thumbnail: thumb } : p));
    }
  };

  const handleConvert = async () => {
    if (documents.length === 0) { toast.error('Pilih minimal 1 file PDF.'); return; }
    setIsProcessing(true);
    setDownloadUrl(null);
    setProgress({ current: 0, total: 0 });

    try {
      const results: { name: string; content: string }[] = [];

      for (const doc of documents) {
        const markdown = await convertPdfToMarkdown(
          doc.file,
          (current, total) => setProgress({ current, total })
        );
        const baseName = doc.file.name.replace(/\.[^/.]+$/, '');
        results.push({ name: `${baseName}.md`, content: markdown });
      }

      if (results.length === 1) {
        const blob = new Blob([results[0].content], { type: 'text/markdown;charset=utf-8' });
        setResultMode('single');
        setDownloadUrl(URL.createObjectURL(blob));
      } else {
        const zip = new JSZip();
        for (const r of results) {
          zip.file(r.name, r.content);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        setResultMode('zip');
        setDownloadUrl(URL.createObjectURL(zipBlob));
      }

      toast.success('Berhasil dikonversi ke Markdown!');
    } catch (e: any) {
      toast.error(e.message || 'Gagal memproses file.');
    } finally {
      setIsProcessing(false);
    }
  };

  const progressPercent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight sm:text-5xl">PDF ke Markdown</h1>
          <p className="mt-4 max-w-2xl text-xl text-slate-500 mx-auto">
            Ekstrak teks dan struktur dari PDF menjadi format Markdown (.md). (100% di perangkat Anda)
          </p>
        </div>

        <SortableGrid items={documents} setItems={setDocuments} onAddFiles={handleAddFiles} />

        {documents.length > 0 && !downloadUrl && (
          <div className="max-w-3xl mx-auto mt-12 bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
            {isProcessing && (
              <div className="w-full">
                <div className="w-full bg-slate-200 rounded-full h-3 mb-2">
                  <div className="bg-emerald-500 h-3 rounded-full transition-all" style={{ width: `${progressPercent}%` }} />
                </div>
                <p className="text-center text-sm text-slate-500">
                  Halaman {progress.current} / {progress.total}
                </p>
              </div>
            )}
            <div className="flex justify-center mt-4">
              <button onClick={handleConvert} disabled={isProcessing}
                className="px-12 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg rounded-2xl shadow-lg transition-all disabled:opacity-50">
                {isProcessing ? 'Memproses di perangkat...' : 'Ubah ke Markdown Sekarang'}
              </button>
            </div>
          </div>
        )}

        {downloadUrl && (
          <div className="mt-8 max-w-3xl mx-auto p-8 bg-green-50 border border-green-200 rounded-3xl flex flex-col items-center">
            <h3 className="text-2xl font-bold text-green-800 mb-3">🎉 Berhasil Dikonversi!</h3>
            <button onClick={() => saveAs(downloadUrl, resultMode === 'zip' ? 'pdf_to_md.zip' : documents[0].file.name.replace(/\.[^/.]+$/, '.md'))}
              className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-bold text-lg rounded-2xl shadow-md">
              Unduh Hasil Markdown
            </button>
            <button onClick={() => { setDownloadUrl(null); setDocuments([]); }}
              className="mt-4 text-green-700 text-sm underline">Konversi file lainnya</button>
          </div>
        )}
      </main>
    </div>
  );
}
