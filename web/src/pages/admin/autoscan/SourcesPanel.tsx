import { useCallback, useId, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Plus,
  RefreshCw,
  Trash2,
  Webhook,
  X,
} from "lucide-react";
import { Link } from "react-router";
import { toast } from "@/i18n/toast";
import type {
  AutoscanDeliveryMode,
  AutoscanScanSourceDescriptor,
  AutoscanPathRewrite,
  AutoscanRewriteSuggestions,
  AutoscanSource,
  AutoscanSourceInput,
  AutoscanWebhookProvider,
} from "@/api/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useAutoscanConnections,
  useAutoscanRewriteSuggestions,
  useAutoscanSettings,
  useAutoscanSources,
  useAvailableScanSources,
  useCreateAutoscanSource,
  useCreateAutoscanWebhook,
  useDeleteAutoscanSource,
  useRotateAutoscanWebhook,
  useUpdateAutoscanSource,
} from "@/hooks/queries/useAutoscan";
import {
  buildPluginDisplayNames,
  composeSourceLabel,
  pluginDisplayNameKey,
} from "@/lib/autoscanLabels";
import { useAdminLibraries } from "@/hooks/queries/admin/libraries";
import SourceConfigForm from "./SourceConfigForm";
import { ChoiceCard, StepTrail } from "./ChoiceCard";
import InlineConnectionPicker, { type ConnectionOption } from "./InlineConnectionPicker";
import { sourceTargets } from "./sourceTargets";
import { WebhookInstructions, WebhookMappingEditor } from "./WebhookSetupStep";
import { hasUsableMapping, seedMappings, usableMappings, type MappingDraft } from "./webhookSetup";
import {
  connectionIsMandatory,
  parseConfigValues,
  serializeConfigValues,
  connectionMatchesKinds,
  defaultDeliveryMode,
  DEFAULT_DESCRIPTOR,
  descriptorFor,
  initialConfigValues,
  needsConnectionStep,
  needsDeliveryChoice,
} from "./sourceDescriptor";
import { formatRelativeTime as formatRelativeTimeBase } from "@/lib/date";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a source's display name from its persisted state via the shared label
 * chain (operator label -> connection name -> manifest display_name -> capability).
 * Used where no live row-edit state is available (e.g. the delete dialog); inside
 * a SourceRow, prefer the row's `resolvedLabel` which reflects in-progress edits.
 */
function resolveSourceName(
  source: AutoscanSource,
  connectionOptions: Array<{ id: string; name: string }>,
  pluginDisplayNames: Map<string, string>,
): string {
  return composeSourceLabel({
    operatorLabel: source.label,
    connectionName: connectionOptions.find((c) => c.id === (source.connection_id ?? ""))?.name,
    displayName: pluginDisplayNames.get(
      pluginDisplayNameKey(source.plugin_id, source.capability_id),
    ),
    capabilityId: source.capability_id,
    pluginId: source.plugin_id,
  }).name;
}

function formatRelativeTime(isoString: string | null): string {
  return (
    formatRelativeTimeBase(isoString, { rounding: "floor", justNowLabel: "Just now" }) ?? "Never"
  );
}

// ---------------------------------------------------------------------------
// Row state for per-row edits (connection + interval + rewrites)
// ---------------------------------------------------------------------------

interface RowEdit {
  connectionId: string; // "" means no connection
  intervalStr: string; // "" means use default
  rewrites: AutoscanPathRewrite[];
  /** Typed while the renderer owns them; serialized only on save. */
  sourceConfig: Record<string, unknown>;
  label: string;
  /** False while a required or validated config field is unsatisfied. */
  configValid: boolean;
  /** Set once the operator changes anything, so a late re-parse cannot clobber it. */
  dirty: boolean;
}

function sourceToRowEdit(
  source: AutoscanSource,
  descriptor: AutoscanScanSourceDescriptor,
): RowEdit {
  return {
    connectionId: source.connection_id ?? "",
    intervalStr: source.poll_interval_seconds != null ? String(source.poll_interval_seconds) : "",
    rewrites: source.path_rewrites.map((r) => ({ ...r })),
    sourceConfig: parseConfigValues(descriptor, sourceConfigForEdit(source)),
    label: source.label ?? "",
    configValid: true,
    dirty: false,
  };
}

const WEBHOOK_PROVIDER_KEY = "webhook_provider";

function isWebhookSource(source: AutoscanSource): boolean {
  return source.delivery_mode === "webhook";
}

/**
 * Which arr a webhook source expects, for the setup instructions. A descriptor
 * naming exactly one connection kind tells us; anything else stays "auto",
 * which shows the union of both services' triggers.
 */
function webhookProviderOf(
  descriptor: AutoscanScanSourceDescriptor,
  sourceConfig?: Record<string, string>,
): AutoscanWebhookProvider | "auto" {
  // An explicit choice in the source's own config wins: the built-in descriptor
  // advertises both arr kinds, so relying on it alone would always yield "auto"
  // and show combined instructions even after the operator picked one.
  const chosen = sourceConfig?.[WEBHOOK_PROVIDER_KEY];
  if (chosen === "sonarr" || chosen === "radarr") return chosen;

  const kinds = descriptor.connection_kinds ?? [];
  if (kinds.length === 1 && (kinds[0] === "sonarr" || kinds[0] === "radarr")) {
    return kinds[0];
  }
  return "auto";
}

/** Resolve a possibly relative webhook_url against the admin UI's own origin. */
function absoluteWebhookURL(url: string): string {
  return url.startsWith("/") ? `${window.location.origin}${url}` : url;
}

/**
 * Legacy source_config keys that were superseded by a newer key. Rows written
 * before the rename still carry the old key, so its lines are merged into the
 * new one when the editor loads and the old key is dropped — the first save
 * from this editor migrates the row forward rather than carrying both.
 */
const LEGACY_CONFIG_KEY_ALIASES: Record<string, string> = {
  movie_nested_paths: "movie_flat_paths",
  tv_nested_paths: "tv_flat_paths",
};

/**
 * The plugin whose keys the aliases above belong to. Applying them globally
 * would silently rename an unrelated plugin's identically-named key on the
 * first full-state save, losing its configuration.
 */
const CEPHFS_PLUGIN_ID = "silo.autoscan.cephfs";
const CEPHFS_CAPABILITY_ID = "cephfs";

function ownsLegacyAliases(source: AutoscanSource): boolean {
  return source.plugin_id === CEPHFS_PLUGIN_ID && source.capability_id === CEPHFS_CAPABILITY_ID;
}

/** Merge newline-separated values, de-duplicating and dropping blanks. */
function mergeLines(...values: Array<string | undefined>): string {
  const lines = new Set<string>();
  for (const value of values) {
    (value ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => lines.add(line));
  }
  return Array.from(lines).join("\n");
}

/**
 * Prepare a source's stored config for editing: pass values through as-is,
 * folding any superseded key into its replacement so nothing an operator
 * previously configured silently disappears from the form.
 *
 * Scoped to the plugin that owns those keys — see ownsLegacyAliases.
 */
function sourceConfigForEdit(source: AutoscanSource): Record<string, string> {
  const config = { ...(source.source_config ?? {}) };
  if (!ownsLegacyAliases(source)) return config;

  for (const [legacyKey, currentKey] of Object.entries(LEGACY_CONFIG_KEY_ALIASES)) {
    if (config[legacyKey] === undefined) continue;
    config[currentKey] = mergeLines(config[currentKey], config[legacyKey]);
    delete config[legacyKey];
  }
  return config;
}

function normalizeSourceConfig(config: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(config)) {
    const trimmedKey = key.trim();
    if (!trimmedKey) continue;
    out[trimmedKey] = value.trim();
  }
  return out;
}

// ---------------------------------------------------------------------------
// RewriteEditor — expandable section inside a SourceRow
// ---------------------------------------------------------------------------

