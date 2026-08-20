"use client";

import { useState } from "react";
import { ClientDomainActions } from "@/components/ClientDomainActions";
import { ClientLifecycleActions } from "@/components/ClientLifecycleActions";
import { DeployButton } from "@/components/DeployButton";
import { StatusBadge } from "@/components/StatusBadge";
import { TenantDeliverables } from "@/components/TenantDeliverables";
import type { ClientRow } from "@/lib/types";

export type ClientListItem = ClientRow & {
  distributor_id?: string;
  distributors?: { company_name?: string; contact_email?: string } | null;
};

function needsProductProvision(c: ClientListItem) {
  const ext = String(c.external_tenant_id ?? "");
  return !ext || ext.startsWith("pending-") || ext.startsWith("mock-tenant-");
}

export function ClientsList({
  rows,
  isAdmin,
  canManageDomainsFor,
  deployDisabledWhenInactive,
  isRetailer = false,
  inventoryByProductId,
}: {
  rows: ClientListItem[];
  isAdmin: boolean;
  /** distributor id whose clients can manage domains from this login */
  canManageDomainsFor: string | null;
  deployDisabledWhenInactive: boolean;
  isRetailer?: boolean;
  /** Remaining prepaid units per product (retailers only). */
  inventoryByProductId?: Record<string, number>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div className="surface rounded-xl p-8 text-center text-sm text-ink-500">
        No clients yet. Create a draft above to get started.
      </div>
    );
  }

  return (
    <ul className="surface divide-y divide-sand-200 overflow-hidden rounded-xl shadow-soft">
      {rows.map((c) => {
        const open = openId === c.id;
        const hostname = c.portal_hostname ?? c.custom_domain ?? "—";
        const canDomains =
          Boolean(canManageDomainsFor) &&
          (!isAdmin || canManageDomainsFor === c.distributor_id);

        return (
          <li key={c.id}>
            <button
              type="button"
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-sand-50/80 sm:gap-4 sm:px-5"
              onClick={() => setOpenId(open ? null : c.id)}
              aria-expanded={open}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sand-200 bg-white text-ink-500 transition ${
                  open ? "rotate-90 border-brand-300 text-brand-700" : ""
                }`}
                aria-hidden
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="truncate font-semibold text-ink-900">{c.display_name}</p>
                  <StatusBadge status={c.status} />
                </div>
                <p className="mt-0.5 truncate text-xs text-ink-500">
                  {c.slug}
                  <span className="text-ink-300"> · </span>
                  {c.products?.name ?? "—"}
                  {isAdmin ? (
                    <>
                      <span className="text-ink-300"> · </span>
                      {c.distributors?.company_name ?? "—"}
                    </>
                  ) : null}
                </p>
                <p className="mt-1 truncate text-xs text-ink-600 sm:hidden">{hostname}</p>
              </div>
              <div className="hidden min-w-0 max-w-[40%] shrink-0 text-right sm:block">
                <p className="truncate text-sm text-ink-700">{hostname}</p>
                <p className="text-[11px] uppercase tracking-wide text-ink-400">{c.domain_status}</p>
              </div>
            </button>

            {open ? (
              <div className="border-t border-sand-100 bg-sand-50/50 px-4 py-4 sm:px-5 sm:pl-[3.75rem]">
                <div className="space-y-4">
                  <div className="sm:hidden">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
                      Domain
                    </p>
                    <p className="mt-1 break-all text-sm text-ink-800">{hostname}</p>
                    <p className="text-xs text-ink-500">{c.domain_status}</p>
                  </div>

                  {isAdmin ? (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
                        Partner
                      </p>
                      <p className="mt-1 text-sm font-medium text-ink-800">
                        {c.distributors?.company_name ?? "—"}
                      </p>
                      {c.distributors?.contact_email ? (
                        <p className="text-xs text-ink-500">{c.distributors.contact_email}</p>
                      ) : null}
                    </div>
                  ) : null}

                  <TenantDeliverables
                    displayName={c.display_name}
                    portalHostname={c.portal_hostname ?? c.custom_domain}
                    credentials={c.credentials_payload}
                    pendingProvision={needsProductProvision(c)}
                    productSku={c.products?.sku}
                  />

                  {canDomains ? (
                    <ClientDomainActions
                      clientId={c.id}
                      portalHostname={c.portal_hostname}
                      customDomain={c.custom_domain}
                      domainStatus={c.domain_status}
                    />
                  ) : null}

                  {c.provision_error ? (
                    <p className="text-xs text-signal-bad">{c.provision_error}</p>
                  ) : null}

                  {isRetailer &&
                  needsProductProvision(c) &&
                  (inventoryByProductId?.[c.product_id] ?? 0) <= 0 ? (
                    <p className="text-xs text-amber-800">
                      No units left for {c.products?.name ?? "this product"}. Ask Master to sell
                      you more before Deploy.
                    </p>
                  ) : null}

                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <DeployButton
                      clientId={c.id}
                      force={needsProductProvision(c)}
                      label={
                        c.status === "active" && needsProductProvision(c)
                          ? "Finish setup"
                          : c.status === "active"
                            ? "Deployed"
                            : "Deploy"
                      }
                      disabled={
                        deployDisabledWhenInactive ||
                        c.status === "suspended" ||
                        c.status === "cancelled" ||
                        (c.status === "active" && !needsProductProvision(c)) ||
                        (isRetailer &&
                          needsProductProvision(c) &&
                          (inventoryByProductId?.[c.product_id] ?? 0) <= 0)
                      }
                    />
                  </div>

                  {isAdmin ? (
                    <ClientLifecycleActions
                      clientId={c.id}
                      displayName={c.display_name}
                      status={c.status}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
