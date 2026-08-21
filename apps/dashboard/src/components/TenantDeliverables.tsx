"use client";

type Deliverables = {
  access_url?: string | null;
  portal_url?: string | null;
  website?: string | null;
  admin_email?: string | null;
  temporary_password?: string | null;
  brand_name?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
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
  branding,
}: {
  displayName: string;
  portalHostname?: string | null;
  credentials?: Deliverables | null;
  pendingProvision?: boolean;
  productSku?: string | null;
  branding?: {
    brand_name?: string | null;
    logo_url?: string | null;
    primary_color?: string | null;
  } | null;
}) {
  const brand =
    credentials?.brand_name ||
    branding?.brand_name ||
    displayName;
  const logoUrl = credentials?.logo_url || branding?.logo_url || null;
  const primary =
    credentials?.primary_color || branding?.primary_color || "#14594c";

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

      {/* Login preview — matches what customers see on the product login + custom domain */}
      <div
        className="overflow-hidden rounded-lg border border-sand-200"
        style={{
          background: `linear-gradient(160deg, ${primary}14 0%, #f8faf9 55%, #ffffff 100%)`,
        }}
      >
        <div className="flex items-center gap-3 border-b border-sand-200/80 px-3 py-2.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              className="h-8 w-8 rounded-md object-contain bg-white"
            />
          ) : (
            <span
              className="flex h-8 w-8 items-center justify-center rounded-md text-xs font-bold text-white"
              style={{ backgroundColor: primary }}
            >
              {brand.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink-900">{brand}</p>
            <p className="text-[11px] text-ink-500">Client login branding</p>
          </div>
        </div>
        <div className="px-3 py-2.5">
          <p className="text-[11px] text-ink-600">
            This name, logo, and color appear on{" "}
            <span className="font-medium text-ink-800">/login</span> and on the
            client&apos;s custom domain once DNS is live.
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div
          className="rounded-lg border px-3 py-2.5"
          style={{
            borderColor: `${primary}55`,
            backgroundColor: `${primary}12`,
          }}
        >
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: primary }}
          >
            Client login
          </p>
          {clientLogin ? (
            <a
              href={clientLogin}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block break-all text-xs font-semibold hover:opacity-80"
              style={{ color: primary }}
            >
              {cleanUrl(clientLogin)}
            </a>
          ) : (
            <p className="mt-1 text-xs text-ink-500">Pending Deploy</p>
          )}
          <p className="mt-1 text-[11px] text-ink-600">
            Company admins and customers sign in here. After first sign-in, change
            the password under Settings.
          </p>
          {adminHome ? (
            <p className="mt-2 text-[11px] text-ink-600">
              Company admin home:{" "}
              <a
                className="font-semibold"
                style={{ color: primary }}
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
              className="mt-1 block break-all text-xs font-semibold text-ink-800 hover:text-ink-950"
            >
              {cleanUrl(companySite)}
            </a>
          ) : (
            <p className="mt-1 text-xs text-ink-500">Pending Deploy</p>
          )}
          <p className="mt-1 text-[11px] text-ink-500">
            Marketing / public site for this client.
          </p>
        </div>
      </div>

      {(credentials?.admin_email || pendingProvision) && (
        <div className="rounded-lg border border-sand-200 bg-sand-50 px-3 py-2.5 text-xs text-ink-700">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">
            First admin
          </p>
          {credentials?.admin_email ? (
            <p className="mt-1 font-mono text-[11px]">{credentials.admin_email}</p>
          ) : (
            <p className="mt-1 text-ink-500">Provisioning…</p>
          )}
          {credentials?.temporary_password ? (
            <p className="mt-1 font-mono text-[11px]">
              Temp password: {credentials.temporary_password}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
