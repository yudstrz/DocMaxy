'use client';

import React, { useState } from 'react';
import { SortableGrid, PDFDocument } from '@/components/SortableGrid';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import toast from 'react-hot-toast';
import { Check, AlertTriangle, CheckCircle2 } from 'lucide-react';

// ── Yield to browser event loop ───────────────────────────────────────────────
const yieldToBrowser = () => new Promise<void>((r) => setTimeout(r, 0));

// ── Layout constants (mm, A4) ─────────────────────────────────────────────────
const PAGE_W    = 210;
const PAGE_H    = 297;
const MARGIN    = 22;
const MARGIN_T  = 22;
const MARGIN_B  = 20;
const CONTENT_W = PAGE_W - MARGIN * 2;   // 166 mm
const PT_TO_MM  = 0.352778;

// ── Inline Run — covers all DOCX inline formatting cases ─────────────────────
interface InlineRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;      // <u>
  strike: boolean;         // <s> / <del>
  code: boolean;           // <code> inline
  sup: boolean;            // <sup>
  sub: boolean;            // <sub>
  link?: string;           // <a href="..."> — renders blue + underlined
  color?: string;          // text color (from style)
}

type TextAlign = 'left' | 'center' | 'right';

// ── Render command types ──────────────────────────────────────────────────────
interface BlockCmd    { kind: 'block';     runs: InlineRun[]; fontSize: number; bold: boolean; indent: number; prefix?: string; spaceAfter?: number; align?: TextAlign }
interface PreCmd      { kind: 'pre';       text: string }                        // <pre> code block
interface ImgCmd      { kind: 'img';       src: string }
interface HrCmd       { kind: 'hr' }
interface SpaceCmd    { kind: 'space';     mm: number }
interface TableCmd    { kind: 'table';     rows: { cells: string[]; isHeader: boolean }[] }

type RenderCmd = BlockCmd | PreCmd | ImgCmd | HrCmd | SpaceCmd | TableCmd;

// ── Run state (propagated down the DOM) ──────────────────────────────────────
interface RunState { bold: boolean; italic: boolean; underline: boolean; strike: boolean; code: boolean; sup: boolean; sub: boolean; link?: string }
const DEFAULT_STATE: RunState = { bold: false, italic: false, underline: false, strike: false, code: false, sup: false, sub: false };

function fStyle(b: boolean, i: boolean) {
  if (b && i) return 'bolditalic';
  if (b)      return 'bold';
  if (i)      return 'italic';
  return 'normal';
}

// ── extractRuns — all inline formatting cases ─────────────────────────────────
function extractRuns(node: Node, st: RunState = DEFAULT_STATE): InlineRun[] {
  const out: InlineRun[] = [];

  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const t = child.textContent ?? '';
      if (t) out.push({ text: t, bold: st.bold, italic: st.italic, underline: st.underline, strike: st.strike, code: st.code, sup: st.sup, sub: st.sub, link: st.link });
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const el  = child as Element;
    const tag = el.tagName.toLowerCase();
    const s: RunState = { ...st };

    switch (tag) {
      case 'strong': case 'b':        s.bold      = true; break;
      case 'em':     case 'i':        s.italic    = true; break;
      case 'u':                        s.underline = true; break;
      case 's': case 'del': case 'strike': s.strike = true; break;
      case 'code':                    s.code      = true; break;
      case 'sup':                     s.sup       = true; break;
      case 'sub':                     s.sub       = true; break;
      case 'br': out.push({ text: '\n', bold: st.bold, italic: st.italic, underline: false, strike: false, code: false, sup: false, sub: false }); continue;
      case 'a': {
        const href = el.getAttribute('href');
        if (href && !href.startsWith('#')) { s.link = href; s.underline = true; }
        break;
      }
      case 'span': {
        const style = (el.getAttribute('style') ?? '').toLowerCase();
        if (style.includes('font-weight:bold') || style.includes('font-weight: bold')) s.bold = true;
        if (style.includes('font-style:italic') || style.includes('font-style: italic')) s.italic = true;
        if (style.includes('text-decoration:underline') || style.includes('text-decoration: underline')) s.underline = true;
        if (style.includes('line-through')) s.strike = true;
        // color: parse rgb/hex
        const colorMatch = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/);
        if (colorMatch) {
          // keep color as-is for now (basic support)
        }
        break;
      }
    }

    out.push(...extractRuns(el, s));
  }

  return out;
}

