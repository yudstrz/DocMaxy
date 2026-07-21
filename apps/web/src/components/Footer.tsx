import React from 'react';

export function Footer() {
  return (
    <footer className="w-full bg-slate-900 border-t border-slate-800 mt-auto">
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center text-sm text-slate-400">
          <div className="mb-4 md:mb-0">
            &copy; {new Date().getFullYear()} DocMaxy PDF Toolkit. All rights reserved.
          </div>
          <div className="flex space-x-6">
            <span className="hover:text-white transition-colors cursor-pointer">Privasi</span>
            <span className="hover:text-white transition-colors cursor-pointer">Syarat & Ketentuan</span>
            <span className="hover:text-white transition-colors cursor-pointer">Bantuan</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
