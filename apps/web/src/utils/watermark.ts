import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';

export type NumberPosition = 
  | 'top-left' | 'top-center' | 'top-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface PageNumberOptions {
  enabled: boolean;
  position: NumberPosition;
  format: string; // e.g. "Halaman {x} dari {y}", "Halaman {x}", "{x}"
  fontSize: number;
  margin: number;
  colorHex: string; // e.g. "#333333"
}

export interface WatermarkOptions {
  enabled: boolean;
  type: 'text' | 'image';
  text?: string;
  imageFile?: File | null;
  fontSize?: number;
  colorHex?: string;
  opacity: number;
  rotationDegree: number;
  scale?: number;
}

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  const r = ((bigint >> 16) & 255) / 255;
  const g = ((bigint >> 8) & 255) / 255;
  const b = (bigint & 255) / 255;
  return rgb(r, g, b);
}

export async function applyWatermarkAndNumbering(
  pdfBuffer: ArrayBuffer,
  numberOpts: PageNumberOptions,
  watermarkOpts: WatermarkOptions,
  onProgress?: (current: number, total: number) => void
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;

  let embeddedImage: any = null;
  if (watermarkOpts.enabled && watermarkOpts.type === 'image' && watermarkOpts.imageFile) {
    const imgBytes = await watermarkOpts.imageFile.arrayBuffer();
    const isPng = watermarkOpts.imageFile.type.includes('png') || watermarkOpts.imageFile.name.toLowerCase().endsWith('.png');
    if (isPng) {
      embeddedImage = await pdfDoc.embedPng(imgBytes);
    } else {
      embeddedImage = await pdfDoc.embedJpg(imgBytes);
    }
  }

  for (let i = 0; i < totalPages; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();
    const pageNum = i + 1;

    // 1. Apply Watermark
    if (watermarkOpts.enabled) {
      if (watermarkOpts.type === 'text' && watermarkOpts.text) {
        const wmText = watermarkOpts.text;
        const fontSize = watermarkOpts.fontSize || 50;
        const textWidth = fontBold.widthOfTextAtSize(wmText, fontSize);
        const textHeight = fontBold.heightAtSize(fontSize);
        const color = hexToRgb(watermarkOpts.colorHex || '#999999');

        page.drawText(wmText, {
          x: width / 2 - textWidth / 2,
          y: height / 2 - textHeight / 2,
          size: fontSize,
          font: fontBold,
          color,
          opacity: watermarkOpts.opacity,
          rotate: degrees(watermarkOpts.rotationDegree || 45),
        });
      } else if (watermarkOpts.type === 'image' && embeddedImage) {
        const scale = watermarkOpts.scale || 0.5;
        const imgWidth = embeddedImage.width * scale;
        const imgHeight = embeddedImage.height * scale;

        page.drawImage(embeddedImage, {
          x: width / 2 - imgWidth / 2,
          y: height / 2 - imgHeight / 2,
          width: imgWidth,
          height: imgHeight,
          opacity: watermarkOpts.opacity,
          rotate: degrees(watermarkOpts.rotationDegree || 0),
        });
      }
    }

    // 2. Apply Page Numbering
    if (numberOpts.enabled) {
      const text = numberOpts.format
        .replace(/{x}/g, String(pageNum))
        .replace(/{y}/g, String(totalPages));
      
      const fontSize = numberOpts.fontSize || 10;
      const margin = numberOpts.margin || 20;
      const color = hexToRgb(numberOpts.colorHex || '#333333');
      const textWidth = font.widthOfTextAtSize(text, fontSize);

      let x = margin;
      let y = margin;

      // Vertical position
      if (numberOpts.position.startsWith('top')) {
        y = height - margin - fontSize;
      } else {
        y = margin;
      }

      // Horizontal position
      if (numberOpts.position.endsWith('left')) {
        x = margin;
      } else if (numberOpts.position.endsWith('center')) {
        x = width / 2 - textWidth / 2;
      } else if (numberOpts.position.endsWith('right')) {
        x = width - margin - textWidth;
      }

      page.drawText(text, {
        x,
        y,
        size: fontSize,
        font,
        color,
      });
    }

    if (onProgress) {
      onProgress(pageNum, totalPages);
    }
  }

  return pdfDoc.save();
}
