'use client';

import { Check, Mail, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Field, inputClass } from '@/components/admin/Field';
import { LoadingDots } from '@/components/admin/LoadingDots';
import { Modal } from '@/components/admin/Modal';
import { useToast } from '@/components/admin/ToastProvider';
import { cn, formatDate } from '@/lib/utils';
import { inviteUser } from '../../staff/actions';
import type { ClientPortalStatus } from './queries';

interface Props {
  clientId: string;
  clientName: string;
  /** Pre-fills the invite modal's email field. */
  defaultEmail: string | null;
  status: ClientPortalStatus;
}

/**
 * Header chip for the client detail page. Three visual states tied to the
 * portal-invite lifecycle:
 *
 *   not_invited → gold-bordered "Invite to portal" button.
 *   invited     → calm green "Portal invite sent" chip + a small "Resend"
 *                 link (we can't easily tell if they've actually logged
 *                 in without querying auth.users, so we present the
 *                 invited state and let the admin re-send if needed).
 *
 * Both interactive paths funnel into the same modal so the action is
 * consistent: confirm the email, fire `inviteUser`, toast on result.
 */
export function InviteToPortalButton({
  clientId,
  clientName,
  defaultEmail,
  status,
}: Props) {
  const [open, setOpen] = useState(false);

  if (status.status === 'invited') {
    return (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
            title={`Invited ${formatDate(status.invitedAt.toISOString().slice(0, 10))}`}
          >
            <Check size={12} strokeWidth={2} />
            Portal invite sent
          </span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="hover:text-brand-teal-500 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors"
          >
            <RefreshCw size={11} strokeWidth={2} />
            Resend
          </button>
        </div>
        {open && (
          <InviteModal
            clientId={clientId}
            clientName={clientName}
            defaultEmail={status.email}
            mode="resend"
            onClose={() => setOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'border-brand-gold-300 text-brand-gold-700 hover:bg-brand-gold-50',
          'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium transition-all',
        )}
      >
        <Mail size={13} strokeWidth={1.75} />
        Invite to portal
      </button>
      {open && (
        <InviteModal
          clientId={clientId}
          clientName={clientName}
          defaultEmail={defaultEmail}
          mode="invite"
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

function InviteModal({
  clientId,
  clientName,
  defaultEmail,
  mode,
  onClose,
}: {
  clientId: string;
  clientName: string;
  defaultEmail: string | null;
  mode: 'invite' | 'resend';
  onClose: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    if (!email.trim()) return setError('Email is required.');

    startTransition(async () => {
      const result = await inviteUser({
        email: email.trim(),
        fullName: clientName,
        role: 'client',
        clientId,
      });
      if (!result.success) {
        const msg = result.error ?? 'Failed to send invite.';
        setError(msg);
        showToast(msg, 'error');
        return;
      }
      showToast(
        mode === 'resend'
          ? `Invite re-sent to ${email.trim()}`
          : `Portal invite sent to ${email.trim()}`,
      );
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === 'resend' ? 'Resend portal invite' : 'Invite to portal'}
      size="md"
      locked={isPending}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl px-5 py-2.5 font-medium text-gray-700 transition-all hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft rounded-xl px-5 py-2.5 font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? (
              <>
                Sending
                <LoadingDots />
              </>
            ) : mode === 'resend' ? (
              'Resend invite'
            ) : (
              'Send invite'
            )}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          {mode === 'resend' ? (
            <>
              We&apos;ll send a fresh invite email to{' '}
              <strong className="font-semibold">{clientName}</strong>. The portal account
              already exists — this just gives them a new password-setup link.
            </>
          ) : (
            <>
              This will create a portal account for{' '}
              <strong className="font-semibold">{clientName}</strong>. They&apos;ll
              receive an email to set their password and can then log in to view their
              projects, photos, invoices, and decisions.
            </>
          )}
        </p>

        <Field label="Email" required>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="anderson@example.com"
            autoFocus
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
