'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2,
  FileText, Image as ImageIcon, Loader2, PanelsTopLeft, RotateCw
} from 'lucide-react';
import mammoth from 'mammoth';

interface DocumentPreviewModalProps {
  file: File | null;
  onClose: () => void;
}

export function DocumentPreviewModal({ file, onClose }: DocumentPreviewModalProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);
  const [rotation, setRotation] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState<boolean>(true);
  const [pdfDocProxy, setPdfDocProxy] = useState<any>(null);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const isPdf = file ? (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) : false;
  const isImage = file ? (file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name)) : false;
  const isDocx = file ? (file.type.includes('word') || /\.(docx|doc)$/i.test(file.name)) : false;

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (isPdf && pdfDocProxy) {
        if (e.key === 'ArrowRight' || e.key === 'PageDown') {
          setCurrentPage((prev) => Math.min(numPages, prev + 1));
        } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
          setCurrentPage((prev) => Math.max(1, prev - 1));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isPdf, pdfDocProxy, numPages]);

  // Load document content
  useEffect(() => {
    if (!file) return;

    setIsLoading(true);
    setError(null);
    setPdfDocProxy(null);
    setDocxHtml(null);
    setImageUrl(null);
    setCurrentPage(1);
    setScale(1.2);
    setRotation(0);

    let isMounted = true;

    async function loadDoc() {
      try {
        if (isPdf) {
          const pdfjsLib = await import('pdfjs-dist');
          if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
          }
          const buffer = await file!.arrayBuffer();
          const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
          if (isMounted) {
            setPdfDocProxy(doc);
            setNumPages(doc.numPages);
            setIsLoading(false);
          }
        } else if (isImage) {
          const url = URL.createObjectURL(file!);
          if (isMounted) {
            setImageUrl(url);
            setIsLoading(false);
          }
        } else if (isDocx) {
          const buffer = await file!.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
          if (isMounted) {
            setDocxHtml(result.value || '<p class="text-slate-400">Dokumen tidak berisi teks yang dapat ditampilkan.</p>');
            setIsLoading(false);
          }
        } else {
          if (isMounted) {
            setIsLoading(false);
          }
        }
      } catch (err: any) {
        console.error('Error loading file preview:', err);
        if (isMounted) {
          setError(err.message || 'Gagal memuat pratinjau dokumen.');
          setIsLoading(false);
        }
      }
    }

    loadDoc();

    return () => {
      isMounted = false;
    };
  }, [file, isPdf, isImage, isDocx]);

  // Render PDF page to canvas
  const renderPdfPage = useCallback(async () => {
    if (!pdfDocProxy || !canvasRef.current || !isPdf) return;

    try {
      const page = await pdfDocProxy.getPage(currentPage);
      const viewport = page.getViewport({ scale, rotation });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (!ctx) return;

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      const renderContext = {
        canvasContext: ctx,
        viewport,
      };

      await page.render(renderContext).promise;
    } catch (err) {
      console.error('Error rendering page:', err);
    }
  }, [pdfDocProxy, currentPage, scale, rotation, isPdf]);

  useEffect(() => {
    if (pdfDocProxy && isPdf) {
      renderPdfPage();
    }
  }, [pdfDocProxy, currentPage, scale, rotation, isPdf, renderPdfPage]);

  // Clean up Object URL
  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  if (!file) return null;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl h-[90vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900/90 border-b border-slate-800 backdrop-blur shrink-0">
          <div className="flex items-center gap-3 min-w-0 pr-4">
            <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20 shrink-0">
              {isPdf ? <FileText size={20} /> : isImage ? <ImageIcon size={20} /> : <FileText size={20} />}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-slate-100 truncate" title={file.name}>
                {file.name}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {formatFileSize(file.size)}
                {isPdf && numPages > 0 && ` • ${numPages} Halaman`}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {isPdf && (
              <>
                <button
                  onClick={() => setShowSidebar(!showSidebar)}
                  title="Buka/Tutup Sidebar Halaman"
                  className={`p-2 rounded-xl border text-sm font-medium transition-all ${
                    showSidebar ? 'bg-blue-600/20 text-blue-400 border-blue-500/30' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  <PanelsTopLeft size={18} />
                </button>

                <div className="h-5 w-[1px] bg-slate-800 mx-1 hidden sm:block" />

                {/* Zoom controls */}
                <div className="hidden sm:flex items-center bg-slate-800/80 border border-slate-700/80 rounded-xl p-1">
                  <button
                    onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
                    className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                    title="Perkecil (-)"
                  >
                    <ZoomOut size={16} />
                  </button>
                  <span className="text-xs font-semibold text-slate-300 px-2 min-w-[50px] text-center">
                    {Math.round(scale * 100)}%
                  </span>
                  <button
                    onClick={() => setScale((s) => Math.min(3.0, s + 0.2))}
                    className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                    title="Perbesar (+)"
                  >
                    <ZoomIn size={16} />
                  </button>
                  <button
                    onClick={() => { setScale(1.2); setRotation(0); }}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors ml-1"
                    title="Reset Zoom"
                  >
                    <Maximize2 size={15} />
                  </button>
                </div>
              </>
            )}

            {isImage && (
              <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-xl p-1">
                <button
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                  title="Putar 90 Derajat"
                >
                  <RotateCw size={16} />
                </button>
              </div>
            )}

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-red-500/20 hover:border-red-500/30 border border-slate-700 rounded-xl transition-all ml-2"
              title="Tutup (Esc)"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 flex overflow-hidden relative bg-slate-950/60">
          
          {/* Sidebar for PDF thumbnails */}
          {isPdf && showSidebar && numPages > 0 && (
            <div className="w-48 bg-slate-900/90 border-r border-slate-800 overflow-y-auto p-3 flex flex-col gap-3 shrink-0">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 px-1">
                Daftar Halaman ({numPages})
              </p>
              {Array.from({ length: numPages }, (_, i) => i + 1).map((pg) => (
                <button
                  key={pg}
                  onClick={() => setCurrentPage(pg)}
                  className={`flex flex-col items-center p-2 rounded-xl border transition-all text-left group ${
                    currentPage === pg
                      ? 'bg-blue-600/20 border-blue-500 text-blue-400 font-bold shadow-md'
                      : 'bg-slate-800/50 border-slate-700/60 text-slate-400 hover:bg-slate-800 hover:border-slate-600'
                  }`}
                >
                  <div className="w-full aspect-[1/1.414] bg-slate-950 rounded-lg flex items-center justify-center border border-slate-800 text-xs font-semibold">
                    {pg}
                  </div>
                  <span className="text-[11px] mt-1.5 font-medium">Halaman {pg}</span>
                </button>
              ))}
            </div>
          )}

          {/* Main Display Stage */}
          <div className="flex-1 flex flex-col items-center justify-center overflow-auto p-4 relative">
            {isLoading && (
              <div className="flex flex-col items-center gap-3 text-slate-400">
                <Loader2 className="animate-spin text-blue-500" size={36} />
                <p className="text-sm font-medium">Memuat pratinjau dokumen...</p>
              </div>
            )}

            {error && (
              <div className="max-w-md p-6 bg-red-950/40 border border-red-800/60 rounded-2xl text-center text-red-300">
                <p className="font-semibold text-base mb-1">Gagal Memuat Pratinjau</p>
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            {/* Render PDF Canvas */}
            {isPdf && !isLoading && !error && (
              <div className="max-w-full max-h-full flex items-center justify-center p-4">
                <canvas
                  ref={canvasRef}
                  className="max-w-full shadow-2xl rounded-xl border border-slate-800 transition-all bg-white"
                />
              </div>
            )}

            {/* Render Image */}
            {isImage && imageUrl && !isLoading && (
              <div className="max-w-full max-h-full p-4 flex items-center justify-center">
                <img
                  src={imageUrl}
                  alt={file.name}
                  style={{ transform: `rotate(${rotation}deg)` }}
                  className="max-h-[75vh] max-w-full object-contain rounded-xl border border-slate-800 shadow-2xl transition-transform duration-300"
                />
              </div>
            )}

            {/* Render DOCX */}
            {isDocx && docxHtml && !isLoading && (
              <div className="w-full max-w-3xl max-h-[75vh] overflow-y-auto bg-white text-slate-900 p-8 rounded-2xl border border-slate-200 shadow-2xl prose prose-slate max-w-none">
                <div dangerouslySetInnerHTML={{ __html: docxHtml }} />
              </div>
            )}

            {/* Fallback for unsupported formats */}
            {!isPdf && !isImage && !isDocx && !isLoading && (
              <div className="p-8 bg-slate-800/80 border border-slate-700 rounded-3xl text-center max-w-md">
                <FileText className="w-16 h-16 mx-auto text-slate-500 mb-4" />
                <h4 className="text-lg font-bold text-slate-200 mb-2">{file.name}</h4>
                <p className="text-sm text-slate-400 mb-4">
                  Pratinjau visual langsung belum tersedia untuk tipe file ini ({file.type || 'format khusus'}).
                </p>
                <div className="text-xs bg-slate-900/80 p-3 rounded-xl text-slate-300 font-mono text-left space-y-1 border border-slate-800">
                  <p>Ukuran: {formatFileSize(file.size)}</p>
                  <p>Tipe: {file.type || 'Unknown'}</p>
                  <p>Terakhir Diubah: {new Date(file.lastModified).toLocaleString('id-ID')}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer / Floating Navigation for PDF */}
        {isPdf && numPages > 1 && !isLoading && (
          <div className="px-6 py-3 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between shrink-0">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl border border-slate-700 disabled:opacity-40 disabled:pointer-events-none transition-all"
            >
              <ChevronLeft size={18} />
              <span>Sebelumnya</span>
            </button>

            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400 font-medium">Halaman</span>
              <input
                type="number"
                min={1}
                max={numPages}
                value={currentPage}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 1 && val <= numPages) setCurrentPage(val);
                }}
                className="w-14 px-2 py-1 text-center bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-bold focus:outline-none focus:border-blue-500"
              />
              <span className="text-sm text-slate-400 font-medium">dari {numPages}</span>
            </div>

            <button
              onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
              disabled={currentPage >= numPages}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl border border-slate-700 disabled:opacity-40 disabled:pointer-events-none transition-all"
            >
              <span>Berikutnya</span>
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