// ── Extract direct runs from <li> (skip nested lists) ────────────────────────
function extractDirectRuns(li: Element): InlineRun[] {
  const out: InlineRun[] = [];
  for (const child of li.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const t = child.textContent ?? '';
      if (t.trim()) out.push({ text: t, bold: false, italic: false, underline: false, strike: false, code: false, sup: false, sub: false });
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      const tag = el.tagName.toLowerCase();
      if (tag === 'ul' || tag === 'ol') continue;
      out.push(...extractRuns(el, DEFAULT_STATE));
    }
  }
  return out;
}

// ── Detect text-align from element style/attribute ───────────────────────────
function getAlign(el: Element): TextAlign {
  const style = (el.getAttribute('style') ?? '').toLowerCase();
  const attr  = (el.getAttribute('align') ?? '').toLowerCase();
  if (style.includes('text-align:center') || style.includes('text-align: center') || attr === 'center') return 'center';
  if (style.includes('text-align:right')  || style.includes('text-align: right')  || attr === 'right')  return 'right';
  return 'left';
}

// ── HTML → RenderCmd[] ────────────────────────────────────────────────────────
function htmlToCommands(html: string): RenderCmd[] {
  const cmds: RenderCmd[] = [];
  const dom = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');

  const HEADINGS: Record<string, { size: number; before: number; after: number }> = {
    h1: { size: 24, before: 5,   after: 2   },
    h2: { size: 20, before: 4,   after: 1.5 },
    h3: { size: 16, before: 3.5, after: 1   },
    h4: { size: 13, before: 3,   after: 0.5 },
    h5: { size: 12, before: 2.5, after: 0.5 },
    h6: { size: 11, before: 2,   after: 0.5 },
  };

  function walk(parent: Element, indent = 0) {
    for (const el of parent.children) processEl(el, indent);
  }

  function processEl(el: Element, indent = 0) {
    const tag = el.tagName.toLowerCase();

    // ── Headings ──────────────────────────────────────────────────────────────
    if (HEADINGS[tag]) {
      const h = HEADINGS[tag];
      cmds.push({ kind: 'space', mm: h.before });
      cmds.push({ kind: 'block', runs: extractRuns(el, { ...DEFAULT_STATE, bold: true }), fontSize: h.size, bold: true, indent, spaceAfter: h.after, align: getAlign(el) });
      return;
    }

    switch (tag) {
      // ── Paragraph ──────────────────────────────────────────────────────────
      case 'p': {
        const runs = extractRuns(el);
        if (runs.some(r => r.text.trim())) {
          cmds.push({ kind: 'block', runs, fontSize: 11, bold: false, indent, spaceAfter: 1.5, align: getAlign(el) });
        } else {
          cmds.push({ kind: 'space', mm: 2 });
        }
        break;
      }

      // ── Pre / code block ───────────────────────────────────────────────────
      case 'pre': {
        const text = el.textContent ?? '';
        if (text.trim()) {
          cmds.push({ kind: 'space', mm: 2 });
          cmds.push({ kind: 'pre', text });
          cmds.push({ kind: 'space', mm: 2 });
        }
        break;
      }

      // ── Horizontal rule ────────────────────────────────────────────────────
      case 'hr':
        cmds.push({ kind: 'space', mm: 2 });
        cmds.push({ kind: 'hr' });
        cmds.push({ kind: 'space', mm: 2 });
        break;

      // ── Line break ─────────────────────────────────────────────────────────
      case 'br':
        cmds.push({ kind: 'space', mm: 2 });
        break;

      // ── Blockquote ─────────────────────────────────────────────────────────
      case 'blockquote':
        cmds.push({ kind: 'space', mm: 1 });
        walk(el, indent + 8);
        cmds.push({ kind: 'space', mm: 1 });
        break;

      // ── Center (old HTML tag) ──────────────────────────────────────────────
      case 'center':
        for (const child of el.children) {
          const runs = extractRuns(child);
          if (runs.some(r => r.text.trim()))
            cmds.push({ kind: 'block', runs, fontSize: 11, bold: false, indent, spaceAfter: 1.5, align: 'center' });
        }
        break;

      // ── Unordered list ─────────────────────────────────────────────────────
      case 'ul':
        processUL(el, indent);
        break;

      // ── Ordered list ───────────────────────────────────────────────────────
      case 'ol':
        processOL(el, indent);
        break;

      // ── Table ──────────────────────────────────────────────────────────────
      case 'table':
        processTable(el);
        break;

      // ── Image ──────────────────────────────────────────────────────────────
      case 'img': {
        const src = el.getAttribute('src') ?? '';
        if (src.startsWith('data:')) {
          cmds.push({ kind: 'img', src });
          cmds.push({ kind: 'space', mm: 2 });
        }
        break;
      }

      // ── Figure / picture ───────────────────────────────────────────────────
      case 'figure': case 'picture':
        walk(el, indent);
        break;

      // ── Containers ─────────────────────────────────────────────────────────
      case 'div': case 'section': case 'article': case 'main': case 'header': case 'footer': case 'aside':
        walk(el, indent);
        break;

      // ── Inline as block (rare) ─────────────────────────────────────────────
      default:
        if (el.children.length > 0) walk(el, indent);
        else {
          const t = el.textContent?.trim();
          if (t) cmds.push({ kind: 'block', runs: [{ text: t, bold: false, italic: false, underline: false, strike: false, code: false, sup: false, sub: false }], fontSize: 11, bold: false, indent });
        }
    }
  }

  function processUL(ul: Element, indent: number) {
    for (const li of ul.children) {
      if (li.tagName.toLowerCase() !== 'li') continue;
      const runs = extractDirectRuns(li);
      if (runs.some(r => r.text.trim()))
        cmds.push({ kind: 'block', runs, fontSize: 11, bold: false, indent: indent + 4, prefix: '•  ', spaceAfter: 0.8 });
      for (const nested of li.children) {
        const nt = nested.tagName.toLowerCase();
        if (nt === 'ul') processUL(nested, indent + 6);
        else if (nt === 'ol') processOL(nested, indent + 6);
      }
    }
  }

  function processOL(ol: Element, indent: number) {
    let n = 0;
    for (const li of ol.children) {
      if (li.tagName.toLowerCase() !== 'li') continue;
      n++;
      const runs = extractDirectRuns(li);
      if (runs.some(r => r.text.trim()))
        cmds.push({ kind: 'block', runs, fontSize: 11, bold: false, indent: indent + 4, prefix: `${n}.  `, spaceAfter: 0.8 });
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
      if (!cells.length) continue;
      tableRows.push({
        cells: cells.map(c => c.textContent?.trim() ?? ''),
        isHeader: cells.some(c => c.tagName.toLowerCase() === 'th'),
      });
    }
    if (tableRows.length) {
      cmds.push({ kind: 'space', mm: 2 });
      cmds.push({ kind: 'table', rows: tableRows });
      cmds.push({ kind: 'space', mm: 2 });
    }
  }

  walk(dom.body);
  return cmds;
}

