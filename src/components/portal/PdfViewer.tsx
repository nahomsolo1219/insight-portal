'use client';

import { Download, Eye, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Props {
  /** Signed URL for the PDF — must be reachable from the browser. */
  url: string;
  /** Display name shown in the modal header + used for the download filename. */
  name: string;
}

/**
 * Inline PDF preview modal. Uses the browser's built-in PDF renderer via
 * `<iframe>` rather than a JS library — works on Chrome / Edge / Firefox /
 * Safari (incl. iOS), zero bundle cost. The `#toolbar=0` hint hides the
 * native toolbar in Chromium; other browsers ignore the fragment.
 *
 * Mobile: full-bleed (no padding, no rounded corners) so the small viewport
 * gets every available pixel for the page itself. Desktop: 4xl × 85vh
 * card centred over a dimmed backdrop.
 */
export function PdfViewer({ url, name }: Props) {
  const [open, setOpen] = useState(false);

  // Body scroll-lock + ESC to close, mirrored from the photo lightbox so
  // the two overlays behave identically.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // Same height + radius as the existing Download chip so they line
        // up shoulder-to-shoulder in cards.
        className="text-brand-teal-500 hover:text-brand-teal-600 hover:bg-brand-teal-50 inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition-all md:px-4"
      >
        <Eye size={14} strokeWidth={1.75} />
        <span className="hidden sm:inline">Preview</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Preview: ${name}`}
          className="fixed inset-0 z-50 flex bg-black/60 sm:items-center sm:justify-center sm:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            // Mobile: edge-to-edge full screen. sm+: bounded card.
            className="flex h-full w-full flex-col overflow-hidden bg-white sm:h-[85vh] sm:max-w-4xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
              <p className="truncate text-sm font-medium text-gray-900">{name}</p>
              <div className="flex flex-shrink-0 items-center gap-1">
                <a
                  href={url}
                  download={name}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-teal-500 hover:bg-brand-teal-50 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                >
                  <Download size={13} strokeWidth={1.75} />
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close preview"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                >
                  <X size={16} strokeWidth={1.75} />
                </button>
              </div>
            </header>

            <div className="flex-1 bg-gray-100">
              <iframe
                src={`${url}#toolbar=0`}
                className="h-full w-full border-0"
                title={name}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
