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
    privacyLink: "Kebijakan Privasi",
    termsLink: "Syarat & Ketentuan",
    navWatermark: "Watermark",
    navOrganize: "Atur PDF",
    navScan: "Pindai",

    // History Modal
    historyTitle: "Riwayat Sesi Selesai",
    historyEmpty: "Belum ada riwayat pemrosesan dokumen",
    historyClear: "Bersihkan Riwayat",
    historyAutoExpireNotice: "Riwayat disimpan secara lokal di browser Anda",
    historyLoading: "Memuat riwayat...",

    // Hero Home
    heroTitle: "DocMaxy PDF Toolkit",
    heroSubtitle: "Setiap alat yang Anda perlukan untuk bekerja dengan PDF di satu tempat. Semuanya 100% GRATIS, aman, dan tanpa perlu upload ke server!",
    comingSoon: "Segera Hadir",

    // Tools Titles & Descriptions
    mergeTitle: "Gabungkan PDF",
    mergeDesc: "Gabungkan beberapa dokumen PDF menjadi satu file sesuai urutan pilihan Anda.",
    splitTitle: "Pisahkan PDF",
    splitDesc: "Pisahkan satu halaman atau ekstrak rentang halaman tertentu menjadi PDF terpisah.",
    compressTitle: "Kompres PDF",
    compressDesc: "Kurangi ukuran file PDF secara signifikan dengan optimasi kualitas visual di browser.",
    pdfToWordTitle: "PDF ke Word",
    pdfToWordDesc: "Konversi file PDF menjadi dokumen Word (DOCX) yang dapat diedit secara langsung.",
    wordToPdfTitle: "Word ke PDF",
    wordToPdfDesc: "Konversi dokumen Word (DOCX) menjadi dokumen PDF dengan tata letak rapi.",
    rotateTitle: "Putar PDF",
    rotateDesc: "Putar orientasi halaman PDF 90° atau 180° sekaligus dengan cepat.",
    pdfToJpgTitle: "PDF ke JPG",
    pdfToJpgDesc: "Ekstrak setiap halaman dokumen PDF menjadi file gambar berkualitas tinggi (JPG).",
    jpgToPdfTitle: "JPG ke PDF",
    jpgToPdfDesc: "Konversi kumpulan gambar JPG/PNG menjadi satu dokumen PDF.",
    pdfToMdTitle: "PDF ke Markdown",
    pdfToMdDesc: "Ekstrak teks, paragraf, dan struktur tabel PDF menjadi format Markdown (.md).",
    watermarkTitle: "Nomor Halaman & Watermark",
    watermarkDesc: "Tambahkan penomoran halaman otomatis atau watermark teks/logo transparan.",
    organizeTitle: "Atur Halaman PDF",
    organizeDesc: "Grid interaktif per-halaman untuk sortir, hapus, putar, selipkan halaman kosong, & ekstrak.",
    cameraScanTitle: "Pindai ke PDF (Kamera)",
    cameraScanDesc: "Pindai dokumen fisik dengan kamera HP/Webcam dan konversi langsung ke PDF.",

    // General UI & Controls
    selectFiles: "Pilih File PDF",
    dropFiles: "atau tarik file ke sini",
    pasteTip: "Tip: Tekan Ctrl+V (atau Cmd+V) untuk menempel file dari clipboard",
    clearAll: "Hapus Semua",
    selectAll: "Pilih Semua",
    deselectAll: "Batal Pilih",
    sortAZ: "Urutkan A-Z",
    sortZA: "Urutkan Z-A",
    reverseOrder: "Balikkan Urutan",
    selectedItems: "terpilih",
    download: "Unduh Hasil",
    processing: "Memproses di perangkat...",
    cancel: "Batal",
    unlocking: "Membuka...",
    processingTitle: "Sedang Memproses Dokumen...",
    processingLocalPrivacyNotice: "Proses berjalan 100% di browser Anda (aman & privat).",
    cropModalTitle: "Sesuaikan Sudut Dokumen",
    cropReset: "Reset Sudut",
    cropConfirm: "Potong Dokumen",
    cropProcessing: "Memotong...",
    ocrModalTitle: "Hasil Ekstraksi Teks (OCR)",
    ocrSubtitle: "Tesseract OCR engine (Bahasa Indonesia & English)",
    ocrExtracting: "Mengekstraksi Teks dari Gambar...",
    ocrWaitNotice: "Harap tunggu beberapa detik",
    ocrCopyText: "Salin Teks",
    ocrCopied: "Tersalin!",
    ocrClose: "Tutup",
    oddPages: "Halaman Ganjil",
    evenPages: "Halaman Genap",
    first5Pages: "5 Pertama",
    insertBlankPage: "Sisipkan Halaman Kosong",
    extractPages: "Ekstrak Halaman Terpilih",
    savePdf: "Simpan PDF Baru",
    delete: "Hapus",
    rotate: "Putar",
    addFiles: "Tambah File",
    arrangeOrder: "Atur Urutan Dokumen",
    noFilesSelected: "Belum ada file yang dipilih",
    dragDropInstruction: "Tarik dan lepas file di sini, atau klik tombol di atas.",
    successTitle: "Berhasil Dikonversi!",
    successApplied: "Berhasil Diterapkan!",
    successMerged: "Berhasil Digabungkan!",
    successSplit: "Berhasil Dipisahkan!",
    successCompressed: "Berhasil Dikompres!",
    successRotated: "Berhasil Diputar!",
    convertAnother: "Konversi file lainnya",
    processNow: "Memproses Sekarang",
    
    // Page Conversion Options
    modeText: "Mode Teks",
    modeImage: "Mode Gambar",
    modeTextDesc: "Ekstrak teks — cocok untuk dokumen, laporan, & artikel",
    modeImageDesc: "Render halaman — cocok untuk presentasi & brosur",
    conversionMode: "Mode Konversi",

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
  },
  en: {
    // Nav
    appName: "DocMaxy",
    home: "Home",
    sessionHistory: "Session History",
    themeToggle: "Toggle Theme",
    langToggle: "Language",
    privacyLink: "Privacy Policy",
    termsLink: "Terms of Service",
    navWatermark: "Watermark",
    navOrganize: "Organize PDF",
    navScan: "Scan",

    // History Modal
    historyTitle: "Completed Session History",
    historyEmpty: "No document processing history yet",
    historyClear: "Clear History",
    historyAutoExpireNotice: "History is stored locally in your browser",
    historyLoading: "Loading history...",

    // Hero Home
    heroTitle: "DocMaxy PDF Toolkit",
    heroSubtitle: "Every tool you need to work with PDFs in one place. 100% FREE, secure, and no server uploads required!",
    comingSoon: "Coming Soon",

    // Tools Titles & Descriptions
    mergeTitle: "Merge PDF",
    mergeDesc: "Combine multiple PDF documents into a single file in your desired order.",
    splitTitle: "Split PDF",
    splitDesc: "Separate single pages or extract specific page ranges into separate PDFs.",
    compressTitle: "Compress PDF",
    compressDesc: "Significantly reduce PDF file size with visual quality optimization directly in your browser.",
    pdfToWordTitle: "PDF to Word",
    pdfToWordDesc: "Convert PDF files into directly editable Word (DOCX) documents.",
    wordToPdfTitle: "Word to PDF",
    wordToPdfDesc: "Convert Word (DOCX) documents into neatly formatted PDF files.",
    rotateTitle: "Rotate PDF",
    rotateDesc: "Rotate PDF page orientation 90° or 180° in batch quickly.",
    pdfToJpgTitle: "PDF to JPG",
    pdfToJpgDesc: "Extract every page of a PDF document into high quality JPG images.",
    jpgToPdfTitle: "JPG to PDF",
    jpgToPdfDesc: "Convert a collection of JPG/PNG images into a single PDF document.",
    pdfToMdTitle: "PDF to Markdown",
    pdfToMdDesc: "Extract PDF text, headings, and table structures into Markdown (.md) format.",
    watermarkTitle: "Page Numbering & Watermark",
    watermarkDesc: "Add automatic page numbers or custom diagonal text/logo watermarks.",
    organizeTitle: "Organize PDF Pages",
    organizeDesc: "Interactive page-by-page grid to reorder, delete, rotate, insert blank page, & extract.",
    cameraScanTitle: "Scan to PDF (Camera)",
    cameraScanDesc: "Scan physical documents using your device camera and convert directly to PDF.",

    // General UI & Controls
    selectFiles: "Select PDF Files",
    dropFiles: "or drop files here",
    pasteTip: "Tip: Press Ctrl+V (or Cmd+V) to paste files directly from clipboard",
    clearAll: "Clear All",
    selectAll: "Select All",
    deselectAll: "Deselect All",
    sortAZ: "Sort A-Z",
    sortZA: "Sort Z-A",
    reverseOrder: "Reverse Order",
    selectedItems: "selected",
    download: "Download Result",
    processing: "Processing on device...",
    cancel: "Cancel",
    unlocking: "Unlocking...",
    processingTitle: "Processing Document...",
    processingLocalPrivacyNotice: "Process runs 100% locally in your browser (secure & private).",
    cropModalTitle: "Adjust Document Corners",
    cropReset: "Reset Corners",
    cropConfirm: "Crop Document",
    cropProcessing: "Cropping...",
    ocrModalTitle: "Text Extraction Result (OCR)",
    ocrSubtitle: "Tesseract OCR engine (Indonesian & English)",
    ocrExtracting: "Extracting Text from Image...",
    ocrWaitNotice: "Please wait a few seconds",
    ocrCopyText: "Copy Text",
    ocrCopied: "Copied!",
    ocrClose: "Close",
    oddPages: "Odd Pages",
    evenPages: "Even Pages",
    first5Pages: "First 5",
    insertBlankPage: "Insert Blank Page",
    extractPages: "Extract Selected Pages",
    savePdf: "Save New PDF",
    delete: "Delete",
    rotate: "Rotate",
    addFiles: "Add Files",
    arrangeOrder: "Arrange Document Order",
    noFilesSelected: "No files selected yet",
    dragDropInstruction: "Drag & drop files here, or click the button above.",
    successTitle: "Converted Successfully!",
    successApplied: "Applied Successfully!",
    successMerged: "Merged Successfully!",
    successSplit: "Split Successfully!",
    successCompressed: "Compressed Successfully!",
    successRotated: "Rotated Successfully!",
    convertAnother: "Process another file",
    processNow: "Process Now",

    // Page Conversion Options
    modeText: "Text Mode",
    modeImage: "Image Mode",
    modeTextDesc: "Extract text — ideal for reports, articles, & text documents",
    modeImageDesc: "Render pages — ideal for presentations, designs, & brochures",
    conversionMode: "Conversion Mode",

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
