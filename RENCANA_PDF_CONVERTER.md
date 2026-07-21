# Rencana Pengembangan: PDF Toolkit Lengkap (mirip iLovePDF)

## 1. Ringkasan Produk

Web app PDF toolkit lengkap, full-suite mirip iLovePDF, dengan fokus khusus di **support upload file besar (>50MB)**. Semua fitur di bawah ini dikelompokkan sesuai kategori aslinya, dan diprioritaskan jadi beberapa fase pengerjaan (lihat Bagian 8 — Roadmap).

### Kategori Fitur

**A. Atur PDF**
- Gabungkan PDF (merge, reorder drag-and-drop)
- Pisahkan PDF (split)
- Hapus halaman
- Ekstrak halaman
- Atur PDF (sortir/tambah/hapus halaman dalam 1 dokumen)
- Pindai ke PDF (scan dari kamera HP)

**B. Optimalkan PDF**
- Kompres PDF
- Perbaiki PDF (repair file corrupt)
- OCR PDF (scan jadi teks yang bisa di-select/cari)

**C. Konversi ke PDF**
- JPG ke PDF
- Word ke PDF
- PowerPoint ke PDF
- Excel ke PDF
- HTML ke PDF (paste URL)

**D. Konversi dari PDF**
- PDF ke JPG
- PDF ke Word
- PDF ke PowerPoint
- PDF ke Excel
- PDF ke PDF/A

**E. Edit PDF**
- Putar PDF (rotate)
- Tambahkan nomor halaman
- Tambahkan tanda air (watermark)
- Potong PDF (crop)
- Edit PDF (teks, gambar, bentuk, anotasi)
- Formulir PDF (deteksi field, isi form interaktif)

**F. Keamanan PDF**
- Buka PDF Terkunci (hapus password)
- Proteksi PDF (enkripsi + password)
- Tanda tangani PDF (e-signature)
- Samarkan PDF (redact)
- Bandingkan PDF (diff antar versi)

**G. PDF Intelligence (AI)**
- Perangkum AI (summarization)
- Terjemahkan PDF (AI translate, layout terjaga)
- PDF ke Markdown

---

## 2. Batasan Penting: Vercel + File Besar

Ini yang paling krusial dipahami dari awal, biar arsitekturnya nggak salah jalan:

| Batasan Vercel | Nilai |
|---|---|
| Max body request per Serverless Function | 4.5 MB (semua plan, termasuk Pro) |
| Max durasi eksekusi function | 10s (Hobby), 60s (Pro), 900s (Enterprise) |
| Cocok untuk | Orkestrasi API, generate signed URL, trigger job, cek status |
| TIDAK cocok untuk | Terima file besar langsung, proses konversi berat (LibreOffice dll) |

**Konsekuensi:** Frontend + API tipis (generate URL, trigger job, cek status) bisa full di Vercel. Tapi **upload file besar dan proses konversi berat harus di luar Vercel** — pakai object storage (Cloudflare R2 / AWS S3) untuk upload langsung dari browser, dan worker terpisah (Railway / Render / Fly.io / VPS) untuk proses LibreOffice.

Jadi arsitekturnya **hybrid**, bukan Vercel doang.

---

## 3. Arsitektur Sistem

```
┌─────────────┐      1. Request signed URL       ┌──────────────────┐
│   Browser   │ ────────────────────────────────▶│  Vercel (Next.js) │
│  (Frontend) │◀──────────────────────────────────│   API Routes      │
└─────────────┘      2. Terima signed URL         └──────────────────┘
      │                                                     │
      │ 3. Upload file langsung (chunked)                   │ 4. Push job ke queue
      ▼                                                     ▼
┌─────────────┐                                    ┌──────────────────┐
│ Cloudflare  │◀───────────────────────────────────│  Redis Queue      │
│  R2 Storage │      5. Worker ambil file dari R2   │  (Upstash/BullMQ) │
└─────────────┘                                    └──────────────────┘
      ▲                                                     │
      │ 7. Simpan hasil konversi                            │ 6. Trigger worker
      │                                                     ▼
      │                                            ┌──────────────────┐
      └────────────────────────────────────────────│  Worker Service   │
                                                     │ (Railway/Render)  │
      8. Browser polling status via Vercel API      │  LibreOffice +    │
      ◀────────────────────────────────────────────│  img2pdf/pdf-lib  │
                                                     └──────────────────┘
```

