"use client";

import { useState } from "react";
import { DomainSelfServePanel } from "@/components/DomainSelfServePanel";

export function ClientDomainActions({
  clientId,
  portalHostname,
  customDomain,
  domainStatus,
}: {
  clientId: string;
  portalHostname?: string | null;
  customDomain?: string | null;
  domainStatus?: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3">
      <button
        type="button"
        className="text-xs font-semibold text-brand-700 hover:text-brand-800"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Hide domain steps" : "Connect a personal domain"}
      </button>
      {open ? (
        <div className="mt-3">
          <DomainSelfServePanel
            title="Personal domain for this client"
            subtitle="Use a free .webfinance.app address first. When you want your own brand online (like yourcompany.com), follow the steps below. You pay the domain seller — not Webfinance."
            freeHostname={portalHostname}
            currentDomain={
              customDomain && customDomain !== portalHostname ? customDomain : null
            }
            domainStatus={domainStatus}
            scope="client"
            entityId={clientId}
          />
        </div>
      ) : null}
    </div>
  );
}
