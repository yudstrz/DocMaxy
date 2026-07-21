'use client';

import React, { useState, useEffect } from 'react';
import { SortableGrid, PDFDocument } from '@/components/SortableGrid';
import { generatePDFThumbnail } from '@/utils/pdf';
import Uppy from '@uppy/core';
import AwsS3 from '@uppy/aws-s3';

const API_BASE = ''; // Uses relative path and Next.js rewrites
export default function MergePage() {
  const [documents, setDocuments] = useState<PDFDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  
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
    setDownloadUrl(null); // Reset previous download if any
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

  const handleMergeSubmit = async () => {
    if (documents.length < 2) {
      alert("Pilih minimal 2 file untuk digabungkan.");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setDownloadUrl(null);
    
    try {
      // Add all current files to uppy
      documents.forEach(doc => {
        // Only add if not already in uppy to avoid duplicates
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
      
      if (!result) {
         throw new Error("Upload dibatalkan atau gagal diinisiasi.");
      }
      
      if (result.failed && result.failed.length > 0) {
         throw new Error("Sebagian file gagal diupload.");
      }
      
      // Construct the final payload for the merging job
      const orderPayload = documents.map((doc, index) => {
        const uploadedFile = result.successful?.find((f: any) => f.meta.docId === doc.id);
        return {
          fileId: doc.id,
          filename: doc.file.name,
          order: index + 1,
          s3Key: uploadedFile?.response?.body?.key || uploadedFile?.response?.uploadURL
        };
      });
      
      console.log("Upload selesai! Order payload:", orderPayload);
      setIsMerging(true);
      
      const mergeResponse = await fetch(`${API_BASE}/api/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: orderPayload })
      });
      
      if (!mergeResponse.ok) {
        const errText = await mergeResponse.text();
        throw new Error(`Server error: ${errText}`);
      }
      
      const mergeData = await mergeResponse.json();
      if (mergeData.downloadUrl) {
         setDownloadUrl(mergeData.downloadUrl);
      }
      
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Gagal memproses upload. Jaringan terputus?");
    } finally {
      setIsUploading(false);
      setIsMerging(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <main className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight sm:text-5xl">
            Gabungkan PDF
          </h1>
          <p className="mt-4 max-w-2xl text-xl text-slate-500 mx-auto">
            Gabungkan file PDF dalam urutan yang Anda inginkan dengan paling mudah dan cepat.
          </p>
        </div>

        <SortableGrid 
          items={documents} 
          setItems={setDocuments} 
          onAddFiles={handleAddFiles} 
        />
        
        {downloadUrl && (
          <div className="mt-8 p-6 bg-green-50 border border-green-200 rounded-2xl flex flex-col items-center justify-center animate-in fade-in zoom-in duration-300">
            <h3 className="text-xl font-bold text-green-800 mb-2">🎉 PDF Berhasil Digabungkan!</h3>
            <p className="text-green-600 mb-4">Silakan unduh file hasil gabungan Anda.</p>
            <a 
              href={downloadUrl} 
              target="_blank"
              download
              className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-md transition-all"
            >
              Unduh PDF Sekarang
            </a>
          </div>
        )}
        
        <div className="mt-10 flex flex-col items-center justify-center">
          {isUploading && !isMerging && (
             <div className="w-full max-w-md mb-6">
               <div className="flex justify-between text-sm font-medium text-slate-700 mb-2">
                 <span>Mengupload file...</span>
                 <span>{uploadProgress}%</span>
               </div>
               <div className="w-full bg-slate-200 rounded-full h-3">
                 <div 
                   className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                   style={{ width: `${uploadProgress}%` }}
                 ></div>
               </div>
             </div>
          )}
          
          <button
            onClick={handleMergeSubmit}
            disabled={documents.length < 2 || isUploading || isMerging}
            className="px-8 py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isMerging ? "Memproses PDF..." : isUploading ? "Mengunggah..." : "Gabungkan PDF"}
          </button>
        </div>
      </main>
    </div>
  );
}
