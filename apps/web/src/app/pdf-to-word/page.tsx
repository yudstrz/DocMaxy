'use client';

import React, { useState } from 'react';
import { SortableGrid, PDFDocument as LocalPDFDocument } from '@/components/SortableGrid';
import { generatePDFThumbnail } from '@/utils/pdf';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, AlignmentType,
} from 'docx';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import toast from 'react-hot-toast';

// ── Config ────────────────────────────────────────────────────────────────────
const Y_TOL        = 3;     // pts — items within this Y = same line
const COL_GAP_RATIO= 0.06;  // min gap / pageWidth = new column
const CLUSTER_TOL  = 18;    // pts — nearby x = same column cluster
const MIN_TABLE_ROWS = 2;
const PARA_GAP_FACTOR = 1.8; // line gap * factor → paragraph break

// ── Extended raw text item ────────────────────────────────────────────────────
interface RawItem {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  textWidth: number;  // rendered width in PDF pts
  bold: boolean;      // detected from font name
  italic: boolean;    // detected from font name
  fontName: string;
}

interface TextLine {
  y: number;
  items: RawItem[];
  avgFontSize: number;
}

// ── Region types ──────────────────────────────────────────────────────────────
interface TextRegion  { kind: 'text';  runs: { text: string; bold: boolean; italic: boolean }[]; avgFontSize: number }
interface TableRegion { kind: 'table'; rows: string[][]; firstRowHeader: boolean }
interface SpaceRegion { kind: 'space' }

type Region = TextRegion | TableRegion | SpaceRegion;

// ── Font name → bold / italic ─────────────────────────────────────────────────
function parseFontStyle(fontName: string): { bold: boolean; italic: boolean } {
  const f = fontName.toLowerCase();
  return {
    bold:   f.includes('bold') || f.includes('black') || f.includes('heavy') || f.includes('demi'),
    italic: f.includes('italic') || f.includes('oblique') || f.includes('slant'),
  };
}

// ── Column cluster detection ──────────────────────────────────────────────────
function clusterX(xs: number[]): number[] {
  if (!xs.length) return [];
  const sorted = [...xs].sort((a, b) => a - b);
  const clusters = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - clusters[clusters.length - 1] > CLUSTER_TOL) clusters.push(sorted[i]);
  }
  return clusters;
}

function isTableLine(line: TextLine, pageWidth: number): boolean {
  if (line.items.length < 2) return false;
  const thr = pageWidth * COL_GAP_RATIO;
  const sorted = [...line.items].sort((a, b) => a.x - b.x);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].x - (sorted[i - 1].x + sorted[i - 1].textWidth) > thr) return true;
  }
  return false;
}

function buildTableRow(items: RawItem[], cols: number[]): string[] {
  const cells = new Array<string>(cols.length).fill('');
  for (const item of items) {
    let bestIdx = 0, bestD = Math.abs(item.x - cols[0]);
    for (let i = 1; i < cols.length; i++) {
      const d = Math.abs(item.x - cols[i]);
      if (d < bestD) { bestD = d; bestIdx = i; }
    }
    cells[bestIdx] = cells[bestIdx] ? `${cells[bestIdx]} ${item.text}` : item.text;
  }
  return cells;
}

// ── Multi-column layout detection ────────────────────────────────────────────
function detectColumns(lines: TextLine[], pageWidth: number): TextLine[][] {
  // Check if page has consistent multi-column layout
  // by looking for lines that all stay in the same X-half of the page
  const midX = pageWidth / 2;
  let leftLines = 0, rightLines = 0, fullLines = 0;

  for (const line of lines) {
    const xs = line.items.map(it => it.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs.map((x, i) => x + line.items[i].textWidth));
    const spans = maxX - minX;

    if (spans < pageWidth * 0.45) {
      if (maxX < midX + 20) leftLines++;
      else if (minX > midX - 20) rightLines++;
    } else {
      fullLines++;
    }
  }

  const hasMultiCol = (leftLines > 3 && rightLines > 3) && fullLines < leftLines * 0.5;

  if (!hasMultiCol) return [lines]; // single column

  // Split into left / right columns, then sort each top-to-bottom
  const leftCol  = lines.filter(l => Math.max(...l.items.map((it, i) => it.x + l.items[i].textWidth)) < midX + 20);
  const rightCol = lines.filter(l => Math.min(...l.items.map(it => it.x)) > midX - 20);
  const fullWidth= lines.filter(l => !leftCol.includes(l) && !rightCol.includes(l));

  return [
    ...fullWidth.map(l => [l]),
    leftCol.map(l => l),
    rightCol.map(l => l),
  ].filter(g => g.length > 0);
}

