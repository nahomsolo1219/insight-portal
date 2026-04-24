'use client';

import {
  Download,
  File as FileIcon,
  FileBox,
  FileText,
  Plus,
  ScrollText,
  Shield,
  Trash2,
  Upload,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Field, inputClass } from '@/components/admin/Field';
import { FileUpload, type FileUploadItem } from '@/components/admin/FileUpload';
import { LoadingDots } from '@/components/admin/LoadingDots';
import { Modal } from '@/components/admin/Modal';
import { useToast } from '@/components/admin/ToastProvider';
import { cn, formatDate } from '@/lib/utils';
import { deleteDocument, uploadDocuments, type DocumentType } from './documents-actions';
import type { DocumentRow, ProjectOption } from './queries';

export type DocumentRowWithUrl = DocumentRow & { signedUrl: string | null };

interface DocumentTypeOption {
  id: DocumentType;
  label: string;
  icon: LucideIcon;
}

const DOCUMENT_TYPES: readonly DocumentTypeOption[] = [
  { id: 'contract', label: 'Contract', icon: FileText },
  { id: 'drawing', label: 'Drawing', icon: FileBox },
  { id: 'permit', label: 'Permit', icon: ScrollText },
  { id: 'spec_sheet', label: 'Spec Sheet', icon: Wrench },
  { id: 'warranty', label: 'Warranty', icon: Shield },
  { id: 'other', label: 'Other', icon: FileIcon },
] as const;

interface DocTypeIconProps {
  type: string;
  size?: number;
}

/**
 * Renders the right lucide icon for a given document type. Wrapping the
 * lookup in an actual component instead of `const Icon = iconForType(...)`
 * satisfies the react-hooks/static-components rule — the component is
 * declared once at module scope, not created during render.
 */
function DocTypeIcon({ type, size = 18 }: DocTypeIconProps) {
  const match = DOCUMENT_TYPES.find((t) => t.id === type);
  const Icon = match?.icon ?? FileIcon;
  return <Icon size={size} strokeWidth={1.5} />;
}

function labelForType(type: string): string {
  return DOCUMENT_TYPES.find((t) => t.id === type)?.label ?? 'Other';
}

interface DocumentsTabClientProps {
  clientId: string;
  documents: DocumentRowWithUrl[];
  projects: ProjectOption[];
}

