'use client';

import React, { useState, useEffect } from 'react';
import { SortableGrid, PDFDocument } from '@/components/SortableGrid';
import { generatePDFThumbnail } from '@/utils/pdf';
import Uppy from '@uppy/core';
import AwsS3 from '@uppy/aws-s3';
import { RotateCw, RotateCcw, FlipVertical } from 'lucide-react';

const API_BASE = ''; // Uses relative path and Next.js rewrites

export default function RotatePage() {
  const [documents, setDocuments] = useState<PDFDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [angle, setAngle] = useState<90 | 180 | 270>(90);
  
  const [uppy] = useState(() => new Uppy({
    autoProceed: false,
    allowMultipleUploadBatches: true,
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

  const handleRotateSubmit = async () => {
    if (documents.length === 0) {
      alert("Pilih minimal 1 file untuk diputar.");
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
      
      const rotateResponse = await fetch(`${API_BASE}/api/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            files: filesPayload,
            angle: angle 
        })
      });
      
      if (!rotateResponse.ok) {
        const errText = await rotateResponse.text();
        throw new Error(`Server error: ${errText}`);
      }
      
      const rotateData = await rotateResponse.json();
      if (rotateData.downloadUrl) {
         setDownloadUrl(rotateData.downloadUrl);
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
            Putar PDF
          </h1>
          <p className="mt-4 max-w-2xl text-xl text-slate-500 mx-auto">
            Putar PDF sesuai kebutuhan. Anda bahkan dapat memutar beberapa PDF sekaligus!
          </p>
        </div>

        <SortableGrid 
          items={documents} 
          setItems={setDocuments} 
          onAddFiles={handleAddFiles} 
        />
        
        {documents.length > 0 && !downloadUrl && (
            <div className="max-w-3xl mx-auto mt-12 bg-white p-8 rounded-3xl shadow-sm border border-slate-200 animate-in slide-in-from-bottom-4">
                <h3 className="text-xl font-bold text-slate-800 mb-6 text-center">Pilih Arah Putaran:</h3>
                
                <div className="flex flex-wrap justify-center gap-4 mb-10">
                    <button
                        onClick={() => setAngle(270)}
                        className={`flex flex-col items-center justify-center p-4 w-32 h-32 rounded-2xl border-2 transition-all ${angle === 270 ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-200 text-slate-500 hover:border-purple-300 hover:bg-slate-50'}`}
                    >
                        <RotateCcw className="w-10 h-10 mb-2" />
                        <span className="font-semibold text-sm">Kiri 90&deg;</span>
                    </button>
                    
                    <button
                        onClick={() => setAngle(180)}
                        className={`flex flex-col items-center justify-center p-4 w-32 h-32 rounded-2xl border-2 transition-all ${angle === 180 ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-200 text-slate-500 hover:border-purple-300 hover:bg-slate-50'}`}
                    >
                        <FlipVertical className="w-10 h-10 mb-2" />
                        <span className="font-semibold text-sm">Putar 180&deg;</span>
                    </button>

                    <button
                        onClick={() => setAngle(90)}
                        className={`flex flex-col items-center justify-center p-4 w-32 h-32 rounded-2xl border-2 transition-all ${angle === 90 ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-200 text-slate-500 hover:border-purple-300 hover:bg-slate-50'}`}
                    >
                        <RotateCw className="w-10 h-10 mb-2" />
                        <span className="font-semibold text-sm">Kanan 90&deg;</span>
                    </button>
                </div>

                <div className="flex flex-col items-center justify-center border-t border-slate-100 pt-8">
                    {isUploading && !isProcessing && (
                        <div className="w-full max-w-md mb-6">
                            <div className="flex justify-between text-sm font-medium text-slate-700 mb-2">
                                <span>Mengupload {documents.length} file...</span>
                                <span>{uploadProgress}%</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-3">
                                <div 
                                    className="bg-purple-600 h-3 rounded-full transition-all duration-300"
                                    style={{ width: `${uploadProgress}%` }}
                                ></div>
                            </div>
                        </div>
                    )}
                    
                    <button
                        onClick={handleRotateSubmit}
                        disabled={isUploading || isProcessing}
                        className="px-12 py-4 bg-purple-600 hover:bg-purple-700 text-white font-bold text-lg rounded-2xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isProcessing ? "Memproses Putaran..." : isUploading ? "Mengunggah..." : "Putar PDF Sekarang"}
                    </button>
                </div>
            </div>
        )}

        {downloadUrl && (
          <div className="mt-8 max-w-3xl mx-auto p-8 bg-green-50 border border-green-200 rounded-3xl flex flex-col items-center justify-center animate-in fade-in zoom-in duration-300 shadow-sm">
            <h3 className="text-2xl font-bold text-green-800 mb-3">🎉 Berhasil Diputar!</h3>
            <p className="text-green-600 mb-6 text-center">
                File PDF Anda telah berhasil diputar sesuai keinginan.<br/>
                {documents.length > 1 ? "Karena Anda memproses beberapa file, hasilnya dibungkus dalam file ZIP." : ""}
            </p>
            <a 
              href={downloadUrl} 
              target="_blank"
              download
              className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-bold text-lg rounded-2xl shadow-md transition-all flex items-center gap-2"
            >
              Unduh Hasil Sekarang
            </a>
            
            <button 
                onClick={() => {
                    setDownloadUrl(null);
                    setDocuments([]);
                    uppy.cancelAll();
                }}
                className="mt-6 text-green-700 hover:text-green-900 font-semibold text-sm underline"
            >
                Putar file lainnya
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
