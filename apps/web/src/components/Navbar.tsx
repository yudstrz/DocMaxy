import Link from 'next/link';
import { Home } from 'lucide-react';

export function Navbar() {
  return (
    <nav className="w-full bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 transition-colors">
            <div className="bg-indigo-600 text-white p-1.5 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span className="font-extrabold text-xl tracking-tight text-slate-900">DocMaxy</span>
          </Link>

          <Link href="/" className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-2.5 rounded-lg transition-all text-sm font-medium">
            <Home className="w-5 h-5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Halaman Utama</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
