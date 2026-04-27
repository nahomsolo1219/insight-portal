// Read query for the portal Documents & Reports page. Pulls every doc
// (project-scoped) and every report (property-scoped) belonging to a
// client, then signs all storage URLs in one batch.

import { asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { documents, projects, properties, reports, vendors } from '@/db/schema';
import { getSignedUrls } from '@/lib/storage/upload';

export interface PortalPropertyRow {
  id: string;
  name: string;
  address: string;
}

export interface PortalDocumentRow {
  id: string;
  name: string;
  date: string;
  type: string;
  storagePath: string;
  signedUrl: string | null;
  projectId: string;
  projectName: string;
  propertyId: string;
  propertyName: string;
}

export interface PortalReportRow {
  id: string;
  name: string;
  date: string;
  type: string;
  storagePath: string;
  signedUrl: string | null;
  propertyId: string;
  propertyName: string;
  vendorName: string | null;
}

export interface DocumentsPayload {
  properties: PortalPropertyRow[];
  documents: PortalDocumentRow[];
  reports: PortalReportRow[];
}

/**
 * Pull every doc + report visible to this client. Same scope-by-clientId
 * defense-in-depth pattern used elsewhere in the portal — RLS would block
 * cross-client reads anyway, but the explicit filter is clear in code
 * review.
 */
export async function getClientDocuments(clientId: string): Promise<DocumentsPayload> {
  const clientProperties = await db
    .select({
      id: properties.id,
      name: properties.name,
      address: properties.address,
    })
    .from(properties)
    .where(eq(properties.clientId, clientId))
    .orderBy(asc(properties.name));

  const propertyIds = clientProperties.map((p) => p.id);
  if (propertyIds.length === 0) {
    return { properties: [], documents: [], reports: [] };
  }

  // Documents live one level down from properties (under projects), so we
  // need the project list to (a) scope the documents query and (b) attach
  // project + property names to each row without an N+1.
  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      propertyId: projects.propertyId,
    })
    .from(projects)
    .where(inArray(projects.propertyId, propertyIds));

  const projectIds = projectRows.map((p) => p.id);
  const projectById = new Map(projectRows.map((p) => [p.id, p]));
  const propertyById = new Map(clientProperties.map((p) => [p.id, p]));

  // Two parallel reads. Reports are property-scoped, so they don't depend
  // on the project list — they can run alongside documents.
  const [docRows, reportRows] = await Promise.all([
    projectIds.length === 0
      ? []
      : db
          .select({
            id: documents.id,
            name: documents.name,
            date: documents.date,
            type: documents.type,
            storagePath: documents.storagePath,
            projectId: documents.projectId,
          })
          .from(documents)
          .where(inArray(documents.projectId, projectIds))
          .orderBy(desc(documents.date)),
    db
      .select({
        id: reports.id,
        name: reports.name,
        date: reports.date,
        type: reports.type,
        storagePath: reports.storagePath,
        propertyId: reports.propertyId,
        vendorName: vendors.name,
      })
      .from(reports)
      .leftJoin(vendors, eq(vendors.id, reports.vendorId))
      .where(inArray(reports.propertyId, propertyIds))
      .orderBy(desc(reports.date)),
  ]);

  // One batched signed-URL call across docs + reports — saves a round-trip
  // per file. getSignedUrls dedupes nothing, but the path lists don't
  // overlap (different bucket prefixes), so a flat concat is fine.
  const allPaths = [
    ...docRows.map((d) => d.storagePath),
    ...reportRows.map((r) => r.storagePath),
  ];
  const urlByPath = allPaths.length > 0 ? await getSignedUrls(allPaths) : new Map<string, string>();

  const docs: PortalDocumentRow[] = docRows.map((d) => {
    const project = projectById.get(d.projectId);
    const property = project ? propertyById.get(project.propertyId) : null;
    return {
      id: d.id,
      name: d.name,
      date: d.date,
      type: d.type,
      storagePath: d.storagePath,
      signedUrl: urlByPath.get(d.storagePath) ?? null,
      projectId: d.projectId,
      projectName: project?.name ?? '',
      propertyId: property?.id ?? '',
      propertyName: property?.name ?? '',
    };
  });

  const reps: PortalReportRow[] = reportRows.map((r) => {
    const property = propertyById.get(r.propertyId);
    return {
      id: r.id,
      name: r.name,
      date: r.date,
      type: r.type,
      storagePath: r.storagePath,
      signedUrl: urlByPath.get(r.storagePath) ?? null,
      propertyId: r.propertyId,
      propertyName: property?.name ?? '',
      vendorName: r.vendorName,
    };
  });

  return { properties: clientProperties, documents: docs, reports: reps };
}
