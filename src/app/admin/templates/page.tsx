import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/current-user';
import { TemplateBuilder } from './TemplateBuilder';
import { TemplateList } from './TemplateList';
import { getTemplateWithPhases, listTemplates } from './queries';

interface PageProps {
  searchParams: Promise<{ mode?: string; id?: string }>;
}

export default async function TemplatesPage({ searchParams }: PageProps) {
  await requireAdmin();
  const { mode, id } = await searchParams;

  if (mode === 'builder') {
    const template = id ? await getTemplateWithPhases(id) : null;
    if (id && !template) notFound();
    return <TemplateBuilder template={template} />;
  }

  const templates = await listTemplates();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-brand-teal-500 text-3xl">Templates</h1>
        <p className="mt-1 text-sm text-[#737373]">
          Reusable project templates. Click a template to edit in the visual builder.
        </p>
      </header>

      <TemplateList templates={templates} />
    </div>
  );
}
