'use client';

import React, { useState } from 'react';
import { SortableGrid, PDFDocument } from '@/components/SortableGrid';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import toast from 'react-hot-toast';

// ── Yield to browser event loop (prevent freeze on large files) ───────────────
const yieldToBrowser = () => new Promise<void>((r) => setTimeout(r, 0));

// ── Layout constants (mm, A4) ─────────────────────────────────────────────────
const PAGE_W   = 210;
const PAGE_H   = 297;
const MARGIN   = 22;        // left & right margin
const MARGIN_T = 22;        // top margin
const MARGIN_B = 20;        // bottom margin
const CONTENT_W = PAGE_W - MARGIN * 2;  // 166 mm
const PT_TO_MM  = 0.352778; // 1pt = 0.352778mm

// ── Types ─────────────────────────────────────────────────────────────────────
interface InlineRun {
  text: string;
  bold: boolean;
  italic: boolean;
}

type CmdKind = 'block' | 'img' | 'hr' | 'space' | 'table';

interface BlockCmd {
  kind: 'block';
  runs: InlineRun[];
  fontSize: number;  // pt
  bold: boolean;
  indent: number;    // mm
  prefix?: string;   // bullet/number prefix
  spaceBefore?: number; // mm
  spaceAfter?: number;  // mm
}
interface ImgCmd    { kind: 'img';   src: string }
interface HrCmd     { kind: 'hr' }
interface SpaceCmd  { kind: 'space'; mm: number }
interface TableCmd  { kind: 'table'; rows: { cells: string[]; isHeader: boolean }[] }

type RenderCmd = BlockCmd | ImgCmd | HrCmd | SpaceCmd | TableCmd;

// ── Helper: font style string ─────────────────────────────────────────────────
function fStyle(bold: boolean, italic: boolean): string {
  if (bold && italic) return 'bolditalic';
  if (bold)           return 'bold';
  if (italic)         return 'italic';
  return 'normal';
}

// ── Extract inline text runs from DOM element ─────────────────────────────────
function extractRuns(node: Node, bold = false, italic = false): InlineRun[] {
  const runs: InlineRun[] = [];
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const t = child.textContent ?? '';
      if (t) runs.push({ text: t, bold, italic });
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      const tag = el.tagName.toLowerCase();
      let b = bold, i = italic;
      if (tag === 'strong' || tag === 'b') b = true;
      if (tag === 'em'     || tag === 'i') i = true;
      if (tag === 'br') { runs.push({ text: '\n', bold, italic }); continue; }
      runs.push(...extractRuns(el, b, i));
    }
  }
  return runs;
}

// ── Extract direct (non-nested-list) runs from <li> ──────────────────────────
function extractDirectRuns(li: Element): InlineRun[] {
  const runs: InlineRun[] = [];
  for (const child of li.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const t = child.textContent ?? '';
      if (t.trim()) runs.push({ text: t, bold: false, italic: false });
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      const tag = el.tagName.toLowerCase();
      if (tag === 'ul' || tag === 'ol') continue; // skip nested — handled separately
      runs.push(...extractRuns(el));
    }
  }
  return runs;
}

