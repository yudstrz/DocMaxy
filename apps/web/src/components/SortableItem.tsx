import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X, RotateCw } from 'lucide-react';
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
  pages?: string;
  showPageInput?: boolean;
  onPageInputChange?: (id: string, value: string) => void;
}

export function SortableItem({ id, file, thumbnail, index, onRemove, pages = '', showPageInput, onPageInputChange }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative flex flex-col items-center justify-center p-2 rounded-xl border-2 bg-white cursor-grab active:cursor-grabbing hover:border-blue-500 transition-colors group shadow-sm",
        isDragging ? "opacity-50 z-50 border-blue-500 shadow-xl scale-105" : "border-slate-200"
      )}
      {...attributes}
      {...listeners}
    >
      {/* Badge Index */}
      <div className="absolute -top-3 -right-3 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center font-bold text-sm shadow-md z-10">
        {index + 1}
      </div>
      
      {/* Remove Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(id);
        }}
        className="absolute top-2 left-2 p-1.5 bg-white/80 backdrop-blur rounded-full text-slate-500 hover:text-red-500 hover:bg-red-50 transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100 shadow-sm z-10"
      >
        <X size={16} />
      </button>

      {/* Thumbnail */}
      <div className="w-full aspect-[1/1.414] bg-slate-50 rounded-lg overflow-hidden border border-slate-100 flex items-center justify-center relative">
        {thumbnail ? (
          <img src={thumbnail} alt={file.name} className="w-full h-full object-cover pointer-events-none" />
        ) : (
          <div className="animate-pulse bg-slate-200 w-full h-full"></div>
        )}
      </div>

      {/* Filename */}
      <div className="w-full mt-3 text-center">
        <p className="text-xs font-medium text-slate-700 truncate px-1">
          {file.name}
        </p>
        <p className="text-[10px] text-slate-400 mt-0.5 mb-2">
          {(file.size / 1024 / 1024).toFixed(2)} MB
        </p>
        {showPageInput && (
          <input
            type="text"
            value={pages}
            onChange={(e) => onPageInputChange && onPageInputChange(id, e.target.value)}
            onPointerDown={(e) => e.stopPropagation()} // Prevent drag when focusing input
            placeholder="Hal: 1, 3-5"
            className="w-full mt-1 px-2 py-1.5 text-xs text-center border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm"
          />
        )}
      </div>
    </div>
  );
}
