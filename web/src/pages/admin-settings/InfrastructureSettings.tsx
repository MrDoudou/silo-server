import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Plus, RotateCcw, Trash2 } from "lucide-react";

import type { ConnectionCheckResponse } from "@/api/types";
import { ConnectionCheckAction } from "@/components/admin/ConnectionCheckAction";
import { AdvancedSection } from "@/components/settings/AdvancedSection";
import { SecretField } from "@/components/settings/SecretField";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { SettingsSubheading } from "@/components/settings/SettingsSubheading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCheckAdminSettingsConnection } from "@/hooks/queries/admin/settings";
import { useRestartKeys, type RestartKeyMatcher } from "@/hooks/useRestartKeys";
import { useSettingsForm } from "@/hooks/useSettingsForm";

import { FieldGroup } from "./FieldGroup";
import { SaveBar } from "./SaveBar";
import { SettingField } from "./SettingField";
import { USER_DATABASE_BACKEND_OPTIONS } from "./databaseSettingOptions";
import {
  LOG_LEVEL_OPTIONS,
  OPSLOG_BUCKET_POLICIES_KEY,
  OPSLOG_MAX_ROWS_KEY,
  OPSLOG_MAX_SIZE_MB_KEY,
  OPSLOG_RETENTION_DAYS_KEY,
  appendBucketRow,
  bucketRowsFromRaw,
  recommendedBucketRows,
  removeBucketRow,
  serializeBucketRows,
  updateBucketRow,
  type LogRetentionBucketPolicy,
  type LogRetentionBucketRow,
} from "./logRetentionPolicy";
import { useUILanguage } from "@/i18n/uiText";

import { tr } from "@/i18n/translate";

type SettingsForm = ReturnType<typeof useSettingsForm>;

const REDIS_KEYS = ["redis.url"];

const DATABASE_KEYS = [
  "database.max_connections",
  "userdb.backend",
  "userdb.pool_max_open",
  "userdb.idle_timeout",
];

const PUBLIC_S3_KEYS = [
  "s3.public_endpoint",
  "s3.public_region",
  "s3.public_path_style",
  "s3.public_bucket",
  "s3.public_key_prefix",
  "s3.public_access_key",
  "s3.public_secret_key",
  "s3.public_read_endpoint",
  "s3.public_url_auth",
  "s3.public_token_secret",
  "s3.public_token_param",
  "s3.public_token_ttl",
];

// Changing any of these moves where cached artwork objects live. Silo detects
// that change after restart but requires an explicit manual reconcile so an
// incomplete bucket migration cannot rewrite the artwork catalog.
const PUBLIC_S3_IDENTITY_KEYS = ["s3.public_endpoint", "s3.public_bucket", "s3.public_key_prefix"];

const PRIVATE_S3_KEYS = [
  "s3.private_endpoint",
  "s3.private_region",
  "s3.private_path_style",
  "s3.private_bucket",
  "s3.private_key_prefix",
  "s3.private_access_key",
  "s3.private_secret_key",
];

// The overall trim limits are what an admin comes here to change; the policy
// decision log and the per-area rules are debugging tools behind Advanced.
const LOG_ESSENTIAL_KEYS = [OPSLOG_RETENTION_DAYS_KEY, OPSLOG_MAX_ROWS_KEY, OPSLOG_MAX_SIZE_MB_KEY];

const LOG_ADVANCED_KEYS = [
  "policy.decision_log_retention_days",
  "policy.decision_log_verbosity",
  "policy.decision_log_scope_sample_rate",
  OPSLOG_BUCKET_POLICIES_KEY,
];

const LOG_KEYS = [...LOG_ESSENTIAL_KEYS, ...LOG_ADVANCED_KEYS];

const KEYS = [...REDIS_KEYS, ...DATABASE_KEYS, ...PUBLIC_S3_KEYS, ...PRIVATE_S3_KEYS, ...LOG_KEYS];

function countDirty(form: SettingsForm, keys: string[]): number {
  return keys.filter((key) => form.isDirty(key)).length;
}

