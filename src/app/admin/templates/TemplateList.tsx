'use client';

import {
  FolderPlus,
  ListChecks,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { LoadingDots } from '@/components/admin/LoadingDots';
import { Modal } from '@/components/admin/Modal';
import { useToast } from '@/components/admin/ToastProvider';
import { cn } from '@/lib/utils';
import { deleteTemplate } from './actions';
import type { TemplateListRow } from './queries';

interface Props {
  templates: TemplateListRow[];
}

export function TemplateList({ templates }: Props) {
  const [deleteTarget, setDeleteTarget] = useState<TemplateListRow | null>(null);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="text-sm text-ink-500">
          {templates.length} {templates.length === 1 ? 'template' : 'templates'}
        </div>
        <Link
          href="/admin/templates?mode=builder"
          className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white transition-all duration-150"
        >
          <Plus size={16} strokeWidth={2} />
          New template
        </Link>
      </div>

      {templates.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <TemplateCard key={t.id} template={t} onDelete={() => setDeleteTarget(t)} />
          ))}
        </div>
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          template={deleteTarget}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function TemplateCard({
  template,
  onDelete,
}: {
  template: TemplateListRow;
  onDelete: () => void;
}) {
  const editHref = `/admin/templates?mode=builder&id=${template.id}`;
  const typeBadge =
    template.type === 'maintenance'
      ? 'bg-brand-teal-50 text-brand-teal-500'
      : 'bg-brand-gold-50 text-brand-gold-600';

  return (
    <div className="shadow-soft-md group bg-paper relative overflow-hidden rounded-2xl transition-all hover:shadow-elevated">
      {/* Cover — the whole card is the link target except the actions
          dropdown, which lives above the cover at top-right. */}
      <Link href={editHref} className="block">
        <TemplateCover
          templateId={template.id}
          coverImageUrl={template.coverImageUrl}
        />
      </Link>

      <ActionMenu editHref={editHref} onDelete={onDelete} templateName={template.name} />

      <Link href={editHref} className="block p-5">
        <h3 className="text-ink-900 truncate text-lg font-medium">{template.name}</h3>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-medium', typeBadge)}>
            {template.type === 'maintenance' ? 'Maintenance' : 'Remodel'}
          </span>
          {template.usesPhases ? (
            <span className="bg-brand-teal-50 text-brand-teal-500 rounded-md px-2 py-0.5 text-[11px] font-medium">
              Phased
            </span>
          ) : (
            <span className="bg-cream text-ink-500 rounded-md px-2 py-0.5 text-[11px] font-medium">
              Flat
            </span>
          )}
        </div>

        <div className="text-ink-500 mt-3 flex flex-wrap items-center gap-x-3 text-xs">
          <span className="inline-flex items-center gap-1">
            <ListChecks size={12} strokeWidth={1.5} />
            {template.milestoneCount}{' '}
            {template.milestoneCount === 1 ? 'milestone' : 'milestones'}
          </span>
          {template.duration && <span>· {template.duration}</span>}
        </div>

        {template.description && (
          <p className="text-ink-500 mt-3 line-clamp-2 text-xs leading-relaxed">
            {template.description}
          </p>
        )}
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cover — option image when available, deterministic gradient otherwise.
// ---------------------------------------------------------------------------

interface Palette {
  from: string;
  via: string;
  to: string;
  shape: string;
}

/** Four palettes, deterministic by `hash(templateId) % 4`. Composed from
 *  the existing client-portal cream/amber/teal scale so the templates
 *  surface visually rhymes with the property landing covers without
 *  copying their specific shapes. */
const COVER_PALETTES: ReadonlyArray<Palette> = [
  // 0 — warm cream into amber
  { from: '#FAF4E5', via: '#F4E9D2', to: '#C99A3F', shape: '#B8862E' },
  // 1 — cream into deep teal (dusk)
  { from: '#FBF8F1', via: '#E8F0EF', to: '#1A6863', shape: '#0E3A38' },
  // 2 — ivory into warm gold (morn)
  { from: '#FBF8F1', via: '#F4E9D2', to: '#FAF4E5', shape: '#C99A3F' },
  // 3 — ivory into muted teal (cool)
  { from: '#F7F4ED', via: '#E8F0EF', to: '#14504C', shape: '#1A6863' },
];

function paletteFor(id: string): Palette {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum = (sum + id.charCodeAt(i)) | 0;
  return COVER_PALETTES[Math.abs(sum) % COVER_PALETTES.length]!;
}

function TemplateCover({
  templateId,
  coverImageUrl,
}: {
  templateId: string;
  coverImageUrl: string | null;
}) {
  if (coverImageUrl) {
    return (
      <div className="bg-cream relative aspect-[16/9] w-full overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverImageUrl}
          alt=""
          className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
          loading="lazy"
        />
      </div>
    );
  }

  // Gradient fallback — same diagonal-with-shapes pattern as the property
  // landing covers, keyed off the template id.
  const palette = paletteFor(templateId);
  return (
    <div
      className="relative aspect-[16/9] w-full overflow-hidden"
      role="img"
      aria-label="Template cover"
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(135deg, ${palette.from} 0%, ${palette.via} 55%, ${palette.to} 100%)`,
        }}
      />
      <svg
        viewBox="0 0 400 240"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <circle cx="320" cy="60" r="80" fill={palette.shape} fillOpacity="0.18" />
        <circle cx="80" cy="200" r="60" fill={palette.shape} fillOpacity="0.12" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Three-dot action menu — Edit / Delete behind a popover so the card
// front face stays clean.
// ---------------------------------------------------------------------------

function ActionMenu({
  editHref,
  onDelete,
  templateName,
}: {
  editHref: string;
  onDelete: () => void;
  templateName: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="absolute right-3 top-3 z-10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${templateName}`}
        className="bg-paper/85 hover:bg-paper text-ink-700 inline-flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition-colors"
      >
        <MoreVertical size={16} strokeWidth={1.5} />
      </button>
      {open && (
        <div
          role="menu"
          className="border-line bg-paper shadow-soft-md absolute right-0 top-full mt-1 w-44 overflow-hidden rounded-xl border py-1"
        >
          <Link
            href={editHref}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="text-ink-700 hover:bg-cream hover:text-ink-900 flex items-center gap-2 px-3 py-2 text-sm transition-colors"
          >
            <Pencil size={14} strokeWidth={1.5} className="text-ink-400" />
            Edit
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
          >
            <Trash2 size={14} strokeWidth={1.5} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="shadow-soft-md rounded-2xl bg-paper p-12 text-center">
      <div className="bg-cream mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-ink-400">
        <FolderPlus size={24} strokeWidth={1.5} />
      </div>
      <h3 className="text-ink-900 text-base font-semibold">No project templates yet</h3>
      <p className="text-ink-500 mx-auto mt-2 max-w-sm text-sm">
        Templates let you pre-define phases and milestones for common projects — create one to
        start saving time.
      </p>
      <Link
        href="/admin/templates?mode=builder"
        className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white transition-all"
      >
        <Plus size={16} />
        New template
      </Link>
    </div>
  );
}

function DeleteConfirmModal({
  template,
  onClose,
}: {
  template: TemplateListRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await deleteTemplate(template.id);
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast('Template deleted');
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Delete template?"
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
        You&apos;re about to delete{' '}
        <strong className="font-semibold">{template.name}</strong>.
      </p>
      <p className="text-sm text-gray-500">
        Projects already created from this template keep their own milestones — they&apos;re
        copies, not references.
      </p>
      {error && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}
    </Modal>
  );
}
