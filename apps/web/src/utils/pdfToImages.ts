import JSZip from 'jszip';

/**
 * Convert all pages of a PDF file to JPEG images using pdfjs-dist (client-side).
 * @param file The PDF file to convert
 * @param dpi The resolution for rendering (default: 150)
 * @param quality JPEG quality 0-1 (default: 0.92)
 * @returns Array of { name, blob } for each page
 */
export async function convertPdfToImages(
  file: File,
  dpi: number = 150,
  quality: number = 0.92,
  onProgress?: (current: number, total: number) => void
): Promise<{ name: string; blob: Blob }[]> {
  const pdfjsLib = await import('pdfjs-dist');

  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  const baseName = file.name.replace(/\.[^/.]+$/, '');
  const results: { name: string; blob: Blob }[] = [];

  // Scale factor: PDF default is 72 DPI, so scale = targetDPI / 72
  const scale = dpi / 72;

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context not available');

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: context, viewport }).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to create JPEG blob'))),
        'image/jpeg',
        quality
      );
    });

    results.push({ name: `${baseName}_page_${i}.jpg`, blob });

    // Clean up canvas to free memory
    canvas.width = 0;
    canvas.height = 0;

    onProgress?.(i, totalPages);
  }

  return results;
}

/**
 * Bundle multiple image blobs into a ZIP file.
 */
export async function bundleImagesToZip(
  images: { name: string; blob: Blob }[]
): Promise<Blob> {
  const zip = new JSZip();
  for (const img of images) {
    zip.file(img.name, img.blob);
  }
  return zip.generateAsync({ type: 'blob' });
}
