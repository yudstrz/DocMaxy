'use client';

import React, { useState } from 'react';
import { SortableGrid, PDFDocument as LocalPDFDocument } from '@/components/SortableGrid';
import { generatePDFThumbnail } from '@/utils/pdf';
import { PDFDocument } from 'pdf-lib';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { Settings2, ArrowDownToLine, Zap } from 'lucide-react';
import toast from 'react-hot-toast';

const COMPRESSION_LEVELS = [
  { id: 'extreme', label: 'Ekstrem', desc: 'Ukuran paling kecil, hapus metadata', icon: ArrowDownToLine },
  { id: 'recommended', label: 'Rekomendasi', desc: 'Keseimbangan terbaik', icon: Zap },
  { id: 'less', label: 'Rendah', desc: 'Ukuran lebih besar, kualitas asli', icon: Settings2 },
];

export default function CompressPage() {
  const [documents, setDocuments] = useState<LocalPDFDocument[]>([]);
  const [level, setLevel] = useState('recommended');
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState(0);
  const [compressedSize, setCompressedSize] = useState(0);

  const handleAddFiles = async (files: FileList | File[]) => {
    setDownloadUrl(null);
    const newDocs: LocalPDFDocument[] = Array.from(files).map((file) => ({
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
    setDownloadUrl(null);

    try {
      const totalOriginal = documents.reduce((sum, d) => sum + d.file.size, 0);
      setOriginalSize(totalOriginal);

      const results: { name: string; bytes: Uint8Array }[] = [];

      for (const doc of documents) {
        const fileBuffer = await doc.file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });

        // Extreme: also strip metadata
        if (level === 'extreme') {
          pdfDoc.setTitle('');
          pdfDoc.setAuthor('');
          pdfDoc.setSubject('');
          pdfDoc.setKeywords([]);
          pdfDoc.setProducer('');
          pdfDoc.setCreator('');
        }

        // Save with optimization options
        // pdf-lib always uses useObjectStreams & addDefaultPage=false for smaller output
        const pdfBytes = await pdfDoc.save({
          useObjectStreams: level !== 'less',  // Object streams reduce size
          addDefaultPage: false,
        });

        const baseName = doc.file.name.replace(/\.[^/.]+$/, '');
        results.push({ name: `${baseName}_compressed.pdf`, bytes: pdfBytes });
      }

      const totalCompressed = results.reduce((sum, r) => sum + r.bytes.length, 0);
      setCompressedSize(totalCompressed);

      if (results.length === 1) {
        const blob = new Blob([results[0].bytes as BlobPart], { type: 'application/pdf' });
        setDownloadUrl(URL.createObjectURL(blob));
      } else {
        const zip = new JSZip();
        results.forEach((r) => zip.file(r.name, r.bytes));
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        setDownloadUrl(URL.createObjectURL(zipBlob));
      }
      toast.success('File berhasil dikompres!');
    } catch (e: any) {
      toast.error(e.message || 'Gagal memproses file.');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const reductionPercent = originalSize > 0 ? Math.round((1 - compressedSize / originalSize) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight sm:text-5xl">Kompres PDF</h1>
          <p className="mt-4 max-w-2xl text-xl text-slate-500 mx-auto">
            Perkecil ukuran file PDF sesuai kebutuhan. (100% di perangkat Anda, tanpa upload ke server)
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
                <div className="bg-indigo-500 h-3 rounded-full animate-pulse" style={{ width: '100%' }} />
              </div>
            )}
            <div className="flex justify-center border-t border-slate-100 pt-6">
              <button onClick={handleCompress} disabled={isProcessing}
                className="px-12 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg rounded-2xl shadow-lg transition-all disabled:opacity-50">
                {isProcessing ? 'Memproses di perangkat...' : 'Kompres PDF Sekarang'}
              </button>
            </div>
          </div>
        )}

        {downloadUrl && (
          <div className="mt-8 max-w-3xl mx-auto p-8 bg-green-50 border border-green-200 rounded-3xl flex flex-col items-center">
            <h3 className="text-2xl font-bold text-green-800 mb-3">🎉 Berhasil Dikompres!</h3>
            {originalSize > 0 && (
              <p className="text-green-700 mb-4">
                {formatSize(originalSize)} → {formatSize(compressedSize)} (hemat {reductionPercent}%)
              </p>
            )}
            <button onClick={() => saveAs(downloadUrl, documents.length > 1 ? 'compressed.zip' : 'compressed.pdf')}
              className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-bold text-lg rounded-2xl shadow-md">
              Unduh Hasil
            </button>
            <button onClick={() => { setDownloadUrl(null); setDocuments([]); setOriginalSize(0); setCompressedSize(0); }}
              className="mt-4 text-green-700 text-sm underline">Kompres file lainnya</button>
          </div>
        )}
      </main>
    </div>
  );
}
