import { useId, useMemo, useState } from "react";

import type {
  RateLimitAuthEndpointConfig,
  RateLimitConfig,
  RateLimitTierConfig,
} from "@/api/types";
import { AdvancedSection } from "@/components/settings/AdvancedSection";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { SettingsSubheading } from "@/components/settings/SettingsSubheading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRateLimitConfig, useUpdateRateLimitConfig } from "@/hooks/queries/admin/rateLimits";
import { useRestartKeys } from "@/hooks/useRestartKeys";
import { useSettingsForm } from "@/hooks/useSettingsForm";
import { useReportUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { cn } from "@/lib/utils";
import { FieldGroup } from "./FieldGroup";
import { SaveBar } from "./SaveBar";
import {
  SETTINGS_CONTROL_WIDTH,
  SETTINGS_NUMBER_WIDTH,
  SettingField,
  SettingFieldRow,
  SettingFieldStatus,
} from "./SettingField";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

// Sign-in lifetimes and proxy trust go through the batched settings endpoint.
// Rate limits do not: they live behind /admin/rate-limits/config and the batch
// endpoint rejects those keys, so this page drives two writers behind one save
// bar rather than showing the admin two different Save buttons.
const SESSION_KEYS = ["auth.access_token_expiry", "auth.refresh_token_expiry"];
const NETWORK_KEYS = ["clientip.trusted_proxies"];
const KEYS = [...SESSION_KEYS, ...NETWORK_KEYS];

const DEFAULT_TIER: RateLimitTierConfig = {
  requests_per_second: 10,
  requests_per_minute: 300,
  burst: 20,
};

const DEFAULT_AUTH_ENDPOINT: RateLimitAuthEndpointConfig = {
  requests_per_minute: 20,
  burst: 10,
};

const DEFAULT_CONFIG: RateLimitConfig = {
  enabled: true,
  backend: "memory",
  global_requests_per_second: 1000,
  tiers: {
    standard: { requests_per_second: 20, requests_per_minute: 1200, burst: 20 },
    elevated: { requests_per_second: 100, requests_per_minute: 6000, burst: 100 },
  },
  ip_requests_per_second: 120,
  ip_requests_per_minute: 6000,
  ip_burst: 120,
  auth_endpoints: {
    login: { requests_per_minute: 20, burst: 10 },
    signup: { requests_per_minute: 10, burst: 6 },
    setup: { requests_per_minute: 10, burst: 6 },
    password_change: { requests_per_minute: 10, burst: 5 },
    device_start: { requests_per_minute: 20, burst: 10 },
    device_lookup: { requests_per_minute: 60, burst: 20 },
    device_poll: { requests_per_minute: 120, burst: 30 },
    autoscan_webhook: { requests_per_minute: 60, burst: 30 },
  },
};

const TIER_LABELS: Record<string, string> = {
  standard: "pages.admin_settings.security_access_settings.standard_api_keys",
  elevated: "pages.admin_settings.security_access_settings.elevated_api_keys",
};

const AUTH_ENDPOINT_LABELS: Record<string, string> = {
  login: "pages.admin_settings.security_access_settings.sign_in",
  signup: "pages.admin_settings.security_access_settings.sign_up",
  setup: "pages.admin_settings.security_access_settings.first_run_setup",
  password_change: "pages.admin_settings.security_access_settings.change_password",
  device_start: "pages.admin_settings.security_access_settings.tv_sign_in_start",
  device_lookup: "pages.admin_settings.security_access_settings.tv_sign_in_code_lookup",
  device_poll: "pages.admin_settings.security_access_settings.tv_sign_in_waiting_for_approval",
  autoscan_webhook: "pages.admin_settings.security_access_settings.autoscan_webhook",
};

interface RateLimitField {
  value: number;
  onChange: (value: string) => void;
}

/** One captioned number box inside a rate-limit row's control column. */
function RateBox({
  id,
  caption,
  field,
  disabled,
}: {
  id: string;
  caption: string;
  field: RateLimitField;
  disabled: boolean;
}) {
  useUILanguage();
  useUILanguage();
  return (
    <span className="flex flex-col items-end gap-1">
      <Label htmlFor={id} className="text-muted-foreground text-[11px] font-normal">
        {caption}
      </Label>
      <Input
        id={id}
        type="number"
        min={1}
        value={field.value}
        onChange={(e) => field.onChange(e.target.value)}
        disabled={disabled}
        className="w-24 text-right tabular-nums"
      />
    </span>
  );
}

/**
 * One labelled row of request budgets. The per-second box is optional because
 * the public auth endpoints are only budgeted per minute; everything else on
 * this page uses the full requests/second · requests/minute · burst triad.
 */
function RateTriadRow({
  label,
  description,
  perSecond,
  perMinute,
  burst,
  disabled = false,
}: {
  label: string;
  description?: string;
  perSecond?: RateLimitField;
  perMinute: RateLimitField;
  burst: RateLimitField;
  disabled?: boolean;
}) {
  useUILanguage();
  useUILanguage();
  const baseId = useId();

  return (
    <SettingFieldRow label={label} htmlFor={baseId + "-rpm"} description={description}>
      <div className="flex flex-wrap items-end justify-end gap-2.5">
        {perSecond && (
          <RateBox
            id={baseId + "-rps"}
            caption="Per second"
            field={perSecond}
            disabled={disabled}
          />
        )}
        <RateBox id={baseId + "-rpm"} caption="Per minute" field={perMinute} disabled={disabled} />
        <RateBox id={baseId + "-burst"} caption="Burst" field={burst} disabled={disabled} />
      </div>
    </SettingFieldRow>
  );
}

export default function SecurityAccessSettings() {
  useUILanguage();
  useUILanguage();
  const form = useSettingsForm({ keys: useMemo(() => KEYS, []) });
  const restartKeys = useRestartKeys();
  const allRestart = (keys: string[]) => keys.every((key) => restartKeys.has(key));
  const { data: serverConfig, isLoading: rateLimitsLoading } = useRateLimitConfig();
  const updateConfig = useUpdateRateLimitConfig();

  const trustedProxiesManaged = form.sensitiveManagedByEnv.includes("clientip.trusted_proxies");

  // The save endpoint rejects the Redis backend unless Redis is configured, so
  // mirror that rule on the option itself. The server stays the source of
  // truth; an older response without the field leaves the option enabled.
  const redisSelectable = serverConfig?.redis_available !== false;

  // Drift the shared restart banner cannot see: what the limiter in this
  // process actually runs with, straight from the GET response. The
  // restart_required flag only covers staged saves — a limiter that failed to
  // apply the saved backend at boot (say, Redis was unreachable) drifts
  // without the flag, and a restart alone may not fix it, so the hint states
  // the mismatch instead of prescribing a restart.
  const savedBackend = serverConfig?.backend || "memory";
  const limiterInactive = serverConfig?.enabled === true && serverConfig.active === false;
  const runningBackend = serverConfig?.active === true ? serverConfig.active_backend : undefined;
  const runningBackendDiffers = Boolean(runningBackend) && runningBackend !== savedBackend;
  const backendNoun = (backend?: string) => (backend === "redis" ? "Redis" : "in-memory");

  const hydratedConfig = useMemo<RateLimitConfig>(() => {
    if (!serverConfig) return DEFAULT_CONFIG;
    return {
      enabled: serverConfig.enabled,
      backend: serverConfig.backend || "memory",
      global_requests_per_second: serverConfig.global_requests_per_second,
      tiers: {
        standard: serverConfig.tiers?.standard ?? DEFAULT_CONFIG.tiers.standard!,
        elevated: serverConfig.tiers?.elevated ?? DEFAULT_CONFIG.tiers.elevated!,
      },
      ip_requests_per_second:
        serverConfig.ip_requests_per_second ?? DEFAULT_CONFIG.ip_requests_per_second,
      ip_requests_per_minute:
        serverConfig.ip_requests_per_minute ?? DEFAULT_CONFIG.ip_requests_per_minute,
      ip_burst: serverConfig.ip_burst ?? DEFAULT_CONFIG.ip_burst,
      auth_endpoints: Object.fromEntries(
        Object.keys(AUTH_ENDPOINT_LABELS).map((endpoint) => [
          endpoint,
          serverConfig.auth_endpoints?.[endpoint] ??
            DEFAULT_CONFIG.auth_endpoints[endpoint] ??
            DEFAULT_AUTH_ENDPOINT,
        ]),
      ),
    };
  }, [serverConfig]);

  // Keyed on the hydrated snapshot so a refetch that actually changes the saved
  // config wins over a stale draft instead of silently resurrecting it.
  const hydratedKey = JSON.stringify(hydratedConfig);
  const [configState, setConfigState] = useState<{ key: string; config: RateLimitConfig }>({
    key: hydratedKey,
    config: hydratedConfig,
  });
  const config = configState.key === hydratedKey ? configState.config : hydratedConfig;

  function updateConfigState(updater: (prev: RateLimitConfig) => RateLimitConfig) {
    setConfigState((prev) => {
      const base = prev.key === hydratedKey ? prev.config : hydratedConfig;
      return { key: hydratedKey, config: updater(base) };
    });
  }

  function setNumber(field: (value: number) => void) {
    return (raw: string) => {
      const num = parseInt(raw, 10);
      if (isNaN(num) || num <= 0) return;
      field(num);
    };
  }

  function handleTierChange(tier: string, field: keyof RateLimitTierConfig, value: number) {
    updateConfigState((prev) => {
      const existing: RateLimitTierConfig = prev.tiers[tier] ?? DEFAULT_TIER;
      return { ...prev, tiers: { ...prev.tiers, [tier]: { ...existing, [field]: value } } };
    });
  }

  function handleAuthEndpointChange(
    endpoint: string,
    field: keyof RateLimitAuthEndpointConfig,
    value: number,
  ) {
    updateConfigState((prev) => {
      const existing: RateLimitAuthEndpointConfig =
        prev.auth_endpoints[endpoint] ?? DEFAULT_AUTH_ENDPOINT;
      return {
        ...prev,
        auth_endpoints: { ...prev.auth_endpoints, [endpoint]: { ...existing, [field]: value } },
      };
    });
  }

  const rateLimitsDirty = JSON.stringify(config) !== hydratedKey;
  // The rate-limit draft lives outside useSettingsForm, so it has to announce
  // itself to the unsaved-changes registry on its own — otherwise the
  // navigation guard and the reload prompt only know about the batched keys.
  useReportUnsavedChanges(rateLimitsDirty);
  // Everything except the on/off switch lives in the disclosure, so compare the
  // two with `enabled` normalised away to decide whether to force it open.
  const advancedDirty =
    JSON.stringify({ ...config, enabled: true }) !==
    JSON.stringify({ ...hydratedConfig, enabled: true });
  const advancedCount =
    2 + 3 + Object.keys(TIER_LABELS).length * 3 + Object.keys(AUTH_ENDPOINT_LABELS).length * 2;

  /**
   * One Save, two writers — and they are ordered, not concurrent. The
   * rate-limit endpoint validates `backend: redis` against the *persisted*
   * settings, so firing it alongside the settings batch means it can be judged
   * against the state the admin is in the middle of replacing.
   *
   * A failed writer keeps its own staged edits (neither mutation clears them on
   * error) and toasts the server's message, so the admin can fix the cause and
   * hit Save again. The batch failing skips the rate-limit PUT for the same
   * reason it goes first: the settings it would be validated against are not
   * the ones on screen.
   */
  async function handleSave() {
    try {
      if (form.dirtyCount > 0) await form.save();
      if (rateLimitsDirty) await updateConfig.mutateAsync(config);
    } catch {
      // Both mutations already surface the failure as a toast; swallowing here
      // only stops it becoming an unhandled rejection out of the save bar.
    }
  }

  function handleDiscard() {
    setConfigState({ key: hydratedKey, config: hydratedConfig });
    form.discard();
  }

  if (form.isLoading || rateLimitsLoading)
    return (
      <div
        className="space-y-6"
        role="status"
        aria-label={tr("pages.admin_settings.security_access_settings.loading_settings")}
      >
        <Skeleton className="h-8 w-48" />
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <span className="sr-only">
          {tr("pages.admin_settings.security_access_settings.loading_settings")}
        </span>
      </div>
    );

  const savingRateLimits = updateConfig.isPending;

  return (
    <div className="flex h-full flex-col">
      <SettingsPageHeader
        title={tr("pages.admin_settings.security_access_settings.security_access")}
        className="mb-8"
      />

      <div className="flex-1 space-y-5">
        <FieldGroup
          label={tr("pages.admin_settings.security_access_settings.sign_in_sessions")}
          restartAll={allRestart(SESSION_KEYS)}
        >
          <SettingField
            label={tr("pages.admin_settings.security_access_settings.access_token_expiry")}
            type="duration"
            description={tr(
              "pages.admin_settings.security_access_settings.how_long_before_an_app_silently_renews_e_g_30m",
            )}
            value={form.getValue("auth.access_token_expiry")}
            onChange={(v) => form.setValue("auth.access_token_expiry", v)}
            restartRequired={restartKeys.has("auth.access_token_expiry")}
          />
          <SettingField
            label={tr("pages.admin_settings.security_access_settings.refresh_token_expiry")}
            type="duration"
            description={tr(
              "pages.admin_settings.security_access_settings.how_long_someone_stays_signed_in_e_g_30d",
            )}
            value={form.getValue("auth.refresh_token_expiry")}
            onChange={(v) => form.setValue("auth.refresh_token_expiry", v)}
            restartRequired={restartKeys.has("auth.refresh_token_expiry")}
          />
        </FieldGroup>

        <FieldGroup
          label={tr("pages.admin_settings.security_access_settings.network")}
          restartAll={allRestart(NETWORK_KEYS)}
        >
          <SettingField
            label={tr("pages.admin_settings.security_access_settings.trusted_proxies")}
            description={
              trustedProxiesManaged
                ? tr(
                    "pages.admin_settings.security_access_settings.managed_by_silo_trusted_proxies",
                  )
                : tr(
                    "pages.admin_settings.security_access_settings.comma_separated_proxy_ranges_empty_keeps_the_private_defaults",
                  )
            }
            hint={tr(
              "pages.admin_settings.security_access_settings.value_172_16_0_0_12_203_0_113_7",
            )}
            value={form.getValue("clientip.trusted_proxies")}
            onChange={(v) => form.setValue("clientip.trusted_proxies", v)}
            disabled={trustedProxiesManaged}
            restartRequired={restartKeys.has("clientip.trusted_proxies")}
          />
        </FieldGroup>

        <FieldGroup label={tr("pages.admin_settings.security_access_settings.rate_limiting")}>
          <SettingField
            label={tr("pages.admin_settings.security_access_settings.enable_rate_limiting")}
            type="toggle"
            value={config.enabled ? "true" : "false"}
            onChange={(v) => updateConfigState((prev) => ({ ...prev, enabled: v === "true" }))}
            disabled={savingRateLimits}
            status={
              limiterInactive ? (
                <SettingFieldStatus tone="warn">
                  {tr(
                    "pages.admin_settings.security_access_settings.enabled_but_no_limiter_is_running_in_this_process_it",
                  )}
                </SettingFieldStatus>
              ) : undefined
            }
          />

          <AdvancedSection
            id="security.rate-limits"
            count={advancedCount}
            forceOpen={advancedDirty}
          >
            <SettingFieldRow
              label={tr("pages.admin_settings.security_access_settings.where_counters_are_kept")}
              htmlFor="rate-limit-backend"
              description={
                redisSelectable
                  ? tr(
                      "pages.admin_settings.security_access_settings.redis_shares_counters_across_servers_after_a_restart",
                    )
                  : tr(
                      "pages.admin_settings.security_access_settings.redis_shares_counters_across_servers_after_a_restart_configure_redis",
                    )
              }
              status={
                runningBackendDiffers ? (
                  <SettingFieldStatus tone="warn">
                    {tr(
                      "pages.admin_settings.security_access_settings.the_running_limiter_is_using",
                    )}{" "}
                    {backendNoun(runningBackend)}{" "}
                    {tr("pages.admin_settings.security_access_settings.counters_not_the_saved")}{" "}
                    {backendNoun(savedBackend)}{" "}
                    {tr(
                      "pages.admin_settings.security_access_settings.backend_if_a_restart_does_not_fix_it_check_that",
                    )}
                  </SettingFieldStatus>
                ) : undefined
              }
            >
              <Select
                value={config.backend}
                onValueChange={(value) =>
                  updateConfigState((prev) => ({ ...prev, backend: value }))
                }
                disabled={savingRateLimits}
              >
                <SelectTrigger id="rate-limit-backend" className={SETTINGS_CONTROL_WIDTH}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="memory">
                    {tr("pages.admin_settings.security_access_settings.this_server_only")}
                  </SelectItem>
                  <SelectItem value="redis" disabled={!redisSelectable}>
                    {tr("pages.admin_settings.security_access_settings.shared_via_redis")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </SettingFieldRow>

            <SettingFieldRow
              label={tr("pages.admin_settings.security_access_settings.whole_server_limit")}
              htmlFor="global-rps"
              description={tr(
                "pages.admin_settings.security_access_settings.ceiling_across_every_rate_limited_route",
              )}
              // The row's unit slot rather than a span beside the input: the
              // triad rows below have no unit, and an inline one here would
              // push this box off the column they share.
              unit="per second"
            >
              <Input
                id="global-rps"
                type="number"
                min={1}
                value={config.global_requests_per_second}
                onChange={(e) =>
                  setNumber((num) =>
                    updateConfigState((prev) => ({ ...prev, global_requests_per_second: num })),
                  )(e.target.value)
                }
                disabled={savingRateLimits}
                className={cn("text-right tabular-nums", SETTINGS_NUMBER_WIDTH)}
              />
            </SettingFieldRow>

            <RateTriadRow
              label={tr("pages.admin_settings.security_access_settings.per_client_address")}
              description={tr(
                "pages.admin_settings.security_access_settings.budget_one_ip_address_gets",
              )}
              disabled={savingRateLimits}
              perSecond={{
                value: config.ip_requests_per_second,
                onChange: setNumber((num) =>
                  updateConfigState((prev) => ({ ...prev, ip_requests_per_second: num })),
                ),
              }}
              perMinute={{
                value: config.ip_requests_per_minute,
                onChange: setNumber((num) =>
                  updateConfigState((prev) => ({ ...prev, ip_requests_per_minute: num })),
                ),
              }}
              burst={{
                value: config.ip_burst,
                onChange: setNumber((num) =>
                  updateConfigState((prev) => ({ ...prev, ip_burst: num })),
                ),
              }}
            />

            {Object.keys(TIER_LABELS).map((tier) => {
              const tierConfig = config.tiers[tier] ?? DEFAULT_TIER;
              return (
                <RateTriadRow
                  key={tier}
                  label={tr(TIER_LABELS[tier]!)}
                  disabled={savingRateLimits}
                  perSecond={{
                    value: tierConfig.requests_per_second,
                    onChange: setNumber((num) =>
                      handleTierChange(tier, "requests_per_second", num),
                    ),
                  }}
                  perMinute={{
                    value: tierConfig.requests_per_minute,
                    onChange: setNumber((num) =>
                      handleTierChange(tier, "requests_per_minute", num),
                    ),
                  }}
                  burst={{
                    value: tierConfig.burst,
                    onChange: setNumber((num) => handleTierChange(tier, "burst", num)),
                  }}
                />
              );
            })}

            <SettingsSubheading>
              {tr("pages.admin_settings.security_access_settings.sign_in_and_webhook_endpoints")}
            </SettingsSubheading>
            {Object.keys(AUTH_ENDPOINT_LABELS).map((endpoint) => {
              const epConfig = config.auth_endpoints[endpoint] ?? DEFAULT_AUTH_ENDPOINT;
              return (
                <RateTriadRow
                  key={endpoint}
                  label={tr(AUTH_ENDPOINT_LABELS[endpoint]!)}
                  disabled={savingRateLimits}
                  perMinute={{
                    value: epConfig.requests_per_minute,
                    onChange: setNumber((num) =>
                      handleAuthEndpointChange(endpoint, "requests_per_minute", num),
                    ),
                  }}
                  burst={{
                    value: epConfig.burst,
                    onChange: setNumber((num) => handleAuthEndpointChange(endpoint, "burst", num)),
                  }}
                />
              );
            })}
          </AdvancedSection>
        </FieldGroup>
      </div>

      <SaveBar
        dirtyCount={form.dirtyCount + (rateLimitsDirty ? 1 : 0)}
        onSave={() => void handleSave()}
        onDiscard={handleDiscard}
        isSaving={form.isSaving || savingRateLimits}
      />
    </div>
  );
}
