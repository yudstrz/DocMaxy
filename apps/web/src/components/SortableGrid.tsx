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
}

export function SortableGrid({ items, setItems, onAddFiles }: SortableGridProps) {
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

  return (
    <div className="w-full max-w-5xl mx-auto p-6 bg-slate-50/50 rounded-2xl border border-slate-100">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-800">Atur Urutan Dokumen</h2>
        <div className="flex gap-2">
          <button
            onClick={handleSortAZ}
            className="flex items-center gap-2 px-4 py-2 bg-white text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm text-sm font-medium"
          >
            <ArrowDownAZ size={18} />
            Sort A-Z
          </button>
          
          <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-sm text-sm font-medium cursor-pointer">
            <Plus size={18} />
            Tambah File
            <input 
              type="file" 
              multiple 
              accept="application/pdf" 
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
        <div className="w-full py-20 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl bg-white text-slate-400">
          <p>Belum ada file yang dipilih.</p>
          <p className="text-sm mt-1">Klik "Tambah File" untuk memulai.</p>
        </div>
      )}
    </div>
  );
}
