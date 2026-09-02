import { useState } from "react";
import { Check, Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "@/i18n/toast";

import type { AutoscanWebhookProvider } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { MappingDraft } from "./webhookSetup";
import { expandedRootsFor, newMapping, settingsPathFor, triggersFor } from "./webhookSetup";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

/**
 * The copy-the-URL-into-your-arr half of webhook setup.
 *
 * This exists because the previous flow created a webhook source and then left
 * the operator to work out, unaided, that they had to generate a URL, find the
 * right screen in Sonarr, and tick a specific set of boxes. Every one of those
 * is now stated on screen, and the trigger list is derived from what the host
 * actually parses rather than from memory.
 */
export function WebhookInstructions({
  url,
  provider,
}: {
  url: string;
  provider: AutoscanWebhookProvider | "auto";
}) {
  useUILanguage();
  const [copied, setCopied] = useState(false);
  const triggers = triggersFor(provider);

  async function copyURL() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(
        "errors.admin.autoscan.webhook_setup_step.couldn_t_copy_select_the_url_and_copy_it_manually",
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="webhook-url">
          {tr("pages.admin.autoscan.webhook_setup_step.value_1_copy_this_url")}
        </Label>
        <div className="flex gap-2">
          <Input
            id="webhook-url"
            readOnly
            value={url}
            className="font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button type="button" variant="outline" size="sm" onClick={copyURL}>
            {copied ? <Check className="text-success" /> : <Copy />}
            {copied
              ? tr("pages.admin.autoscan.webhook_setup_step.copied")
              : tr("common.actions.copy")}
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>
          {tr("pages.admin.autoscan.webhook_setup_step.value_2_in_your_download_manager_go_to")}
        </Label>
        <p className="border-border bg-muted/30 rounded-md border px-3 py-2 font-mono text-xs">
          {settingsPathFor(provider)}
        </p>
        <p className="text-muted-foreground text-xs">
          {tr("pages.admin.autoscan.webhook_setup_step.paste_the_url_into")}{" "}
          <span className="font-medium">
            {tr("pages.admin.autoscan.webhook_setup_step.webhook_url")}
          </span>{" "}
          {tr("pages.admin.autoscan.webhook_setup_step.and_leave_the_method_as")}{" "}
          <span className="font-medium">{tr("pages.admin.autoscan.webhook_setup_step.post")}</span>
          {tr("pages.admin.autoscan.webhook_setup_step.no_username_or_password_is_needed")}
        </p>
      </div>

      <div className="space-y-2">
        <Label>{tr("pages.admin.autoscan.webhook_setup_step.value_3_tick_these_triggers")}</Label>
        <ul className="space-y-2">
          {triggers.map((trigger) => (
            <li key={trigger.label} className="flex items-start gap-2 text-sm">
              <span
                aria-hidden
                className="border-muted-foreground/50 mt-0.5 grid size-4 shrink-0 place-items-center rounded-[3px] border"
              >
                <Check className="size-3" />
              </span>
              <span className="min-w-0">
                <span className="font-medium">{trigger.label}</span>
                {!trigger.required && (
                  <span className="text-muted-foreground">
                    {" "}
                    {tr("pages.admin.autoscan.webhook_setup_step.optional")}
                  </span>
                )}
                <span className="text-muted-foreground block text-xs">{trigger.reason}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">
          {tr(
            "pages.admin.autoscan.webhook_setup_step.leave_every_other_trigger_unchecked_silo_ignores_them",
          )}
        </p>
      </div>

      <p className="text-muted-foreground text-xs">
        {tr(
          "pages.admin.autoscan.webhook_setup_step.save_the_connection_in_your_download_manager_you_can_use",
        )}
        <span className="font-medium"> {tr("pages.admin.autoscan.webhook_setup_step.test")} </span>{" "}
        {tr(
          "pages.admin.autoscan.webhook_setup_step.button_silo_accepts_test_payloads_and_will_show_the_delivery",
        )}
      </p>
    </div>
  );
}

/**
 * Path mapping editor for webhook sources.
 *
 * A webhook source has no connection, so the host's /suggest endpoint (which
 * reads an arr's root folders over its API) cannot run. The `to` side is
 * therefore pre-filled from real Silo library paths and the operator supplies
 * what their arr reports. Without at least one row, deliveries arrive and
 * resolve to nothing.
 */
export function WebhookMappingEditor({
  mappings,
  onChange,
  libraryPaths = [],
}: {
  mappings: MappingDraft[];
  onChange: (next: MappingDraft[]) => void;
  /**
   * Every library path the seeded rows were derived from. Used to offer a
   * per-branch breakdown when a row was collapsed to a shared root but the
   * operator's arr exposes those branches under different roots.
   */
  libraryPaths?: readonly string[];
}) {
  useUILanguage();
  function update(index: number, patch: Partial<MappingDraft>) {
    onChange(mappings.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  /** Replace a collapsed row with one row per child directory. */
  function expand(index: number, children: string[]) {
    const row = mappings[index];
    if (!row) return;
    onChange([
      ...mappings.slice(0, index),
      ...children.map((to) => newMapping(to, row.from)),
      ...mappings.slice(index + 1),
    ]);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>{tr("pages.admin.autoscan.webhook_setup_step.match_its_paths_to_yours")}</Label>
        <p className="text-muted-foreground text-xs">
          {tr("pages.admin.autoscan.webhook_setup_step.sonarr_radarr_report_the_path_of_the")}{" "}
          <em>{tr("pages.admin.autoscan.webhook_setup_step.imported_library_file")}</em>{" "}
          {tr(
            "pages.admin.autoscan.webhook_setup_step.their_root_folder_not_the_download_client_s_working_directory",
          )}
        </p>
      </div>

      {mappings.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {tr(
            "pages.admin.autoscan.webhook_setup_step.no_libraries_found_to_map_add_a_library_first_or",
          )}
        </p>
      ) : (
        <div className="space-y-2">
          {mappings.map((row, index) => {
            const children = expandedRootsFor(row.to, libraryPaths);
            return (
              <div key={row.id} className="space-y-1">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label htmlFor={"map-from-" + index} className="text-muted-foreground text-xs">
                      {tr("pages.admin.autoscan.webhook_setup_step.sonarr_radarr_root_folder")}
                    </Label>
                    <Input
                      id={"map-from-" + index}
                      placeholder={tr("pages.admin.autoscan.webhook_setup_step.tv")}
                      className="font-mono text-xs"
                      value={row.from}
                      onChange={(e) => update(index, { from: e.target.value })}
                    />
                  </div>
                  <span className="text-muted-foreground hidden pb-2 text-xs sm:block">→</span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label htmlFor={"map-to-" + index} className="text-muted-foreground text-xs">
                      {tr("pages.admin.autoscan.webhook_setup_step.path_silo_uses")}
                    </Label>
                    <Input
                      id={"map-to-" + index}
                      placeholder={tr("pages.admin.autoscan.webhook_setup_step.mnt_media_tv")}
                      className="font-mono text-xs"
                      value={row.to}
                      onChange={(e) => update(index, { to: e.target.value })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={tr("pages.admin.autoscan.webhook_setup_step.remove_mapping_value", {
                      value: index + 1,
                    })}
                    className="sm:mb-1"
                    onClick={() => onChange(mappings.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
                {children.length > 0 && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
                    onClick={() => expand(index, children)}
                  >
                    {tr(
                      "pages.admin.autoscan.webhook_setup_step.does_your_download_manager_use_a_different_folder_per_type",
                    )}{" "}
                    {children.length} {tr("pages.admin.autoscan.webhook_setup_step.rows")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...mappings, newMapping()])}
      >
        <Plus />
        {tr("pages.admin.autoscan.webhook_setup_step.add_a_mapping")}
      </Button>
    </div>
  );
}
