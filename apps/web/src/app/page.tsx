'use client';

import React from 'react';
import Link from 'next/link';
import {
  Combine, Split, Minimize2, FileText, FileCode2, RotateCw, Image as ImageIcon, FileImage, Stamp, LayoutGrid, Camera
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export default function Home() {
  const { t } = useLanguage();

  const TOOLS = [
    {
      title: t('mergeTitle'),
      description: t('mergeDesc'),
      href: "/merge",
      icon: Combine,
      iconColor: "text-orange-500",
      iconBg: "bg-orange-100 dark:bg-orange-950/60",
      status: "ready"
    },
    {
      title: t('splitTitle'),
      description: t('splitDesc'),
      href: "/split",
      icon: Split,
      iconColor: "text-orange-500",
      iconBg: "bg-orange-100 dark:bg-orange-950/60",
      status: "ready"
    },
    {
      title: t('compressTitle'),
      description: t('compressDesc'),
      href: "/compress",
      icon: Minimize2,
      iconColor: "text-green-500",
      iconBg: "bg-green-100 dark:bg-green-950/60",
      status: "ready"
    },
    {
      title: t('watermarkTitle'),
      description: t('watermarkDesc'),
      href: "/watermark-numbering",
      icon: Stamp,
      iconColor: "text-amber-500",
      iconBg: "bg-amber-100 dark:bg-amber-950/60",
      status: "ready"
    },
    {
      title: t('organizeTitle'),
      description: t('organizeDesc'),
      href: "/organize",
      icon: LayoutGrid,
      iconColor: "text-cyan-500",
      iconBg: "bg-cyan-100 dark:bg-cyan-950/60",
      status: "ready"
    },
    {
      title: t('cameraScanTitle'),
      description: t('cameraScanDesc'),
      href: "/camera-scan",
      icon: Camera,
      iconColor: "text-rose-500",
      iconBg: "bg-rose-100 dark:bg-rose-950/60",
      status: "ready"
    },
    {
      title: t('pdfToWordTitle'),
      description: t('pdfToWordDesc'),
      href: "/pdf-to-word",
      icon: FileText,
      iconColor: "text-blue-500",
      iconBg: "bg-blue-100 dark:bg-blue-950/60",
      status: "ready"
    },
    {
      title: t('wordToPdfTitle'),
      description: t('wordToPdfDesc'),
      href: "/word-to-pdf",
      icon: FileCode2,
      iconColor: "text-blue-500",
      iconBg: "bg-blue-100 dark:bg-blue-950/60",
      status: "ready"
    },
    {
      title: t('rotateTitle'),
      description: t('rotateDesc'),
      href: "/rotate",
      icon: RotateCw,
      iconColor: "text-purple-500",
      iconBg: "bg-purple-100 dark:bg-purple-950/60",
      status: "ready"
    },
    {
      title: t('pdfToJpgTitle'),
      description: t('pdfToJpgDesc'),
      href: "/pdf-to-jpg",
      icon: ImageIcon,
      iconColor: "text-yellow-600",
      iconBg: "bg-yellow-100 dark:bg-yellow-950/60",
      status: "ready"
    },
    {
      title: t('jpgToPdfTitle'),
      description: t('jpgToPdfDesc'),
      href: "/jpg-to-pdf",
      icon: FileImage,
      iconColor: "text-yellow-600",
      iconBg: "bg-yellow-100 dark:bg-yellow-950/60",
      status: "ready"
    },
    {
      title: t('pdfToMdTitle'),
      description: t('pdfToMdDesc'),
      href: "/pdf-to-markdown",
      icon: FileText,
      iconColor: "text-emerald-600",
      iconBg: "bg-emerald-100 dark:bg-emerald-950/60",
      status: "ready"
    },
  ];

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 md:py-20 px-4 transition-colors">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-4">
            {t('heroTitle')}
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            {t('heroSubtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {TOOLS.map((tool, index) => {
            const isReady = tool.status === "ready";
            const CardWrapper = isReady ? Link : 'div';

            return (
              <CardWrapper
                key={index}
                href={tool.href}
                className={`
                  group relative bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200/80 dark:border-slate-800 
                  transition-all duration-300 ease-out flex flex-col items-start text-left shadow-sm
                  ${isReady 
                    ? 'hover:shadow-2xl hover:-translate-y-1.5 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer' 
                    : 'opacity-75 cursor-not-allowed'}
                `}
              >
                {!isReady && (
                  <span className="absolute top-4 right-4 bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                    {t('comingSoon')}
                  </span>
                )}

                <div className={`
                  w-14 h-14 rounded-2xl flex items-center justify-center mb-6 
                  transition-transform duration-300 ${isReady ? 'group-hover:scale-110' : ''}
                  ${tool.iconBg}
                `}>
                  <tool.icon className={`w-7 h-7 ${tool.iconColor}`} />
                </div>

                <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
                  {tool.title}
                </h3>

                <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-sm">
                  {tool.description}
                </p>
              </CardWrapper>
            );
          })}
        </div>
      </div>
    </main>
  );
}
