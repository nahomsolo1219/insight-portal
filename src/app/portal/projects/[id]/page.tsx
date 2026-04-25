import { Briefcase } from 'lucide-react';
import { ComingSoonCard } from '@/components/portal/ComingSoonCard';

export default function PortalProjectDetailPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-brand-teal-500 text-3xl">Project</h1>
        <p className="mt-1 text-sm text-gray-500">Phase-by-phase view of this project.</p>
      </header>
      <ComingSoonCard
        icon={<Briefcase size={20} strokeWidth={1.25} />}
        title="Project timeline coming soon"
        body="The full visual timeline lands in the next release."
      />
    </div>
  );
}
