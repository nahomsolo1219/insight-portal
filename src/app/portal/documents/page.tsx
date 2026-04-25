import { FileText } from 'lucide-react';
import { ComingSoonCard } from '@/components/portal/ComingSoonCard';

export default function PortalDocumentsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-brand-teal-500 text-3xl">Documents</h1>
        <p className="mt-1 text-sm text-gray-500">
          Contracts, reports, and signed paperwork in one place.
        </p>
      </header>
      <ComingSoonCard
        icon={<FileText size={20} strokeWidth={1.25} />}
        title="Document library coming soon"
        body="Your reports and contracts will surface here when the document feed ships."
      />
    </div>
  );
}
