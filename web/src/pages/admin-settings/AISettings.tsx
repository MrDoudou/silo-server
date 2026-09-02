import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { AudioLines, CircleAlert, Languages } from "lucide-react";
import { toast } from "@/i18n/toast";

import { AdvancedSection } from "@/components/settings/AdvancedSection";
import { LimitField } from "@/components/settings/LimitField";
import { ProviderTile, ProviderTileGrid } from "@/components/settings/ProviderTile";
import type { ProviderTileState } from "@/components/settings/ProviderTile";
import { SecretField } from "@/components/settings/SecretField";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { SettingsSubheading } from "@/components/settings/SettingsSubheading";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCheckAdminSettingsConnection } from "@/hooks/queries/admin/settings";
import { useRestartKeys, type RestartKeyMatcher } from "@/hooks/useRestartKeys";
import { useSettingsForm } from "@/hooks/useSettingsForm";
import { QUOTA_PERIODS, QUOTA_PERIOD_WINDOW_LABELS } from "@/lib/quotaPeriods";
import { cn } from "@/lib/utils";

import { FieldGroup } from "./FieldGroup";
import { SaveBar } from "./SaveBar";
import { SettingField, SettingFieldStatus } from "./SettingField";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

// ---------------------------------------------------------------------------
// Setting keys
// ---------------------------------------------------------------------------

const TEXT_AI_KEYS = ["ai.base_url", "ai.chat_model", "ai.api_key"] as const;
/**
 * What the transcription connection check has to send: the speech endpoint
 * plus the text endpoint it falls back to when no ASR base URL is set.
 */
const SPEECH_AI_KEYS = [
  "ai.base_url",
  "ai.api_key",
  "ai.asr_base_url",
  "ai.asr_model",
  "ai.asr_api_key",
] as const;
/**
 * The keys the speech tile actually renders. Only these decide whether it is
 * held open by a staged edit — the shared text keys are edited in the text
 * tile, so counting them here would expand both tiles at once.
 */
const SPEECH_ONLY_KEYS = ["ai.asr_base_url", "ai.asr_model", "ai.asr_api_key"] as const;
/**
 * Pre-`ai.*` keys. They are still read as a fallback so a server that was
 * configured before the rename keeps working until the modern key is saved.
 */
const LEGACY_AI_KEYS = [
  "subtitle_ai.base_url",
  "subtitle_ai.api_key",
  "subtitle_ai.chat_model",
  "subtitle_ai.max_concurrent_jobs",
] as const;

const AI_FEATURE_KEYS = [
  "subtitle_ai.enabled",
  "subtitle_ai.transcribe_enabled",
  "metadata_ai.enabled",
  "metadata_ai.on_view",
];

const AI_ADVANCED_KEYS = [
  "ai.max_concurrent_jobs",
  "subtitle_ai.batch_size",
  "subtitle_ai.context_neighbors",
  "subtitle_ai.asr_chunk_seconds",
  "subtitle_ai.transcribe_quota_jobs",
  "subtitle_ai.transcribe_quota_period",
];

const KEYS: string[] = Array.from(
  new Set([
    ...TEXT_AI_KEYS,
    ...SPEECH_AI_KEYS,
    ...LEGACY_AI_KEYS,
    ...AI_FEATURE_KEYS,
    ...AI_ADVANCED_KEYS,
  ]),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TRANSCRIPTION_PRESETS = [
  {
    id: "self-hosted",
    get label() {
      return tr("pages.admin_settings.aisettings.self_hosted");
    },
    get description() {
      return tr(
        "pages.admin_settings.aisettings.speaches_or_faster_whisper_on_your_network_replace_the_hostname",
      );
    },
    baseUrl: "http://speaches:8000",
    model: "deepdml/faster-whisper-large-v3-turbo-ct2",
  },
  {
    id: "groq-turbo",
    get label() {
      return tr("pages.admin_settings.aisettings.groq_fast");
    },
    get description() {
      return tr(
        "pages.admin_settings.aisettings.hosted_whisper_large_v3_turbo_requires_a_groq_api_key",
      );
    },
    baseUrl: "https://api.groq.com/openai",
    model: "whisper-large-v3-turbo",
  },
  {
    id: "groq-accurate",
    get label() {
      return tr("pages.admin_settings.aisettings.groq_accurate");
    },
    get description() {
      return tr("pages.admin_settings.aisettings.hosted_whisper_large_v3_requires_a_groq_api_key");
    },
    baseUrl: "https://api.groq.com/openai",
    model: "whisper-large-v3",
  },
  {
    id: "openai",
    get label() {
      return tr("pages.admin_settings.aisettings.open_ai");
    },
    get description() {
      return tr(
        "pages.admin_settings.aisettings.hosted_whisper_1_the_transcription_key_can_inherit_the_text",
      );
    },
    baseUrl: "https://api.openai.com",
    model: "whisper-1",
  },
] as const;

const CHAT_ONLY_GATEWAY_HOSTS = ["openrouter.ai"];

function isChatOnlyGateway(rawURL: string): boolean {
  const trimmed = rawURL.trim();
  if (!trimmed) return false;
  try {
    const host = new URL(
      trimmed.includes("://") ? trimmed : `https://${trimmed}`,
    ).hostname.toLowerCase();
    return CHAT_ONLY_GATEWAY_HOSTS.some(
      (gateway) => host === gateway || host.endsWith(`.${gateway}`),
    );
  } catch {
    return false;
  }
}

function hostLabel(rawURL: string): string {
  const trimmed = rawURL.trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).host;
  } catch {
    return trimmed;
  }
}