// ── HTML → RenderCmd[] ────────────────────────────────────────────────────────
function htmlToCommands(html: string): RenderCmd[] {
  const cmds: RenderCmd[] = [];
  const dom = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');

  const HEADING: Record<string, { size: number; before: number; after: number }> = {
    h1: { size: 24, before: 5,   after: 2 },
    h2: { size: 20, before: 4,   after: 1.5 },
    h3: { size: 16, before: 3.5, after: 1 },
    h4: { size: 13, before: 3,   after: 0.5 },
    h5: { size: 12, before: 2.5, after: 0.5 },
    h6: { size: 11, before: 2,   after: 0.5 },
  };

  function walk(parent: Element, indent = 0) {
    for (const el of parent.children) processEl(el, indent);
  }

  function processEl(el: Element, indent = 0) {
    const tag = el.tagName.toLowerCase();

    if (HEADING[tag]) {
      const h = HEADING[tag];
      cmds.push({ kind: 'space', mm: h.before });
      cmds.push({ kind: 'block', runs: extractRuns(el, true), fontSize: h.size, bold: true, indent, spaceAfter: h.after });
      return;
    }

    switch (tag) {
      case 'p': {
        const runs = extractRuns(el);
        if (runs.some(r => r.text.trim())) {
          cmds.push({ kind: 'block', runs, fontSize: 11, bold: false, indent, spaceAfter: 1.5 });
        } else {
          cmds.push({ kind: 'space', mm: 2 });
        }
        break;
      }
      case 'hr':
        cmds.push({ kind: 'space', mm: 2 });
        cmds.push({ kind: 'hr' });
        cmds.push({ kind: 'space', mm: 2 });
        break;
      case 'br':
        cmds.push({ kind: 'space', mm: 2 });
        break;
      case 'blockquote':
        cmds.push({ kind: 'space', mm: 1 });
        walk(el, indent + 8);
        cmds.push({ kind: 'space', mm: 1 });
        break;
      case 'ul':
        processUL(el, indent);
        break;
      case 'ol':
        processOL(el, indent);
        break;
      case 'table':
        processTable(el);
        break;
      case 'img': {
        const src = el.getAttribute('src') ?? '';
        if (src.startsWith('data:')) {
          cmds.push({ kind: 'img', src });
          cmds.push({ kind: 'space', mm: 2 });
        }
        break;
      }
      // Containers — recurse
      case 'div': case 'section': case 'article': case 'main': case 'header': case 'footer':
        walk(el, indent);
        break;
      default:
        if (el.children.length > 0) walk(el, indent);
        else {
          const t = el.textContent?.trim();
          if (t) cmds.push({ kind: 'block', runs: [{ text: t, bold: false, italic: false }], fontSize: 11, bold: false, indent });
        }
    }
  }

  function processUL(ul: Element, indent: number) {
    for (const li of ul.children) {
      if (li.tagName.toLowerCase() !== 'li') continue;
      const runs = extractDirectRuns(li);
      if (runs.some(r => r.text.trim())) {
        cmds.push({ kind: 'block', runs, fontSize: 11, bold: false, indent: indent + 4, prefix: '•  ', spaceAfter: 0.8 });
      }
      for (const nested of li.children) {
        const nt = nested.tagName.toLowerCase();
        if (nt === 'ul') processUL(nested, indent + 6);
        else if (nt === 'ol') processOL(nested, indent + 6);
      }
    }
  }

  function processOL(ol: Element, indent: number) {
    let num = 0;
    for (const li of ol.children) {
      if (li.tagName.toLowerCase() !== 'li') continue;
      num++;
      const runs = extractDirectRuns(li);
      if (runs.some(r => r.text.trim())) {
        cmds.push({ kind: 'block', runs, fontSize: 11, bold: false, indent: indent + 4, prefix: `${num}.  `, spaceAfter: 0.8 });
      }
      for (const nested of li.children) {
        const nt = nested.tagName.toLowerCase();
        if (nt === 'ul') processUL(nested, indent + 6);
        else if (nt === 'ol') processOL(nested, indent + 6);
      }
    }
  }

  function processTable(table: Element) {
    const tableRows: { cells: string[]; isHeader: boolean }[] = [];
    for (const tr of table.querySelectorAll('tr')) {
      const cells = Array.from(tr.querySelectorAll('td, th'));
      tableRows.push({
        cells: cells.map(c => c.textContent?.trim() ?? ''),
        isHeader: cells.some(c => c.tagName.toLowerCase() === 'th'),
      });
    }
    if (tableRows.length > 0) {
      cmds.push({ kind: 'space', mm: 2 });
      cmds.push({ kind: 'table', rows: tableRows });
      cmds.push({ kind: 'space', mm: 2 });
    }
  }

  walk(dom.body);
  return cmds;
}

// ── PDF Renderer class ────────────────────────────────────────────────────────
class PdfRenderer {
  private pdf: any;
  y: number = MARGIN_T;

  constructor(pdf: any) {
    this.pdf = pdf;
    this.y = MARGIN_T;
  }

  /** Add vertical space, adding a new page if needed */
  addSpace(mm: number) {
    this.y += mm;
    if (this.y > PAGE_H - MARGIN_B) {
      this.pdf.addPage();
      this.y = MARGIN_T;
    }
  }

  /** Ensure at least `needed` mm is available; if not, new page */
  checkPage(needed: number) {
    if (this.y + needed > PAGE_H - MARGIN_B) {
      this.pdf.addPage();
      this.y = MARGIN_T;
    }
  }

