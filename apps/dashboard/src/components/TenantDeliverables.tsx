"use client";

type Deliverables = {
  access_url?: string | null;
  portal_url?: string | null;
  website?: string | null;
  admin_email?: string | null;
  temporary_password?: string | null;
  brand_name?: string | null;
  client_login_url?: string | null;
  admin_dashboard_url?: string | null;
};

function cleanUrl(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function TenantDeliverables({
  displayName,
  portalHostname,
  credentials,
  pendingProvision,
}: {
  displayName: string;
  portalHostname?: string | null;
  credentials?: Deliverables | null;
  pendingProvision?: boolean;
  productSku?: string | null;
}) {
  const brand = credentials?.brand_name || displayName;

  const clientLogin =
    credentials?.client_login_url ||
    credentials?.access_url ||
    (portalHostname
      ? `https://${String(portalHostname).replace(/\.webfinance\.app$/i, ".apps.webfinance.app")}/login`
      : null);

  const adminHome =
    credentials?.admin_dashboard_url ||
    (clientLogin ? clientLogin.replace(/\/login\/?$/, "/admin") : null);

  const companySite =
    credentials?.portal_url ||
    credentials?.website ||
    (portalHostname ? `https://${portalHostname}` : null);

  if (!clientLogin && !credentials?.admin_email && !companySite) {
    return (
      <p className="mt-2 text-xs text-ink-400">
        Deploy to generate branded login and public site deliverables.
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-800">
        Deliverables · {brand}
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-800">
            Client login
          </p>
          {clientLogin ? (
            <a
              href={clientLogin}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block break-all text-xs font-semibold text-brand-900 hover:text-brand-950"
            >
              {cleanUrl(clientLogin)}
            </a>
          ) : (
            <p className="mt-1 text-xs text-ink-500">Pending Deploy</p>
          )}
          <p className="mt-1 text-[11px] text-brand-800/80">
            Company admins and customers sign in here. After first sign-in, change
            the password under Settings.
          </p>
          {adminHome ? (
            <p className="mt-2 text-[11px] text-ink-600">
              Company admin home:{" "}
              <a
                className="font-semibold text-brand-800"
                href={adminHome}
                target="_blank"
                rel="noreferrer"
              >
                /admin
              </a>
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border border-ink-200 bg-white px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">
            Public website
          </p>
          {companySite ? (
            <a
              href={companySite}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block break-all text-xs font-semibold text-ink-900 hover:text-brand-800"
            >
              {cleanUrl(companySite)}
            </a>
          ) : (
            <p className="mt-1 text-xs text-ink-500">Pending Deploy</p>
          )}
          <p className="mt-1 text-[11px] text-ink-500">
            Branded landing and public tracking pages for this company.
          </p>
        </div>
      </div>

      {credentials?.admin_email ? (
        <p className="text-xs text-ink-600">
          Login: <span className="font-medium text-ink-800">{credentials.admin_email}</span>
        </p>
      ) : null}
      {credentials?.temporary_password ? (
        <p className="text-xs text-ink-600">
          Temp password:{" "}
          <span className="font-mono font-medium text-ink-800">
            {credentials.temporary_password}
          </span>
        </p>
      ) : null}

      {pendingProvision ? (
        <p className="text-xs text-signal-bad">
          Product tenant incomplete — click Finish setup / Deploy again.
        </p>
      ) : null}
    </div>
  );
}
