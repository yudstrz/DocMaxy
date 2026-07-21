'use client';

import React, { useState } from 'react';
import { SortableGrid, PDFDocument as LocalPDFDocument } from '@/components/SortableGrid';
import { generatePDFThumbnail } from '@/utils/pdf';
import { PDFDocument, rgb } from 'pdf-lib';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// Helper to convert hex to RGB 0-1
function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  } : { r: 0, g: 0, b: 0 };
}

export default function EditPdfPage() {
  const [documents, setDocuments] = useState<LocalPDFDocument[]>([]);
  const [text, setText] = useState('');
  const [xPos, setXPos] = useState(100);
  const [yPos, setYPos] = useState(100);
  const [fontSize, setFontSize] = useState(24);
  const [color, setColor] = useState('#000000');
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [resultMode, setResultMode] = useState<'zip' | 'single'>('zip');

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

  const handleEdit = async () => {
    if (documents.length === 0) { alert('Pilih minimal 1 file PDF.'); return; }
    if (!text) { alert('Masukkan teks anotasi.'); return; }
    setIsProcessing(true);
    setDownloadUrl(null);
    try {
      const results: { name: string, bytes: Uint8Array }[] = [];
      const textColor = hexToRgb(color);

      for (const doc of documents) {
        const fileBuffer = await doc.file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(fileBuffer);
        const pages = pdfDoc.getPages();
        
        for (const page of pages) {
          page.drawText(text, {
            x: xPos,
            y: yPos,
            size: fontSize,
            color: rgb(textColor.r, textColor.g, textColor.b),
          });
        }
        
        const pdfBytes = await pdfDoc.save();
        const baseName = doc.file.name.replace(/\.[^/.]+$/, "");
        results.push({ name: `${baseName}_edited.pdf`, bytes: pdfBytes });
      }

      if (results.length === 1) {
        const blob = new Blob([results[0].bytes as any], { type: 'application/pdf' });
        setResultMode('single');
        setDownloadUrl(URL.createObjectURL(blob));
      } else {
        const zip = new JSZip();
        results.forEach((res) => zip.file(res.name, res.bytes));
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        setResultMode('zip');
        setDownloadUrl(URL.createObjectURL(zipBlob));
      }
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
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight sm:text-5xl">Edit PDF</h1>
          <p className="mt-4 max-w-2xl text-xl text-slate-500 mx-auto">
            Tambahkan teks/watermark pada dokumen PDF Anda. (Aman di perangkat Anda)
          </p>
        </div>

        <SortableGrid items={documents} setItems={setDocuments} onAddFiles={handleAddFiles} />

        {documents.length > 0 && !downloadUrl && (
          <div className="max-w-4xl mx-auto mt-12 bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Teks yang ditambahkan</label>
                <input type="text" value={text} onChange={e => setText(e.target.value)}
                  placeholder="Contoh: DOKUMEN RAHASIA"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-purple-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Warna Teks</label>
                <div className="flex gap-4 items-center">
                  <input type="color" value={color} onChange={e => setColor(e.target.value)}
                    className="h-12 w-12 rounded-lg cursor-pointer" />
                  <span className="text-slate-500">{color}</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Ukuran Font: {fontSize}px</label>
                <input type="range" min="10" max="120" value={fontSize} onChange={e => setFontSize(parseInt(e.target.value))} className="w-full" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Posisi X</label>
                  <input type="number" value={xPos} onChange={e => setXPos(parseInt(e.target.value))}
                    className="w-full px-4 py-2 rounded-xl border border-slate-300" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Posisi Y</label>
                  <input type="number" value={yPos} onChange={e => setYPos(parseInt(e.target.value))}
                    className="w-full px-4 py-2 rounded-xl border border-slate-300" />
                </div>
              </div>
            </div>

            {isProcessing && (
              <div className="w-full bg-slate-200 rounded-full h-3 mb-6">
                <div className="bg-purple-500 h-3 rounded-full animate-pulse" style={{ width: '100%' }} />
              </div>
            )}
            <div className="flex justify-center border-t border-slate-100 pt-6">
              <button onClick={handleEdit} disabled={isProcessing || !text}
                className="px-12 py-4 bg-purple-600 hover:bg-purple-700 text-white font-bold text-lg rounded-2xl shadow-lg transition-all disabled:opacity-50">
                {isProcessing ? 'Menambahkan Teks...' : 'Terapkan ke PDF'}
              </button>
            </div>
          </div>
        )}

        {downloadUrl && (
          <div className="mt-8 max-w-3xl mx-auto p-8 bg-green-50 border border-green-200 rounded-3xl flex flex-col items-center">
            <h3 className="text-2xl font-bold text-green-800 mb-3">🎉 PDF Berhasil Diedit!</h3>
            <button onClick={() => saveAs(downloadUrl, resultMode === 'zip' ? 'edited_pdfs.zip' : documents[0].file.name.replace(/\.[^/.]+$/, "_edited.pdf"))}
              className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-bold text-lg rounded-2xl shadow-md">
              Unduh Hasil PDF
            </button>
            <button onClick={() => { setDownloadUrl(null); setDocuments([]); }}
              className="mt-4 text-green-700 text-sm underline">Edit file lainnya</button>
          </div>
        )}
      </main>
    </div>
  );
}
