'use client';

import React, { useState } from 'react';
import { SortableGrid, PDFDocument as LocalPDFDocument } from '@/components/SortableGrid';
import { generatePDFThumbnail } from '@/utils/pdf';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import toast from 'react-hot-toast';

export default function PdfToWordPage() {
  const [documents, setDocuments] = useState<LocalPDFDocument[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string>('');
  const [resultMode, setResultMode] = useState<'zip' | 'single'>('single');

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

  const handleConvert = async () => {
    if (documents.length === 0) { toast.error('Pilih minimal 1 file PDF.'); return; }
    setIsProcessing(true);
    setDownloadUrl(null);

    try {
      const pdfjsLib = await import('pdfjs-dist');

      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
      }

      const results: { name: string; blob: Blob }[] = [];

      for (const doc of documents) {
        const arrayBuffer = await doc.file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const totalPages = pdf.numPages;

        const sections: any[] = [];

        for (let i = 1; i <= totalPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();

          // Group text items by Y position to form lines
          const lines: { y: number; items: { text: string; fontSize: number; x: number }[] }[] = [];
          const Y_TOLERANCE = 3;

          for (const item of textContent.items) {
            if (!('str' in item) || !item.str.trim()) continue;
            const fontSize = ('transform' in item && Array.isArray(item.transform))
              ? Math.abs(item.transform[0])
              : 12;
            const y = ('transform' in item && Array.isArray(item.transform))
              ? item.transform[5] : 0;
            const x = ('transform' in item && Array.isArray(item.transform))
              ? item.transform[4] : 0;

            const existingLine = lines.find(l => Math.abs(l.y - y) < Y_TOLERANCE);
            if (existingLine) {
              existingLine.items.push({ text: item.str, fontSize, x });
            } else {
              lines.push({ y, items: [{ text: item.str, fontSize, x }] });
            }
          }

          // Sort lines top to bottom (PDF Y is bottom-up)
          lines.sort((a, b) => b.y - a.y);

          // Calculate average font size
          const allFontSizes = lines.flatMap(l => l.items.map(it => it.fontSize));
          const avgFontSize = allFontSizes.length > 0
            ? allFontSizes.reduce((a, b) => a + b, 0) / allFontSizes.length
            : 12;

          const paragraphs: Paragraph[] = [];

          for (const line of lines) {
            line.items.sort((a, b) => a.x - b.x);
            const lineText = line.items.map(t => t.text).join(' ').trim();
            if (!lineText) continue;

            const maxFontSize = Math.max(...line.items.map(t => t.fontSize));
            const fontSizePt = Math.round(maxFontSize);

            let heading: (typeof HeadingLevel)[keyof typeof HeadingLevel] | undefined;
            if (maxFontSize > avgFontSize * 1.6) heading = HeadingLevel.HEADING_1;
            else if (maxFontSize > avgFontSize * 1.3) heading = HeadingLevel.HEADING_2;
            else if (maxFontSize > avgFontSize * 1.1) heading = HeadingLevel.HEADING_3;

            paragraphs.push(
              new Paragraph({
                heading,
                children: [
                  new TextRun({
                    text: lineText,
                    size: fontSizePt * 2, // docx uses half-points
                    bold: heading !== undefined,
                  }),
                ],
              })
            );
          }

          // Add a page break between pages (except the last)
          if (paragraphs.length > 0 && i < totalPages) {
            paragraphs.push(
              new Paragraph({
                children: [],
                pageBreakBefore: true,
              })
            );
          }

          sections.push({ children: paragraphs });
        }

        const docxDoc = new Document({
          sections,
        });

        const docxBlob = await Packer.toBlob(docxDoc);
        const baseName = doc.file.name.replace(/\.[^/.]+$/, '');
        results.push({ name: `${baseName}.docx`, blob: docxBlob });
      }

      if (results.length === 1) {
        setResultMode('single');
        setDownloadUrl(URL.createObjectURL(results[0].blob));
        const originalName = documents[0].file.name.replace(/\.[^/.]+$/, '');
        setDownloadFilename(`${originalName} (Converted).docx`);
      } else {
        const zip = new JSZip();
        for (const r of results) {
          zip.file(r.name, r.blob);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        setResultMode('zip');
        setDownloadUrl(URL.createObjectURL(zipBlob));
        setDownloadFilename(`PDF_to_Word_${Date.now()}.zip`);
      }

      toast.success('Berhasil dikonversi ke Word!');
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
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight sm:text-5xl">PDF ke Word</h1>
          <p className="mt-4 max-w-2xl text-xl text-slate-500 mx-auto">
            Ubah PDF menjadi file Word (.docx) yang bisa diedit. (100% di perangkat Anda)
          </p>
        </div>

        <SortableGrid items={documents} setItems={setDocuments} onAddFiles={handleAddFiles} />

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
                {isProcessing ? 'Memproses di perangkat...' : 'Konversi ke Word'}
              </button>
            </div>
          </div>
        )}

        {downloadUrl && (
          <div className="mt-8 max-w-3xl mx-auto p-8 bg-green-50 border border-green-200 rounded-3xl flex flex-col items-center">
            <h3 className="text-2xl font-bold text-green-800 mb-3">🎉 Berhasil Dikonversi!</h3>
            <button onClick={() => saveAs(downloadUrl, downloadFilename)}
              className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-bold text-lg rounded-2xl shadow-md">
              Unduh Word
            </button>
            <button onClick={() => { setDownloadUrl(null); setDocuments([]); }}
              className="mt-4 text-green-700 text-sm underline">Konversi file lainnya</button>
          </div>
        )}
      </main>
    </div>
  );
}
