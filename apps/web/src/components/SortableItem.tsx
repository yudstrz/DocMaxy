import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X, Eye } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SortableItemProps {
  id: string;
  file: File;
  thumbnail: string | null;
  index: number;
  onRemove: (id: string) => void;
  onPreview?: (file: File) => void;
  pages?: string;
  showPageInput?: boolean;
  onPageInputChange?: (id: string, value: string) => void;
}

export function SortableItem({
  id,
  file,
  thumbnail,
  index,
  onRemove,
  onPreview,
  pages = '',
  showPageInput,
  onPageInputChange,
}: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative flex flex-col items-center justify-center p-2 rounded-xl border-2 bg-white dark:bg-slate-900 cursor-grab active:cursor-grabbing hover:border-indigo-500 dark:hover:border-indigo-400 transition-colors group shadow-sm",
        isDragging
          ? "opacity-50 z-50 border-indigo-500 shadow-xl scale-105"
          : "border-slate-200 dark:border-slate-800"
      )}
      {...attributes}
      {...listeners}
    >
      {/* Badge Index */}
      <div className="absolute -top-3 -right-3 w-7 h-7 bg-indigo-600 dark:bg-indigo-500 text-white rounded-full flex items-center justify-center font-bold text-sm shadow-md z-10">
        {index + 1}
      </div>

      {/* Remove Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(id);
        }}
        title="Hapus Dokumen"
        className="absolute top-2 left-2 p-1.5 bg-white/90 dark:bg-slate-800/90 backdrop-blur rounded-full text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950 transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100 shadow-sm z-10"
      >
        <X size={16} />
      </button>

      {/* Preview Button */}
      {onPreview && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPreview(file);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title="Pratinjau Dokumen"
          className="absolute top-2 right-2 p-1.5 bg-indigo-600/90 text-white backdrop-blur rounded-full hover:bg-indigo-700 transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100 shadow-md z-10"
        >
          <Eye size={15} />
        </button>
      )}

      {/* Thumbnail */}
      <div
        className="w-full aspect-[1/1.414] bg-slate-50 dark:bg-slate-950 rounded-lg overflow-hidden border border-slate-100 dark:border-slate-800 flex items-center justify-center relative cursor-pointer group/thumb"
        onClick={(e) => {
          if (onPreview) {
            e.stopPropagation();
            onPreview(file);
          }
        }}
      >
        {thumbnail ? (
          <img src={thumbnail} alt={file.name} className="w-full h-full object-cover pointer-events-none" />
        ) : (
          <div className="animate-pulse bg-slate-200 dark:bg-slate-800 w-full h-full"></div>
        )}

        {/* Hover overlay hint */}
        {onPreview && (
          <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-white backdrop-blur-[2px]">
            <Eye size={22} className="text-white drop-shadow" />
            <span className="text-[10px] font-bold tracking-wider uppercase bg-slate-900/80 px-2 py-0.5 rounded-full border border-white/20">
              Preview
            </span>
          </div>
        )}
      </div>

      {/* Filename */}
      <div className="w-full mt-3 text-center">
        <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate px-1">
          {file.name}
        </p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 mb-2">
          {(file.size / 1024 / 1024).toFixed(2)} MB
        </p>
        {showPageInput && (
          <input
            type="text"
            value={pages}
            onChange={(e) => onPageInputChange && onPageInputChange(id, e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="Hal: 1, 3-5"
            className="w-full mt-1 px-2 py-1.5 text-xs text-center border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
          />
        )}
      </div>
    </div>
  );
}
