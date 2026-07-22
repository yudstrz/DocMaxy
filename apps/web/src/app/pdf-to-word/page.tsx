'use client';

import React, { useState } from 'react';
import { SortableGrid, PDFDocument as LocalPDFDocument } from '@/components/SortableGrid';
import { generatePDFThumbnail } from '@/utils/pdf';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, ImageRun,
} from 'docx';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import toast from 'react-hot-toast';

// ── Config ────────────────────────────────────────────────────────────────────
const Y_TOL           = 3;     // pts — items within this Y = same line
const COL_GAP_RATIO   = 0.06;  // min gap / pageWidth = new column
const CLUSTER_TOL     = 18;    // pts — nearby x = same column cluster
const MIN_TABLE_ROWS  = 2;
// A page is considered "scan" if it has fewer text chars than this
const SCAN_PAGE_CHAR_THRESHOLD = 50;
// Scale for canvas rendering (2x for OCR accuracy, 1.5x for image extraction)
const OCR_SCALE    = 2.0;
const IMAGE_SCALE  = 1.5;

// ── Types ─────────────────────────────────────────────────────────────────────
interface RawItem {
  text: string; x: number; y: number;
  fontSize: number; textWidth: number;
  bold: boolean; italic: boolean; fontName: string;
}
interface TextLine {
  y: number; items: RawItem[]; avgFontSize: number;
}
interface TextRegion  { kind: 'text';  runs: { text: string; bold: boolean; italic: boolean }[]; avgFontSize: number }
interface TableRegion { kind: 'table'; rows: string[][]; firstRowHeader: boolean }
interface SpaceRegion { kind: 'space' }
type Region = TextRegion | TableRegion | SpaceRegion;

// ── Font name → bold / italic ─────────────────────────────────────────────────
function parseFontStyle(f: string): { bold: boolean; italic: boolean } {
  const fl = f.toLowerCase();
  return {
    bold:   fl.includes('bold') || fl.includes('black') || fl.includes('heavy') || fl.includes('demi'),
    italic: fl.includes('italic') || fl.includes('oblique') || fl.includes('slant'),
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

function detectColumns(lines: TextLine[], pageWidth: number): TextLine[][] {
  const midX = pageWidth / 2;
  let leftLines = 0, rightLines = 0, fullLines = 0;
  for (const line of lines) {
    if (!line.items.length) continue;
    const xs = line.items.map(it => it.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...line.items.map((it, i) => it.x + line.items[i].textWidth));
    if (maxX - minX < pageWidth * 0.45) {
      if (maxX < midX + 20) leftLines++;
      else if (minX > midX - 20) rightLines++;
    } else fullLines++;
  }
  if (leftLines > 3 && rightLines > 3 && fullLines < leftLines * 0.5) {
    const left  = lines.filter(l => Math.max(...l.items.map((it, i) => it.x + l.items[i].textWidth)) < midX + 20);
    const right = lines.filter(l => Math.min(...l.items.map(it => it.x)) > midX - 20);
    const full  = lines.filter(l => !left.includes(l) && !right.includes(l));
    return [[...full.flat(), ...left.flat(), ...right.flat()]];
  }
  return [lines];
}

function linesToRegions(lines: TextLine[], pageWidth: number, pageAvgFs: number): Region[] {
  const regions: Region[] = [];
  const flags = lines.map(l => isTableLine(l, pageWidth));
  let i = 0;
  while (i < lines.length) {
    if (!flags[i]) {
      const runs = lines[i].items.sort((a, b) => a.x - b.x).map(it => ({ text: it.text, bold: it.bold, italic: it.italic }));
      if (runs.some(r => r.text.trim())) regions.push({ kind: 'text', runs, avgFontSize: lines[i].avgFontSize });
      else regions.push({ kind: 'space' });
      i++;
      continue;
    }
    let j = i;
    while (j < lines.length && flags[j]) j++;
    if (j - i < MIN_TABLE_ROWS) {
      for (let k = i; k < j; k++) {
        const runs = lines[k].items.sort((a, b) => a.x - b.x).map(it => ({ text: it.text, bold: it.bold, italic: it.italic }));
        if (runs.some(r => r.text.trim())) regions.push({ kind: 'text', runs, avgFontSize: lines[k].avgFontSize });
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

function groupIntoParagraphs(regions: Region[], pageAvgFs: number): Region[] {
  const grouped: Region[] = [];
  let pendingRuns: { text: string; bold: boolean; italic: boolean }[] = [];
  let pendingFs = pageAvgFs;
  const flush = () => {
    if (pendingRuns.length) {
      grouped.push({ kind: 'text', runs: [...pendingRuns], avgFontSize: pendingFs });
      pendingRuns = [];
    }
  };
  for (const r of regions) {
    if (r.kind === 'space') { flush(); grouped.push(r); }
    else if (r.kind === 'table') { flush(); grouped.push(r); }
    else {
      const same = Math.abs(r.avgFontSize - pendingFs) < 1 && pendingRuns.length > 0;
      if (same) pendingRuns.push({ text: ' ', bold: false, italic: false }, ...r.runs);
      else { flush(); pendingRuns = [...r.runs]; pendingFs = r.avgFontSize; }
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
    if (fs > globalAvgFs * 1.7)       heading = HeadingLevel.HEADING_1;
    else if (fs > globalAvgFs * 1.4)  heading = HeadingLevel.HEADING_2;
    else if (fs > globalAvgFs * 1.15) heading = HeadingLevel.HEADING_3;

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
          children: [new Paragraph({ children: [new TextRun({ text: (row[ci] ?? '').trim(), bold: ri === 0 && region.firstRowHeader, size: 20 })] })],
        })
      ),
    })
  );
  return [
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: docxRows }),
    new Paragraph({ children: [] }),
  ];
}

