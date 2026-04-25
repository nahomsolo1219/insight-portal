import { FileText } from 'lucide-react';
import { ComingSoonCard } from '@/components/portal/ComingSoonCard';

export default function PortalInvoicesPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-brand-teal-500 text-3xl">Invoices</h1>
        <p className="mt-1 text-sm text-gray-500">Statements and payment status.</p>
      </header>
      <ComingSoonCard
        icon={<FileText size={20} strokeWidth={1.25} />}
        title="Invoice history coming soon"
        body="A read-only summary of your invoices and outstanding balance lands here next."
      />
    </div>
  );
}
