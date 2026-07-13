// Server wrapper for the Reports tab. Fetches the property's reports + the
// vendor and appointment picker options, then batch-signs every storage path
// so the client component can render download/preview links without a
// round-trip per file. Mirrors DocumentsTab.

import { getSignedUrlsAdmin } from '@/lib/storage/upload';
import {
  getAppointmentsForPropertySelect,
  getReportsForProperty,
  getVendorsForSelect,
} from './queries';
import { ReportsTabClient, type ReportRowWithUrl } from './ReportsTabClient';

interface ReportsTabProps {
  clientId: string;
  propertyId: string;
  propertyName: string;
}

export async function ReportsTab({ clientId, propertyId, propertyName }: ReportsTabProps) {
  const [rows, vendors, appointments] = await Promise.all([
    getReportsForProperty(propertyId),
    getVendorsForSelect(),
    getAppointmentsForPropertySelect(propertyId),
  ]);

  const urlMap =
    rows.length > 0
      ? await getSignedUrlsAdmin(rows.map((r) => r.storagePath))
      : new Map<string, string>();

  const reports: ReportRowWithUrl[] = rows.map((r) => ({
    ...r,
    signedUrl: urlMap.get(r.storagePath) ?? null,
  }));

  return (
    <ReportsTabClient
      clientId={clientId}
      propertyId={propertyId}
      propertyName={propertyName}
      reports={reports}
      vendors={vendors}
      appointments={appointments}
    />
  );
}
