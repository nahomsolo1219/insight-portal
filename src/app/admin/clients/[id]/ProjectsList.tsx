'use client';

import {
  Briefcase,
  Check,
  ChevronDown,
  ChevronRight,
  Hammer,
  Plus,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { cn, formatCurrency, formatShortDate } from '@/lib/utils';
import { toggleMilestoneComplete } from './actions';
import type { MilestoneRow, ProjectWithMilestones } from './queries';

interface ProjectsListProps {
  clientId: string;
  projects: ProjectWithMilestones[];
}

export function ProjectsList({ clientId, projects }: ProjectsListProps) {
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
        <DisabledNewProjectButton className="mt-5" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <DisabledNewProjectButton />
      </div>

      {projects.map((p) => (
        <ProjectCard
          key={p.id}
          project={p}
          clientId={clientId}
          isOpen={expanded.has(p.id)}
          onToggle={() => toggle(p.id)}
        />
      ))}
    </div>
  );
}

function ProjectCard({
  project,
  clientId,
  isOpen,
  onToggle,
}: {
  project: ProjectWithMilestones;
  clientId: string;
  isOpen: boolean;
  onToggle: () => void;
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
                  <MilestoneRowCard key={m.id} milestone={m} clientId={clientId} />
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
  clientId,
}: {
  milestone: MilestoneRow;
  clientId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const isComplete = milestone.status === 'complete';
  const isAwaitingClient = milestone.status === 'awaiting_client';
  const isInProgress = milestone.status === 'in_progress';

  function handleToggle() {
    if (isAwaitingClient) return; // Decisions resolve through their own flow.
    setError(null);
    startTransition(async () => {
      const result = await toggleMilestoneComplete(milestone.id, clientId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const metaParts = [
    milestone.category,
    milestone.vendorName,
    milestone.dueDate ? formatShortDate(milestone.dueDate) : null,
  ].filter(Boolean);

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg px-2 py-2 transition-colors',
        isPending ? 'opacity-50' : 'hover:bg-brand-warm-50',
      )}
    >
      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending || isAwaitingClient}
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
        {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
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

function DisabledNewProjectButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      disabled
      title="Create project flow coming in a follow-up session"
      className={cn(
        'bg-brand-gold-400 inline-flex cursor-not-allowed items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white opacity-60',
        className,
      )}
    >
      <Plus size={16} />
      New Project
    </button>
  );
}
