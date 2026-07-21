/**
 * Convert a PDF file to Markdown text using pdfjs-dist text extraction (client-side).
 * Detects headings based on font size, preserves paragraph structure.
 */
export async function convertPdfToMarkdown(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');

  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  const allPages: string[] = [];

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    // Collect text items with font size info
    interface TextItem {
      text: string;
      fontSize: number;
      y: number;
      x: number;
    }

    const items: TextItem[] = [];
    for (const item of textContent.items) {
      if ('str' in item && item.str.trim()) {
        const fontSize = ('transform' in item && Array.isArray(item.transform))
          ? Math.abs(item.transform[0])
          : 12;
        const y = ('transform' in item && Array.isArray(item.transform))
          ? item.transform[5]
          : 0;
        const x = ('transform' in item && Array.isArray(item.transform))
          ? item.transform[4]
          : 0;
        items.push({ text: item.str, fontSize, y, x });
      }
    }

    if (items.length === 0) continue;

    // Calculate average font size to detect headings
    const avgFontSize = items.reduce((sum, it) => sum + it.fontSize, 0) / items.length;

    // Group items by Y position (same line) with tolerance
    const lines: { texts: TextItem[]; y: number }[] = [];
    const Y_TOLERANCE = 3;

    for (const item of items) {
      const existingLine = lines.find(l => Math.abs(l.y - item.y) < Y_TOLERANCE);
      if (existingLine) {
        existingLine.texts.push(item);
      } else {
        lines.push({ texts: [item], y: item.y });
      }
    }

    // Sort lines by Y position (top to bottom, PDF Y is bottom-up so reverse)
    lines.sort((a, b) => b.y - a.y);

    // Build markdown for this page
    const pageLines: string[] = [];
    for (const line of lines) {
      // Sort items within line by X position (left to right)
      line.texts.sort((a, b) => a.x - b.x);
      const lineText = line.texts.map(t => t.text).join(' ').trim();
      if (!lineText) continue;

      // Detect heading based on font size relative to average
      const maxFontSize = Math.max(...line.texts.map(t => t.fontSize));

      if (maxFontSize > avgFontSize * 1.6) {
        pageLines.push(`\n# ${lineText}\n`);
      } else if (maxFontSize > avgFontSize * 1.3) {
        pageLines.push(`\n## ${lineText}\n`);
      } else if (maxFontSize > avgFontSize * 1.1) {
        pageLines.push(`\n### ${lineText}\n`);
      } else {
        // Detect list items
        if (/^[\u2022\u2023\u25E6\u2043\u2219•‣◦⁃∙●○]\s*/.test(lineText)) {
          pageLines.push(`- ${lineText.replace(/^[\u2022\u2023\u25E6\u2043\u2219•‣◦⁃∙●○]\s*/, '')}`);
        } else if (/^\d+[.)]\s/.test(lineText)) {
          pageLines.push(lineText);
        } else {
          pageLines.push(lineText);
        }
      }
    }

    if (pageLines.length > 0) {
      allPages.push(pageLines.join('\n'));
    }

    onProgress?.(i, totalPages);
  }

  return allPages.join('\n\n---\n\n');
}
