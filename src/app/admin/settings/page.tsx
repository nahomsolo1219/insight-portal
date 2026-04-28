import { requireAdmin } from '@/lib/auth/current-user';
import { SettingsClient } from './SettingsClient';
import { listEmailTemplates, listMembershipTiers } from './queries';

export default async function SettingsPage() {
  await requireAdmin();
  const [tiers, emailTemplates] = await Promise.all([
    listMembershipTiers(),
    listEmailTemplates(),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <div className="mb-3 flex items-center gap-2">
          <span aria-hidden="true" className="bg-brand-gold-500 inline-block h-px w-8" />
          <span className="text-ink-500 text-[11px] font-medium uppercase tracking-[0.18em]">
            Workspace
          </span>
        </div>
        <h1 className="serif text-ink-900 text-3xl tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-[#737373]">
          Company, membership tiers, and email templates.
        </p>
      </header>

      <SettingsClient tiers={tiers} emailTemplates={emailTemplates} />
    </div>
  );
}