// Whether a group may claim "changes apply after a restart" for all of its
// fields at once. Computed from the server's restart registry rather than
// asserted, so converting one key to hot-reload silently demotes its group to
// per-field chips instead of leaving a false blanket claim — the Logs group
// below is exactly that case today.
function allRestart(restartKeys: RestartKeyMatcher, keys: string[]): boolean {
  return keys.every((key) => restartKeys.has(key));
}

/**
 * Shared credential-draft helpers for every secret on the page. Every editor
 * is frozen while a save is in flight so a late keystroke cannot ride along
 * with it; emptying an input reverts to the saved value (`keepSaved`), and
 * erasing one for real takes the explicit `clearSaved` action.
 */
interface SecretEditors {
  keepSaved: (key: string) => void;
  clearSaved: (key: string) => void;
  setSecret: (key: string, value: string) => void;
  disabled: boolean;
}

function RedisGroup({
  form,
  restartKeys,
  secrets,
}: {
  form: SettingsForm;
  restartKeys: RestartKeyMatcher;
  secrets: SecretEditors;
}) {
  useUILanguage();
  const checkConnection = useCheckAdminSettingsConnection();
  const [connectionResult, setConnectionResult] = useState<ConnectionCheckResponse | null>(null);
  const redisUrl = form.getValue("redis.url");
  const managedByEnv = form.sensitiveManagedByEnv.includes("redis.url");
  const configured = form.sensitiveConfigured.includes("redis.url");
  const [enabledOverride, setEnabledOverride] = useState<boolean | null>(null);
  // Saving or discarding clears the toggle override so it follows the stored
  // URL again. Adjusting during render (rather than in an effect) keeps the
  // override alive while the admin is still editing.
  const [lastDirtyCount, setLastDirtyCount] = useState(form.dirtyCount);
  if (lastDirtyCount !== form.dirtyCount) {
    setLastDirtyCount(form.dirtyCount);
    if (form.dirtyCount === 0) setEnabledOverride(null);
  }
  const enabled = enabledOverride ?? (redisUrl.trim() !== "" || configured);

  async function handleCheckConnection() {
    try {
      setConnectionResult(
        await checkConnection.mutateAsync({
          kind: "redis",
          body: form.buildConnectionCheckRequest(REDIS_KEYS),
        }),
      );
    } catch (error) {
      setConnectionResult({
        success: false,
        message: tr.error(
          "errors.admin_settings.infrastructure_settings.connection_check_failed",
          error,
        ),
      });
    }
  }

  return (
    <FieldGroup
      label={tr("pages.admin_settings.infrastructure_settings.redis")}
      restartAll={allRestart(restartKeys, REDIS_KEYS)}
    >
      <SettingField
        label={tr("pages.admin_settings.infrastructure_settings.use_redis")}
        type="toggle"
        description={
          managedByEnv
            ? tr("pages.admin_settings.infrastructure_settings.set_by_redis_url")
            : tr(
                "pages.admin_settings.infrastructure_settings.needed_when_running_more_than_one_server",
              )
        }
        value={enabled ? "true" : "false"}
        onChange={(value) => {
          if (value === "true") {
            setEnabledOverride(true);
            form.resetValue("redis.url");
            return;
          }
          setEnabledOverride(false);
          form.setValue("redis.url", "");
        }}
        disabled={managedByEnv}
        restartRequired={restartKeys.has("redis.url")}
      />
      {enabled && (
        <>
          {/*
            No `onClear` here: the Use Redis switch above already stages the
            empty URL, and one clear per surface is the rule.
          */}
          <SecretField
            label={tr("pages.admin_settings.infrastructure_settings.connection_url")}
            value={redisUrl}
            configured={configured}
            onKeep={() => secrets.keepSaved("redis.url")}
            onChange={(v) => secrets.setSecret("redis.url", v)}
            hint={tr(
              managedByEnv
                ? "pages.admin_settings.infrastructure_settings.value_supplied_by_redis_url"
                : "pages.admin_settings.infrastructure_settings.redis_host_6379",
            )}
            disabled={managedByEnv || secrets.disabled}
            restartRequired={restartKeys.has("redis.url")}
          />
          {/*
            Env-managed URLs stay checkable: the field is read-only so nothing
            is dirty, and the server checks the effective value it merged from
            REDIS_URL. Only writes are refused for env-managed keys.
          */}
          <ConnectionCheckAction
            onClick={handleCheckConnection}
            result={connectionResult}
            isPending={checkConnection.isPending}
            disabled={form.isSaving}
          />
        </>
      )}
    </FieldGroup>
  );
}

