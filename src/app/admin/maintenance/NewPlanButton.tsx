'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { NewPlanModal } from './NewPlanModal';
import type {
  FieldStaffPickerRow,
  PropertyPickerRow,
  VendorPickerRow,
} from './queries';

interface NewPlanButtonProps {
  properties: PropertyPickerRow[];
  vendors: VendorPickerRow[];
  fieldStaff: FieldStaffPickerRow[];
}

/**
 * Toolbar button that opens the multi-step plan builder modal. The
 * modal handles all the state — this button is a pure trigger so the
 * server-rendered list page stays static.
 */
export function NewPlanButton({ properties, vendors, fieldStaff }: NewPlanButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus size={16} strokeWidth={2} />
        New plan
      </button>
      {open && (
        <NewPlanModal
          properties={properties}
          vendors={vendors}
          fieldStaff={fieldStaff}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
