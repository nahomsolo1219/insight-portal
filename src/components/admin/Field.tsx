// Reusable form field wrapper + input class. Keeps form styling consistent
// across the New Client modal, Profile tab edit modals, and anything that
// comes next (property create, project create, invoice upload, …).

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
      <label className="mb-2 block text-xs font-semibold tracking-wider text-gray-500 uppercase">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

/**
 * Shared input styling for text / email / tel / number inputs and selects.
 * Apply as `className={inputClass}`. Add `resize-none` for textareas.
 */
export const inputClass =
  'w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-brand-teal-200 focus:border-brand-teal-400 outline-none transition-all bg-white';

/** Variant of inputClass for textareas (adds no-resize). */
export const textareaClass = cn(inputClass, 'resize-none');
