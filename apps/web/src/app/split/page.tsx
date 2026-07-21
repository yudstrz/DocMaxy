'use client';

import React, { useState } from 'react';
import { SortableGrid, PDFDocument } from '@/components/SortableGrid';
import { generatePDFThumbnail } from '@/utils/pdf';

export default function SplitPage() {
  const [documents, setDocuments] = useState<PDFDocument[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<'all' | 'extract'>('all');
  const [pages, setPages] = useState('');
  const [progress, setProgress] = useState(0);

  const handleAddFiles = async (files: FileList | File[]) => {
    setDownloadUrl(null);
    const newDocs: PDFDocument[] = Array.from(files).slice(0, 1).map((file) => ({
      id: crypto.randomUUID(), file, thumbnail: null,
    }));
    setDocuments(newDocs);
    for (const doc of newDocs) {
      const thumb = await generatePDFThumbnail(doc.file).catch(() => null);
      setDocuments((prev) => prev.map((p) => p.id === doc.id ? { ...p, thumbnail: thumb } : p));
    }
  };

  const handleSplit = async () => {
    if (documents.length === 0) { alert('Pilih file PDF.'); return; }

    setIsProcessing(true);
    setProgress(0);
    setDownloadUrl(null);
    try {
      const formData = new FormData();
      formData.append('file', documents[0].file);
      formData.append('mode', mode);
      if (mode === 'extract') formData.append('pages', pages);

      const xhr = new XMLHttpRequest();
      const blob = await new Promise<Blob>((resolve, reject) => {
        xhr.responseType = 'blob';
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response as Blob);
          else reject(new Error(`Server error ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.open('POST', '/api/split');
        xhr.send(formData);
      });

      setDownloadUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      alert(e.message || 'Gagal memproses file.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight sm:text-5xl">Pisahkan PDF</h1>
          <p className="mt-4 max-w-2xl text-xl text-slate-500 mx-auto">
            Pisahkan satu halaman atau semuanya menjadi file PDF terpisah.
          </p>
        </div>

        <SortableGrid items={documents} setItems={setDocuments} onAddFiles={handleAddFiles} />

        {documents.length > 0 && !downloadUrl && (
          <div className="max-w-3xl mx-auto mt-12 bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
            <div className="flex gap-4 mb-6">
              {(['all', 'extract'] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`flex-1 py-3 rounded-xl font-semibold transition-all ${mode === m ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {m === 'all' ? 'Pisahkan Semua Halaman' : 'Ekstrak Halaman Tertentu'}
                </button>
              ))}
            </div>
            {mode === 'extract' && (
              <input type="text" value={pages} onChange={(e) => setPages(e.target.value)}
                placeholder="Contoh: 1, 3, 5"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 mb-6 focus:ring-2 focus:ring-orange-400 outline-none" />
            )}
            {isProcessing && (
              <div className="w-full bg-slate-200 rounded-full h-3 mb-4">
                <div className="bg-orange-500 h-3 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
            <div className="flex justify-center">
              <button onClick={handleSplit} disabled={isProcessing}
                className="px-12 py-4 bg-orange-500 hover:bg-orange-600 text-white font-bold text-lg rounded-2xl shadow-lg transition-all disabled:opacity-50">
                {isProcessing ? 'Memproses...' : 'Pisahkan PDF'}
              </button>
            </div>
          </div>
        )}

        {downloadUrl && (
          <div className="mt-8 max-w-3xl mx-auto p-8 bg-green-50 border border-green-200 rounded-3xl flex flex-col items-center">
            <h3 className="text-2xl font-bold text-green-800 mb-3">🎉 Berhasil Dipisahkan!</h3>
            <a href={downloadUrl} download={mode === 'all' ? 'split_pages.zip' : 'extracted.pdf'}
              className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-bold text-lg rounded-2xl shadow-md">
              Unduh Hasil
            </a>
            <button onClick={() => { setDownloadUrl(null); setDocuments([]); }}
              className="mt-4 text-green-700 text-sm underline">Pisahkan file lainnya</button>
          </div>
        )}
      </main>
    </div>
  );
}
