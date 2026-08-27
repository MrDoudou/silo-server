import { useMemo } from "react";
import { useSettingsForm } from "@/hooks/useSettingsForm";
import { SettingField } from "./SettingField";
import { SaveBar } from "./SaveBar";
import { FieldGroup } from "./FieldGroup";
import { Skeleton } from "@/components/ui/skeleton";

const REMOTE_MATERIALIZATION_KEY = "artwork.remote_materialization";
const LEGACY_CACHE_IMAGES_KEY = "metadata.cache_images";
const KEYS = [
  "scanner.workers",
  "matcher.workers",
  "matcher.batch_size",
  REMOTE_MATERIALIZATION_KEY,
  LEGACY_CACHE_IMAGES_KEY,
];

export default function ScannerSettings() {
  const form = useSettingsForm({ keys: useMemo(() => KEYS, []) });
  const materialization = form.getValue(REMOTE_MATERIALIZATION_KEY);
  const cacheImagesEnabled =
    materialization !== ""
      ? materialization === "selected"
      : form.getValue(LEGACY_CACHE_IMAGES_KEY) === "true";

  if (form.isLoading)
    return (
      <div className="space-y-6" role="status" aria-label="Loading settings">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
        </div>
        <span className="sr-only">Loading settings</span>
      </div>
    );

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">Scanner & Matcher</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Configure scanner performance and metadata matching. Startup and recurring scans are
          managed in Scheduled Tasks.
        </p>
      </div>

      <div className="flex-1 space-y-6">
        <FieldGroup label="Scanner">
          <SettingField
            label="Scanner Workers"
            type="number"
            value={form.getValue("scanner.workers")}
            onChange={(v) => form.setValue("scanner.workers", v)}
          />
        </FieldGroup>

        <FieldGroup label="Matcher">
          <SettingField
            label="Matcher Workers"
            type="number"
            value={form.getValue("matcher.workers")}
            onChange={(v) => form.setValue("matcher.workers", v)}
          />
          <SettingField
            label="Matcher Batch Size"
            type="number"
            value={form.getValue("matcher.batch_size")}
            onChange={(v) => form.setValue("matcher.batch_size", v)}
          />
        </FieldGroup>

        <FieldGroup label="Metadata">
          <SettingField
            label="Cache remote artwork"
            type="toggle"
            hint="Copy the artwork Silo selects from metadata providers into the canonical artwork store. Clients always load artwork from Silo either way; with this off, images are not stored and each cold request fetches them from the provider. Works with either artwork storage backend, local or S3."
            value={cacheImagesEnabled ? "true" : "false"}
            onChange={(v) => {
              form.setValue(REMOTE_MATERIALIZATION_KEY, v === "true" ? "selected" : "passthrough");
              form.setValue(LEGACY_CACHE_IMAGES_KEY, v);
            }}
          />
        </FieldGroup>
      </div>

      <SaveBar
        dirtyCount={form.dirtyCount}
        onSave={form.save}
        onDiscard={form.discard}
        isSaving={form.isSaving}
        restartRequired={form.restartRequired}
      />
    </div>
  );
}
