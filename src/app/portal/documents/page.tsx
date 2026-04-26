import {
  Award,
  ClipboardCheck,
  Download,
  File as FileIcon,
  FileText,
  PenTool,
  Shield,
  Wrench,
} from 'lucide-react';
import { redirect } from 'next/navigation';
import { createElement, type ComponentType } from 'react';
import { PdfViewer } from '@/components/portal/PdfViewer';
import { getCurrentUser } from '@/lib/auth/current-user';
import { cn, formatDate } from '@/lib/utils';
import {
  getClientDocuments,
  type PortalDocumentRow,
  type PortalReportRow,
} from './queries';

export default async function PortalDocumentsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'client' || !user.clientId) redirect('/');

  const { properties, documents, reports } = await getClientDocuments(user.clientId);

  // Bucket by property — both documents and reports share a property card so
  // the client can scan their whole house in one place.
  const docsByProperty = new Map<string, PortalDocumentRow[]>();
  for (const d of documents) {
    const list = docsByProperty.get(d.propertyId);
    if (list) list.push(d);
    else docsByProperty.set(d.propertyId, [d]);
  }
  const reportsByProperty = new Map<string, PortalReportRow[]>();
  for (const r of reports) {
    const list = reportsByProperty.get(r.propertyId);
    if (list) list.push(r);
    else reportsByProperty.set(r.propertyId, [r]);
  }

  const isEmpty = documents.length === 0 && reports.length === 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-brand-teal-500 text-2xl tracking-tight md:text-3xl">
          Documents &amp; Reports
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Contracts, permits, drawings, and assessments — everything we&apos;ve shared with you.
        </p>
      </header>

      {isEmpty ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          {properties.map((property) => {
            const propertyDocs = docsByProperty.get(property.id) ?? [];
            const propertyReports = reportsByProperty.get(property.id) ?? [];
            if (propertyDocs.length === 0 && propertyReports.length === 0) return null;

            return (
              <section key={property.id}>
                <PropertyHeader name={property.name} address={property.address} />

                {propertyDocs.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <SubLabel>Documents</SubLabel>
                    <div className="space-y-2">
                      {propertyDocs.map((d) => (
                        <DocumentCard key={d.id} doc={d} />
                      ))}
                    </div>
                  </div>
                )}

                {propertyReports.length > 0 && (
                  <div className="mt-5 space-y-2">
                    <SubLabel>Reports</SubLabel>
                    <div className="space-y-2">
                      {propertyReports.map((r) => (
                        <ReportCard key={r.id} report={r} />
                      ))}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Property header
// ---------------------------------------------------------------------------

function PropertyHeader({ name, address }: { name: string; address: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900">{name}</h2>
      <p className="text-xs text-gray-500">{address}</p>
    </div>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold tracking-wider text-gray-400 uppercase">
      {children}
    </h3>
  );
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

// `react-hooks/static-components` flags rendering `<Icon>` where `Icon` is
// the return value of a function call during render — even though here
// the function is a pure lookup over a constant table. We sidestep the
// rule by using `createElement` instead of JSX-tag syntax: same result,
// and the constant-icon-table pattern stays readable.
function DocumentCard({ doc }: { doc: PortalDocumentRow }) {
  const iconCmp = iconForDocType(doc.type);
  return (
    <FileCard
      icon={createElement(iconCmp, { size: 18, strokeWidth: 1.5 })}
      iconTone="bg-brand-teal-50 text-brand-teal-500"
      title={doc.name}
      meta={`${prettyType(doc.type)} · ${formatDate(doc.date)}${doc.projectName ? ` · ${doc.projectName}` : ''}`}
      signedUrl={doc.signedUrl}
      storagePath={doc.storagePath}
    />
  );
}

function ReportCard({ report }: { report: PortalReportRow }) {
  const iconCmp = iconForReportType(report.type);
  const tone = toneForReportType(report.type);
  const metaParts = [prettyType(report.type), formatDate(report.date)];
  if (report.vendorName) metaParts.push(report.vendorName);

  return (
    <FileCard
      icon={createElement(iconCmp, { size: 18, strokeWidth: 1.5 })}
      iconTone={tone}
      title={report.name}
      meta={metaParts.join(' · ')}
      signedUrl={report.signedUrl}
      storagePath={report.storagePath}
    />
  );
}

interface FileCardProps {
  icon: React.ReactNode;
  iconTone: string;
  title: string;
  meta: string;
  signedUrl: string | null;
  storagePath: string;
}

function FileCard({ icon, iconTone, title, meta, signedUrl, storagePath }: FileCardProps) {
  const previewable = signedUrl !== null && isPdfPath(storagePath);
  return (
    <div className="shadow-card flex items-center gap-3 rounded-2xl bg-white p-4">
      <div
        className={cn(
          'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl',
          iconTone,
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-900">{title}</div>
        <div className="mt-0.5 truncate text-xs text-gray-500">{meta}</div>
      </div>

      {signedUrl ? (
        <div className="flex flex-shrink-0 items-center gap-1">
          {previewable && <PdfViewer url={signedUrl} name={title} />}
          <a
            href={signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            // 44px tall touch target on mobile; the icon-only variant scales
            // down on md+ where space matters more.
            className="text-brand-teal-500 hover:text-brand-teal-600 hover:bg-brand-teal-50 inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition-all md:px-4"
          >
            <Download size={14} strokeWidth={1.75} />
            <span className="hidden sm:inline">Download</span>
          </a>
        </div>
      ) : (
        <span className="text-xs text-gray-400 italic">Unavailable</span>
      )}
    </div>
  );
}

function isPdfPath(path: string): boolean {
  // Storage path keeps the original extension; signed URL token doesn't
  // affect the path itself, so a simple suffix check is reliable.
  const stripped = path.split('?')[0];
  return stripped.toLowerCase().endsWith('.pdf');
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="shadow-card rounded-2xl bg-white p-10 text-center">
      <div className="bg-brand-warm-200 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-gray-400">
        <FileText size={20} strokeWidth={1.25} />
      </div>
      <h3 className="text-base font-semibold text-gray-900">No documents yet</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
        Your project manager will share contracts, permits, and reports here as your
        projects progress.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Type → icon / tone helpers
// ---------------------------------------------------------------------------

type IconCmp = ComponentType<{
  size?: number;
  strokeWidth?: number;
  className?: string;
}>;

/**
 * Document type → icon. The `documents.type` column is free text, so we
 * normalize before matching and fall back to a generic file icon for any
 * value we don't recognise. New canonical types only require an entry here
 * — no schema or migration changes.
 */
function iconForDocType(type: string): IconCmp {
  switch (type.toLowerCase().trim()) {
    case 'contract':
    case 'contracts':
      return FileText;
    case 'drawing':
    case 'drawings':
    case 'plan':
    case 'plans':
      return PenTool;
    case 'permit':
    case 'permits':
      return Shield;
    case 'spec':
    case 'specs':
    case 'specification':
      return Wrench;
    case 'warranty':
      return Award;
    default:
      return FileIcon;
  }
}

function iconForReportType(type: string): IconCmp {
  switch (type.toLowerCase().trim()) {
    case 'inspection':
      return ClipboardCheck;
    case 'assessment':
      return Shield;
    case 'update':
    case 'progress':
      return FileText;
    case 'year_end':
    case 'year-end':
    case 'annual':
      return Award;
    default:
      return FileIcon;
  }
}

function toneForReportType(type: string): string {
  switch (type.toLowerCase().trim()) {
    case 'inspection':
      return 'bg-blue-50 text-blue-600';
    case 'assessment':
      return 'bg-purple-50 text-purple-600';
    case 'update':
    case 'progress':
      return 'bg-emerald-50 text-emerald-600';
    case 'year_end':
    case 'year-end':
    case 'annual':
      return 'bg-amber-50 text-amber-600';
    default:
      return 'bg-brand-warm-200 text-gray-500';
  }
}

/** Title-case a free-text type token for display. */
function prettyType(type: string): string {
  if (!type) return 'Document';
  const cleaned = type.replace(/[_-]+/g, ' ').trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
