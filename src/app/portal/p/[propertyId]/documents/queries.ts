// Read query for the portal Documents & Reports page. Pulls every doc
// (project-scoped) and every report (property-scoped) belonging to a
// client, then signs all storage URLs in one batch.

import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { documents, projects, properties, reports, vendors } from '@/db/schema';
import { getSignedUrlsAdmin } from '@/lib/storage/upload';

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
 * Pull every doc + report for a SINGLE property. The portal is
 * property-scoped, so we filter to the selected `propertyId` rather than
 * rolling up the whole client. Documents are project-scoped (no direct
 * property/client column), so we reach them via the property's projects;
 * reports are property-scoped and filter directly.
 *
 * `clientId` is still required for the ownership check — the property must
 * belong to the signed-in client (defence in depth on top of RLS).
 */
export async function getClientDocuments(
  clientId: string,
  propertyId: string,
): Promise<DocumentsPayload> {
  // Ownership check: property exists AND belongs to this client.
  const [property] = await db
    .select({
      id: properties.id,
      name: properties.name,
      address: properties.address,
    })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.clientId, clientId)))
    .limit(1);

  if (!property) {
    return { properties: [], documents: [], reports: [] };
  }

  const clientProperties = [property];

  // Documents live one level down from the property (under projects), so we
  // need this property's project list to (a) scope the documents query and
  // (b) attach project + property names to each row without an N+1.
  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      propertyId: projects.propertyId,
    })
    .from(projects)
    .where(eq(projects.propertyId, propertyId));

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
      .where(eq(reports.propertyId, propertyId))
      .orderBy(desc(reports.date)),
  ]);

  // One batched signed-URL call across docs + reports — saves a round-trip
  // per file. Signed with the SERVICE-ROLE signer, not the cookie-bound one:
  // the cookie-bound @supabase/ssr storage client does not reliably carry the
  // client's JWT to the storage REST request, so the "Clients read own files"
  // RLS policy denies the sign and every file renders "Unavailable" even
  // though the policy WOULD allow it (admin forked onto service-role for the
  // same reason). Safe here because ownership is already enforced in SQL: the
  // property is confirmed to belong to `clientId` above, documents are scoped
  // to that property's projects, and reports to that property — so every path
  // handed to the signer is provably this client's own file.
  const allPaths = [
    ...docRows.map((d) => d.storagePath),
    ...reportRows.map((r) => r.storagePath),
  ];
  const urlByPath =
    allPaths.length > 0 ? await getSignedUrlsAdmin(allPaths) : new Map<string, string>();

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