  drawHR() {
    this.checkPage(4);
    this.pdf.setDrawColor(180, 180, 180);
    this.pdf.setLineWidth(0.3);
    this.pdf.line(MARGIN, this.y, MARGIN + CONTENT_W, this.y);
    this.y += 3;
  }

  private setFont(bold: boolean, italic: boolean, size: number) {
    this.pdf.setFont('helvetica', fStyle(bold, italic));
    this.pdf.setFontSize(size);
  }

  /**
   * Render inline runs with word-by-word wrapping and per-run bold/italic.
   * @param startX  left X of text column (may be MARGIN + indent + prefixW)
   * @param maxW    available width from startX to right margin
   * @param lineH   line height in mm
   */
  private renderInlineRuns(
    runs: InlineRun[],
    fontSize: number,
    startX: number,
    maxW: number,
  ) {
    const lineH = fontSize * PT_TO_MM * 1.5;
    let x = startX;

    for (const run of runs) {
      this.setFont(run.bold, run.italic, fontSize);

      // Split by newline first
      const lines = run.text.split('\n');
      for (let li = 0; li < lines.length; li++) {
        if (li > 0) {
          // explicit line break
          this.y += lineH;
          this.checkPage(lineH);
          x = startX;
        }

        // Split line into words
        const words = lines[li].split(/(\s+)/); // keep whitespace tokens
        for (const token of words) {
          if (!token) continue;

          const isWhitespace = !token.trim();
          const tw = this.pdf.getTextWidth(token);

          if (isWhitespace) {
            // At start of line — skip leading spaces
            if (x > startX) x += tw;
            continue;
          }

          // Word overflow — wrap
          if (x > startX && x + tw > startX + maxW) {
            this.y += lineH;
            this.checkPage(lineH);
            x = startX;
          }

          this.pdf.text(token, x, this.y);
          x += tw;
        }
      }
    }

    // Advance y by one line height (end of block)
    this.y += lineH;
  }

  /**
   * Render a full block: optional prefix, then inline runs with wrapping.
   */
  renderBlock(cmd: BlockCmd) {
    const { runs, fontSize, bold, italic, indent = 0, prefix, spaceAfter } = cmd as BlockCmd & { italic?: boolean };
    const lineH = fontSize * PT_TO_MM * 1.5;

    this.checkPage(lineH * 1.5);

    let textX = MARGIN + indent;
    let maxW   = CONTENT_W - indent;

    if (prefix) {
      this.setFont(bold, false, fontSize);
      const pw = this.pdf.getTextWidth(prefix);
      this.pdf.text(prefix, textX, this.y);
      textX += pw;
      maxW  -= pw;
    }

    if (runs.length > 0) {
      this.renderInlineRuns(runs, fontSize, textX, maxW);
    } else {
      this.y += lineH;
    }

    if (spaceAfter) this.y += spaceAfter;
  }