// ── PDF Renderer ──────────────────────────────────────────────────────────────
class PdfRenderer {
  private pdf: any;
  y: number = MARGIN_T;

  constructor(pdf: any) { this.pdf = pdf; this.y = MARGIN_T; }

  addSpace(mm: number) {
    this.y += mm;
    if (this.y > PAGE_H - MARGIN_B) { this.pdf.addPage(); this.y = MARGIN_T; }
  }

  checkPage(needed: number) {
    if (this.y + needed > PAGE_H - MARGIN_B) { this.pdf.addPage(); this.y = MARGIN_T; }
  }

  private setFont(bold: boolean, italic: boolean, size: number) {
    this.pdf.setFont(/* code runs */ false ? 'courier' : 'helvetica', fStyle(bold, italic));
    this.pdf.setFontSize(size);
  }

  private setCodeFont(bold: boolean, size: number) {
    this.pdf.setFont('courier', bold ? 'bold' : 'normal');
    this.pdf.setFontSize(size);
  }

  drawHR() {
    this.checkPage(4);
    this.pdf.setDrawColor(180, 180, 180);
    this.pdf.setLineWidth(0.3);
    this.pdf.line(MARGIN, this.y, MARGIN + CONTENT_W, this.y);
    this.y += 3;
  }

  // ── Render inline runs word-by-word with ALL formatting ─────────────────────
  renderInlineRuns(runs: InlineRun[], fontSize: number, startX: number, maxW: number) {
    const lineH  = fontSize * PT_TO_MM * 1.5;
    let x = startX;

    for (const run of runs) {
      const effectiveFs = (run.sup || run.sub) ? fontSize * 0.65 : fontSize;
      const yOffset     = run.sup ? -fontSize * PT_TO_MM * 0.5
                        : run.sub ? fontSize * PT_TO_MM * 0.25 : 0;

      // Font selection
      if (run.code) {
        this.setCodeFont(run.bold, effectiveFs);
      } else {
        this.pdf.setFont('helvetica', fStyle(run.bold, run.italic));
        this.pdf.setFontSize(effectiveFs);
      }

      // Color — links = blue, default = near-black
      if (run.link) {
        this.pdf.setTextColor(15, 80, 200);
      } else {
        this.pdf.setTextColor(20, 20, 20);
      }

      // Word-by-word with newline handling
      const lines = run.text.split('\n');
      for (let li = 0; li < lines.length; li++) {
        if (li > 0) { this.y += lineH; this.checkPage(lineH); x = startX; }

        const tokens = lines[li].split(/(\s+)/);
        for (const token of tokens) {
          if (!token) continue;
          const isWS = !token.trim();
          const tw   = this.pdf.getTextWidth(token);

          if (isWS) { if (x > startX) x += tw; continue; }

          // Wrap
          if (x > startX && x + tw > startX + maxW) {
            this.y += lineH; this.checkPage(lineH); x = startX;
          }

          const tokenX = x;
          this.pdf.text(token, x, this.y + yOffset);
          x += tw;

          // Underline decoration
          if (run.underline || run.link) {
            this.pdf.setDrawColor(run.link ? 15 : 20, run.link ? 80 : 20, run.link ? 200 : 20);
            this.pdf.setLineWidth(0.2);
            this.pdf.line(tokenX, this.y + yOffset + effectiveFs * PT_TO_MM * 0.18, x, this.y + yOffset + effectiveFs * PT_TO_MM * 0.18);
          }

          // Strikethrough decoration
          if (run.strike) {
            this.pdf.setDrawColor(80, 80, 80);
            this.pdf.setLineWidth(0.2);
            const midY = this.y + yOffset - effectiveFs * PT_TO_MM * 0.25;
            this.pdf.line(tokenX, midY, x, midY);
          }

          // Hyperlink clickable area
          if (run.link) {
            try {
              this.pdf.link(tokenX, this.y - effectiveFs * PT_TO_MM, tw, lineH, { url: run.link });
            } catch { /* ignore if link() not supported */ }
          }
        }
      }
    }

    this.pdf.setTextColor(20, 20, 20); // reset
    this.y += lineH;
  }

