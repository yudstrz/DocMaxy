import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-slate-50">
      <h1 className="text-5xl font-extrabold tracking-tight text-slate-900 mb-6">DocMaxy</h1>
      <p className="text-xl text-slate-600 max-w-2xl text-center mb-10">
        Platform konversi dan manipulasi PDF serverless dengan performa tinggi.
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl w-full">
        <Link 
          href="/merge" 
          className="group flex flex-col p-8 bg-white border border-slate-200 rounded-3xl hover:border-red-500 hover:shadow-xl transition-all"
        >
          <div className="w-14 h-14 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Gabungkan PDF</h2>
          <p className="text-slate-500">Gabungkan beberapa file PDF dengan urutan yang bisa diatur lewat drag-and-drop.</p>
        </Link>
        
        {/* Placeholder for future tools */}
        <div className="flex flex-col p-8 bg-slate-50 border border-slate-200 border-dashed rounded-3xl opacity-60">
          <div className="w-14 h-14 bg-slate-200 text-slate-400 rounded-2xl flex items-center justify-center mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v16"/><path d="M4 12h16"/></svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Alat Lainnya</h2>
          <p className="text-slate-500">Kompresi, Konversi ke Word/Excel, dan fitur manipulasi PDF lainnya segera hadir.</p>
        </div>
      </div>
    </main>
  );
}
