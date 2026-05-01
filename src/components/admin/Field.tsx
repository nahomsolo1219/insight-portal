// Reusable form field wrapper + input class. Keeps form styling consistent
// across the New Client modal, Profile tab edit modals, and anything that
// comes next (property create, project create, invoice upload, …).
//
// Session 6 styling pass: switched from the legacy white/teal palette to
// the editorial cream/line/ink/gold tokens so every modal that uses this
// pair (which is most of them) inherits the new surface treatment.
// Labels now read as quiet sentence-case metadata; inputs sit on a
// cream wash and gain a gold focus ring.

import { cn } from '@/lib/utils';

interface FieldProps {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
  className?: string;
}

export function Field({ label, children, required, hint, className }: FieldProps) {
  return (
    <div className={className}>
      <label className="text-ink-700 mb-1.5 block text-sm font-medium">
        {label}
        {required && <span className="text-brand-gold-500 ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-ink-400 mt-1.5 text-xs">{hint}</p>}
    </div>
  );
}

/**
 * Shared input styling for text / email / tel / number inputs and selects.
 * Apply as `className={inputClass}`. Add `resize-none` for textareas.
 */
export const inputClass =
  'w-full px-3 py-2.5 rounded-lg border border-line text-sm text-ink-900 placeholder:text-ink-400 focus:ring-2 focus:ring-brand-gold-500/20 focus:border-brand-gold-500 outline-none transition bg-cream';

/** Variant of inputClass for textareas (adds no-resize). */
export const textareaClass = cn(inputClass, 'resize-none');
