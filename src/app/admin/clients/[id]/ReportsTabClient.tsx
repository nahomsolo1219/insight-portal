'use client';

import {
  CalendarClock,
  ClipboardCheck,
  Download,
  File as FileIcon,
  FileText,
  Pencil,
  Plus,
  Shield,
  Trash2,
  Upload,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Field, inputClass } from '@/components/admin/Field';
import { FileUpload, type FileUploadItem } from '@/components/admin/FileUpload';
import { LoadingDots } from '@/components/admin/LoadingDots';
import { Modal } from '@/components/admin/Modal';
import { useToast } from '@/components/admin/ToastProvider';
import { PdfViewer } from '@/components/portal/PdfViewer';
import { cn, formatDate, formatReportTitle } from '@/lib/utils';
import {
  deleteReport,
  updateReport,
  uploadReport,
  type ReportMetadataInput,
  type ReportType,
} from './reports-actions';
import type { AdminReportRow, AppointmentOption, VendorOption } from './queries';

export type ReportRowWithUrl = AdminReportRow & { signedUrl: string | null };

interface ReportTypeOption {
  id: ReportType;
  label: string;
  icon: LucideIcon;
}

const REPORT_TYPES: readonly ReportTypeOption[] = [
  { id: 'inspection', label: 'Inspection', icon: ClipboardCheck },
  { id: 'assessment', label: 'Assessment', icon: Shield },
  { id: 'service', label: 'Service', icon: Wrench },
  { id: 'maintenance', label: 'Maintenance', icon: CalendarClock },
  { id: 'other', label: 'Other', icon: FileIcon },
] as const;

function ReportTypeIcon({ type, size = 18 }: { type: string; size?: number }) {
  const match = REPORT_TYPES.find((t) => t.id === type);
  const Icon = match?.icon ?? FileIcon;
  return <Icon size={size} strokeWidth={1.5} />;
}

function labelForType(type: string): string {
  return REPORT_TYPES.find((t) => t.id === type)?.label ?? 'Other';
}

interface ReportsTabClientProps {
  clientId: string;
  propertyId: string;
  propertyName: string;
  reports: ReportRowWithUrl[];
  vendors: VendorOption[];
  appointments: AppointmentOption[];
}

