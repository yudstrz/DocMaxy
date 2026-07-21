'use client';

import React, { useState, useEffect } from 'react';
import { SortableGrid, PDFDocument } from '@/components/SortableGrid';
import { generatePDFThumbnail } from '@/utils/pdf';
import Uppy from '@uppy/core';
import AwsS3 from '@uppy/aws-s3';

const API_BASE = ''; // Uses relative path and Next.js rewrites

export default function EditPdfPage() {
  const [documents, setDocuments] = useState<PDFDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  // Edit states
  const [text, setText] = useState("");
  const [xPos, setXPos] = useState(100);
  const [yPos, setYPos] = useState(100);
  const [fontSize, setFontSize] = useState(24);
  const [color, setColor] = useState("#000000");
  
  const [uppy] = useState(() => new Uppy({
    autoProceed: false,
    allowMultipleUploadBatches: true,
    restrictions: { allowedFileTypes: ['.pdf'] }
  }).use(AwsS3, {
    shouldUseMultipart: true,
    limit: 4,
    createMultipartUpload: async (file) => {
      const response = await fetch(`${API_BASE}/s3/multipart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, type: file.type })
      });
      return response.json(); 
    },
    listParts: async (file, { uploadId, key }) => {
      const response = await fetch(`${API_BASE}/s3/multipart/${uploadId}/parts?key=${encodeURIComponent(key)}`);
      return response.json(); 
    },
    signPart: async (file, partData) => {
      const response = await fetch(`${API_BASE}/s3/multipart/${partData.uploadId}?key=${encodeURIComponent(partData.key)}&partNumber=${partData.partNumber}`);
      return response.json(); 
    },
    abortMultipartUpload: async (file, { uploadId, key }) => {
      await fetch(`${API_BASE}/s3/multipart/${uploadId}?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
    },
    completeMultipartUpload: async (file, { uploadId, key, parts }) => {
      const response = await fetch(`${API_BASE}/s3/multipart/${uploadId}/complete?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parts }) 
      });
      return response.json(); 
    }
  }));

  useEffect(() => {
    uppy.on('progress', (progress) => {
      setUploadProgress(progress);
    });
    
    return () => {
      uppy.destroy();
    };
  }, [uppy]);

  const handleAddFiles = async (files: FileList | File[]) => {
    setDownloadUrl(null);
    const newDocs: PDFDocument[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      thumbnail: null, 
    }));

    setDocuments((prev) => [...prev, ...newDocs]);

    for (const doc of newDocs) {
      try {
        const thumb = await generatePDFThumbnail(doc.file);
        setDocuments((prev) => 
          prev.map((p) => p.id === doc.id ? { ...p, thumbnail: thumb } : p)
        );
      } catch (e) {
        console.error("Failed to generate thumbnail for", doc.file.name);
      }
    }
  };

  const handleEditSubmit = async () => {
    if (documents.length === 0) {
      alert("Pilih minimal 1 file PDF.");
      return;
    }
    if (!text) {
      alert("Masukkan teks anotasi/watermark.");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setDownloadUrl(null);
    
    try {
      documents.forEach(doc => {
        if (!uppy.getFile(doc.id)) {
           uppy.addFile({
             id: doc.id,
             name: doc.file.name,
             type: doc.file.type,
             data: doc.file,
             meta: { docId: doc.id } 
           });
        }
      });
      
      const result = await uppy.upload();
      
      if (!result || !result.successful || result.successful.length === 0) {
         throw new Error("Sebagian atau seluruh file gagal diupload.");
      }
      
      const filesPayload = documents.map((doc) => {
        const uploadedFile = result.successful?.find((f: any) => f.meta.docId === doc.id);
        return {
          fileId: doc.id,
          filename: doc.file.name,
          s3Key: uploadedFile?.response?.body?.key || uploadedFile?.response?.uploadURL
        };
      }).filter(f => f.s3Key);
      
      if (filesPayload.length === 0) throw new Error("Gagal mendapatkan path file.");

      setIsProcessing(true);
      
      const res = await fetch(`${API_BASE}/api/edit-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            files: filesPayload,
            text,
            x: xPos,
            y: yPos,
            fontSize,
            color
        })
      });
      
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Server error: ${errText}`);
      }
      
      const data = await res.json();
      if (data.downloadUrl) {
         setDownloadUrl(data.downloadUrl);
      }
      
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Gagal memproses upload. Jaringan terputus?");
    } finally {
      setIsUploading(false);
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight sm:text-5xl">
            Edit PDF (Anotasi Teks)
          </h1>
          <p className="mt-4 max-w-2xl text-xl text-slate-500 mx-auto">
            Tambahkan teks (watermark, nomor halaman, atau catatan) pada dokumen PDF Anda.
          </p>
        </div>

        <SortableGrid 
          items={documents} 
          setItems={setDocuments} 
          onAddFiles={handleAddFiles} 
        />
        
        {documents.length > 0 && !downloadUrl && (
            <div className="max-w-4xl mx-auto mt-12 bg-white p-8 rounded-3xl shadow-sm border border-slate-200 animate-in slide-in-from-bottom-4">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Teks yang ditambahkan</label>
                        <input 
                            type="text" 
                            value={text}
                            onChange={e => setText(e.target.value)}
                            placeholder="Contoh: DOKUMEN RAHASIA"
                            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Warna Teks</label>
                        <div className="flex gap-4 items-center">
                            <input 
                                type="color" 
                                value={color}
                                onChange={e => setColor(e.target.value)}
                                className="h-12 w-12 rounded-lg cursor-pointer"
                            />
                            <span className="text-slate-500">{color}</span>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Ukuran Font: {fontSize}px</label>
                        <input 
                            type="range" 
                            min="10" max="120"
                            value={fontSize}
                            onChange={e => setFontSize(parseInt(e.target.value))}
                            className="w-full mt-2"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Posisi X (Kiri-Kanan)</label>
                            <input 
                                type="number" 
                                value={xPos}
                                onChange={e => setXPos(parseInt(e.target.value))}
                                className="w-full px-4 py-2 rounded-xl border border-slate-300"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Posisi Y (Bawah-Atas)</label>
                            <input 
                                type="number" 
                                value={yPos}
                                onChange={e => setYPos(parseInt(e.target.value))}
                                className="w-full px-4 py-2 rounded-xl border border-slate-300"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex flex-col items-center justify-center pt-4 border-t border-slate-100">
                    {isUploading && !isProcessing && (
                        <div className="w-full max-w-md mb-6">
                            <div className="flex justify-between text-sm font-medium text-slate-700 mb-2">
                                <span>Mengupload {documents.length} file...</span>
                                <span>{uploadProgress}%</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-3">
                                <div 
                                    className="bg-purple-500 h-3 rounded-full transition-all duration-300"
                                    style={{ width: `${uploadProgress}%` }}
                                ></div>
                            </div>
                        </div>
                    )}
                    
                    <button
                        onClick={handleEditSubmit}
                        disabled={isUploading || isProcessing || !text}
                        className="px-12 py-4 bg-purple-600 hover:bg-purple-700 text-white font-bold text-lg rounded-2xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isProcessing ? "Menambahkan Teks..." : isUploading ? "Mengunggah..." : "Terapkan Teks ke PDF"}
                    </button>
                </div>
            </div>
        )}

        {downloadUrl && (
          <div className="mt-8 max-w-3xl mx-auto p-8 bg-green-50 border border-green-200 rounded-3xl flex flex-col items-center justify-center animate-in fade-in zoom-in duration-300 shadow-sm">
            <h3 className="text-2xl font-bold text-green-800 mb-3">🎉 PDF Berhasil Diedit!</h3>
            <p className="text-green-600 mb-6 text-center">
                Teks telah berhasil ditambahkan ke dalam PDF. <br/>
                {documents.length > 1 ? "File Anda di-bundle dalam 1 buah ZIP agar mudah didownload." : ""}
            </p>
            <a 
              href={downloadUrl} 
              target="_blank"
              download
              className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-bold text-lg rounded-2xl shadow-md transition-all flex items-center gap-2"
            >
              Unduh Hasil PDF
            </a>
            
            <button 
                onClick={() => {
                    setDownloadUrl(null);
                    setDocuments([]);
                    uppy.cancelAll();
                }}
                className="mt-6 text-green-700 hover:text-green-900 font-semibold text-sm underline"
            >
                Edit file lainnya
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
