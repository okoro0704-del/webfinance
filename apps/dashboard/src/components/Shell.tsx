import Link from "next/link";

const links = [
  { href: "/dashboard", label: "Overview" },
  { href: "/clients", label: "Clients" },
  { href: "/wallet", label: "Wallet" },
];

export function Shell({
  children,
  companyName,
}: {
  children: React.ReactNode;
  companyName?: string;
}) {
  return (
    <div className="mx-auto grid min-h-screen max-w-6xl gap-6 px-4 py-6 md:grid-cols-[220px_1fr] md:px-6">
      <aside className="panel h-fit p-4 md:sticky md:top-6">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.18em] text-brand-600">Distributor</p>
          <h1 className="mt-1 text-lg font-semibold text-ink-900">
            {companyName ?? "Control Panel"}
          </h1>
        </div>
        <nav className="flex flex-col gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-2 text-sm text-ink-700 hover:bg-brand-50 hover:text-brand-700"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div>{children}</div>
    </div>
  );
}