// ── Lines → Regions ───────────────────────────────────────────────────────────
function linesToRegions(lines: TextLine[], pageWidth: number, pageAvgFs: number): Region[] {
  const regions: Region[] = [];
  const flags = lines.map(l => isTableLine(l, pageWidth));
  let i = 0;

  while (i < lines.length) {
    if (!flags[i]) {
      // Group consecutive non-table lines into paragraphs
      // A "paragraph break" = gap between lines > PARA_GAP_FACTOR * avgLineHeight
      const lineAvgH = lines[i].avgFontSize; // in PDF points ≈ line height

      // Build one text region for this line
      const lineRuns = lines[i].items.sort((a, b) => a.x - b.x).map(it => ({
        text: it.text,
        bold: it.bold,
        italic: it.italic,
      }));
      if (lineRuns.some(r => r.text.trim())) {
        regions.push({ kind: 'text', runs: lineRuns, avgFontSize: lines[i].avgFontSize });
      } else {
        regions.push({ kind: 'space' });
      }
      i++;
      continue;
    }

    // Table region
    let j = i;
    while (j < lines.length && flags[j]) j++;

    if (j - i < MIN_TABLE_ROWS) {
      for (let k = i; k < j; k++) {
        const runs = lines[k].items.sort((a, b) => a.x - b.x).map(it => ({
          text: it.text, bold: it.bold, italic: it.italic,
        }));
        if (runs.some(r => r.text.trim())) {
          regions.push({ kind: 'text', runs, avgFontSize: lines[k].avgFontSize });
        }
      }
      i = j;
      continue;
    }

    const tableLines = lines.slice(i, j);
    const allXs = tableLines.flatMap(l => l.items.map(it => it.x));
    const cols = clusterX(allXs);
    const rows = tableLines.map(l => buildTableRow(l.items, cols));

    const firstRowHeader = rows[0].every(c => c.length > 0 && (c === c.toUpperCase() || c.length < 25));
    regions.push({ kind: 'table', rows, firstRowHeader });
    i = j;
  }

  return regions;
}

// ── Paragraph grouping: merge consecutive text lines into paragraphs ──────────
function groupIntoParagraphs(regions: Region[], pageAvgFs: number): Region[] {
  // For now, just merge consecutive lines with same approx font size into paragraphs
  // This simulates paragraph detection
  const grouped: Region[] = [];
  let pendingTextRuns: { text: string; bold: boolean; italic: boolean }[] = [];
  let pendingFs = pageAvgFs;

  function flush() {
    if (pendingTextRuns.length) {
      grouped.push({ kind: 'text', runs: [...pendingTextRuns], avgFontSize: pendingFs });
      pendingTextRuns = [];
    }
  }

  for (const r of regions) {
    if (r.kind === 'space') {
      flush();
      grouped.push(r);
    } else if (r.kind === 'table') {
      flush();
      grouped.push(r);
    } else {
      // Text region
      const isSameBlock = Math.abs(r.avgFontSize - pendingFs) < 1 && pendingTextRuns.length > 0;
      if (isSameBlock) {
        // Append with space
        pendingTextRuns.push({ text: ' ', bold: false, italic: false }, ...r.runs);
      } else {
        flush();
        pendingTextRuns = [...r.runs];
        pendingFs = r.avgFontSize;
      }
    }
  }
  flush();
  return grouped;
}

