'use client';

import React, { useState } from 'react';
import { SortableGrid, PDFDocument as LocalPDFDocument } from '@/components/SortableGrid';
import { generatePDFThumbnail } from '@/utils/pdf';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType,
} from 'docx';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import toast from 'react-hot-toast';

// ── Table detection config ─────────────────────────────────────────────────────
const Y_TOLERANCE     = 3;    // pts — items within this Y range = same line
const COL_GAP_RATIO   = 0.05; // min gap / page width to consider a new column
const CLUSTER_TOL     = 18;   // pts — x positions within this = same column
const MIN_TABLE_ROWS  = 2;    // minimum rows to treat as a real table

// ── Types ─────────────────────────────────────────────────────────────────────
interface RawItem {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  textWidth: number; // actual rendered width in PDF pts
}

interface TextLine {
  y: number;
  items: RawItem[];
  avgFontSize: number;
}

interface TextRegion  { kind: 'text';  text: string; fontSize: number }
interface TableRegion { kind: 'table'; rows: string[][]; firstRowHeader: boolean }
type Region = TextRegion | TableRegion;

// ── Column cluster detection ──────────────────────────────────────────────────
/** Merge nearby X positions into column anchors. */
function clusterXPositions(xValues: number[]): number[] {
  if (!xValues.length) return [];
  const sorted = [...xValues].sort((a, b) => a - b);
  const clusters: number[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - clusters[clusters.length - 1] > CLUSTER_TOL) {
      clusters.push(sorted[i]);
    }
  }
  return clusters;
}

/** True if this line has items in 2+ distinct columns (gap > threshold). */
function isTableCandidate(line: TextLine, pageWidth: number): boolean {
  if (line.items.length < 2) return false;
  const threshold = pageWidth * COL_GAP_RATIO;
  const sorted = [...line.items].sort((a, b) => a.x - b.x);
  for (let i = 1; i < sorted.length; i++) {
    const prevRight = sorted[i - 1].x + sorted[i - 1].textWidth;
    if (sorted[i].x - prevRight > threshold) return true;
  }
  return false;
}

