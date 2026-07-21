'use client';

import React, { useState, useEffect, useRef } from 'react';
import Uppy from '@uppy/core';
import AwsS3 from '@uppy/aws-s3';
import { generatePDFThumbnail } from '@/utils/pdf';
import { FileUp, Trash2, FileSignature, Layers } from 'lucide-react';

const API_BASE = ''; // Uses relative path and Next.js rewrites

export default function SplitPage() {
  const [file, setFile] = useState<{ id: string, file: File, thumbnail: string | null } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<'extract' | 'split_all'>('extract');
  const [pagesStr, setPagesStr] = useState('1');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [uppy] = useState(() => new Uppy({
    autoProceed: false,
    allowMultipleUploadBatches: false,
    restrictions: { maxNumberOfFiles: 1, allowedFileTypes: ['.pdf'] }
  }).use(AwsS3, {
    shouldUseMultipart: true,
    limit: 4,
    createMultipartUpload: async (f) => {
      const response = await fetch(`${API_BASE}/s3/multipart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: f.name, type: f.type })
      });
      return response.json(); 
    },
    listParts: async (f, { uploadId, key }) => {
      const response = await fetch(`${API_BASE}/s3/multipart/${uploadId}/parts?key=${encodeURIComponent(key)}`);
      return response.json(); 
    },
    signPart: async (f, partData) => {
      const response = await fetch(`${API_BASE}/s3/multipart/${partData.uploadId}?key=${encodeURIComponent(partData.key)}&partNumber=${partData.partNumber}`);
      return response.json(); 
    },
    abortMultipartUpload: async (f, { uploadId, key }) => {
      await fetch(`${API_BASE}/s3/multipart/${uploadId}?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
    },
    completeMultipartUpload: async (f, { uploadId, key, parts }) => {
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      setDownloadUrl(null);
      uppy.cancelAll();
      
      const newFile = {
        id: crypto.randomUUID(),
        file: selectedFile,
        thumbnail: null
      };
      setFile(newFile);
      
      try {
        const thumb = await generatePDFThumbnail(selectedFile);
        setFile(prev => prev ? { ...prev, thumbnail: thumb } : null);
      } catch (err) {
        console.error("Failed thumbnail generation:", err);
      }
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    uppy.cancelAll();
    setDownloadUrl(null);
  };

  const handleSplitSubmit = async () => {
    if (!file) return;

    if (mode === 'extract' && !pagesStr.trim()) {
      alert("Masukkan rentang halaman yang ingin diekstrak (contoh: 1, 3, 5-7)");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setDownloadUrl(null);
    
    try {
      uppy.addFile({
        id: file.id,
        name: file.file.name,
        type: file.file.type,
        data: file.file,
        meta: { docId: file.id } 
      });
      
      const result = await uppy.upload();
      
      if (!result || !result.successful || result.successful.length === 0) {
         throw new Error("Gagal mengunggah file.");
      }
      
      const uploadedFile = result.successful[0];
      const s3Key = uploadedFile?.response?.body?.key || uploadedFile?.response?.uploadURL;
      
      setIsProcessing(true);
      
      const splitResponse = await fetch(`${API_BASE}/api/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          fileId: file.id,
          filename: file.file.name,
          s3Key: s3Key,
          mode: mode,
          pages: pagesStr
        })
      });
      
      if (!splitResponse.ok) {
        const errText = await splitResponse.text();
        throw new Error(`Server error: ${errText}`);
      }
      
      const splitData = await splitResponse.json();
      if (splitData.downloadUrl) {
         setDownloadUrl(splitData.downloadUrl);
      }
      
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Gagal memproses file.");
    } finally {
      setIsUploading(false);
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight sm:text-5xl">
            Pisahkan PDF
          </h1>
          <p className="mt-4 max-w-2xl text-xl text-slate-500 mx-auto">
            Ekstrak halaman tertentu jadi PDF tunggal atau pecah semua halaman sekaligus menjadi file ZIP terpisah.
          </p>
        </div>

        {!file ? (
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-4 border-dashed border-slate-300 bg-white rounded-3xl p-16 flex flex-col items-center justify-center text-center cursor-pointer hover:border-orange-500 hover:bg-orange-50 transition-all group"
          >
            <input 
              type="file" 
              accept="application/pdf"
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileChange}
            />
            <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <FileUp className="w-10 h-10 text-orange-600" />
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2">Pilih file PDF</h3>
            <p className="text-slate-500">atau klik di sini untuk mencari dari komputer</p>
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200">
            <div className="flex items-center gap-6 mb-8 pb-8 border-b border-slate-100">
              <div className="relative w-32 h-40 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shadow-sm shrink-0">
                {file.thumbnail ? (
                  <img src={file.thumbnail} alt={file.file.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400">Loading...</div>
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-slate-800 break-all">{file.file.name}</h3>
                <p className="text-slate-500 mt-1">{(file.file.size / 1024 / 1024).toFixed(2)} MB</p>
                <button 
                  onClick={handleRemoveFile}
                  className="mt-4 flex items-center gap-2 text-red-500 hover:text-red-700 font-medium text-sm transition-colors"
                >
                  <Trash2 className="w-4 h-4" /> Ganti File
                </button>
              </div>
            </div>

            <div className="space-y-6 mb-10">
              <h4 className="text-lg font-bold text-slate-800">Pilih Mode Pemisahan:</h4>
              
              <div className="grid sm:grid-cols-2 gap-4">
                <div 
                  onClick={() => setMode('extract')}
                  className={`border-2 rounded-xl p-5 cursor-pointer transition-all flex gap-4 ${mode === 'extract' ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:border-orange-300'}`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${mode === 'extract' ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    <FileSignature className="w-5 h-5" />
                  </div>
                  <div>
                    <h5 className={`font-bold ${mode === 'extract' ? 'text-orange-900' : 'text-slate-700'}`}>Ekstrak Halaman</h5>
                    <p className="text-sm text-slate-500 mt-1">Pilih halaman spesifik untuk dijadikan 1 file PDF baru.</p>
                  </div>
                </div>

                <div 
                  onClick={() => setMode('split_all')}
                  className={`border-2 rounded-xl p-5 cursor-pointer transition-all flex gap-4 ${mode === 'split_all' ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:border-orange-300'}`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${mode === 'split_all' ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h5 className={`font-bold ${mode === 'split_all' ? 'text-orange-900' : 'text-slate-700'}`}>Pecah Semua</h5>
                    <p className="text-sm text-slate-500 mt-1">Ubah setiap halaman menjadi file PDF terpisah (dalam bentuk ZIP).</p>
                  </div>
                </div>
              </div>

              {mode === 'extract' && (
                <div className="mt-6 bg-slate-50 p-6 rounded-xl border border-slate-200 animate-in slide-in-from-top-2">
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Halaman yang ingin diekstrak:
                  </label>
                  <input
                    type="text"
                    value={pagesStr}
                    onChange={(e) => setPagesStr(e.target.value)}
                    placeholder="Contoh: 1, 3, 5-10"
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
                  />
                  <p className="text-xs text-slate-500 mt-2">Pisahkan dengan koma atau gunakan tanda hubung untuk rentang.</p>
                </div>
              )}
            </div>

            {downloadUrl && (
              <div className="mt-8 p-6 bg-green-50 border border-green-200 rounded-2xl flex flex-col items-center justify-center animate-in fade-in zoom-in duration-300">
                <h3 className="text-xl font-bold text-green-800 mb-2">🎉 Berhasil Dipisahkan!</h3>
                <p className="text-green-600 mb-4">Silakan unduh file hasil pemisahan Anda.</p>
                <a 
                  href={downloadUrl} 
                  target="_blank"
                  download
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-md transition-all"
                >
                  Unduh File Sekarang
                </a>
              </div>
            )}

            <div className="mt-8 flex flex-col items-center justify-center border-t border-slate-100 pt-8">
              {isUploading && !isProcessing && (
                 <div className="w-full mb-6">
                   <div className="flex justify-between text-sm font-medium text-slate-700 mb-2">
                     <span>Mengupload file...</span>
                     <span>{uploadProgress}%</span>
                   </div>
                   <div className="w-full bg-slate-200 rounded-full h-3">
                     <div 
                       className="bg-orange-500 h-3 rounded-full transition-all duration-300"
                       style={{ width: `${uploadProgress}%` }}
                     ></div>
                   </div>
                 </div>
              )}
              
              <button
                onClick={handleSplitSubmit}
                disabled={isUploading || isProcessing}
                className="w-full sm:w-auto px-12 py-4 bg-orange-600 hover:bg-orange-700 text-white font-bold text-lg rounded-2xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isProcessing ? "Memproses PDF..." : isUploading ? "Mengunggah..." : "Pisahkan PDF"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