export function DocumentsTabClient({
  clientId,
  documents,
  projects,
}: DocumentsTabClientProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DocumentRowWithUrl | null>(null);

  // Group for display by project while preserving the server's sort order.
  const grouped = useMemo(() => {
    const map = new Map<string, { projectName: string; docs: DocumentRowWithUrl[] }>();
    for (const doc of documents) {
      const existing = map.get(doc.projectId);
      if (existing) existing.docs.push(doc);
      else map.set(doc.projectId, { projectName: doc.projectName, docs: [doc] });
    }
    return map;
  }, [documents]);

  const hasProjects = projects.length > 0;

  return (
    <div>
      {/* Header: count + upload CTA */}
      <div className="mb-5 flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {documents.length} {documents.length === 1 ? 'document' : 'documents'}
        </div>
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          disabled={!hasProjects}
          title={hasProjects ? undefined : 'Add a project first'}
          className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload size={16} strokeWidth={2} />
          Upload documents
        </button>
      </div>

      {documents.length === 0 ? (
        <EmptyState hasProjects={hasProjects} onUploadClick={() => setUploadOpen(true)} />
      ) : (
        <div className="space-y-5">
          {Array.from(grouped.entries()).map(([projectId, group]) => (
            <div key={projectId} className="shadow-card overflow-hidden rounded-2xl bg-white">
              <div className="bg-brand-warm-50 border-b border-gray-100 px-5 py-4">
                <h3 className="text-sm font-semibold text-gray-900">{group.projectName}</h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  {group.docs.length} {group.docs.length === 1 ? 'file' : 'files'}
                </p>
              </div>
              <div>
                {group.docs.map((doc) => (
                  <DocumentRowItem
                    key={doc.id}
                    doc={doc}
                    onDelete={() => setDeleteTarget(doc)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {uploadOpen && (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          clientId={clientId}
          projects={projects}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          doc={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          clientId={clientId}
        />
      )}
    </div>
  );
}

interface DocumentRowItemProps {
  doc: DocumentRowWithUrl;
  onDelete: () => void;
}

function DocumentRowItem({ doc, onDelete }: DocumentRowItemProps) {
  return (
    <div className="hover:bg-brand-warm-50 flex items-center gap-4 border-t border-gray-50 px-5 py-4 transition-colors first:border-t-0">
      <div className="bg-brand-warm-100 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-gray-500">
        <DocTypeIcon type={doc.type} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-900">{doc.name}</div>
        <div className="mt-0.5 text-xs text-gray-500">
          {labelForType(doc.type)} · {formatDate(doc.date)}
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        {doc.signedUrl ? (
          <a
            href={doc.signedUrl}
            target="_blank"
            rel="noopener noreferrer"
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
          aria-label={`Delete ${doc.name}`}
          className="rounded-lg p-1.5 text-gray-400 transition-all hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

interface EmptyStateProps {
  hasProjects: boolean;
  onUploadClick: () => void;
}

function EmptyState({ hasProjects, onUploadClick }: EmptyStateProps) {
  return (
    <div className="shadow-card rounded-2xl bg-white p-12 text-center">
      <div className="bg-brand-warm-200 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-gray-400">
        <FileBox size={24} strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-gray-900">No documents yet</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
        {hasProjects
          ? 'Upload contracts, drawings, permits, and spec sheets here. They stay tied to their project.'
          : 'Create a project first — documents attach to projects.'}
      </p>
      {hasProjects && (
        <button
          type="button"
          onClick={onUploadClick}
          className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white transition-all"
        >
          <Plus size={16} />
          Upload documents
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload modal
// ---------------------------------------------------------------------------

interface UploadModalProps {
  onClose: () => void;
  clientId: string;
  projects: ProjectOption[];
}

function UploadModal({ onClose, clientId, projects }: UploadModalProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState(() => projects[0]?.id ?? '');
  const [documentType, setDocumentType] = useState<DocumentType>('contract');
  const [files, setFiles] = useState<FileUploadItem[]>([]);

  function submit() {
    setError(null);

    if (!projectId) {
      setError('Please select a project.');
      return;
    }
    if (files.length === 0) {
      setError('Please add at least one file.');
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      for (const item of files) formData.append('files', item.file);

      const result = await uploadDocuments(clientId, projectId, documentType, formData);
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }

      const { uploadedCount, failedCount, errors } = result.data!;

      if (uploadedCount === 0) {
        // Everything failed — surface the first error; the rest land in the console.
        const msg = errors[0]?.error
          ? `Upload failed: ${errors[0].error}`
          : `Upload failed for all ${failedCount} file${failedCount === 1 ? '' : 's'}.`;
        setError(msg);
        showToast(msg, 'error');
        return;
      }

      if (failedCount > 0) {
        // Partial success — leave the modal open so the user can see what didn't land.
        const firstFailed = errors[0];
        const msg =
          `${uploadedCount} uploaded · ${failedCount} failed` +
          (firstFailed ? ` — ${firstFailed.name}: ${firstFailed.error}` : '');
        setError(msg);
        showToast(msg, 'error');
        router.refresh(); // still refresh so the successful ones appear underneath
        return;
      }

      showToast(
        uploadedCount === 1
          ? 'Document uploaded'
          : `${uploadedCount} documents uploaded`,
      );
      onClose();
      router.refresh();
    });
  }

  const uploadLabel =
    files.length === 0 ? 'Upload' : `Upload ${files.length}`;

  return (
    <Modal
      open
      onClose={onClose}
      title="Upload documents"
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
            disabled={isPending || files.length === 0 || !projectId}
            className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft rounded-xl px-5 py-2.5 font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? (
              <>
                Uploading {files.length}
                <LoadingDots />
              </>
            ) : (
              uploadLabel
            )}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Project" required>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={inputClass}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Document type" required>
          <div className="grid grid-cols-3 gap-2">
            {DOCUMENT_TYPES.map((t) => {
              const isActive = documentType === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDocumentType(t.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all',
                    isActive
                      ? 'border-brand-teal-500 bg-brand-teal-50 text-brand-teal-500'
                      : 'hover:border-brand-teal-200 hover:text-brand-teal-500 border-gray-200 text-gray-600',
                  )}
                >
                  <DocTypeIcon type={t.id} size={14} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field
          label="Files"
          required
          hint="Drag and drop, or click to browse. Multiple files supported."
        >
          <FileUpload
            kind="any"
            multiple
            maxFiles={20}
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
  doc: DocumentRowWithUrl;
  onClose: () => void;
  clientId: string;
}

function DeleteConfirmModal({ doc, onClose, clientId }: DeleteConfirmModalProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await deleteDocument(doc.id, clientId);
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
            onClick={submit}
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
      <p className="mb-3 text-sm text-gray-700">
        You&apos;re about to delete <strong className="font-semibold">{doc.name}</strong>.
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
