'use client';

import React, { useState, useRef } from 'react';
import { Point, cropPerspective } from '@/utils/cameraFilter';
import { Crop, RotateCcw, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface ScannerCropModalProps {
  isOpen: boolean;
  imageSrc: string;
  onConfirmCrop: (croppedImageSrc: string) => void;
  onClose: () => void;
}

export function ScannerCropModal({
  isOpen,
  imageSrc,
  onConfirmCrop,
  onClose,
}: ScannerCropModalProps) {
  // Default 4 corners with 5% inset
  const [corners, setCorners] = useState<[Point, Point, Point, Point]>([
    { x: 0.08, y: 0.08 }, // TL
    { x: 0.92, y: 0.08 }, // TR
    { x: 0.92, y: 0.92 }, // BR
    { x: 0.08, y: 0.92 }, // BL
  ]);

  const [activeCornerIdx, setActiveCornerIdx] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);

  if (!isOpen) return null;

  const handlePointerDown = (idx: number) => {
    setActiveCornerIdx(idx);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activeCornerIdx === null || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const rawX = (e.clientX - rect.left) / rect.width;
    const rawY = (e.clientY - rect.top) / rect.height;

    const clampedX = Math.min(0.98, Math.max(0.02, rawX));
    const clampedY = Math.min(0.98, Math.max(0.02, rawY));

    setCorners((prev) => {
      const copy = [...prev] as [Point, Point, Point, Point];
      copy[activeCornerIdx] = { x: clampedX, y: clampedY };
      return copy;
    });
  };

  const handlePointerUp = () => {
    setActiveCornerIdx(null);
  };

  const resetCorners = () => {
    setCorners([
      { x: 0.08, y: 0.08 },
      { x: 0.92, y: 0.08 },
      { x: 0.92, y: 0.92 },
      { x: 0.08, y: 0.92 },
    ]);
  };

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      const croppedSrc = await cropPerspective(imageSrc, corners);
      onConfirmCrop(croppedSrc);
      toast.success('Potongan dokumen berhasil disesuaikan!');
      onClose();
    } catch (err: any) {
      toast.error('Gagal memotong gambar dokumen.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-800 flex flex-col items-center">
        {/* Header */}
        <div className="w-full flex items-center justify-between pb-4 border-b border-slate-800 mb-4 text-white">
          <div className="flex items-center gap-2">
            <Crop className="w-5 h-5 text-[#00B69A]" />
            <h3 className="font-bold text-lg">Sesuaikan Sudut Dokumen</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1.5 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Canvas & Polygon Crop Overlay Area */}
        <div
          ref={containerRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="relative max-w-full max-h-[65vh] overflow-hidden rounded-2xl bg-slate-950 flex items-center justify-center select-none touch-none"
        >
          <img src={imageSrc} alt="Crop view" className="max-h-[60vh] object-contain pointer-events-none" />

          {/* SVG Overlay connecting the 4 handles */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <polygon
              points={`${corners[0].x * 100}% ${corners[0].y * 100}%, ${corners[1].x * 100}% ${corners[1].y * 100}%, ${corners[2].x * 100}% ${corners[2].y * 100}%, ${corners[3].x * 100}% ${corners[3].y * 100}%`}
              fill="rgba(0, 182, 154, 0.15)"
              stroke="#00B69A"
              strokeWidth="2.5"
              strokeDasharray="4 2"
            />
          </svg>

          {/* Draggable Corner Handles */}
          {corners.map((corner, idx) => (
            <div
              key={idx}
              onPointerDown={() => handlePointerDown(idx)}
              style={{ left: `${corner.x * 100}%`, top: `${corner.y * 100}%` }}
              className="absolute w-7 h-7 -ml-3.5 -mt-3.5 bg-[#00B69A] border-2 border-white rounded-full shadow-lg cursor-grab active:cursor-grabbing flex items-center justify-center z-30 transition-transform hover:scale-125"
            >
              <div className="w-2 h-2 bg-white rounded-full" />
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="w-full flex items-center justify-between pt-6 border-t border-slate-800 mt-4">
          <button
            type="button"
            onClick={resetCorners}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset Sudut</span>
          </button>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl"
            >
              Batal
            </button>
            <button
              onClick={handleConfirm}
              disabled={isProcessing}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#00B69A] hover:bg-[#00a38a] text-white font-bold text-xs rounded-xl shadow-lg transition-all disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{isProcessing ? 'Memotong...' : 'Potong Dokumen'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
