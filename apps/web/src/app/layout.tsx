import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ThemeProvider } from "@/context/ThemeContext";
import { LanguageProvider } from "@/context/LanguageContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocMaxy PDF Toolkit - Alat Edit PDF Lengkap & Gratis",
  description: "Gabungkan, Pisahkan, Kompres, Atur Halaman, Beri Nomor & Watermark, dan Pindai Kamera ke PDF dengan mudah menggunakan DocMaxy. Semuanya 100% gratis, aman, dan tanpa upload ke server.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
        <ThemeProvider>
          <LanguageProvider>
            <Toaster position="top-center" reverseOrder={false} />
            <Navbar />
            <div className="flex-grow flex flex-col">
              {children}
            </div>
            <Footer />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
