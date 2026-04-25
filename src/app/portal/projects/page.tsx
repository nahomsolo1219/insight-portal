import { ArrowRight, Briefcase, ClipboardList, Hammer, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { cn, formatDate } from '@/lib/utils';
import { getClientProjects, type ClientProjectListRow } from './queries';

export default async function PortalProjectsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'client' || !user.clientId) redirect('/');

  const projects = await getClientProjects(user.clientId);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-brand-teal-500 text-2xl tracking-tight md:text-3xl">
          Your projects
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {projects.length === 0
            ? 'Everything we manage at your home will live here.'
            : 'Tap a project to see its full timeline.'}
        </p>
      </header>

      {projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project }: { project: ClientProjectListRow }) {
  const Icon = project.type === 'remodel' ? Hammer : Briefcase;
  const iconTone =
    project.type === 'remodel'
      ? 'bg-brand-gold-50 text-brand-gold-500'
      : 'bg-brand-teal-50 text-brand-teal-500';
  const isInactive = project.status !== 'active';

  return (
    <Link
      href={`/portal/projects/${project.id}`}
      className={cn(
        'shadow-card group flex flex-col gap-4 rounded-2xl bg-white p-5 transition-all hover:shadow-elevated',
        isInactive && 'opacity-80',
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl',
            iconTone,
          )}
        >
          <Icon size={18} strokeWidth={1.5} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <h2 className="truncate text-base font-semibold text-gray-900">{project.name}</h2>
            <span className="flex-shrink-0 text-xs font-medium tabular-nums text-gray-500">
              {project.progress}%
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-500">{project.propertyName}</p>
        </div>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className="bg-brand-teal-500 h-full rounded-full transition-all duration-300"
          style={{ width: `${project.progress}%` }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
        <span>
          {project.endDate
            ? `Est. completion: ${formatDate(project.endDate)}`
            : project.status === 'completed'
              ? 'Completed'
              : 'Schedule pending'}
        </span>
        <ArrowRight
          size={14}
          strokeWidth={1.5}
          className="text-gray-400 transition-transform group-hover:translate-x-0.5"
        />
      </div>

      {project.pendingDecisions > 0 && (
        <div className="bg-brand-gold-50 text-brand-gold-700 -mx-1 -mb-1 inline-flex items-center gap-1.5 self-start rounded-lg px-2.5 py-1 text-xs font-medium">
          <ClipboardList size={12} strokeWidth={1.75} />
          {project.pendingDecisions === 1
            ? '1 decision needs your input'
            : `${project.pendingDecisions} decisions need your input`}
        </div>
      )}
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="shadow-card rounded-2xl bg-white p-10 text-center">
      <div className="bg-brand-warm-200 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-gray-400">
        <Sparkles size={20} strokeWidth={1.25} />
      </div>
      <h3 className="text-base font-semibold text-gray-900">No projects yet</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
        No active projects right now. Your project manager will set things up here when
        work begins.
      </p>
    </div>
  );
}
