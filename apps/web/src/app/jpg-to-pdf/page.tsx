'use client';

import React, { useState } from 'react';
import { SortableGrid, PDFDocument as LocalPDFDocument } from '@/components/SortableGrid';
import { PDFDocument, PageSizes } from 'pdf-lib';
import { saveAs } from 'file-saver';
import toast from 'react-hot-toast';

const PAPER_SIZES: Record<string, { label: string, dims: [number, number] | null }> = {
  'original': { label: 'Original (Sesuai Gambar)', dims: null },
  'a3': { label: 'A3 (297 x 420 mm)', dims: PageSizes.A3 },
  'a4': { label: 'A4 (Standar, 210 x 297 mm)', dims: PageSizes.A4 },
  'a5': { label: 'A5 (148 x 210 mm)', dims: PageSizes.A5 },
  'b4': { label: 'B4 (250 x 353 mm)', dims: PageSizes.B4 },
  'b5': { label: 'B5 (176 x 250 mm)', dims: PageSizes.B5 },
  'letter': { label: 'Letter (US, 8.5 x 11 in)', dims: PageSizes.Letter },
  'legal': { label: 'Legal (US, 8.5 x 14 in)', dims: PageSizes.Legal },
  'tabloid': { label: 'Tabloid (11 x 17 in)', dims: PageSizes.Tabloid },
};

export default function Img2PdfPage() {
  const [documents, setDocuments] = useState<LocalPDFDocument[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
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
    if (documents.length === 0) { toast.error('Pilih minimal 1 gambar.'); return; }
    setIsProcessing(true);
    setDownloadUrl(null);
    try {
      const pdfDoc = await PDFDocument.create();

      for (const doc of documents) {
        const fileBuffer = await doc.file.arrayBuffer();
        let image;
        
        if (doc.file.type === 'image/jpeg' || doc.file.name.toLowerCase().endsWith('.jpg') || doc.file.name.toLowerCase().endsWith('.jpeg')) {
          image = await pdfDoc.embedJpg(fileBuffer);
        } else if (doc.file.type === 'image/png' || doc.file.name.toLowerCase().endsWith('.png')) {
          image = await pdfDoc.embedPng(fileBuffer);
        } else {
          // Fallback or ignore unsupported types
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
          // Scale to fit the page and center
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
        throw new Error("Tidak ada gambar valid yang bisa dikonversi (Hanya JPG/PNG didukung).");
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      setDownloadUrl(URL.createObjectURL(blob));
      toast.success('Berhasil diubah ke PDF!');
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
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight sm:text-5xl">JPG ke PDF</h1>
          <p className="mt-4 max-w-2xl text-xl text-slate-500 mx-auto">
            Ubah banyak gambar JPG/PNG menjadi 1 file PDF yang rapi. (Aman di perangkat Anda)
          </p>
        </div>

        <SortableGrid items={documents} setItems={setDocuments} onAddFiles={handleAddFiles}
          accept="image/jpeg, image/png, .jpg, .jpeg, .png" uploadLabel="Pilih Gambar" />

        {documents.length > 0 && !downloadUrl && (
          <div className="max-w-3xl mx-auto mt-12 bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
            {isProcessing && (
              <div className="w-full bg-slate-200 rounded-full h-3 mb-6">
                <div className="bg-yellow-500 h-3 rounded-full animate-pulse" style={{ width: '100%' }} />
              </div>
            )}
            <div className="flex flex-col items-center justify-center gap-6">
              <div className="flex flex-col items-center w-full max-w-sm">
                <label className="text-sm font-semibold text-slate-700 mb-2">Ukuran Kertas (PDF)</label>
                <select 
                  value={pageSize}
                  onChange={(e) => setPageSize(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-yellow-400 outline-none text-slate-700"
                >
                  {Object.entries(PAPER_SIZES).map(([key, config]) => (
                    <option key={key} value={key}>{config.label}</option>
                  ))}
                </select>
              </div>

              <button onClick={handleConvert} disabled={isProcessing}
                className="px-12 py-4 bg-yellow-500 hover:bg-yellow-600 text-white font-bold text-lg rounded-2xl shadow-lg transition-all disabled:opacity-50">
                {isProcessing ? 'Mengonversi di perangkat...' : 'Ubah ke PDF Sekarang'}
              </button>
            </div>
          </div>
        )}

        {downloadUrl && (
          <div className="mt-8 max-w-3xl mx-auto p-8 bg-green-50 border border-green-200 rounded-3xl flex flex-col items-center">
            <h3 className="text-2xl font-bold text-green-800 mb-3">🎉 Berhasil Dikonversi!</h3>
            <button onClick={() => saveAs(downloadUrl, 'converted.pdf')}
              className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-bold text-lg rounded-2xl shadow-md">
              Unduh PDF Anda
            </button>
            <button onClick={() => { setDownloadUrl(null); setDocuments([]); }}
              className="mt-4 text-green-700 text-sm underline">Ubah gambar lainnya</button>
          </div>
        )}
      </main>
    </div>
  );
}
