'use client';

import React, { useState } from 'react';
import { SortableGrid, PDFDocument } from '@/components/SortableGrid';
import { generatePDFThumbnail } from '@/utils/pdf';
import { Settings2, ArrowDownToLine, Zap } from 'lucide-react';
import toast from 'react-hot-toast';

const COMPRESSION_LEVELS = [
  { id: 'extreme', label: 'Ekstrem', desc: 'Ukuran paling kecil, kualitas lebih rendah', icon: ArrowDownToLine },
  { id: 'recommended', label: 'Rekomendasi', desc: 'Keseimbangan terbaik', icon: Zap },
  { id: 'less', label: 'Rendah', desc: 'Ukuran lebih besar, kualitas asli', icon: Settings2 },
];

export default function CompressPage() {
  const [documents, setDocuments] = useState<PDFDocument[]>([]);
  const [level, setLevel] = useState('recommended');
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

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

  const handleCompress = async () => {
    if (documents.length === 0) { toast.error('Pilih minimal 1 file PDF.'); return; }
    setIsProcessing(true);
    setProgress(0);
    setDownloadUrl(null);
    try {
      const formData = new FormData();
      documents.forEach((doc) => formData.append('files', doc.file));
      formData.append('level', level);

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
        xhr.open('POST', '/api/compress');
        xhr.send(formData);
      });
      setDownloadUrl(URL.createObjectURL(blob));
      toast.success('File berhasil dikompres!');
    } catch (e: any) {
      toast.error(e.message || 'Gagal memproses file.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight sm:text-5xl">Kompres PDF</h1>
          <p className="mt-4 max-w-2xl text-xl text-slate-500 mx-auto">
            Perkecil ukuran file PDF sesuai dengan kebutuhan Anda.
          </p>
        </div>

        <SortableGrid items={documents} setItems={setDocuments} onAddFiles={handleAddFiles} />

        {documents.length > 0 && !downloadUrl && (
          <div className="max-w-4xl mx-auto mt-12 bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
            <h3 className="text-xl font-bold text-slate-800 mb-6 text-center">Tingkat Kompresi</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {COMPRESSION_LEVELS.map((lvl) => (
                <button key={lvl.id} onClick={() => setLevel(lvl.id)}
                  className={`p-6 rounded-2xl border-2 text-left transition-all ${level === lvl.id ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}>
                  <lvl.icon className={`w-8 h-8 mb-4 ${level === lvl.id ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <h4 className={`font-bold text-lg mb-1 ${level === lvl.id ? 'text-indigo-900' : 'text-slate-700'}`}>{lvl.label}</h4>
                  <p className="text-sm text-slate-500">{lvl.desc}</p>
                </button>
              ))}
            </div>

            {isProcessing && (
              <div className="w-full bg-slate-200 rounded-full h-3 mb-6">
                <div className="bg-indigo-500 h-3 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
            <div className="flex justify-center border-t border-slate-100 pt-6">
              <button onClick={handleCompress} disabled={isProcessing}
                className="px-12 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg rounded-2xl shadow-lg transition-all disabled:opacity-50">
                {isProcessing ? 'Mengunggah & Memproses...' : 'Kompres PDF Sekarang'}
              </button>
            </div>
          </div>
        )}

        {downloadUrl && (
          <div className="mt-8 max-w-3xl mx-auto p-8 bg-green-50 border border-green-200 rounded-3xl flex flex-col items-center">
            <h3 className="text-2xl font-bold text-green-800 mb-3">🎉 Berhasil Dikompres!</h3>
            <a href={downloadUrl} download={documents.length > 1 ? 'compressed.zip' : 'compressed.pdf'}
              className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-bold text-lg rounded-2xl shadow-md">
              Unduh Hasil
            </a>
            <button onClick={() => { setDownloadUrl(null); setDocuments([]); }}
              className="mt-4 text-green-700 text-sm underline">Kompres file lainnya</button>
          </div>
        )}
      </main>
    </div>
  );
}
