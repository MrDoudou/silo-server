import { useState } from "react";
import { Link } from "react-router";
import { toast } from "@/i18n/toast";

import type { MarkerProviderConfig, MarkerUserStats, PluginInstallation } from "@/api/types";
import {
  ProviderPanelActions,
  ProviderTile,
  ProviderTileGrid,
  providerMonogram,
  resolveProviderTileState,
  type ProviderTestState,
} from "@/components/settings/ProviderTile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminPluginInstallations } from "@/hooks/queries/admin/plugins";
import { installationConfigReady } from "@/lib/pluginConfigReady";
import { useReportUnsavedChanges } from "@/hooks/useUnsavedChanges";
import {
  useMarkerProviders,
  useUpdateMarkerProvider,
  useValidateMarkerProvider,
} from "@/hooks/queries/admin/markers";
import { SETTINGS_NUMBER_WIDTH, SettingField, SettingFieldRow } from "./SettingField";
import { useUILanguage } from "@/i18n/uiText";

import { tr } from "@/i18n/translate";

const INTEGER_INPUT_PATTERN = /^[+-]?\d+$/;

/** Tile id namespace, so a marker provider can never collide with a subtitle one. */
function markerTileID(provider: string): string {
  return `marker:${provider}`;
}

function formatRate(value: number) {
  return `${Math.round(value * 100)}%`;
}

/** What the last Validate said, kept per provider while the page is open. */
interface MarkerValidation {
  test: ProviderTestState;
  stats?: MarkerUserStats;
}

/**
 * Whether the plugin behind a marker provider has the configuration it asks
 * for. Silo never sees the key itself — it lives in the plugin's own runtime
 * config — but it does know which config keys the plugin declares and which
 * ones have a value saved, which is enough to stop a provider with no API key
 * from reading as connected. `undefined` means "not known yet": the
 * installations query is still in flight, or nothing matched, and a tile must
 * not guess in that window.
 */
function markerCredentialsReady(
  installations: PluginInstallation[] | undefined,
  provider: MarkerProviderConfig,
): boolean | undefined {
  if (!installations) return undefined;
  const installation = installations.find(
    (candidate) => candidate.id === provider.plugin_installation_id,
  );
  if (!installation) return undefined;
  return installationConfigReady(installation);
}

/**
 * Marker providers as tiles on the providers page, beside the subtitle and
 * metadata ones. Each tile's panel holds the per-provider behavior (lookup
 * order, contribution rules) that Silo owns; the provider's credentials belong
 * to the plugin and are edited on its plugin page.
 */
export function MarkerProviderTiles({
  expandedTile,
  onExpand,
  onCollapse,
}: {
  expandedTile: string | null;
  onExpand: (id: string) => void;
  onCollapse: () => void;
}) {
  useUILanguage();
  const providers = useMarkerProviders();
  // Installed plugins render the credential state; the tiles are useful before
  // that query lands, so they are never blocked on it.
  const { data: installations } = useAdminPluginInstallations();
  const [results, setResults] = useState<Record<string, MarkerValidation | undefined>>({});

  if (providers.isLoading) {
    return (
      <ProviderTileGrid>
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </ProviderTileGrid>
    );
  }

  const providerList = providers.data?.providers ?? [];
  if (providerList.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {tr(
          "pages.admin_settings.marker_provider_tiles.no_marker_provider_plugins_are_installed_more_install_from_the",
        )}{" "}
        <Link
          to="/admin/plugins?tab=catalog"
          className="hover:text-foreground font-medium underline underline-offset-2 transition-colors"
        >
          {tr("pages.admin_settings.marker_provider_tiles.plugin_catalog")}
        </Link>
        .
      </p>
    );
  }

  return (
    <ProviderTileGrid>
      {providerList.map((provider) => {
        const id = markerTileID(provider.provider);
        return (
          <MarkerProviderTile
            // Server values in the key so a saved provider drops the drafts it
            // was edited with instead of re-showing them over the new state.
            key={[
              provider.provider,
              provider.fetch_enabled,
              provider.fetch_priority,
              provider.contribute_enabled,
              provider.contribute_auto_local,
              provider.contribute_min_confidence,
              provider.is_submitter,
            ].join(":")}
            provider={provider}
            credentialsReady={markerCredentialsReady(installations, provider)}
            expanded={expandedTile === id}
            onExpand={() => onExpand(id)}
            onCollapse={onCollapse}
            result={results[id]}
            onValidated={(result) => setResults((current) => ({ ...current, [id]: result }))}
          />
        );
      })}
    </ProviderTileGrid>
  );
}

