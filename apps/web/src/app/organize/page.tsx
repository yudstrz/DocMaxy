'use client';

import React, { useState } from 'react';
import { generatePDFThumbnail } from '@/utils/pdf';
import { generateOrganizedPDF, PageItem } from '@/utils/organizePdf';
import { saveAs } from 'file-saver';
import { saveHistoryItem } from '@/utils/historyDB';
import { useClipboardPaste } from '@/hooks/useClipboardPaste';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { GranularProgressModal } from '@/components/GranularProgressModal';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { HoverPreviewLens } from '@/components/HoverPreviewLens';
import { LayoutGrid, RotateCw, Trash2, Plus, Download, FileText, CheckCircle2, FilePlus } from 'lucide-react';
import toast from 'react-hot-toast';

export default function OrganizePage() {
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string>('');

  const handleUploadFiles = async (e: React.ChangeEvent<HTMLInputElement> | { target: { files: FileList | File[] } }) => {
    const uploaded = Array.from(e.target.files || []);
    if (uploaded.length === 0) return;

    setDownloadUrl(null);
    const startIndex = sourceFiles.length;
    const newFiles = [...sourceFiles, ...uploaded];
    setSourceFiles(newFiles);

    const pdfjsLib = await import('pdfjs-dist');
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    }

    const newPageItems: PageItem[] = [];

    for (let fIdx = 0; fIdx < uploaded.length; fIdx++) {
      const file = uploaded[fIdx];
      const realFileIndex = startIndex + fIdx;
      try {
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        const totalPages = pdf.numPages;

        for (let pIdx = 0; pIdx < totalPages; pIdx++) {
          newPageItems.push({
            id: crypto.randomUUID(),
            sourceFileIndex: realFileIndex,
            pageIndex: pIdx,
            rotation: 0,
            thumbnailUrl: null,
          });
        }
      } catch (err: any) {
        toast.error(`Gagal membaca ${file.name}`);
      }
    }

    setPages((prev) => [...prev, ...newPageItems]);

    // Asynchronously generate thumbnails
    for (const item of newPageItems) {
      try {
        const srcFile = newFiles[item.sourceFileIndex];
        const buffer = await srcFile.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        const pdfPage = await pdf.getPage(item.pageIndex + 1);

        const viewport = pdfPage.getViewport({ scale: 0.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await pdfPage.render({ canvasContext: ctx, viewport }).promise;
          const thumb = canvas.toDataURL('image/jpeg', 0.7);
          setPages((prev) => prev.map((p) => p.id === item.id ? { ...p, thumbnailUrl: thumb } : p));
        }
      } catch {
        // Thumbnail fallback
      }
    }
  };

  useClipboardPaste((files) => {
    const pdfs = files.filter((f) => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    if (pdfs.length > 0) handleUploadFiles({ target: { files: pdfs } });
  });

  useKeyboardShortcuts({
    onOpenFileDialog: () => {
      document.querySelector<HTMLInputElement>('#organize-file-input')?.click();
    },
    onSubmitAction: () => {
      if (pages.length > 0 && !isProcessing) handleExportAll();
    },
  });

  // Range preset selectors
  const selectOddPages = () => {
    const odd = new Set<string>();
    pages.forEach((p, idx) => {
      if ((idx + 1) % 2 !== 0) odd.add(p.id);
    });
    setSelectedIds(odd);
    toast.success('Terpilih Halaman Ganjil');
  };

  const selectEvenPages = () => {
    const even = new Set<string>();
    pages.forEach((p, idx) => {
      if ((idx + 1) % 2 === 0) even.add(p.id);
    });
    setSelectedIds(even);
    toast.success('Terpilih Halaman Genap');
  };

  const selectFirst5Pages = () => {
    const first5 = new Set<string>();
    pages.slice(0, 5).forEach((p) => first5.add(p.id));
    setSelectedIds(first5);
    toast.success('Terpilih 5 Halaman Pertama');
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === pages.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pages.map((p) => p.id)));
    }
  };

  // Page manipulations
  const rotatePage = (id: string) => {
    setPages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, rotation: (p.rotation + 90) % 360 } : p))
    );
  };

  const deletePage = (id: string) => {
    setPages((prev) => prev.filter((p) => p.id !== id));
    setSelectedIds((prev) => {
      const copy = new Set(prev);
      copy.delete(id);
      return copy;
    });
  };

  const insertBlankPage = (afterIndex: number) => {
    const blankItem: PageItem = {
      id: crypto.randomUUID(),
      sourceFileIndex: -1,
      pageIndex: -1,
      rotation: 0,
      isBlank: true,
      thumbnailUrl: null,
    };
    setPages((prev) => {
      const copy = [...prev];
      copy.splice(afterIndex + 1, 0, blankItem);
      return copy;
    });
    toast.success('Halaman kosong diselipkan 📄');
  };

  const movePage = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= pages.length) return;
    setPages((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, item);
      return copy;
    });
  };

  // Export handlers
  const handleExportAll = async () => {
    if (pages.length === 0) return;
    await processAndExport(pages, 'Organized_Document.pdf');
  };

  const handleExportSelected = async () => {
    if (selectedIds.size === 0) {
      toast.error('Pilih minimal 1 halaman untuk diekstrak.');
      return;
    }
    const selectedPages = pages.filter((p) => selectedIds.has(p.id));
    await processAndExport(selectedPages, 'Extracted_Pages.pdf');
  };

  const processAndExport = async (targetPages: PageItem[], filename: string) => {
    setIsProcessing(true);
    setDownloadUrl(null);

    try {
      const bytes = await generateOrganizedPDF(sourceFiles, targetPages, (curr, tot) =>
        setProgress({ current: curr, total: tot })
      );

      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setDownloadFilename(filename);

      await saveHistoryItem(filename, 'Page Organizer', blob);
      toast.success('PDF berhasil disebarkan & disimpan!');
    } catch (err: any) {
      toast.error(err.message || 'Gagal memproses susunan halaman.');
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 transition-colors">
      <main className="max-w-7xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-3 bg-cyan-100 dark:bg-cyan-950 text-cyan-600 dark:text-cyan-400 rounded-2xl mb-4 shadow-sm">
            <LayoutGrid className="w-8 h-8" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Atur Halaman PDF (Organizer & Extractor)
          </h1>
          <p className="mt-3 max-w-2xl text-base sm:text-lg text-slate-600 dark:text-slate-400 mx-auto">
            Grid interaktif per-halaman. Hapus, putar, selipkan halaman kosong, urutkan bebas, atau ekstrak halaman terpilih.
          </p>
        </div>

        {/* Upload Box */}
        {pages.length === 0 && (
          <div className="max-w-2xl mx-auto p-10 bg-white dark:bg-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl text-center shadow-sm">
            <input
              id="organize-file-input"
              type="file"
              accept="application/pdf"
              multiple
              onChange={handleUploadFiles}
              className="hidden"
            />
            <label htmlFor="organize-file-input" className="cursor-pointer flex flex-col items-center">
              <div className="p-4 bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 rounded-2xl mb-4">
                <FilePlus className="w-10 h-10" />
              </div>
              <span className="text-xl font-bold text-slate-800 dark:text-white mb-1">
                Pilih Dokumen PDF
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                atau tarik file ke sini (bisa lebih dari 1 file)
              </span>
              <span className="text-xs text-cyan-600 dark:text-cyan-400 font-semibold mt-4">
                💡 Tip: Tekan Ctrl+V untuk menempel file dari clipboard
              </span>
            </label>
          </div>
        )}

        {/* Workspace Toolbar */}
        {pages.length > 0 && (
          <div className="mb-6 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2">
                Preset Seleksi Range:
              </span>
              <button
                onClick={selectOddPages}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-cyan-50 dark:hover:bg-cyan-950 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors"
              >
                🔘 Halaman Ganjil
              </button>
              <button
                onClick={selectEvenPages}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-cyan-50 dark:hover:bg-cyan-950 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors"
              >
                🔘 Halaman Genap
              </button>
              <button
                onClick={selectFirst5Pages}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-cyan-50 dark:hover:bg-cyan-950 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors"
              >
                🔘 5 Pertama
              </button>
              <button
                onClick={() => insertBlankPage(pages.length - 1)}
                className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Sisipkan Halaman Kosong</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="add-more-pdf"
                type="file"
                accept="application/pdf"
                multiple
                onChange={handleUploadFiles}
                className="hidden"
              />
              <label
                htmlFor="add-more-pdf"
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                + Tambah PDF
              </label>

              {selectedIds.size > 0 && (
                <button
                  onClick={handleExportSelected}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
                >
                  Ekstrak ({selectedIds.size})
                </button>
              )}

              <button
                onClick={handleExportAll}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-all"
              >
                Simpan Dokumen
              </button>
            </div>
          </div>
        )}

        {/* Thumbnail Grid */}
        {pages.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-24">
            {pages.map((page, index) => {
              const isSelected = selectedIds.has(page.id);

              return (
                <div
                  key={page.id}
                  onClick={() => {
                    setSelectedIds((prev) => {
                      const copy = new Set(prev);
                      if (copy.has(page.id)) copy.delete(page.id);
                      else copy.add(page.id);
                      return copy;
                    });
                  }}
                  className={`group relative bg-white dark:bg-slate-900 border-2 rounded-2xl p-3 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col items-center select-none ${
                    isSelected
                      ? 'border-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/30 ring-2 ring-cyan-500/20'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {/* Select Checkbox */}
                  <div className="absolute top-2 left-2 z-10">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}} // handled by parent onClick
                      className="w-4 h-4 accent-cyan-600 rounded cursor-pointer"
                    />
                  </div>

                  {/* Hover preview lens */}
                  <HoverPreviewLens
                    thumbnailUrl={page.thumbnailUrl}
                    title={`Halaman ${index + 1}`}
                  />

                  {/* Page Preview */}
                  <div className="w-full h-40 bg-slate-100 dark:bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center mb-2 relative">
                    {page.isBlank ? (
                      <div className="text-center p-2 text-slate-400">
                        <FileText className="w-8 h-8 mx-auto mb-1 opacity-50" />
                        <span className="text-[10px] font-bold uppercase">Kosong</span>
                      </div>
                    ) : page.thumbnailUrl ? (
                      <img
                        src={page.thumbnailUrl}
                        alt={`Page ${index + 1}`}
                        className="max-h-full object-contain transition-transform duration-200"
                        style={{ transform: `rotate(${page.rotation}deg)` }}
                      />
                    ) : (
                      <span className="text-xs text-slate-400">Halaman {index + 1}</span>
                    )}
                  </div>

                  {/* Page Label & Action Controls */}
                  <div className="w-full flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span>hal. {index + 1}</span>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          rotatePage(page.id);
                        }}
                        title="Putar 90°"
                        className="p-1 text-slate-400 hover:text-indigo-600 rounded"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePage(page.id);
                        }}
                        title="Hapus Halaman"
                        className="p-1 text-slate-400 hover:text-rose-600 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Download Box */}
        {downloadUrl && (
          <div className="mt-8 max-w-2xl mx-auto p-8 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-3xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 dark:text-emerald-400 mb-3" />
            <h3 className="text-2xl font-bold text-emerald-900 dark:text-emerald-200 mb-1">
              🎉 Berhasil Disusun!
            </h3>
            <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-6">
              Dokumen PDF hasil susunan halaman baru telah siap diunduh.
            </p>
            <button
              onClick={() => saveAs(downloadUrl, downloadFilename)}
              className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base rounded-2xl shadow-md transition-all flex items-center gap-2"
            >
              <Download className="w-5 h-5" />
              <span>Unduh Hasil PDF</span>
            </button>
          </div>
        )}
      </main>

      <FloatingActionBar
        totalCount={pages.length}
        selectedCount={selectedIds.size}
        allSelected={selectedIds.size === pages.length && pages.length > 0}
        onToggleSelectAll={toggleSelectAll}
        onClearAll={() => {
          setPages([]);
          setSelectedIds(new Set());
          setSourceFiles([]);
        }}
      />

      <GranularProgressModal
        isOpen={isProcessing && progress !== null}
        current={progress?.current || 0}
        total={progress?.total || 0}
        stepDescription="Menyusun & Mengompres Halaman PDF..."
      />
    </div>
  );
}
