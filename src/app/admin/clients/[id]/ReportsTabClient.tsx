'use client';

import {
  ClipboardCheck,
  Download,
  FileSearch,
  FileText,
  MessageSquare,
  Plus,
  ScrollText,
  Trash2,
  Upload,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Field, inputClass } from '@/components/admin/Field';
import { FileUpload, type FileUploadItem } from '@/components/admin/FileUpload';
import { Modal } from '@/components/admin/Modal';
import { cn, formatDate } from '@/lib/utils';
import type { ProjectOption, ReportRow, VendorOption } from './queries';
import {
  deleteReport,
  markReportRead,
  uploadReport,
  type ReportType,
} from './reports-actions';

export type ReportRowWithUrl = ReportRow & { signedUrl: string | null };

interface ReportTypeOption {
  id: ReportType;
  label: string;
  icon: LucideIcon;
  /** Tailwind classes for the inline type badge on each row. */
  badge: string;
}

const REPORT_TYPES: readonly ReportTypeOption[] = [
  { id: 'inspection', label: 'Inspection', icon: FileSearch, badge: 'bg-blue-50 text-blue-700' },
  {
    id: 'assessment',
    label: 'Assessment',
    icon: ClipboardCheck,
    badge: 'bg-purple-50 text-purple-700',
  },
  {
    id: 'update',
    label: 'Update',
    icon: MessageSquare,
    badge: 'bg-emerald-50 text-emerald-700',
  },
  {
    id: 'year_end',
    label: 'Year-end',
    icon: ScrollText,
    badge: 'bg-amber-50 text-amber-700',
  },
] as const;

function typeMeta(type: string): ReportTypeOption {
  return (
    REPORT_TYPES.find((t) => t.id === type) ?? {
      id: 'update',
      label: type,
      icon: FileText,
      badge: 'bg-gray-100 text-gray-600',
    }
  );
}

interface ReportsTabClientProps {
  clientId: string;
  propertyId: string;
  reports: ReportRowWithUrl[];
  vendors: VendorOption[];
  projects: ProjectOption[];
}

