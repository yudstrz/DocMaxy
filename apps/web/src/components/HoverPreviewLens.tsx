'use client';

import React, { useState } from 'react';
import { Eye, ZoomIn, X } from 'lucide-react';

interface HoverPreviewLensProps {
  thumbnailUrl?: string | null;
  title?: string;
  onOpenFullPreview?: () => void;
}

export function HoverPreviewLens({
  thumbnailUrl,
  title,
  onOpenFullPreview,
}: HoverPreviewLensProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!thumbnailUrl) return null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(true);
        }}
        title="Pratinjau Cepat"
        className="absolute top-2 right-2 z-20 bg-slate-900/70 hover:bg-slate-900 text-white p-1.5 rounded-lg backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-md"
      >
        <Eye className="w-4 h-4" />
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="relative bg-white dark:bg-slate-900 p-4 rounded-3xl max-w-xl max-h-[85vh] shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex justify-between items-center mb-3 px-2">
              <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm truncate max-w-xs">
                {title || 'Pratinjau Halaman'}
              </h4>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-auto max-h-[70vh] rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-2">
              <img
                src={thumbnailUrl}
                alt="Quick preview"
                className="max-h-[65vh] object-contain rounded shadow-lg"
              />
            </div>

            {onOpenFullPreview && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  onOpenFullPreview();
                }}
                className="mt-3 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
              >
                <ZoomIn className="w-3.5 h-3.5" />
                Buka Mode Fullscreen
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