  // ── Render text block (paragraph / heading / list item) ──────────────────────
  renderBlock(cmd: BlockCmd) {
    const { runs, fontSize, bold, indent = 0, prefix, spaceAfter, align = 'left' } = cmd;
    const lineH = fontSize * PT_TO_MM * 1.5;
    this.checkPage(lineH * 1.5);

    // ── CENTER / RIGHT alignment — simplified rendering ──────────────────────
    if (align !== 'left') {
      const fullText = runs.map(r => r.text.replace('\n', ' ')).join('');
      this.pdf.setFont('helvetica', bold ? 'bold' : 'normal');
      this.pdf.setFontSize(fontSize);
      this.pdf.setTextColor(20, 20, 20);
      const wrapped: string[] = this.pdf.splitTextToSize(fullText, CONTENT_W - indent);
      for (const line of wrapped) {
        this.checkPage(lineH);
        const lw = this.pdf.getTextWidth(String(line));
        const sx = align === 'center'
          ? MARGIN + indent + (CONTENT_W - indent - lw) / 2
          : MARGIN + CONTENT_W - lw;
        this.pdf.text(String(line), sx, this.y);
        this.y += lineH;
      }
      if (spaceAfter) this.y += spaceAfter;
      return;
    }

    // ── LEFT alignment — per-run rendering with all decorations ──────────────
    let textX = MARGIN + indent;
    let maxW  = CONTENT_W - indent;

    if (prefix) {
      this.pdf.setFont('helvetica', 'normal');
      this.pdf.setFontSize(fontSize);
      this.pdf.setTextColor(20, 20, 20);
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

  // ── Pre / code block ─────────────────────────────────────────────────────────
  renderPre(text: string) {
    const fs    = 8.5;  // pt
    const lineH = fs * PT_TO_MM * 1.4;
    const lines = text.split('\n');
    const pad   = 2.5;  // mm
    const blockH = lines.length * lineH + pad * 2;

    this.checkPage(Math.min(blockH, 60) + 4);

    // Gray background
    this.pdf.setFillColor(240, 241, 244);
    this.pdf.setDrawColor(200, 202, 210);
    this.pdf.setLineWidth(0.2);
    this.pdf.rect(MARGIN, this.y, CONTENT_W, Math.min(blockH, PAGE_H - MARGIN_T - MARGIN_B - this.y), 'FD');

    this.setCodeFont(false, fs);
    this.pdf.setTextColor(30, 30, 50);

    let codeY = this.y + pad + lineH * 0.85;
    for (const line of lines) {
      if (codeY > PAGE_H - MARGIN_B - lineH) {
        this.pdf.addPage();
        this.y = MARGIN_T;
        // Continue gray background on new page
        this.pdf.setFillColor(240, 241, 244);
        const remaining = lines.slice(lines.indexOf(line)).length;
        this.pdf.rect(MARGIN, this.y, CONTENT_W, remaining * lineH + pad * 2, 'FD');
        codeY = this.y + pad + lineH * 0.85;
      }
      // Truncate very long code lines
      const truncated = line.length > 120 ? line.slice(0, 117) + '...' : line;
      this.pdf.text(truncated, MARGIN + pad, codeY);
      codeY += lineH;
    }

    this.y = codeY + pad;
    this.pdf.setTextColor(20, 20, 20); // reset
  }

  // ── Embed image ──────────────────────────────────────────────────────────────
  async renderImage(src: string) {
    const fmtMatch = src.match(/^data:image\/(jpeg|jpg|png|webp|gif)/i);
    if (!fmtMatch) return;
    const fmt = /png/i.test(fmtMatch[1]) ? 'PNG' : 'JPEG';

    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const pxPerMm = 96 / 25.4;
        let dw = img.naturalWidth  / pxPerMm;
        let dh = img.naturalHeight / pxPerMm;
        const maxW = CONTENT_W, maxH = 160;
        if (dw > maxW) { dh *= maxW / dw; dw = maxW; }
        if (dh > maxH) { dw *= maxH / dh; dh = maxH; }
        this.checkPage(dh + 4);
        try { this.pdf.addImage(src, fmt, MARGIN, this.y, dw, dh); this.y += dh + 3; } catch { /* skip */ }
        resolve();
      };
      img.onerror = () => resolve();
      img.src = src;
    });
  }

  // ── Render table (multiline cells, proper draw order) ────────────────────────
  renderTable(rows: { cells: string[]; isHeader: boolean }[]) {
    if (!rows.length) return;
    const cols  = Math.max(...rows.map(r => r.cells.length));
    if (!cols)   return;
    const cellW = CONTENT_W / cols;
    const pad   = 2, fs = 9, lineH = fs * PT_TO_MM * 1.45;

    for (const row of rows) {
      let maxLines = 1;
      for (let ci = 0; ci < cols; ci++) {
        this.pdf.setFont('helvetica', row.isHeader ? 'bold' : 'normal');
        this.pdf.setFontSize(fs);
        const wrapped = this.pdf.splitTextToSize(row.cells[ci] ?? '', cellW - pad * 2);
        maxLines = Math.max(maxLines, Array.isArray(wrapped) ? wrapped.length : 1);
      }
      const rowH = maxLines * lineH + pad * 2;
      this.checkPage(rowH + 1);

      this.pdf.setDrawColor(150, 155, 170);
      this.pdf.setLineWidth(0.25);

      for (let ci = 0; ci < cols; ci++) {
        const cx = MARGIN + ci * cellW;
        if (row.isHeader) { this.pdf.setFillColor(220, 228, 245); this.pdf.rect(cx, this.y, cellW, rowH, 'FD'); }
        else              { this.pdf.setFillColor(255, 255, 255); this.pdf.rect(cx, this.y, cellW, rowH, 'D'); }

        const text = row.cells[ci] ?? '';
        this.pdf.setFont('helvetica', row.isHeader ? 'bold' : 'normal');
        this.pdf.setFontSize(fs);
        this.pdf.setTextColor(20, 20, 20);
        const wrappedLines = this.pdf.splitTextToSize(text, cellW - pad * 2);
        const lines: string[] = Array.isArray(wrappedLines) ? wrappedLines : [wrappedLines];
        for (let li = 0; li < lines.length; li++) {
          this.pdf.text(String(lines[li]), cx + pad, this.y + pad + lineH * (li + 0.85));
        }
      }
      this.y += rowH;
    }
    this.y += 2;
  }
}

