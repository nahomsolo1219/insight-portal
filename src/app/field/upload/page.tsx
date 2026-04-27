import { ChevronLeft, MapPin } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import {
  getAssignedProperties,
  getAssignedPropertyProjects,
  type FieldProjectOption,
} from '../queries';
import { MobilePhotoCapture } from './MobilePhotoCapture';

interface PageProps {
  searchParams: Promise<{ propertyId?: string; projectId?: string }>;
}

/**
 * Server wrapper for the upload screen. Fetches the property dropdown
 * options + (when a property is pre-selected via the URL) the matching
 * project list. The MobilePhotoCapture client component owns all the
 * interactive state.
 *
 * If the user has zero project assignments, we render a "no projects
 * yet" empty state instead of the picker UI — see CLAUDE.md /
 * PORTAL_FIELD_INVENTORY for the cold-start design.
 */
export default async function FieldUploadPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const initialPropertyId = params.propertyId ?? null;
  const initialProjectId = params.projectId ?? null;

  // Two parallel reads: the property list scoped to this user's
  // assignments, and — when the URL pinned a property — its assigned
  // projects so the project picker renders with the right options on
  // first paint.
  const [propertyList, initialProjects] = await Promise.all([
    getAssignedProperties(user.id),
    initialPropertyId
      ? getAssignedPropertyProjects(initialPropertyId, user.id)
      : (Promise.resolve([]) as Promise<FieldProjectOption[]>),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 pt-5 pb-24">
      <Link
        href="/field"
        className="hover:text-brand-teal-500 inline-flex items-center gap-1 text-sm text-gray-500 transition-colors"
      >
        <ChevronLeft size={16} strokeWidth={1.5} />
        Back
      </Link>

      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Upload photos</h1>
        <p className="mt-1 text-sm text-gray-500">
          Photos go to the office for review and tagging.
        </p>
      </header>

      {propertyList.length === 0 ? (
        <NoAssignmentsState />
      ) : (
        <MobilePhotoCapture
          properties={propertyList}
          initialPropertyId={initialPropertyId}
          initialProjectId={initialProjectId}
          initialProjects={initialProjects}
        />
      )}
    </div>
  );
}

/**
 * Cold-start UI for any field user who hasn't been added to a project
 * yet. Mirrors the existing "no schedule today" card style — same
 * shadow, radius, icon-in-circle pattern — instead of inventing a new
 * empty-state primitive (that's polish-list work).
 */
function NoAssignmentsState() {
  return (
    <div className="shadow-card flex items-start gap-3 rounded-2xl bg-white p-5">
      <span className="bg-brand-warm-200 inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-gray-400">
        <MapPin size={18} strokeWidth={1.5} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-gray-900">No projects assigned yet.</h2>
        <p className="mt-1 text-sm text-gray-600">
          Contact your admin to get added to a project.
        </p>
      </div>
    </div>
  );
}
