'use client';

import React, { useState } from 'react';
import { Lock, Eye, EyeOff, X, KeyRound } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface SmartPasswordModalProps {
  isOpen: boolean;
  fileName?: string;
  onUnlock: (password: string) => Promise<boolean>;
  onClose: () => void;
}

export function SmartPasswordModal({
  isOpen,
  fileName,
  onUnlock,
  onClose,
}: SmartPasswordModalProps) {
  const { t } = useLanguage();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setIsSubmitting(true);
    setErrorMsg(null);

    const success = await onUnlock(password);
    setIsSubmitting(false);

    if (!success) {
      setErrorMsg(t('incorrectPassword'));
    } else {
      setPassword('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-2xl border border-slate-200 dark:border-slate-800">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
          <Lock className="w-7 h-7" />
        </div>

        <h3 className="text-xl font-bold text-slate-900 dark:text-white text-center mb-2">
          {t('passwordProtectedTitle')}
        </h3>

        <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6">
          {t('passwordPromptMsg')}
          {fileName && (
            <span className="block font-semibold text-slate-700 dark:text-slate-300 mt-1 truncate max-w-xs mx-auto">
              "{fileName}"
            </span>
          )}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('passwordInputPlaceholder')}
              autoFocus
              className="w-full px-4 py-3.5 pr-12 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          {errorMsg && (
            <p className="text-xs text-rose-500 font-medium text-center">{errorMsg}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !password}
              className="flex-1 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              {isSubmitting ? t('unlocking') : t('unlock')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
