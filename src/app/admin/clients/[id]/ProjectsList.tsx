'use client';

import { Briefcase, Check, ChevronDown, ChevronRight, Hammer } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useOptimistic, useState, useTransition } from 'react';
import { useToast } from '@/components/admin/ToastProvider';
import { cn, formatCurrency, formatShortDate } from '@/lib/utils';
import { toggleMilestoneComplete } from './actions';
import { NewProjectButton } from './NewProjectButton';
import type {
  MilestoneRow,
  ProjectWithMilestones,
  PropertyRow,
  TemplateOption,
} from './queries';

type MilestoneStatus = MilestoneRow['status'];

interface ProjectsListProps {
  clientId: string;
  projects: ProjectWithMilestones[];
  properties: PropertyRow[];
  templates: TemplateOption[];
  activePropertyId: string | null;
}

export function ProjectsList({
  clientId,
  projects,
  properties,
  templates,
  activePropertyId,
}: ProjectsListProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [, startTransition] = useTransition();

  // Optimistic layer over the server-provided projects. Each toggle dispatches
  // a "setStatus" action (not a "toggle") so it's idempotent — when the server
  // confirms and router.refresh() brings new data in, applying the same action
  // against the new base is a no-op and nothing flickers.
  const [optimisticProjects, applyOptimistic] = useOptimistic(
    projects,
    (state, action: { milestoneId: string; newStatus: MilestoneStatus }) =>
      state.map((project) => {
        if (!project.milestones.some((m) => m.id === action.milestoneId)) return project;
        const nextMilestones = project.milestones.map((m) =>
          m.id === action.milestoneId ? { ...m, status: action.newStatus } : m,
        );
        const completed = nextMilestones.filter((m) => m.status === 'complete').length;
        const progress =
          project.milestoneStats.total === 0
            ? 0
            : Math.round((completed / project.milestoneStats.total) * 100);
        return {
          ...project,
          milestones: nextMilestones,
          milestoneStats: { ...project.milestoneStats, completed },
          progress,
        };
      }),
  );

  // Initial-open set: just the first project, if any. The Set preserves
  // identity across renders and keeps toggle logic straightforward.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const first = projects[0]?.id;
    return new Set<string>(first ? [first] : []);
  });

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleToggleMilestone(milestoneId: string, currentStatus: MilestoneStatus) {
    // Decisions resolve through their own flow — never flipped here.
    if (currentStatus === 'awaiting_client') return;
    const newStatus: MilestoneStatus = currentStatus === 'complete' ? 'pending' : 'complete';

    startTransition(async () => {
      applyOptimistic({ milestoneId, newStatus });
      const result = await toggleMilestoneComplete(milestoneId, clientId);
      if (!result.success) {
        // useOptimistic drops the pending action when the transition settles,
        // so the UI reverts automatically — we just surface the error.
        showToast(result.error, 'error');
        return;
      }
      router.refresh();
    });
  }

  if (projects.length === 0) {
    return (
      <div className="shadow-card rounded-2xl bg-white p-12 text-center">
        <div className="bg-brand-warm-200 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-gray-400">
          <Briefcase size={24} strokeWidth={1.5} />
        </div>
        <h3 className="text-base font-semibold text-gray-900">No projects yet</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
          Create a maintenance plan or remodel to start tracking work for this property.
        </p>
        <div className="mt-5 flex justify-center">
          <NewProjectButton
            clientId={clientId}
            properties={properties}
            templates={templates}
            activePropertyId={activePropertyId}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <NewProjectButton
          clientId={clientId}
          properties={properties}
          templates={templates}
          activePropertyId={activePropertyId}
        />
      </div>

      {optimisticProjects.map((p) => (
        <ProjectCard
          key={p.id}
          project={p}
          isOpen={expanded.has(p.id)}
          onToggle={() => toggle(p.id)}
          onToggleMilestone={handleToggleMilestone}
        />
      ))}
    </div>
  );
}

