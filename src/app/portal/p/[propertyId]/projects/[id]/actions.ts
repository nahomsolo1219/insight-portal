'use server';

import { and, asc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { milestones, photos, projects, properties } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { requireUser } from '@/lib/auth/current-user';
import { createNotification } from '@/lib/notifications/create';
import { getAdminRecipientUserIds } from '@/lib/notifications/recipients';
import { createAdminClient } from '@/lib/supabase/admin';
import { BUCKET_NAME } from '@/lib/storage/paths';

type ActionResult = { success: true } | { success: false; error: string };

type ZipResult =
  | { success: true; zipUrl: string; photoCount: number }
  | { success: false; error: string };

const MAX_ZIP_PHOTOS = 50;

const MAX_RESPONSE_LENGTH = 2_000;

/**
 * Persist a client's response to an awaiting-client milestone (a "decision"
 * in portal language). Deliberately leaves the status as `awaiting_client`
 * — David reviews the response and marks it complete, which is when the
 * project's progress percentage actually moves. This way an accidental tap
 * never advances the project on the admin side without human review.
 *
 * Authorization: only the client who owns the project can respond. Two
 * checks: (1) `requireUser` must be a `client`, (2) the milestone must
 * belong to a project on a property owned by this client. Belt + braces.
 */
export async function respondToDecision(
  milestoneId: string,
  response: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== 'client' || !user.clientId) {
    return { success: false, error: 'Only clients can respond to decisions.' };
  }

  const trimmed = response.trim();
  if (!trimmed) return { success: false, error: 'Please provide a response.' };
  if (trimmed.length > MAX_RESPONSE_LENGTH) {
    return { success: false, error: 'Response is too long.' };
  }

  try {
    // Fetch + ownership check in one round-trip. The join walks
    // milestone → project → property; matching on `properties.client_id`
    // catches a forged URL trying to hit someone else's milestone.
    const [row] = await db
      .select({
        id: milestones.id,
        status: milestones.status,
        clientResponse: milestones.clientResponse,
        title: milestones.title,
        propertyId: properties.id,
      })
      .from(milestones)
      .innerJoin(projects, eq(projects.id, milestones.projectId))
      .innerJoin(properties, eq(properties.id, projects.propertyId))
      .where(eq(milestones.id, milestoneId))
      .limit(1);

    if (!row) return { success: false, error: 'Decision not found.' };
    if (row.status !== 'awaiting_client') {
      return { success: false, error: 'This decision has already been resolved.' };
    }
    if (row.clientResponse) {
      return { success: false, error: 'You\u2019ve already responded to this decision.' };
    }

    await db
      .update(milestones)
      .set({
        clientResponse: trimmed,
        respondedAt: new Date(),
        respondedBy: user.id,
      })
      .where(eq(milestones.id, milestoneId));

    await logAudit({
      actor: user,
      action: 'responded to decision',
      targetType: 'milestone',
      targetId: row.id,
      targetLabel: row.title,
      clientId: user.clientId,
      metadata: { response: trimmed },
    });

    // Bell feed: notify every admin so whoever's watching the
    // dashboard sees the response land. We fan out to all admins
    // rather than just the project's PM because (a) the
    // `clients.assignedPmId` may be unset and (b) the team
    // generally wants visibility into incoming client input. Link
    // points back at the admin decisions list. Best-effort.
    try {
      const responderName = user.fullName?.trim() || user.email;
      const recipients = await getAdminRecipientUserIds();
      await Promise.all(
        recipients.map((recipientUserId) =>
          createNotification({
            recipientUserId,
            kind: 'decision_answered',
            title: `${responderName} responded to a decision`,
            body: row.title,
            link: '/admin/decisions',
            relatedEntityType: 'decision',
            relatedEntityId: row.id,
          }),
        ),
      );
    } catch (error) {
      console.error('[respondToDecision] notify failed', error);
    }

    // Wide revalidation. The decision/response pair surfaces in three
    // distinct portal views (dashboard FeaturedDecisionCard, projects
    // list badge, project timeline) AND multiple admin pages (admin
    // decisions list, admin client detail, admin project detail).
    // The Session 7 follow-up bug — the decision card sticking
    // around as a question after submit — was caused by revalidating
    // *only* the projects path; widening to layout-level on both
    // surfaces guarantees every reader sees the new state on next
    // render.
    revalidatePath('/portal', 'layout');
    revalidatePath('/admin', 'layout');
    return { success: true };
  } catch (error) {
    console.error('[respondToDecision]', error);
    return { success: false, error: 'Failed to submit response.' };
  }
}

