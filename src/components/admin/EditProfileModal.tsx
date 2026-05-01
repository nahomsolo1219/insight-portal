'use client';

// Admin Edit-profile modal. Mirrors the client-portal EditProfileModal
// (in PortalSidebar.tsx) but writes to the `profiles` row instead of
// the `clients` row — admins don't have a clients row.
//
// Composition:
//   - AvatarUpload (existing primitive) drives the avatar replacement
//     via `uploadProfileAvatar` (the role-agnostic action at
//     /app/profile-actions.ts that targets the public `avatars`
//     bucket).
//   - Name + Phone fields drive `updateMyAdminProfile`.
//   - Email is read-only — Supabase Auth owns it; mutating it would
//     require a confirmation flow that's out of scope for Session 7.
//
// Save button only fires `updateMyAdminProfile`; avatar uploads are
// independent and instant (the AvatarUpload optimistic preview
// handles the visual swap without the modal needing to manage it).

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { AvatarUpload } from '@/components/admin/AvatarUpload';
import { Field, inputClass } from '@/components/admin/Field';
import { LoadingDots } from '@/components/admin/LoadingDots';
import { Modal } from '@/components/admin/Modal';
import { useToast } from '@/components/admin/ToastProvider';
import { updateMyAdminProfile, uploadProfileAvatar } from '@/app/profile-actions';
import { initialsFrom } from '@/lib/utils';

interface AdminProfileFormState {
  fullName: string;
  phone: string;
}

interface EditProfileModalProps {
  open: boolean;
  onClose: () => void;
  initial: {
    fullName: string;
    email: string;
    phone: string;
    /** Pre-signed/public avatar URL (already cache-busted by the
     *  caller). `null` falls back to initials in AvatarUpload. */
    avatarUrl: string | null;
  };
}

export function EditProfileModal({ open, onClose, initial }: EditProfileModalProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<AdminProfileFormState>({
    fullName: initial.fullName,
    phone: initial.phone,
  });

  function close() {
    if (isPending) return;
    setError(null);
    setForm({ fullName: initial.fullName, phone: initial.phone });
    onClose();
  }

  function submit() {
    setError(null);
    if (!form.fullName.trim()) {
      setError('Name cannot be empty.');
      return;
    }

    startTransition(async () => {
      const result = await updateMyAdminProfile({
        fullName: form.fullName,
        phone: form.phone,
      });
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast('Profile updated');
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Edit profile"
      size="md"
      locked={isPending}
      footer={
        <>
          <button
            type="button"
            onClick={close}
            disabled={isPending}
            className="bg-paper border border-line text-ink-700 hover:bg-cream rounded-lg px-4 py-2.5 font-medium transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="bg-brand-gold-500 hover:bg-brand-gold-600 text-paper rounded-lg px-4 py-2.5 font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? (
              <>
                Saving
                <LoadingDots />
              </>
            ) : (
              'Save changes'
            )}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Avatar lives at the top — uploads are instant (the
            AvatarUpload primitive handles its own optimistic preview
            + server roundtrip), so there's no save-button gate for
            this field. */}
        <div className="flex items-center gap-4">
          <AvatarUpload
            currentUrl={initial.avatarUrl}
            initials={initialsFrom(initial.fullName || initial.email)}
            size="lg"
            onUpload={uploadProfileAvatar}
            ariaLabel="Change profile photo"
          />
          <div className="text-ink-500 text-xs">
            <p className="text-ink-700 mb-0.5 text-sm font-medium">Profile photo</p>
            <p>Click the avatar to upload a new image. PNG, JPG, or WebP up to 5 MB.</p>
          </div>
        </div>

        <Field label="Name" required>
          <input
            type="text"
            value={form.fullName}
            onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
            className={inputClass}
          />
        </Field>

        <Field
          label="Email"
          hint="Email is managed by your sign-in. Contact David to change it."
        >
          <input
            type="email"
            value={initial.email}
            readOnly
            className={`${inputClass} text-ink-500 cursor-not-allowed`}
          />
        </Field>

        <Field label="Phone" hint="Optional.">
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
            className={inputClass}
          />
        </Field>

        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