export function ReportsTabClient({
  clientId,
  propertyId,
  reports,
  vendors,
  projects,
}: ReportsTabClientProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
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
        <div className="shadow-card overflow-hidden rounded-2xl bg-white">
          {reports.map((r) => (
            <ReportRowItem
              key={r.id}
              report={r}
              clientId={clientId}
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
          vendors={vendors}
          projects={projects}
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

interface ReportRowItemProps {
  report: ReportRowWithUrl;
  clientId: string;
  onDelete: () => void;
}

function ReportRowItem({ report, clientId, onDelete }: ReportRowItemProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const meta = typeMeta(report.type);
  const Icon = meta.icon;

  // Fire-and-forget: marking read runs in a transition, but we DON'T
  // preventDefault on the link — the browser opens the PDF normally (dodging
  // popup blockers) and the server flips isNew → false in the background.
  function handleDownloadClick() {
    if (!report.isNew) return;
    startTransition(async () => {
      await markReportRead(report.id, clientId);
      router.refresh();
    });
  }

  return (
    <div className="hover:bg-brand-warm-50 flex items-center gap-4 border-t border-gray-50 px-5 py-4 transition-colors first:border-t-0">
      <div className="bg-brand-warm-100 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-gray-500">
        <Icon size={18} strokeWidth={1.5} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {report.isNew && (
            <span
              aria-label="Unread"
              title="Unread"
              className="bg-brand-teal-500 inline-block h-2 w-2 flex-shrink-0 rounded-full"
            />
          )}
          <span className="truncate text-sm font-medium text-gray-900">{report.name}</span>
          <span
            className={cn(
              'flex-shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium',
              meta.badge,
            )}
          >
            {meta.label}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
          <span>{formatDate(report.date)}</span>
          {report.vendorName && (
            <>
              <span className="text-gray-300">·</span>
              <span>{report.vendorName}</span>
            </>
          )}
          {report.projectName && (
            <>
              <span className="text-gray-300">·</span>
              <span>{report.projectName}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        {report.signedUrl ? (
          <a
            href={report.signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleDownloadClick}
            className="text-brand-teal-500 hover:text-brand-teal-600 hover:bg-brand-teal-50 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all"
          >
            <Download size={14} strokeWidth={1.5} />
            Download
          </a>
        ) : (
          <span className="text-xs text-gray-400 italic">Link unavailable</span>
        )}
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${report.name}`}
          className="rounded-lg p-1.5 text-gray-400 transition-all hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

interface EmptyStateProps {
  onUploadClick: () => void;
}

function EmptyState({ onUploadClick }: EmptyStateProps) {
  return (
    <div className="shadow-card rounded-2xl bg-white p-12 text-center">
      <div className="bg-brand-warm-200 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-gray-400">
        <FileText size={24} strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-gray-900">No reports yet</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
        Upload an inspection or assessment report. Year-end summaries and project updates live
        here too.
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
// Upload modal
// ---------------------------------------------------------------------------

interface UploadModalProps {
  onClose: () => void;
  clientId: string;
  propertyId: string;
  vendors: VendorOption[];
  projects: ProjectOption[];
}

function UploadModal({ onClose, clientId, propertyId, vendors, projects }: UploadModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<ReportType>('inspection');
  const [vendorId, setVendorId] = useState<string>('');
  const [projectId, setProjectId] = useState<string>('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [files, setFiles] = useState<FileUploadItem[]>([]);

  function submit() {
    setError(null);
    if (!name.trim()) {
      setError('Report name is required.');
      return;
    }
    if (files.length === 0) {
      setError('Please add a PDF file.');
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append('file', files[0].file);

      const result = await uploadReport(
        clientId,
        propertyId,
        {
          name: name.trim(),
          type,
          vendorId: vendorId || null,
          projectId: projectId || null,
          date,
        },
        formData,
      );

      if (!result.success) {
        setError(result.error);
        return;
      }

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
            className="rounded-xl px-5 py-2.5 font-medium text-gray-700 transition-all hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending || files.length === 0 || !name.trim()}
            className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft rounded-xl px-5 py-2.5 font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? 'Uploading...' : 'Upload'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Report name" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Annual roof inspection — 2026"
            className={inputClass}
          />
        </Field>

        <Field label="Type" required>
          <div className="grid grid-cols-2 gap-2">
            {REPORT_TYPES.map((t) => {
              const Icon = t.icon;
              const isActive = type === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setType(t.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all',
                    isActive
                      ? 'border-brand-teal-500 bg-brand-teal-50 text-brand-teal-500'
                      : 'hover:border-brand-teal-200 hover:text-brand-teal-500 border-gray-200 text-gray-600',
                  )}
                >
                  <Icon size={14} strokeWidth={1.5} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Vendor" hint="Optional">
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
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

          <Field label="Project" hint="Optional">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className={inputClass}
            >
              <option value="">— None —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="PDF" required hint="One PDF per report. Max 25 MB.">
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
// Delete confirmation
// ---------------------------------------------------------------------------

interface DeleteConfirmModalProps {
  report: ReportRowWithUrl;
  onClose: () => void;
  clientId: string;
}

function DeleteConfirmModal({ report, onClose, clientId }: DeleteConfirmModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await deleteReport(report.id, clientId);
      if (!result.success) {
        setError(result.error);
        return;
      }
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
            className="rounded-xl px-5 py-2.5 font-medium text-gray-700 transition-all hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="shadow-soft rounded-xl bg-red-500 px-5 py-2.5 font-medium text-white transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? 'Deleting...' : 'Delete'}
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-gray-700">
        You&apos;re about to delete <strong className="font-semibold">{report.name}</strong>.
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
