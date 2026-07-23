'use client';

import React from 'react';
import { Scale, AlertTriangle, ShieldAlert, FileCheck, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export default function TermsPage() {
  const { lang } = useLanguage();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4 sm:px-6 lg:px-8 transition-colors">
      <main className="max-w-4xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-10 shadow-sm">
        
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 pb-6 border-b border-slate-200 dark:border-slate-800">
          <div className="p-3 bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-2xl">
            <Scale className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {lang === 'id' ? 'Syarat & Ketentuan Layanan' : 'Terms of Service'}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {lang === 'id'
                ? 'Terakhir diperbarui: 23 Juli 2026 — Perjanjian Penggunaan Resmi'
                : 'Last updated: July 23, 2026 — Official Usage Agreement'}
            </p>
          </div>
        </div>

        {/* Legal Disclaimer Box */}
        <div className="mb-8 p-5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-2xl flex items-start gap-4 text-amber-950 dark:text-amber-200">
          <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed">
            <span className="font-bold block text-base mb-1">
              {lang === 'id' ? 'Pernyataan Hukum & Batas Tanggung Jawab' : 'Legal Disclaimer & Limitation of Liability'}
            </span>
            {lang === 'id'
              ? 'Layanan DocMaxy disediakan "SEBAGAIMANA ADANYA" (AS IS) tanpa jaminan bentuk apapun. Pemrosesan dilakukan sepenuhnya di browser lokal pengguna. Pengembang dan pemilik DocMaxy tidak bertanggung jawab atas kerusakan file, kehilangan data, atau konsekuensi hukum akibat dokumen yang Anda proses.'
              : 'DocMaxy services are provided "AS IS" without any warranties of any kind. All processing occurs locally in the user browser. DocMaxy developers and owners shall not be liable for any data loss, file corruption, or legal consequences arising from documents you process.'}
          </div>
        </div>

        {/* Content Sections */}
        <div className="space-y-8 text-slate-700 dark:text-slate-300 text-sm sm:text-base leading-relaxed">
          
          {/* Section 1 */}
          <section>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-amber-500" />
              <span>{lang === 'id' ? '1. Penerimaan Ketentuan' : '1. Acceptance of Terms'}</span>
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              {lang === 'id'
                ? 'Dengan mengakses atau menggunakan aplikasi web DocMaxy, Anda menyatakan setuju untuk terikat oleh Syarat & Ketentuan ini secara penuh. Jika Anda tidak menyetujui bagian manapun dari ketentuan ini, Anda tidak diperkenankan menggunakan aplikasi ini.'
                : 'By accessing or using the DocMaxy web application, you agree to be bound by these Terms of Service in full. If you do not agree with any part of these terms, you must not use this application.'}
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              <span>{lang === 'id' ? '2. Hak Kepemilikan & Tanggung Jawab Berkas' : '2. File Ownership & User Responsibility'}</span>
            </h2>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-400">
              <li>
                <strong>{lang === 'id' ? 'Kepemilikan Berkas' : 'File Ownership'}</strong>: {lang === 'id' ? 'Anda memegang penuh hak cipta dan hak kekayaan intelektual atas dokumen yang Anda proses. DocMaxy tidak pernah mengklaim hak milik atas file pengguna.' : 'You retain full copyright and intellectual property rights over any documents you process. DocMaxy never claims ownership over user files.'}
              </li>
              <li>
                <strong>{lang === 'id' ? 'Legalitas Penggunaan' : 'Legal Compliance'}</strong>: {lang === 'id' ? 'Anda bertanggung jawab penuh untuk memastikan bahwa Anda memiliki hak hukum, izin, atau lisensi yang sah untuk memproses, mengompresi, mengonversi, atau memodifikasi file yang Anda masukkan ke dalam aplikasi ini.' : 'You are solely responsible for ensuring you possess legal rights, authorizations, or licenses to process, compress, convert, or modify any files you load into this application.'}
              </li>
              <li>
                <strong>{lang === 'id' ? 'Penggunaan yang Dilarang' : 'Prohibited Content'}</strong>: {lang === 'id' ? 'Dilarang menggunakan DocMaxy untuk memproses dokumen yang melanggar hukum, dokumen hasil pemalsuan, atau materi yang melanggar hak cipta pihak lain.' : 'You are prohibited from using DocMaxy to process unlawful documents, fraudulent materials, or content infringing third-party intellectual property.'}
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <span>{lang === 'id' ? '3. Penolakan Jaminan (Disclaimer of Warranties)' : '3. Disclaimer of Warranties ("AS IS")'}</span>
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-2">
              {lang === 'id'
                ? 'DocMaxy disediakan secara gratis pada asas "SEBAGAIMANA ADANYA" (AS IS) dan "SEBAGAIMANA TERSEDIA" (AS AVAILABLE). Pengembang tidak memberikan jaminan apapun, baik tersurat maupun tersirat, termasuk namun tidak terbatas pada:'
                : 'DocMaxy is provided for free on an "AS IS" and "AS AVAILABLE" basis. Developers make no warranties of any kind, express or implied, including but not limited to:'}
            </p>
            <ul className="list-disc pl-6 space-y-1.5 text-slate-600 dark:text-slate-400">
              <li>{lang === 'id' ? 'Jaminan bahwa pemrosesan file bebas dari kesalahan atau kegagalan (error-free).' : 'Warranties that file processing will be error-free or uninterrupted.'}</li>
              <li>{lang === 'id' ? 'Jaminan akurasi 100% pada ekstraksi OCR teks atau konversi format layout Word.' : 'Warranties of 100% accuracy in OCR text extraction or Word layout conversion.'}</li>
              <li>{lang === 'id' ? 'Jaminan kesesuaian untuk tujuan bisnis atau legal tertentu.' : 'Warranties of fitness for a particular commercial or legal purpose.'}</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <Scale className="w-5 h-5 text-amber-500" />
              <span>{lang === 'id' ? '4. Pembatasan Tanggung Jawab Hukum (Limitation of Liability)' : '4. Limitation of Liability'}</span>
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-2">
              {lang === 'id'
                ? 'Sejauh diizinkan oleh hukum yang berlaku, pengembang, pemilik, dan afiliasi DocMaxy TIDAK BERTANGGUNG JAWAB atas:'
                : 'To the maximum extent permitted by applicable law, DocMaxy developers, owners, and affiliates SHALL NOT BE LIABLE for:'}
            </p>
            <ul className="list-disc pl-6 space-y-1.5 text-slate-600 dark:text-slate-400">
              <li>{lang === 'id' ? 'Kerugian langsung, tidak langsung, insidental, khusus, atau konsekuensial.' : 'Any direct, indirect, incidental, special, or consequential damages.'}</li>
              <li>{lang === 'id' ? 'Kehilangan data, kerusakan file PDF, atau crash pada browser pengguna.' : 'Data loss, file corruption, or browser failure on user devices.'}</li>
              <li>{lang === 'id' ? 'Kerugian finansial, kehilangan keuntungan bisnis, atau sengketa hukum antar pihak ketiga.' : 'Financial loss, business interruption, or third-party legal disputes.'}</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-amber-500" />
              <span>{lang === 'id' ? '5. Pemisahan Ketentuan (Severability) & Hukum' : '5. Severability & Governing Law'}</span>
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              {lang === 'id'
                ? 'Jika ada bagian dari Syarat & Ketentuan ini yang dinyatakan tidak sah atau tidak dapat diberlakukan oleh pengadilan, bagian tersebut akan dipisahkan tanpa mempengaruhi keabsahan bagian lainnya.'
                : 'If any provision of these Terms is found to be invalid or unenforceable by a court of law, such provision shall be severed without affecting the validity of the remaining provisions.'}
            </p>
          </section>

        </div>
      </main>
    </div>
  );
}
