'use client';

import React, { useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableItem } from './SortableItem';
import { generatePDFThumbnail } from '@/utils/pdf';
import { ArrowDownAZ, Plus } from 'lucide-react';

export interface PDFDocument {
  id: string;
  file: File;
  thumbnail: string | null;
}

interface SortableGridProps {
  items: PDFDocument[];
  setItems: React.Dispatch<React.SetStateAction<PDFDocument[]>>;
  onAddFiles: (files: FileList | File[]) => void;
  accept?: string;
  uploadLabel?: string;
}

export function SortableGrid({ items, setItems, onAddFiles, accept = "application/pdf", uploadLabel = "Tambah File" }: SortableGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px movement required before drag starts to allow clicks
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const [isDragActive, setIsDragActive] = useState(false);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleRemove = (id: string) => {
    setItems((items) => items.filter((item) => item.id !== id));
  };

  const handleSortAZ = () => {
    setItems((items) => [...items].sort((a, b) => a.file.name.localeCompare(b.file.name)));
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Create a new FileList-like array
      const files = Array.from(e.dataTransfer.files).filter(file => 
        accept === '*/*' || accept.split(',').some(type => {
          const t = type.trim();
          if (t.startsWith('.')) return file.name.toLowerCase().endsWith(t);
          return file.type.match(new RegExp(t.replace('*', '.*')));
        })
      );
      if (files.length > 0) {
        onAddFiles(files);
      }
    }
  };

  return (
    <div 
      className={`w-full max-w-5xl mx-auto p-6 rounded-2xl border-2 transition-all duration-200 ${
        isDragActive ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-100 bg-slate-50/50'
      }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-800">Atur Urutan Dokumen</h2>
        <div className="flex gap-2">
          <button
            onClick={handleSortAZ}
            className="flex items-center gap-2 px-4 py-2.5 bg-white text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm text-sm font-medium"
          >
            <ArrowDownAZ size={18} />
            <span className="hidden sm:inline">Sort A-Z</span>
          </button>
          
          <label className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-sm text-sm font-medium cursor-pointer">
            <Plus size={18} />
            <span className="hidden sm:inline">{uploadLabel}</span>
            <span className="sm:hidden">Tambah</span>
            <input 
              type="file" 
              multiple 
              accept={accept} 
              className="hidden" 
              onChange={(e) => {
                if (e.target.files) onAddFiles(e.target.files);
              }}
            />
          </label>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={items.map(i => i.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {items.map((item, index) => (
              <SortableItem
                key={item.id}
                id={item.id}
                file={item.file}
                thumbnail={item.thumbnail}
                index={index}
                onRemove={handleRemove}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      
      {items.length === 0 && (
        <div className="w-full py-20 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl bg-white text-slate-400 pointer-events-none">
          <div className="bg-slate-50 p-4 rounded-full mb-4">
            <Plus size={32} className="text-slate-400" />
          </div>
          <p className="text-lg font-medium text-slate-600">Belum ada file yang dipilih</p>
          <p className="text-sm mt-2 text-slate-400">Tarik dan lepas file di sini, atau klik tombol di atas.</p>
        </div>
      )}
    </div>
  );
}
