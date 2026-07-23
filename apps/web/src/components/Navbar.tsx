'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Home, History, Sun, Moon, Globe, Stamp, LayoutGrid, Camera } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { useLanguage } from '@/context/LanguageContext';
import { SessionHistoryModal } from './SessionHistoryModal';

export function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const { lang, setLang, t } = useLanguage();
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  return (
    <>
      <nav className="w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 shadow-sm transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:opacity-90 transition-opacity">
              <div className="bg-indigo-600 dark:bg-indigo-500 text-white p-1.5 rounded-xl shadow-sm">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="font-extrabold text-xl tracking-tight text-slate-900 dark:text-white">DocMaxy</span>
            </Link>

            {/* Quick Links & Actions */}
            <div className="flex items-center gap-1 sm:gap-2">
              <Link
                href="/"
                className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-2 rounded-xl transition-all text-xs sm:text-sm font-medium"
              >
                <Home className="w-4 h-4" />
                <span className="hidden sm:inline">{t('home')}</span>
              </Link>

              {/* Quick links to new key tools */}
              <Link
                href="/watermark-numbering"
                title={t('watermarkTitle')}
                className="hidden md:flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-2 rounded-xl transition-all text-xs font-medium"
              >
                <Stamp className="w-4 h-4 text-amber-500" />
                <span>{t('navWatermark')}</span>
              </Link>

              <Link
                href="/organize"
                title={t('organizeTitle')}
                className="hidden md:flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-2 rounded-xl transition-all text-xs font-medium"
              >
                <LayoutGrid className="w-4 h-4 text-cyan-500" />
                <span>{t('navOrganize')}</span>
              </Link>

              <Link
                href="/camera-scan"
                title={t('cameraScanTitle')}
                className="hidden md:flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-2 rounded-xl transition-all text-xs font-medium"
              >
                <Camera className="w-4 h-4 text-rose-500" />
                <span>{t('navScan')}</span>
              </Link>

              {/* Session History */}
              <button
                onClick={() => setIsHistoryOpen(true)}
                title={t('sessionHistory')}
                className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 px-2.5 py-2 rounded-xl transition-all text-xs font-medium"
              >
                <History className="w-4 h-4 text-indigo-500" />
                <span className="hidden lg:inline">{t('sessionHistory')}</span>
              </button>

              {/* Language Switcher */}
              <button
                onClick={() => setLang(lang === 'id' ? 'en' : 'id')}
                className="flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 px-2.5 py-2 rounded-xl transition-all text-xs font-bold uppercase"
                title="Ganti Bahasa / Change Language"
              >
                <Globe className="w-4 h-4 text-slate-400" />
                <span>{lang}</span>
              </button>

              {/* Dark Mode Toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
                title={t('themeToggle')}
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-slate-600" />
                )}
              </button>
            </div>
          </div>
        </div>
      </nav>

      <SessionHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
      />
    </>
  );
}
