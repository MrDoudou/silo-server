import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Link } from "react-router";

import type { ConnectionCheckResponse } from "@/api/types";
import { ConnectionCheckAction } from "@/components/admin/ConnectionCheckAction";
import { AdvancedSection } from "@/components/settings/AdvancedSection";
import { SecretField } from "@/components/settings/SecretField";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { useBranding } from "@/hooks/useBranding";
import {
  useCatalogSearchStatus,
  useCheckAdminSettingsConnection,
} from "@/hooks/queries/admin/settings";
import { useRestartKeys } from "@/hooks/useRestartKeys";
import { useSettingsForm } from "@/hooks/useSettingsForm";
import { FieldGroup } from "./FieldGroup";
import { MarkerTasksCard } from "./MarkerTasksCard";
import { SaveBar } from "./SaveBar";
import { SearchStatusPanel } from "./SearchStatusPanel";
import { SettingField, SettingFieldStatus } from "./SettingField";
import { useUILanguage } from "@/i18n/uiText";

import { tr } from "@/i18n/translate";

const ARTWORK_KEYS = ["metadata.cache_images"];

const SCANNER_KEYS = ["scanner.workers", "matcher.workers", "matcher.batch_size"];

const MARKER_KEYS = ["markers.mode", "markers.lazy_playback"];

const MEILI_URL_KEY = "catalog.search.meilisearch.url";
const MEILI_API_KEY = "catalog.search.meilisearch.api_key";

const MEILI_ADVANCED_KEYS = [
  "catalog.search.meilisearch.index",
  "catalog.search.meilisearch.timeout_ms",
  "catalog.search.meilisearch.matching_strategy",
  "catalog.search.meilisearch.sync_batch_size",
  "catalog.search.meilisearch.semantic_enabled",
  "catalog.search.meilisearch.semantic_ratio",
];

const MEILI_KEYS = [MEILI_URL_KEY, MEILI_API_KEY, ...MEILI_ADVANCED_KEYS];

const SEARCH_KEYS = ["catalog.search.provider", ...MEILI_KEYS];

// Hidden tier: still saved and readable through the settings API, deliberately
// without a control here because the defaults are right for every deployment we
// support — catalog.search.meilisearch.{rebuild_batch_size,
// rebuild_task_queue_depth,index_types,embedder,binary_quantized}.
const KEYS = [...ARTWORK_KEYS, ...SCANNER_KEYS, ...MARKER_KEYS, ...SEARCH_KEYS];

