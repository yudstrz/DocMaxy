export type CameraFilterMode = 'original' | 'lighten' | 'enhance' | 'magic_pro' | 'bw' | 'grayscale';

export interface Point {
  x: number;
  y: number;
}

/**
 * Advanced CamScanner Magic Color (Enhance) filter:
 * Removes background shadows, brightens paper background to clean white,
 * and sharpens text/pencil/ink handwriting.
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
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // 1. Calculate average luminance for background estimation
      let totalLum = 0;
      const pixelCount = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        totalLum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }
      const avgLum = totalLum / pixelCount;

      for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];

        // Gray formula
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;

        if (mode === 'grayscale') {
          data[i] = gray;
          data[i + 1] = gray;
          data[i + 2] = gray;
        } else if (mode === 'lighten') {
          // Soft brighten paper without extreme thresholding
          const factor = 1.25;
          data[i] = Math.min(255, r * factor);
          data[i + 1] = Math.min(255, g * factor);
          data[i + 2] = Math.min(255, b * factor);
        } else if (mode === 'enhance' || mode === 'magic_pro') {
          // CamScanner Magic Color:
          // Paper background whitening + text ink sharpening
          const shadowThreshold = avgLum * 0.85;

          if (gray > shadowThreshold) {
            // Whiten paper background
            const boost = 1.35;
            data[i] = Math.min(255, r * boost + 25);
            data[i + 1] = Math.min(255, g * boost + 25);
            data[i + 2] = Math.min(255, b * boost + 25);
          } else {
            // Darken and sharpen handwriting/ink text
            const darkFactor = mode === 'magic_pro' ? 0.75 : 0.85;
            data[i] = r * darkFactor;
            data[i + 1] = g * darkFactor;
            data[i + 2] = b * darkFactor;
          }
        } else if (mode === 'bw') {
          // Scanner 1-bit high-contrast threshold
          const threshold = avgLum * 0.9;
          const val = gray > threshold ? 255 : 0;
          data[i] = val;
          data[i + 1] = val;
          data[i + 2] = val;
        }
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
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
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };

    img.onerror = () => reject(new Error('Failed to load image for cropping'));
    img.src = imageSrc;
  });
}
