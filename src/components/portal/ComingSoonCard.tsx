/**
 * Shared placeholder for portal sections that haven't shipped yet. Keeps a
 * consistent look so a half-built portal still feels intentional rather
 * than empty.
 */
export function ComingSoonCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="shadow-card rounded-2xl bg-white p-10 text-center">
      <div className="bg-brand-warm-200 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-gray-400">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">{body}</p>
    </div>
  );
}
