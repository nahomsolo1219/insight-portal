// Server wrapper for the Reports tab. Fetches the report list + vendor/project
// picker options, then batch-signs every storage path so the client can render
// download links without a round-trip per file.

import { getSignedUrls } from '@/lib/storage/upload';
import {
  getProjectsForPropertySelect,
  getReportsForProperty,
  getVendorsForSelect,
} from './queries';
import { ReportsTabClient, type ReportRowWithUrl } from './ReportsTabClient';

interface ReportsTabProps {
  clientId: string;
  propertyId: string;
}

export async function ReportsTab({ clientId, propertyId }: ReportsTabProps) {
  const [reportRows, vendors, projectOptions] = await Promise.all([
    getReportsForProperty(propertyId),
    getVendorsForSelect(),
    getProjectsForPropertySelect(propertyId),
  ]);

  const urlMap =
    reportRows.length > 0
      ? await getSignedUrls(reportRows.map((r) => r.storagePath))
      : new Map<string, string>();

  const reportsWithUrls: ReportRowWithUrl[] = reportRows.map((r) => ({
    ...r,
    signedUrl: urlMap.get(r.storagePath) ?? null,
  }));

  return (
    <ReportsTabClient
      clientId={clientId}
      propertyId={propertyId}
      reports={reportsWithUrls}
      vendors={vendors}
      projects={projectOptions}
    />
  );
}
