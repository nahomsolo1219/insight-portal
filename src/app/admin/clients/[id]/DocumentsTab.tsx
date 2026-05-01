// Server wrapper for the Documents tab. Fetches the document list + project
// picker options, then batch-signs every storage path so the client component
// can render download links without a round-trip per file.

import { getSignedUrlsAdmin } from '@/lib/storage/upload';
import { DocumentsTabClient, type DocumentRowWithUrl } from './DocumentsTabClient';
import { getDocumentsForProperty, getProjectsForPropertySelect } from './queries';

interface DocumentsTabProps {
  clientId: string;
  propertyId: string;
}

export async function DocumentsTab({ clientId, propertyId }: DocumentsTabProps) {
  const [docs, projectOptions] = await Promise.all([
    getDocumentsForProperty(propertyId),
    getProjectsForPropertySelect(propertyId),
  ]);

  // One `createSignedUrls` round-trip for every file on this property. If the
  // list ever grows into the thousands we'd want pagination first.
  const urlMap =
    docs.length > 0 ? await getSignedUrlsAdmin(docs.map((d) => d.storagePath)) : new Map<string, string>();

  const documentsWithUrls: DocumentRowWithUrl[] = docs.map((d) => ({
    ...d,
    signedUrl: urlMap.get(d.storagePath) ?? null,
  }));

  return (
    <DocumentsTabClient
      clientId={clientId}
      documents={documentsWithUrls}
      projects={projectOptions}
    />
  );
}