  /** Embed a data-URL image, scaling to fit page width */
  async renderImage(src: string) {
    const fmtMatch = src.match(/^data:image\/(jpeg|jpg|png|webp|gif)/i);
    if (!fmtMatch) return;
    const fmt = /png/i.test(fmtMatch[1]) ? 'PNG' : 'JPEG';

    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const pxPerMm = 96 / 25.4; // 96 dpi
        let drawW = img.naturalWidth  / pxPerMm;
        let drawH = img.naturalHeight / pxPerMm;

        const maxW = CONTENT_W;
        const maxH = 160; // mm max

        if (drawW > maxW) { drawH *= maxW / drawW; drawW = maxW; }
        if (drawH > maxH) { drawW *= maxH / drawH; drawH = maxH; }

        this.checkPage(drawH + 4);
        try {
          this.pdf.addImage(src, fmt, MARGIN, this.y, drawW, drawH);
          this.y += drawH + 3;
        } catch { /* skip bad image */ }
        resolve();
      };
      img.onerror = () => resolve();
      img.src = src;
    });
  }

  /** Render a bordered table with full multiline cell support */
  renderTable(rows: { cells: string[]; isHeader: boolean }[]) {
    if (!rows.length) return;
    const cols = Math.max(...rows.map(r => r.cells.length));
    if (!cols) return;

    const cellW = CONTENT_W / cols;
    const pad   = 2;    // mm padding inside cell
    const fs    = 9;    // pt font size
    const lineH = fs * PT_TO_MM * 1.45;

    for (const row of rows) {
      // ── Step 1: calculate dynamic row height from content ──────────────────
      let maxLines = 1;
      for (let ci = 0; ci < cols; ci++) {
        const text = row.cells[ci] ?? '';
        this.setFont(row.isHeader, false, fs);
        const wrapped = this.pdf.splitTextToSize(text, cellW - pad * 2);
        maxLines = Math.max(maxLines, Array.isArray(wrapped) ? wrapped.length : 1);
      }
      const rowH = maxLines * lineH + pad * 2;

      this.checkPage(rowH + 1);

      // ── Step 2: set draw/fill BEFORE drawing rectangles ───────────────────
      this.pdf.setDrawColor(150, 155, 170);
      this.pdf.setLineWidth(0.25);

      for (let ci = 0; ci < cols; ci++) {
        const cx = MARGIN + ci * cellW;

        // Draw cell border + background (this.y = top of row, not baseline)
        if (row.isHeader) {
          this.pdf.setFillColor(220, 228, 245);
          this.pdf.rect(cx, this.y, cellW, rowH, 'FD');
        } else {
          this.pdf.setFillColor(255, 255, 255);
          this.pdf.rect(cx, this.y, cellW, rowH, 'D');
        }

        // ── Step 3: render ALL wrapped lines (not just lines[0]) ─────────
        const text = row.cells[ci] ?? '';
        this.setFont(row.isHeader, false, fs);
        this.pdf.setTextColor(20, 20, 20);
        const wrappedLines = this.pdf.splitTextToSize(text, cellW - pad * 2);
        const lines: string[] = Array.isArray(wrappedLines) ? wrappedLines : [wrappedLines];

        for (let li = 0; li < lines.length; li++) {
          // y baseline: top-of-row + padding + (line index + 0.85) * lineH
          const textY = this.y + pad + lineH * (li + 0.85);
          this.pdf.text(String(lines[li]), cx + pad, textY);
        }
      }

      // ── Step 4: advance y by actual row height ────────────────────────────
      this.y += rowH;
    }

    this.y += 2; // spacing after table
  }
}

// ── Main conversion function ──────────────────────────────────────────────────
async function convertWordToPdf(
  file: File,
  onProgress: (step: string, pct: number) => void
): Promise<Blob> {
  onProgress('Membaca dokumen...', 5);
  await yieldToBrowser();

  // Dynamic imports to keep bundle lean
  const mammoth = await import('mammoth');
  const jsPDF   = (await import('jspdf')).default;

  onProgress('Mengekstrak konten Word...', 15);
  await yieldToBrowser();

  const arrayBuffer = await file.arrayBuffer();

  onProgress('Mengonversi teks & gambar...', 25);
  await yieldToBrowser();

  // Convert DOCX → HTML, embedding images as base64 data-URIs
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      styleMap: [
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Heading 4'] => h4:fresh",
        "p[style-name='Title']     => h1:fresh",
        "p[style-name='Subtitle']  => h2:fresh",
      ],
      convertImage: mammoth.images.imgElement((image: any) =>
        image.read('base64').then((b64: string) => ({
          src: `data:${image.contentType};base64,${b64}`,
        }))
      ),
    }
  );

  onProgress('Membangun struktur halaman...', 40);
  await yieldToBrowser();

  const cmds = htmlToCommands(result.value);

  onProgress('Merender PDF (teks selectable)...', 55);
  await yieldToBrowser();

  // Create A4 jsPDF
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const renderer = new PdfRenderer(pdf);

  // Set default black text
  pdf.setTextColor(20, 20, 20);

  for (let i = 0; i < cmds.length; i++) {
    // Yield every 15 commands for large documents
    if (i > 0 && i % 15 === 0) {
      await yieldToBrowser();
      const pct = 55 + Math.round((i / cmds.length) * 40);
      onProgress(`Merender konten (${i}/${cmds.length})...`, pct);
    }

    const cmd = cmds[i];
    switch (cmd.kind) {
      case 'block': renderer.renderBlock(cmd);          break;
      case 'img':   await renderer.renderImage(cmd.src); break;
      case 'hr':    renderer.drawHR();                  break;
      case 'space': renderer.addSpace(cmd.mm);          break;
      case 'table': renderer.renderTable(cmd.rows);     break;
    }
  }

  onProgress('Menyimpan PDF...', 98);
  await yieldToBrowser();

  return pdf.output('blob');
}

