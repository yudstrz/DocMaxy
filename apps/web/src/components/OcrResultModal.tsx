'use client';

import React, { useEffect, useState } from 'react';
import { FileText, Copy, Download, X, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useLanguage } from '@/context/LanguageContext';

interface OcrResultModalProps {
  isOpen: boolean;
  imageSrc: string | null;
  onClose: () => void;
}

export function OcrResultModal({
  isOpen,
  imageSrc,
  onClose,
}: OcrResultModalProps) {
  const { t } = useLanguage();
  const [extractedText, setExtractedText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && imageSrc) {
      runOcr(imageSrc);
    } else {
      setExtractedText('');
    }
  }, [isOpen, imageSrc]);

  const runOcr = async (src: string) => {
    setIsExtracting(true);
    setExtractedText('');

    try {
      const Tesseract = await import('tesseract.js');
      const worker = await Tesseract.createWorker('ind+eng');
      const ret = await worker.recognize(src);
      await worker.terminate();

      setExtractedText(ret.data.text || 'Tidak ada teks yang dapat dideteksi dari gambar ini.');
      toast.success(t('successTitle'));
    } catch (err: any) {
      console.error('OCR Error:', err);
      setExtractedText('Gagal mengekstraksi teks. Coba gunakan filter B&W / Enhance.');
    } finally {
      setIsExtracting(false);
    }
  };

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(extractedText);
    setCopied(true);
    toast.success(t('ocrCopied'));
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([extractedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Extracted_Text_${Date.now()}.txt`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-100 dark:bg-cyan-950 text-cyan-600 dark:text-cyan-400 rounded-xl">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {t('ocrModalTitle')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('ocrSubtitle')}
              </p>
            </div>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          {isExtracting ? (
            <div className="text-center py-16">
              <Loader2 className="w-10 h-10 text-[#00B69A] animate-spin mx-auto mb-3" />
              <p className="text-slate-600 dark:text-slate-300 font-semibold text-sm">
                {t('ocrExtracting')}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {t('ocrWaitNotice')}
              </p>
            </div>
          ) : (
            <textarea
              readOnly
              value={extractedText}
              className="w-full h-64 p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-800 dark:text-slate-200 font-mono text-sm focus:outline-none resize-none leading-relaxed"
            />
          )}
        </div>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <button onClick={onClose} className="px-4 py-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-xs font-semibold">
            {t('ocrClose')}
          </button>

          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              disabled={isExtracting || !extractedText}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-xl transition-all disabled:opacity-50"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? t('ocrCopied') : t('ocrCopyText')}</span>
            </button>

            <button
              onClick={handleDownload}
              disabled={isExtracting || !extractedText}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-[#00B69A] hover:bg-[#00a38a] text-white font-bold text-xs rounded-xl shadow-md transition-all disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>Unduh .TXT</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
