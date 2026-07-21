import Link from 'next/link';
import { Combine, Split, Minimize2, FileText, FileCode2, Edit3, RotateCw, Image as ImageIcon, FileImage } from 'lucide-react';

const TOOLS = [
  {
    title: "Gabungkan PDF",
    description: "Gabungkan PDF dengan urutan yang Anda inginkan dengan penggabungan PDF termudah.",
    href: "/merge",
    icon: Combine,
    iconColor: "text-orange-500",
    iconBg: "bg-orange-100",
    status: "ready"
  },
  {
    title: "Pisahkan PDF",
    description: "Pisahkan satu halaman atau semuanya agar mudah dikonversi menjadi file PDF terpisah.",
    href: "/split",
    icon: Split,
    iconColor: "text-orange-500",
    iconBg: "bg-orange-100",
    status: "ready"
  },
  {
    title: "Kompres PDF",
    description: "Kurangi ukuran file dengan tetap mengoptimalkan kualitas PDF maksimal.",
    href: "/compress",
    icon: Minimize2,
    iconColor: "text-green-500",
    iconBg: "bg-green-100",
    status: "ready"
  },
  {
    title: "PDF ke Word",
    description: "Konversi file PDF dengan mudah menjadi dokumen DOC dan DOCX yang mudah diedit. Dokumen WORD hasil konversi hampir 100 akurat.",
    href: "/pdf-to-word",
    icon: FileText,
    iconColor: "text-blue-500",
    iconBg: "bg-blue-100",
    status: "ready"
  },
  {
    title: "Word ke PDF",
    description: "Buat file DOC dan DOCX mudah dibaca dengan dikonversi ke PDF.",
    href: "/word-to-pdf",
    icon: FileCode2,
    iconColor: "text-blue-500",
    iconBg: "bg-blue-100",
    status: "ready"
  },

  {
    title: "Putar PDF",
    description: "Putar PDF sesuai kebutuhan. Anda bahkan dapat memutar beberapa PDF sekaligus!",
    href: "/rotate",
    icon: RotateCw,
    iconColor: "text-purple-500",
    iconBg: "bg-purple-100",
    status: "ready"
  },
  {
    title: "PDF ke JPG",
    description: "Konversi setiap halaman PDF ke JPG atau ekstrak semua gambar yang tersimpan dalam PDF.",
    href: "/pdf-to-jpg",
    icon: ImageIcon,
    iconColor: "text-yellow-600",
    iconBg: "bg-yellow-100",
    status: "ready"
  },
  {
    title: "JPG ke PDF",
    description: "Konversi gambar JPG ke PDF dalam hitungan detik. Sesuaikan orientasi dan margin dengan mudah.",
    href: "/jpg-to-pdf",
    icon: FileImage,
    iconColor: "text-yellow-600",
    iconBg: "bg-yellow-100",
    status: "ready"
  },
  {
    title: "PDF ke Markdown",
    description: "Ekstrak teks, heading, dan tabel dari dokumen PDF ke format Markdown (.md) yang terstruktur rapi.",
    href: "/pdf-to-markdown",
    icon: FileText,
    iconColor: "text-emerald-600",
    iconBg: "bg-emerald-100",
    status: "ready"
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 py-12 md:py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 mb-4">
            DocMaxy PDF Toolkit
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Setiap alat yang Anda perlukan untuk bekerja dengan PDF di satu tempat.
            Semuanya 100% GRATIS dan mudah digunakan!
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {TOOLS.map((tool, index) => {
            const isReady = tool.status === "ready";
            const CardWrapper = isReady ? Link : 'div';
            
            return (
              <CardWrapper
                key={index}
                href={tool.href}
                className={`
                  group relative bg-white rounded-2xl p-8 border border-slate-200 
                  transition-all duration-300 ease-out flex flex-col items-start text-left
                  ${isReady 
                    ? 'hover:shadow-xl hover:-translate-y-1 hover:border-slate-300 cursor-pointer' 
                    : 'opacity-75 cursor-not-allowed'}
                `}
              >
                {!isReady && (
                  <span className="absolute top-4 right-4 bg-slate-100 text-slate-500 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                    Segera Hadir
                  </span>
                )}
                
                <div className={`
                  w-14 h-14 rounded-xl flex items-center justify-center mb-6 
                  transition-transform duration-300 ${isReady ? 'group-hover:scale-110' : ''}
                  ${tool.iconBg}
                `}>
                  <tool.icon className={`w-7 h-7 ${tool.iconColor}`} />
                </div>
                
                <h3 className="text-2xl font-bold text-slate-800 mb-3">
                  {tool.title}
                </h3>
                
                <p className="text-slate-500 leading-relaxed text-sm">
                  {tool.description}
                </p>
              </CardWrapper>
            );
          })}
        </div>
      </div>
    </main>
  );
}