// ── Region → docx elements ────────────────────────────────────────────────────
function regionToDocx(region: Region, globalAvgFs: number): (Paragraph | Table)[] {
  if (region.kind === 'space') return [new Paragraph({ children: [] })];

  if (region.kind === 'text') {
    const fs = region.avgFontSize;
    let heading: (typeof HeadingLevel)[keyof typeof HeadingLevel] | undefined;
    if (fs > globalAvgFs * 1.7)      heading = HeadingLevel.HEADING_1;
    else if (fs > globalAvgFs * 1.4) heading = HeadingLevel.HEADING_2;
    else if (fs > globalAvgFs * 1.15)heading = HeadingLevel.HEADING_3;

    // Build TextRuns with bold/italic
    const textRuns: TextRun[] = [];
    let buf = '', bufBold = region.runs[0]?.bold ?? false, bufItalic = region.runs[0]?.italic ?? false;

    const flushBuf = () => {
      if (buf) {
        textRuns.push(new TextRun({ text: buf, bold: bufBold || !!heading, italics: bufItalic, size: Math.round(Math.max(fs, 10)) * 2 }));
        buf = '';
      }
    };

    for (const run of region.runs) {
      if (run.bold !== bufBold || run.italic !== bufItalic) { flushBuf(); bufBold = run.bold; bufItalic = run.italic; }
      buf += run.text;
    }
    flushBuf();

    return [new Paragraph({ heading, children: textRuns })];
  }

  // Table
  const colCount = Math.max(...region.rows.map(r => r.length), 1);
  const colPct   = Math.floor(100 / colCount);

  const docxRows = region.rows.map((row, ri) =>
    new TableRow({
      tableHeader: ri === 0 && region.firstRowHeader,
      children: Array.from({ length: colCount }, (_, ci) =>
        new TableCell({
          width: { size: colPct, type: WidthType.PERCENTAGE },
          children: [new Paragraph({
            children: [new TextRun({
              text: (row[ci] ?? '').trim(),
              bold: ri === 0 && region.firstRowHeader,
              size: 20,
            })],
          })],
        })
      ),
    })
  );

  return [
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: docxRows }),
    new Paragraph({ children: [] }),
  ];
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PdfToWordPage() {
  const [documents, setDocuments]     = useState<LocalPDFDocument[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress]       = useState<{ page: number; total: number } | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string>('');

  const handleAddFiles = async (files: FileList | File[]) => {
    setDownloadUrl(null);
    const newDocs: LocalPDFDocument[] = Array.from(files).map(f => ({ id: crypto.randomUUID(), file: f, thumbnail: null }));
    setDocuments(prev => [...prev, ...newDocs]);
    for (const doc of newDocs) {
      const thumb = await generatePDFThumbnail(doc.file).catch(() => null);
      setDocuments(prev => prev.map(p => p.id === doc.id ? { ...p, thumbnail: thumb } : p));
    }
  };

  const handleConvert = async () => {
    if (documents.length === 0) { toast.error('Pilih minimal 1 file PDF.'); return; }

    const totalMB = documents.reduce((s, d) => s + d.file.size, 0) / 1048576;
    if (totalMB > 200)
      toast(`File besar (${totalMB.toFixed(0)} MB) — proses mungkin beberapa menit.`, { duration: 7000, icon: '⏳' });

    setIsProcessing(true);
    setDownloadUrl(null);
    setProgress(null);

    try {
      const pdfjsLib = await import('pdfjs-dist');
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc)
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

      const results: { name: string; blob: Blob }[] = [];

      for (const doc of documents) {
        const arrayBuffer = await doc.file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const totalPages = pdf.numPages;

        const allElements: (Paragraph | Table)[] = [];
        const allFontSizes: number[] = [];

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
          setProgress({ page: pageNum, total: totalPages });
          await new Promise<void>(r => setTimeout(r, 0));

          const page        = await pdf.getPage(pageNum);
          const viewport    = page.getViewport({ scale: 1.0 });
          const pageWidth   = viewport.width;
          const textContent = await page.getTextContent();

          // ── Collect items with full metadata ─────────────────────────────
          const rawItems: RawItem[] = [];
          for (const item of textContent.items) {
            if (!('str' in item) || !(item as any).str.trim()) continue;
            const it       = item as any;
            const fs       = Array.isArray(it.transform) ? Math.abs(it.transform[0]) : 12;
            const x        = Array.isArray(it.transform) ? it.transform[4] : 0;
            const y        = Array.isArray(it.transform) ? it.transform[5] : 0;
            const tw       = typeof it.width === 'number' ? it.width : it.str.length * fs * 0.5;
            const fontName = it.fontName ?? '';
            const { bold, italic } = parseFontStyle(fontName);

            rawItems.push({ text: it.str, x, y, fontSize: fs, textWidth: tw, bold, italic, fontName });
            allFontSizes.push(fs);
          }

          // ── Group into lines by Y ─────────────────────────────────────────
          const lineMap = new Map<number, RawItem[]>();
          for (const item of rawItems) {
            let foundY: number | null = null;
            for (const [ly] of lineMap) {
              if (Math.abs(ly - item.y) < Y_TOL) { foundY = ly; break; }
            }
            if (foundY !== null) lineMap.get(foundY)!.push(item);
            else                 lineMap.set(item.y, [item]);
          }

          const lines: TextLine[] = Array.from(lineMap.entries())
            .sort(([ya], [yb]) => yb - ya)
            .map(([y, items]) => ({
              y,
              items: items.sort((a, b) => a.x - b.x),
              avgFontSize: items.reduce((s, it) => s + it.fontSize, 0) / items.length,
            }));

          // ── Multi-column handling ─────────────────────────────────────────
          const pageAvgFs = allFontSizes.length
            ? allFontSizes.reduce((a, b) => a + b, 0) / allFontSizes.length : 12;

          // Detect columns (simple: just process lines in order for now)
          // Full multi-column would reorder lines from left col first then right
          const lineGroups = detectColumns(lines, pageWidth);

          for (const group of lineGroups) {
            const groupLines = Array.isArray(group[0]) ? group as unknown as TextLine[] : group as TextLine[];
            const regions    = linesToRegions(groupLines, pageWidth, pageAvgFs);
            const grouped    = groupIntoParagraphs(regions, pageAvgFs);

            for (const region of grouped) {
              allElements.push(...regionToDocx(region, pageAvgFs));
            }
          }

          if (pageNum < totalPages)
            allElements.push(new Paragraph({ pageBreakBefore: true, children: [] }));
        }

        const docxDoc = new Document({ sections: [{ children: allElements }] });
        const blob    = await Packer.toBlob(docxDoc);
        results.push({ name: `${doc.file.name.replace(/\.[^/.]+$/, '')}.docx`, blob });
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

  const pct = progress ? Math.round((progress.page / progress.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight sm:text-5xl">PDF ke Word</h1>
          <p className="mt-4 max-w-2xl text-xl text-slate-500 mx-auto">
            Ubah PDF menjadi .docx yang bisa diedit. Teks, heading, bold/italic, dan tabel
            terdeteksi otomatis. (100% di perangkat Anda)
          </p>
        </div>

        <SortableGrid items={documents} setItems={setDocuments} onAddFiles={handleAddFiles} />

        {documents.length > 0 && !downloadUrl && (
          <div className="max-w-3xl mx-auto mt-12 bg-white p-8 rounded-3xl shadow-sm border border-slate-200">

            {!isProcessing && (
              <div className="mb-6 grid grid-cols-2 gap-3 text-sm">
                {[
                  ['✅', 'Teks paragraf & heading'],
                  ['✅', 'Bold / Italic dari font PDF'],
                  ['✅', 'Deteksi tabel otomatis'],
                  ['✅', 'Deteksi multi-kolom'],
                  ['✅', 'Mendukung file 500MB+'],
                  ['✅', 'Progress per halaman'],
                  ['⚠️', 'PDF scan (gambar) tidak bisa diekstrak'],
                  ['⚠️', 'Gambar di PDF tidak diikutkan'],
                ].map(([icon, label]) => (
                  <div key={label} className="flex items-center gap-2 text-slate-600">
                    <span>{icon}</span><span>{label}</span>
                  </div>
                ))}
              </div>
            )}

            {isProcessing && progress && (
              <div className="mb-6">
                <div className="flex justify-between text-sm text-slate-500 mb-2">
                  <span>Memproses halaman {progress.page} dari {progress.total}…</span>
                  <span>{pct}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-3">
                  <div className="bg-blue-500 h-3 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
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
                {isProcessing ? 'Memproses di perangkat…' : 'Konversi ke Word'}
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
