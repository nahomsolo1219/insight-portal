'use client';

import { Layers, Plus, Sparkles, Users } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Field, inputClass, textareaClass } from '@/components/admin/Field';
import { LoadingDots } from '@/components/admin/LoadingDots';
import { Modal } from '@/components/admin/Modal';
import { useToast } from '@/components/admin/ToastProvider';
import { cn } from '@/lib/utils';
import { createProject } from './actions';
import type { TemplateOption } from './queries';
import type { FieldStaffPickerRow } from '../../projects/[id]/queries';

interface PropertyOption {
  id: string;
  name: string;
}

interface Props {
  clientId: string;
  properties: PropertyOption[];
  templates: TemplateOption[];
  fieldStaff: FieldStaffPickerRow[];
  /** Active property in the URL — used as the default when multiple exist. */
  activePropertyId: string | null;
}

interface FormState {
  propertyId: string;
  useTemplate: boolean;
  templateId: string;
  name: string;
  type: 'maintenance' | 'remodel';
  startDate: string;
  endDate: string;
  description: string;
  /** Free-text dollars input — parsed to cents at submit. */
  contractInput: string;
  /** Profile ids of field staff to assign at create time. */
  assignedStaffIds: string[];
}

function emptyForm(activePropertyId: string | null, fallbackPropertyId: string): FormState {
  return {
    propertyId: activePropertyId || fallbackPropertyId,
    useTemplate: false,
    templateId: '',
    name: '',
    type: 'maintenance',
    startDate: today(),
    endDate: '',
    description: '',
    contractInput: '',
    assignedStaffIds: [],
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Add `days` to a YYYY-MM-DD date and return YYYY-MM-DD. Used to auto-
 * compute the end date from a phased template's total duration so David
 * doesn't have to do the arithmetic manually.
 */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map((s) => Number.parseInt(s, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return '';
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = (dt.getMonth() + 1).toString().padStart(2, '0');
  const dd = dt.getDate().toString().padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** dollars-or-"$1,234.56" → integer cents. Same parser used by invoices. */
function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[\s,$]/g, '');
  if (!cleaned) return null;
  const dollars = Number.parseFloat(cleaned);
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  return Math.round(dollars * 100);
}

/**
 * Create-Project modal. Auto-opens when the URL has `?action=new-project`
 * — the dashboard's "+ New Project" button + client selector funnels
 * through here, so landing on the project tab with the modal already up
 * means David can finish the flow in one click instead of two.
 */
export function NewProjectButton({
  clientId,
  properties,
  templates,
  fieldStaff,
  activePropertyId,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  // Auto-open driver: when the dashboard's "+ New Project" client picker
  // sends us here with `?action=new-project`, the modal should be open on
  // the first render. Reading search params in a useState initialiser
  // gates this to mount-time only — closing the modal then re-rendering
  // (because of optimistic updates, refetches, etc.) won't pop it back
  // open. `react-hooks/set-state-in-effect` is happy because there's no
  // effect+setState pair.
  const [open, setOpen] = useState(
    () => searchParams.get('action') === 'new-project' && properties.length > 0,
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() =>
    emptyForm(activePropertyId, properties[0]?.id ?? ''),
  );

  function close() {
    setOpen(false);
    setForm(emptyForm(activePropertyId, properties[0]?.id ?? ''));
    setError(null);
  }

  const selectedTemplate = useMemo(
    () => (form.useTemplate && form.templateId ? templates.find((t) => t.id === form.templateId) ?? null : null),
    [form.useTemplate, form.templateId, templates],
  );

  /**
   * Apply a template's metadata to the form: name, type, description,
   * and end date (computed from start + total estimated days). We only
   * overwrite the name if it's currently empty — David might have typed
   * something custom before deciding to use a template.
   */
  function applyTemplateToForm(templateId: string) {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    setForm((prev) => ({
      ...prev,
      templateId,
      type: tpl.type,
      name: prev.name.trim() ? prev.name : tpl.name,
      description: prev.description.trim() ? prev.description : tpl.description ?? '',
      endDate:
        tpl.totalEstimatedDays && prev.startDate
          ? addDays(prev.startDate, tpl.totalEstimatedDays)
          : prev.endDate,
    }));
  }

  function handleStartDateChange(next: string) {
    setForm((prev) => {
      // If a phased template is selected, slide the end date with the
      // start date so the project's window stays the right length.
      const tpl = prev.templateId ? templates.find((t) => t.id === prev.templateId) : null;
      const newEnd =
        tpl?.totalEstimatedDays && next ? addDays(next, tpl.totalEstimatedDays) : prev.endDate;
      return { ...prev, startDate: next, endDate: newEnd };
    });
  }

  function submit() {
    setError(null);
    if (!form.propertyId) return setError('Pick a property.');
    if (!form.name.trim()) return setError('Project name is required.');
    if (!form.startDate) return setError('Start date is required.');

    let contractCents: number | null = null;
    if (form.type === 'remodel' && form.contractInput.trim()) {
      const parsed = parseDollarsToCents(form.contractInput);
      if (parsed === null) return setError('Contract amount must be a positive number.');
      contractCents = parsed;
    }

    startTransition(async () => {
      const result = await createProject(clientId, {
        propertyId: form.propertyId,
        name: form.name,
        type: form.type,
        startDate: form.startDate,
        endDate: form.endDate || null,
        description: form.description || null,
        contractCents,
        templateId: form.useTemplate && form.templateId ? form.templateId : null,
        assignedStaffIds: form.assignedStaffIds,
      });

      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }

      showToast('Project created');
      close();
      // Strip the `?action=new-project` flag so the modal doesn't pop on
      // the next render.
      router.replace(`/admin/clients/${clientId}?property=${form.propertyId}`);
      router.refresh();
    });
  }

  const disabled = properties.length === 0;
  const filteredTemplates = templates.filter((t) => t.type === form.type);

  return (
    <>
      <button
        type="button"
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        title={disabled ? 'Add a property first' : 'Create a new project'}
        className={cn(
          'bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white transition-all duration-150',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <Plus size={16} strokeWidth={2} />
        New Project
      </button>

      <Modal
        open={open}
        onClose={close}
        title="New project"
        size="lg"
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
                  Creating
                  <LoadingDots />
                </>
              ) : (
                'Create project'
              )}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <Field label="Property" required hint={properties.length === 0 ? 'Add a property to this client first' : undefined}>
            <select
              value={form.propertyId}
              onChange={(e) => setForm({ ...form, propertyId: e.target.value })}
              disabled={properties.length <= 1}
              className={inputClass}
            >
              {properties.length === 0 && <option value="">— No properties —</option>}
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="rounded-xl border border-line-2 bg-brand-warm-50 p-4">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={form.useTemplate}
                onChange={(e) => {
                  const useTemplate = e.target.checked;
                  setForm((prev) => ({
                    ...prev,
                    useTemplate,
                    templateId: useTemplate ? prev.templateId : '',
                  }));
                }}
                className="text-brand-teal-500 focus:ring-brand-teal-200 h-4 w-4 rounded border-gray-300"
              />
              <div className="flex-1">
                <div className="inline-flex items-center gap-2 text-sm font-medium text-gray-900">
                  <Sparkles size={14} strokeWidth={1.5} className="text-brand-gold-500" />
                  Start from a template
                </div>
                <p className="mt-0.5 text-xs text-gray-500">
                  Pre-fills phases, milestones, and decision points so you can launch a
                  standard project in seconds.
                </p>
              </div>
            </label>

            {form.useTemplate && (
              <div className="mt-3">
                <select
                  value={form.templateId}
                  onChange={(e) => applyTemplateToForm(e.target.value)}
                  className={inputClass}
                >
                  <option value="">— Select a template —</option>
                  {filteredTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                  {filteredTemplates.length === 0 && (
                    <option value="" disabled>
                      No {form.type} templates yet
                    </option>
                  )}
                </select>
                {selectedTemplate && (
                  <TemplatePreview template={selectedTemplate} />
                )}
              </div>
            )}
          </div>

          <Field label="Project name" required>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={form.type === 'remodel' ? 'Kitchen Remodel' : 'Annual Maintenance Plan'}
              className={inputClass}
            />
          </Field>

          <Field label="Type" required>
            <div className="grid grid-cols-2 gap-2">
              {(['maintenance', 'remodel'] as const).map((t) => {
                const active = form.type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm({ ...form, type: t })}
                    className={cn(
                      'rounded-xl border px-3 py-2.5 text-sm font-medium transition-all',
                      active
                        ? 'border-brand-teal-500 bg-brand-teal-50 text-brand-teal-500'
                        : 'hover:border-brand-teal-200 hover:text-brand-teal-500 border-line text-gray-600',
                    )}
                  >
                    {t === 'maintenance' ? 'Maintenance' : 'Remodel'}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date" required>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field
              label="End date"
              hint={selectedTemplate?.totalEstimatedDays ? 'Auto-calculated from template' : 'Optional'}
            >
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className={inputClass}
              />
            </Field>
          </div>

          {form.type === 'remodel' && (
            <Field label="Contract amount" hint="Optional. Dollars — commas optional.">
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-gray-400">
                  $
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.contractInput}
                  onChange={(e) => setForm({ ...form, contractInput: e.target.value })}
                  placeholder="125,000.00"
                  className={cn(inputClass, 'pl-8')}
                />
              </div>
            </Field>
          )}

          <Field
            label="Field staff"
            hint={
              fieldStaff.length === 0
                ? 'No active field staff yet. Invite one from the Staff page first.'
                : 'Optional. Add now or via the project’s Team tab later.'
            }
          >
            <StaffMultiSelect
              options={fieldStaff}
              selectedIds={form.assignedStaffIds}
              onChange={(ids) => setForm({ ...form, assignedStaffIds: ids })}
            />
          </Field>

          <Field label="Description" hint="Optional. Internal — clients see this on their portal.">
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              placeholder="Scope summary, special considerations, etc."
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
    </>
  );
}

/**
 * Multi-select for the "Field staff" Field. Plain checkbox list inside a
 * scrollable bordered container — matches the existing form aesthetic
 * (no chip-input pattern exists in the codebase, no need to invent one
 * for a 3-staff team list). Each row shows the active project count
 * alongside the name as secondary metadata.
 */
function StaffMultiSelect({
  options,
  selectedIds,
  onChange,
}: {
  options: FieldStaffPickerRow[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  if (options.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-brand-warm-50 px-4 py-3 text-xs text-gray-500">
        <Users size={12} strokeWidth={1.5} className="mr-1.5 inline" />
        No active field staff to assign.
      </div>
    );
  }

  function toggle(id: string) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((existing) => existing !== id)
        : [...selectedIds, id],
    );
  }

  return (
    <div className="max-h-44 overflow-y-auto rounded-xl border border-line bg-paper">
      <ul className="divide-y divide-gray-50">
        {options.map((staff) => {
          const checked = selectedIds.includes(staff.profileId);
          return (
            <li key={staff.profileId}>
              <label className="hover:bg-brand-warm-50 flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(staff.profileId)}
                  className="text-brand-teal-500 focus:ring-brand-teal-200 h-4 w-4 rounded border-gray-300"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-900">
                    {staff.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {staff.currentAssignmentCount === 0
                      ? 'No current projects'
                      : staff.currentAssignmentCount === 1
                        ? '1 current project'
                        : `${staff.currentAssignmentCount} current projects`}
                  </div>
                </div>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TemplatePreview({ template }: { template: TemplateOption }) {
  const parts: string[] = [];
  if (template.usesPhases && template.phaseCount !== null) {
    parts.push(`${template.phaseCount} ${template.phaseCount === 1 ? 'phase' : 'phases'}`);
  }
  if (template.totalEstimatedDays) {
    const weeks = Math.round(template.totalEstimatedDays / 7);
    parts.push(`~${weeks} ${weeks === 1 ? 'week' : 'weeks'}`);
  } else if (template.duration) {
    parts.push(template.duration);
  }
  return (
    <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-paper px-3 py-2 text-xs text-gray-500 ring-1 ring-gray-100">
      <Layers size={12} strokeWidth={1.5} className="text-brand-teal-500" />
      <span className="font-medium text-gray-700">{template.name}</span>
      {parts.length > 0 && <span>· {parts.join(' · ')}</span>}
    </div>
  );
}