---

## 4. Stack Teknologi

| Komponen | Pilihan | Alasan |
|---|---|---|
| Frontend | Next.js 14 (App Router) | Deploy native ke Vercel |
| Upload | Uppy + tus-js-client | Resumable/chunked upload, tahan koneksi putus |
| Storage | Cloudflare R2 | Gratis egress, kompatibel S3 API, murah |
| API tipis | Next.js API Routes (di Vercel) | Generate signed URL, trigger job, cek status |
| Queue | Upstash Redis + BullMQ (atau QStash) | Serverless-friendly, gampang integrasi dgn Vercel |
| Worker (proses berat) | Node.js/Python di Railway atau Render | Bisa jalan lama, install LibreOffice bebas |
| Konversi Word↔PDF | LibreOffice headless (`soffice --headless`) | Gratis, akurat untuk dokumen umum |
| Konversi Image→PDF | `img2pdf` (Python) atau `pdf-lib` (Node) | Cepat, lossless |
| Manipulasi PDF (gabung/reorder) | `pdf-lib` (Node) atau `pikepdf` (Python) | Ringan, sesuai urutan custom |
| Thumbnail preview | `pdf.js` (client-side) | Render preview halaman tanpa upload dulu |
| Drag & drop UI | `dnd-kit` | Ringan, modern, accessible |
| Database (status job, riwayat) | Supabase / Neon Postgres | Gratis tier cukup, gampang connect ke Vercel |
| Kompres PDF | Ghostscript (`gs`) | Standar industri, kontrol level kompresi (screen/ebook/printer) |
| Split/Extract/Rotate/Delete halaman | `pdf-lib` / `pikepdf` | Manipulasi struktur PDF tanpa render ulang |
| OCR | Tesseract OCR (`tesseract.js` atau CLI) | Gratis, support Bahasa Indonesia |
| Watermark & Nomor Halaman | `pdf-lib` | Overlay teks/gambar per halaman |
| Crop PDF | `pdf-lib` (ubah MediaBox) | Ringan, tidak perlu render ulang |
| Edit PDF (teks/gambar/anotasi) | `pdf-lib` + canvas overlay (frontend) | Kombinasi render `pdf.js` utk preview + edit `pdf-lib` |
| Formulir PDF (AcroForm) | `pdf-lib` (form API) | Deteksi & isi field form standar PDF |
| PDF ke JPG | `pdf.js` / `pdftoppm` (Poppler) | Render tiap halaman jadi gambar |
| PDF ke Excel | Tabula / `camelot-py` (Python) | Deteksi tabel dari PDF, lebih akurat dari regex manual |
| PDF ke PowerPoint | LibreOffice headless | Sama seperti Word, satu pipeline |
| PDF ke PDF/A | Ghostscript / `veraPDF` (validasi) | Konversi + validasi standar arsip ISO |
| HTML ke PDF | Puppeteer / `wkhtmltopdf` | Render halaman web jadi PDF |
| Buka Kunci / Proteksi PDF | `qpdf` atau `pikepdf` | Enkripsi/dekripsi standar PDF (AES) |
| Tanda Tangani PDF | `pdf-lib` (overlay gambar ttd) + audit trail di DB | E-signature dasar, bukan qualified signature |
| Samarkan (Redact) | `pdf-lib` (hapus konten + timpa area) + `pikepdf` (rewrite object stream) | **Penting:** redact asal-asalan cuma nutup visual, teks di bawahnya masih bisa diekstrak — harus benar-benar hapus objeknya |
| Bandingkan PDF | Diff teks per halaman (`pdf.js` extract text + `diff-match-patch`) | Bandingkan versi, highlight perubahan |
| Perangkum AI / Terjemahkan | Anthropic API (Claude) | Sudah ada precedent pola pemakaian di dokumen `anthropic_api_in_artifacts` — panggil via backend, bukan expose API key ke client |
| PDF ke Markdown | Ekstrak teks terstruktur (`pdf.js`/`pdfplumber`) + LLM cleanup | Tabel & heading butuh bantuan model biar rapi |
| Pindai ke PDF (scan HP) | Native browser camera API + `jsPDF`/`pdf-lib` di client | Foto diambil di HP, langsung dirakit jadi PDF |

---

## 5. Rencana Fitur (Lengkap, per Kategori)

