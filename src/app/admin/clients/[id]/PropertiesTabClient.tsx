'use client';

import {
  Briefcase,
  ChevronDown,
  ChevronRight,
  Home,
  Image as ImageIcon,
  Pencil,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { PropertyCover } from '@/components/portal/PropertyCover';
import { Field, inputClass, textareaClass } from '@/components/admin/Field';
import { LoadingDots } from '@/components/admin/LoadingDots';
import { Modal } from '@/components/admin/Modal';
import { useToast } from '@/components/admin/ToastProvider';
import { cn } from '@/lib/utils';
import { AddPropertyButton } from './AddPropertyButton';
import {
  deleteProperty,
  removePropertyCoverPhoto,
  updateProperty,
  uploadPropertyCoverPhoto,
} from './actions';
import type { PropertyDetailedRow, PropertyProjectRow } from './queries';

const COVER_MAX_BYTES = 8 * 1024 * 1024;

interface Props {
  clientId: string;
  properties: PropertyDetailedRow[];
  /** From the property switcher — matching card auto-expands on first render. */
  activePropertyId: string | null;
}

/**
 * Properties tab — list every property for the client with expand-to-edit.
 * The list, edit modal, and delete-with-confirmation modal all live here so
 * a property can be fully managed without leaving the tab.
 *
 * The active property from the URL switcher pre-expands the matching card
 * on first render so deep-linking from the switcher feels seamless. Manual
 * toggles after that take precedence — we don't fight the user's intent.
 */
export function PropertiesTabClient({ clientId, properties, activePropertyId }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (activePropertyId && properties.some((p) => p.id === activePropertyId)) {
      initial.add(activePropertyId);
    }
    return initial;
  });
  const [editTarget, setEditTarget] = useState<PropertyDetailedRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PropertyDetailedRow | null>(null);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (properties.length === 0) {
    return (
      <div className="flex justify-center">
        <div className="w-full max-w-md">
          <AddPropertyButton clientId={clientId} variant="cta" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {properties.length} {properties.length === 1 ? 'property' : 'properties'}
        </div>
        <AddPropertyButton clientId={clientId} variant="inline" />
      </div>

      <div className="space-y-3">
        {properties.map((p) => (
          <PropertyCard
            key={p.id}
            property={p}
            isOpen={expanded.has(p.id)}
            onToggle={() => toggle(p.id)}
            onEdit={() => setEditTarget(p)}
            onDelete={() => setDeleteTarget(p)}
          />
        ))}
      </div>

      {editTarget && (
        <EditPropertyModal
          property={editTarget}
          clientId={clientId}
          onClose={() => setEditTarget(null)}
        />
      )}
      {deleteTarget && (
        <DeletePropertyModal
          property={deleteTarget}
          clientId={clientId}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Property card
// ---------------------------------------------------------------------------

interface PropertyCardProps {
  property: PropertyDetailedRow;
  isOpen: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function PropertyCard({ property, isOpen, onToggle, onEdit, onDelete }: PropertyCardProps) {
  const cityState = [property.city, property.state].filter(Boolean).join(', ');
  const fullAddress = [property.address, cityState, property.zipcode]
    .filter(Boolean)
    .join(', ');

  const subtitleParts: string[] = [];
  if (property.sqft) subtitleParts.push(`${property.sqft.toLocaleString()} sqft`);
  if (property.yearBuilt) subtitleParts.push(`Built ${property.yearBuilt}`);

  return (
    <div className="shadow-soft-md overflow-hidden rounded-2xl bg-paper">
      {/* Header — click anywhere on this strip to toggle. The Edit button
          stops propagation so it doesn't double-fire as a toggle. */}
      <button
        type="button"
        onClick={onToggle}
        className="hover:bg-brand-warm-50 flex w-full items-start gap-4 p-5 text-left transition-colors"
        aria-expanded={isOpen}
      >
        <div className="bg-brand-teal-50 text-brand-teal-500 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl">
          <Home size={18} strokeWidth={1.5} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-base font-semibold text-gray-900">{property.name}</h3>
            <span className="text-xs text-gray-400">
              {property.projectCount} {property.projectCount === 1 ? 'project' : 'projects'}
            </span>
          </div>
          <div className="mt-0.5 truncate text-sm text-gray-500">{fullAddress}</div>
          {subtitleParts.length > 0 && (
            <div className="mt-0.5 truncate text-xs text-gray-400">
              {subtitleParts.join(' · ')}
            </div>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          <span
            // Delegated edit button: rendered as a span with role=button so
            // the click handler can stopPropagation without nested-button
            // markup. Same pattern used elsewhere on this page.
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onEdit();
              }
            }}
            className="text-brand-teal-500 hover:text-brand-teal-600 hover:bg-brand-teal-50 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all"
          >
            <Pencil size={13} strokeWidth={1.5} />
            Edit
          </span>
          {isOpen ? (
            <ChevronDown size={16} strokeWidth={1.5} className="text-gray-400" />
          ) : (
            <ChevronRight size={16} strokeWidth={1.5} className="text-gray-400" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-line-2 px-5 py-4">
          <PropertyDetails property={property} />
          <ProjectsList projects={property.projects} />
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 transition-all hover:bg-red-50"
            >
              <Trash2 size={12} strokeWidth={1.75} />
              Delete property
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PropertyDetails({ property }: { property: PropertyDetailedRow }) {
  const rows: Array<{ label: string; value: React.ReactNode; mono?: boolean }> = [];
  if (property.gateCode) rows.push({ label: 'Gate code', value: property.gateCode, mono: true });
  if (property.emergencyContact)
    rows.push({ label: 'Emergency', value: property.emergencyContact });
  if (property.accessNotes)
    rows.push({
      label: 'Access notes',
      value: <span className="whitespace-pre-wrap">{property.accessNotes}</span>,
    });

  if (rows.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic">
        No additional details on file. Click Edit to add gate code, emergency contact, or
        access notes.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <h4 className="text-[11px] font-semibold tracking-wider text-gray-500 uppercase">
        Details
      </h4>
      <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-xs font-medium text-gray-500">{r.label}</dt>
            <dd className={cn('text-gray-700', r.mono && 'font-mono text-xs')}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ProjectsList({ projects }: { projects: PropertyProjectRow[] }) {
  return (
    <div className="mt-5">
      <h4 className="mb-2 text-[11px] font-semibold tracking-wider text-gray-500 uppercase">
        Projects at this property
      </h4>
      {projects.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No projects yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {projects.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-lg bg-brand-warm-50 px-3 py-2 text-sm"
            >
              <Briefcase size={12} strokeWidth={1.5} className="text-gray-400" />
              <span className="min-w-0 flex-1 truncate font-medium text-gray-700">
                {p.name}
              </span>
              <span className="text-xs text-gray-500">
                {p.status === 'active' ? 'Active' : p.status === 'completed' ? 'Complete' : 'On hold'}
                {' · '}
                <span className="tabular-nums">{p.progress}%</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit modal
// ---------------------------------------------------------------------------

type StatusTone = 'green' | 'amber' | 'neutral' | 'rose';

interface EditFormState {
  name: string;
  address: string;
  city: string;
  state: string;
  zipcode: string;
  sqft: string;
  yearBuilt: string;
  bedrooms: string;
  bathrooms: string;
  region: string;
  statusLabel: string;
  statusTone: StatusTone;
  gateCode: string;
  emergencyContact: string;
  accessNotes: string;
}

const STATUS_TONE_OPTIONS: { value: StatusTone; label: string }[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'green', label: 'Green' },
  { value: 'amber', label: 'Amber' },
  { value: 'rose', label: 'Rose' },
];

// Editorial chip palette — mirrors the Phase 0 client-portal CSS vars
// (--teal-* / --amber-* / cream / muted rose). Hardcoded as utility
// classes here so the chip is self-contained in admin and doesn't
// depend on a portal-only stylesheet.
const STATUS_CHIP_TONE: Record<StatusTone, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
  amber: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
  neutral: 'bg-paper text-ink-700 ring-1 ring-line',
  rose: 'bg-rose-50 text-rose-700 ring-1 ring-rose-100',
};

function EditPropertyModal({
  property,
  clientId,
  onClose,
}: {
  property: PropertyDetailedRow;
  clientId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<EditFormState>({
    name: property.name,
    address: property.address,
    city: property.city ?? '',
    state: property.state ?? '',
    zipcode: property.zipcode ?? '',
    sqft: property.sqft != null ? property.sqft.toString() : '',
    yearBuilt: property.yearBuilt != null ? property.yearBuilt.toString() : '',
    bedrooms: property.bedrooms != null ? property.bedrooms.toString() : '',
    bathrooms: property.bathrooms ?? '',
    region: property.region ?? '',
    statusLabel: property.statusLabel ?? '',
    statusTone: property.statusTone ?? 'neutral',
    gateCode: property.gateCode ?? '',
    emergencyContact: property.emergencyContact ?? '',
    accessNotes: property.accessNotes ?? '',
  });

  function submit() {
    setError(null);
    if (!form.name.trim()) return setError('Property name is required.');
    if (!form.address.trim()) return setError('Address is required.');
    if (!form.city.trim()) return setError('City is required.');
    if (!form.state.trim()) return setError('State is required.');

    const sqftNum = form.sqft.trim() ? Number(form.sqft) : null;
    const yearNum = form.yearBuilt.trim() ? Number(form.yearBuilt) : null;
    const bedroomsNum = form.bedrooms.trim() ? Number(form.bedrooms) : null;
    const bathroomsNum = form.bathrooms.trim() ? Number(form.bathrooms) : null;
    if (sqftNum !== null && (!Number.isFinite(sqftNum) || sqftNum < 0)) {
      return setError('Square footage must be a positive number.');
    }
    if (yearNum !== null && (!Number.isFinite(yearNum) || yearNum < 1800 || yearNum > 2100)) {
      return setError('Year built must be a real year.');
    }
    if (
      bedroomsNum !== null &&
      (!Number.isFinite(bedroomsNum) || bedroomsNum < 0 || !Number.isInteger(bedroomsNum))
    ) {
      return setError('Bedrooms must be a whole number.');
    }
    if (bathroomsNum !== null && (!Number.isFinite(bathroomsNum) || bathroomsNum < 0)) {
      return setError('Bathrooms must be a positive number.');
    }

    startTransition(async () => {
      const result = await updateProperty(property.id, clientId, {
        name: form.name,
        address: form.address,
        city: form.city,
        state: form.state.toUpperCase(),
        zipcode: form.zipcode || undefined,
        sqft: sqftNum,
        yearBuilt: yearNum,
        bedrooms: bedroomsNum,
        bathrooms: bathroomsNum,
        region: form.region || undefined,
        statusLabel: form.statusLabel || undefined,
        statusTone: form.statusLabel.trim() ? form.statusTone : undefined,
        gateCode: form.gateCode || undefined,
        emergencyContact: form.emergencyContact || undefined,
        accessNotes: form.accessNotes || undefined,
      });
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast('Property updated');
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${property.name}`}
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
        <CoverPhotoSection property={property} />

        <Field label="Property name" required>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Street address" required>
          <input
            type="text"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className={inputClass}
          />
        </Field>
        <div className="grid grid-cols-[2fr_1fr_1fr] gap-3">
          <Field label="City" required>
            <input
              type="text"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="State" required>
            <input
              type="text"
              value={form.state}
              onChange={(e) =>
                setForm({ ...form, state: e.target.value.slice(0, 2).toUpperCase() })
              }
              maxLength={2}
              className={inputClass}
            />
          </Field>
          <Field label="Zip">
            <input
              type="text"
              value={form.zipcode}
              onChange={(e) => setForm({ ...form, zipcode: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="space-y-4 rounded-2xl border border-line-2 bg-brand-warm-50 p-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Property details</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Surfaced on the client&rsquo;s portal landing card.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Square footage">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={form.sqft}
                onChange={(e) => setForm({ ...form, sqft: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Bedrooms">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={form.bedrooms}
                onChange={(e) => setForm({ ...form, bedrooms: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Bathrooms">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.5}
                value={form.bathrooms}
                onChange={(e) => setForm({ ...form, bathrooms: e.target.value })}
                className={inputClass}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Year built">
              <input
                type="number"
                inputMode="numeric"
                min={1800}
                max={2100}
                value={form.yearBuilt}
                onChange={(e) => setForm({ ...form, yearBuilt: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Region" hint="e.g. Pacific Heights, Sea Cliff.">
              <input
                type="text"
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                className={inputClass}
              />
            </Field>
          </div>
          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <Field
              label="Status label"
              hint="Optional chip on the landing card. Leave blank to hide."
            >
              <input
                type="text"
                value={form.statusLabel}
                maxLength={40}
                placeholder="e.g. Project active"
                onChange={(e) => setForm({ ...form, statusLabel: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Tone">
              <select
                value={form.statusTone}
                onChange={(e) =>
                  setForm({ ...form, statusTone: e.target.value as StatusTone })
                }
                className={inputClass}
              >
                {STATUS_TONE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {form.statusLabel.trim() && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Preview:</span>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
                  STATUS_CHIP_TONE[form.statusTone],
                )}
              >
                {form.statusLabel.trim()}
              </span>
            </div>
          )}
        </div>
        <Field label="Gate code">
          <input
            type="text"
            value={form.gateCode}
            onChange={(e) => setForm({ ...form, gateCode: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Emergency contact">
          <input
            type="text"
            value={form.emergencyContact}
            onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Access notes">
          <textarea
            value={form.accessNotes}
            onChange={(e) => setForm({ ...form, accessNotes: e.target.value })}
            rows={3}
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
// Cover photo section — sits at the top of the EditPropertyModal body.
// First UI surface built on the Phase 0 client-portal tokens (cream,
// line, ink-*) so the editorial aesthetic gets a real-world test.
// ---------------------------------------------------------------------------

function CoverPhotoSection({ property }: { property: PropertyDetailedRow }) {
  const router = useRouter();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [isUploading, startUpload] = useTransition();
  const [isRemoving, startRemove] = useTransition();

  // Revoke the local Object URL on unmount or when the pending file
  // is replaced — leaks here add up across many open/close cycles.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function pickFile(file: File | null) {
    setError(null);
    if (!file) {
      setPending(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Cover photo must be an image.');
      return;
    }
    if (file.size > COVER_MAX_BYTES) {
      setError('Cover photo must be 8 MB or smaller.');
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPending(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    pickFile(file);
  }

  function commit() {
    if (!pending) return;
    const formData = new FormData();
    formData.append('file', pending);
    startUpload(async () => {
      const result = await uploadPropertyCoverPhoto(property.id, formData);
      if (!result.ok) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast('Cover photo updated');
      // Drop the local preview — the server-rendered preview will pick
      // up the new URL on the next refresh.
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPending(null);
      setPreviewUrl(null);
      router.refresh();
    });
  }

  function remove() {
    startRemove(async () => {
      const result = await removePropertyCoverPhoto(property.id);
      if (!result.ok) {
        showToast(result.error, 'error');
        return;
      }
      showToast('Cover photo removed');
      setConfirmRemoveOpen(false);
      router.refresh();
    });
  }

  // ---- Render branches ----

  // Local-preview state (a file is staged but not yet uploaded).
  if (pending && previewUrl) {
    return (
      <div className="border-line space-y-3 rounded-2xl border bg-cream p-4">
        <SectionHeader />
        <div className="bg-paper border-line-2 relative aspect-[16/9] overflow-hidden rounded-2xl border">
          {/* Local preview — plain <img> is correct here (Object URL,
              not a remote URL Next/Image can optimize). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={`Selected cover for ${property.name}`}
            className="h-full w-full object-cover"
          />
        </div>
        {error && (
          <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => pickFile(null)}
            disabled={isUploading}
            className="text-ink-700 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors hover:bg-paper disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={commit}
            disabled={isUploading}
            className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUploading ? (
              <>
                Uploading
                <LoadingDots />
              </>
            ) : (
              <>
                <Upload size={14} strokeWidth={1.75} />
                Upload
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // Existing-cover state (a real cover lives on the property).
  if (property.coverPhotoUrl) {
    return (
      <>
        <div className="border-line space-y-3 rounded-2xl border bg-cream p-4">
          <SectionHeader />
          <PropertyCover
            propertyId={property.id}
            coverPhotoUrl={property.coverPhotoUrl}
            uploadedAt={property.coverPhotoUploadedAt}
            alt={`Cover photo for ${property.name}`}
            className="border-line-2 relative aspect-[16/9] overflow-hidden rounded-2xl border"
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmRemoveOpen(true)}
              disabled={isRemoving || isUploading}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              <X size={14} strokeWidth={1.75} />
              Remove
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isRemoving || isUploading}
              className="text-ink-700 border-line hover:border-ink-400 inline-flex items-center gap-1.5 rounded-xl border bg-paper px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Upload size={14} strokeWidth={1.75} />
              Replace
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        <Modal
          open={confirmRemoveOpen}
          onClose={() => setConfirmRemoveOpen(false)}
          title="Remove this cover photo?"
          size="sm"
          locked={isRemoving}
          footer={
            <>
              <button
                type="button"
                onClick={() => setConfirmRemoveOpen(false)}
                disabled={isRemoving}
                className="bg-paper border border-line text-ink-700 hover:bg-cream rounded-lg px-4 py-2.5 font-medium transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={isRemoving}
                className="bg-rose-600 hover:bg-rose-700 text-paper inline-flex items-center gap-2 rounded-lg px-4 py-2.5 font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isRemoving ? (
                  <>
                    Removing
                    <LoadingDots />
                  </>
                ) : (
                  'Remove'
                )}
              </button>
            </>
          }
        >
          <p className="text-sm text-gray-600">
            Remove this cover photo? You can re-upload at any time.
          </p>
        </Modal>
      </>
    );
  }

  // Empty-state drop zone.
  return (
    <div className="space-y-2">
      <SectionHeader />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className={cn(
          'flex aspect-[16/9] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed bg-cream p-6 text-center transition-all',
          dragOver
            ? 'border-ink-700 bg-ivory'
            : 'border-line hover:border-ink-400 hover:bg-ivory',
        )}
      >
        <span className="bg-paper text-ink-500 inline-flex h-10 w-10 items-center justify-center rounded-full">
          <ImageIcon size={18} strokeWidth={1.5} />
        </span>
        <p className="text-ink-700 text-sm font-medium">
          Drop a photo here, or click to browse
        </p>
        <p className="text-ink-500 text-xs">JPEG, PNG, or WebP — up to 8 MB</p>
      </div>
      {error && (
        <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </p>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

function SectionHeader() {
  return (
    <div className="flex items-baseline justify-between">
      <h3 className="eyebrow">Cover photo</h3>
      <span className="text-ink-400 text-[11px]">Optional</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete modal — type-the-name confirmation
// ---------------------------------------------------------------------------

function DeletePropertyModal({
  property,
  clientId,
  onClose,
}: {
  property: PropertyDetailedRow;
  clientId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState('');

  // Echo-the-name pattern (à la GitHub) — case-insensitive trim match
  // because asking for exact case feels like a UX trap. The server
  // re-checks the same way as a defense in depth.
  const matches = confirm.trim().toLowerCase() === property.name.trim().toLowerCase();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await deleteProperty(property.id, clientId, confirm);
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast('Property deleted');
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Delete ${property.name}?`}
      size="md"
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
            disabled={isPending || !matches}
            className="bg-rose-600 hover:bg-rose-700 text-paper rounded-lg px-4 py-2.5 font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? (
              <>
                Deleting
                <LoadingDots />
              </>
            ) : (
              'Delete permanently'
            )}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">This will also delete:</p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-red-600">
            <li>
              {property.projectCount} {property.projectCount === 1 ? 'project' : 'projects'} +
              all of their milestones
            </li>
            <li>Every appointment, photo, document, and report on this property</li>
            <li>Invoices stay attached to the client (their property link goes null)</li>
          </ul>
          <p className="mt-2 font-medium">This cannot be undone.</p>
        </div>

        <Field
          label={`Type "${property.name}" to confirm`}
          hint="Case-insensitive."
        >
          <input
            type="text"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={property.name}
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
