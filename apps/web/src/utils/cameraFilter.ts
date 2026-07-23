export type CameraFilterMode =
  | 'original'
  | 'sharp_text'   // Teks Tajam & Latar Putih (High-contrast Document Focus)
  | 'enhance'      // Magic Color (CamScanner Signature)
  | 'magic_color'  // Color Document (White background + Preserve color stamps/ink)
  | 'lighten'      // Lighten Document
  | 'bw'           // High-contrast Black & White
  | 'grayscale';   // Clean Grayscale

export interface Point {
  x: number;
  y: number;
}

/**
 * Advanced Document Scanner Filter Engine:
 * - High-pass unsharp mask convolution to remove camera lens blur.
 * - Adaptive background whitening to erase paper shadows & yellowing.
 * - Contrast amplification for handwriting, pencil, pen, and printed text.
 */
export async function applyCameraFilter(
  imageSrc: string,
  mode: CameraFilterMode
): Promise<string> {
  if (mode === 'original') return imageSrc;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const W = img.width;
      const H = img.height;

      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, W, H);
      const srcData = imageData.data;

      // 1. Sharpness & High-Pass Edge Filter (Removes camera lens blur)
      let processedData = srcData;
      if (mode === 'sharp_text' || mode === 'enhance' || mode === 'magic_color' || mode === 'bw') {
        const outData = new Uint8ClampedArray(srcData.length);
        outData.set(srcData);

        // 3x3 Sharpen Convolution Kernel Matrix: [0, -0.4, 0], [-0.4, 2.6, -0.4], [0, -0.4, 0]
        const kCenter = 2.6;
        const kEdge = -0.4;

        for (let y = 1; y < H - 1; y += 2) {
          for (let x = 1; x < W - 1; x += 2) {
            const idx = (y * W + x) * 4;

            for (let c = 0; c < 3; c++) {
              const centerVal = srcData[idx + c];
              const topVal = srcData[((y - 1) * W + x) * 4 + c];
              const botVal = srcData[((y + 1) * W + x) * 4 + c];
              const leftVal = srcData[(y * W + (x - 1)) * 4 + c];
              const rightVal = srcData[(y * W + (x + 1)) * 4 + c];

              const sharpened = centerVal * kCenter + (topVal + botVal + leftVal + rightVal) * kEdge;
              outData[idx + c] = Math.min(255, Math.max(0, sharpened));
            }
          }
        }
        processedData = outData;
      }

      // 2. Calculate Luminance Statistics
      let minLum = 255;
      let maxLum = 0;
      let sumLum = 0;
      const step = 4;
      let sampleCount = 0;
      for (let i = 0; i < processedData.length; i += 4 * step) {
        const r = processedData[i];
        const g = processedData[i + 1];
        const b = processedData[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        sumLum += lum;
        if (lum < minLum) minLum = lum;
        if (lum > maxLum) maxLum = lum;
        sampleCount++;
      }

      const avgLum = sumLum / (sampleCount || 1);
      const shadowCutoff = Math.max(minLum + 15, avgLum * 0.78);
      const highlightCutoff = Math.min(maxLum - 10, avgLum * 1.15);

      const outImageData = ctx.createImageData(W, H);
      const out = outImageData.data;

      // 3. Pixel Transformation Pass
      for (let i = 0; i < processedData.length; i += 4) {
        const r = processedData[i];
        const g = processedData[i + 1];
        const b = processedData[i + 2];
        const a = processedData[i + 3];

        const gray = 0.299 * r + 0.587 * g + 0.114 * b;

        if (mode === 'grayscale') {
          const normGray = Math.min(255, Math.max(0, ((gray - shadowCutoff) / (highlightCutoff - shadowCutoff || 1)) * 255));
          out[i] = normGray;
          out[i + 1] = normGray;
          out[i + 2] = normGray;
          out[i + 3] = a;
        } else if (mode === 'sharp_text') {
          // Teks Tajam (Document Focus - Pure White Paper & Sharp Dark Text)
          if (gray > shadowCutoff + (highlightCutoff - shadowCutoff) * 0.35) {
            // Paper Background -> Force Pure White
            out[i] = 255;
            out[i + 1] = 255;
            out[i + 2] = 255;
          } else {
            // Handwriting / Text -> Deep Black Sharp Contrast
            const factor = Math.pow(gray / 255, 1.7);
            const textVal = Math.max(0, Math.min(255, factor * 200));
            out[i] = textVal;
            out[i + 1] = textVal;
            out[i + 2] = textVal;
          }
          out[i + 3] = a;
        } else if (mode === 'enhance') {
          // CamScanner Magic Color
          if (gray > shadowCutoff) {
            const boost = 1.35;
            out[i] = Math.min(255, r * boost + 25);
            out[i + 1] = Math.min(255, g * boost + 25);
            out[i + 2] = Math.min(255, b * boost + 25);
          } else {
            out[i] = Math.max(0, r * 0.75);
            out[i + 1] = Math.max(0, g * 0.75);
            out[i + 2] = Math.max(0, b * 0.75);
          }
          out[i + 3] = a;
        } else if (mode === 'magic_color') {
          // Color Document (White background + preserve red stamps / blue ink)
          if (gray > shadowCutoff) {
            out[i] = 255;
            out[i + 1] = 255;
            out[i + 2] = 255;
          } else {
            out[i] = Math.min(255, Math.max(0, (r - 10) * 1.15));
            out[i + 1] = Math.min(255, Math.max(0, (g - 10) * 1.15));
            out[i + 2] = Math.min(255, Math.max(0, (b - 10) * 1.15));
          }
          out[i + 3] = a;
        } else if (mode === 'bw') {
          // Crisp 1-bit Black & White Document
          const val = gray > shadowCutoff + (highlightCutoff - shadowCutoff) * 0.35 ? 255 : 0;
          out[i] = val;
          out[i + 1] = val;
          out[i + 2] = val;
          out[i + 3] = a;
        } else if (mode === 'lighten') {
          const factor = 1.25;
          out[i] = Math.min(255, r * factor);
          out[i + 1] = Math.min(255, g * factor);
          out[i + 2] = Math.min(255, b * factor);
          out[i + 3] = a;
        }
      }

      ctx.putImageData(outImageData, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.98));
    };

    img.onerror = () => reject(new Error('Failed to load image for filtering'));
    img.src = imageSrc;
  });
}

