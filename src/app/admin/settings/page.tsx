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
        <h1 className="font-display text-brand-teal-500 text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-[#737373]">
          Company, membership tiers, and email templates.
        </p>
      </header>

      <SettingsClient tiers={tiers} emailTemplates={emailTemplates} />
    </div>
  );
}
