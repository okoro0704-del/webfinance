import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">
        Project 3
      </p>
      <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-ink-900 md:text-5xl">
        Master Distributor Control Panel
      </h1>
      <p className="mt-4 max-w-xl text-lg text-ink-500">
        Zero-touch client deploy for Product A and Product B — licenses, domains,
        DNS/SSL, and tenant handshake in one click.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/login" className="btn-primary">
          Sign in
        </Link>
        <Link href="/dashboard" className="btn-ghost">
          Open dashboard
        </Link>
      </div>
    </main>
  );
}
