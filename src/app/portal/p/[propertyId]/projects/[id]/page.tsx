import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { ProjectTimeline } from './ProjectTimeline';
import { getProjectTimeline } from './queries';

interface Props {
  params: Promise<{ propertyId: string; id: string }>;
}

/**
 * Server-component shell for the timeline. Fetches everything in one
 * payload and hands it to the (client) `ProjectTimeline` for the
 * interactive lightbox + decision response state.
 */
export default async function PortalProjectDetailPage({ params }: Props) {
  const { propertyId, id } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== 'client' || !user.clientId) redirect('/');

  const payload = await getProjectTimeline(id, user.clientId);
  if (!payload) notFound();

  return (
    <div className="space-y-6">
      <Link
        href={`/portal/p/${propertyId}/projects`}
        className="hover:text-brand-teal-500 inline-flex items-center gap-1 text-xs font-medium text-gray-500 transition-colors"
      >
        <ChevronLeft size={12} strokeWidth={2} />
        All projects
      </Link>

      <ProjectTimeline payload={payload} />
    </div>
  );
}
