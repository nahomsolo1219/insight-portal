'use client';

import {
  AlertCircle,
  Award,
  Check,
  Download,
  FileText,
  Pencil,
  Plus,
  Shield,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type ComponentType } from 'react';
import { Field, inputClass, textareaClass } from '@/components/admin/Field';
import { FileUpload, type FileUploadItem } from '@/components/admin/FileUpload';
import { LoadingDots } from '@/components/admin/LoadingDots';
import { Modal } from '@/components/admin/Modal';
import { useToast } from '@/components/admin/ToastProvider';
import { cn, formatDate } from '@/lib/utils';
import {
  deleteVendorDocument,
  updateVendorDocument,
  uploadVendorDocument,
  type VendorDocumentTypeInput,
} from './actions';
import type { VendorDocumentRow } from './queries';

const TYPE_LABELS: Record<VendorDocumentTypeInput, string> = {
  insurance: 'Insurance',
  w9: 'W-9',
  license: 'License',
  contract: 'Contract',
  certificate: 'Certificate',
  other: 'Other',
};

const TYPE_ICONS: Record<VendorDocumentTypeInput, ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  insurance: Shield,
  w9: FileText,
  license: Award,
  contract: FileText,
  certificate: Award,
  other: FileText,
};

const TYPES_WITH_EXPIRATION: readonly VendorDocumentTypeInput[] = ['insurance', 'license'];

interface Props {
  vendorId: string;
  documents: VendorDocumentRow[];
}

/**
 * Documents section of the vendor detail page. Renders the existing list +
 * the upload modal. Inline edit + delete sit on each row.
 */
export function VendorDocumentsSection({ vendorId, documents }: Props) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<VendorDocumentRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VendorDocumentRow | null>(null);

  return (
    <section className="shadow-card rounded-2xl bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">Documents</h3>
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-white transition-all"
        >
          <Plus size={14} strokeWidth={2} />
          Upload
        </button>
      </div>

      {documents.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">
          No documents on file. Insurance certificates, W-9 forms, and licenses go here.
        </p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {documents.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              onEdit={() => setEditTarget(doc)}
              onDelete={() => setDeleteTarget(doc)}
            />
          ))}
        </ul>
      )}

      {uploadOpen && (
        <UploadDocumentModal vendorId={vendorId} onClose={() => setUploadOpen(false)} />
      )}
      {editTarget && (
        <EditDocumentModal
          vendorId={vendorId}
          document={editTarget}
          onClose={() => setEditTarget(null)}
        />
      )}
      {deleteTarget && (
        <DeleteDocumentModal
          vendorId={vendorId}
          document={deleteTarget}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function DocumentRow({
  doc,
  onEdit,
  onDelete,
}: {
  doc: VendorDocumentRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const Icon = TYPE_ICONS[doc.type as VendorDocumentTypeInput] ?? FileText;
  const status = expirationStatus(doc.expirationDate);

  return (
    <li className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
      <div className="bg-brand-warm-200 text-brand-teal-500 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl">
        <Icon size={18} strokeWidth={1.5} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-900">{doc.name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <span>{TYPE_LABELS[doc.type as VendorDocumentTypeInput] ?? 'Document'}</span>
          {doc.expirationDate ? (
            <>
              <span className="text-gray-300">·</span>
              <span>Expires {formatDate(doc.expirationDate)}</span>
            </>
          ) : (
            <>
              <span className="text-gray-300">·</span>
              <span>No expiration</span>
            </>
          )}
        </div>
        {doc.notes && <div className="mt-0.5 truncate text-xs text-gray-400">{doc.notes}</div>}
      </div>

      <ExpirationBadge status={status} />

      <div className="flex items-center gap-1">
        {doc.signedUrl ? (
          <a
            href={doc.signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-teal-500 hover:text-brand-teal-600 hover:bg-brand-teal-50 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
          >
            <Download size={12} strokeWidth={1.75} />
            Download
          </a>
        ) : (
          <span className="text-xs text-gray-300 italic">Unavailable</span>
        )}
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${doc.name}`}
          className="hover:text-brand-teal-500 hover:bg-brand-teal-50 rounded-lg p-1.5 text-gray-400 transition-all"
        >
          <Pencil size={13} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${doc.name}`}
          className="rounded-lg p-1.5 text-gray-400 transition-all hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 size={13} strokeWidth={1.5} />
        </button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Expiration logic
// ---------------------------------------------------------------------------

type ExpirationStatus =
  | { kind: 'none' }
  | { kind: 'valid' }
  | { kind: 'expiring'; daysUntil: number }
  | { kind: 'expired'; daysSince: number };

/**
 * Bucket a doc's expiration date into a status. Days are floor()-rounded
 * so "expires today" reads as expiring, not expired. Valid means more
 * than 30 days remain; expiring soon is the 0-30 day window.
 */
function expirationStatus(date: string | null): ExpirationStatus {
  if (!date) return { kind: 'none' };
  // Parse as local date (YYYY-MM-DD) so we don't shift across timezones.
  const [yStr, mStr, dStr] = date.split('-');
  const y = Number.parseInt(yStr, 10);
  const m = Number.parseInt(mStr, 10);
  const d = Number.parseInt(dStr, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return { kind: 'none' };
  }
  const exp = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { kind: 'expired', daysSince: -diffDays };
  if (diffDays <= 30) return { kind: 'expiring', daysUntil: diffDays };
  return { kind: 'valid' };
}

function ExpirationBadge({ status }: { status: ExpirationStatus }) {
  if (status.kind === 'none') {
    return (
      <span className="hidden rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-500 sm:inline-flex">
        No expiry
      </span>
    );
  }
  if (status.kind === 'valid') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
        <Check size={10} strokeWidth={2.5} />
        Valid
      </span>
    );
  }
  if (status.kind === 'expiring') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">
        <AlertCircle size={10} strokeWidth={2.5} />
        {status.daysUntil === 0
          ? 'Expires today'
          : `${status.daysUntil}d left`}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-medium text-red-700">
      <AlertCircle size={10} strokeWidth={2.5} />
      Expired
    </span>
  );
}

// ---------------------------------------------------------------------------
// Upload modal
// ---------------------------------------------------------------------------

function UploadDocumentModal({
  vendorId,
  onClose,
}: {
  vendorId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [type, setType] = useState<VendorDocumentTypeInput>('insurance');
  const [expiration, setExpiration] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<FileUploadItem[]>([]);

  const showExpiration = TYPES_WITH_EXPIRATION.includes(type);

  function submit() {
    setError(null);
    if (!name.trim()) return setError('Document name is required.');
    if (files.length === 0) return setError('Attach a file.');

    startTransition(async () => {
      const formData = new FormData();
      formData.append('file', files[0].file);

      const result = await uploadVendorDocument(
        vendorId,
        {
          name: name.trim(),
          type,
          expirationDate: showExpiration && expiration ? expiration : null,
          notes: notes.trim() || null,
        },
        formData,
      );
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast('Document uploaded');
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Upload document"
      size="lg"
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
                Uploading
                <LoadingDots />
              </>
            ) : (
              'Upload'
            )}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Document name" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. General Liability Insurance 2026"
            autoFocus
            className={inputClass}
          />
        </Field>

        <Field label="Type" required>
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(TYPE_LABELS) as [VendorDocumentTypeInput, string][]).map(
              ([id, label]) => {
                const active = type === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setType(id)}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-sm font-medium transition-all',
                      active
                        ? 'border-brand-teal-500 bg-brand-teal-50 text-brand-teal-500'
                        : 'hover:border-brand-teal-200 hover:text-brand-teal-500 border-gray-200 text-gray-600',
                    )}
                  >
                    {label}
                  </button>
                );
              },
            )}
          </div>
        </Field>

        {showExpiration && (
          <Field label="Expiration date" hint="Insurance + licenses expire — set the date so we can flag it.">
            <input
              type="date"
              value={expiration}
              onChange={(e) => setExpiration(e.target.value)}
              className={inputClass}
            />
          </Field>
        )}

        <Field label="Notes" hint="Optional internal notes.">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={textareaClass}
          />
        </Field>

        <Field label="File" required hint="PDF or image scan. Max 25 MB.">
          <FileUpload
            kind="any"
            multiple={false}
            maxFiles={1}
            onChange={setFiles}
            disabled={isPending}
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

