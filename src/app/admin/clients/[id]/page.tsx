interface ClientDetailPageProps {
  params: Promise<{ id: string }>;
}

// Next.js 16: dynamic route params are async.
export default async function ClientDetailPage({ params }: ClientDetailPageProps) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-brand-teal-500 text-3xl">Client detail</h1>
        <p className="mt-1 text-sm text-[#737373]">
          Placeholder for client <code className="text-[#444]">{id}</code>. Tabs, property switcher,
          and activity feed will be built next.
        </p>
      </header>
      <div className="shadow-card rounded-2xl bg-white p-8 text-sm text-[#737373]">
        Next step: property switcher header + 7 tabs (Overview, Projects, Schedule, Photos,
        Invoices, Reports, Access).
      </div>
    </div>
  );
}