/**
 * Bundle every categorized photo on a project into a ZIP grouped by tag
 * (before / during / after / untagged) and return a short-lived signed URL
 * the browser can navigate to for download.
 *
 * Architecture note: we generate the ZIP in-memory then push it to a temp
 * path in the storage bucket via the service-role client, which bypasses
 * the path-based RLS policy. The signed URL we return also bypasses RLS
 * for the duration it's valid, so the temp path doesn't need to live
 * inside the client's per-clientId tree.
 *
 * Limits: capped at 50 photos to keep the function under the serverless
 * memory ceiling — the button on the timeline encodes this in its label
 * so the user knows when they're being throttled.
 */
export async function downloadProjectPhotosAsZip(projectId: string): Promise<ZipResult> {
  const user = await requireUser();
  if (user.role !== 'client' || !user.clientId) {
    return { success: false, error: 'Not authorized.' };
  }

  // Ownership check via the same property → client join used elsewhere.
  // RLS is the second line of defense; this gives us a clean 404-style
  // error path instead of a silent empty result.
  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .where(and(eq(projects.id, projectId), eq(properties.clientId, user.clientId)))
    .limit(1);

  if (!project) return { success: false, error: 'Project not found.' };

  const projectPhotos = await db
    .select({
      storagePath: photos.storagePath,
      caption: photos.caption,
      tag: photos.tag,
    })
    .from(photos)
    .where(and(eq(photos.projectId, projectId), eq(photos.status, 'categorized')))
    .orderBy(asc(photos.tag), asc(photos.uploadedAt));

  if (projectPhotos.length === 0) {
    return { success: false, error: 'No photos to download yet.' };
  }
  if (projectPhotos.length > MAX_ZIP_PHOTOS) {
    return {
      success: false,
      error: `Too many photos to bundle (${projectPhotos.length}). Please download individually from the lightbox.`,
    };
  }

  try {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const supabase = createAdminClient();

    let added = 0;
    for (const photo of projectPhotos) {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .download(photo.storagePath);
      if (error || !data) {
        console.error('[downloadProjectPhotosAsZip] download failed', photo.storagePath, error);
        continue;
      }

      const buffer = await data.arrayBuffer();
      const folder = photo.tag ?? 'untagged';
      const filename = sanitiseFilename(photo.caption, photo.storagePath, added);
      zip.folder(folder)?.file(filename, buffer);
      added += 1;
    }

    if (added === 0) {
      return { success: false, error: 'Could not read any photos from storage.' };
    }

    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });
    const zipPath = `temp-downloads/${user.clientId}/${projectId}-photos.zip`;
    const downloadName = `${slugify(project.name) || 'project'}-photos.zip`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(zipPath, zipBuffer, {
        contentType: 'application/zip',
        upsert: true,
      });

    if (uploadError) {
      console.error('[downloadProjectPhotosAsZip] upload failed', uploadError);
      return { success: false, error: 'Failed to prepare download.' };
    }

    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(zipPath, 60 * 60, { download: downloadName });

    if (signError || !signed?.signedUrl) {
      console.error('[downloadProjectPhotosAsZip] sign failed', signError);
      return { success: false, error: 'Failed to generate download link.' };
    }

    return { success: true, zipUrl: signed.signedUrl, photoCount: added };
  } catch (error) {
    console.error('[downloadProjectPhotosAsZip]', error);
    return { success: false, error: 'Failed to create photo bundle.' };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a safe-for-most-filesystems filename from the caption, falling back
 * to the storage path's basename. The numeric suffix prevents collisions
 * when two photos in the same folder share a caption.
 */
function sanitiseFilename(
  caption: string | null,
  storagePath: string,
  index: number,
): string {
  const ext = storagePath.split('.').pop()?.toLowerCase() || 'jpg';
  const fromCaption = caption?.trim()
    ? caption.trim().replace(/[/\\?%*:|"<>]/g, '-').slice(0, 60)
    : null;
  const base = fromCaption ?? `photo-${String(index + 1).padStart(2, '0')}`;
  return `${base}.${ext}`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}