function S3Group({
  form,
  restartKeys,
  secrets,
  scope,
  label,
  description,
  checkKind,
}: {
  form: SettingsForm;
  restartKeys: RestartKeyMatcher;
  secrets: SecretEditors;
  scope: "public" | "private";
  label: string;
  description: string;
  checkKind: "s3_public" | "s3_private";
}) {
  useUILanguage();
  const checkConnection = useCheckAdminSettingsConnection();
  const [connectionResult, setConnectionResult] = useState<ConnectionCheckResponse | null>(null);
  const keys = scope === "public" ? PUBLIC_S3_KEYS : PRIVATE_S3_KEYS;
  const key = (suffix: string) => `s3.${scope}_${suffix}`;
  const urlAuth = form.getValue("s3.public_url_auth") || "presigned";

  const advancedKeys =
    scope === "public"
      ? [
          "s3.public_region",
          "s3.public_path_style",
          "s3.public_key_prefix",
          "s3.public_url_auth",
          "s3.public_read_endpoint",
          "s3.public_token_secret",
          "s3.public_token_param",
          "s3.public_token_ttl",
        ]
      : ["s3.private_region", "s3.private_path_style", "s3.private_key_prefix"];
  const advancedCount =
    scope === "public"
      ? 4 + (urlAuth !== "presigned" ? 1 : 0) + (urlAuth === "cloudflare_token" ? 3 : 0)
      : 3;
  const advancedChanged = countDirty(form, advancedKeys);

  async function handleCheckConnection() {
    try {
      setConnectionResult(
        await checkConnection.mutateAsync({
          kind: checkKind,
          body: form.buildConnectionCheckRequest(keys),
        }),
      );
    } catch (error) {
      setConnectionResult({
        success: false,
        message: tr.error(
          "errors.admin_settings.infrastructure_settings.connection_check_failed",
          error,
        ),
      });
    }
  }

  return (
    <FieldGroup label={label} description={description} restartAll={allRestart(restartKeys, keys)}>
      <SettingField
        label={tr("pages.admin_settings.infrastructure_settings.endpoint")}
        hint={tr("pages.admin_settings.infrastructure_settings.https_s3_us_east_1_amazonaws_com")}
        value={form.getValue(key("endpoint"))}
        onChange={(v) => form.setValue(key("endpoint"), v)}
        restartRequired={restartKeys.has(key("endpoint"))}
      />
      <SettingField
        label={tr("pages.admin_settings.infrastructure_settings.bucket")}
        value={form.getValue(key("bucket"))}
        onChange={(v) => form.setValue(key("bucket"), v)}
        restartRequired={restartKeys.has(key("bucket"))}
      />
      {scope === "public" && PUBLIC_S3_IDENTITY_KEYS.some((k) => form.isDirty(k)) && (
        <div className="my-3 flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="text-[13px] leading-relaxed">
            <p className="font-medium text-amber-500">
              {tr("pages.admin_settings.infrastructure_settings.storage_location_change")}
            </p>
            <p className="text-muted-foreground mt-1">
              {tr(
                "pages.admin_settings.infrastructure_settings.artwork_is_cached_in_this_bucket_silo_will_not_change",
              )}
            </p>
          </div>
        </div>
      )}
      {/*
        The access and secret keys must stay configured together, so clearing
        one alone is refused at save time. Both carry the action, which is what
        lets an admin stage the pair and hand this bucket back to anonymous or
        instance-role access.
      */}
      <SecretField
        label={tr("pages.admin_settings.infrastructure_settings.access_key")}
        value={form.getValue(key("access_key"))}
        configured={form.sensitiveConfigured.includes(key("access_key"))}
        onKeep={() => secrets.keepSaved(key("access_key"))}
        onClear={() => secrets.clearSaved(key("access_key"))}
        cleared={form.isClearStaged(key("access_key"))}
        onChange={(v) => secrets.setSecret(key("access_key"), v)}
        disabled={secrets.disabled}
        restartRequired={restartKeys.has(key("access_key"))}
      />
      <SecretField
        label={tr("pages.admin_settings.infrastructure_settings.secret_key")}
        value={form.getValue(key("secret_key"))}
        configured={form.sensitiveConfigured.includes(key("secret_key"))}
        onKeep={() => secrets.keepSaved(key("secret_key"))}
        onClear={() => secrets.clearSaved(key("secret_key"))}
        cleared={form.isClearStaged(key("secret_key"))}
        onChange={(v) => secrets.setSecret(key("secret_key"), v)}
        disabled={secrets.disabled}
        restartRequired={restartKeys.has(key("secret_key"))}
      />
      <ConnectionCheckAction
        onClick={handleCheckConnection}
        result={connectionResult}
        isPending={checkConnection.isPending}
        disabled={form.isSaving}
      />

      <AdvancedSection
        id={"infrastructure.s3." + scope}
        count={advancedCount}
        forceOpen={advancedChanged > 0}
      >
        <SettingField
          label={tr("pages.admin_settings.infrastructure_settings.region")}
          description={tr(
            "pages.admin_settings.infrastructure_settings.leave_blank_unless_your_provider_requires_one",
          )}
          value={form.getValue(key("region"))}
          onChange={(v) => form.setValue(key("region"), v)}
          restartRequired={restartKeys.has(key("region"))}
        />
        <SettingField
          label={tr(
            "pages.admin_settings.infrastructure_settings.put_the_bucket_name_in_the_url_path",
          )}
          type="toggle"
          description={tr(
            "pages.admin_settings.infrastructure_settings.needed_by_min_io_and_some_self_hosted_storage",
          )}
          value={form.getValue(key("path_style"))}
          onChange={(v) => form.setValue(key("path_style"), v)}
          restartRequired={restartKeys.has(key("path_style"))}
        />
        <SettingField
          label={tr("pages.admin_settings.infrastructure_settings.folder_inside_the_bucket")}
          description={tr(
            "pages.admin_settings.infrastructure_settings.leave_blank_to_use_the_bucket_root",
          )}
          value={form.getValue(key("key_prefix"))}
          onChange={(v) => form.setValue(key("key_prefix"), v)}
          restartRequired={restartKeys.has(key("key_prefix"))}
        />
        {scope === "public" && (
          <>
            <SettingField
              label={tr(
                "pages.admin_settings.infrastructure_settings.how_asset_links_are_authorized",
              )}
              type="select"
              description={tr(
                "pages.admin_settings.infrastructure_settings.signed_links_work_with_a_private_bucket_and_suit_most",
              )}
              value={urlAuth}
              onChange={(v) => form.setValue("s3.public_url_auth", v)}
              options={[
                {
                  value: "presigned",
                  label: tr(
                    "pages.admin_settings.infrastructure_settings.signed_links_recommended",
                  ),
                },
                {
                  value: "public",
                  label: tr("pages.admin_settings.infrastructure_settings.anyone_with_the_link"),
                },
                {
                  value: "cloudflare_token",
                  label: tr("pages.admin_settings.infrastructure_settings.cloudflare_signed_token"),
                },
              ]}
              restartRequired={restartKeys.has("s3.public_url_auth")}
            />
            {urlAuth !== "presigned" && (
              <SettingField
                label={tr(
                  "pages.admin_settings.infrastructure_settings.address_clients_download_from",
                )}
                hint={tr("pages.admin_settings.infrastructure_settings.https_cdn_example_com")}
                value={form.getValue("s3.public_read_endpoint")}
                onChange={(v) => form.setValue("s3.public_read_endpoint", v)}
                restartRequired={restartKeys.has("s3.public_read_endpoint")}
              />
            )}
            {urlAuth === "cloudflare_token" && (
              <>
                {/*
                  Cloudflare token auth requires this secret, so a clear only
                  saves alongside a switch back to another mode — the one order
                  that works, since the field is hidden in those modes.
                */}
                <SecretField
                  label={tr("pages.admin_settings.infrastructure_settings.token_secret")}
                  value={form.getValue("s3.public_token_secret")}
                  configured={form.sensitiveConfigured.includes("s3.public_token_secret")}
                  onKeep={() => secrets.keepSaved("s3.public_token_secret")}
                  onClear={() => secrets.clearSaved("s3.public_token_secret")}
                  cleared={form.isClearStaged("s3.public_token_secret")}
                  onChange={(v) => secrets.setSecret("s3.public_token_secret", v)}
                  hint={tr(
                    "pages.admin_settings.infrastructure_settings.signing_key_configured_in_cloudflare",
                  )}
                  disabled={secrets.disabled}
                  restartRequired={restartKeys.has("s3.public_token_secret")}
                />
                <SettingField
                  label={tr("pages.admin_settings.infrastructure_settings.token_query_parameter")}
                  description={tr("pages.admin_settings.infrastructure_settings.usually_verify")}
                  value={form.getValue("s3.public_token_param") || "verify"}
                  onChange={(v) => form.setValue("s3.public_token_param", v)}
                  restartRequired={restartKeys.has("s3.public_token_param")}
                />
                <SettingField
                  label={tr("pages.admin_settings.infrastructure_settings.link_lifetime")}
                  type="number"
                  unit="seconds"
                  value={form.getValue("s3.public_token_ttl") || "10800"}
                  onChange={(v) => form.setValue("s3.public_token_ttl", v)}
                  restartRequired={restartKeys.has("s3.public_token_ttl")}
                />
              </>
            )}
          </>
        )}
      </AdvancedSection>
    </FieldGroup>
  );
}

