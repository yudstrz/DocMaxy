'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

export type Language = 'id' | 'en';

const TRANSLATIONS = {
  id: {
    // Nav
    appName: "DocMaxy",
    home: "Halaman Utama",
    sessionHistory: "Riwayat Sesi",
    themeToggle: "Ganti Tema",
    langToggle: "Bahasa",
    
    // Tools Titles & Descriptions
    mergeTitle: "Gabungkan PDF",
    mergeDesc: "Gabungkan PDF dengan urutan yang Anda inginkan.",
    splitTitle: "Pisahkan PDF",
    splitDesc: "Pisahkan satu halaman atau semuanya agar mudah dikonversi.",
    compressTitle: "Kompres PDF",
    compressDesc: "Kurangi ukuran file dengan tetap mengoptimalkan kualitas PDF.",
    pdfToWordTitle: "PDF ke Word",
    pdfToWordDesc: "Konversi file PDF menjadi dokumen Word yang mudah diedit.",
    wordToPdfTitle: "Word ke PDF",
    wordToPdfDesc: "Buat file Word dikonversi menjadi dokumen PDF.",
    rotateTitle: "Putar PDF",
    rotateDesc: "Putar halaman PDF sesuai kebutuhan.",
    pdfToJpgTitle: "PDF ke JPG",
    pdfToJpgDesc: "Konversi setiap halaman PDF ke gambar JPG.",
    jpgToPdfTitle: "JPG ke PDF",
    jpgToPdfDesc: "Konversi gambar JPG menjadi file dokumen PDF.",
    pdfToMdTitle: "PDF ke Markdown",
    pdfToMdDesc: "Ekstrak teks dan struktur PDF ke format Markdown.",
    
    // New Tools
    watermarkTitle: "Nomor Halaman & Watermark",
    watermarkDesc: "Tambahkan nomor halaman dan tanda air (watermark) teks atau logo transparan.",
    organizeTitle: "Atur Halaman PDF",
    organizeDesc: "Grid interaktif per-halaman untuk sortir, hapus, putar, selipkan halaman kosong, & ekstrak.",
    cameraScanTitle: "Pindai ke PDF (Kamera)",
    cameraScanDesc: "Pindai dokumen fisik dengan kamera HP/Webcam dan konversi langsung ke PDF.",

    // General UI
    selectFiles: "Pilih File PDF",
    dropFiles: "atau tarik file ke sini",
    pasteTip: "💡 Tip: Tekan Ctrl+V (atau Cmd+V) untuk menempel file langsung dari clipboard",
    clearAll: "Hapus Semua",
    selectAll: "Pilih Semua",
    deselectAll: "Batal Pilih",
    sortAZ: "Urutkan A-Z",
    sortZA: "Urutkan Z-A",
    reverseOrder: "Balikkan Urutan",
    selectedItems: "terpilih",
    download: "Unduh Hasil",
    processing: "Memproses...",
    oddPages: "Halaman Ganjil",
    evenPages: "Halaman Genap",
    first5Pages: "5 Pertama",
    insertBlankPage: "Sisipkan Halaman Kosong",
    extractPages: "Ekstrak Halaman Terpilih",
    savePdf: "Simpan PDF Baru",
    delete: "Hapus",
    rotate: "Putar",
    
    // Watermark Tool Specifics
    tabNumbering: "Nomor Halaman",
    tabWatermark: "Tanda Air (Watermark)",
    position: "Posisi",
    formatLabel: "Format Teks",
    fontSize: "Ukuran Font",
    margin: "Margin / Offset Edge",
    watermarkText: "Teks Watermark",
    watermarkType: "Tipe Watermark",
    textWatermark: "Teks Miring",
    imageWatermark: "Logo / Gambar Transparan",
    angle: "Sudut Rotasi",
    opacity: "Transparansi (Opacity)",
    applyChanges: "Terapkan & Buat PDF",
    
    // Compression
    estimatedSize: "Estimasi Hasil",
    compressionLevel: "Tingkat Kompresi",
    extreme: "Ekstrem",
    recommended: "Rekomendasi",
    low: "Rendah",
    custom: "Kustom Target (MB)",
    
    // Camera Scan
    takePhoto: "Ambil Foto",
    switchCamera: "Ganti Kamera",
    filterOriginal: "Asli",
    filterGrayscale: "Grayscale",
    filterContrast: "Kontras Tinggi",
    filterBW: "Dokumen Hitam Putih",
    capturedPhotos: "Foto Terambil",
    generatePdfFromScan: "Gabungkan Foto ke PDF",
    
    // Password Modal
    passwordProtectedTitle: "Dokumen Dilindungi Kata Sandi",
    passwordPromptMsg: "Dokumen ini dilindungi kata sandi. Masukkan kata sandi untuk membuka.",
    passwordInputPlaceholder: "Masukkan kata sandi...",
    unlock: "Buka Dokumen",
    incorrectPassword: "Kata sandi salah. Silakan coba lagi.",

    // History Modal
    historyTitle: "Riwayat Sesi Lokal",
    historyEmpty: "Belum ada file yang diproses pada sesi ini.",
    historyClear: "Bersihkan Riwayat",
    historyAutoExpireNotice: "File tersimpan sementara di browser Anda dan otomatis terhapus dalam 1 jam.",
  },
  en: {
    // Nav
    appName: "DocMaxy",
    home: "Home",
    sessionHistory: "Session History",
    themeToggle: "Toggle Theme",
    langToggle: "Language",

    // Tools Titles & Descriptions
    mergeTitle: "Merge PDF",
    mergeDesc: "Combine PDFs into the order you want with the easiest PDF merger.",
    splitTitle: "Split PDF",
    splitDesc: "Separate one page or all for easy conversion to separate PDF files.",
    compressTitle: "Compress PDF",
    compressDesc: "Reduce file size while optimizing maximum PDF quality.",
    pdfToWordTitle: "PDF to Word",
    pdfToWordDesc: "Easily convert PDF files into editable DOC and DOCX documents.",
    wordToPdfTitle: "Word to PDF",
    wordToPdfDesc: "Make DOC and DOCX files easy to read by converting to PDF.",
    rotateTitle: "Rotate PDF",
    rotateDesc: "Rotate your PDFs as you need. You can rotate multiple PDFs at once!",
    pdfToJpgTitle: "PDF to JPG",
    pdfToJpgDesc: "Convert each PDF page to JPG or extract all images in PDF.",
    jpgToPdfTitle: "JPG to PDF",
    jpgToPdfDesc: "Convert JPG images to PDF in seconds with custom margins.",
    pdfToMdTitle: "PDF to Markdown",
    pdfToMdDesc: "Extract text, headings, and tables from PDF to structured Markdown.",

    // New Tools
    watermarkTitle: "Page Numbering & Watermark",
    watermarkDesc: "Add automatic page numbers and custom text or transparent image watermarks.",
    organizeTitle: "Organize PDF Pages",
    organizeDesc: "Interactive page-by-page grid to reorder, delete, rotate, insert blank page, & extract.",
    cameraScanTitle: "Scan to PDF (Camera)",
    cameraScanDesc: "Scan physical documents using your device camera and convert instantly to PDF.",

    // General UI
    selectFiles: "Select PDF Files",
    dropFiles: "or drop files here",
    pasteTip: "💡 Tip: Press Ctrl+V (or Cmd+V) to paste files directly from clipboard",
    clearAll: "Clear All",
    selectAll: "Select All",
    deselectAll: "Deselect All",
    sortAZ: "Sort A-Z",
    sortZA: "Sort Z-A",
    reverseOrder: "Reverse Order",
    selectedItems: "selected",
    download: "Download Result",
    processing: "Processing...",
    oddPages: "Odd Pages",
    evenPages: "Even Pages",
    first5Pages: "First 5",
    insertBlankPage: "Insert Blank Page",
    extractPages: "Extract Selected Pages",
    savePdf: "Save New PDF",
    delete: "Delete",
    rotate: "Rotate",

    // Watermark Tool Specifics
    tabNumbering: "Page Numbering",
    tabWatermark: "Watermark",
    position: "Position",
    formatLabel: "Format Template",
    fontSize: "Font Size",
    margin: "Margin / Edge Offset",
    watermarkText: "Watermark Text",
    watermarkType: "Watermark Type",
    textWatermark: "Diagonal Text",
    imageWatermark: "Transparent Image/Logo",
    angle: "Rotation Angle",
    opacity: "Opacity",
    applyChanges: "Apply & Generate PDF",

    // Compression
    estimatedSize: "Estimated Size",
    compressionLevel: "Compression Level",
    extreme: "Extreme",
    recommended: "Recommended",
    low: "Low",
    custom: "Custom Target (MB)",

    // Camera Scan
    takePhoto: "Take Photo",
    switchCamera: "Switch Camera",
    filterOriginal: "Original",
    filterGrayscale: "Grayscale",
    filterContrast: "High Contrast",
    filterBW: "B&W Document",
    capturedPhotos: "Captured Photos",
    generatePdfFromScan: "Convert Photos to PDF",

    // Password Modal
    passwordProtectedTitle: "Password Protected Document",
    passwordPromptMsg: "This document is encrypted. Enter password to unlock.",
    passwordInputPlaceholder: "Enter password...",
    unlock: "Unlock Document",
    incorrectPassword: "Incorrect password. Please try again.",

    // History Modal
    historyTitle: "Local Session History",
    historyEmpty: "No files processed in this session yet.",
    historyClear: "Clear History",
    historyAutoExpireNotice: "Files are temporarily saved in your browser and auto-expire in 1 hour.",
  }
};

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: keyof typeof TRANSLATIONS['id']) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>('id');

  useEffect(() => {
    const stored = localStorage.getItem('docmaxy-lang') as Language | null;
    if (stored && (stored === 'id' || stored === 'en')) {
      setLangState(stored);
    }
  }, []);

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem('docmaxy-lang', newLang);
  };

  const t = (key: keyof typeof TRANSLATIONS['id']): string => {
    const dict = TRANSLATIONS[lang] || TRANSLATIONS['id'];
    return dict[key] || TRANSLATIONS['id'][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
