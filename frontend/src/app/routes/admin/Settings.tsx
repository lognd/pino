// Settings (/admin/settings) -- docs/design/14-admin-mockup.md: business
// identity and config surfaced as editable fields to prove they are
// configurable, default class capacity, notification toggles. Per
// docs/design/00-overview.md's "bulletproof rule", the business-name
// fields shown here are DISPLAY-ONLY / non-persisting mock inputs -- the
// one real frontend source of truth stays lib/brand.ts (and AppConfig on
// the backend); editing them here never writes back to either.

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAdminSettings, updateAdminSettings, type AdminSettings } from "../../../api/settings";
import { businessLegalName, businessShortName } from "../../../lib/brand";
import { SampleBanner } from "../../../components/SampleBanner";
import { BigButton } from "../../../components/BigButton";
import { Field } from "../../../components/Field";

export function AdminSettings() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: fetchAdminSettings,
  });

  const [form, setForm] = useState<AdminSettings | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const mutation = useMutation({
    mutationFn: (patch: Partial<AdminSettings>) => updateAdminSettings(patch),
    onSuccess: async (updated) => {
      setForm(updated);
      await queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
    },
  });

  return (
    <main className="mx-auto max-w-md px-4 py-12 pt-16">
      <SampleBanner />
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        Settings
      </h1>

      {isLoading && <p className="mt-6 text-lg text-mp-muted">Loading...</p>}
      {isError && <p className="mt-6 text-lg text-mp-red-text">Could not load settings.</p>}

      {form && (
        <div className="mt-8 flex flex-col gap-8">
          <section>
            <h2 className="text-2xl font-bold uppercase text-mp-white">Business identity</h2>
            <p className="mt-1 text-lg text-mp-muted">
              Display-only mock fields, non-persisting -- the real source of truth is{" "}
              <code>lib/brand.ts</code> (frontend) and <code>AppConfig</code> (backend), per
              docs/design/00-overview.md. Currently: {businessShortName} ({businessLegalName}).
            </p>
            <div className="mt-4 flex flex-col gap-6">
              <Field
                id="business-legal-name"
                label="Business legal name"
                value={form.business_legal_name}
                onChange={(e) => setForm({ ...form, business_legal_name: e.target.value })}
              />
              <Field
                id="business-short-name"
                label="Business short name"
                value={form.business_short_name}
                onChange={(e) => setForm({ ...form, business_short_name: e.target.value })}
              />
            </div>
          </section>

          <section className="flex flex-col gap-6">
            <h2 className="text-2xl font-bold uppercase text-mp-white">Class defaults</h2>
            <Field
              id="default-capacity"
              label="Default class capacity"
              type="number"
              min={1}
              value={form.default_class_capacity}
              onChange={(e) => setForm({ ...form, default_class_capacity: Number(e.target.value) })}
            />
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-2xl font-bold uppercase text-mp-white">Reminders</h2>
            <label className="flex items-center gap-3 text-lg text-mp-white">
              <input
                type="checkbox"
                className="h-6 w-6"
                checked={form.email_reminders_enabled}
                onChange={(e) => setForm({ ...form, email_reminders_enabled: e.target.checked })}
              />
              Email reminders enabled
            </label>
            <label className="flex items-center gap-3 text-lg text-mp-white">
              <input
                type="checkbox"
                className="h-6 w-6"
                checked={form.sms_reminders_enabled}
                onChange={(e) => setForm({ ...form, sms_reminders_enabled: e.target.checked })}
              />
              SMS reminders enabled
            </label>
          </section>

          <BigButton
            type="button"
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate({
                default_class_capacity: form.default_class_capacity,
                email_reminders_enabled: form.email_reminders_enabled,
                sms_reminders_enabled: form.sms_reminders_enabled,
              })
            }
          >
            {mutation.isPending ? "Saving..." : "Save (mock-only)"}
          </BigButton>
          {mutation.isSuccess && <p className="text-lg text-mp-success">Saved (in-memory only).</p>}
        </div>
      )}
    </main>
  );
}