function DatabaseGroup({
  form,
  restartKeys,
}: {
  form: SettingsForm;
  restartKeys: RestartKeyMatcher;
}) {
  useUILanguage();
  const userDBBackend = form.getValue("userdb.backend");
  const sqlite = userDBBackend === "sqlite";
  const changed = countDirty(form, DATABASE_KEYS);

  return (
    <FieldGroup
      label={tr("pages.admin_settings.infrastructure_settings.database")}
      restartAll={allRestart(restartKeys, DATABASE_KEYS)}
    >
      <AdvancedSection id="infrastructure.database" count={sqlite ? 4 : 2} forceOpen={changed > 0}>
        <SettingField
          label={tr("pages.admin_settings.infrastructure_settings.maximum_postgres_connections")}
          type="number"
          description={tr(
            "pages.admin_settings.infrastructure_settings.raise_only_if_the_logs_show_connection_pool_waits",
          )}
          value={form.getValue("database.max_connections")}
          onChange={(v) => form.setValue("database.max_connections", v)}
          restartRequired={restartKeys.has("database.max_connections")}
        />
        <SettingField
          label={tr("pages.admin_settings.infrastructure_settings.where_per_user_data_is_stored")}
          type="select"
          description={tr(
            "pages.admin_settings.infrastructure_settings.postgre_sql_is_the_only_supported_option",
          )}
          options={USER_DATABASE_BACKEND_OPTIONS}
          value={userDBBackend}
          onChange={(v) => form.setValue("userdb.backend", v)}
          restartRequired={restartKeys.has("userdb.backend")}
        />
        {sqlite && (
          <>
            <SettingField
              label={tr("pages.admin_settings.infrastructure_settings.open_files_per_user")}
              type="number"
              description={tr(
                "pages.admin_settings.infrastructure_settings.sqlite_connections_one_user_database_may_hold_open",
              )}
              value={form.getValue("userdb.pool_max_open")}
              onChange={(v) => form.setValue("userdb.pool_max_open", v)}
              restartRequired={restartKeys.has("userdb.pool_max_open")}
            />
            <SettingField
              label={tr(
                "pages.admin_settings.infrastructure_settings.close_idle_user_databases_after",
              )}
              type="duration"
              description={tr("pages.admin_settings.infrastructure_settings.for_example_12h")}
              value={form.getValue("userdb.idle_timeout")}
              onChange={(v) => form.setValue("userdb.idle_timeout", v)}
              restartRequired={restartKeys.has("userdb.idle_timeout")}
            />
          </>
        )}
      </AdvancedSection>
    </FieldGroup>
  );
}

