'use client';

import React from 'react';
import Link from 'next/link';
import { useLanguage } from '@/context/LanguageContext';

export function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="w-full bg-slate-900 border-t border-slate-800 mt-auto transition-colors">
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row justify-between items-center text-sm text-slate-400 gap-4">
          <div className="text-center sm:text-left">
            &copy; {new Date().getFullYear()} DocMaxy PDF Toolkit. All rights reserved.
          </div>
          <div className="flex items-center space-x-6">
            <Link
              href="/privacy"
              className="hover:text-white transition-colors cursor-pointer text-slate-400 font-medium"
            >
              {t('privacyLink')}
            </Link>
            <Link
              href="/terms"
              className="hover:text-white transition-colors cursor-pointer text-slate-400 font-medium"
            >
              {t('termsLink')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
