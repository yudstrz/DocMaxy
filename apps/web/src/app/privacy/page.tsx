'use client';

import React from 'react';
import { ShieldCheck, Lock, Cpu, Database, FileText, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export default function PrivacyPage() {
  const { lang } = useLanguage();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4 sm:px-6 lg:px-8 transition-colors">
      <main className="max-w-4xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-10 shadow-sm">
        
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 pb-6 border-b border-slate-200 dark:border-slate-800">
          <div className="p-3 bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-2xl">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {lang === 'id' ? 'Kebijakan Privasi' : 'Privacy Policy'}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {lang === 'id'
                ? 'Terakhir diperbarui: 23 Juli 2026 — Jaminan Pemrosesan 100% Lokal di Perangkat Anda'
                : 'Last updated: July 23, 2026 — 100% Local On-Device Processing Guarantee'}
            </p>
          </div>
        </div>

        {/* Highlight Banner */}
        <div className="mb-8 p-5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-2xl flex items-start gap-4 text-emerald-900 dark:text-emerald-200">
          <Lock className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed">
            <span className="font-bold block text-base mb-1">
              {lang === 'id' ? 'Komitmen Utama Privasi DocMaxy' : 'DocMaxy Core Privacy Commitment'}
            </span>
            {lang === 'id'
              ? 'DocMaxy dirancang dengan arsitektur Zero-Server Data Transfer. Seluruh dokumen, file PDF, foto scan, dan hasil konversi Anda diproses 100% di memori browser perangkat Anda (Client-Side). File Anda tidak pernah diunggah, disimpan, atau dikirimkan ke server manapun.'
              : 'DocMaxy is designed with a Zero-Server Data Transfer architecture. All your documents, PDF files, scanned images, and converted outputs are processed 100% inside your browser memory (Client-Side). Your files are NEVER uploaded, stored, or transmitted to any remote server.'}
          </div>
        </div>

        {/* Content Sections */}
        <div className="space-y-8 text-slate-700 dark:text-slate-300 text-sm sm:text-base leading-relaxed">
          
          {/* Section 1 */}
          <section>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-500" />
              <span>{lang === 'id' ? '1. Pemrosesan Data Lokal (Client-Side)' : '1. Local On-Device Processing'}</span>
            </h2>
            <p className="mb-3">
              {lang === 'id'
                ? 'Saat Anda menggunakan alat DocMaxy (seperti Penggabung PDF, Pemisah, Kompresor, Konverter Word/PDF, Watermark, OCR, dan Pemindai Kamera):'
                : 'When you use DocMaxy tools (such as PDF Merge, Split, Compress, Word/PDF Converter, Watermark, OCR, and Camera Scanner):'}
            </p>
            <ul className="list-disc pl-6 space-y-1.5 text-slate-600 dark:text-slate-400">
              <li>
                {lang === 'id'
                  ? 'Semua manipulasi file mengeksekusi pustaka JavaScript/WebAssembly secara langsung di perangkat komputer/smartphone Anda.'
                  : 'All file manipulations execute JavaScript/WebAssembly libraries directly within your browser sandbox.'}
              </li>
              <li>
                {lang === 'id'
                  ? 'Dokumen rahasia seperti kontrak bisnis, laporan keuangan, dokumen medis, atau foto KTP/Kartu Identitas tidak pernah meninggalkan perangkat Anda.'
                  : 'Confidential documents such as contracts, financial reports, medical records, or ID cards never leave your device.'}
              </li>
              <li>
                {lang === 'id'
                  ? 'Kami tidak memiliki akses, tidak menyimpan salinan, dan tidak dapat membaca isi dokumen Anda.'
                  : 'We have zero access, store no copies, and cannot read the contents of your documents.'}
              </li>
            </ul>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-500" />
              <span>{lang === 'id' ? '2. Penyimpanan Lokal & Preferensi' : '2. Local Storage & Preferences'}</span>
            </h2>
            <p className="mb-3">
              {lang === 'id'
                ? 'DocMaxy menggunakan fitur penyimpanan bawaan browser (localStorage & IndexedDB) hanya untuk meningkatkan kenyamanan penggunaan Anda:'
                : 'DocMaxy utilizes browser built-in storage (localStorage & IndexedDB) solely to enhance your user experience:'}
            </p>
            <ul className="list-disc pl-6 space-y-1.5 text-slate-600 dark:text-slate-400">
              <li>
                <strong>localStorage</strong>: {lang === 'id' ? 'Menyimpan preferensi bahasa (ID/EN) dan pilihan tema (Gelap/Terang).' : 'Stores your UI preferences (ID/EN language & Dark/Light mode theme).'}
              </li>
              <li>
                <strong>IndexedDB (Riwayat Sesi Lokal)</strong>: {lang === 'id' ? 'Menyimpan log riwayat aktivitas sesi Anda secara privat di perangkat Anda sendiri. Data ini tidak disinkronisasi ke cloud dan dapat Anda hapus kapan saja.' : 'Stores your local session history log privately on your device. This data is not synced to the cloud and can be cleared by you anytime.'}
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-500" />
              <span>{lang === 'id' ? '3. Analitik & Cookies Pihak Ketiga' : '3. Analytics & Third-Party Cookies'}</span>
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              {lang === 'id'
                ? 'DocMaxy tidak menggunakan cookie pelacak iklan pihak ketiga atau alat telemetri yang mengumpulkan informasi identitas pribadi (PII). Aplikasi ini beroperasi sebagai web app statis yang mandiri.'
                : 'DocMaxy does not use third-party advertising tracking cookies or telemetry tools that collect Personally Identifiable Information (PII). The application operates as a standalone static web application.'}
            </p>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-indigo-500" />
              <span>{lang === 'id' ? '4. Perubahan Kebijakan Privasi' : '4. Changes to This Privacy Policy'}</span>
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              {lang === 'id'
                ? 'Kami dapat memperbarui Kebijakan Privasi ini dari waktu ke waktu untuk mencerminkan pembaruan fitur. Tanggal revisi terbaru akan selalu ditampilkan di bagian atas halaman ini.'
                : 'We may update this Privacy Policy from time to time to reflect feature updates. The date of the latest revision will always be displayed at the top of this page.'}
            </p>
          </section>

        </div>
      </main>
    </div>
  );
}