function RewriteEditor({
  sourceId,
  hasConnection,
  rewrites,
  onChange,
  onSave,
  isSaving,
}: {
  sourceId: string;
  hasConnection: boolean;
  rewrites: AutoscanPathRewrite[];
  onChange: (next: AutoscanPathRewrite[]) => void;
  onSave: (rewrites?: AutoscanPathRewrite[]) => void;
  isSaving: boolean;
}) {
  useUILanguage();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const [rewriteError, setRewriteError] = useState<string | null>(null);

  const suggest = useAutoscanRewriteSuggestions();
  const [preview, setPreview] = useState<AutoscanRewriteSuggestions | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function updateRewrite(index: number, patch: Partial<AutoscanPathRewrite>) {
    setRewriteError(null);
    onChange(rewrites.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRewrite() {
    onChange([...rewrites, { from: "", to: "" }]);
    setOpen(true);
  }

  function removeRewrite(index: number) {
    setRewriteError(null);
    onChange(rewrites.filter((_, i) => i !== index));
  }

  async function handleSync() {
    const s = await suggest.mutateAsync(sourceId);
    setPreview(s);
    setSelected(new Set((s.proposed ?? []).map((p) => p.from)));
    setOpen(true);
  }

  function toggleSelected(from: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(from)) {
        next.delete(from);
      } else {
        next.add(from);
      }
      return next;
    });
  }

  /** Merge the checked proposed rewrites into the list (dedupe by `from`) and save. */
  function applySelected() {
    if (!preview) return;
    const existingFroms = new Set(rewrites.map((r) => r.from));
    const additions = preview.proposed
      .filter((p) => selected.has(p.from) && !existingFroms.has(p.from))
      .map((p) => ({ from: p.from, to: p.to }));
    const merged = [...rewrites, ...additions];
    onChange(merged);
    setPreview(null);
    setOpen(true);
    // Persist immediately via the normal full-state source PUT.
    onSave(merged);
  }

  function handleSave() {
    // Validate: any non-empty row must have both from and to filled in.
    const hasIncomplete = rewrites.some(
      (r) =>
        (r.from.trim().length > 0 && r.to.trim().length === 0) ||
        (r.from.trim().length === 0 && r.to.trim().length > 0),
    );
    if (hasIncomplete) {
      setRewriteError(
        tr("pages.admin.autoscan.sources_panel.each_rewrite_must_have_both_a_from_and_a_to"),
      );
      return;
    }
    setRewriteError(null);
    onSave();
  }

  const syncDisabled = !hasConnection || suggest.isPending;

  return (
    <div className="border-border mt-3 rounded-md border">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
      >
        {open ? (
          <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
        )}
        <span className="text-sm font-medium">
          {tr("pages.admin.autoscan.sources_panel.path_rewrites")}
        </span>
        {rewrites.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {rewrites.length}
          </Badge>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          className="space-y-3 px-3 pb-3"
          role="region"
          aria-label={tr("pages.admin.autoscan.sources_panel.path_rewrites")}
        >
          {rewrites.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              {tr(
                "pages.admin.autoscan.sources_panel.no_path_rewrites_map_remote_paths_from_the_scan_source",
              )}
            </p>
          ) : (
            <div className="space-y-2">
              {rewrites.map((rewrite, index) => (
                <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label className="text-muted-foreground text-xs">
                      {tr("pages.admin.autoscan.sources_panel.from")}
                    </Label>
                    <Input
                      value={rewrite.from}
                      onChange={(e) => updateRewrite(index, { from: e.target.value })}
                      placeholder={tr("pages.admin.autoscan.sources_panel.remote_media")}
                      className="h-8 text-sm"
                      aria-label={tr("pages.admin.autoscan.sources_panel.rewrite_value_from_path", {
                        value: index + 1,
                      })}
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label className="text-muted-foreground text-xs">
                      {tr("pages.admin.autoscan.sources_panel.to")}
                    </Label>
                    <Input
                      value={rewrite.to}
                      onChange={(e) => updateRewrite(index, { to: e.target.value })}
                      placeholder={tr("pages.admin.autoscan.sources_panel.media")}
                      className="h-8 text-sm"
                      aria-label={tr("pages.admin.autoscan.sources_panel.rewrite_value_to_path", {
                        value: index + 1,
                      })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeRewrite(index)}
                    aria-label={tr("pages.admin.autoscan.sources_panel.remove_rewrite_value", {
                      value: index + 1,
                    })}
                    className="shrink-0 self-end sm:mb-0.5"
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {rewriteError && <p className="text-destructive text-xs">{rewriteError}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={addRewrite}>
              <Plus className="size-3.5" />
              {tr("pages.admin.autoscan.sources_panel.add_rewrite")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={syncDisabled}
              onClick={handleSync}
              title={
                hasConnection
                  ? tr(
                      "pages.admin.autoscan.sources_panel.fetch_root_folder_mappings_from_the_connected_server",
                    )
                  : tr("pages.admin.autoscan.sources_panel.bind_a_connection_first")
              }
            >
              <RefreshCw className={"size-3.5 " + (suggest.isPending ? "animate-spin" : "")} />
              {suggest.isPending
                ? tr("pages.admin.autoscan.sources_panel.syncing")
                : tr("pages.admin.autoscan.sources_panel.sync_from_server")}
            </Button>
            <Button type="button" size="sm" disabled={isSaving} onClick={handleSave}>
              {tr("pages.admin.autoscan.sources_panel.save_rewrites")}
            </Button>
          </div>

          {/* Sync-from-arr preview */}
          {preview && (
            <div
              className="border-border space-y-4 rounded-md border p-3"
              role="region"
              aria-label={tr("pages.admin.autoscan.sources_panel.rewrite_suggestions")}
            >
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {tr("pages.admin.autoscan.sources_panel.proposed")}
                </p>
                {preview.proposed.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    {tr("pages.admin.autoscan.sources_panel.no_proposed_rewrites")}
                  </p>
                ) : (
                  preview.proposed.map((proposal) => (
                    <label key={proposal.from} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selected.has(proposal.from)}
                        onChange={() => toggleSelected(proposal.from)}
                      />
                      <span className="font-mono text-xs">
                        {proposal.from} → {proposal.to}
                      </span>
                      {proposal.match_depth >= 2 ? (
                        <Badge variant="secondary" className="text-xs">
                          {tr("pages.admin.autoscan.sources_panel.match_depth_segments", {
                            match_depth: proposal.match_depth,
                          })}
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs">
                          {tr("pages.admin.autoscan.sources_panel.value_1_segment_weak")}
                        </Badge>
                      )}
                    </label>
                  ))
                )}
              </div>

              {preview.unmatched.length > 0 && (
                <CollapsibleList
                  title={tr("pages.admin.autoscan.sources_panel.no_silo_match_length", {
                    length: preview.unmatched.length,
                  })}
                  items={preview.unmatched}
                />
              )}

              {preview.ambiguous.length > 0 && (
                <CollapsibleList
                  title={tr("pages.admin.autoscan.sources_panel.ambiguous_length", {
                    length: preview.ambiguous.length,
                  })}
                  items={preview.ambiguous.map((a) => `${a.root} → ${a.candidates.join(", ")}`)}
                />
              )}

              {preview.covered.length > 0 && (
                <CollapsibleList
                  title={tr("pages.admin.autoscan.sources_panel.already_mapped_length", {
                    length: preview.covered.length,
                  })}
                  items={preview.covered}
                />
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" disabled={isSaving} onClick={applySelected}>
                  {tr("pages.admin.autoscan.sources_panel.apply_selected")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setPreview(null)}>
                  {tr("common.actions.cancel")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Collapsed list section used inside the sync-from-arr preview. */
function CollapsibleList({ title, items }: { title: string; items: string[] }) {
  useUILanguage();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="space-y-1">
      <button
        type="button"
        className="flex items-center gap-1.5 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
      >
        {open ? (
          <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
        )}
        <span className="text-sm font-medium">{title}</span>
      </button>
      {open && (
        <ul id={panelId} className="text-muted-foreground space-y-0.5 pl-5 text-xs">
          {items.map((item) => (
            <li key={item} className="font-mono break-all">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WebhookEndpointSection — webhook-mode replacement for the poll interval
// ---------------------------------------------------------------------------

function WebhookEndpointSection({
  source,
  provider,
  onProviderChange,
  isSaving,
}: {
  source: AutoscanSource;
  provider: AutoscanWebhookProvider;
  onProviderChange: (next: AutoscanWebhookProvider) => void;
  isSaving: boolean;
}) {
  useUILanguage();
  const createWebhook = useCreateAutoscanWebhook();
  const rotateWebhook = useRotateAutoscanWebhook();
  const [rotateOpen, setRotateOpen] = useState(false);

  const url = source.webhook_url ? absoluteWebhookURL(source.webhook_url) : "";

  async function copyURL() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("feedback.admin.autoscan.sources_panel.webhook_url_copied");
    } catch {
      toast.error("errors.admin.autoscan.sources_panel.could_not_copy_select_the_url_manually");
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-muted-foreground text-xs">
          {tr("pages.admin.autoscan.sources_panel.webhook_url")}
        </Label>
        {source.webhook_configured ? (
          <>
            <div className="flex items-center gap-1.5">
              <Input
                readOnly
                value={url || `…${source.webhook_secret_suffix ?? ""} (URL unavailable)`}
                className="h-8 font-mono text-xs"
                aria-label={tr("pages.admin.autoscan.sources_panel.webhook_delivery_url")}
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={copyURL}
                disabled={!url}
                aria-label={tr("pages.admin.autoscan.sources_panel.copy_webhook_url")}
              >
                <Copy className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => setRotateOpen(true)}
                disabled={rotateWebhook.isPending}
                aria-label={tr("pages.admin.autoscan.sources_panel.rotate_webhook_url")}
                title={tr(
                  "pages.admin.autoscan.sources_panel.replace_the_url_the_old_one_stops_working_immediately",
                )}
              >
                <RefreshCw
                  className={"size-3.5 " + (rotateWebhook.isPending ? "animate-spin" : "")}
                />
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              {tr(
                "pages.admin.autoscan.sources_panel.paste_into_sonarr_radarr_settings_connect_webhook_on_import_on",
              )}
            </p>
          </>
        ) : (
          <div className="space-y-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={createWebhook.isPending}
              onClick={() => createWebhook.mutate(source.id)}
            >
              <Webhook className="size-3.5" />
              {createWebhook.isPending
                ? tr("pages.admin.autoscan.sources_panel.generating")
                : tr("pages.admin.autoscan.sources_panel.generate_webhook_url")}
            </Button>
            <p className="text-muted-foreground text-xs">
              {tr(
                "pages.admin.autoscan.sources_panel.creates_the_url_sonarr_radarr_will_post_import_rename_and",
              )}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-muted-foreground text-xs">
          {tr("pages.admin.autoscan.sources_panel.provider")}
        </Label>
        <Select
          value={provider}
          onValueChange={(v) => onProviderChange(v as AutoscanWebhookProvider)}
          disabled={isSaving}
        >
          <SelectTrigger
            className="w-[140px]"
            aria-label={tr("pages.admin.autoscan.sources_panel.webhook_payload_provider")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">{tr("pages.admin.autoscan.sources_panel.auto")}</SelectItem>
            <SelectItem value="sonarr">
              {tr("pages.admin.autoscan.sources_panel.sonarr")}
            </SelectItem>
            <SelectItem value="radarr">
              {tr("pages.admin.autoscan.sources_panel.radarr")}
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">
          {tr("pages.admin.autoscan.sources_panel.auto_infers_sonarr_vs_radarr_from_each_payload")}
        </p>
      </div>

      {/* Rotate confirmation */}
      <AlertDialog open={rotateOpen} onOpenChange={setRotateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tr("pages.admin.autoscan.sources_panel.rotate_webhook_url_fd4816d7")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tr(
                "pages.admin.autoscan.sources_panel.the_current_url_stops_working_immediately_sonarr_radarr_keep_sending",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("common.actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                rotateWebhook.mutate(source.id);
                setRotateOpen(false);
              }}
            >
              {tr("pages.admin.autoscan.sources_panel.rotate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SourceRow helpers
// ---------------------------------------------------------------------------

/**
 * Safely parse an interval string for inclusion in a source PUT body.
 *
 * - Empty/blank → null (intentional "use the global default").
 * - Valid positive integer → that integer.
 * - Anything else (NaN, non-integer, < 1, mid-edit garbage) → fall back to
 *   the source's currently-persisted value so an unrelated save (enable toggle,
 *   connection change) never corrupts the interval.
 */
function parseInterval(intervalStr: string, current: number | null): number | null {
  const t = intervalStr.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 1) return current;
  return n;
}

// ---------------------------------------------------------------------------
// SourceRow
// ---------------------------------------------------------------------------

function SourceRow({
  source,
  descriptor,
  connectionOptions,
  pluginDisplayNames,
  globalPollInterval,
  onDelete,
  layout = "table",
}: {
  source: AutoscanSource;
  /** Setup contract for this source's capability; drives its config fields. */
  descriptor: AutoscanScanSourceDescriptor;
  connectionOptions: ConnectionOption[];
  pluginDisplayNames: Map<string, string>;
  globalPollInterval: number | null;
  onDelete: (source: AutoscanSource) => void;
  layout?: "table" | "card";
}) {
  useUILanguage();
  const update = useUpdateAutoscanSource();
  const libraries = useAdminLibraries();
  const [edit, setEdit] = useState<RowEdit>(() => sourceToRowEdit(source, descriptor));

  // /sources and /scan-source-plugins are independent queries. When the row
  // mounts first it parses with DEFAULT_DESCRIPTOR, leaving switch and
  // multi-select values as raw strings — "false" would render as an enabled
  // switch. Re-parse during render once the real descriptor arrives, rather
  // than from an effect: setting state in an effect costs an extra render pass
  // and is the pattern that produced a render loop here already.
  //
  // Only while the row is untouched, so an in-progress edit is never discarded.
  const [parsedWith, setParsedWith] = useState(descriptor);
  if (parsedWith !== descriptor) {
    setParsedWith(descriptor);
    if (!edit.dirty) setEdit(sourceToRowEdit(source, descriptor));
  }
  const [intervalError, setIntervalError] = useState(false);

  const isDirty =
    edit.connectionId !== (source.connection_id ?? "") ||
    edit.intervalStr !==
      (source.poll_interval_seconds != null ? String(source.poll_interval_seconds) : "");

  /** Build the full desired state to send on every mutation — always includes path_rewrites. */
  function fullBody(overrides: Partial<AutoscanSourceInput>): AutoscanSourceInput {
    const intervalVal = parseInterval(edit.intervalStr, source.poll_interval_seconds);
    // Trim and drop empty rewrite rows before sending.
    const path_rewrites = edit.rewrites
      .map((r) => ({ from: r.from.trim(), to: r.to.trim() }))
      .filter((r) => r.from.length > 0 && r.to.length > 0);
    return {
      connection_id: edit.connectionId === "" ? null : edit.connectionId,
      enabled: source.enabled,
      poll_interval_seconds: intervalVal,
      path_rewrites,
      // Unrelated mutations (enable, label, interval, rewrites) must not carry
      // an in-progress invalid draft into a full-state save — that would bypass
      // the validity gate and could enable a source the plugin cannot use. Send
      // what is already persisted instead; the config button owns config saves.
      source_config: edit.configValid
        ? normalizeSourceConfig(serializeConfigValues(edit.sourceConfig, descriptor))
        : { ...(source.source_config ?? {}) },
      label: edit.label.trim(),
      ...overrides,
    };
  }

  function handleToggleEnabled(checked: boolean) {
    update.mutate({
      id: source.id,
      body: fullBody({ enabled: checked }),
    });
  }

  function handleIntervalBlur() {
    const raw = edit.intervalStr.trim();
    if (raw === "") {
      setIntervalError(false);
      if (isDirty) update.mutate({ id: source.id, body: fullBody({}) });
      return;
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) {
      setIntervalError(true);
      return;
    }
    setIntervalError(false);
    if (isDirty) update.mutate({ id: source.id, body: fullBody({}) });
  }

  // Label uses its own dirty-check (isDirty covers only connectionId/intervalStr).
  function handleLabelBlur() {
    if (edit.label.trim() === source.label.trim()) return;
    update.mutate({ id: source.id, body: fullBody({}) });
  }

  function handleConnectionChange(value: string) {
    const next = value === "__none__" ? "" : value;
    setEdit((e) => ({ ...e, connectionId: next }));
    // Auto-save connection change immediately; always send full state via fullBody
    // so the interval is computed safely (never corrupted by mid-edit garbage).
    update.mutate({
      id: source.id,
      body: fullBody({ connection_id: next === "" ? null : next }),
    });
  }

  function handleRewriteSave(rewrites?: AutoscanPathRewrite[]) {
    // When called from "Apply selected", the merged rewrites are passed in
    // directly to avoid a stale-state read (setEdit hasn't flushed yet).
    const path_rewrites = (rewrites ?? edit.rewrites)
      .map((r) => ({ from: r.from.trim(), to: r.to.trim() }))
      .filter((r) => r.from.length > 0 && r.to.length > 0);
    update.mutate({
      id: source.id,
      body: fullBody({ path_rewrites }),
    });
  }

  function handleSourceConfigSave(nextConfig?: Record<string, unknown>) {
    const sourceConfig = nextConfig ?? edit.sourceConfig;
    update.mutate({
      id: source.id,
      body: fullBody({
        source_config: normalizeSourceConfig(serializeConfigValues(sourceConfig, descriptor)),
      }),
    });
  }

  function handleProviderChange(next: AutoscanWebhookProvider) {
    const sourceConfig = { ...edit.sourceConfig, [WEBHOOK_PROVIDER_KEY]: next };
    setEdit((ed) => ({ ...ed, sourceConfig }));
    update.mutate({
      id: source.id,
      body: fullBody({ source_config: normalizeSourceConfig(sourceConfig) }),
    });
  }

  // Whether this source has a bound connection (server-side or pending edit).
  // Used to gate the Sync-from-server button, which needs a server to query.
  const hasEffectiveConnection = Boolean(source.connection_id) || Boolean(edit.connectionId);

  const isWebhook = isWebhookSource(source);

  // Status column. Poll sources report last_run_at/last_error; webhook sources
  // report their endpoint's delivery bookkeeping instead (deliveries do not
  // stamp last_run_at).
  const webhookReceivedMs = source.webhook_last_received_at
    ? new Date(source.webhook_last_received_at).getTime()
    : 0;
  const webhookErrorMs = source.webhook_last_error_at
    ? new Date(source.webhook_last_error_at).getTime()
    : 0;
  const hasError = isWebhook
    ? webhookErrorMs > 0 && webhookErrorMs >= webhookReceivedMs
    : Boolean(source.last_error);
  const hasRun = isWebhook ? webhookReceivedMs > 0 : Boolean(source.last_run_at);
  const statusErrorMessage = isWebhook
    ? source.webhook_last_error_message || source.last_error || "Delivery failed"
    : (source.last_error ?? "");
  const statusTimestamp = isWebhook
    ? (source.webhook_last_received_at ?? null)
    : source.last_run_at;
  const connectionSelectClass = layout === "card" ? "!w-full min-w-0 max-w-full" : "w-[200px]";
  const statusMessageClass =
    layout === "card"
      ? "text-muted-foreground min-w-0 max-w-full whitespace-normal break-words text-xs [overflow-wrap:anywhere]"
      : "text-muted-foreground min-w-0 max-w-full truncate text-xs";
  const intervalHelp =
    globalPollInterval != null
      ? `Floor only - values below the global default (${globalPollInterval}s) have no effect.`
      : "Floor only - values below the global default poll interval have no effect.";

  const resolvedLabel = composeSourceLabel({
    operatorLabel: edit.label,
    connectionName: connectionOptions.find(
      (c) => c.id === (edit.connectionId || source.connection_id || ""),
    )?.name,
    displayName: pluginDisplayNames.get(
      pluginDisplayNameKey(source.plugin_id, source.capability_id),
    ),
    capabilityId: source.capability_id,
    pluginId: source.plugin_id,
  });
  // What this source keeps fresh. A source that can never resolve to a library
  // says so here rather than running cleanly and silently doing nothing, which
  // was the most common "I set it up and nothing happened" report.
  const targets = sourceTargets(source, descriptor, libraries.data ?? []);
  const targetSummary = libraries.isLoading ? null : targets.unknown ? (
    <p className="text-muted-foreground text-xs">
      {tr("pages.admin.autoscan.sources_panel.targets_determined_at_scan_time")}
    </p>
  ) : targets.unresolvable ? (
    <p className="text-destructive flex items-center gap-1 text-xs">
      <AlertTriangle className="size-3 shrink-0" />
      {tr(
        "pages.admin.autoscan.sources_panel.no_paths_configured_this_source_can_t_match_anything_yet",
      )}
    </p>
  ) : targets.libraries.length === 0 ? (
    <p className="text-xs text-amber-500">
      {tr("pages.admin.autoscan.sources_panel.paths_don_t_match_any_library_root_scans_won_t")}
    </p>
  ) : (
    <p className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
      <span>{tr("pages.admin.autoscan.sources_panel.feeds")}</span>
      {targets.libraries.map((library) => (
        <Badge key={library.id} variant="outline" className="text-xs font-normal">
          {library.name}
        </Badge>
      ))}
    </p>
  );

  const sourceIdentity = (
    <div className="min-w-0 space-y-1">
      <div className="min-w-0 space-y-0.5">
        <p className="flex items-center gap-1.5 truncate leading-none font-medium">
          {resolvedLabel.name}
          {isWebhook && (
            <Badge variant="secondary" className="shrink-0 text-xs">
              <Webhook className="size-3" />
              {tr("pages.admin.autoscan.sources_panel.webhook")}
            </Badge>
          )}
        </p>
        <p className="text-muted-foreground text-xs">{resolvedLabel.detail}</p>
        {targetSummary}
      </div>
      <Input
        value={edit.label}
        placeholder={tr("pages.admin.autoscan.sources_panel.custom_label_optional")}
        aria-label={tr("pages.admin.autoscan.sources_panel.custom_label_for_name", {
          name: resolvedLabel.name,
        })}
        className="h-7 text-xs"
        onChange={(e) => setEdit((ed) => ({ ...ed, label: e.target.value }))}
        onBlur={handleLabelBlur}
      />
    </div>
  );

  const statusNode = hasError ? (
    <div className="flex max-w-full min-w-0 items-start gap-1.5 overflow-hidden text-sm">
      <AlertTriangle className="text-destructive size-4 shrink-0" />
      <div className="min-w-0 space-y-0.5">
        <p className="text-destructive leading-none font-medium">
          {tr("pages.admin.autoscan.sources_panel.error")}
        </p>
        <p className={statusMessageClass} title={statusErrorMessage}>
          {statusErrorMessage}
        </p>
      </div>
    </div>
  ) : hasRun ? (
    <div className="flex max-w-full min-w-0 items-center gap-1.5 overflow-hidden text-sm">
      <CheckCircle2 className="size-4 shrink-0 text-green-500" />
      <div className="min-w-0 space-y-0.5">
        <p className="leading-none font-medium">{tr("pages.admin.autoscan.sources_panel.ok")}</p>
        <p className="text-muted-foreground flex items-center gap-1 text-xs">
          <Clock className="size-3" />
          {formatRelativeTime(statusTimestamp)}
        </p>
      </div>
    </div>
  ) : (
    <span className="text-muted-foreground text-sm">
      {isWebhook
        ? tr("pages.admin.autoscan.sources_panel.no_deliveries_yet")
        : tr("pages.admin.autoscan.sources_panel.not_run_yet")}
    </span>
  );

  // Editing must respect the same contract the add flow enforced, or an
  // operator can unbind a `required` source, bind an incompatible kind, or
  // attach credentials to a `none` source right after creating it correctly.
  const rowConnectionRequired = connectionIsMandatory(descriptor, source.delivery_mode);
  const rowEligibleConnections = connectionOptions.filter((c) =>
    connectionMatchesKinds(descriptor, c.kind),
  );

  const connectionControl = isWebhook ? (
    <span className="text-muted-foreground text-xs">
      {tr("pages.admin.autoscan.sources_panel.not_needed_sonarr_radarr_deliver_directly")}
    </span>
  ) : !needsConnectionStep(descriptor, source.delivery_mode) ? (
    <span className="text-muted-foreground text-xs">
      {tr("pages.admin.autoscan.sources_panel.not_needed_reads_locally")}
    </span>
  ) : source.connection_id === null && !edit.connectionId ? (
    <div className="flex max-w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
      <Select value="__none__" onValueChange={handleConnectionChange}>
        <SelectTrigger
          className={connectionSelectClass}
          aria-label={tr("pages.admin.autoscan.sources_panel.connection_for_name", {
            name: resolvedLabel.name,
          })}
        >
          <SelectValue placeholder={tr("pages.admin.autoscan.sources_panel.no_connection")} />
        </SelectTrigger>
        <SelectContent>
          {!rowConnectionRequired && (
            <SelectItem value="__none__">
              {tr("pages.admin.autoscan.sources_panel.no_connection_9f71720b")}
            </SelectItem>
          )}
          {rowEligibleConnections.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Badge
        variant="outline"
        className={
          rowConnectionRequired
            ? "text-destructive w-fit shrink-0"
            : "text-muted-foreground w-fit shrink-0"
        }
      >
        {rowConnectionRequired
          ? tr("pages.admin.autoscan.sources_panel.connection_required")
          : tr("pages.admin.autoscan.sources_panel.no_connection")}
      </Badge>
    </div>
  ) : (
    <Select value={edit.connectionId || "__none__"} onValueChange={handleConnectionChange}>
      <SelectTrigger
        className={connectionSelectClass}
        aria-label={tr("pages.admin.autoscan.sources_panel.connection_for_name", {
          name: resolvedLabel.name,
        })}
      >
        <SelectValue placeholder={tr("pages.admin.autoscan.sources_panel.no_connection")} />
      </SelectTrigger>
      <SelectContent>
        {!rowConnectionRequired && (
          <SelectItem value="__none__">
            {tr("pages.admin.autoscan.sources_panel.no_connection_9f71720b")}
          </SelectItem>
        )}
        {rowEligibleConnections.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  // Webhook payload paths are arr-side paths and still need host-side
  // rewrites in Docker/mount-mismatch setups, so the rewrite editor stays
  // visible in both modes.
  const rewriteEditor = (
    <RewriteEditor
      sourceId={source.id}
      hasConnection={hasEffectiveConnection}
      rewrites={edit.rewrites}
      onChange={(next) => setEdit((ed) => ({ ...ed, rewrites: next }))}
      onSave={handleRewriteSave}
      isSaving={update.isPending}
    />
  );

  // Per-source config, rendered from the capability's declared fields. Absent
  // for sources that declare none, which is why this can be null.
  // The built-in webhook's provider field is rendered by WebhookEndpointSection
  // above, so exclude it here rather than showing the same control twice.
  const rowConfigFields = useMemo(
    () =>
      (descriptor.config_form?.fields ?? []).filter(
        (field) => !(isWebhook && field.key === WEBHOOK_PROVIDER_KEY),
      ),
    [descriptor.config_form?.fields, isWebhook],
  );

  // Stable identity matters: SchemaForm reports validity from an effect keyed on
  // its descriptor and callback, so rebuilding either inline re-fires it every
  // render and loops through setEdit (React error #185).
  const rowConfigDescriptor = useMemo(
    () => ({
      ...descriptor,
      config_form: { ...(descriptor.config_form ?? { fields: [] }), fields: rowConfigFields },
    }),
    [descriptor, rowConfigFields],
  );

  const handleRowConfigValidity = useCallback((configValid: boolean) => {
    setEdit((ed) => (ed.configValid === configValid ? ed : { ...ed, configValid }));
  }, []);

  const sourceConfigEditor = rowConfigFields.length ? (
    <div className="border-border mt-3 space-y-3 rounded-md border p-3">
      <SourceConfigForm
        descriptor={rowConfigDescriptor}
        values={edit.sourceConfig}
        onChange={(next) => setEdit((ed) => ({ ...ed, sourceConfig: next, dirty: true }))}
        onValidityChange={handleRowConfigValidity}
        idPrefix={"source-config-" + source.id}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={update.isPending || !edit.configValid}
        onClick={() => handleSourceConfigSave()}
      >
        {update.isPending
          ? tr("pages.admin.autoscan.sources_panel.saving")
          : tr("pages.admin.autoscan.sources_panel.save_configuration")}
      </Button>
    </div>
  ) : null;

  const intervalSettings = isWebhook ? (
    <>
      <WebhookEndpointSection
        source={source}
        provider={
          (edit.sourceConfig[WEBHOOK_PROVIDER_KEY] as AutoscanWebhookProvider | undefined) ?? "auto"
        }
        onProviderChange={handleProviderChange}
        isSaving={update.isPending}
      />
      {rewriteEditor}
      {/* Webhook sources can carry declared config too — the built-in's provider
          is handled above, but a plugin-supplied form must still render. */}
      {sourceConfigEditor}
    </>
  ) : (
    <>
      <div className="flex items-center gap-2">
        <Input
          className="w-24"
          placeholder={tr("pages.admin.autoscan.sources_panel.default")}
          value={edit.intervalStr}
          aria-invalid={intervalError}
          aria-label={tr("pages.admin.autoscan.sources_panel.poll_interval_seconds_for_name", {
            name: resolvedLabel.name,
          })}
          onChange={(e) => {
            setIntervalError(false);
            setEdit((ed) => ({ ...ed, intervalStr: e.target.value }));
          }}
          onBlur={handleIntervalBlur}
        />
        <span className="text-muted-foreground text-xs">
          {tr("pages.admin.autoscan.sources_panel.sec")}
        </span>
      </div>
      {intervalError && (
        <p className="text-destructive mt-1 text-xs">
          {tr("pages.admin.autoscan.sources_panel.must_be_a_positive_integer")}
        </p>
      )}
      <p className="text-muted-foreground mt-1 text-xs">{intervalHelp}</p>
      {rewriteEditor}
      {sourceConfigEditor}
    </>
  );

  if (layout === "card") {
    return (
      <section className="bg-card min-w-0 overflow-hidden rounded-lg border p-3 shadow-sm">
        <div className="flex min-w-0 items-start justify-between gap-3">
          {sourceIdentity}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={tr("pages.admin.autoscan.sources_panel.delete_source_name", {
              name: resolvedLabel.name,
            })}
            onClick={() => onDelete(source)}
            className="shrink-0"
          >
            <Trash2 className="text-destructive" />
          </Button>
        </div>

        <div className="mt-4 grid min-w-0 gap-4">
          {!isWebhook && (
            <div className="grid min-w-0 gap-1.5">
              <Label className="text-muted-foreground text-xs">
                {tr("pages.admin.autoscan.sources_panel.connection")}
              </Label>
              {connectionControl}
            </div>
          )}

          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {tr("pages.admin.autoscan.sources_panel.enabled")}
              </p>
              <p className="text-muted-foreground text-xs break-words">
                {isWebhook
                  ? tr("pages.admin.autoscan.sources_panel.accept_webhook_deliveries")
                  : tr("pages.admin.autoscan.sources_panel.poll_this_source_for_changes")}
              </p>
            </div>
            <Switch
              checked={source.enabled}
              onCheckedChange={handleToggleEnabled}
              disabled={update.isPending}
              aria-label={tr("pages.admin.autoscan.sources_panel.name_enabled", {
                name: resolvedLabel.name,
              })}
            />
          </div>

          <div className="grid min-w-0 gap-1.5">
            <Label className="text-muted-foreground text-xs">
              {isWebhook
                ? tr("pages.admin.autoscan.sources_panel.last_delivery")
                : tr("pages.admin.autoscan.sources_panel.last_run")}
            </Label>
            <div className="min-w-0 overflow-hidden rounded-md border px-3 py-2">{statusNode}</div>
          </div>

          <div className="grid min-w-0 gap-1.5">
            <Label className="text-muted-foreground text-xs">
              {isWebhook
                ? tr("pages.admin.autoscan.sources_panel.webhook_settings")
                : tr("pages.admin.autoscan.sources_panel.interval_settings")}
            </Label>
            {intervalSettings}
          </div>
        </div>
      </section>
    );
  }

  return (
    <TableRow>
      {/* Plugin / capability */}
      <TableCell>{sourceIdentity}</TableCell>

      {/* Connection binding */}
      <TableCell>{connectionControl}</TableCell>

      {/* Poll interval */}
      <TableCell>{intervalSettings}</TableCell>

      {/* Enable toggle */}
      <TableCell>
        <Switch
          checked={source.enabled}
          onCheckedChange={handleToggleEnabled}
          disabled={update.isPending}
          aria-label={tr("pages.admin.autoscan.sources_panel.name_enabled", {
            name: resolvedLabel.name,
          })}
        />
      </TableCell>

      {/* Status */}
      <TableCell>{statusNode}</TableCell>

      {/* Actions */}
      <TableCell>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={tr("pages.admin.autoscan.sources_panel.delete_source_name", {
            name: resolvedLabel.name,
          })}
          onClick={() => onDelete(source)}
        >
          <Trash2 className="text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Add source dialog
//
// The flow is built from the selected source's descriptor rather than from its
// plugin id: a source declaring one delivery mode is never asked to choose one,
// a source needing no credentials never sees the connection step, and its own
// config fields come from its manifest. Adding a scan-source plugin therefore
// needs no change here.
// ---------------------------------------------------------------------------

interface AddSourceForm {
  /** "plugin_id:capability_id" composite key of the chosen plugin. */
  pluginKey: string;
  deliveryMode: AutoscanDeliveryMode | "";
  connectionId: string; // "" / "__none__" means no connection
  intervalStr: string;
  /** Typed while the renderer owns them; serialized only on submit. */
  sourceConfig: Record<string, unknown>;
  /** False while a required or validated config field is unsatisfied. */
  configValid: boolean;
  /** Webhook-only: arr path -> Silo path rows, seeded from library paths. */
  mappings: MappingDraft[];
}

const BLANK_ADD_SOURCE: AddSourceForm = {
  pluginKey: "",
  deliveryMode: "",
  connectionId: "",
  intervalStr: "",
  sourceConfig: {},
  configValid: true,
  mappings: [],
};

function pluginKey(pluginId: string, capabilityId: string): string {
  return `${pluginId}:${capabilityId}`;
}

/** Human wording for a delivery mode, used on the choice cards. */
const DELIVERY_MODE_COPY: Record<AutoscanDeliveryMode, { title: string; description: string }> = {
  webhook: {
    get title() {
      return tr("pages.admin.autoscan.sources_panel.the_service_tells_silo");
    },
    get description() {
      return tr(
        "pages.admin.autoscan.sources_panel.instant_paste_one_url_into_the_service_s_webhook_settings",
      );
    },
  },
  poll: {
    get title() {
      return tr("pages.admin.autoscan.sources_panel.silo_checks_the_service");
    },
    get description() {
      return tr(
        "pages.admin.autoscan.sources_panel.silo_asks_on_a_schedule_works_without_changing_anything_upstream",
      );
    },
  },
};

function AddSourceDialog({
  open,
  onOpenChange,
  connectionOptions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionOptions: Array<{ id: string; name: string; kind: string }>;
}) {
  useUILanguage();
  const available = useAvailableScanSources();
  const createSource = useCreateAutoscanSource();
  const createWebhook = useCreateAutoscanWebhook();
  const libraries = useAdminLibraries();
  const [form, setForm] = useState<AddSourceForm>(BLANK_ADD_SOURCE);
  // Set once a webhook source exists and its endpoint has been generated. The
  // dialog then shows the paste-this-into-your-arr instructions rather than
  // closing, so setup finishes in one place.
  const [createdWebhookSource, setCreatedWebhookSource] = useState<AutoscanSource | null>(null);

  const plugins = available.data ?? [];
  const selectedPlugin = plugins.find(
    (p) => pluginKey(p.plugin_id, p.capability_id) === form.pluginKey,
  );
  const descriptor = descriptorFor(selectedPlugin);

  // The chosen mode, or the descriptor's default while the operator has not
  // been asked (single-mode sources are never asked at all).
  const deliveryMode: AutoscanDeliveryMode = form.deliveryMode || defaultDeliveryMode(descriptor);

  const showDeliveryChoice = Boolean(selectedPlugin) && needsDeliveryChoice(descriptor);
  const showConnection = Boolean(selectedPlugin) && needsConnectionStep(descriptor, deliveryMode);
  const connectionRequired = connectionIsMandatory(descriptor, deliveryMode);
  // Poll interval only means something when Silo is the one asking.
  const showInterval = Boolean(selectedPlugin) && deliveryMode === "poll";

  // Only offer connections this source can actually talk to.
  const eligibleConnections = connectionOptions.filter((c) =>
    connectionMatchesKinds(descriptor, c.kind),
  );

  const hasConfigForm = Boolean(descriptor.config_form?.fields?.length);

  // A webhook source collects its path mappings in this dialog and then shows
  // the paste-into-your-arr instructions, so it owns two extra steps.
  const isWebhookFlow = Boolean(selectedPlugin) && deliveryMode === "webhook";

  // Steps vary per source: a single-mode credential-free watcher genuinely has
  // fewer questions than a pollable arr, so the trail is built from what this
  // descriptor actually asks rather than being a fixed 1-2-3.
  const stepLabels = [
    tr("pages.admin.autoscan.sources_panel.what_changes"),
    ...(showDeliveryChoice
      ? [tr("pages.admin.autoscan.sources_panel.how_do_we_hear_about_it")]
      : []),
    ...(showConnection ? [tr("pages.admin.autoscan.sources_panel.which_server")] : []),
    ...(isWebhookFlow
      ? [
          tr("pages.admin.autoscan.sources_panel.match_paths"),
          tr("pages.admin.autoscan.sources_panel.connect_it"),
        ]
      : []),
    ...(hasConfigForm && !isWebhookFlow
      ? [tr("pages.admin.autoscan.sources_panel.set_it_up")]
      : []),
  ];

  // Highlight the first question the operator has not answered yet. Steps after
  // the delivery choice only become current once a mode is picked, because the
  // connection and config sections below depend on it.
  const currentStepIndex = !selectedPlugin
    ? 0
    : showDeliveryChoice && !form.deliveryMode
      ? 1
      : Math.max(0, stepLabels.length - 1);

  function close() {
    setForm(BLANK_ADD_SOURCE);
    setCreatedWebhookSource(null);
    onOpenChange(false);
  }

  const handleAddConfigValidity = useCallback((configValid: boolean) => {
    setForm((f) => (f.configValid === configValid ? f : { ...f, configValid }));
  }, []);

  function selectPlugin(value: string) {
    const plugin = plugins.find((p) => pluginKey(p.plugin_id, p.capability_id) === value);
    const next = descriptorFor(plugin);
    // Reset per-source state on every change: config keys, delivery modes and
    // eligible connections all belong to the previously selected source.
    const nextMode = defaultDeliveryMode(next);
    setForm({
      ...BLANK_ADD_SOURCE,
      pluginKey: value,
      sourceConfig: initialConfigValues(next),
      mappings:
        nextMode === "webhook" ? seedMappings(webhookProviderOf(next), libraries.data ?? []) : [],
    });
  }

  /** Seed mappings lazily when the operator switches delivery to webhook. */
  function selectDeliveryMode(mode: AutoscanDeliveryMode) {
    setForm((f) => ({
      ...f,
      deliveryMode: mode,
      mappings:
        mode === "webhook" && f.mappings.length === 0
          ? seedMappings(webhookProviderOf(descriptor), libraries.data ?? [])
          : f.mappings,
    }));
  }

  function handleSubmit() {
    if (!selectedPlugin) return;

    const connectionId =
      showConnection && form.connectionId && form.connectionId !== "__none__"
        ? form.connectionId
        : null;
    const raw = form.intervalStr.trim();
    const pollInterval = !showInterval || raw === "" ? null : Number(raw);

    createSource.mutate(
      {
        plugin_id: selectedPlugin.plugin_id,
        capability_id: selectedPlugin.capability_id,
        connection_id: connectionId,
        // A webhook source is created enabled: its mappings are supplied in the
        // same dialog, so there is nothing left to configure afterwards. Poll
        // sources stay disabled until the operator reviews them.
        enabled: isWebhookFlow,
        delivery_mode: deliveryMode,
        poll_interval_seconds: pollInterval,
        path_rewrites: isWebhookFlow ? usableMappings(form.mappings) : [],
        source_config: normalizeSourceConfig(serializeConfigValues(form.sourceConfig, descriptor)),
      },
      {
        onSuccess: (created) => {
          if (!isWebhookFlow) {
            close();
            return;
          }
          // Generate the endpoint immediately and stay open: the operator still
          // needs the URL, and closing here is what previously left them to
          // hunt for a "Generate webhook URL" button on the row.
          //
          // On failure, stay open holding the created source rather than
          // closing. The source exists and is enabled at this point, so
          // dismissing the dialog would leave an enabled webhook source with no
          // endpoint and no visible explanation. The instructions panel renders
          // a retry when the URL is missing.
          createWebhook.mutate(created.id, {
            onSuccess: (withWebhook) => setCreatedWebhookSource(withWebhook),
            onError: () => setCreatedWebhookSource(created),
          });
        },
      },
    );
  }

  const intervalInvalid =
    showInterval &&
    form.intervalStr.trim() !== "" &&
    (!Number.isInteger(Number(form.intervalStr)) || Number(form.intervalStr) < 1);

  const isCreating = createSource.isPending || createWebhook.isPending;

  const canSubmit =
    Boolean(selectedPlugin) &&
    !intervalInvalid &&
    !isCreating &&
    (!connectionRequired || Boolean(form.connectionId && form.connectionId !== "__none__")) &&
    // A webhook source with no mapping accepts deliveries and resolves nothing,
    // so require at least one before it can be created.
    (!isWebhookFlow || hasUsableMapping(form.mappings)) &&
    // The host stores source_config without interpreting it, so a plugin's
    // required/validated fields are only enforced here.
    form.configValid;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {createdWebhookSource
              ? tr("pages.admin.autoscan.sources_panel.almost_done_connect_your_service")
              : tr("pages.admin.autoscan.sources_panel.add_scan_source")}
          </DialogTitle>
          <DialogDescription>
            {createdWebhookSource
              ? tr(
                  "pages.admin.autoscan.sources_panel.the_source_is_created_and_listening_paste_this_into_your",
                )
              : tr(
                  "pages.admin.autoscan.sources_panel.pick_what_you_want_silo_to_watch_each_source_only",
                )}
          </DialogDescription>
        </DialogHeader>

        {createdWebhookSource ? (
          <div className="space-y-4">
            <StepTrail steps={stepLabels} currentIndex={stepLabels.length - 1} />
            {createdWebhookSource.webhook_url ? (
              <WebhookInstructions
                url={absoluteWebhookURL(createdWebhookSource.webhook_url)}
                provider={webhookProviderOf(descriptor, createdWebhookSource.source_config)}
              />
            ) : (
              <div className="border-destructive/30 bg-destructive/10 space-y-3 rounded-md border p-3">
                <p className="text-destructive flex items-center gap-1.5 text-sm font-medium">
                  <AlertTriangle className="size-4 shrink-0" />
                  {tr("pages.admin.autoscan.sources_panel.couldn_t_generate_the_webhook_url")}
                </p>
                <p className="text-muted-foreground text-xs">
                  {tr(
                    "pages.admin.autoscan.sources_panel.the_source_was_created_but_has_no_endpoint_yet_it",
                  )}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={createWebhook.isPending}
                  onClick={() =>
                    createWebhook.mutate(createdWebhookSource.id, {
                      onSuccess: (withWebhook) => setCreatedWebhookSource(withWebhook),
                    })
                  }
                >
                  <RefreshCw />
                  {createWebhook.isPending
                    ? tr("pages.admin.autoscan.sources_panel.retrying")
                    : tr("pages.admin.autoscan.sources_panel.try_again")}
                </Button>
              </div>
            )}
          </div>
        ) : available.isLoading ? (
          <p className="text-muted-foreground py-4 text-sm">
            {tr("pages.admin.autoscan.sources_panel.loading_available_sources")}
          </p>
        ) : plugins.length === 0 ? (
          <p className="text-muted-foreground py-4 text-sm">
            {tr(
              "pages.admin.autoscan.sources_panel.no_scan_source_plugins_installed_install_one_from_the",
            )}{" "}
            <Link to="/admin/plugins" className="text-primary underline-offset-4 hover:underline">
              {tr("pages.admin.autoscan.sources_panel.plugins_page")}
            </Link>{" "}
            {tr("pages.admin.autoscan.sources_panel.to_add_sources_here")}
          </p>
        ) : (
          <div className="space-y-4">
            <StepTrail steps={stepLabels} currentIndex={currentStepIndex} />

            <div className="space-y-2">
              <Label>{tr("pages.admin.autoscan.sources_panel.what_should_silo_watch")}</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {plugins.map((p) => {
                  const key = pluginKey(p.plugin_id, p.capability_id);
                  const pluginDescriptor = descriptorFor(p);
                  return (
                    <ChoiceCard
                      key={key}
                      title={p.display_name}
                      description={pluginDescriptor.summary || p.description}
                      icon={
                        pluginDescriptor.delivery_modes.includes("webhook") &&
                        pluginDescriptor.delivery_modes.length === 1 ? (
                          <Webhook className="size-3.5" />
                        ) : (
                          <RefreshCw className="size-3.5" />
                        )
                      }
                      selected={form.pluginKey === key}
                      onSelect={() => selectPlugin(key)}
                    />
                  );
                })}
              </div>
            </div>

            {showDeliveryChoice && (
              <div className="space-y-2">
                <Label>
                  {tr("pages.admin.autoscan.sources_panel.how_should_silo_hear_about_changes")}
                </Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {descriptor.delivery_modes.map((mode) => {
                    const copy = DELIVERY_MODE_COPY[mode];
                    return (
                      <ChoiceCard
                        key={mode}
                        title={copy?.title ?? mode}
                        description={copy?.description}
                        icon={mode === "webhook" ? <Webhook className="size-3.5" /> : undefined}
                        badge={mode === "webhook" ? "Recommended" : undefined}
                        selected={deliveryMode === mode}
                        onSelect={() => selectDeliveryMode(mode)}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {isWebhookFlow && (
              <WebhookMappingEditor
                mappings={form.mappings}
                onChange={(mappings) => setForm((f) => ({ ...f, mappings }))}
                libraryPaths={(libraries.data ?? []).flatMap((library) => library.paths ?? [])}
              />
            )}

            {showConnection && (
              <InlineConnectionPicker
                // Remount per source: the picker holds its own draft (URL, key,
                // reuse id, test result), and switching plugins mid-add would
                // otherwise submit stale credentials under the new descriptor's
                // kind, or keep a now-ineligible reuse id selected.
                key={form.pluginKey}
                value={form.connectionId}
                onChange={(connectionId) => setForm((f) => ({ ...f, connectionId }))}
                options={eligibleConnections}
                required={connectionRequired}
                connectionKinds={descriptor.connection_kinds ?? []}
                idPrefix="add-source-conn"
              />
            )}

            {showInterval && (
              <div className="space-y-1.5">
                <Label htmlFor="add-source-interval">
                  {tr("pages.admin.autoscan.sources_panel.check_interval_seconds")}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="add-source-interval"
                    className="w-32"
                    placeholder={tr("pages.admin.autoscan.sources_panel.default")}
                    value={form.intervalStr}
                    aria-invalid={intervalInvalid}
                    onChange={(e) => setForm((f) => ({ ...f, intervalStr: e.target.value }))}
                  />
                  <span className="text-muted-foreground text-sm">
                    {tr("pages.admin.autoscan.sources_panel.sec")}
                  </span>
                </div>
                {intervalInvalid && (
                  <p className="text-destructive text-xs">
                    {tr("pages.admin.autoscan.sources_panel.must_be_a_positive_integer")}
                  </p>
                )}
                <p className="text-muted-foreground text-xs">
                  {tr(
                    "pages.admin.autoscan.sources_panel.optional_leave_blank_to_use_the_global_default",
                  )}
                </p>
              </div>
            )}

            {selectedPlugin && (
              <SourceConfigForm
                descriptor={descriptor}
                values={form.sourceConfig}
                onChange={(sourceConfig) => setForm((f) => ({ ...f, sourceConfig }))}
                onValidityChange={handleAddConfigValidity}
                idPrefix="add-source-config"
              />
            )}
          </div>
        )}

        <DialogFooter>
          {createdWebhookSource ? (
            // The source already exists at this point, so there is nothing to
            // cancel — only an acknowledgement that the URL has been copied.
            <Button onClick={close}>{tr("common.actions.done")}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={close} disabled={isCreating}>
                {tr("common.actions.cancel")}
              </Button>
              {plugins.length > 0 && (
                <Button onClick={handleSubmit} disabled={!canSubmit}>
                  {isCreating
                    ? tr("pages.admin.autoscan.sources_panel.adding")
                    : isWebhookFlow
                      ? tr("pages.admin.autoscan.sources_panel.create_and_continue")
                      : tr("pages.admin.autoscan.sources_panel.add_source")}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export default function SourcesPanel() {
  useUILanguage();
  const sources = useAutoscanSources();
  const connections = useAutoscanConnections();
  const settings = useAutoscanSettings();
  const available = useAvailableScanSources();
  const pluginDisplayNames = useMemo(
    () => buildPluginDisplayNames(available.data ?? []),
    [available.data],
  );
  const deleteSource = useDeleteAutoscanSource();

  const [deleteTarget, setDeleteTarget] = useState<AutoscanSource | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const connectionOptions = (connections.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    requestIntegrationId: c.request_integration_id ?? null,
  }));

  const globalPollInterval = settings.data?.default_poll_interval_seconds ?? null;

  // Descriptor per installed capability, so each row can render the config
  // fields its own plugin declares. A source whose capability is no longer
  // installed falls back to the defaults rather than disappearing.
  const descriptorsByKey = useMemo(() => {
    const map = new Map<string, AutoscanScanSourceDescriptor>();
    for (const plugin of available.data ?? []) {
      map.set(pluginKey(plugin.plugin_id, plugin.capability_id), descriptorFor(plugin));
    }
    return map;
  }, [available.data]);

  function descriptorForSource(source: AutoscanSource): AutoscanScanSourceDescriptor {
    return (
      descriptorsByKey.get(pluginKey(source.plugin_id, source.capability_id)) ?? DEFAULT_DESCRIPTOR
    );
  }

  const header = (
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground text-xs">
        {tr("pages.admin.autoscan.sources_panel.scan_source_plugins_are_installed_from_the")}{" "}
        <Link to="/admin/plugins" className="text-primary underline-offset-4 hover:underline">
          {tr("pages.admin.autoscan.sources_panel.plugins_page")}
        </Link>
        {tr("pages.admin.autoscan.sources_panel.add_a_source_for_each_thing_you_want_to_watch")}
      </p>
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-center sm:w-auto sm:shrink-0"
        onClick={() => setAddOpen(true)}
      >
        <Plus />
        {tr("pages.admin.autoscan.sources_panel.add_source")}
      </Button>
    </div>
  );

  const addDialog = (
    <AddSourceDialog
      open={addOpen}
      onOpenChange={setAddOpen}
      connectionOptions={connectionOptions}
    />
  );

  if (sources.isLoading) {
    return (
      <p className="text-muted-foreground py-4 text-sm">
        {tr("pages.admin.autoscan.sources_panel.loading_sources")}
      </p>
    );
  }

  if (sources.isError) {
    return (
      <p className="text-destructive py-4 text-sm">
        {tr(
          "pages.admin.autoscan.sources_panel.failed_to_load_scan_sources_please_reload_the_page",
        )}
      </p>
    );
  }

  const list = sources.data ?? [];

  if (list.length === 0) {
    return (
      <div className="space-y-4">
        {header}
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground text-sm">
            {tr("pages.admin.autoscan.sources_panel.no_scan_sources_yet_click")}{" "}
            <span className="font-medium">
              {tr("pages.admin.autoscan.sources_panel.add_source")}
            </span>{" "}
            {tr(
              "pages.admin.autoscan.sources_panel.to_create_one_from_an_installed_scan_source_plugin",
            )}
          </p>
        </div>
        {addDialog}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}

      <div className="space-y-3 lg:hidden">
        {list.map((source) => (
          <SourceRow
            key={source.id}
            source={source}
            descriptor={descriptorForSource(source)}
            connectionOptions={connectionOptions}
            pluginDisplayNames={pluginDisplayNames}
            globalPollInterval={globalPollInterval}
            onDelete={setDeleteTarget}
            layout="card"
          />
        ))}
      </div>

      <div className="hidden rounded-lg border lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("pages.admin.autoscan.sources_panel.source")}</TableHead>
              <TableHead>{tr("pages.admin.autoscan.sources_panel.connection")}</TableHead>
              <TableHead>{tr("pages.admin.autoscan.sources_panel.interval_settings")}</TableHead>
              <TableHead>{tr("pages.admin.autoscan.sources_panel.enabled")}</TableHead>
              <TableHead>{tr("pages.admin.autoscan.sources_panel.last_run")}</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                descriptor={descriptorForSource(source)}
                connectionOptions={connectionOptions}
                pluginDisplayNames={pluginDisplayNames}
                globalPollInterval={globalPollInterval}
                onDelete={setDeleteTarget}
                layout="table"
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tr("pages.admin.autoscan.sources_panel.delete_source")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tr("pages.admin.autoscan.sources_panel.ldquo")}
              {deleteTarget
                ? resolveSourceName(deleteTarget, connectionOptions, pluginDisplayNames)
                : ""}
              {tr(
                "pages.admin.autoscan.sources_panel.rdquo_will_be_permanently_removed_this_cannot_be_undone",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("common.actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteTarget) {
                  deleteSource.mutate(deleteTarget.id);
                  setDeleteTarget(null);
                }
              }}
            >
              {tr("common.actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {addDialog}
    </div>
  );
}