function parseStrictInteger(rawValue: string): number | null {
  const trimmed = rawValue.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Result of the last connection check, kept in memory for the tile and strip. */
interface AITestState {
  ok: boolean;
  message: string;
  at: number;
  durationMs: number;
}

function testedLabel(test: AITestState): string {
  const seconds = Math.max(0, Math.round((Date.now() - test.at) / 1000));
  const ago = seconds < 60 ? `${seconds}s ago` : `${Math.round(seconds / 60)}m ago`;
  return `Tested ${ago} · ${test.durationMs} ms`;
}

/**
 * The action row shared by both model tiles. Both controls carry a border or a
 * fill at rest: a `ghost` button reads as plain text until it is hovered, which
 * hid Close from admins who never hovered it.
 */
function ModelPanelActions({
  testLabel,
  pendingLabel,
  onTest,
  isTesting,
  testDisabled,
  onCollapse,
  canCollapse,
  test,
}: {
  testLabel: string;
  pendingLabel: string;
  onTest: () => void;
  isTesting: boolean;
  testDisabled: boolean;
  onCollapse: () => void;
  /**
   * False while a staged edit holds the tile open. Collapsing then does
   * nothing, so the button is left out rather than shown as a dead control.
   */
  canCollapse: boolean;
  test: AITestState | undefined;
}) {
  useUILanguage();
  useUILanguage();
  return (
    // Buttons right-aligned to match the collapsed tile's Manage button (and
    // the shared ProviderPanelActions); the test status takes the left side.
    <div className="mt-3.5 flex flex-wrap items-center justify-end gap-2">
      {test ? (
        <span
          role="status"
          aria-live="polite"
          className={cn(
            "mr-auto text-[11.5px]",
            test.ok ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400",
          )}
        >
          {test.ok
            ? tr("pages.admin_settings.aisettings.message_value", {
                message: test.message,
                value: testedLabel(test),
              })
            : test.message}
        </span>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={onTest}
        disabled={testDisabled || isTesting}
      >
        {isTesting ? pendingLabel : testLabel}
      </Button>
      {canCollapse ? (
        <Button type="button" size="sm" variant="outline" onClick={onCollapse}>
          {tr("common.actions.close")}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * A labelled cluster inside the Advanced disclosure. The tuning fields mix two
 * scopes — server-wide dispatch/batching and a per-login-account quota — and
 * nothing on the row itself says which is which, so the scope is stated once
 * per cluster instead of being repeated (or omitted) field by field.
 *
 * One element per cluster also means the disclosure's child rule draws a single
 * hairline between the two, with the rows keeping their own inside each.
 */
function TuningScope({
  label,
  caption,
  children,
}: {
  label: string;
  caption: string;
  children: ReactNode;
}) {
  useUILanguage();
  useUILanguage();
  return (
    <div>
      <SettingsSubheading caption={caption}>{label}</SettingsSubheading>
      {children}
    </div>
  );
}

/** Note shown on a model tile whose values are staged in the page's save bar. */
function PendingSaveNote({ dirty }: { dirty: boolean }) {
  useUILanguage();
  useUILanguage();
  if (!dirty) return null;
  return (
    <p className="text-muted-foreground mt-2 text-xs">
      {tr("pages.admin_settings.aisettings.unsaved_test_uses_what_is_typed_here")}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Model tiles
// ---------------------------------------------------------------------------

function TextModelTile({
  baseURL,
  chatModel,
  apiKeyValue,
  apiKeyConfigured,
  apiKeyCleared,
  ready,
  dirty,
  restartKeys,
  onChange,
  onReset,
  onClearApiKey,
  onTest,
  isTesting,
  test,
  expanded,
  onExpand,
  onCollapse,
}: {
  baseURL: string;
  chatModel: string;
  apiKeyValue: string;
  apiKeyConfigured: boolean;
  apiKeyCleared: boolean;
  ready: boolean;
  dirty: boolean;
  restartKeys: RestartKeyMatcher;
  onChange: (key: string, value: string) => void;
  onReset: (key: string) => void;
  onClearApiKey: () => void;
  onTest: () => void;
  isTesting: boolean;
  test: AITestState | undefined;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
}) {
  useUILanguage();
  useUILanguage();
  const failed = test != null && !test.ok;
  const state: ProviderTileState = expanded
    ? "editing"
    : failed
      ? "error"
      : ready
        ? "connected"
        : "not_connected";

  return (
    <ProviderTile
      name="Text model"
      tagline={tr("pages.admin_settings.aisettings.subtitle_text_descriptions_and_taglines")}
      logo={<Languages className="text-muted-foreground size-4" aria-hidden="true" />}
      state={state}
      statePill={
        !expanded && ready && !test?.ok
          ? tr("pages.admin_settings.aisettings.configured")
          : undefined
      }
      meta={
        expanded
          ? undefined
          : failed
            ? test.message
            : ready
              ? `${chatModel} · ${hostLabel(baseURL)}`
              : "Base URL and model required"
      }
      expanded={expanded}
      primaryAction={{
        get label() {
          return tr(
            ready
              ? "pages.admin_settings.aisettings.manage"
              : "pages.admin_settings.aisettings.connect",
          );
        },
        onClick: onExpand,
      }}
    >
      <p className="text-muted-foreground mb-1 text-xs">
        {tr("pages.admin_settings.aisettings.any_chat_endpoint_that_speaks_the_open_ai_api")}
      </p>
      <SettingField
        label={tr("pages.admin_settings.aisettings.base_url")}
        value={baseURL}
        onChange={(next) => onChange("ai.base_url", next)}
        hint={tr("pages.admin_settings.aisettings.https_api_openai_com")}
        restartRequired={restartKeys.has("ai.base_url")}
      />
      <SettingField
        label={tr("pages.admin_settings.aisettings.model")}
        value={chatModel}
        onChange={(next) => onChange("ai.chat_model", next)}
        hint={tr("pages.admin_settings.aisettings.gpt_4o_mini_gemini_flash_latest_llama3_1")}
        restartRequired={restartKeys.has("ai.chat_model")}
      />
      <SecretField
        label={tr("pages.admin_settings.aisettings.api_key")}
        value={apiKeyValue}
        configured={apiKeyConfigured}
        onChange={(next) => onChange("ai.api_key", next)}
        // Without this, "Keep saved value" would stage an empty string and the
        // next save would erase the stored key.
        onKeep={() => onReset("ai.api_key")}
        // A local endpoint that needs no key has to be able to get back to
        // having none, and nothing else on this page erases one.
        onClear={onClearApiKey}
        cleared={apiKeyCleared}
        hint={tr("pages.admin_settings.aisettings.empty_for_a_local_endpoint_that_needs_none")}
        restartRequired={restartKeys.has("ai.api_key")}
      />
      <ModelPanelActions
        testLabel="Test text model"
        pendingLabel={tr("pages.admin_settings.aisettings.testing_text_model")}
        onTest={onTest}
        isTesting={isTesting}
        testDisabled={!ready}
        onCollapse={onCollapse}
        canCollapse={!dirty}
        test={test}
      />
      <PendingSaveNote dirty={dirty} />
    </ProviderTile>
  );
}

function SpeechModelTile({
  asrBaseURL,
  asrModel,
  apiKeyValue,
  apiKeyConfigured,
  apiKeyCleared,
  usesTextEndpoint,
  compatible,
  ready,
  checkable,
  dirty,
  restartKeys,
  onChange,
  onReset,
  onClearApiKey,
  onTest,
  isTesting,
  test,
  expanded,
  onExpand,
  onCollapse,
}: {
  asrBaseURL: string;
  asrModel: string;
  apiKeyValue: string;
  apiKeyConfigured: boolean;
  apiKeyCleared: boolean;
  usesTextEndpoint: boolean;
  compatible: boolean;
  ready: boolean;
  checkable: boolean;
  dirty: boolean;
  restartKeys: RestartKeyMatcher;
  onChange: (key: string, value: string) => void;
  onReset: (key: string) => void;
  onClearApiKey: () => void;
  onTest: () => void;
  isTesting: boolean;
  test: AITestState | undefined;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
}) {
  useUILanguage();
  useUILanguage();
  const failed = test != null && !test.ok;
  const statePill = !compatible
    ? "Cannot transcribe"
    : test?.ok
      ? "Verified"
      : usesTextEndpoint
        ? "Shared endpoint"
        : ready
          ? "Configured"
          : undefined;
  const state: ProviderTileState = expanded
    ? "editing"
    : !compatible || failed
      ? "error"
      : ready && !usesTextEndpoint
        ? "connected"
        : "not_connected";

  return (
    <ProviderTile
      name="Speech-to-text"
      tagline={tr("pages.admin_settings.aisettings.writes_subtitles_from_an_audio_track")}
      logo={<AudioLines className="text-muted-foreground size-4" aria-hidden="true" />}
      state={state}
      statePill={expanded ? undefined : statePill}
      meta={
        expanded
          ? undefined
          : !compatible
            ? "This endpoint only serves chat completions."
            : failed
              ? test.message
              : asrBaseURL.trim() !== ""
                ? `${asrModel} · ${hostLabel(asrBaseURL)}`
                : undefined
      }
      expanded={expanded}
      primaryAction={{
        get label() {
          return tr(
            ready
              ? "pages.admin_settings.aisettings.manage"
              : "pages.admin_settings.aisettings.connect",
          );
        },
        onClick: onExpand,
      }}
    >
      <p className="text-muted-foreground mb-1 text-xs">
        {tr(
          "pages.admin_settings.aisettings.a_whisper_compatible_endpoint_that_returns_timestamps",
        )}
      </p>
      <div className="flex flex-wrap gap-2 py-2">
        {TRANSCRIPTION_PRESETS.map((preset) => {
          const active = asrBaseURL === preset.baseUrl && asrModel === preset.model;
          return (
            <button
              key={preset.id}
              type="button"
              title={preset.description}
              aria-pressed={active}
              onClick={() => {
                onChange("ai.asr_base_url", preset.baseUrl);
                onChange("ai.asr_model", preset.model);
              }}
              className={cn(
                "border-border hover:bg-accent rounded-md border px-3 py-1.5 text-xs transition-colors",
                active && "border-primary bg-primary/5 text-primary",
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <SettingField
        label={tr("pages.admin_settings.aisettings.base_url")}
        value={asrBaseURL}
        onChange={(next) => onChange("ai.asr_base_url", next)}
        hint={tr("pages.admin_settings.aisettings.http_speaches_8000_or_https_api_groq_com_openai")}
        restartRequired={restartKeys.has("ai.asr_base_url")}
      />
      {usesTextEndpoint && (
        <div className="my-2 flex gap-2 rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
          <span>
            {tr(
              "pages.admin_settings.aisettings.empty_sends_audio_to_the_text_endpoint_which_may_not",
            )}
          </span>
        </div>
      )}
      <SettingField
        label={tr("pages.admin_settings.aisettings.model")}
        value={asrModel}
        onChange={(next) => onChange("ai.asr_model", next)}
        hint={tr("pages.admin_settings.aisettings.whisper_large_v3_turbo_or_whisper_1")}
        restartRequired={restartKeys.has("ai.asr_model")}
      />
      <SecretField
        label={tr("pages.admin_settings.aisettings.api_key")}
        value={apiKeyValue}
        configured={apiKeyConfigured}
        onChange={(next) => onChange("ai.asr_api_key", next)}
        onKeep={() => onReset("ai.asr_api_key")}
        // Empty is a real configuration here, not just "unset": it is how the
        // speech endpoint goes back to borrowing the text model's key.
        onClear={onClearApiKey}
        cleared={apiKeyCleared}
        hint={tr("pages.admin_settings.aisettings.empty_reuses_the_text_model_key")}
        restartRequired={restartKeys.has("ai.asr_api_key")}
      />
      <ModelPanelActions
        testLabel="Test speech-to-text"
        pendingLabel={tr("pages.admin_settings.aisettings.testing_speech_to_text")}
        onTest={onTest}
        isTesting={isTesting}
        testDisabled={!checkable}
        onCollapse={onCollapse}
        canCollapse={!dirty}
        test={test}
      />
      <p className="text-muted-foreground mt-2 text-xs">
        {tr("pages.admin_settings.aisettings.use_a_host_the_silo_container_can_reach")}
        <code className="mx-1">{tr("pages.admin_settings.aisettings.localhost")}</code>
        {tr("pages.admin_settings.aisettings.is_silo_itself")}
      </p>
      <PendingSaveNote dirty={dirty} />
    </ProviderTile>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AISettings() {
  useUILanguage();
  useUILanguage();
  const form = useSettingsForm({ keys: KEYS });
  const restartKeys = useRestartKeys();
  const textCheck = useCheckAdminSettingsConnection();
  const speechCheck = useCheckAdminSettingsConnection();
  const [textResult, setTextResult] = useState<AITestState | undefined>(undefined);
  const [speechResult, setSpeechResult] = useState<AITestState | undefined>(undefined);
  const [expandedTile, setExpandedTile] = useState<string | null>(null);

  if (form.isLoading) {
    return (
      <div
        className="max-w-5xl space-y-6"
        role="status"
        aria-label={tr("pages.admin_settings.aisettings.loading_ai_services_settings")}
      >
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
        <span className="sr-only">
          {tr("pages.admin_settings.aisettings.loading_ai_services_settings")}
        </span>
      </div>
    );
  }

  const value = (key: string, fallback = "") => form.getValue(key) || fallback;
  // Legacy `subtitle_ai.*` values stay authoritative until the modern `ai.*`
  // key holds something, exactly as the old AI Services tab read them.
  const effectiveValue = (key: string, legacyKey: string, fallback: string) =>
    value(key, value(legacyKey, fallback));

  const textBaseURL = effectiveValue(
    "ai.base_url",
    "subtitle_ai.base_url",
    "https://api.openai.com",
  );
  const chatModel = effectiveValue("ai.chat_model", "subtitle_ai.chat_model", "gpt-4o-mini");
  const asrBaseURL = value("ai.asr_base_url");
  const asrModel = value("ai.asr_model", "whisper-1");
  const textReady = textBaseURL.trim() !== "" && chatModel.trim() !== "";
  const speechUsesTextEndpoint = asrBaseURL.trim() === "";
  const speechCheckable =
    (asrBaseURL.trim() !== "" || textBaseURL.trim() !== "") && asrModel.trim() !== "";
  const speechCompatible = !isChatOnlyGateway(speechUsesTextEndpoint ? textBaseURL : asrBaseURL);
  const speechReady = speechCheckable && speechCompatible;
  const subtitleTranslateEnabled = value("subtitle_ai.enabled", "false") === "true";
  const transcribeEnabled = value("subtitle_ai.transcribe_enabled", "false") === "true";
  const descriptionEnabled = value("metadata_ai.enabled", "false") === "true";
  const textDirty = TEXT_AI_KEYS.some((key) => form.isDirty(key));
  const speechDirty = SPEECH_ONLY_KEYS.some((key) => form.isDirty(key));
  const advancedChangedCount = AI_ADVANCED_KEYS.filter((key) => form.isDirty(key)).length;

  function setValue(key: string, nextValue: string) {
    form.setValue(key, nextValue);
    if (TEXT_AI_KEYS.includes(key as (typeof TEXT_AI_KEYS)[number])) {
      setTextResult(undefined);
    }
    if (SPEECH_AI_KEYS.includes(key as (typeof SPEECH_AI_KEYS)[number])) {
      setSpeechResult(undefined);
    }
  }

  async function checkTextConnection() {
    const started = Date.now();
    try {
      const result = await textCheck.mutateAsync({
        kind: "ai_chat",
        body: form.buildConnectionCheckRequest([...TEXT_AI_KEYS]),
      });
      setTextResult({
        ok: result.success,
        message: tr.remote({ message: result.message }),
        at: Date.now(),
        durationMs: Date.now() - started,
      });
    } catch (error) {
      setTextResult({
        ok: false,
        message: tr.error(
          "errors.admin_settings.aisettings.text_model_connection_check_failed",
          error,
        ),
        at: Date.now(),
        durationMs: Date.now() - started,
      });
    }
  }

  async function checkSpeechConnection() {
    const started = Date.now();
    try {
      const result = await speechCheck.mutateAsync({
        kind: "ai_transcription",
        body: form.buildConnectionCheckRequest([...SPEECH_AI_KEYS]),
      });
      setSpeechResult({
        ok: result.success,
        message: tr.remote({ message: result.message }),
        at: Date.now(),
        durationMs: Date.now() - started,
      });
    } catch (error) {
      setSpeechResult({
        ok: false,
        message: tr.error(
          "errors.admin_settings.aisettings.speech_to_text_connection_check_failed",
          error,
        ),
        at: Date.now(),
        durationMs: Date.now() - started,
      });
    }
  }

  async function save() {
    const batchSize = parseStrictInteger(value("subtitle_ai.batch_size", "40"));
    const contextLines = parseStrictInteger(value("subtitle_ai.context_neighbors", "2"));
    const chunkSeconds = parseStrictInteger(value("subtitle_ai.asr_chunk_seconds", "600"));
    const quotaJobs = parseStrictInteger(value("subtitle_ai.transcribe_quota_jobs", "0"));
    const maxConcurrent = parseStrictInteger(
      effectiveValue("ai.max_concurrent_jobs", "subtitle_ai.max_concurrent_jobs", "2"),
    );

    if (!textReady) {
      toast.error("errors.admin_settings.aisettings.text_ai_base_url_and_chat_model_are_required");
      return;
    }
    if (maxConcurrent === null || maxConcurrent < 1) {
      toast.error(
        "errors.admin_settings.aisettings.max_concurrent_jobs_must_be_a_positive_whole_number",
      );
      return;
    }
    if (batchSize === null || batchSize < 1) {
      toast.error(
        "errors.admin_settings.aisettings.subtitle_batch_size_must_be_a_positive_whole_number",
      );
      return;
    }
    if (contextLines === null || contextLines < 0) {
      toast.error(
        "errors.admin_settings.aisettings.subtitle_context_lines_must_be_zero_or_a_positive_whole",
      );
      return;
    }
    if (chunkSeconds === null || chunkSeconds < 60 || chunkSeconds > 600) {
      toast.error(
        "errors.admin_settings.aisettings.transcription_chunk_length_must_be_between_60_and_600_seconds",
      );
      return;
    }
    if (quotaJobs === null || quotaJobs < 0) {
      toast.error(
        "errors.admin_settings.aisettings.transcription_limit_must_be_zero_or_a_positive_whole_number",
      );
      return;
    }
    await form.save();
  }

  function discard() {
    form.discard();
    setTextResult(undefined);
    setSpeechResult(undefined);
  }

  return (
    <div className="flex h-full max-w-5xl flex-col gap-7">
      <SettingsPageHeader title={tr("pages.admin_settings.aisettings.ai_services")} />

      <FieldGroup label={tr("pages.admin_settings.aisettings.models")}>
        <div className="py-3.5">
          <ProviderTileGrid>
            <TextModelTile
              baseURL={textBaseURL}
              chatModel={chatModel}
              apiKeyValue={value("ai.api_key")}
              apiKeyConfigured={
                form.sensitiveConfigured.includes("ai.api_key") ||
                form.sensitiveConfigured.includes("subtitle_ai.api_key")
              }
              apiKeyCleared={form.isClearStaged("ai.api_key")}
              ready={textReady}
              dirty={textDirty}
              restartKeys={restartKeys}
              onChange={setValue}
              onReset={form.resetValue}
              // The legacy key goes with it: an empty `ai.api_key` falls back
              // to `subtitle_ai.api_key`, so clearing only the modern one would
              // leave the old secret in force on an upgraded server.
              onClearApiKey={() => {
                setValue("ai.api_key", "");
                setValue("subtitle_ai.api_key", "");
              }}
              onTest={() => void checkTextConnection()}
              isTesting={textCheck.isPending}
              test={textResult}
              // A staged edit forces its tile open: the save bar must never
              // block on a field the admin cannot see.
              expanded={expandedTile === "text" || textDirty}
              onExpand={() => setExpandedTile("text")}
              onCollapse={() => setExpandedTile(null)}
            />
            <SpeechModelTile
              asrBaseURL={asrBaseURL}
              asrModel={asrModel}
              apiKeyValue={value("ai.asr_api_key")}
              apiKeyConfigured={form.sensitiveConfigured.includes("ai.asr_api_key")}
              apiKeyCleared={form.isClearStaged("ai.asr_api_key")}
              usesTextEndpoint={speechUsesTextEndpoint}
              compatible={speechCompatible}
              ready={speechReady}
              checkable={speechCheckable}
              dirty={speechDirty}
              restartKeys={restartKeys}
              onChange={setValue}
              onReset={form.resetValue}
              onClearApiKey={() => setValue("ai.asr_api_key", "")}
              onTest={() => void checkSpeechConnection()}
              isTesting={speechCheck.isPending}
              test={speechResult}
              expanded={expandedTile === "speech" || speechDirty}
              onExpand={() => setExpandedTile("speech")}
              onCollapse={() => setExpandedTile(null)}
            />
          </ProviderTileGrid>
        </div>
      </FieldGroup>

      <FieldGroup label={tr("pages.admin_settings.aisettings.features")}>
        <p className="text-muted-foreground py-3.5 text-xs leading-relaxed">
          {tr(
            "pages.admin_settings.aisettings.nothing_here_runs_on_a_schedule_subtitle_work_starts_when",
          )}
        </p>
        {/*
          A feature whose model is not configured only queues jobs that fail at
          the provider, so its switch is disabled until the model is ready. One
          that is already on stays switchable, so a degraded provider can be
          turned off without being fixed first.
        */}
        <SettingField
          label={tr("pages.admin_settings.aisettings.translate_subtitles")}
          type="toggle"
          value={value("subtitle_ai.enabled", "false")}
          onChange={(next) => setValue("subtitle_ai.enabled", next)}
          description={tr(
            "pages.admin_settings.aisettings.turns_an_existing_subtitle_track_into_another_language_on_request",
          )}
          disabled={!textReady && !subtitleTranslateEnabled}
          status={
            textReady ? undefined : (
              <SettingFieldStatus tone="warn">
                {tr("pages.admin_settings.aisettings.needs_the_text_model")}
              </SettingFieldStatus>
            )
          }
          restartRequired={restartKeys.has("subtitle_ai.enabled")}
        />
        <SettingField
          label={tr("pages.admin_settings.aisettings.create_subtitles_from_audio")}
          type="toggle"
          value={value("subtitle_ai.transcribe_enabled", "false")}
          onChange={(next) => setValue("subtitle_ai.transcribe_enabled", next)}
          description={tr(
            "pages.admin_settings.aisettings.writes_timed_subtitles_from_the_audio_track_on_request",
          )}
          disabled={!speechReady && !transcribeEnabled}
          status={
            speechReady ? undefined : (
              <SettingFieldStatus tone="warn">
                {tr("pages.admin_settings.aisettings.needs_speech_to_text")}
              </SettingFieldStatus>
            )
          }
          restartRequired={restartKeys.has("subtitle_ai.transcribe_enabled")}
        />
        <SettingField
          label={tr("pages.admin_settings.aisettings.translate_descriptions")}
          type="toggle"
          value={value("metadata_ai.enabled", "false")}
          onChange={(next) => setValue("metadata_ai.enabled", next)}
          description={tr(
            "pages.admin_settings.aisettings.translates_overviews_and_taglines_for_the_items_an_admin_or",
          )}
          disabled={!textReady && !descriptionEnabled}
          status={
            textReady ? undefined : (
              <SettingFieldStatus tone="warn">
                {tr("pages.admin_settings.aisettings.needs_the_text_model")}
              </SettingFieldStatus>
            )
          }
          restartRequired={restartKeys.has("metadata_ai.enabled")}
        />
        <SettingField
          label={tr("pages.admin_settings.aisettings.description_translation_for_viewers")}
          type="select"
          value={value("metadata_ai.on_view", "off")}
          onChange={(next) => setValue("metadata_ai.on_view", next)}
          disabled={!descriptionEnabled}
          options={[
            { value: "off", label: tr("pages.admin_settings.aisettings.off") },
            {
              value: "button",
              label: tr("pages.admin_settings.aisettings.translate_button_on_detail_pages"),
            },
            { value: "auto", label: tr("pages.admin_settings.aisettings.automatic_on_view") },
          ]}
          description={
            descriptionEnabled
              ? undefined
              : tr("pages.admin_settings.aisettings.inactive_until_translate_descriptions_is_on")
          }
          restartRequired={restartKeys.has("metadata_ai.on_view")}
        />
        <AdvancedSection
          id="ai.tuning"
          count={AI_ADVANCED_KEYS.length}
          forceOpen={advancedChangedCount > 0}
        >
          <TuningScope
            label={tr("pages.admin_settings.aisettings.server_wide_tuning")}
            caption="One setting for the whole server, whoever the job belongs to."
          >
            <SettingField
              label={tr("pages.admin_settings.aisettings.jobs_running_at_once")}
              type="number"
              value={effectiveValue(
                "ai.max_concurrent_jobs",
                "subtitle_ai.max_concurrent_jobs",
                "2",
              )}
              onChange={(next) => setValue("ai.max_concurrent_jobs", next)}
              description={tr(
                "pages.admin_settings.aisettings.one_budget_shared_by_every_ai_job_on_the_server",
              )}
              restartRequired={restartKeys.has("ai.max_concurrent_jobs")}
            />
            <SettingField
              label={tr("pages.admin_settings.aisettings.subtitle_lines_per_request")}
              type="number"
              value={value("subtitle_ai.batch_size", "40")}
              onChange={(next) => setValue("subtitle_ai.batch_size", next)}
              restartRequired={restartKeys.has("subtitle_ai.batch_size")}
            />
            <SettingField
              label={tr("pages.admin_settings.aisettings.surrounding_lines_sent_for_context")}
              type="number"
              value={value("subtitle_ai.context_neighbors", "2")}
              onChange={(next) => setValue("subtitle_ai.context_neighbors", next)}
              restartRequired={restartKeys.has("subtitle_ai.context_neighbors")}
            />
            <SettingField
              label={tr("pages.admin_settings.aisettings.audio_per_request")}
              type="number"
              unit="seconds"
              value={value("subtitle_ai.asr_chunk_seconds", "600")}
              onChange={(next) => setValue("subtitle_ai.asr_chunk_seconds", next)}
              description={tr("pages.admin_settings.aisettings.between_60_and_600")}
              restartRequired={restartKeys.has("subtitle_ai.asr_chunk_seconds")}
            />
          </TuningScope>
          <TuningScope
            label={tr("pages.admin_settings.aisettings.per_account_limits")}
            caption="Counted per login account, shared by every profile on it."
          >
            <LimitField
              label={tr("pages.admin_settings.aisettings.transcriptions_per_account")}
              value={value("subtitle_ai.transcribe_quota_jobs", "0")}
              onChange={(next) => setValue("subtitle_ai.transcribe_quota_jobs", next)}
              fallbackValue="10"
              hint={tr(
                "pages.admin_settings.aisettings.every_profile_on_the_account_draws_from_this_one_allowance",
              )}
              restartRequired={restartKeys.has("subtitle_ai.transcribe_quota_jobs")}
            />
            <SettingField
              label={tr("pages.admin_settings.aisettings.allowance_resets")}
              type="select"
              value={value("subtitle_ai.transcribe_quota_period", "day")}
              onChange={(next) => setValue("subtitle_ai.transcribe_quota_period", next)}
              options={QUOTA_PERIODS.map((period) => ({
                value: period,
                get label() {
                  return tr("pages.admin_settings.aisettings.per_value1_rolling_value2", {
                    value1: period,
                    value2: QUOTA_PERIOD_WINDOW_LABELS[period],
                  });
                },
              }))}
              description={tr(
                "pages.admin_settings.aisettings.rolling_window_for_the_transcription_allowance_above",
              )}
              restartRequired={restartKeys.has("subtitle_ai.transcribe_quota_period")}
            />
          </TuningScope>
        </AdvancedSection>
      </FieldGroup>

      <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
        {tr("pages.admin_settings.aisettings.recommendation_embeddings_use_their_own_models")}
        <Link
          to="/admin/recommendations"
          className="text-primary inline-flex shrink-0 items-center gap-1 font-medium hover:underline"
        >
          {tr("pages.admin_settings.aisettings.open_recommendations")}
        </Link>
      </p>

      <SaveBar
        dirtyCount={form.dirtyCount}
        onSave={() => void save()}
        onDiscard={discard}
        isSaving={form.isSaving}
      />
    </div>
  );
}