/**
 * Bilinear Quad Crop Transformation:
 * Warps a 4-corner polygon selection into a rectilinear cropped canvas.
 */
export async function cropPerspective(
  imageSrc: string,
  corners: [Point, Point, Point, Point] // TL, TR, BR, BL (normalized 0 to 1)
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const W = img.width;
      const H = img.height;

      // Absolute pixel coordinates
      const pTL = { x: corners[0].x * W, y: corners[0].y * H };
      const pTR = { x: corners[1].x * W, y: corners[1].y * H };
      const pBR = { x: corners[2].x * W, y: corners[2].y * H };
      const pBL = { x: corners[3].x * W, y: corners[3].y * H };

      // Target bounding dimensions
      const targetWidth = Math.max(
        Math.hypot(pTR.x - pTL.x, pTR.y - pTL.y),
        Math.hypot(pBR.x - pBL.x, pBR.y - pBL.y)
      );
      const targetHeight = Math.max(
        Math.hypot(pBL.x - pTL.x, pBL.y - pTL.y),
        Math.hypot(pBR.x - pTR.x, pBR.y - pTR.y)
      );

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(targetWidth);
      canvas.height = Math.round(targetHeight);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D not available'));
        return;
      }

      // Draw perspective mapping using subdivision sampling
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = W;
      srcCanvas.height = H;
      const srcCtx = srcCanvas.getContext('2d')!;
      srcCtx.drawImage(img, 0, 0);

      const destW = canvas.width;
      const destH = canvas.height;
      const outImgData = ctx.createImageData(destW, destH);
      const outData = outImgData.data;

      const srcImgData = srcCtx.getImageData(0, 0, W, H);
      const srcData = srcImgData.data;

      for (let y = 0; y < destH; y++) {
        const v = y / destH;
        const topX = pTL.x + (pTR.x - pTL.x) * v;
        const topY = pTL.y + (pTR.y - pTL.y) * v;
        const botX = pBL.x + (pBR.x - pBL.x) * v;
        const botY = pBL.y + (pBR.y - pBL.y) * v;

        for (let x = 0; x < destW; x++) {
          const u = x / destW;
          const srcX = Math.round(topX + (botX - topX) * u);
          const srcY = Math.round(topY + (botY - topY) * u);

          if (srcX >= 0 && srcX < W && srcY >= 0 && srcY < H) {
            const srcIdx = (srcY * W + srcX) * 4;
            const destIdx = (y * destW + x) * 4;

            outData[destIdx] = srcData[srcIdx];
            outData[destIdx + 1] = srcData[srcIdx + 1];
            outData[destIdx + 2] = srcData[srcIdx + 2];
            outData[destIdx + 3] = srcData[srcIdx + 3];
          }
        }
      }

      ctx.putImageData(outImgData, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.98));
    };

    img.onerror = () => reject(new Error('Failed to load image for cropping'));
    img.src = imageSrc;
  });
}