function MarkerProviderTile({
  provider,
  credentialsReady,
  expanded,
  onExpand,
  onCollapse,
  result,
  onValidated,
}: {
  provider: MarkerProviderConfig;
  credentialsReady: boolean | undefined;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  result: MarkerValidation | undefined;
  onValidated: (result: MarkerValidation | undefined) => void;
}) {
  useUILanguage();
  const updateProvider = useUpdateMarkerProvider();
  const validateProvider = useValidateMarkerProvider();
  const displayName = provider.display_name || provider.provider;
  const slug = provider.provider.replace(/[^a-zA-Z0-9_-]/g, "-");
  const minConfidenceID = `marker-min-confidence-${slug}`;
  const priorityID = `marker-priority-${slug}`;
  const [fetchEnabled, setFetchEnabled] = useState(provider.fetch_enabled);
  const [fetchPriority, setFetchPriority] = useState(String(provider.fetch_priority));
  const [contributeEnabled, setContributeEnabled] = useState(provider.contribute_enabled);
  const [autoLocal, setAutoLocal] = useState(provider.contribute_auto_local);
  const [minConfidence, setMinConfidence] = useState(
    String(provider.contribute_min_confidence ?? 0.95),
  );

  const parsedMinConfidence = Number.parseFloat(minConfidence);
  const confidenceValid =
    Number.isFinite(parsedMinConfidence) && parsedMinConfidence >= 0 && parsedMinConfidence <= 1;
  const fetchPriorityInput = fetchPriority.trim();
  const parsedFetchPriority = Number(fetchPriorityInput);
  const priorityValid =
    INTEGER_INPUT_PATTERN.test(fetchPriorityInput) && Number.isInteger(parsedFetchPriority);
  const dirty =
    provider.fetch_enabled !== fetchEnabled ||
    provider.fetch_priority !== parsedFetchPriority ||
    provider.contribute_enabled !== contributeEnabled ||
    provider.contribute_auto_local !== autoLocal ||
    provider.contribute_min_confidence !== parsedMinConfidence;
  // The tile's draft lives outside useSettingsForm, so the navigation guard
  // and the reload prompt only see it if the tile reports it itself.
  useReportUnsavedChanges(dirty);

  function save() {
    if (!priorityValid) {
      toast.error(
        "errors.admin_settings.marker_provider_tiles.lookup_order_must_be_a_whole_number",
      );
      return;
    }
    if (!confidenceValid) {
      toast.error(
        "errors.admin_settings.marker_provider_tiles.minimum_confidence_must_be_between_0_and_1",
      );
      return;
    }

    updateProvider.mutate({
      provider: provider.provider,
      patch: {
        fetch_enabled: fetchEnabled,
        fetch_priority: parsedFetchPriority,
        contribute_enabled: contributeEnabled,
        contribute_auto_local: contributeEnabled && autoLocal,
        contribute_min_confidence: parsedMinConfidence,
      },
    });
  }

  function validate() {
    const started = Date.now();
    onValidated(undefined);
    validateProvider.mutate(
      { provider: provider.provider, displayName },
      {
        onSuccess: (response) =>
          onValidated({
            test: {
              ok: response.valid,
              message: response.valid
                ? tr("api.messages.provider_validated")
                : tr.remote({ message: response.error ?? "Validation failed." }),
              at: Date.now(),
              durationMs: Date.now() - started,
            },
            stats: response.stats,
          }),
        onError: (error) =>
          onValidated({
            test: {
              ok: false,
              message: tr.error(
                "errors.admin_settings.marker_provider_tiles.validation_failed",
                error,
              ),
              at: Date.now(),
              durationMs: Date.now() - started,
            },
          }),
      },
    );
  }

  const test = result?.test;
  const stats = result?.stats;
  // "Connected" has to mean the server can actually look markers up here: the
  // plugin has its configuration and the provider is on for lookup.
  const connected = credentialsReady !== false && provider.fetch_enabled;
  const state = resolveProviderTileState({ expanded, test, connected });
  const statePill = expanded
    ? undefined
    : credentialsReady === false
      ? "Needs setup"
      : provider.fetch_enabled
        ? undefined
        : "Connected · off";
  // Only a failure earns the extra line: the state word already says the rest.
  const meta = !expanded && test && !test.ok ? test.message : undefined;
  // installed_q keeps the list behind the dialog filtered to this plugin;
  // configure opens its config dialog (API key and account) directly.
  const pluginPage = provider.plugin_id
    ? `/admin/plugins?installed_q=${encodeURIComponent(provider.plugin_id)}&configure=${encodeURIComponent(provider.plugin_id)}`
    : "/admin/plugins";

  return (
    <ProviderTile
      name={displayName}
      tagline={tr("pages.admin_settings.marker_provider_tiles.intro_and_credits_markers")}
      monogram={providerMonogram(displayName)}
      monogramClass="bg-teal-500/20 text-teal-700 dark:text-teal-300"
      state={state}
      statePill={statePill}
      meta={meta}
      busy={updateProvider.isPending || validateProvider.isPending}
      expanded={expanded}
      primaryAction={{
        get label() {
          return tr(
            test && !test.ok
              ? "pages.admin_settings.marker_provider_tiles.fix"
              : credentialsReady === false
                ? "pages.admin_settings.marker_provider_tiles.set_up"
                : "pages.admin_settings.marker_provider_tiles.manage",
          );
        },
        onClick: onExpand,
      }}
    >
      <p className="text-muted-foreground mb-1 text-xs">
        {provider.source_type === "plugin" && provider.plugin_id ? (
          <>
            {tr(
              "pages.admin_settings.marker_provider_tiles.account_and_api_keys_for_this_provider_live_on_its",
            )}{" "}
            <Link to={pluginPage} className="underline underline-offset-2">
              {tr("pages.admin_settings.marker_provider_tiles.plugin_page")}
            </Link>
            .
          </>
        ) : (
          provider.provider
        )}
      </p>

      <SettingField
        label={tr("pages.admin_settings.marker_provider_tiles.use_for_online_marker_lookup")}
        type="toggle"
        value={fetchEnabled ? "true" : "false"}
        onChange={(value) => setFetchEnabled(value === "true")}
      />
      <SettingFieldRow
        label={tr("pages.admin_settings.marker_provider_tiles.lookup_order")}
        htmlFor={priorityID}
        description={tr(
          "pages.admin_settings.marker_provider_tiles.lower_numbers_win_when_providers_overlap",
        )}
      >
        <Input
          id={priorityID}
          type="number"
          value={fetchPriority}
          step={1}
          onChange={(event) => setFetchPriority(event.target.value)}
          className={SETTINGS_NUMBER_WIDTH}
          aria-invalid={!priorityValid}
        />
      </SettingFieldRow>
      <SettingField
        label={tr("pages.admin_settings.marker_provider_tiles.allow_contributions")}
        type="toggle"
        value={contributeEnabled ? "true" : "false"}
        onChange={(value) => {
          const next = value === "true";
          setContributeEnabled(next);
          if (!next) setAutoLocal(false);
        }}
        disabled={!provider.is_submitter}
      />
      <SettingField
        label={tr(
          "pages.admin_settings.marker_provider_tiles.send_this_server_s_markers_automatically",
        )}
        type="toggle"
        value={autoLocal ? "true" : "false"}
        onChange={(value) => setAutoLocal(value === "true")}
        disabled={!provider.is_submitter || !contributeEnabled}
        hint={tr(
          "pages.admin_settings.marker_provider_tiles.only_markers_this_server_detected_and_only_those_above_the",
        )}
      />
      <SettingFieldRow
        label={tr("pages.admin_settings.marker_provider_tiles.minimum_confidence")}
        htmlFor={minConfidenceID}
        description={tr(
          "pages.admin_settings.marker_provider_tiles.use_a_decimal_from_0_to_1_the_default_recommendation",
        )}
      >
        <Input
          id={minConfidenceID}
          type="number"
          value={minConfidence}
          min={0}
          max={1}
          step={0.01}
          onChange={(event) => setMinConfidence(event.target.value)}
          className={SETTINGS_NUMBER_WIDTH}
          aria-invalid={!confidenceValid}
          disabled={!provider.is_submitter}
        />
      </SettingFieldRow>

      {stats && (
        <div className="border-border bg-muted/20 mt-3.5 rounded-md border px-3 py-3">
          <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">
                {tr("pages.admin_settings.marker_provider_tiles.total_submissions")}
              </dt>
              <dd className="font-medium">{stats.total}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">
                {tr("pages.admin_settings.marker_provider_tiles.accepted")}
              </dt>
              <dd className="font-medium">{stats.accepted}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">
                {tr("pages.admin_settings.marker_provider_tiles.pending")}
              </dt>
              <dd className="font-medium">{stats.pending}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">
                {tr("pages.admin_settings.marker_provider_tiles.rejected")}
              </dt>
              <dd className="font-medium">{stats.rejected}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">
                {tr("pages.admin_settings.marker_provider_tiles.acceptance_rate")}
              </dt>
              <dd className="font-medium">{formatRate(stats.acceptance_rate)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">
                {tr("pages.admin_settings.marker_provider_tiles.best_streak")}
              </dt>
              <dd className="font-medium">{stats.best_streak}</dd>
            </div>
          </dl>
        </div>
      )}

      <ProviderPanelActions test={test}>
        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={!dirty || !priorityValid || !confidenceValid || updateProvider.isPending}
        >
          {updateProvider.isPending
            ? tr("pages.admin_settings.marker_provider_tiles.saving")
            : tr("common.actions.save")}
        </Button>
        {provider.is_submitter && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={validate}
            disabled={validateProvider.isPending}
          >
            {validateProvider.isPending
              ? tr("pages.admin_settings.marker_provider_tiles.validating")
              : tr("pages.admin_settings.marker_provider_tiles.validate")}
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" onClick={onCollapse}>
          {tr("common.actions.close")}
        </Button>
      </ProviderPanelActions>
    </ProviderTile>
  );
}
