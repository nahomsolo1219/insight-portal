import { requireAdmin } from '@/lib/auth/current-user';
import { StaffClient } from './StaffClient';
import { listStaff } from './queries';

export default async function StaffPage() {
  await requireAdmin();
  const members = await listStaff();

  return (
    <div className="space-y-6">
      <header>
        <div className="mb-3 flex items-center gap-2">
          <span aria-hidden="true" className="bg-brand-gold-500 inline-block h-px w-8" />
          <span className="text-ink-500 text-[11px] font-medium uppercase tracking-[0.18em]">
            Internal team
          </span>
        </div>
        <h1 className="serif text-ink-900 text-3xl tracking-tight">Staff</h1>
        <p className="mt-1 text-sm text-[#737373]">
          {members.length} {members.length === 1 ? 'member' : 'members'} on the roster.
        </p>
      </header>

      <StaffClient members={members} />
    </div>
  );
}
