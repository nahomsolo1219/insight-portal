import { Sidebar } from '@/components/admin/Sidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-brand-warm-100 flex min-h-screen text-[#444]">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-x-hidden">
        <div className="mx-auto w-full max-w-[1200px] px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