function ProjectCard({
  project,
  isOpen,
  onToggle,
  onToggleMilestone,
}: {
  project: ProjectWithMilestones;
  isOpen: boolean;
  onToggle: () => void;
  onToggleMilestone: (milestoneId: string, currentStatus: MilestoneStatus) => void;
}) {
  const Icon = project.type === 'maintenance' ? Briefcase : Hammer;
  const iconTone =
    project.type === 'maintenance'
      ? 'bg-brand-teal-50 text-brand-teal-500'
      : 'bg-brand-gold-50 text-brand-gold-500';

  return (
    <div className="shadow-card overflow-hidden rounded-2xl bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="hover:bg-brand-warm-50 flex w-full items-center gap-4 p-5 text-left transition-colors"
        aria-expanded={isOpen}
      >
        <div
          className={cn(
            'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg',
            iconTone,
          )}
        >
          <Icon size={18} strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-base font-semibold text-gray-900">{project.name}</h3>
            <span
              className={cn(
                'rounded px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase',
                iconTone,
              )}
            >
              {project.type}
            </span>
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {project.milestoneStats.completed}/{project.milestoneStats.total} milestones complete
            {project.startDate && ` · ${formatShortDate(project.startDate)}`}
            {project.endDate && ` → ${formatShortDate(project.endDate)}`}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-4">
          <div className="hidden w-32 md:block">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-gray-500">Progress</span>
              <span className="font-medium text-gray-700">{project.progress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className="bg-brand-teal-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${project.progress}%` }}
              />
            </div>
          </div>
          {isOpen ? (
            <ChevronDown size={18} className="text-gray-400" />
          ) : (
            <ChevronRight size={18} className="text-gray-400" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-gray-100 px-5 py-4">
          {project.type === 'remodel' && project.contractCents != null && (
            <div className="mb-5 grid grid-cols-4 gap-4 border-b border-gray-100 pb-5">
              <BudgetStat label="Contract" value={formatCurrency(project.contractCents)} />
              <BudgetStat
                label="Changes"
                value={formatCurrency(project.changesCents ?? 0)}
                color={
                  project.changesCents && project.changesCents > 0 ? 'amber' : 'default'
                }
              />
              <BudgetStat
                label="Paid"
                value={formatCurrency(project.paidCents ?? 0)}
                color="emerald"
              />
              <BudgetStat
                label="Remaining"
                value={formatCurrency(
                  (project.contractCents ?? 0) +
                    (project.changesCents ?? 0) -
                    (project.paidCents ?? 0),
                )}
              />
            </div>
          )}

          <div>
            <h4 className="mb-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">
              Milestones
            </h4>
            {project.milestones.length === 0 ? (
              <p className="py-4 text-sm text-gray-400">No milestones yet.</p>
            ) : (
              <div className="space-y-1">
                {project.milestones.map((m) => (
                  <MilestoneRowCard
                    key={m.id}
                    milestone={m}
                    onToggle={() => onToggleMilestone(m.id, m.status)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BudgetStat({
  label,
  value,
  color = 'default',
}: {
  label: string;
  value: string;
  color?: 'default' | 'amber' | 'emerald';
}) {
  const colorClass =
    color === 'amber'
      ? 'text-amber-600'
      : color === 'emerald'
        ? 'text-emerald-600'
        : 'text-gray-900';
  return (
    <div>
      <div className="text-[10px] font-medium tracking-wider text-gray-400 uppercase">
        {label}
      </div>
      <div className={cn('mt-1 text-base font-light tracking-tight', colorClass)}>{value}</div>
    </div>
  );
}

function MilestoneRowCard({
  milestone,
  onToggle,
}: {
  milestone: MilestoneRow;
  onToggle: () => void;
}) {
  const isComplete = milestone.status === 'complete';
  const isAwaitingClient = milestone.status === 'awaiting_client';
  const isInProgress = milestone.status === 'in_progress';

  const metaParts = [
    milestone.category,
    milestone.vendorName,
    milestone.dueDate ? formatShortDate(milestone.dueDate) : null,
  ].filter(Boolean);

  return (
    <div className="hover:bg-brand-warm-50 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors">
      <button
        type="button"
        onClick={onToggle}
        disabled={isAwaitingClient}
        aria-label={isComplete ? 'Mark incomplete' : 'Mark complete'}
        title={isAwaitingClient ? 'Waiting on client response' : 'Toggle complete'}
        className={cn(
          'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all',
          isComplete
            ? 'border-emerald-500 bg-emerald-500'
            : isAwaitingClient
              ? 'cursor-not-allowed border-pink-300'
              : 'hover:border-brand-teal-500 cursor-pointer border-gray-300',
        )}
      >
        {isComplete && <Check size={12} strokeWidth={3} className="text-white" />}
      </button>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'truncate text-sm',
            isComplete ? 'text-gray-400 line-through' : 'text-gray-900',
          )}
        >
          {milestone.title}
        </div>
        {metaParts.length > 0 && (
          <div className="text-xs text-gray-500">{metaParts.join(' · ')}</div>
        )}
      </div>
      {isAwaitingClient && (
        <span className="rounded bg-pink-50 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-pink-700 uppercase">
          Awaiting client
        </span>
      )}
      {isInProgress && (
        <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-blue-700 uppercase">
          In progress
        </span>
      )}
    </div>
  );
}

