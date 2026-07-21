'use client';

import React, { useState, useRef } from 'react';
import { SortableGrid, PDFDocument } from '@/components/SortableGrid';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import toast from 'react-hot-toast';

export default function WordToPdfPage() {
  const [documents, setDocuments] = useState<PDFDocument[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [resultMode, setResultMode] = useState<'zip' | 'single'>('single');
  const renderRef = useRef<HTMLDivElement>(null);

  const handleAddFiles = async (files: FileList | File[]) => {
    setDownloadUrl(null);
    const newDocs: PDFDocument[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(), file, thumbnail: null,
    }));
    setDocuments((prev) => [...prev, ...newDocs]);
  };

  const handleConvert = async () => {
    if (documents.length === 0) { toast.error('Pilih minimal 1 file Word.'); return; }
    setIsProcessing(true);
    setDownloadUrl(null);

    try {
      const mammoth = await import('mammoth');
      const jsPDF = (await import('jspdf')).default;
      const html2canvas = (await import('html2canvas')).default;

      const results: { name: string; blob: Blob }[] = [];

      for (const doc of documents) {
        const arrayBuffer = await doc.file.arrayBuffer();

        // Convert DOCX → HTML using mammoth
        const result = await mammoth.convertToHtml(
          { arrayBuffer },
          {
            styleMap: [
              "p[style-name='Heading 1'] => h1:fresh",
              "p[style-name='Heading 2'] => h2:fresh",
              "p[style-name='Heading 3'] => h3:fresh",
            ],
          }
        );
        const html = result.value;

        // Create a hidden container with the HTML content
        const container = document.createElement('div');
        container.innerHTML = html;
        container.style.cssText = `
          position: fixed; left: -9999px; top: 0;
          width: 794px; padding: 40px;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          font-size: 12pt; line-height: 1.6; color: #000;
          background: #fff;
        `;

        // Style tables
        const styleTag = document.createElement('style');
        styleTag.textContent = `
          table { width: 100%; border-collapse: collapse; margin: 12px 0; }
          td, th { border: 1px solid #333; padding: 6px 8px; }
          h1 { font-size: 24pt; margin: 16px 0 8px; }
          h2 { font-size: 18pt; margin: 14px 0 6px; }
          h3 { font-size: 14pt; margin: 12px 0 4px; }
          p { margin: 4px 0; }
          img { max-width: 100%; }
        `;
        container.prepend(styleTag);
        document.body.appendChild(container);

        try {
          // Render HTML to canvas
          const canvas = await html2canvas(container, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
          });

          // Create PDF from canvas
          const imgWidth = 210; // A4 width in mm
          const pageHeight = 297; // A4 height in mm
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          const pdf = new jsPDF('p', 'mm', 'a4');

          let position = 0;
          let remainingHeight = imgHeight;

          // Handle multi-page content
          while (remainingHeight > 0) {
            if (position > 0) pdf.addPage();

            pdf.addImage(
              canvas.toDataURL('image/jpeg', 0.95),
              'JPEG',
              0,
              -position,
              imgWidth,
              imgHeight
            );

            remainingHeight -= pageHeight;
            position += pageHeight;
          }

          const pdfBlob = pdf.output('blob');
          const baseName = doc.file.name.replace(/\.[^/.]+$/, '');
          results.push({ name: `${baseName}.pdf`, blob: pdfBlob });
        } finally {
          document.body.removeChild(container);
        }
      }

      if (results.length === 1) {
        setResultMode('single');
        setDownloadUrl(URL.createObjectURL(results[0].blob));
      } else {
        const zip = new JSZip();
        for (const r of results) {
          zip.file(r.name, r.blob);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        setResultMode('zip');
        setDownloadUrl(URL.createObjectURL(zipBlob));
      }

      toast.success('Berhasil dikonversi ke PDF!');
    } catch (e: any) {
      toast.error(e.message || 'Gagal memproses file.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div ref={renderRef} />
      <main className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight sm:text-5xl">Word ke PDF</h1>
          <p className="mt-4 max-w-2xl text-xl text-slate-500 mx-auto">
            Ubah dokumen Word (.docx) menjadi PDF. (100% di perangkat Anda)
          </p>
        </div>

        <SortableGrid items={documents} setItems={setDocuments} onAddFiles={handleAddFiles}
          accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
          uploadLabel="Pilih File Word" />

        {documents.length > 0 && !downloadUrl && (
          <div className="max-w-3xl mx-auto mt-12 bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
            {isProcessing && (
              <div className="w-full bg-slate-200 rounded-full h-3 mb-6">
                <div className="bg-blue-500 h-3 rounded-full animate-pulse" style={{ width: '100%' }} />
              </div>
            )}
            <div className="flex justify-center">
              <button onClick={handleConvert} disabled={isProcessing}
                className="px-12 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg rounded-2xl shadow-lg transition-all disabled:opacity-50">
                {isProcessing ? 'Memproses di perangkat...' : 'Konversi ke PDF'}
              </button>
            </div>
          </div>
        )}

        {downloadUrl && (
          <div className="mt-8 max-w-3xl mx-auto p-8 bg-green-50 border border-green-200 rounded-3xl flex flex-col items-center">
            <h3 className="text-2xl font-bold text-green-800 mb-3">🎉 Berhasil Dikonversi!</h3>
            <button onClick={() => saveAs(downloadUrl, resultMode === 'zip' ? 'converted_pdfs.zip' : 'converted.pdf')}
              className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-bold text-lg rounded-2xl shadow-md">
              Unduh PDF
            </button>
            <button onClick={() => { setDownloadUrl(null); setDocuments([]); }}
              className="mt-4 text-green-700 text-sm underline">Konversi file lainnya</button>
          </div>
        )}
      </main>
    </div>
  );
}
