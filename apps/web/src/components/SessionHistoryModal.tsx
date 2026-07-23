'use client';

import React, { useEffect, useState } from 'react';
import { History, Download, Trash2, X, Clock, FileText } from 'lucide-react';
import { getHistoryItems, clearHistory, HistoryItem } from '@/utils/historyDB';
import { saveAs } from 'file-saver';
import { useLanguage } from '@/context/LanguageContext';

interface SessionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SessionHistoryModal({ isOpen, onClose }: SessionHistoryModalProps) {
  const { t } = useLanguage();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshHistory = async () => {
    setIsLoading(true);
    const data = await getHistoryItems();
    setItems(data);
    setIsLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      refreshHistory();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClear = async () => {
    await clearHistory();
    setItems([]);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <History className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {t('historyTitle')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                <Clock className="w-3.5 h-3.5" />
                {t('historyAutoExpireNotice')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          {isLoading ? (
            <p className="text-center text-slate-400 py-8">Memuat riwayat...</p>
          ) : items.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">
                {t('historyEmpty')}
              </p>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 rounded-2xl transition-all hover:border-indigo-300 dark:hover:border-indigo-700"
              >
                <div className="flex items-center gap-3 overflow-hidden mr-3">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-lg shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm truncate">
                      {item.name}
                    </h4>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                      <span className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded font-medium text-[11px]">
                        {item.tool}
                      </span>
                      <span>•</span>
                      <span>{formatSize(item.size)}</span>
                      <span>•</span>
                      <span>{formatTime(item.createdAt)}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => saveAs(item.blob, item.name)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-sm transition-all shrink-0"
                >
                  <Download className="w-4 h-4" />
                  <span>Unduh</span>
                </button>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 px-4 py-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-semibold text-xs rounded-xl transition-all"
            >
              <Trash2 className="w-4 h-4" />
              <span>{t('historyClear')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
