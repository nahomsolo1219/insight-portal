import { Briefcase } from 'lucide-react';
import { ComingSoonCard } from '@/components/portal/ComingSoonCard';

export default function PortalProjectsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-brand-teal-500 text-3xl">Your projects</h1>
        <p className="mt-1 text-sm text-gray-500">
          Timelines, milestones, and decisions across your home.
        </p>
      </header>
      <ComingSoonCard
        icon={<Briefcase size={20} strokeWidth={1.25} />}
        title="Project timeline coming soon"
        body="We're polishing the visual timeline that shows every phase, milestone, and decision in your active projects. Until it's ready, your dashboard surfaces what's in flight."
      />
    </div>
  );
}