export function ReportsTabClient({
  clientId,
  propertyId,
  propertyName,
  reports,
  vendors,
  appointments,
}: ReportsTabClientProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ReportRowWithUrl | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReportRowWithUrl | null>(null);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {reports.length} {reports.length === 1 ? 'report' : 'reports'}
        </div>
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white transition-all duration-150"
        >
          <Upload size={16} strokeWidth={2} />
          Upload report
        </button>
      </div>

      {reports.length === 0 ? (
        <EmptyState onUploadClick={() => setUploadOpen(true)} />
      ) : (
        <div className="shadow-soft-md overflow-hidden rounded-2xl bg-paper">
          {reports.map((r) => (
            <ReportRowItem
              key={r.id}
              report={r}
              onEdit={() => setEditTarget(r)}
              onDelete={() => setDeleteTarget(r)}
            />
          ))}
        </div>
      )}

      {uploadOpen && (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          clientId={clientId}
          propertyId={propertyId}
          propertyName={propertyName}
          vendors={vendors}
          appointments={appointments}
        />
      )}

      {editTarget && (
        <EditModal
          report={editTarget}
          onClose={() => setEditTarget(null)}
          clientId={clientId}
          propertyName={propertyName}
          vendors={vendors}
          appointments={appointments}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          report={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          clientId={clientId}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function ReportRowItem({
  report,
  onEdit,
  onDelete,
}: {
  report: ReportRowWithUrl;
  onEdit: () => void;
  onDelete: () => void;
}) {
  // Vendor leads the title (per the firm owner's ask); it's dropped from the
  // meta line below so it isn't repeated.
  const title = formatReportTitle(report.vendorName, report.name);
  return (
    <div className="hover:bg-brand-warm-50 flex items-center gap-4 border-t border-gray-50 px-5 py-4 transition-colors first:border-t-0">
      <div className="bg-cream flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-gray-500">
        <ReportTypeIcon type={report.type} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-900">{title}</div>
        <div className="mt-0.5 text-xs text-gray-500">
          {labelForType(report.type)} · {formatDate(report.date)}
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1">
        {report.signedUrl ? (
          <>
            <PdfViewer url={report.signedUrl} name={`${title}.pdf`} />
            <a
              href={report.signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-teal-500 hover:text-brand-teal-600 hover:bg-brand-teal-50 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all"
            >
              <Download size={14} strokeWidth={1.5} />
              Download
            </a>
          </>
        ) : (
          <span className="text-xs text-gray-400 italic">Link unavailable</span>
        )}
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${title}`}
          className="hover:text-brand-teal-500 rounded-lg p-1.5 text-gray-400 transition-all hover:bg-brand-warm-50"
        >
          <Pencil size={16} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${title}`}
          className="rounded-lg p-1.5 text-gray-400 transition-all hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

function EmptyState({ onUploadClick }: { onUploadClick: () => void }) {
  return (
    <div className="shadow-soft-md rounded-2xl bg-paper p-12 text-center">
      <div className="bg-brand-warm-200 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-gray-400">
        <FileText size={24} strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-gray-900">No reports yet</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
        Upload subcontractor inspection and service reports here — the homeowner reads them in
        their portal.
      </p>
      <button
        type="button"
        onClick={onUploadClick}
        className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white transition-all"
      >
        <Plus size={16} />
        Upload report
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared metadata form (used by upload + edit)
// ---------------------------------------------------------------------------

interface MetadataFields {
  name: string;
  date: string;
  type: ReportType;
  vendorId: string;
  appointmentId: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function MetadataForm({
  propertyName,
  vendors,
  appointments,
  value,
  onChange,
  disabled,
}: {
  propertyName: string;
  vendors: VendorOption[];
  appointments: AppointmentOption[];
  value: MetadataFields;
  onChange: (next: MetadataFields) => void;
  disabled: boolean;
}) {
  return (
    <>
      <Field label="Property" required>
        {/* Reports are property-scoped; the tab already fixes which property
            we're on, so this is shown read-only for confirmation. */}
        <input type="text" value={propertyName} disabled className={inputClass} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Vendor" hint="The sub who produced the report.">
          <select
            value={value.vendorId}
            onChange={(e) => onChange({ ...value, vendorId: e.target.value })}
            disabled={disabled}
            className={inputClass}
          >
            <option value="">— None —</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date" required>
          <input
            type="date"
            value={value.date}
            onChange={(e) => onChange({ ...value, date: e.target.value })}
            disabled={disabled}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Report type" required>
        <div className="grid grid-cols-3 gap-2">
          {REPORT_TYPES.map((t) => {
            const isActive = value.type === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onChange({ ...value, type: t.id })}
                disabled={disabled}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all',
                  isActive
                    ? 'border-brand-teal-500 bg-brand-teal-50 text-brand-teal-500'
                    : 'hover:border-brand-teal-200 hover:text-brand-teal-500 border-line text-gray-600',
                )}
              >
                <Icon size={14} strokeWidth={1.5} />
                {t.label}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Title" required hint="The vendor name leads automatically — just the report name here, e.g. “Annual inspection”.">
        <input
          type="text"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder="Annual inspection"
          disabled={disabled}
          className={inputClass}
        />
      </Field>

      {appointments.length > 0 && (
        <Field label="Linked appointment" hint="Optional — the visit that produced this report.">
          <select
            value={value.appointmentId}
            onChange={(e) => onChange({ ...value, appointmentId: e.target.value })}
            disabled={disabled}
            className={inputClass}
          >
            <option value="">— None —</option>
            {appointments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} · {formatDate(a.date)}
              </option>
            ))}
          </select>
        </Field>
      )}
    </>
  );
}

function toMetadataInput(fields: MetadataFields): ReportMetadataInput {
  return {
    name: fields.name,
    date: fields.date,
    type: fields.type,
    vendorId: fields.vendorId || null,
    appointmentId: fields.appointmentId || null,
  };
}

// ---------------------------------------------------------------------------
// Upload modal
// ---------------------------------------------------------------------------

function UploadModal({
  onClose,
  clientId,
  propertyId,
  propertyName,
  vendors,
  appointments,
}: {
  onClose: () => void;
  clientId: string;
  propertyId: string;
  propertyName: string;
  vendors: VendorOption[];
  appointments: AppointmentOption[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<MetadataFields>({
    name: '',
    date: todayIso(),
    type: 'inspection',
    vendorId: '',
    appointmentId: '',
  });
  const [files, setFiles] = useState<FileUploadItem[]>([]);

  function submit() {
    setError(null);
    if (!fields.name.trim()) return setError('Please enter a title.');
    if (files.length === 0) return setError('Please attach a PDF.');

    startTransition(async () => {
      const formData = new FormData();
      formData.append('file', files[0].file);

      const result = await uploadReport(clientId, propertyId, toMetadataInput(fields), formData);
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast('Report uploaded');
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Upload report"
      size="lg"
      locked={isPending}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="bg-paper border border-line text-ink-700 hover:bg-cream rounded-lg px-4 py-2.5 font-medium transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending || files.length === 0 || !fields.name.trim()}
            className="bg-brand-gold-500 hover:bg-brand-gold-600 text-paper rounded-lg px-4 py-2.5 font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
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
        <MetadataForm
          propertyName={propertyName}
          vendors={vendors}
          appointments={appointments}
          value={fields}
          onChange={setFields}
          disabled={isPending}
        />
        <Field label="PDF" required hint="Drag and drop, or click to browse. One PDF per report.">
          <FileUpload
            kind="pdf"
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
// Edit modal (metadata only — replace the PDF by deleting + re-uploading)
// ---------------------------------------------------------------------------

function EditModal({
  report,
  onClose,
  clientId,
  propertyName,
  vendors,
  appointments,
}: {
  report: ReportRowWithUrl;
  onClose: () => void;
  clientId: string;
  propertyName: string;
  vendors: VendorOption[];
  appointments: AppointmentOption[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<MetadataFields>({
    name: report.name,
    date: report.date,
    type: (REPORT_TYPES.find((t) => t.id === report.type)?.id ?? 'other') as ReportType,
    vendorId: report.vendorId ?? '',
    appointmentId: report.appointmentId ?? '',
  });

  function submit() {
    setError(null);
    if (!fields.name.trim()) return setError('Please enter a title.');

    startTransition(async () => {
      const result = await updateReport(report.id, clientId, toMetadataInput(fields));
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast('Report updated');
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit report"
      size="lg"
      locked={isPending}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="bg-paper border border-line text-ink-700 hover:bg-cream rounded-lg px-4 py-2.5 font-medium transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending || !fields.name.trim()}
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
        <MetadataForm
          propertyName={propertyName}
          vendors={vendors}
          appointments={appointments}
          value={fields}
          onChange={setFields}
          disabled={isPending}
        />
        <p className="text-xs text-gray-400">
          To replace the PDF itself, delete this report and upload a new one.
        </p>
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
// Delete confirmation
// ---------------------------------------------------------------------------

function DeleteConfirmModal({
  report,
  onClose,
  clientId,
}: {
  report: ReportRowWithUrl;
  onClose: () => void;
  clientId: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await deleteReport(report.id, clientId);
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast('Report deleted');
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Delete report?"
      size="sm"
      locked={isPending}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="bg-paper border border-line text-ink-700 hover:bg-cream rounded-lg px-4 py-2.5 font-medium transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="bg-rose-600 hover:bg-rose-700 text-paper rounded-lg px-4 py-2.5 font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
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
      <p className="mb-3 text-sm text-gray-700">
        You&apos;re about to delete{' '}
        <strong className="font-semibold">
          {formatReportTitle(report.vendorName, report.name)}
        </strong>
        .
      </p>
      <p className="text-sm text-gray-500">
        This removes the file from storage and the database. This cannot be undone.
      </p>
      {error && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}
    </Modal>
  );
}
