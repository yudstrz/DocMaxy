export type CameraFilterMode = 'original' | 'grayscale' | 'contrast' | 'bw';

/**
 * Apply canvas-based document scanner filter to an image data URL or Blob.
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

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Luma formula
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;

        if (mode === 'grayscale') {
          data[i] = gray;
          data[i + 1] = gray;
          data[i + 2] = gray;
        } else if (mode === 'contrast') {
          // High contrast document enhancement
          let contrastFactor = 1.4;
          let enhanced = (gray - 128) * contrastFactor + 128;
          enhanced = Math.min(255, Math.max(0, enhanced));
          data[i] = enhanced;
          data[i + 1] = enhanced;
          data[i + 2] = enhanced;
        } else if (mode === 'bw') {
          // Scanner B&W threshold
          const threshold = 140;
          const val = gray > threshold ? 255 : 0;
          data[i] = val;
          data[i + 1] = val;
          data[i + 2] = val;
        }
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };

    img.onerror = () => reject(new Error('Failed to load image for filtering'));
    img.src = imageSrc;
  });
}
