import { requireAdmin } from '@/lib/auth/current-user';
import { TemplatesClient } from './TemplatesClient';
import {
  listAllTemplateMilestones,
  listTemplates,
  type TemplateMilestoneRow,
} from './queries';

export default async function TemplatesPage() {
  await requireAdmin();
  const [templates, milestonesByTemplate] = await Promise.all([
    listTemplates(),
    listAllTemplateMilestones(),
  ]);

  // Flatten the Map into a plain object so it serialises across the
  // server → client boundary as JSON.
  const milestonesObj: Record<string, TemplateMilestoneRow[]> = {};
  for (const [k, v] of milestonesByTemplate.entries()) {
    milestonesObj[k] = v;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-brand-teal-500 text-3xl">Templates</h1>
        <p className="mt-1 text-sm text-[#737373]">
          Reusable project templates. Apply one when starting a new project to pre-fill its
          milestones.
        </p>
      </header>

      <TemplatesClient templates={templates} milestonesByTemplate={milestonesObj} />
    </div>
  );
}
