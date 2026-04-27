import { Briefcase, ChevronLeft, Hammer } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/current-user';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { ProjectDetailClient } from './ProjectDetailClient';
import {
  getActiveVendors,
  getProjectDetail,
  getProjectMilestones,
  getProjectPhotos,
  getProjectStats,
} from './queries';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;

  // Five parallel reads — each is independent of the others, so the page
  // resolves in one round-trip's worth of latency.
  const [project, milestones, photos, stats, vendors] = await Promise.all([
    getProjectDetail(id),
    getProjectMilestones(id),
    getProjectPhotos(id),
    getProjectStats(id),
    getActiveVendors(),
  ]);

  if (!project) notFound();

  const Icon = project.type === 'remodel' ? Hammer : Briefcase;
  const iconTone =
    project.type === 'remodel'
      ? 'bg-brand-gold-50 text-brand-gold-500'
      : 'bg-brand-teal-50 text-brand-teal-500';
  const remaining =
    (project.contractCents ?? 0) + project.changesCents - project.paidCents;
  const showBudget =
    project.type === 'remodel' && project.contractCents !== null && project.contractCents > 0;
  const paidPct =
    project.contractCents && project.contractCents > 0
      ? Math.round((project.paidCents / project.contractCents) * 100)
      : 0;

  return (
    <div>
      <Link
        href={`/admin/clients/${project.clientId}`}
        className="hover:text-brand-teal-500 mb-4 inline-flex items-center gap-1 text-sm text-gray-500 transition-colors"
      >
        <ChevronLeft size={16} strokeWidth={1.5} />
        Back to {project.clientName}
      </Link>

      <header className="mb-8">
        <div className="flex flex-wrap items-start gap-4">
          <div
            className={cn(
              'flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl',
              iconTone,
            )}
          >
            <Icon size={20} strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-brand-teal-500 text-3xl tracking-tight">
                {project.name}
              </h1>
              <span
                className={cn(
                  'rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase',
                  iconTone,
                )}
              >
                {project.type}
              </span>
              <StatusBadge status={project.status} />
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {project.propertyName} · {project.clientName}
            </p>
            <p className="mt-0.5 text-xs text-gray-400">
              {project.startDate
                ? `Started ${formatDate(project.startDate)}`
                : 'No start date'}
              {project.endDate && ` · Est. completion ${formatDate(project.endDate)}`}
            </p>
          </div>
        </div>
      </header>

      <div
        className={cn(
          'mb-8 grid gap-4',
          showBudget ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2',
        )}
      >
        <StatCard
          label="Progress"
          value={`${project.progress}%`}
          hint={`${stats.completedMilestones} of ${stats.totalMilestones} ${stats.totalMilestones === 1 ? 'milestone' : 'milestones'}`}
        />
        {showBudget ? (
          <>
            <StatCard
              label="Contract"
              value={formatCurrency(project.contractCents ?? 0)}
              hint={
                project.changesCents > 0
                  ? `+ ${formatCurrency(project.changesCents)} changes`
                  : undefined
              }
            />
            <StatCard
              label="Paid"
              value={formatCurrency(project.paidCents)}
              hint={`${paidPct}%`}
              tone="emerald"
            />
            <StatCard
              label="Remaining"
              value={formatCurrency(remaining)}
              tone={remaining > 0 ? 'amber' : 'default'}
            />
          </>
        ) : (
          <StatCard
            label="Photos"
            value={String(stats.photoCount)}
            hint={`${stats.appointmentCount} appointment${stats.appointmentCount === 1 ? '' : 's'}`}
          />
        )}
      </div>

      <ProjectDetailClient
        project={project}
        milestones={milestones}
        photos={photos}
        vendors={vendors}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: 'active' | 'completed' | 'on_hold' }) {
  const meta =
    status === 'active'
      ? { label: 'Active', tone: 'bg-emerald-50 text-emerald-700' }
      : status === 'completed'
        ? { label: 'Completed', tone: 'bg-gray-100 text-gray-600' }
        : { label: 'On hold', tone: 'bg-amber-50 text-amber-700' };
  return (
    <span
      className={cn(
        'rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase',
        meta.tone,
      )}
    >
      {meta.label}
    </span>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'emerald' | 'amber';
}) {
  const valueClass =
    tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'amber'
        ? 'text-amber-600'
        : 'text-gray-900';
  return (
    <div className="shadow-card rounded-2xl bg-white p-5">
      <div className="text-[10px] font-medium tracking-wider text-gray-500 uppercase">
        {label}
      </div>
      <div className={cn('mt-2 text-2xl font-light tracking-tight tabular-nums', valueClass)}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
    </div>
  );
}