// ── Render PDF page to canvas ─────────────────────────────────────────────────
async function renderPageToCanvas(page: any, scale: number): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas   = document.createElement('canvas');
  canvas.width   = Math.floor(viewport.width);
  canvas.height  = Math.floor(viewport.height);
  const ctx      = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

// ── OCR a rendered canvas using Tesseract.js ──────────────────────────────────
async function ocrCanvas(canvas: HTMLCanvasElement, lang: string): Promise<string> {
  // @ts-ignore
  const Tesseract = (await import('tesseract.js')).default || (await import('tesseract.js'));
  const result = await Tesseract.recognize(canvas, lang, { logger: () => {} });
  return result.data.text ?? '';
}

// ── Extract images from PDF page operator list ────────────────────────────────
async function extractPageImages(page: any, viewport: any): Promise<{ dataUrl: string; widthPt: number; heightPt: number }[]> {
  const images: { dataUrl: string; widthPt: number; heightPt: number }[] = [];

  try {
    const ops = await page.getOperatorList();
    const pdfjsOPS = (await import('pdfjs-dist')).OPS;

    const imageNames: string[] = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] === pdfjsOPS.paintImageXObject ||
          ops.fnArray[i] === pdfjsOPS.paintImageMaskXObject) {
        const name = ops.argsArray[i][0];
        if (typeof name === 'string' && !imageNames.includes(name)) {
          imageNames.push(name);
        }
      }
    }

    for (const name of imageNames) {
      try {
        const imgObj = await new Promise<any>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('timeout')), 3000);
          page.objs.get(name, (obj: any) => {
            clearTimeout(timeout);
            resolve(obj);
          });
        });

        if (!imgObj || !imgObj.width || !imgObj.height) continue;

        // Draw the image on an offscreen canvas
        const imgCanvas  = document.createElement('canvas');
        imgCanvas.width  = imgObj.width;
        imgCanvas.height = imgObj.height;
        const imgCtx     = imgCanvas.getContext('2d')!;
        const imageData  = imgCtx.createImageData(imgObj.width, imgObj.height);

        // imgObj.data is a Uint8ClampedArray (RGBA or RGB)
        if (imgObj.data && imgObj.data.length > 0) {
          const src = imgObj.data;
          const dst = imageData.data;
          if (src.length === imgObj.width * imgObj.height * 4) {
            dst.set(src);
          } else if (src.length === imgObj.width * imgObj.height * 3) {
            // RGB → RGBA
            for (let p = 0; p < imgObj.width * imgObj.height; p++) {
              dst[p * 4]     = src[p * 3];
              dst[p * 4 + 1] = src[p * 3 + 1];
              dst[p * 4 + 2] = src[p * 3 + 2];
              dst[p * 4 + 3] = 255;
            }
          } else {
            continue; // unknown format
          }
          imgCtx.putImageData(imageData, 0, 0);
          const dataUrl = imgCanvas.toDataURL('image/png');

          // Approximate dimensions in PDF points (1pt ≈ viewport scale factor)
          const widthPt  = (imgObj.width / viewport.scale) * 0.75;  // pt
          const heightPt = (imgObj.height / viewport.scale) * 0.75;
          images.push({ dataUrl, widthPt, heightPt });
        }
      } catch {
        // Skip problematic images silently
      }
    }
  } catch {
    // Operator list not available — skip
  }

  return images;
}

