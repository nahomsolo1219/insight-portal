'use client';

import { CalendarPlus, Loader2 } from 'lucide-react';
import { useTransition } from 'react';
import { useToast } from '@/components/admin/ToastProvider';
import { generateIcsFile } from './actions';

interface Props {
  appointmentId: string;
}

/**
 * Asks the server for a one-event .ics string and triggers a browser
 * download. iOS Safari, Android Chrome, and every desktop OS hand the file
 * off to the default calendar app for a single tap-to-add experience.
 */
export function AddToCalendarButton({ appointmentId }: Props) {
  const [isPending, start] = useTransition();
  const { showToast } = useToast();

  function onClick() {
    start(async () => {
      const result = await generateIcsFile(appointmentId);
      if (!result.success) {
        showToast(result.error, 'error');
        return;
      }
      downloadIcs(result.data.icsContent, result.data.filename);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className="text-brand-teal-500 border-brand-teal-200 hover:border-brand-teal-300 hover:bg-brand-teal-50 inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPending ? (
        <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
      ) : (
        <CalendarPlus size={14} strokeWidth={1.5} />
      )}
      Add to calendar
    </button>
  );
}

function downloadIcs(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Defer revoke a tick so the click handler has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