export default function LibraryMetadataSettings() {
  useUILanguage();
  useUILanguage();
  const form = useSettingsForm({ keys: useMemo(() => KEYS, []) });
  const branding = useBranding();
  const restartKeys = useRestartKeys();
  const checkConnection = useCheckAdminSettingsConnection();
  const [connectionResult, setConnectionResult] = useState<ConnectionCheckResponse | null>(null);

  // Artwork storage writes provider images into the public bucket, so the
  // server rejects enabling it when no bucket is configured at all.
  // `storage_available` is the process-level truth (branding uses the same
  // flag for asset uploads); s3.public_bucket only says a bucket was saved,
  // which is enough for the server to accept the save — the two together
  // separate "restart pending" from "never configured". s3.public_bucket is
  // not staged here, but getValue falls back to the full settings response.
  const publicBucketSaved = Boolean(form.getValue("s3.public_bucket"));
  const artworkStorageOn = form.getValue("metadata.cache_images") === "true";
  // Never trap an admin with it on: turning it off stays available even when
  // the bucket went away.
  const artworkStorageLocked =
    !branding.storageAvailable && !publicBucketSaved && !artworkStorageOn;

  const provider = form.getValue("catalog.search.provider") || "postgres";
  const meiliEnabled = provider === "meilisearch";
  const { data: searchStatus } = useCatalogSearchStatus(meiliEnabled);
  const anyDirty = (keys: string[]) => keys.some((key) => form.isDirty(key));
  const allRestart = (keys: string[]) => keys.every((key) => restartKeys.has(key));
  // Staged Meilisearch edits stay reachable after switching the provider back,
  // so the save bar can never count a change the admin cannot see.
  const showMeili = meiliEnabled || anyDirty(MEILI_KEYS);
  const enablingSemanticSearch =
    form.isDirty("catalog.search.meilisearch.semantic_enabled") &&
    form.getPersistedValue("catalog.search.meilisearch.semantic_enabled") !== "true" &&
    form.getValue("catalog.search.meilisearch.semantic_enabled") === "true";

  async function handleCheckConnection() {
    try {
      setConnectionResult(
        await checkConnection.mutateAsync({
          kind: "meilisearch",
          body: form.buildConnectionCheckRequest(MEILI_KEYS),
        }),
      );
    } catch (error) {
      setConnectionResult({
        success: false,
        message: tr.error(
          "errors.admin_settings.library_metadata_settings.connection_check_failed",
          error,
        ),
      });
    }
  }

  const markerMode = form.getValue("markers.mode") || "local";

  if (form.isLoading) {
    return (
      <div
        className="space-y-6"
        role="status"
        aria-label={tr("pages.admin_settings.library_metadata_settings.loading_settings")}
      >
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-40 w-full" />
        <span className="sr-only">
          {tr("pages.admin_settings.library_metadata_settings.loading_settings")}
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <SettingsPageHeader
        title={tr("pages.admin_settings.library_metadata_settings.library_metadata")}
        className="mb-8"
      />

      <div className="flex-1 space-y-5">
        <FieldGroup
          label={tr("pages.admin_settings.library_metadata_settings.artwork")}
          description={tr(
            "pages.admin_settings.library_metadata_settings.posters_and_backdrops_from_metadata_providers_copied_into_the_public",
          )}
          restartAll={allRestart(ARTWORK_KEYS)}
        >
          {!branding.storageAvailable && (
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="text-muted-foreground text-[13px] leading-relaxed">
                {publicBucketSaved ? (
                  <>
                    {tr(
                      "pages.admin_settings.library_metadata_settings.restart_the_server_for_artwork_storage_to_start",
                    )}
                  </>
                ) : (
                  <>
                    {tr(
                      "pages.admin_settings.library_metadata_settings.artwork_storage_needs_a_public_s3_bucket_set_in",
                    )}{" "}
                    <Link
                      to="/admin/settings/infrastructure"
                      className="text-foreground font-medium underline-offset-2 hover:underline"
                    >
                      {tr("pages.admin_settings.library_metadata_settings.storage_database")}
                    </Link>{" "}
                    {tr("pages.admin_settings.library_metadata_settings.settings")}
                  </>
                )}
              </p>
            </div>
          )}
          <SettingField
            label={tr(
              "pages.admin_settings.library_metadata_settings.store_artwork_in_your_bucket",
            )}
            type="toggle"
            description={tr(
              "pages.admin_settings.library_metadata_settings.when_off_clients_load_artwork_straight_from_the_providers",
            )}
            value={form.getValue("metadata.cache_images")}
            onChange={(value) => form.setValue("metadata.cache_images", value)}
            disabled={artworkStorageLocked}
            restartRequired={restartKeys.has("metadata.cache_images")}
          />
        </FieldGroup>

        <FieldGroup
          label={tr("pages.admin_settings.library_metadata_settings.scanning")}
          restartAll={allRestart(SCANNER_KEYS)}
        >
          <AdvancedSection
            id="library.scanning"
            count={SCANNER_KEYS.length}
            forceOpen={anyDirty(SCANNER_KEYS)}
          >
            <SettingField
              label={tr("pages.admin_settings.library_metadata_settings.scanner_workers")}
              type="number"
              description={tr(
                "pages.admin_settings.library_metadata_settings.how_many_files_silo_reads_at_once",
              )}
              value={form.getValue("scanner.workers")}
              onChange={(value) => form.setValue("scanner.workers", value)}
              restartRequired={restartKeys.has("scanner.workers")}
            />
            <SettingField
              label={tr("pages.admin_settings.library_metadata_settings.matcher_workers")}
              type="number"
              description={tr(
                "pages.admin_settings.library_metadata_settings.how_many_items_silo_looks_up_at_once",
              )}
              value={form.getValue("matcher.workers")}
              onChange={(value) => form.setValue("matcher.workers", value)}
              restartRequired={restartKeys.has("matcher.workers")}
            />
            <SettingField
              label={tr("pages.admin_settings.library_metadata_settings.matcher_batch_size")}
              type="number"
              description={tr(
                "pages.admin_settings.library_metadata_settings.how_many_items_each_matcher_worker_claims_per_round",
              )}
              value={form.getValue("matcher.batch_size")}
              onChange={(value) => form.setValue("matcher.batch_size", value)}
              restartRequired={restartKeys.has("matcher.batch_size")}
            />
          </AdvancedSection>
        </FieldGroup>

        {/*
          Detection behavior lives here; which online providers answer a lookup,
          and on what terms, is provider configuration and lives with the other
          providers.
        */}
        <FieldGroup
          label={tr("pages.admin_settings.library_metadata_settings.intro_and_credits_markers")}
          restartAll={allRestart(MARKER_KEYS)}
          actions={
            <Link
              to="/admin/settings/providers"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
            >
              {tr("pages.admin_settings.library_metadata_settings.marker_providers")}
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          }
        >
          <SettingField
            label={tr("pages.admin_settings.library_metadata_settings.find_intros_and_credits")}
            type="select"
            description={tr(
              "pages.admin_settings.library_metadata_settings.detecting_on_this_server_utilizes_cpu_looking_online_uses_the",
            )}
            options={[
              { value: "off", label: tr("pages.admin_settings.library_metadata_settings.off") },
              {
                value: "local",
                label: tr("pages.admin_settings.library_metadata_settings.detect_on_this_server"),
              },
              {
                value: "both",
                label: tr(
                  "pages.admin_settings.library_metadata_settings.detect_on_this_server_then_look_online",
                ),
              },
              {
                value: "online",
                label: tr("pages.admin_settings.library_metadata_settings.look_online_only"),
              },
            ]}
            value={markerMode}
            onChange={(value) => form.setValue("markers.mode", value)}
            restartRequired={restartKeys.has("markers.mode")}
          />

          <SettingField
            label={tr("pages.admin_settings.library_metadata_settings.fetch_markers_on_playback")}
            type="toggle"
            description={tr(
              "pages.admin_settings.library_metadata_settings.uses_the_enabled_marker_providers_to_look_up_missing_markers",
            )}
            value={form.getValue("markers.lazy_playback") || "false"}
            onChange={(value) => form.setValue("markers.lazy_playback", value)}
            restartRequired={restartKeys.has("markers.lazy_playback")}
          />

          <div className="py-3.5">
            <MarkerTasksCard />
          </div>
        </FieldGroup>

        <FieldGroup label={tr("common.actions.search")} restartAll={allRestart(SEARCH_KEYS)}>
          <SettingField
            label={tr("pages.admin_settings.library_metadata_settings.search_engine")}
            type="select"
            description={tr(
              "pages.admin_settings.library_metadata_settings.meilisearch_tolerates_typos_but_runs_as_its_own_service_if",
            )}
            value={provider}
            onChange={(value) => form.setValue("catalog.search.provider", value)}
            options={[
              {
                value: "postgres",
                label: tr("pages.admin_settings.library_metadata_settings.built_in_postgres"),
              },
              {
                value: "meilisearch",
                label: tr("pages.admin_settings.library_metadata_settings.meilisearch"),
              },
            ]}
            restartRequired={restartKeys.has("catalog.search.provider")}
          />

          {showMeili && (
            <>
              <SettingField
                label={tr("pages.admin_settings.library_metadata_settings.meilisearch_url")}
                value={form.getValue(MEILI_URL_KEY)}
                onChange={(value) => form.setValue(MEILI_URL_KEY, value)}
                hint={tr("pages.admin_settings.library_metadata_settings.http_localhost_7700")}
                disabled={!meiliEnabled}
                restartRequired={restartKeys.has(MEILI_URL_KEY)}
              />
              <SecretField
                label={tr("pages.admin_settings.library_metadata_settings.meilisearch_api_key")}
                value={form.getValue(MEILI_API_KEY)}
                configured={form.sensitiveConfigured.includes(MEILI_API_KEY)}
                onChange={(value) => form.setValue(MEILI_API_KEY, value)}
                onKeep={() => form.resetValue(MEILI_API_KEY)}
                // Nothing else on this page can empty the stored key, and a
                // Meilisearch instance without a master key needs it empty.
                onClear={() => form.setValue(MEILI_API_KEY, "")}
                cleared={form.isClearStaged(MEILI_API_KEY)}
                hint={tr(
                  "pages.admin_settings.library_metadata_settings.master_key_or_one_that_can_read_and_write_the",
                )}
                disabled={!meiliEnabled}
                restartRequired={restartKeys.has(MEILI_API_KEY)}
              />
              <ConnectionCheckAction
                onClick={handleCheckConnection}
                result={connectionResult}
                isPending={checkConnection.isPending}
                disabled={!meiliEnabled}
              />

              <AdvancedSection
                id="library.search.meilisearch"
                count={MEILI_ADVANCED_KEYS.length}
                forceOpen={anyDirty(MEILI_ADVANCED_KEYS)}
              >
                <SettingField
                  label={tr("pages.admin_settings.library_metadata_settings.index_name_prefix")}
                  value={form.getValue("catalog.search.meilisearch.index") || "silo_media_items"}
                  onChange={(value) => form.setValue("catalog.search.meilisearch.index", value)}
                  description={tr(
                    "pages.admin_settings.library_metadata_settings.only_needed_when_silo_servers_share_one_meilisearch",
                  )}
                  disabled={!meiliEnabled}
                  restartRequired={restartKeys.has("catalog.search.meilisearch.index")}
                />
                <SettingField
                  label={tr("pages.admin_settings.library_metadata_settings.query_timeout")}
                  type="number"
                  unit="ms"
                  value={form.getValue("catalog.search.meilisearch.timeout_ms") || "800"}
                  onChange={(value) =>
                    form.setValue("catalog.search.meilisearch.timeout_ms", value)
                  }
                  description={tr(
                    "pages.admin_settings.library_metadata_settings.searches_that_take_longer_fall_back_to_the_built_in",
                  )}
                  disabled={!meiliEnabled}
                  restartRequired={restartKeys.has("catalog.search.meilisearch.timeout_ms")}
                />
                <SettingField
                  label={tr(
                    "pages.admin_settings.library_metadata_settings.when_a_search_has_several_words",
                  )}
                  type="select"
                  value={form.getValue("catalog.search.meilisearch.matching_strategy") || "last"}
                  onChange={(value) =>
                    form.setValue("catalog.search.meilisearch.matching_strategy", value)
                  }
                  options={[
                    {
                      value: "last",
                      label: tr(
                        "pages.admin_settings.library_metadata_settings.drop_trailing_words_until_something_matches",
                      ),
                    },
                    {
                      value: "all",
                      label: tr(
                        "pages.admin_settings.library_metadata_settings.require_every_word",
                      ),
                    },
                  ]}
                  disabled={!meiliEnabled}
                  restartRequired={restartKeys.has("catalog.search.meilisearch.matching_strategy")}
                />
                <SettingField
                  label={tr(
                    "pages.admin_settings.library_metadata_settings.items_sent_to_the_index_per_batch",
                  )}
                  type="number"
                  value={form.getValue("catalog.search.meilisearch.sync_batch_size") || "500"}
                  onChange={(value) =>
                    form.setValue("catalog.search.meilisearch.sync_batch_size", value)
                  }
                  description={tr(
                    "pages.admin_settings.library_metadata_settings.larger_batches_index_faster_and_use_more_memory",
                  )}
                  disabled={!meiliEnabled}
                  restartRequired={restartKeys.has("catalog.search.meilisearch.sync_batch_size")}
                />
                <SettingField
                  label={tr(
                    "pages.admin_settings.library_metadata_settings.match_by_meaning_as_well_as_words",
                  )}
                  type="toggle"
                  value={form.getValue("catalog.search.meilisearch.semantic_enabled") || "false"}
                  onChange={(value) =>
                    form.setValue("catalog.search.meilisearch.semantic_enabled", value)
                  }
                  description={tr(
                    "pages.admin_settings.library_metadata_settings.also_matches_items_whose_description_means_something_similar",
                  )}
                  status={
                    enablingSemanticSearch ? (
                      <SettingFieldStatus tone="warn">
                        {tr(
                          "pages.admin_settings.library_metadata_settings.enabling_this_changes_the_index_format_after_you_save_and",
                        )}
                      </SettingFieldStatus>
                    ) : undefined
                  }
                  disabled={!meiliEnabled}
                  restartRequired={restartKeys.has("catalog.search.meilisearch.semantic_enabled")}
                />
                <SettingField
                  label={tr(
                    "pages.admin_settings.library_metadata_settings.meaning_based_share_of_results",
                  )}
                  type="number"
                  value={form.getValue("catalog.search.meilisearch.semantic_ratio") || "0.50"}
                  onChange={(value) =>
                    form.setValue("catalog.search.meilisearch.semantic_ratio", value)
                  }
                  description={tr(
                    "pages.admin_settings.library_metadata_settings.value_0_ranks_by_words_1_by_meaning",
                  )}
                  disabled={!meiliEnabled}
                  restartRequired={restartKeys.has("catalog.search.meilisearch.semantic_ratio")}
                />
              </AdvancedSection>
            </>
          )}

          {meiliEnabled && searchStatus?.degraded && (
            <div className="py-3.5">
              <SettingFieldStatus tone="warn">
                <span>
                  {searchStatus.degraded_reason ??
                    tr(
                      "pages.admin_settings.library_metadata_settings.search_is_running_in_a_degraded_mode",
                    )}
                  {searchStatus.index.rebuild_required && (
                    <>
                      {" "}
                      {tr(
                        "pages.admin_settings.library_metadata_settings.automatic_search_maintenance_rebuilds_the_index_in_the_background_and",
                      )}{" "}
                      <Link
                        className="font-medium underline underline-offset-2"
                        to="/admin/tasks/sync_catalog_search_index"
                      >
                        {tr("pages.admin_settings.library_metadata_settings.open_maintenance_task")}
                      </Link>
                      .
                    </>
                  )}
                </span>
              </SettingFieldStatus>
            </div>
          )}

          <AdvancedSection
            id="library.search.status"
            title={tr("pages.admin_settings.library_metadata_settings.search_status")}
          >
            <SearchStatusPanel />
          </AdvancedSection>
        </FieldGroup>
      </div>

      <SaveBar
        dirtyCount={form.dirtyCount}
        onSave={form.save}
        onDiscard={form.discard}
        isSaving={form.isSaving}
      />
    </div>
  );
}
