'use client';

import React from 'react';
import {
  CheckSquare, Square, ArrowDownAZ, ArrowUpAZ, ArrowLeftRight, Trash2
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface FloatingActionBarProps {
  totalCount: number;
  selectedCount?: number;
  allSelected?: boolean;
  onToggleSelectAll?: () => void;
  onSortAZ?: () => void;
  onSortZA?: () => void;
  onReverse?: () => void;
  onClearAll?: () => void;
  extraActions?: React.ReactNode;
}

export function FloatingActionBar({
  totalCount,
  selectedCount = 0,
  allSelected = false,
  onToggleSelectAll,
  onSortAZ,
  onSortZA,
  onReverse,
  onClearAll,
  extraActions,
}: FloatingActionBarProps) {
  const { t } = useLanguage();

  if (totalCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-auto max-w-full px-4 animate-in slide-in-from-bottom-5 duration-300">
      <div className="bg-slate-900/90 dark:bg-slate-800/95 backdrop-blur-md text-white px-4 py-3 rounded-2xl shadow-2xl border border-slate-700/50 flex items-center gap-2 sm:gap-3 flex-wrap justify-center text-xs sm:text-sm font-medium">
        {selectedCount > 0 && (
          <span className="bg-indigo-600/80 text-indigo-100 px-2.5 py-1 rounded-lg text-xs font-semibold mr-1">
            {selectedCount} {t('selectedItems')}
          </span>
        )}

        {onToggleSelectAll && (
          <button
            onClick={onToggleSelectAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors text-slate-200"
          >
            {allSelected ? <Square className="w-4 h-4 text-indigo-400" /> : <CheckSquare className="w-4 h-4 text-indigo-400" />}
            <span>{allSelected ? t('deselectAll') : t('selectAll')}</span>
          </button>
        )}

        {onSortAZ && (
          <button
            onClick={onSortAZ}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors text-slate-200"
          >
            <ArrowDownAZ className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">{t('sortAZ')}</span>
          </button>
        )}

        {onSortZA && (
          <button
            onClick={onSortZA}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors text-slate-200"
          >
            <ArrowUpAZ className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">{t('sortZA')}</span>
          </button>
        )}

        {onReverse && (
          <button
            onClick={onReverse}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors text-slate-200"
          >
            <ArrowLeftRight className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">{t('reverseOrder')}</span>
          </button>
        )}

        {extraActions}

        {onClearAll && (
          <button
            onClick={onClearAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-rose-950/50 text-rose-300 transition-colors ml-1 border-l border-slate-700 pl-3"
          >
            <Trash2 className="w-4 h-4 text-rose-400" />
            <span>{t('clearAll')}</span>
          </button>
        )}
      </div>
    </div>
  );
}
