'use client';

import React from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';

interface GranularProgressModalProps {
  isOpen: boolean;
  current: number;
  total: number;
  fileName?: string;
  stepDescription?: string;
}

export function GranularProgressModal({
  isOpen,
  current,
  total,
  fileName,
  stepDescription,
}: GranularProgressModalProps) {
  if (!isOpen) return null;

  const percentage = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 text-center">
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin" />
        </div>

        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
          {stepDescription || 'Sedang Memproses Dokumen...'}
        </h3>

        {fileName && (
          <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 truncate max-w-xs mx-auto mb-4">
            {fileName}
          </p>
        )}

        <div className="space-y-2 mb-2">
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>
              {total > 0 ? `Halaman ${current} dari ${total}` : 'Memproses...'}
            </span>
            <span>{percentage}%</span>
          </div>

          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3.5 overflow-hidden p-0.5 border border-slate-200 dark:border-slate-700">
            <div
              className="bg-indigo-600 dark:bg-indigo-500 h-full rounded-full transition-all duration-300 shadow-sm"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3 flex items-center justify-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>Proses berjalan 100% di browser Anda (aman & privat).</span>
        </p>
      </div>
    </div>
  );
}
