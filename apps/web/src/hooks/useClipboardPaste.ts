import { useEffect } from 'react';
import toast from 'react-hot-toast';

export function useClipboardPaste(onFilesPasted: (files: File[]) => void) {
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Avoid intercepting paste inside active text inputs or textareas
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (!e.clipboardData) return;

      const items = Array.from(e.clipboardData.items);
      const files: File[] = [];

      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }

      if (files.length > 0) {
        e.preventDefault();
        toast.success(`Ditempel ${files.length} file dari clipboard!`);
        onFilesPasted(files);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [onFilesPasted]);
}