// ── Main conversion function ──────────────────────────────────────────────────
async function convertWordToPdf(
  file: File,
  onProgress: (step: string, pct: number) => void
): Promise<Blob> {
  onProgress('Membaca dokumen...', 5);
  await yieldToBrowser();

  const mammoth = await import('mammoth');
  const jsPDF   = (await import('jspdf')).default;

  const arrayBuffer = await file.arrayBuffer();

  onProgress('Mengekstrak konten Word...', 20);
  await yieldToBrowser();

  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      styleMap: [
        // Headings
        "p[style-name='Heading 1']    => h1:fresh",
        "p[style-name='Heading 2']    => h2:fresh",
        "p[style-name='Heading 3']    => h3:fresh",
        "p[style-name='Heading 4']    => h4:fresh",
        "p[style-name='Title']        => h1:fresh",
        "p[style-name='Subtitle']     => h2:fresh",
        "p[style-name='Quote']        => blockquote > p:fresh",
        "p[style-name='Intense Quote']=> blockquote > p:fresh",
        // Inline formatting
        "u          => u",
        "strike     => s",
        "s          => s",
        "sup        => sup",
        "sub        => sub",
      ],
      convertImage: mammoth.images.imgElement((image: any) =>
        image.read('base64').then((b64: string) => ({
          src: `data:${image.contentType};base64,${b64}`,
        }))
      ),
    }
  );

  onProgress('Membangun struktur halaman...', 38);
  await yieldToBrowser();

  const cmds = htmlToCommands(result.value);

  onProgress('Merender PDF...', 52);
  await yieldToBrowser();

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  pdf.setTextColor(20, 20, 20);

  const renderer = new PdfRenderer(pdf);

  for (let i = 0; i < cmds.length; i++) {
    if (i > 0 && i % 20 === 0) {
      await yieldToBrowser();
      onProgress(`Merender konten (${i}/${cmds.length})...`, 52 + Math.round((i / cmds.length) * 44));
    }

    const cmd = cmds[i];
    switch (cmd.kind) {
      case 'block': renderer.renderBlock(cmd);           break;
      case 'pre':   renderer.renderPre(cmd.text);        break;
      case 'img':   await renderer.renderImage(cmd.src); break;
      case 'hr':    renderer.drawHR();                   break;
      case 'space': renderer.addSpace(cmd.mm);           break;
      case 'table': renderer.renderTable(cmd.rows);      break;
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
    setDocuments(prev => [...prev, ...Array.from(files).map(f => ({
      id: crypto.randomUUID(), file: f, thumbnail: null,
    }))]);
  };

  const handleConvert = async () => {
    if (documents.length === 0) { toast.error('Pilih minimal 1 file Word.'); return; }

    const totalMB = documents.reduce((s, d) => s + d.file.size, 0) / 1048576;
    if (totalMB > 200)
      toast(`File besar (${totalMB.toFixed(0)} MB) — proses mungkin beberapa menit, jangan tutup tab.`, { duration: 7000, icon: '⏳' });

    setIsProcessing(true);
    setDownloadUrl(null);
    setProgress(null);

    try {
      const results: { name: string; blob: Blob }[] = [];

      for (const doc of documents) {
        const blob = await convertWordToPdf(doc.file, (step, pct) => setProgress({ step, pct }));
        results.push({ name: `${doc.file.name.replace(/\.[^/.]+$/, '')}.pdf`, blob });
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
            Ubah .docx menjadi PDF dengan teks selectable. Mendukung tabel, gambar, bold/italic,
            underline, strikethrough, link, kode, heading, list, dan lebih. (100% di perangkat Anda)
          </p>
        </div>

        <SortableGrid
          items={documents} setItems={setDocuments} onAddFiles={handleAddFiles}
          accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
          uploadLabel="Pilih File Word"
        />

        {documents.length > 0 && !downloadUrl && (
          <div className="max-w-3xl mx-auto mt-12 bg-white p-8 rounded-3xl shadow-sm border border-slate-200">

            {!isProcessing && (
              <div className="mb-6 grid grid-cols-2 gap-3 text-sm">
                {[
                  { isWarning: false, label: 'Heading H1–H6' },
                  { isWarning: false, label: 'Bold / Italic / Underline' },
                  { isWarning: false, label: 'Strikethrough' },
                  { isWarning: false, label: 'Hyperlink (klik di PDF)' },
                  { isWarning: false, label: 'Bullet & Numbered List' },
                  { isWarning: false, label: 'Tabel dengan multiline cell' },
                  { isWarning: false, label: 'Gambar embedded' },
                  { isWarning: false, label: 'Code block (monospace)' },
                  { isWarning: false, label: 'Superscript / Subscript' },
                  { isWarning: false, label: 'Center & Right alignment' },
                  { isWarning: false, label: 'Blockquote' },
                  { isWarning: true, label: 'Header/footer halaman (keterbatasan browser)' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                    {item.isWarning ? (
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    ) : (
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    )}
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            )}

            {isProcessing && progress && (
              <div className="mb-6">
                <div className="flex justify-between text-sm text-slate-500 mb-2">
                  <span>{progress.step}</span>
                  <span>{progress.pct}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-3">
                  <div className="bg-blue-500 h-3 rounded-full transition-all duration-300" style={{ width: `${progress.pct}%` }} />
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
                {isProcessing ? 'Memproses di perangkat...' : 'Konversi ke PDF'}
              </button>
            </div>
          </div>
        )}

        {downloadUrl && (
          <div className="mt-8 max-w-3xl mx-auto p-8 bg-green-50 dark:bg-emerald-950/40 border border-green-200 dark:border-emerald-900 rounded-3xl flex flex-col items-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 dark:text-emerald-400 mb-3" />
            <h3 className="text-2xl font-bold text-green-800 dark:text-emerald-200 mb-1">Berhasil Dikonversi!</h3>
            <p className="text-sm text-green-600 dark:text-emerald-400 mb-4 flex items-center gap-1">
              <span>Teks dapat di-select, link dapat diklik</span>
            </p>
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