// ── React Component ───────────────────────────────────────────────────────────
export default function WordToPdfPage() {
  const [documents, setDocuments] = useState<PDFDocument[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ step: string; pct: number } | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string>('');

  const handleAddFiles = (files: FileList | File[]) => {
    setDownloadUrl(null);
    const newDocs: PDFDocument[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(), file, thumbnail: null,
    }));
    setDocuments((prev) => [...prev, ...newDocs]);
  };

  const handleConvert = async () => {
    if (documents.length === 0) { toast.error('Pilih minimal 1 file Word.'); return; }

    const totalMB = documents.reduce((s, d) => s + d.file.size, 0) / (1024 * 1024);
    if (totalMB > 150) {
      toast(`File besar (${totalMB.toFixed(0)} MB) — proses mungkin butuh beberapa menit, jangan tutup tab.`, {
        duration: 7000, icon: '⏳',
      });
    }

    setIsProcessing(true);
    setDownloadUrl(null);
    setProgress(null);

    try {
      const results: { name: string; blob: Blob }[] = [];

      for (const doc of documents) {
        const blob = await convertWordToPdf(
          doc.file,
          (step, pct) => setProgress({ step, pct })
        );
        const baseName = doc.file.name.replace(/\.[^/.]+$/, '');
        results.push({ name: `${baseName}.pdf`, blob });
      }

      if (results.length === 1) {
        setDownloadUrl(URL.createObjectURL(results[0].blob));
        setDownloadFilename(`${documents[0].file.name.replace(/\.[^/.]+$/, '')} (Converted).pdf`);
      } else {
        const zip = new JSZip();
        results.forEach(r => zip.file(r.name, r.blob));
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        setDownloadUrl(URL.createObjectURL(zipBlob));
        setDownloadFilename(`Word_to_PDF_${Date.now()}.zip`);
      }

      toast.success('Berhasil dikonversi ke PDF!');
    } catch (e: any) {
      toast.error(e.message || 'Gagal memproses file.');
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight sm:text-5xl">Word ke PDF</h1>
          <p className="mt-4 max-w-2xl text-xl text-slate-500 mx-auto">
            Ubah dokumen Word (.docx) menjadi PDF dengan teks yang bisa di-<em>select</em> & dicopy.
            (100% di perangkat Anda)
          </p>
        </div>

        <SortableGrid
          items={documents}
          setItems={setDocuments}
          onAddFiles={handleAddFiles}
          accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
          uploadLabel="Pilih File Word"
        />

        {documents.length > 0 && !downloadUrl && (
          <div className="max-w-3xl mx-auto mt-12 bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
            {/* Progress display */}
            {isProcessing && progress && (
              <div className="mb-6">
                <div className="flex justify-between text-sm text-slate-500 mb-2">
                  <span>{progress.step}</span>
                  <span>{progress.pct}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-3">
                  <div
                    className="bg-blue-500 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${progress.pct}%` }}
                  />
                </div>
              </div>
            )}
            {isProcessing && !progress && (
              <div className="w-full bg-slate-200 rounded-full h-3 mb-6">
                <div className="bg-blue-500 h-3 rounded-full animate-pulse w-full" />
              </div>
            )}

            {/* Info note */}
            {!isProcessing && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
                <strong>✅ Mode Teks Asli:</strong> PDF yang dihasilkan berisi teks yang bisa di-<em>select</em>,
                dicopy, dan dicari — bukan gambar screenshot. Mendukung: heading, paragraf, bullet, tabel,
                gambar embedded, dan bold/italic.
              </div>
            )}

            <div className="flex justify-center">
              <button onClick={handleConvert} disabled={isProcessing}
                className="w-full sm:w-auto px-12 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg rounded-2xl shadow-lg transition-all disabled:opacity-50">
                {isProcessing ? 'Memproses di perangkat...' : 'Konversi ke PDF'}
              </button>
            </div>
          </div>
        )}

        {downloadUrl && (
          <div className="mt-8 max-w-3xl mx-auto p-8 bg-green-50 border border-green-200 rounded-3xl flex flex-col items-center">
            <h3 className="text-2xl font-bold text-green-800 mb-3">🎉 Berhasil Dikonversi!</h3>
            <p className="text-sm text-green-600 mb-4">Teks dalam PDF bisa di-select dan dicopy ✅</p>
            <button onClick={() => saveAs(downloadUrl, downloadFilename)}
              className="w-full sm:w-auto px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-bold text-lg rounded-2xl shadow-md">
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