### 5.1 Atur PDF
- [ ] **Gabungkan PDF** — upload multi-file, grid thumbnail, drag & drop reorder, sort A-Z, tambah/hapus file
- [ ] **Pisahkan PDF** — pecah PDF jadi per-halaman atau per-range custom (misal "1-3, 5, 7-9")
- [ ] **Hapus halaman** — pilih halaman via thumbnail grid, hapus, download hasil
- [ ] **Ekstrak halaman** — sama seperti hapus tapi kebalikannya (ambil halaman terpilih jadi file baru)
- [ ] **Atur PDF** — reorder per-halaman dalam 1 dokumen (thumbnail + drag & drop, lihat 5.1.1)
- [ ] **Pindai ke PDF** — buka kamera dari HP (PWA/browser API), ambil beberapa foto, auto-crop opsional, rakit jadi 1 PDF

**5.1.1 Reorder per-halaman (shared component)**
- [ ] Render thumbnail tiap halaman (`pdf.js`, lazy-load pakai virtualized grid biar ga berat di file besar)
- [ ] Drag & drop reorder (`dnd-kit`)
- [ ] Hapus / putar halaman langsung dari thumbnail
- [ ] Komponen ini dipakai bareng di: Atur PDF, Hapus halaman, Ekstrak halaman, Putar PDF

### 5.2 Optimalkan PDF
- [ ] **Kompres PDF** — pilihan level kompresi (rendah/sedang/tinggi = mapping ke `-dPDFSETTINGS` Ghostscript: `/printer`, `/ebook`, `/screen`)
- [ ] **Perbaiki PDF** — coba rebuild struktur file pakai `qpdf --recover` atau Ghostscript re-render
- [ ] **OCR PDF** — jalankan Tesseract per halaman (butuh render ke image dulu), output PDF dengan text layer tersembunyi (searchable)

### 5.3 Konversi ke PDF
- [ ] JPG/PNG ke PDF (multi-image, reorder, atur margin & orientasi)
- [ ] Word ke PDF (LibreOffice headless)
- [ ] PowerPoint ke PDF (LibreOffice headless)
- [ ] Excel ke PDF (LibreOffice headless, atur page break biar ga kepotong aneh)
- [ ] HTML ke PDF (paste URL → render via Puppeteer headless Chrome)

### 5.4 Konversi dari PDF
- [ ] PDF ke JPG (per halaman jadi image, atau ekstrak gambar embedded)
- [ ] PDF ke Word (LibreOffice headless; untuk dokumen kompleks/tabel rumit, sediakan opsi fallback API premium seperti Adobe PDF Services)
- [ ] PDF ke PowerPoint (LibreOffice headless, tiap halaman jadi 1 slide)
- [ ] PDF ke Excel (deteksi tabel pakai `camelot`/Tabula, fallback: seluruh teks per baris jadi 1 kolom kalau ga kedeteksi tabel)
- [ ] PDF ke PDF/A (Ghostscript convert + validasi `veraPDF`)

### 5.5 Edit PDF
- [ ] Putar PDF (rotate per halaman atau seluruh dokumen)
- [ ] Tambahkan nomor halaman (posisi, format, font bisa diatur)
- [ ] Tambahkan tanda air / watermark (teks atau gambar, atur transparansi & posisi)
- [ ] Potong PDF / crop (drag area di preview, terapkan ke 1 halaman atau semua)
- [ ] Edit PDF (tambah teks/gambar/bentuk manual, WYSIWYG di atas canvas render `pdf.js`)
- [ ] Formulir PDF (deteksi AcroForm field otomatis, atau tambah field baru manual: text box, checkbox, radio, dropdown)

### 5.6 Keamanan PDF
- [ ] Buka PDF Terkunci (hapus password — user harus tau password lama, bukan brute-force)
- [ ] Proteksi PDF (set password + level enkripsi AES-128/256)
- [ ] Tanda tangani PDF (gambar/tulis tanda tangan, overlay ke halaman, simpan audit trail: siapa, kapan, IP)
- [ ] Samarkan PDF / redact (hapus konten asli dari object stream, bukan cuma nutup visual — ini sering jadi bug fatal di implementasi asal-asalan)
- [ ] Bandingkan PDF (ekstrak teks 2 versi, diff, highlight halaman yang beda)