function BucketOverridesEditor({
  rows,
  parseError,
  onChange,
  onRestore,
}: {
  rows: LogRetentionBucketRow[];
  parseError: string;
  onChange: (rows: LogRetentionBucketRow[]) => void;
  onRestore: () => void;
}) {
  useUILanguage();
  function edit(id: string, field: keyof LogRetentionBucketPolicy, value: string) {
    onChange(updateBucketRow(rows, id, field, value));
  }

  return (
    <div className="space-y-4 py-3.5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <h4 className="text-sm font-medium">
            {tr("pages.admin_settings.infrastructure_settings.per_area_limits")}
          </h4>
          <p className="text-muted-foreground mt-1 text-xs">
            {tr("pages.admin_settings.infrastructure_settings.a_limit_of_0_turns_that_rule_off")}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <Button type="button" size="sm" variant="outline" onClick={onRestore}>
            <RotateCcw className="size-4" />
            {tr("pages.admin_settings.infrastructure_settings.restore_recommended_rules")}
          </Button>
          <Button type="button" size="sm" onClick={() => onChange(appendBucketRow(rows))}>
            <Plus className="size-4" />
            {tr("pages.admin_settings.infrastructure_settings.add_rule")}
          </Button>
        </div>
      </div>

      {parseError ? (
        <div className="border-warning/30 bg-warning/10 text-warning rounded-[1rem] border px-3 py-2 text-sm">
          {tr(
            "pages.admin_settings.infrastructure_settings.the_saved_rules_could_not_be_read_the_editor_loaded",
          )}{" "}
          {parseError}
        </div>
      ) : null}

      <div className="border-border/70 overflow-x-auto rounded-[1rem] border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">
                {tr("pages.admin_settings.infrastructure_settings.component")}
              </th>
              <th className="px-3 py-2 font-medium">
                {tr("pages.admin_settings.infrastructure_settings.level")}
              </th>
              <th className="px-3 py-2 font-medium">
                {tr("pages.admin_settings.infrastructure_settings.days")}
              </th>
              <th className="px-3 py-2 font-medium">
                {tr("pages.admin_settings.infrastructure_settings.max_rows")}
              </th>
              <th className="px-3 py-2 font-medium">
                {tr("pages.admin_settings.infrastructure_settings.max_size_mb")}
              </th>
              <th className="w-[60px] px-3 py-2 font-medium"> </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-muted-foreground px-3 py-6 text-center">
                  {tr("pages.admin_settings.infrastructure_settings.no_per_area_rules_configured")}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2">
                    <Input
                      value={row.component}
                      onChange={(event) => edit(row.id, "component", event.target.value)}
                      placeholder={tr("pages.admin_settings.infrastructure_settings.metadata")}
                      aria-label={tr(
                        "pages.admin_settings.infrastructure_settings.component_for_rule_id",
                        { id: row.id },
                      )}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={row.level}
                      onValueChange={(value) => edit(row.id, "level", value)}
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LOG_LEVEL_OPTIONS.map((level) => (
                          <SelectItem key={level} value={level}>
                            {level}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min="0"
                      value={String(row.retention_days)}
                      onChange={(event) => edit(row.id, "retention_days", event.target.value)}
                      className="w-[110px]"
                      aria-label={tr(
                        "pages.admin_settings.infrastructure_settings.days_for_rule_id",
                        { id: row.id },
                      )}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min="0"
                      value={String(row.max_rows)}
                      onChange={(event) => edit(row.id, "max_rows", event.target.value)}
                      className="w-[140px]"
                      aria-label={tr(
                        "pages.admin_settings.infrastructure_settings.max_rows_for_rule_id",
                        { id: row.id },
                      )}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min="0"
                      value={String(row.max_size_mb)}
                      onChange={(event) => edit(row.id, "max_size_mb", event.target.value)}
                      className="w-[140px]"
                      aria-label={tr(
                        "pages.admin_settings.infrastructure_settings.max_size_for_rule_id",
                        { id: row.id },
                      )}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      onClick={() => onChange(removeBucketRow(rows, row.id))}
                      aria-label={tr(
                        "pages.admin_settings.infrastructure_settings.remove_value_rule",
                        {
                          value: row.component || "bucket",
                        },
                      )}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LogsGroup({ form, restartKeys }: { form: SettingsForm; restartKeys: RestartKeyMatcher }) {
  useUILanguage();
  // The bucket rules are one JSON setting edited as a table, so the rows live
  // here while they are dirty and re-hydrate from the saved value otherwise.
  const [draftRows, setDraftRows] = useState<LogRetentionBucketRow[] | null>(null);
  const raw = form.getValue(OPSLOG_BUCKET_POLICIES_KEY);
  const bucketDirty = form.isDirty(OPSLOG_BUCKET_POLICIES_KEY);
  const hydrated = useMemo(() => bucketRowsFromRaw(raw), [raw]);
  // A stale draft can never be shown: it is only reachable while the key is
  // dirty, and the only thing that marks it dirty also sets the draft.
  const rows = bucketDirty && draftRows ? draftRows : hydrated.rows;
  const parseError = bucketDirty ? "" : hydrated.error;
  const advancedChanged = countDirty(form, LOG_ADVANCED_KEYS);

  function commitRows(next: LogRetentionBucketRow[]) {
    setDraftRows(next);
    form.setValue(OPSLOG_BUCKET_POLICIES_KEY, serializeBucketRows(next));
  }

  return (
    <FieldGroup label={tr("pages.admin_settings.infrastructure_settings.logs")}>
      <SettingField
        label={tr("pages.admin_settings.infrastructure_settings.delete_log_entries_older_than")}
        type="number"
        unit="days"
        value={form.getValue(OPSLOG_RETENTION_DAYS_KEY)}
        onChange={(v) => form.setValue(OPSLOG_RETENTION_DAYS_KEY, v)}
        restartRequired={restartKeys.has(OPSLOG_RETENTION_DAYS_KEY)}
      />
      <SettingField
        label={tr("pages.admin_settings.infrastructure_settings.maximum_log_entries")}
        type="number"
        value={form.getValue(OPSLOG_MAX_ROWS_KEY)}
        onChange={(v) => form.setValue(OPSLOG_MAX_ROWS_KEY, v)}
        restartRequired={restartKeys.has(OPSLOG_MAX_ROWS_KEY)}
      />
      <SettingField
        label={tr("pages.admin_settings.infrastructure_settings.maximum_log_size")}
        type="number"
        unit="MB"
        value={form.getValue(OPSLOG_MAX_SIZE_MB_KEY)}
        onChange={(v) => form.setValue(OPSLOG_MAX_SIZE_MB_KEY, v)}
        restartRequired={restartKeys.has(OPSLOG_MAX_SIZE_MB_KEY)}
      />

      <AdvancedSection
        id="infrastructure.logs"
        count={LOG_ADVANCED_KEYS.length}
        forceOpen={advancedChanged > 0}
      >
        <SettingsSubheading>
          {tr("pages.admin_settings.infrastructure_settings.permission_checks")}
        </SettingsSubheading>
        <SettingField
          label={tr(
            "pages.admin_settings.infrastructure_settings.delete_permission_records_older_than",
          )}
          type="number"
          unit="days"
          value={form.getValue("policy.decision_log_retention_days")}
          onChange={(v) => form.setValue("policy.decision_log_retention_days", v)}
          restartRequired={restartKeys.has("policy.decision_log_retention_days")}
        />
        <SettingField
          label={tr("pages.admin_settings.infrastructure_settings.how_much_to_record")}
          type="select"
          description={tr(
            "pages.admin_settings.infrastructure_settings.full_also_stores_a_sample_of_each_request",
          )}
          value={form.getValue("policy.decision_log_verbosity") || "digest"}
          onChange={(v) => form.setValue("policy.decision_log_verbosity", v)}
          options={[
            { value: "digest", label: tr("pages.admin_settings.infrastructure_settings.summary") },
            { value: "verbose", label: tr("pages.admin_settings.infrastructure_settings.full") },
          ]}
          restartRequired={restartKeys.has("policy.decision_log_verbosity")}
        />
        <SettingField
          label={tr(
            "pages.admin_settings.infrastructure_settings.record_one_allowed_check_in_every",
          )}
          type="number"
          description={tr(
            "pages.admin_settings.infrastructure_settings.denials_and_errors_are_always_recorded",
          )}
          value={form.getValue("policy.decision_log_scope_sample_rate")}
          onChange={(v) => form.setValue("policy.decision_log_scope_sample_rate", v)}
          restartRequired={restartKeys.has("policy.decision_log_scope_sample_rate")}
        />

        <BucketOverridesEditor
          rows={rows}
          parseError={parseError}
          onChange={commitRows}
          onRestore={() => commitRows(recommendedBucketRows())}
        />
      </AdvancedSection>
    </FieldGroup>
  );
}

export default function InfrastructureSettings() {
  useUILanguage();
  const form = useSettingsForm({ keys: useMemo(() => KEYS, []) });
  const restartKeys = useRestartKeys();
  const [saveInProgress, setSaveInProgress] = useState(false);
  const saveInProgressRef = useRef(false);

  const secrets: SecretEditors = {
    keepSaved: (key) => {
      if (saveInProgressRef.current) return;
      form.resetValue(key);
    },
    clearSaved: (key) => {
      if (saveInProgressRef.current) return;
      form.setValue(key, "");
    },
    setSecret: (key, value) => {
      if (saveInProgressRef.current) return;
      form.setValue(key, value);
    },
    disabled: form.isSaving || saveInProgress,
  };

  async function handleSave() {
    if (saveInProgressRef.current) return;
    saveInProgressRef.current = true;
    setSaveInProgress(true);
    try {
      await form.save();
    } catch {
      // The mutation reports the error; staged credential drafts stay for retry.
    } finally {
      saveInProgressRef.current = false;
      setSaveInProgress(false);
    }
  }

  function handleDiscard() {
    if (saveInProgressRef.current) return;
    form.discard();
  }

  if (form.sensitiveStatusError) {
    return (
      <div
        className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4"
        role="alert"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
        <div>
          <p className="text-sm font-medium">
            {tr(
              "pages.admin_settings.infrastructure_settings.protected_credential_status_is_unavailable",
            )}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {tr(
              "pages.admin_settings.infrastructure_settings.reload_this_page_before_editing_infrastructure_settings",
            )}
          </p>
        </div>
      </div>
    );
  }

  if (form.isLoading || !form.sensitiveStatusReady)
    return (
      <div
        className="space-y-6"
        role="status"
        aria-label={tr("pages.admin_settings.infrastructure_settings.loading_settings")}
      >
        <Skeleton className="h-8 w-48" />
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <span className="sr-only">
          {tr("pages.admin_settings.infrastructure_settings.loading_settings")}
        </span>
      </div>
    );

  return (
    <div className="flex h-full flex-col">
      <SettingsPageHeader
        title={tr("pages.admin_settings.infrastructure_settings.storage_database")}
        className="mb-8"
      />

      <div className="flex-1 space-y-5">
        <RedisGroup form={form} restartKeys={restartKeys} secrets={secrets} />
        <S3Group
          form={form}
          restartKeys={restartKeys}
          secrets={secrets}
          scope="public"
          label={tr("pages.admin_settings.infrastructure_settings.public_storage")}
          description={tr(
            "pages.admin_settings.infrastructure_settings.files_clients_download_directly_cached_artwork_uploaded_posters_and_branding",
          )}
          checkKind="s3_public"
        />
        <S3Group
          form={form}
          restartKeys={restartKeys}
          secrets={secrets}
          scope="private"
          label={tr("pages.admin_settings.infrastructure_settings.private_storage")}
          description={tr(
            "pages.admin_settings.infrastructure_settings.files_only_the_server_reads_profile_avatars_diagnostics_bundles_and",
          )}
          checkKind="s3_private"
        />
        <DatabaseGroup form={form} restartKeys={restartKeys} />
        <LogsGroup form={form} restartKeys={restartKeys} />
      </div>

      <SaveBar
        dirtyCount={form.dirtyCount}
        onSave={handleSave}
        onDiscard={handleDiscard}
        isSaving={form.isSaving || saveInProgress}
      />
    </div>
  );
}
