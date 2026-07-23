import { PDFDocument, degrees } from 'pdf-lib';

export interface PageItem {
  id: string;
  sourceFileIndex: number;
  pageIndex: number; // 0-indexed in original PDF
  rotation: number;  // 0, 90, 180, 270
  isBlank?: boolean;
  thumbnailUrl?: string | null;
}

export async function generateOrganizedPDF(
  sourceFiles: File[],
  pages: PageItem[],
  onProgress?: (current: number, total: number) => void
): Promise<Uint8Array> {
  const outDoc = await PDFDocument.create();

  // Load all source PDF documents
  const loadedPdfDocs: PDFDocument[] = [];
  for (const file of sourceFiles) {
    const buffer = await file.arrayBuffer();
    const doc = await PDFDocument.load(buffer);
    loadedPdfDocs.push(doc);
  }

  for (let i = 0; i < pages.length; i++) {
    const pageItem = pages[i];

    if (pageItem.isBlank) {
      // Add standard A4 blank page (595.28 x 841.89 pt)
      const blankPage = outDoc.addPage([595.28, 841.89]);
      if (pageItem.rotation) {
        blankPage.setRotation(degrees(pageItem.rotation));
      }
    } else {
      const srcDoc = loadedPdfDocs[pageItem.sourceFileIndex];
      if (srcDoc) {
        const [copiedPage] = await outDoc.copyPages(srcDoc, [pageItem.pageIndex]);
        if (pageItem.rotation) {
          const currentRotation = copiedPage.getRotation().angle;
          copiedPage.setRotation(degrees((currentRotation + pageItem.rotation) % 360));
        }
        outDoc.addPage(copiedPage);
      }
    }

    if (onProgress) {
      onProgress(i + 1, pages.length);
    }
  }

  return outDoc.save();
}