// ---------------------------------------------------------------------------
// Edit modal — metadata only (file content stays the same)
// ---------------------------------------------------------------------------

function EditDocumentModal({
  vendorId,
  document,
  onClose,
}: {
  vendorId: string;
  document: VendorDocumentRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(document.name);
  const [type, setType] = useState<VendorDocumentTypeInput>(document.type as VendorDocumentTypeInput);
  const [expiration, setExpiration] = useState(document.expirationDate ?? '');
  const [notes, setNotes] = useState(document.notes ?? '');

  const showExpiration = TYPES_WITH_EXPIRATION.includes(type);

  function submit() {
    setError(null);
    if (!name.trim()) return setError('Document name is required.');

    startTransition(async () => {
      const result = await updateVendorDocument(document.id, vendorId, {
        name: name.trim(),
        type,
        expirationDate: showExpiration && expiration ? expiration : null,
        notes: notes.trim() || null,
      });
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast('Document updated');
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit document"
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
        <Field label="Document name" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Type" required>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as VendorDocumentTypeInput)}
            className={inputClass}
          >
            {(Object.entries(TYPE_LABELS) as [VendorDocumentTypeInput, string][]).map(
              ([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ),
            )}
          </select>
        </Field>

        {showExpiration && (
          <Field label="Expiration date">
            <input
              type="date"
              value={expiration}
              onChange={(e) => setExpiration(e.target.value)}
              className={inputClass}
            />
          </Field>
        )}

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={textareaClass}
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

// ---------------------------------------------------------------------------
// Delete confirm
// ---------------------------------------------------------------------------

function DeleteDocumentModal({
  vendorId,
  document,
  onClose,
}: {
  vendorId: string;
  document: VendorDocumentRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteVendorDocument(document.id, vendorId);
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast('Document deleted');
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Delete document?"
      size="sm"
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
            onClick={confirm}
            disabled={isPending}
            className="shadow-soft rounded-xl bg-red-500 px-5 py-2.5 font-medium text-white transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? (
              <>
                Deleting
                <LoadingDots />
              </>
            ) : (
              'Delete'
            )}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-700">
        You&apos;re about to delete <strong className="font-semibold">{document.name}</strong>.
        The file is removed from storage and the record from the database. This cannot be
        undone.
      </p>
      {error && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}
    </Modal>
  );
}
