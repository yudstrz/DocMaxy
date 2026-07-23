'use client';

import React, { useState } from 'react';
import { SortableGrid, PDFDocument as LocalPDFDocument } from '@/components/SortableGrid';
import { generatePDFThumbnail } from '@/utils/pdf';
import { applyWatermarkAndNumbering, NumberPosition, PageNumberOptions, WatermarkOptions } from '@/utils/watermark';
import { saveAs } from 'file-saver';
import { saveHistoryItem } from '@/utils/historyDB';
import { useClipboardPaste } from '@/hooks/useClipboardPaste';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { GranularProgressModal } from '@/components/GranularProgressModal';
import { SmartPasswordModal } from '@/components/SmartPasswordModal';
import { Stamp, Hash, Type, Image as ImageIcon, Sliders, CheckCircle2, Download } from 'lucide-react';
import toast from 'react-hot-toast';

export default function WatermarkNumberingPage() {
  const [documents, setDocuments] = useState<LocalPDFDocument[]>([]);
  const [activeTab, setActiveTab] = useState<'numbering' | 'watermark'>('numbering');

  // Page numbering options
  const [numberEnabled, setNumberEnabled] = useState(true);
  const [position, setPosition] = useState<NumberPosition>('bottom-center');
  const [numberFormat, setNumberFormat] = useState('Halaman {x} dari {y}');
  const [fontSize, setFontSize] = useState(12);
  const [margin, setMargin] = useState(25);
  const [numberColor, setNumberColor] = useState('#333333');

  // Watermark options
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);
  const [watermarkType, setWatermarkType] = useState<'text' | 'image'>('text');
  const [watermarkText, setWatermarkText] = useState('RAHASIA');
  const [watermarkImage, setWatermarkImage] = useState<File | null>(null);
  const [wmFontSize, setWmFontSize] = useState(54);
  const [wmColor, setWmColor] = useState('#999999');
  const [wmOpacity, setWmOpacity] = useState(0.25);
  const [wmRotation, setWmRotation] = useState(45);
  const [wmScale, setWmScale] = useState(0.5);

  // Processing & progress states
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; fileName: string } | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string>('');

  // Password prompt state
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [lockedFile, setLockedFile] = useState<File | null>(null);

  const handleAddFiles = async (files: FileList | File[]) => {
    setDownloadUrl(null);
    const newDocs: LocalPDFDocument[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      thumbnail: null,
    }));
    setDocuments((prev) => [...prev, ...newDocs]);

    for (const doc of newDocs) {
      try {
        const thumb = await generatePDFThumbnail(doc.file);
        setDocuments((prev) => prev.map((p) => p.id === doc.id ? { ...p, thumbnail: thumb } : p));
      } catch (err: any) {
        if (err?.name === 'PasswordException' || err?.message?.includes('password')) {
          setLockedFile(doc.file);
          setIsPasswordModalOpen(true);
        }
      }
    }
  };

  useClipboardPaste((pastedFiles) => {
    const pdfs = pastedFiles.filter((f) => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    if (pdfs.length > 0) handleAddFiles(pdfs);
  });

  useKeyboardShortcuts({
    onOpenFileDialog: () => {
      document.querySelector<HTMLInputElement>('input[type="file"]')?.click();
    },
    onSubmitAction: () => {
      if (documents.length > 0 && !isProcessing) handleApply();
    },
  });

  const handleApply = async () => {
    if (documents.length === 0) {
      toast.error('Pilih minimal 1 file PDF.');
      return;
    }
    if (!numberEnabled && !watermarkEnabled) {
      toast.error('Aktifkan minimal Nomor Halaman atau Watermark.');
      return;
    }

    setIsProcessing(true);
    setDownloadUrl(null);

    const numOpts: PageNumberOptions = {
      enabled: numberEnabled,
      position,
      format: numberFormat,
      fontSize,
      margin,
      colorHex: numberColor,
    };

    const wmOpts: WatermarkOptions = {
      enabled: watermarkEnabled,
      type: watermarkType,
      text: watermarkText,
      imageFile: watermarkImage,
      fontSize: wmFontSize,
      colorHex: wmColor,
      opacity: wmOpacity,
      rotationDegree: wmRotation,
      scale: wmScale,
    };

    try {
      const doc = documents[0];
      const buffer = await doc.file.arrayBuffer();

      const resultBytes = await applyWatermarkAndNumbering(
        buffer,
        numOpts,
        wmOpts,
        (current, total) => setProgress({ current, total, fileName: doc.file.name })
      );

      const blob = new Blob([resultBytes as BlobPart], { type: 'application/pdf' });
      const filename = `${doc.file.name.replace(/\.[^/.]+$/, '')}_watermarked.pdf`;

      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setDownloadFilename(filename);

      // Auto save to IndexedDB session history
      await saveHistoryItem(filename, 'Watermark & Numbering', blob);
      toast.success('PDF berhasil diberi Nomor Halaman & Watermark!');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Gagal memproses PDF.');
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 transition-colors">
      <main className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-3 bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 rounded-2xl mb-4 shadow-sm">
            <Stamp className="w-8 h-8" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Nomor Halaman & Watermark
          </h1>
          <p className="mt-3 max-w-2xl text-base sm:text-lg text-slate-600 dark:text-slate-400 mx-auto">
            Tambahkan penanda otomatis, nomor halaman kustom, dan tanda air (teks miring / logo transparan) pada dokumen PDF Anda.
          </p>
        </div>

        <SortableGrid items={documents} setItems={setDocuments} onAddFiles={handleAddFiles} />

        {documents.length > 0 && !downloadUrl && (
          <div className="mt-10 bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 dark:border-slate-800">
            {/* Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 mb-8">
              <button
                onClick={() => setActiveTab('numbering')}
                className={`flex items-center gap-2 pb-4 px-6 font-bold text-sm border-b-2 transition-all ${
                  activeTab === 'numbering'
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Hash className="w-4 h-4" />
                <span>Nomor Halaman</span>
              </button>
              <button
                onClick={() => setActiveTab('watermark')}
                className={`flex items-center gap-2 pb-4 px-6 font-bold text-sm border-b-2 transition-all ${
                  activeTab === 'watermark'
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Stamp className="w-4 h-4" />
                <span>Watermark</span>
              </button>
            </div>

            {/* TAB 1: Numbering Settings */}
            {activeTab === 'numbering' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl border border-indigo-100 dark:border-indigo-900/60">
                  <span className="font-semibold text-indigo-950 dark:text-indigo-200 text-sm">
                    Aktifkan Penomoran Halaman
                  </span>
                  <input
                    type="checkbox"
                    checked={numberEnabled}
                    onChange={(e) => setNumberEnabled(e.target.checked)}
                    className="w-5 h-5 accent-indigo-600 cursor-pointer rounded"
                  />
                </div>

                {numberEnabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Position */}
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        Posisi Nomor
                      </label>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        {[
                          { id: 'top-left', label: 'Atas Kiri' },
                          { id: 'top-center', label: 'Atas Tengah' },
                          { id: 'top-right', label: 'Atas Kanan' },
                          { id: 'bottom-left', label: 'Bawah Kiri' },
                          { id: 'bottom-center', label: 'Bawah Tengah' },
                          { id: 'bottom-right', label: 'Bawah Kanan' },
                        ].map((pos) => (
                          <button
                            key={pos.id}
                            type="button"
                            onClick={() => setPosition(pos.id as NumberPosition)}
                            className={`p-3 rounded-xl border font-semibold transition-all ${
                              position === pos.id
                                ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-indigo-300'
                            }`}
                          >
                            {pos.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Format */}
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        Format Teks
                      </label>
                      <select
                        value={numberFormat}
                        onChange={(e) => setNumberFormat(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="Halaman {x} dari {y}">Halaman X dari Y (contoh: Halaman 1 dari 10)</option>
                        <option value="Halaman {x}">Halaman X (contoh: Halaman 1)</option>
                        <option value="{x} / {y}">X / Y (contoh: 1 / 10)</option>
                        <option value="{x}">X (hanya angka)</option>
                      </select>

                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">
                            Ukuran Font ({fontSize}pt)
                          </label>
                          <input
                            type="range"
                            min="8"
                            max="24"
                            value={fontSize}
                            onChange={(e) => setFontSize(Number(e.target.value))}
                            className="w-full accent-indigo-600"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">
                            Margin Edge ({margin}px)
                          </label>
                          <input
                            type="range"
                            min="10"
                            max="60"
                            value={margin}
                            onChange={(e) => setMargin(Number(e.target.value))}
                            className="w-full accent-indigo-600"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Watermark Settings */}
            {activeTab === 'watermark' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-950/40 rounded-2xl border border-amber-100 dark:border-amber-900/60">
                  <span className="font-semibold text-amber-950 dark:text-amber-200 text-sm">
                    Aktifkan Watermark Overlay
                  </span>
                  <input
                    type="checkbox"
                    checked={watermarkEnabled}
                    onChange={(e) => setWatermarkEnabled(e.target.checked)}
                    className="w-5 h-5 accent-amber-600 cursor-pointer rounded"
                  />
                </div>

                {watermarkEnabled && (
                  <div className="space-y-6">
                    {/* Watermark type selector */}
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => setWatermarkType('text')}
                        className={`flex-1 p-4 rounded-2xl border-2 flex items-center justify-center gap-2 font-bold text-sm transition-all ${
                          watermarkType === 'text'
                            ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <Type className="w-5 h-5" />
                        <span>Teks Watermark</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setWatermarkType('image')}
                        className={`flex-1 p-4 rounded-2xl border-2 flex items-center justify-center gap-2 font-bold text-sm transition-all ${
                          watermarkType === 'image'
                            ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <ImageIcon className="w-5 h-5" />
                        <span>Logo / Gambar Transparan</span>
                      </button>
                    </div>

                    {watermarkType === 'text' ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                            Pilih atau Ketik Teks Watermark
                          </label>
                          <div className="flex gap-2 mb-3">
                            {['RAHASIA', 'DRAFT', 'CONFIDENTIAL', 'CONTOH'].map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => setWatermarkText(preset)}
                                className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-amber-100 text-xs font-semibold text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
                              >
                                {preset}
                              </button>
                            ))}
                          </div>
                          <input
                            type="text"
                            value={watermarkText}
                            onChange={(e) => setWatermarkText(e.target.value)}
                            placeholder="Contoh: RAHASIA"
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">
                              Rotasi ({wmRotation}°)
                            </label>
                            <input
                              type="range"
                              min="-90"
                              max="90"
                              value={wmRotation}
                              onChange={(e) => setWmRotation(Number(e.target.value))}
                              className="w-full accent-amber-500"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">
                              Transparansi / Opacity ({Math.round(wmOpacity * 100)}%)
                            </label>
                            <input
                              type="range"
                              min="0.05"
                              max="0.8"
                              step="0.05"
                              value={wmOpacity}
                              onChange={(e) => setWmOpacity(Number(e.target.value))}
                              className="w-full accent-amber-500"
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-6 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl text-center">
                        <label className="cursor-pointer flex flex-col items-center">
                          <ImageIcon className="w-10 h-10 text-amber-500 mb-2" />
                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            {watermarkImage ? watermarkImage.name : 'Unggah Logo PNG/JPG Transparan'}
                          </span>
                          <span className="text-xs text-slate-400 mt-1">
                            Disarankan format PNG dengan latar belakang transparan
                          </span>
                          <input
                            type="file"
                            accept="image/png, image/jpeg"
                            onChange={(e) => setWatermarkImage(e.target.files?.[0] || null)}
                            className="hidden"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Action Submit */}
            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-center">
              <button
                onClick={handleApply}
                disabled={isProcessing}
                className="w-full sm:w-auto px-10 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base rounded-2xl shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Stamp className="w-5 h-5" />
                <span>{isProcessing ? 'Memproses PDF...' : 'Terapkan & Buat PDF'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Download Box */}
        {downloadUrl && (
          <div className="mt-8 max-w-2xl mx-auto p-8 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-3xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 dark:text-emerald-400 mb-3" />
            <h3 className="text-2xl font-bold text-emerald-900 dark:text-emerald-200 mb-1">
              Berhasil Diterapkan!
            </h3>
            <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-6">
              Dokumen PDF Anda telah selesai diberi nomor halaman / watermark.
            </p>
            <button
              onClick={() => saveAs(downloadUrl, downloadFilename)}
              className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base rounded-2xl shadow-md transition-all flex items-center gap-2"
            >
              <Download className="w-5 h-5" />
              <span>Unduh Dokumen Hasil</span>
            </button>
          </div>
        )}
      </main>

      <GranularProgressModal
        isOpen={isProcessing && progress !== null}
        current={progress?.current || 0}
        total={progress?.total || 0}
        fileName={progress?.fileName}
        stepDescription="Menerapkan Nomor Halaman & Watermark..."
      />

      <SmartPasswordModal
        isOpen={isPasswordModalOpen}
        fileName={lockedFile?.name}
        onUnlock={async (password) => {
          setIsPasswordModalOpen(false);
          toast.success('Kata sandi diterima.');
          return true;
        }}
        onClose={() => setIsPasswordModalOpen(false)}
      />
    </div>
  );
}