### 5.7 PDF Intelligence (AI) — butuh API key & biaya jalan
- [ ] Perangkum AI (ekstrak teks → kirim ke Claude API → ringkasan)
- [ ] Terjemahkan PDF (ekstrak teks per blok, translate, render ulang jaga posisi/layout — ini paling susah dari semua fitur AI)
- [ ] PDF ke Markdown (ekstrak teks terstruktur + heading/tabel, cleanup pakai LLM)

> **Catatan biaya:** kategori ini beda dari yang lain — semua fitur lain cuma butuh compute (worker server), tapi kategori ini nambah biaya per-request ke Anthropic API. Perlu rate limiting & mungkin kuota per-user kalau nanti ada plan gratis vs berbayar.

### 5.8 Upload File Besar (Cross-cutting, berlaku di semua tools)
- [ ] Chunked upload langsung ke R2 (bypass server)
- [ ] Progress bar per file
- [ ] Resume upload kalau koneksi putus
- [ ] Validasi ukuran & tipe file di frontend sebelum upload

### 5.9 Job & Status
- [ ] Job masuk queue setelah upload selesai
- [ ] Polling status (`pending` → `processing` → `done`/`failed`)
- [ ] Notifikasi selesai (toast/browser notif)
- [ ] Link download hasil (auto-expire, misal 24 jam)

---

## 6. Struktur Data

### Job object (disimpan di DB/Redis)
```json
{
  "jobId": "job_abc123",
  "type": "merge_pdf",
  "status": "processing",
  "files": [
    { "fileId": "f1", "storageKey": "uploads/f1.pdf", "order": 1 },
    { "fileId": "f2", "storageKey": "uploads/f2.pdf", "order": 2 }
  ],
  "resultKey": null,
  "createdAt": "2026-07-21T10:00:00Z",
  "expiresAt": "2026-07-22T10:00:00Z"
}
```

---

## 7. Struktur Repo (Monorepo)

```
pdf-tool/
├── apps/
│   ├── web/                # Next.js — deploy ke Vercel
│   │   ├── app/
│   │   ├── components/
│   │   └── package.json
│   └── worker/              # Node/Python — deploy ke Railway
│       ├── converters/       # kategori C & D (5.3, 5.4)
│       │   ├── wordToPdf.js
│       │   ├── imageToPdf.js
│       │   ├── pdfToWord.js
│       │   ├── pdfToExcel.js
│       │   ├── pdfToPpt.js
│       │   ├── htmlToPdf.js
│       │   └── pdfToPdfA.js
│       ├── organize/         # kategori A (5.1)
│       │   ├── merge.js
│       │   ├── split.js
│       │   ├── deletePages.js
│       │   ├── extractPages.js
│       │   └── reorderPages.js
│       ├── optimize/         # kategori B (5.2)
│       │   ├── compress.js
│       │   ├── repair.js
│       │   └── ocr.js
│       ├── edit/             # kategori E (5.5)
│       │   ├── rotate.js
│       │   ├── pageNumbers.js
│       │   ├── watermark.js
│       │   ├── crop.js
│       │   ├── editContent.js
│       │   └── formFields.js
│       ├── security/         # kategori F (5.6)
│       │   ├── unlock.js
│       │   ├── protect.js
│       │   ├── sign.js
│       │   ├── redact.js
│       │   └── compare.js
│       ├── intelligence/     # kategori G (5.7) — panggil Anthropic API
│       │   ├── summarize.js
│       │   ├── translate.js
│       │   └── toMarkdown.js
│       └── package.json
├── packages/
│   └── shared-types/        # Tipe TypeScript dipakai bareng
├── turbo.json                # kalau pakai Turborepo
└── README.md
```

---

## 8. Tahapan Pengerjaan (Roadmap)

**Fase 1 — MVP: Fondasi + Konversi Dasar (2-3 minggu)**
1. Setup Next.js project + deploy skeleton ke Vercel
2. Setup Cloudflare R2 + signed URL upload
3. Setup worker service di Railway (Docker + LibreOffice + Ghostscript + qpdf)
4. Job queue (Upstash Redis + BullMQ)
5. UI upload + progress bar + polling status
6. Implementasi kategori **C & D — Konversi ke/dari PDF**: Word↔PDF, Image↔PDF, PowerPoint↔PDF, Excel↔PDF

