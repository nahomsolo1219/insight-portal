import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import {
  getAllActiveProperties,
  getPropertyProjects,
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
 */
export default async function FieldUploadPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const initialPropertyId = params.propertyId ?? null;
  const initialProjectId = params.projectId ?? null;

  // Two parallel reads: the property list (for the dropdown) and — when
  // the URL pinned a property — its active projects so the project
  // picker can render with the right options on first paint.
  const [propertyList, initialProjects] = await Promise.all([
    getAllActiveProperties(),
    initialPropertyId
      ? getPropertyProjects(initialPropertyId)
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

      <MobilePhotoCapture
        properties={propertyList}
        initialPropertyId={initialPropertyId}
        initialProjectId={initialProjectId}
        initialProjects={initialProjects}
      />
    </div>
  );
}
