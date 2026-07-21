'use client';

import React, { useState } from 'react';
import { SortableGrid, PDFDocument } from '@/components/SortableGrid';
import { generatePDFThumbnail } from '@/utils/pdf';

const ANGLES = [
  { label: '↺ 90° Kiri', value: 270 },
  { label: '↻ 90° Kanan', value: 90 },
  { label: '↕ 180°', value: 180 },
];

export default function RotatePage() {
  const [documents, setDocuments] = useState<PDFDocument[]>([]);
  const [angle, setAngle] = useState(90);
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

  const handleRotate = async () => {
    if (documents.length === 0) { alert('Pilih minimal 1 file PDF.'); return; }
    setIsProcessing(true);
    setProgress(0);
    setDownloadUrl(null);
    try {
      const formData = new FormData();
      documents.forEach((doc) => formData.append('files', doc.file));
      formData.append('angle', String(angle));

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
        xhr.open('POST', '/api/rotate');
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
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight sm:text-5xl">Putar PDF</h1>
          <p className="mt-4 max-w-2xl text-xl text-slate-500 mx-auto">
            Putar satu atau banyak PDF sekaligus sesuai kebutuhan.
          </p>
        </div>

        <SortableGrid items={documents} setItems={setDocuments} onAddFiles={handleAddFiles} />

        {documents.length > 0 && !downloadUrl && (
          <div className="max-w-3xl mx-auto mt-12 bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
            <p className="text-center font-semibold text-slate-700 mb-4">Pilih Arah Rotasi</p>
            <div className="flex gap-4 justify-center mb-6">
              {ANGLES.map((a) => (
                <button key={a.value} onClick={() => setAngle(a.value)}
                  className={`px-6 py-3 rounded-xl font-semibold transition-all ${angle === a.value ? 'bg-purple-600 text-white shadow-lg' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {a.label}
                </button>
              ))}
            </div>
            {isProcessing && (
              <div className="w-full bg-slate-200 rounded-full h-3 mb-4">
                <div className="bg-purple-500 h-3 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
            <div className="flex justify-center">
              <button onClick={handleRotate} disabled={isProcessing}
                className="px-12 py-4 bg-purple-600 hover:bg-purple-700 text-white font-bold text-lg rounded-2xl shadow-lg transition-all disabled:opacity-50">
                {isProcessing ? 'Memproses...' : 'Putar PDF'}
              </button>
            </div>
          </div>
        )}

        {downloadUrl && (
          <div className="mt-8 max-w-3xl mx-auto p-8 bg-green-50 border border-green-200 rounded-3xl flex flex-col items-center">
            <h3 className="text-2xl font-bold text-green-800 mb-3">🎉 Berhasil Diputar!</h3>
            <a href={downloadUrl} download={documents.length > 1 ? 'rotated.zip' : 'rotated.pdf'}
              className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-bold text-lg rounded-2xl shadow-md">
              Unduh Hasil
            </a>
            <button onClick={() => { setDownloadUrl(null); setDocuments([]); }}
              className="mt-4 text-green-700 text-sm underline">Putar file lainnya</button>
          </div>
        )}
      </main>
    </div>
  );
}
