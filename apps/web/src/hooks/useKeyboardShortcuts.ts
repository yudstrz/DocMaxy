import { useEffect } from 'react';

interface KeyboardShortcutOptions {
  onOpenFileDialog?: () => void;
  onSubmitAction?: () => void;
  onEscape?: () => void;
  onArrowLeft?: () => void;
  onArrowRight?: () => void;
}

export function useKeyboardShortcuts(options: KeyboardShortcutOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Avoid triggering hotkeys inside text inputs except Esc
      const target = e.target as HTMLElement;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (isCtrlOrCmd && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        options.onOpenFileDialog?.();
      } else if (isCtrlOrCmd && e.key === 'Enter') {
        e.preventDefault();
        options.onSubmitAction?.();
      } else if (e.key === 'Escape') {
        options.onEscape?.();
      } else if (!isInput && e.key === 'ArrowLeft') {
        options.onArrowLeft?.();
      } else if (!isInput && e.key === 'ArrowRight') {
        options.onArrowRight?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [options]);
}