// ── dataUrl → ArrayBuffer ─────────────────────────────────────────────────────
async function dataUrlToArrayBuffer(dataUrl: string): Promise<ArrayBuffer> {
  const res = await fetch(dataUrl);
  return res.arrayBuffer();
}

// ── Scan page → docx paragraphs via OCR ──────────────────────────────────────
async function ocrPageToDocx(page: any, lang: string): Promise<(Paragraph | Table)[]> {
  const canvas  = await renderPageToCanvas(page, OCR_SCALE);
  const ocrText = await ocrCanvas(canvas, lang);
  const elements: (Paragraph | Table)[] = [];
  const lines = ocrText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      elements.push(new Paragraph({ children: [new TextRun({ text: trimmed, size: 22 })] }));
    } else {
      elements.push(new Paragraph({ children: [] }));
    }
  }
  return elements;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PdfToWordPage() {
  const [documents, setDocuments]     = useState<LocalPDFDocument[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress]       = useState<{ page: number; total: number; label?: string } | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string>('');
  const [enableOCR, setEnableOCR]     = useState(false);
  const [ocrLang, setOcrLang]         = useState('ind+eng'); // Indonesian + English
  const [extractImages, setExtractImages] = useState(true);

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
    if (enableOCR)
      toast('Mode OCR aktif — proses lebih lambat, mohon tunggu.', { duration: 5000, icon: '🔍' });

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
        const pdf         = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const totalPages  = pdf.numPages;

        const allElements: (Paragraph | Table)[] = [];
        const allFontSizes: number[] = [];

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
          setProgress({ page: pageNum, total: totalPages });
          await new Promise<void>(r => setTimeout(r, 0)); // yield

          const page        = await pdf.getPage(pageNum);
          const viewport    = page.getViewport({ scale: 1.0 });
          const pageWidth   = viewport.width;
          const textContent = await page.getTextContent();

          // ── Count total text chars on this page ───────────────────────────
          const totalChars = textContent.items.reduce((s: number, it: any) => s + (it.str?.length ?? 0), 0);
          const isScanPage = totalChars < SCAN_PAGE_CHAR_THRESHOLD;

          // ── OCR path: scanned page with no/few text items ─────────────────
          if (isScanPage && enableOCR) {
            setProgress({ page: pageNum, total: totalPages, label: `OCR halaman ${pageNum}…` });
            await new Promise<void>(r => setTimeout(r, 0));
            const ocrElements = await ocrPageToDocx(page, ocrLang);
            allElements.push(...ocrElements);

            if (pageNum < totalPages)
              allElements.push(new Paragraph({ pageBreakBefore: true, children: [] }));
            continue;
          }

          // ── Image extraction path ─────────────────────────────────────────
          let embeddedImages: { dataUrl: string; widthPt: number; heightPt: number }[] = [];
          if (extractImages) {
            const imgViewport = page.getViewport({ scale: IMAGE_SCALE });
            embeddedImages = await extractPageImages(page, imgViewport);
          }

          // ── Standard text extraction ──────────────────────────────────────
          const rawItems: RawItem[] = [];
          for (const item of textContent.items) {
            if (!('str' in item) || !(item as any).str.trim()) continue;
            const it       = item as any;
            const fs       = Array.isArray(it.transform) ? Math.abs(it.transform[0]) : 12;
            const x        = Array.isArray(it.transform) ? it.transform[4] : 0;
            const y        = Array.isArray(it.transform) ? it.transform[5] : 0;
            const tw       = typeof it.width === 'number' ? it.width : it.str.length * fs * 0.5;
            const { bold, italic } = parseFontStyle(it.fontName ?? '');
            rawItems.push({ text: it.str, x, y, fontSize: fs, textWidth: tw, bold, italic, fontName: it.fontName ?? '' });
            allFontSizes.push(fs);
          }

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

          const pageAvgFs    = allFontSizes.length ? allFontSizes.reduce((a, b) => a + b, 0) / allFontSizes.length : 12;
          const lineGroups   = detectColumns(lines, pageWidth);

          // Add text regions
          for (const group of lineGroups) {
            const groupLines = Array.isArray(group[0]) ? group as unknown as TextLine[] : group as TextLine[];
            const regions    = linesToRegions(groupLines, pageWidth, pageAvgFs);
            const grouped    = groupIntoParagraphs(regions, pageAvgFs);
            for (const region of grouped) {
              allElements.push(...regionToDocx(region, pageAvgFs));
            }
          }

          // ── Append extracted images at end of page ────────────────────────
          for (const img of embeddedImages) {
            try {
              const imgBuffer = await dataUrlToArrayBuffer(img.dataUrl);
              // Max width: 180 pts (≈ A4 content area), keep aspect ratio
              const maxWidthPt = 450; // half-page width in Word emu/20 = pt
              const scale = img.widthPt > maxWidthPt ? maxWidthPt / img.widthPt : 1;
              const w = Math.round(img.widthPt * scale);
              const h = Math.round(img.heightPt * scale);

              if (w > 20 && h > 20) { // skip tiny images
                allElements.push(new Paragraph({
                  children: [
                    new ImageRun({
                      type: 'png',
                      data: imgBuffer,
                      transformation: { width: w, height: h },
                    }),
                  ],
                }));
              }
            } catch {
              // skip broken image
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
      console.error(e);
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
            Ubah PDF menjadi .docx yang bisa diedit. Mendukung OCR untuk PDF scan dan ekstraksi gambar.
            (100% di perangkat Anda)
          </p>
        </div>

        <SortableGrid items={documents} setItems={setDocuments} onAddFiles={handleAddFiles} />

        {documents.length > 0 && !downloadUrl && (
          <div className="max-w-3xl mx-auto mt-12 bg-white p-8 rounded-3xl shadow-sm border border-slate-200">

            {/* Feature list */}
            {!isProcessing && (
              <>
                <div className="mb-6 grid grid-cols-2 gap-3 text-sm">
                  {[
                    ['✅', 'Teks paragraf & heading'],
                    ['✅', 'Bold / Italic dari font PDF'],
                    ['✅', 'Deteksi tabel otomatis'],
                    ['✅', 'Deteksi multi-kolom'],
                    ['✅', 'Mendukung file 500MB+'],
                    ['✅', 'Progress per halaman'],
                    ['✅', 'Gambar di PDF diekstrak'],
                    ['✅', 'Mode OCR untuk PDF scan'],
                  ].map(([icon, label]) => (
                    <div key={label} className="flex items-center gap-2 text-slate-600">
                      <span>{icon}</span><span>{label}</span>
                    </div>
                  ))}
                </div>

                {/* Settings panel */}
                <div className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  {/* Extract images toggle */}
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">Ekstrak Gambar dari PDF</p>
                      <p className="text-xs text-slate-400 mt-0.5">Gambar yang ada di PDF akan disertakan di Word</p>
                    </div>
                    <button
                      onClick={() => setExtractImages(!extractImages)}
                      className={`relative w-12 h-6 rounded-full transition-colors ${extractImages ? 'bg-blue-500' : 'bg-slate-300'}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${extractImages ? 'left-7' : 'left-1'}`} />
                    </button>
                  </label>

                  {/* OCR toggle */}
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">Mode OCR (PDF Scan / Foto)</p>
                      <p className="text-xs text-slate-400 mt-0.5">Baca teks dari PDF yang berbasis gambar (lebih lambat)</p>
                    </div>
                    <button
                      onClick={() => setEnableOCR(!enableOCR)}
                      className={`relative w-12 h-6 rounded-full transition-colors ${enableOCR ? 'bg-purple-500' : 'bg-slate-300'}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${enableOCR ? 'left-7' : 'left-1'}`} />
                    </button>
                  </label>

                  {/* OCR language selector */}
                  {enableOCR && (
                    <div>
                      <p className="text-sm font-medium text-slate-600 mb-2">Bahasa OCR</p>
                      <select
                        value={ocrLang}
                        onChange={e => setOcrLang(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400"
                      >
                        <option value="ind+eng">Indonesia + English</option>
                        <option value="ind">Indonesia saja</option>
                        <option value="eng">English saja</option>
                        <option value="chi_sim+eng">Chinese (Simplified) + English</option>
                        <option value="jpn+eng">Japanese + English</option>
                        <option value="ara">Arabic</option>
                      </select>
                      <p className="mt-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                        ⏳ OCR membutuhkan waktu 5–30 detik per halaman tergantung ukuran dan bahasa. Halaman berteks normal akan tetap diproses cepat.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Progress bar */}
            {isProcessing && progress && (
              <div className="mb-6">
                <div className="flex justify-between text-sm text-slate-500 mb-2">
                  <span>{progress.label ?? `Memproses halaman ${progress.page} dari ${progress.total}…`}</span>
                  <span>{pct}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all duration-300 ${enableOCR ? 'bg-purple-500' : 'bg-blue-500'}`}
                    style={{ width: `${pct}%` }}
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
                className={`w-full sm:w-auto px-12 py-4 text-white font-bold text-lg rounded-2xl shadow-lg transition-all disabled:opacity-50 ${enableOCR ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
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
