import { useLayoutEffect } from 'react';

/** Install a page's theme before paint and remove it when navigating away. */
export function usePageStyles(css: string, title: string): void {
  useLayoutEffect(() => {
    const style = document.createElement('style');
    style.dataset.gameStyles = title;
    style.textContent = css;
    document.head.appendChild(style);
    const previousTitle = document.title;
    document.title = title;

    return () => {
      style.remove();
      document.title = previousTitle;
    };
  }, [css, title]);
}