/** Assign items in a line to their nearest column cluster. */
function buildTableRow(items: RawItem[], columns: number[]): string[] {
  const cells = new Array<string>(columns.length).fill('');
  for (const item of items) {
    let bestIdx = 0, bestDist = Math.abs(item.x - columns[0]);
    for (let i = 1; i < columns.length; i++) {
      const d = Math.abs(item.x - columns[i]);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    cells[bestIdx] = cells[bestIdx] ? `${cells[bestIdx]} ${item.text}` : item.text;
  }
  return cells;
}

/** Detect table regions in a page's lines. Non-table lines become TextRegion. */
function detectRegions(lines: TextLine[], pageWidth: number): Region[] {
  const regions: Region[] = [];
  const flags = lines.map(l => isTableCandidate(l, pageWidth));
  let i = 0;

  while (i < lines.length) {
    if (!flags[i]) {
      const text = lines[i].items.sort((a, b) => a.x - b.x).map(it => it.text).join(' ').trim();
      if (text) regions.push({ kind: 'text', text, fontSize: lines[i].avgFontSize });
      i++;
      continue;
    }

    // Find table run extent
    let j = i;
    while (j < lines.length && flags[j]) j++;

    if (j - i < MIN_TABLE_ROWS) {
      // Too short — treat as plain text
      for (let k = i; k < j; k++) {
        const text = lines[k].items.sort((a, b) => a.x - b.x).map(it => it.text).join(' ').trim();
        if (text) regions.push({ kind: 'text', text, fontSize: lines[k].avgFontSize });
      }
      i = j;
      continue;
    }

    // Build table
    const tableLines = lines.slice(i, j);
    const allXs = tableLines.flatMap(l => l.items.map(it => it.x));
    const columns = clusterXPositions(allXs);
    const rows = tableLines.map(l => buildTableRow(l.items, columns));

    // Heuristic: first row is header if cells are short / all-caps
    const firstRow = rows[0];
    const firstRowHeader = firstRow.length > 0 && firstRow.every(c =>
      c.length > 0 && (c === c.toUpperCase() || c.length < 30)
    );

    regions.push({ kind: 'table', rows, firstRowHeader });
    i = j;
  }

  return regions;
}

// ── Region → docx element ─────────────────────────────────────────────────────
function regionToDocx(region: Region, globalAvgFs: number): (Paragraph | Table)[] {
  if (region.kind === 'text') {
    const fs = region.fontSize;
    let heading: (typeof HeadingLevel)[keyof typeof HeadingLevel] | undefined;
    if (fs > globalAvgFs * 1.6)      heading = HeadingLevel.HEADING_1;
    else if (fs > globalAvgFs * 1.3) heading = HeadingLevel.HEADING_2;
    else if (fs > globalAvgFs * 1.1) heading = HeadingLevel.HEADING_3;

    return [new Paragraph({
      heading,
      children: [new TextRun({
        text: region.text,
        size: Math.round(fs) * 2,
        bold: heading !== undefined,
      })],
    })];
  }

  // ── Build docx Table ────────────────────────────────────────────────────────
  const colCount = Math.max(...region.rows.map(r => r.length), 1);
  const colWidthPct = Math.floor(100 / colCount);

  const docxRows = region.rows.map((row, ri) =>
    new TableRow({
      tableHeader: ri === 0 && region.firstRowHeader,
      children: Array.from({ length: colCount }, (_, ci) =>
        new TableCell({
          width: { size: colWidthPct, type: WidthType.PERCENTAGE },
          children: [new Paragraph({
            children: [new TextRun({
              text: (row[ci] ?? '').trim(),
              bold: ri === 0 && region.firstRowHeader,
              size: 20, // 10pt
            })],
          })],
        })
      ),
    })
  );

  return [
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: docxRows }),
    new Paragraph({ children: [] }), // space after table
  ];
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PdfToWordPage() {
  const [documents, setDocuments] = useState<LocalPDFDocument[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress]   = useState<{ page: number; total: number } | null>(null);
  const [downloadUrl, setDownloadUrl]     = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string>('');

  const handleAddFiles = async (files: FileList | File[]) => {
    setDownloadUrl(null);
    const newDocs: LocalPDFDocument[] = Array.from(files).map(file => ({
      id: crypto.randomUUID(), file, thumbnail: null,
    }));
    setDocuments(prev => [...prev, ...newDocs]);
    for (const doc of newDocs) {
      const thumb = await generatePDFThumbnail(doc.file).catch(() => null);
      setDocuments(prev => prev.map(p => p.id === doc.id ? { ...p, thumbnail: thumb } : p));
    }
  };

  const handleConvert = async () => {
    if (documents.length === 0) { toast.error('Pilih minimal 1 file PDF.'); return; }
    setIsProcessing(true);
    setDownloadUrl(null);
    setProgress(null);

    try {
      const pdfjsLib = await import('pdfjs-dist');
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
      }

      const results: { name: string; blob: Blob }[] = [];

      for (const doc of documents) {
        const arrayBuffer = await doc.file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const totalPages = pdf.numPages;

        const allDocxElements: (Paragraph | Table)[] = [];
        const allFontSizes: number[] = [];

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
          setProgress({ page: pageNum, total: totalPages });
          await new Promise<void>(r => setTimeout(r, 0)); // yield

          const page = await pdf.getPage(pageNum);
          const viewport  = page.getViewport({ scale: 1.0 });
          const pageWidth = viewport.width;
          const textContent = await page.getTextContent();

          // ── 1. Collect raw text items ─────────────────────────────────────
          const rawItems: RawItem[] = [];
          for (const item of textContent.items) {
            if (!('str' in item) || !(item as any).str.trim()) continue;
            const it   = item as any;
            const fs   = Array.isArray(it.transform) ? Math.abs(it.transform[0]) : 12;
            const x    = Array.isArray(it.transform) ? it.transform[4] : 0;
            const y    = Array.isArray(it.transform) ? it.transform[5] : 0;
            // Use actual rendered width from pdfjs (most reliable for gap detection)
            const tw   = typeof it.width === 'number' ? it.width : it.str.length * fs * 0.5;

            rawItems.push({ text: it.str, x, y, fontSize: fs, textWidth: tw });
            allFontSizes.push(fs);
          }

          // ── 2. Group into lines by Y ──────────────────────────────────────
          const lineMap = new Map<number, RawItem[]>();
          for (const item of rawItems) {
            let foundY: number | null = null;
            for (const [ly] of lineMap) {
              if (Math.abs(ly - item.y) < Y_TOLERANCE) { foundY = ly; break; }
            }
            if (foundY !== null) lineMap.get(foundY)!.push(item);
            else                 lineMap.set(item.y, [item]);
          }

          // Sort top-to-bottom (PDF Y is bottom-up → descending)
          const lines: TextLine[] = Array.from(lineMap.entries())
            .sort(([ya], [yb]) => yb - ya)
            .map(([y, items]) => ({
              y,
              items: items.sort((a, b) => a.x - b.x),
              avgFontSize: items.reduce((s, it) => s + it.fontSize, 0) / items.length,
            }));

          // ── 3. Detect table vs text regions ──────────────────────────────
          const pageAvgFs = allFontSizes.length
            ? allFontSizes.reduce((a, b) => a + b, 0) / allFontSizes.length
            : 12;

          const regions = detectRegions(lines, pageWidth);

          for (const region of regions) {
            allDocxElements.push(...regionToDocx(region, pageAvgFs));
          }

          // Page break between PDF pages (except last)
          if (pageNum < totalPages) {
            allDocxElements.push(new Paragraph({ pageBreakBefore: true, children: [] }));
          }
        }

        // ── 4. Build DOCX document ──────────────────────────────────────────
        const docxDoc = new Document({ sections: [{ children: allDocxElements }] });
        const blob = await Packer.toBlob(docxDoc);
        const baseName = doc.file.name.replace(/\.[^/.]+$/, '');
        results.push({ name: `${baseName}.docx`, blob });
      }

      if (results.length === 1) {
        setDownloadUrl(URL.createObjectURL(results[0].blob));
        setDownloadFilename(`${documents[0].file.name.replace(/\.[^/.]+$/, '')} (Converted).docx`);
      } else {
        const zip = new JSZip();
        results.forEach(r => zip.file(r.name, r.blob));
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        setDownloadUrl(URL.createObjectURL(zipBlob));
        setDownloadFilename(`PDF_to_Word_${Date.now()}.zip`);
      }

      toast.success('Berhasil dikonversi ke Word!');
    } catch (e: any) {
      toast.error(e.message || 'Gagal memproses file.');
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  const progressPct = progress ? Math.round((progress.page / progress.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight sm:text-5xl">PDF ke Word</h1>
          <p className="mt-4 max-w-2xl text-xl text-slate-500 mx-auto">
            Ubah PDF menjadi file Word (.docx) yang bisa diedit. Teks, heading, dan tabel terdeteksi otomatis.
            (100% di perangkat Anda)
          </p>
        </div>

        <SortableGrid items={documents} setItems={setDocuments} onAddFiles={handleAddFiles} />

        {documents.length > 0 && !downloadUrl && (
          <div className="max-w-3xl mx-auto mt-12 bg-white p-8 rounded-3xl shadow-sm border border-slate-200">

            {/* Info */}
            {!isProcessing && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700 space-y-1">
                <p><strong>✅ Tabel terdeteksi otomatis</strong> — kolom yang sejajar di PDF akan dikonversi ke tabel Word.</p>
                <p><strong>✅ Heading terdeteksi</strong> — teks dengan ukuran font lebih besar jadi H1/H2/H3.</p>
                <p className="text-blue-500">⚠️ PDF berbasis gambar (scan) tidak bisa diekstrak teksnya.</p>
              </div>
            )}

            {/* Progress */}
            {isProcessing && progress && (
              <div className="mb-6">
                <div className="flex justify-between text-sm text-slate-500 mb-2">
                  <span>Memproses halaman {progress.page} dari {progress.total}...</span>
                  <span>{progressPct}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-3">
                  <div
                    className="bg-blue-500 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}
            {isProcessing && !progress && (
              <div className="w-full bg-slate-200 rounded-full h-3 mb-6">
                <div className="bg-blue-500 h-3 rounded-full animate-pulse w-full" />
              </div>
            )}

            <div className="flex justify-center">
              <button onClick={handleConvert} disabled={isProcessing}
                className="w-full sm:w-auto px-12 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg rounded-2xl shadow-lg transition-all disabled:opacity-50">
                {isProcessing ? 'Memproses di perangkat...' : 'Konversi ke Word'}
              </button>
            </div>
          </div>
        )}

        {downloadUrl && (
          <div className="mt-8 max-w-3xl mx-auto p-8 bg-green-50 border border-green-200 rounded-3xl flex flex-col items-center">
            <h3 className="text-2xl font-bold text-green-800 mb-3">🎉 Berhasil Dikonversi!</h3>
            <button onClick={() => saveAs(downloadUrl, downloadFilename)}
              className="w-full sm:w-auto px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-bold text-lg rounded-2xl shadow-md">
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
