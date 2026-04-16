// Server-component wrapper that fetches projects for the active property
// and hands them to the client-side ProjectsList. The parent page renders
// this as a slot prop into <ClientDetailTabs> so data fetching happens on
// the server while tab switching stays a cheap client interaction.

import { getProjectsForProperty } from './queries';
import { ProjectsList } from './ProjectsList';

interface ProjectsTabProps {
  clientId: string;
  propertyId: string;
}

export async function ProjectsTab({ clientId, propertyId }: ProjectsTabProps) {
  const projects = await getProjectsForProperty(propertyId);
  return <ProjectsList clientId={clientId} projects={projects} />;
}