**Fase 2 — Atur PDF & Reorder (1-2 minggu)**
1. Komponen shared thumbnail grid + drag & drop (`dnd-kit`, virtualized biar ga berat)
2. **Gabungkan PDF** — reorder antar-dokumen, sort A-Z, tambah/hapus file
3. **Pisahkan PDF, Hapus halaman, Ekstrak halaman, Atur PDF** — semua pakai komponen thumbnail yang sama
4. **Putar PDF** (rotate)

**Fase 3 — Optimalkan PDF (1 minggu)**
1. **Kompres PDF** (Ghostscript, 3 level kompresi)
2. **Perbaiki PDF** (qpdf recover)
3. **OCR PDF** (Tesseract, prioritas Bahasa Indonesia + Inggris)

**Fase 4 — Edit & Konversi Lanjutan (2-3 minggu)**
1. **Tambah nomor halaman, watermark, crop** (semua overlay-based, relatif cepat dibikin)
2. **PDF ke JPG, HTML ke PDF, PDF ke PDF/A**
3. **Edit PDF** (WYSIWYG teks/gambar/bentuk) — paling kompleks di fase ini, alokasikan waktu lebih
4. **Formulir PDF** (AcroForm detect + fill)
5. **PDF ke Excel** (deteksi tabel) — expect akurasi belum sempurna, kasih disclaimer ke user

**Fase 5 — Keamanan PDF (1-2 minggu)**
1. **Proteksi & Buka Kunci PDF** (qpdf/pikepdf, encryption AES)
2. **Tanda tangani PDF** (overlay + audit trail sederhana)
3. **Samarkan PDF (redact)** — perlu extra hati-hati, test khusus supaya benar-benar hapus data, bukan cuma nutup visual
4. **Bandingkan PDF** (diff teks antar versi)

**Fase 6 — PDF Intelligence / AI (1-2 minggu, opsional/berbayar)**
1. Integrasi Anthropic API di backend (bukan expose key ke client)
2. **Perangkum AI**
3. **PDF ke Markdown**
4. **Terjemahkan PDF** — paling kompleks (harus jaga layout), kerjakan terakhir
5. Rate limiting & kuota per-user karena fase ini punya biaya API langsung

**Fase 7 — Polish & Scale (ongoing)**
1. Auth (kalau mau riwayat per-user & kuota)
2. Rate limiting & abuse prevention di semua endpoint
3. Monitoring worker (biar tau kalau LibreOffice/Ghostscript hang)
4. Auto-cleanup file di storage (expire job lama)
5. Aplikasi Desktop/Mobile (jauh di masa depan, opsional — di luar scope Vercel)

> **Rekomendasi realistis:** jangan coba kerjain semua 30+ tools sekaligus. Mulai dari Fase 1-2 (konversi + atur PDF) karena itu yang paling sering dipakai orang dan paling murah biaya infra-nya. Fase 6 (AI) sengaja ditaruh belakang karena biayanya beda karakter — per-request ke Anthropic API, bukan cuma compute worker.

---

## 9. Yang Bisa Langsung Deploy ke Vercel

✅ **Bisa full di Vercel:**
- Frontend Next.js
- API routes tipis: generate signed URL, create job, cek status job
- Halaman hasil/download (redirect ke signed URL dari R2)

❌ **Tidak bisa di Vercel, wajib di luar:**
- Proses LibreOffice (butuh binary + waktu eksekusi lama)
- Upload file besar lewat server (harus direct-to-storage)

---

## 10. Estimasi Biaya (Tier Gratis/Murah)

| Layanan | Tier Gratis | Cukup untuk |
|---|---|---|
| Vercel | Hobby (gratis) | Frontend + API tipis |
| Cloudflare R2 | 10GB storage gratis, egress gratis | Storage file upload/hasil |
| Upstash Redis | 10rb command/hari gratis | Queue job |
| Railway | $5 credit/bulan (trial) | Worker konversi (perlu upgrade kalau traffic naik) |
| Supabase | 500MB DB gratis | Metadata job/user |

---

## 11. Langkah Berikutnya

1. Setup akun: Vercel, Cloudflare R2, Upstash, Railway
2. Init monorepo (`apps/web` + `apps/worker`)
3. Implementasi upload flow dulu (paling kritikal untuk file besar)
4. Baru lanjut ke logic konversi per mode
5. Terakhir UI reorder/drag-drop

