"use client";

import { useMemo, useState } from "react";
import {
  defaultTemplateId,
  productKindFromSku,
  resolveTemplate,
  templatesForKind,
  type ProductKind,
} from "@/lib/product-templates";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export function ClientTemplatePanel({
  clientId,
  productSku,
  metadata,
  externalTenantId,
}: {
  clientId: string;
  productSku?: string | null;
  metadata?: Record<string, unknown> | null;
  externalTenantId?: string | null;
}) {
  const toast = useToast();
  const kind = productKindFromSku(productSku);
  const branding = (metadata?.branding as Record<string, unknown> | undefined) ?? {};
  const initialId =
    (typeof branding.dashboard_template === "string" && branding.dashboard_template) ||
    (kind ? defaultTemplateId(kind) : "retail_classic");

  const [templateId, setTemplateId] = useState(initialId);
  const [saving, setSaving] = useState(false);

  const templates = useMemo(
    () => (kind ? templatesForKind(kind) : []),
    [kind],
  );
  const selected = kind ? resolveTemplate(kind, templateId) : null;

  if (!kind) {
    return (
      <p className="mt-2 text-xs text-ink-400">
        Select a product to choose a customer dashboard template.
      </p>
    );
  }

  async function save(nextId: string) {
    if (!kind) return;
    setSaving(true);
    const tpl = resolveTemplate(kind, nextId);
    const supabase = createClient();
    const nextMeta = {
      ...(metadata ?? {}),
      branding: {
        ...branding,
        dashboard_template: tpl.id,
        dashboard_style: tpl.style,
        feature_flags: tpl.features,
      },
    };
    const { error } = await supabase
      .from("clients")
      .update({ metadata: nextMeta })
      .eq("id", clientId);
    if (error) {
      setSaving(false);
      toast.error(error.message);
      return;
    }
    setTemplateId(tpl.id);

    // Push to live product app when already provisioned
    if (externalTenantId && !String(externalTenantId).startsWith("pending-")) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (session?.access_token && base) {
        try {
          await fetch(`${base}/functions/v1/update-client-template`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ client_id: clientId }),
          });
        } catch {
          /* metadata saved; live sync best-effort */
        }
      }
    }

    setSaving(false);
    toast.success(`Dashboard template set to ${tpl.label}.`);
  }

  return (
    <div className="mt-3 rounded-lg border border-sand-200 bg-sand-50 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">
        Customer dashboard template ({kind === "pm" ? "Parcel Movement" : "Money Movement"})
      </p>
      <p className="mt-1 text-[11px] text-ink-500">
        Editable anytime — style and features for the customer app.
      </p>
      <select
        className="input mt-2"
        value={templateId}
        disabled={saving}
        onChange={(e) => void save(e.target.value)}
      >
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      {selected ? (
        <p className="mt-2 text-[11px] leading-relaxed text-ink-600">{selected.summary}</p>
      ) : null}
    </div>
  );
}

/** Controlled picker for create forms (no save until submit). */
export function TemplatePickerField({
  kind,
  value,
  onChange,
}: {
  kind: ProductKind;
  value: string;
  onChange: (id: string) => void;
}) {
  const templates = templatesForKind(kind);
  const selected = resolveTemplate(kind, value);
  return (
    <div className="md:col-span-2">
      <label className="label" htmlFor="dashboardTemplate">
        Customer dashboard template
      </label>
      <select
        id="dashboardTemplate"
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-ink-500">{selected.summary}</p>
    </div>
  );
}
