# 📄 DocMaxy

**DocMaxy** is a modern, blazing-fast, and comprehensive document processing suite built for the web. 

Unlike traditional document converters that upload your sensitive files to a remote server, **DocMaxy operates 100% client-side**. By leveraging modern JavaScript engines and WebAssembly, all document processing happens locally within your browser.

![DocMaxy Banner](https://img.shields.io/badge/Status-Active-success) ![License](https://img.shields.io/badge/License-MIT-blue) ![Next.js](https://img.shields.io/badge/Built_with-Next.js-black)

## ✨ Key Advantages

- 🔒 **Total Privacy & Security:** Your files **never leave your device**. No server uploads, no data retention, no privacy risks. Perfect for confidential and sensitive documents.
- 🚀 **Zero File Size Limits:** Because processing happens on your local RAM, say goodbye to frustrating "413 Payload Too Large" errors. Process 50MB, 100MB, or even larger files with ease.
- ⚡ **Lightning Fast:** No waiting for files to upload or download from a server queue. Processing speed is dictated by your own device.
- 💸 **100% Free Architecture:** Since there is no heavy backend server or VPS required for processing, this application costs virtually nothing to host.

## 🛠️ Features

- **🗜️ Compress PDF:** Reduce PDF file sizes significantly by stripping metadata and optimizing streams without losing visual quality (`pdf-lib`).
- **🔄 Convert Formats:**
  - **PDF to Word (.docx):** Extract text and recreate headings dynamically (`pdfjs-dist` + `docx`).
  - **Word to PDF:** Render DOCX files to HTML and stamp them onto A4 PDF pages (`mammoth` + `jspdf` + `html2canvas`).
  - **PDF to JPG:** Extract PDF pages into high-quality images.
  - **JPG to PDF:** Bundle multiple images into a single, perfectly scaled PDF document.
  - **PDF to Markdown:** Intelligently extract structure, paragraphs, and headings from PDFs into Markdown.
- **✂️ Document Manipulation:**
  - **Merge PDF:** Combine multiple PDF documents into one seamlessly.
  - **Split PDF:** Extract specific pages or separate all pages into individual files.
  - **Rotate PDF:** Rotate pages (90°, 180°, 270°) and save them permanently.

## 💻 Tech Stack

- **Framework:** [Next.js 16](https://nextjs.org/) (App Router)
- **Styling:** [Tailwind CSS 4](https://tailwindcss.com/)
- **Core Processing Libraries:**
  - `pdf-lib` (PDF manipulation, compression, merging, splitting)
  - `pdfjs-dist` (PDF text and canvas rendering extraction)
  - `docx` & `mammoth` (Word document generation and reading)
  - `jspdf` & `html2canvas` (HTML to PDF rendering)
  - `jszip` (Client-side ZIP generation for bulk downloads)

## 🚀 Getting Started

To run this project locally:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yudstrz/DocMaxy.git
   cd DocMaxy
   ```

2. **Install dependencies:**
   Make sure you have Node.js installed, then run:
   ```bash
   cd apps/web
   npm install
   # or
   pnpm install
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   # or
   pnpm dev
   ```

4. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000) to see the application in action.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/yudstrz/DocMaxy/issues).

## 📝 License

This project is open-source and available under the [MIT License](LICENSE).