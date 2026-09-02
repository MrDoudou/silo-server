import { useId, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Inbox,
  KeyRound,
  Loader2,
  Mail,
  Megaphone,
  MonitorSmartphone,
  RadioTower,
  Rss,
  Send,
  TriangleAlert,
  Webhook,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { toast } from "@/i18n/toast";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { AdvancedSection } from "@/components/settings/AdvancedSection";
import { SecretField } from "@/components/settings/SecretField";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { SettingsSubheading } from "@/components/settings/SettingsSubheading";
import { adminKeys } from "@/hooks/queries/keys";
import { useServerNotificationChannels } from "@/hooks/queries/admin/serverNotificationChannels";
import { useUpdateServerSettings } from "@/hooks/queries/admin/settings";
import { useRestartKeys } from "@/hooks/useRestartKeys";
import { useSettingsForm } from "@/hooks/useSettingsForm";
import { useReportUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { emailReady } from "@/lib/emailReadiness";
import { copyTextToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import { FieldGroup } from "./FieldGroup";
import { SaveBar } from "./SaveBar";
import { SettingField } from "./SettingField";
import ServerNotificationChannels from "./ServerNotificationChannels";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

/** Batching and flood control; all advanced. */
const FANOUT_KEYS = [
  "notifications.fanout.settle_seconds",
  "notifications.fanout.max_series_burst",
  "notifications.fanout.max_event_age_hours",
];

/** Inbox and event cleanup; all advanced. */
const RETENTION_KEYS = [
  "notifications.retention.read_days",
  "notifications.retention.unread_days",
  "notifications.retention.event_days",
];

/** Personal webhook limits and the SSRF escape hatch; all advanced. */
const WEBHOOK_ADVANCED_KEYS = [
  "notifications.webhooks.max_per_profile",
  "notifications.webhooks.deliveries_per_minute_per_profile",
  "notifications.webhooks.allow_private_destinations",
];

/**
 * Outbound mail. The SMTP server used to be its own tab; it now lives in the
 * Email channel card because "email notifications don't arrive" is always an
 * SMTP question.
 */
const EMAIL_KEYS = [
  "email.enabled",
  "email.smtp_host",
  "email.smtp_port",
  "email.smtp_security",
  "email.smtp_username",
  "email.smtp_password",
  "email.from_address",
  "email.from_name",
];

/**
 * The Discord application. Saved by its own card inside the Discord channel
 * (a bot token has to be testable before it is committed), but listed here so
 * one form owns every value this page reads.
 */
const DISCORD_APP_KEYS = ["discord.client_id", "discord.client_secret", "discord.bot_token"];

const KEYS = [
  "notifications.release_events_enabled",
  "notifications.fanout_enabled",
  "notifications.ui_enabled",
  "notifications.webhooks_enabled",
  "notifications.web_push_enabled",
  "notifications.apple_push_delivery_enabled",
  "notifications.android_push_delivery_enabled",
  // Relay lifecycle fields are read for status but are never edited through
  // the shared settings form; credential endpoints replace them atomically.
  "notifications.push_relay_url",
  "notifications.push_relay_deployment_id",
  "notifications.push_relay_expires_at",
  "notifications.push_relay_key_prefix",
  "notifications.push_relay_reregistration_required",
  ...FANOUT_KEYS,
  ...WEBHOOK_ADVANCED_KEYS,
  "notifications.email_enabled",
  "notifications.email.allow_per_episode",
  "notifications.email.digest_hour",
  "notifications.email.external_url",
  "notifications.discord_enabled",
  "notifications.discord.allow_per_episode",
  "notifications.discord.digest_hour",
  "notifications.discord.poster_mode",
  "notifications.server_channels_enabled",
  "notifications.server_channels.batch_seconds",
  "notifications.server_channels.mention_requesters",
  ...RETENTION_KEYS,
  ...EMAIL_KEYS,
  ...DISCORD_APP_KEYS,
];

interface EmailTestResult {
  ok: boolean;
  duration_ms: number;
  message?: string;
}

interface AppleRelayRegisterResult {
  relay_url: string;
  deployment_id: string;
  key_prefix: string;
  api_key_configured: boolean;
  relay_request_id?: string;
  apns_topics?: string[];
  expires_at: string;
}

const DEFAULT_PUSH_RELAY_URL = "https://push.siloserver.org";

function digestHourLabel(raw: string): string {
  const hour = Number.parseInt(raw, 10);
  const valid = Number.isInteger(hour) && hour >= 0 && hour <= 23;
  return `${String(valid ? hour : 8).padStart(2, "0")}:00`;
}

/** Small status pill shown next to a channel title while the card is collapsed. */
function Chip({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "positive" | "warning";
  children: React.ReactNode;
}) {
  useUILanguage();
  useUILanguage();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        tone === "neutral" && "border-border/70 text-muted-foreground",
        tone === "positive" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
        tone === "warning" && "border-amber-500/30 bg-amber-500/10 text-amber-500",
      )}
    >
      {children}
    </span>
  );
}

function ZoneHeading({ title }: { title: string }) {
  useUILanguage();
  useUILanguage();
  return (
    <h3 className="text-muted-foreground px-1 text-xs font-semibold tracking-[0.22em] uppercase">
      {title}
    </h3>
  );
}

interface PipelineStageProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Visually de-emphasize the stage when an upstream stage is switched off. */
  dimmed?: boolean;
  control: React.ReactNode;
}

function PipelineStage({ icon: Icon, title, description, dimmed, control }: PipelineStageProps) {
  useUILanguage();
  useUILanguage();
  return (
    <div className="flex items-start justify-between gap-3">
      <div className={cn("min-w-0 transition-opacity", dimmed && "opacity-50")}>
        <div className="flex items-center gap-2">
          <Icon className="text-muted-foreground h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">{title}</span>
        </div>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{description}</p>
      </div>
      {control}
    </div>
  );
}

function PipelineArrow() {
  return (
    <div className="hidden items-center md:flex">
      <ChevronRight className="text-muted-foreground/50 h-4 w-4" />
    </div>
  );
}

interface ChannelCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  chips?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * One delivery channel: an always-visible header row (icon, title, status
 * chips, enable switch) with settings tucked behind an expandable body.
 * Settings stay editable while the channel is off so admins can configure
 * before enabling.
 */
function ChannelCard({
  icon: Icon,
  title,
  description,
  enabled,
  onEnabledChange,
  chips,
  children,
}: ChannelCardProps) {
  useUILanguage();
  useUILanguage();
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const expandable = children != null;

  const header = (
    <>
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors",
          enabled ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">{title}</span>
          {chips}
        </span>
        <span className="text-muted-foreground mt-0.5 block text-xs leading-relaxed">
          {description}
        </span>
      </span>
    </>
  );

  return (
    <div className="surface-panel overflow-hidden rounded-2xl border-0">
      <div className="flex items-center gap-3 p-4 sm:px-5">
        {expandable ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((current) => !current)}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
          >
            {header}
            <ChevronDown
              className={cn(
                "text-muted-foreground h-4 w-4 shrink-0 transition-transform duration-200",
                open && "rotate-180",
              )}
            />
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">{header}</div>
        )}
        <Switch
          checked={enabled}
          onCheckedChange={(value) => {
            onEnabledChange(value);
            // Enabling a channel usually means configuring it next.
            if (value && expandable) setOpen(true);
          }}
          aria-label={tr("pages.admin_settings.notifications_admin_settings.enable_title", {
            title: title,
          })}
        />
      </div>
      {expandable && open && (
        <div
          id={bodyId}
          className="border-border/60 animate-in fade-in-0 slide-in-from-top-1 border-t px-4 pt-1 pb-4 duration-200 sm:px-5"
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Sends a real message through the saved SMTP settings. */
function TestEmailRow() {
  useUILanguage();
  useUILanguage();
  const [recipient, setRecipient] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<EmailTestResult | null>(null);

  const sendTest = async () => {
    setPending(true);
    setResult(null);
    try {
      const response = await api<EmailTestResult>("/admin/email/test", {
        method: "POST",
        body: JSON.stringify({ to: recipient.trim() }),
      });
      setResult(response);
      if (response.ok) {
        toast.success("feedback.admin_settings.notifications_admin_settings.test_email_sent");
      }
    } catch (error) {
      toast.error(
        "errors.admin_settings.notifications_admin_settings.test_request_failed_0d9da0c1",
        { error: error },
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-2 py-3">
      <div className="flex max-w-md gap-2">
        <Input
          type="email"
          aria-label={tr("pages.admin_settings.notifications_admin_settings.test_email_recipient")}
          placeholder={tr("pages.admin_settings.notifications_admin_settings.you_example_com")}
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
        />
        <Button
          variant="outline"
          disabled={pending || !recipient.trim()}
          onClick={() => void sendTest()}
        >
          {pending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-1.5 h-4 w-4" />
          )}
          {tr("pages.admin_settings.notifications_admin_settings.send_test")}
        </Button>
      </div>
      {result && (
        <p className={"text-xs " + (result.ok ? "text-emerald-500" : "text-amber-500")}>
          {result.ok
            ? tr(
                "pages.admin_settings.notifications_admin_settings.delivered_to_the_mail_server_in_duration_ms_ms",
                {
                  duration_ms: result.duration_ms,
                },
              )
            : result.message
              ? tr.remote({ message: result.message })
              : tr("pages.admin_settings.notifications_admin_settings.test_failed")}
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        {tr(
          "pages.admin_settings.notifications_admin_settings.save_your_changes_first_the_test_uses_the_saved_settings",
        )}
      </p>
    </div>
  );
}

function RegisterRelayRow({
  relayURL,
  deploymentID,
  keyPrefix,
  expiresAt,
  reregistrationRequired,
  urlEdited,
  onRegistered,
}: {
  relayURL: string;
  deploymentID: string;
  keyPrefix: string;
  expiresAt: string;
  reregistrationRequired: boolean;
  urlEdited: boolean;
  onRegistered: (submittedRelayURL: string) => void;
}) {
  useUILanguage();
  useUILanguage();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [result, setResult] = useState<AppleRelayRegisterResult | null>(null);

  const configured = deploymentID.trim() !== "";
  const actionLabel = reregistrationRequired
    ? "Re-register relay"
    : configured
      ? "Rotate credential"
      : "Register relay";
  const expiration = expiresAt ? new Date(expiresAt) : null;
  const expirationValid = expiration != null && !Number.isNaN(expiration.getTime());
  const renewalStatus = expirationValid
    ? expiration.getTime() <= Date.now()
      ? "Expired; Silo renews it before the next delivery."
      : `Expires ${expiration.toLocaleString()}; Silo renews automatically.`
    : configured
      ? "Expiration unknown; Silo refreshes the credential on its next renewal."
      : "No relay credential is registered.";

  const registerRelay = async () => {
    if (pending) return;
    setPending(true);
    setResult(null);
    try {
      const response = await api<AppleRelayRegisterResult>(
        "/admin/notifications/push/relay/register",
        {
          method: "POST",
          body: JSON.stringify({
            relay_url: relayURL,
          }),
        },
      );
      setResult(response);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminKeys.serverSettings() }),
        queryClient.invalidateQueries({
          queryKey: [...adminKeys.serverSettings(), "sensitive-status"] as const,
        }),
      ]);
      onRegistered(relayURL);
      toast.success("feedback.admin_settings.notifications_admin_settings.push_relay_registered");
    } catch (error) {
      toast.error("errors.admin_settings.notifications_admin_settings.relay_registration_failed", {
        error: error,
      });
    } finally {
      setPending(false);
    }
  };

  const clearRelay = async () => {
    if (pending) return;
    setPending(true);
    setResult(null);
    try {
      await api<void>("/admin/notifications/push/relay", { method: "DELETE" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminKeys.serverSettings() }),
        queryClient.invalidateQueries({
          queryKey: [...adminKeys.serverSettings(), "sensitive-status"] as const,
        }),
      ]);
      setConfirmClear(false);
      toast.success(
        "feedback.admin_settings.notifications_admin_settings.push_relay_credential_cleared",
      );
    } catch (error) {
      toast.error(
        "errors.admin_settings.notifications_admin_settings.failed_to_clear_relay_credential",
        { error: error },
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-3 py-3">
      <SettingField
        label={tr("pages.admin_settings.notifications_admin_settings.deployment_id")}
        description={tr(
          "pages.admin_settings.notifications_admin_settings.created_for_you_when_you_register",
        )}
        type="text"
        value={deploymentID}
        onChange={() => {}}
        disabled
      />
      <div className="flex flex-wrap items-center gap-2 py-2">
        <Button variant="outline" size="sm" disabled={pending} onClick={() => void registerRelay()}>
          {pending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <KeyRound className="mr-1.5 h-3.5 w-3.5" />
          )}
          {actionLabel}
        </Button>
        {configured && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => setConfirmClear(true)}
          >
            {tr("pages.admin_settings.notifications_admin_settings.clear_credential")}
          </Button>
        )}
      </div>
      {reregistrationRequired && (
        <div className="text-xs text-amber-500">
          {tr(
            "pages.admin_settings.notifications_admin_settings.the_relay_credential_was_rejected_or_revoked_re_register_to",
          )}
        </div>
      )}
      <div className="text-muted-foreground space-y-1 text-xs">
        {keyPrefix && (
          <div>
            {tr("pages.admin_settings.notifications_admin_settings.credential")} {keyPrefix}
          </div>
        )}
        <div>{renewalStatus}</div>
      </div>
      {urlEdited && (
        <div className="text-muted-foreground text-xs">
          {tr(
            "pages.admin_settings.notifications_admin_settings.register_to_apply_the_new_relay_url",
          )}
        </div>
      )}
      {result && (
        <div className="text-xs text-emerald-500">
          {tr("pages.admin_settings.notifications_admin_settings.credential_ready_for")}{" "}
          {result.deployment_id}
          {result.key_prefix
            ? tr("pages.admin_settings.notifications_admin_settings.key_key_prefix", {
                key_prefix: result.key_prefix,
              })
            : ""}
          {result.relay_request_id
            ? tr("pages.admin_settings.notifications_admin_settings.relay_relay_request_id", {
                relay_request_id: result.relay_request_id,
              })
            : ""}
        </div>
      )}
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tr(
                "pages.admin_settings.notifications_admin_settings.clear_the_push_relay_credential",
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tr(
                "pages.admin_settings.notifications_admin_settings.mobile_push_delivery_stops_until_a_relay_is_registered_again",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{tr("common.actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() => void clearRelay()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pending
                ? tr("pages.admin_settings.notifications_admin_settings.clearing")
                : tr("pages.admin_settings.notifications_admin_settings.clear_credential")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Discord application credentials
// ---------------------------------------------------------------------------

interface DiscordTestResult {
  ok: boolean;
  duration_ms: number;
  message?: string;
}

/**
 * Invite link for adding the bot to a Discord server. Membership alone is
 * enough to DM, so no permissions are requested.
 */
function discordInviteUrl(clientId: string): string {
  return `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&scope=bot&permissions=0`;
}

function DiscordSetupGuide() {
  useUILanguage();
  useUILanguage();
  const [open, setOpen] = useState(false);
  const guideId = useId();

  return (
    <div className="py-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={guideId}
        onClick={() => setOpen((current) => !current)}
        className="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium transition-colors"
      >
        <BookOpen className="h-3.5 w-3.5" />
        {open
          ? tr("pages.admin_settings.notifications_admin_settings.hide_setup_guide")
          : tr("pages.admin_settings.notifications_admin_settings.show_setup_guide")}
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      {open && (
        <div
          id={guideId}
          className="text-muted-foreground animate-in fade-in-0 mt-3 space-y-1.5 text-xs leading-relaxed duration-200"
        >
          <p>
            {tr(
              "pages.admin_settings.notifications_admin_settings.set_up_at_discord_com_developers_applications",
            )}
          </p>
          <ol className="list-decimal space-y-1.5 pl-4">
            <li>
              {tr(
                "pages.admin_settings.notifications_admin_settings.create_an_application_or_open_an_existing_one",
              )}
            </li>
            <li>
              {tr("pages.admin_settings.notifications_admin_settings.oauth2_page_copy_the")}{" "}
              <strong>{tr("pages.admin_settings.notifications_admin_settings.client_id")}</strong>
              {tr("pages.admin_settings.notifications_admin_settings.reset_and_copy_the")}{" "}
              <strong>
                {tr("pages.admin_settings.notifications_admin_settings.client_secret")}
              </strong>
              {tr("pages.admin_settings.notifications_admin_settings.and_under_redirects_add")}
              <code className="bg-muted mx-1 rounded px-1">
                {tr("pages.admin_settings.notifications_admin_settings.public_url")}
                {tr(
                  "pages.admin_settings.notifications_admin_settings.api_v1_notifications_discord_link_callback",
                )}
              </code>
              {tr(
                "pages.admin_settings.notifications_admin_settings.using_this_server_s_public_url_silo_public_url_it",
              )}
            </li>
            <li>
              {tr("pages.admin_settings.notifications_admin_settings.bot_page_reset_and_copy_the")}{" "}
              <strong>{tr("pages.admin_settings.notifications_admin_settings.token")}</strong>
              {tr(
                "pages.admin_settings.notifications_admin_settings.leave_all_privileged_gateway_intents_presence_server_members_message_content",
              )}{" "}
              <strong>{tr("pages.admin_settings.notifications_admin_settings.off")}</strong>{" "}
              {tr(
                "pages.admin_settings.notifications_admin_settings.silo_never_connects_to_the_gateway_it_only_sends_dms",
              )}
            </li>
            <li>
              {tr("pages.admin_settings.notifications_admin_settings.keep")}{" "}
              <strong>
                {tr("pages.admin_settings.notifications_admin_settings.requires_oauth2_code_grant")}
              </strong>{" "}
              {tr(
                "pages.admin_settings.notifications_admin_settings.off_or_the_invite_link_below_won_t_work_enable",
              )}{" "}
              <strong>{tr("pages.admin_settings.notifications_admin_settings.public_bot")}</strong>{" "}
              {tr(
                "pages.admin_settings.notifications_admin_settings.only_if_someone_other_than_the_application_owner_will_be",
              )}
            </li>
            <li>
              {tr(
                "pages.admin_settings.notifications_admin_settings.paste_the_three_credentials_below_save_then_use_the_invite",
              )}{" "}
              <strong>
                {tr("pages.admin_settings.notifications_admin_settings.no_role_permissions")}
              </strong>{" "}
              {tr(
                "pages.admin_settings.notifications_admin_settings.membership_alone_lets_it_dm_members_and_users_must_share",
              )}
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}

function InviteBotRow({ clientId }: { clientId: string }) {
  useUILanguage();
  useUILanguage();
  const [copied, setCopied] = useState(false);
  const trimmed = clientId.trim();

  // The copy can genuinely fail — a denied permission, or a browser that only
  // exposes the async clipboard on a secure origin, which a LAN server reached
  // over plain HTTP is not. Claiming success there sends the admin off to paste
  // an invite link they do not have.
  async function copyInviteLink() {
    try {
      await copyTextToClipboard(discordInviteUrl(trimmed));
      setCopied(true);
      toast.success("feedback.admin_settings.notifications_admin_settings.invite_link_copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(
        "errors.admin_settings.notifications_admin_settings.couldn_t_copy_the_invite_link_select_it_and_copy",
      );
    }
  }

  return (
    <div className="space-y-2 py-2">
      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!trimmed}
          onClick={() => window.open(discordInviteUrl(trimmed), "_blank", "noopener,noreferrer")}
        >
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
          {tr("pages.admin_settings.notifications_admin_settings.invite_bot_to_server")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!trimmed}
          onClick={() => void copyInviteLink()}
        >
          {copied ? (
            <Check className="mr-1.5 h-3.5 w-3.5" />
          ) : (
            <Copy className="mr-1.5 h-3.5 w-3.5" />
          )}
          {tr("pages.admin_settings.notifications_admin_settings.copy_link")}
        </Button>
      </div>
      <div className="text-muted-foreground text-xs">
        {trimmed
          ? tr(
              "pages.admin_settings.notifications_admin_settings.users_must_be_in_that_server_to_receive_dms",
            )
          : tr(
              "pages.admin_settings.notifications_admin_settings.enter_the_client_id_to_generate_the_invite_link",
            )}
      </div>
    </div>
  );
}

/**
 * The Discord application itself — client id, secret, bot token. It lives in
 * the Discord channel card because "why didn't my DM arrive" is always a
 * question about these three values, and it saves on its own so the bot token
 * can be tested before the page's other edits are committed.
 */
function DiscordAppCredentials({
  savedClientId,
  sensitiveConfigured,
  restartKeys,
}: {
  savedClientId: string;
  sensitiveConfigured: string[];
  restartKeys: ReturnType<typeof useRestartKeys>;
}) {
  useUILanguage();
  useUILanguage();
  const updateSettings = useUpdateServerSettings();
  // `null` follows the saved value; a draft is only pinned while the admin is
  // editing, so a refetch cannot overwrite typing in progress.
  const [clientIdDraft, setClientIdDraft] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState("");
  const [botToken, setBotToken] = useState("");
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const clientId = clientIdDraft ?? savedClientId;
  const configuredKeys = new Set(sensitiveConfigured);
  const secretConfigured = configuredKeys.has("discord.client_secret");
  const tokenConfigured = configuredKeys.has("discord.bot_token");
  const ready = savedClientId.trim() !== "" && secretConfigured && tokenConfigured;
  const unsaved =
    clientId !== savedClientId || clientSecret.trim() !== "" || botToken.trim() !== "";
  // The card's drafts live outside useSettingsForm, so the navigation guard
  // and the reload prompt only see them through this report.
  useReportUnsavedChanges(unsaved);
  const anyStored = savedClientId.trim() !== "" || secretConfigured || tokenConfigured;

  async function save() {
    const updates: Record<string, string> = { "discord.client_id": clientId };
    if (clientSecret.trim() !== "") updates["discord.client_secret"] = clientSecret;
    if (botToken.trim() !== "") updates["discord.bot_token"] = botToken;
    try {
      await updateSettings.mutateAsync(updates);
      setClientIdDraft(null);
      setClientSecret("");
      setBotToken("");
      setTestResult(null);
      toast.success(
        "feedback.admin_settings.notifications_admin_settings.discord_credentials_saved",
      );
    } catch {
      // The mutation surfaces the API error.
    }
  }

  async function clearAll() {
    try {
      await updateSettings.mutateAsync({
        "discord.client_id": "",
        "discord.client_secret": "",
        "discord.bot_token": "",
      });
      setClientIdDraft(null);
      setClientSecret("");
      setBotToken("");
      setTestResult(null);
      toast.success(
        "feedback.admin_settings.notifications_admin_settings.discord_credentials_cleared",
      );
    } catch {
      // The mutation surfaces the API error.
    }
  }

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await api<DiscordTestResult>("/admin/notifications/discord/test", {
        method: "POST",
      });
      setTestResult({
        success: response.ok,
        message: tr(
          "pages.admin_settings.notifications_admin_settings.status_duration_ms_ms_detail",
          {
            status: tr(
              response.ok
                ? "pages.admin_settings.notifications_admin_settings.success"
                : "pages.admin_settings.notifications_admin_settings.failed",
            ),
            durationMs: response.duration_ms,
            detail: response.message ? `: ${tr.remote({ message: response.message })}` : "",
          },
        ),
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: tr.error(
          "errors.admin_settings.notifications_admin_settings.test_request_failed",
          error,
        ),
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <>
      <SettingsSubheading>
        {tr("pages.admin_settings.notifications_admin_settings.application")}
      </SettingsSubheading>
      <DiscordSetupGuide />
      <div className="settings-field-list">
        <SettingField
          label={tr("pages.admin_settings.notifications_admin_settings.client_id")}
          value={clientId}
          onChange={setClientIdDraft}
          description={tr(
            "pages.admin_settings.notifications_admin_settings.from_the_application_s_oauth2_page",
          )}
          restartRequired={restartKeys.has("discord.client_id")}
        />
      </div>
      <InviteBotRow clientId={clientId} />
      <div className="settings-field-list">
        <SecretField
          label={tr("pages.admin_settings.notifications_admin_settings.client_secret_4b468ec6")}
          value={clientSecret}
          configured={secretConfigured}
          onChange={setClientSecret}
          hint={tr(
            "pages.admin_settings.notifications_admin_settings.from_the_application_s_oauth2_page",
          )}
          restartRequired={restartKeys.has("discord.client_secret")}
        />
        <SecretField
          label={tr("pages.admin_settings.notifications_admin_settings.bot_token")}
          value={botToken}
          configured={tokenConfigured}
          onChange={setBotToken}
          hint={tr(
            "pages.admin_settings.notifications_admin_settings.from_the_application_s_bot_page",
          )}
          restartRequired={restartKeys.has("discord.bot_token")}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 py-3">
        <Button
          type="button"
          size="sm"
          onClick={() => void save()}
          disabled={updateSettings.isPending}
        >
          {updateSettings.isPending
            ? tr("pages.admin_settings.notifications_admin_settings.saving")
            : tr("common.actions.save")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void runTest()}
          disabled={testing || unsaved || !ready}
        >
          {testing
            ? tr("pages.admin_settings.notifications_admin_settings.testing")
            : tr("pages.admin_settings.notifications_admin_settings.test_bot_token")}
        </Button>
        {anyStored && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmClear(true)}>
            {tr("pages.admin_settings.notifications_admin_settings.clear_credentials")}
          </Button>
        )}
      </div>
      {testResult && (
        <p
          role="status"
          aria-live="polite"
          className={cn(
            "pb-2 text-xs",
            testResult.success
              ? "text-green-600 dark:text-green-400"
              : "text-red-600 dark:text-red-400",
          )}
        >
          {testResult.message}
        </p>
      )}
      {unsaved && (
        <p className="text-muted-foreground pb-2 text-xs">
          {tr(
            "pages.admin_settings.notifications_admin_settings.save_first_the_test_uses_the_stored_credentials",
          )}
        </p>
      )}
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tr(
                "pages.admin_settings.notifications_admin_settings.clear_discord_app_credentials",
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tr(
                "pages.admin_settings.notifications_admin_settings.account_linking_and_discord_direct_messages_stop_working_immediately",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("common.actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                void clearAll();
                setConfirmClear(false);
              }}
            >
              {tr("pages.admin_settings.notifications_admin_settings.clear")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function MobilePushPrivacyDisclosure() {
  useUILanguage();
  useUILanguage();
  return (
    <div className="space-y-2 py-3">
      <div className="text-sm font-medium">
        {tr("pages.admin_settings.notifications_admin_settings.privacy_disclosure")}
      </div>
      <div className="text-muted-foreground space-y-2 text-xs leading-relaxed">
        <p>
          {tr(
            "pages.admin_settings.notifications_admin_settings.if_you_enable_push_notifications_your_silo_server_sends_a",
          )}
        </p>
        <p>
          {tr(
            "pages.admin_settings.notifications_admin_settings.the_relay_does_not_receive_notification_titles_message_bodies_media",
          )}
        </p>
        <p>
          {tr(
            "pages.admin_settings.notifications_admin_settings.push_notifications_are_generic_the_app_fetches_private_content_directly",
          )}
        </p>
      </div>
    </div>
  );
}

export default function NotificationsAdminSettings() {
  useUILanguage();
  useUILanguage();
  const form = useSettingsForm({ keys: useMemo(() => KEYS, []) });
  const restartKeys = useRestartKeys();
  const { data: serverChannels } = useServerNotificationChannels();
  // Local draft for the relay URL; null means "show the saved value".
  const [pushRelayURLDraft, setPushRelayURLDraft] = useState<string | null>(null);
  // The relay URL draft lives outside useSettingsForm (only registration
  // persists it), so the navigation guard and reload prompt only see it
  // through this report. Above the loading return: hooks must be unconditional.
  useReportUnsavedChanges(
    pushRelayURLDraft !== null &&
      pushRelayURLDraft !==
        (form.getValue("notifications.push_relay_url") || DEFAULT_PUSH_RELAY_URL),
  );

  if (form.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-36 w-full rounded-2xl" />
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[72px] w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  // Kill switches default to enabled when unset; the backend treats any
  // unrecognized value as the default, so an empty stored value means "on".
  const toggleValue = (key: string) => form.getValue(key) || "true";
  const isOn = (key: string) => toggleValue(key) === "true";
  const setToggle = (key: string) => (value: boolean) =>
    form.setValue(key, value ? "true" : "false");
  // Numeric settings fall back to their server-side defaults when unset;
  // surface the effective default instead of an empty input.
  const numberValue = (key: string, fallback: string) => form.getValue(key) || fallback;
  const needsRestart = (key: string) => restartKeys.has(key);
  const allRestart = (keys: string[]) => keys.every((key) => restartKeys.has(key));
  const anyDirty = (keys: string[]) => keys.some(form.isDirty);

  const releaseEventsOn = isOn("notifications.release_events_enabled");
  const fanoutOn = isOn("notifications.fanout_enabled");
  const uiOn = isOn("notifications.ui_enabled");
  const webPushOn = isOn("notifications.web_push_enabled");
  const emailOn = isOn("notifications.email_enabled");
  const serverChannelsOn = isOn("notifications.server_channels_enabled");
  // Mobile push, Discord, and personal webhooks are opt-in (default off).
  const applePushOn = form.getValue("notifications.apple_push_delivery_enabled") === "true";
  const androidPushOn = form.getValue("notifications.android_push_delivery_enabled") === "true";
  const mobilePushOn = applePushOn || androidPushOn;
  const discordOn = form.getValue("notifications.discord_enabled") === "true";
  const webhooksOn = form.getValue("notifications.webhooks_enabled") === "true";

  // The relay URL is not part of the settings form: the server only persists
  // it through the registration endpoint, alongside the credentials it mints.
  const savedPushRelayURL = form.getValue("notifications.push_relay_url") || DEFAULT_PUSH_RELAY_URL;
  const pushRelayURL = pushRelayURLDraft ?? savedPushRelayURL;
  const pushRelayURLEdited = pushRelayURL !== savedPushRelayURL;
  const pushRelayDeploymentID = form.getValue("notifications.push_relay_deployment_id");
  const pushRelayKeyPrefix = form.getValue("notifications.push_relay_key_prefix");
  const pushRelayExpiresAt = form.getValue("notifications.push_relay_expires_at");
  const pushRelayReregistrationRequired =
    form.getValue("notifications.push_relay_reregistration_required") === "true";
  const pushRelayAPIKeyReady = form.sensitiveConfigured.includes(
    "notifications.push_relay_api_key",
  );
  const allowPrivate =
    form.getValue("notifications.webhooks.allow_private_destinations") === "true";

  // Mail readiness mirrors the server's rule (shared with the overview tile):
  // the outbound switch, a server, AND a sender address — legacy rows and
  // single-key writes can store enabled-without-sender, which cannot send.
  const mailReady = emailReady(
    form.getValue("email.enabled") === "true",
    form.getValue("email.smtp_host"),
    form.getValue("email.from_address"),
  );
  // The Discord application is configured in the Discord channel card below,
  // next to the delivery settings it gates. "Configured" mirrors the server's
  // own rule (DiscordConfigured): client id, client secret, AND bot token —
  // a partial save (say, only the bot token) must not read as connected.
  const discordAppConfigured =
    form.getValue("discord.client_id").trim() !== "" &&
    form.sensitiveConfigured.includes("discord.client_secret") &&
    form.sensitiveConfigured.includes("discord.bot_token");

  const channelStates = [
    uiOn,
    webPushOn,
    mobilePushOn,
    emailOn,
    discordOn,
    webhooksOn,
    serverChannelsOn,
  ];
  const enabledChannelCount = channelStates.filter(Boolean).length;

  const failingServerChannels = (serverChannels ?? []).filter(
    (channel) =>
      channel.last_failure_at != null &&
      (channel.last_success_at == null || channel.last_failure_at > channel.last_success_at),
  ).length;

  const pausedMessage = !releaseEventsOn
    ? "New content is not being recorded, so nothing can be sent."
    : !fanoutOn
      ? "Sending is paused; new content waits in the queue."
      : null;

  return (
    <div className="flex h-full flex-col">
      <SettingsPageHeader
        className="mb-6"
        title={tr("pages.admin_settings.notifications_admin_settings.notifications")}
      />

      <div className="flex-1 space-y-5">
        {/* ── Pipeline: the master switches, framed as the flow they gate ── */}
        <div className="surface-panel rounded-2xl border-0 p-4 sm:p-5">
          <div className="text-muted-foreground mb-4 text-xs font-semibold tracking-[0.22em] uppercase">
            {tr("pages.admin_settings.notifications_admin_settings.pipeline")}
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:gap-3">
            <PipelineStage
              icon={Rss}
              title={tr("pages.admin_settings.notifications_admin_settings.notice_new_content")}
              description={tr(
                "pages.admin_settings.notifications_admin_settings.record_new_items_during_library_scans",
              )}
              control={
                <Switch
                  checked={releaseEventsOn}
                  onCheckedChange={setToggle("notifications.release_events_enabled")}
                  aria-label={tr(
                    "pages.admin_settings.notifications_admin_settings.enable_release_events",
                  )}
                />
              }
            />
            <PipelineArrow />
            <PipelineStage
              icon={Workflow}
              title={tr("pages.admin_settings.notifications_admin_settings.work_out_who_wants_it")}
              description={tr(
                "pages.admin_settings.notifications_admin_settings.match_each_item_against_everyone_s_preferences",
              )}
              dimmed={!releaseEventsOn}
              control={
                <Switch
                  checked={fanoutOn}
                  onCheckedChange={setToggle("notifications.fanout_enabled")}
                  aria-label={tr("pages.admin_settings.notifications_admin_settings.enable_fanout")}
                />
              }
            />
            <PipelineArrow />
            <PipelineStage
              icon={Bell}
              title={tr("pages.admin_settings.notifications_admin_settings.send_it")}
              description={tr(
                "pages.admin_settings.notifications_admin_settings.hand_queued_messages_to_the_channels_below",
              )}
              dimmed={!releaseEventsOn || !fanoutOn}
              control={
                <Chip>
                  {enabledChannelCount}/{channelStates.length}{" "}
                  {tr("pages.admin_settings.notifications_admin_settings.channels_on")}
                </Chip>
              }
            />
          </div>
          {pausedMessage && (
            <div className="mt-4 flex items-start gap-2 text-xs text-amber-500">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{pausedMessage}</p>
            </div>
          )}
        </div>

        {/* ── Delivery channels ── */}
        <section className="space-y-3">
          <ZoneHeading
            title={tr("pages.admin_settings.notifications_admin_settings.delivery_channels")}
          />

          <ChannelCard
            icon={Inbox}
            title={tr("pages.admin_settings.notifications_admin_settings.in_app")}
            description={tr(
              "pages.admin_settings.notifications_admin_settings.notification_inbox_in_the_web_mobile_and_tv_apps",
            )}
            enabled={uiOn}
            onEnabledChange={setToggle("notifications.ui_enabled")}
          />

          <ChannelCard
            icon={MonitorSmartphone}
            title={tr("pages.admin_settings.notifications_admin_settings.web_push")}
            description={tr(
              "pages.admin_settings.notifications_admin_settings.browser_push_to_subscribed_devices",
            )}
            enabled={webPushOn}
            onEnabledChange={setToggle("notifications.web_push_enabled")}
          />

          <ChannelCard
            icon={RadioTower}
            title={tr("pages.admin_settings.notifications_admin_settings.silo_push_relay")}
            description={tr(
              "pages.admin_settings.notifications_admin_settings.mobile_push_through_silo_s_relay_delivered_by_apns_or",
            )}
            enabled={mobilePushOn}
            onEnabledChange={(enabled) => {
              form.setValue("notifications.apple_push_delivery_enabled", String(enabled));
              form.setValue("notifications.android_push_delivery_enabled", String(enabled));
            }}
            chips={
              pushRelayReregistrationRequired ? (
                <Chip tone="warning">
                  {tr("pages.admin_settings.notifications_admin_settings.re_registration_required")}
                </Chip>
              ) : pushRelayAPIKeyReady ? (
                <Chip tone="positive">
                  {tr("pages.admin_settings.notifications_admin_settings.relay_configured")}
                </Chip>
              ) : (
                <Chip tone={mobilePushOn ? "warning" : "neutral"}>
                  {tr(
                    "pages.admin_settings.notifications_admin_settings.relay_registration_required",
                  )}
                </Chip>
              )
            }
          >
            <div className="settings-field-list">
              <MobilePushPrivacyDisclosure />
              <SettingField
                label={tr("pages.admin_settings.notifications_admin_settings.apple_push_apns")}
                type="toggle"
                value={String(applePushOn)}
                onChange={(value) =>
                  form.setValue("notifications.apple_push_delivery_enabled", value)
                }
                restartRequired={needsRestart("notifications.apple_push_delivery_enabled")}
              />
              <SettingField
                label={tr("pages.admin_settings.notifications_admin_settings.android_push_fcm")}
                type="toggle"
                value={String(androidPushOn)}
                onChange={(value) =>
                  form.setValue("notifications.android_push_delivery_enabled", value)
                }
                restartRequired={needsRestart("notifications.android_push_delivery_enabled")}
              />
              <SettingField
                label={tr("pages.admin_settings.notifications_admin_settings.relay_url")}
                description={tr(
                  "pages.admin_settings.notifications_admin_settings.saved_when_you_register_below",
                )}
                type="text"
                value={pushRelayURL}
                onChange={(v) => setPushRelayURLDraft(v)}
                restartRequired={needsRestart("notifications.push_relay_url")}
              />
              <RegisterRelayRow
                relayURL={pushRelayURL}
                deploymentID={pushRelayDeploymentID}
                keyPrefix={pushRelayKeyPrefix}
                expiresAt={pushRelayExpiresAt}
                reregistrationRequired={pushRelayReregistrationRequired}
                urlEdited={pushRelayURLEdited}
                onRegistered={(submittedRelayURL) =>
                  setPushRelayURLDraft((currentDraft) => {
                    const currentURL = currentDraft ?? savedPushRelayURL;
                    return currentURL === submittedRelayURL ? null : currentDraft;
                  })
                }
              />
            </div>
          </ChannelCard>

          <ChannelCard
            icon={Mail}
            title={tr("pages.admin_settings.notifications_admin_settings.email")}
            description={tr(
              "pages.admin_settings.notifications_admin_settings.daily_summary_or_a_message_per_episode_for_people_who",
            )}
            enabled={emailOn}
            onEnabledChange={setToggle("notifications.email_enabled")}
            chips={
              <>
                {mailReady ? (
                  <Chip tone="positive">
                    {tr("pages.admin_settings.notifications_admin_settings.mail_server_set_up")}
                  </Chip>
                ) : (
                  <Chip tone={emailOn ? "warning" : "neutral"}>
                    {tr("pages.admin_settings.notifications_admin_settings.mail_server_not_set_up")}
                  </Chip>
                )}
                <Chip>
                  {tr("pages.admin_settings.notifications_admin_settings.summary_at")}{" "}
                  {digestHourLabel(form.getValue("notifications.email.digest_hour"))}
                </Chip>
              </>
            }
          >
            <SettingsSubheading>
              {tr("pages.admin_settings.notifications_admin_settings.mail_server")}
            </SettingsSubheading>
            <div className="settings-field-list">
              <SettingField
                label={tr(
                  "pages.admin_settings.notifications_admin_settings.send_email_from_this_server",
                )}
                description={tr(
                  "pages.admin_settings.notifications_admin_settings.covers_every_email_silo_sends_not_just_notifications",
                )}
                type="toggle"
                value={form.getValue("email.enabled")}
                onChange={(v) => form.setValue("email.enabled", v)}
                restartRequired={needsRestart("email.enabled")}
              />
              <SettingField
                label={tr("pages.admin_settings.notifications_admin_settings.from_address")}
                hint={tr("pages.admin_settings.notifications_admin_settings.silo_example_com")}
                value={form.getValue("email.from_address")}
                onChange={(v) => form.setValue("email.from_address", v)}
                restartRequired={needsRestart("email.from_address")}
              />
              <SettingField
                label={tr("pages.admin_settings.notifications_admin_settings.from_name")}
                hint={tr("pages.admin_settings.notifications_admin_settings.silo")}
                value={form.getValue("email.from_name")}
                onChange={(v) => form.setValue("email.from_name", v)}
                restartRequired={needsRestart("email.from_name")}
              />
              <SettingField
                label={tr("pages.admin_settings.notifications_admin_settings.mail_server_address")}
                hint={tr("pages.admin_settings.notifications_admin_settings.smtp_example_com")}
                value={form.getValue("email.smtp_host")}
                onChange={(v) => form.setValue("email.smtp_host", v)}
                restartRequired={needsRestart("email.smtp_host")}
              />
              <SettingField
                label={tr("pages.admin_settings.notifications_admin_settings.port")}
                description={tr(
                  "pages.admin_settings.notifications_admin_settings.value_587_for_starttls_typical_465_for_implicit_tls",
                )}
                type="number"
                value={form.getValue("email.smtp_port")}
                onChange={(v) => form.setValue("email.smtp_port", v)}
                restartRequired={needsRestart("email.smtp_port")}
              />
              <SettingField
                label={tr("pages.admin_settings.notifications_admin_settings.encryption")}
                description={tr(
                  "pages.admin_settings.notifications_admin_settings.use_whatever_your_mail_provider_documents",
                )}
                type="select"
                options={[
                  {
                    value: "starttls",
                    label: tr("pages.admin_settings.notifications_admin_settings.starttls"),
                  },
                  {
                    value: "tls",
                    label: tr("pages.admin_settings.notifications_admin_settings.tls_implicit"),
                  },
                  {
                    value: "none",
                    label: tr("pages.admin_settings.notifications_admin_settings.none_insecure"),
                  },
                ]}
                value={form.getValue("email.smtp_security") || "starttls"}
                onChange={(v) => form.setValue("email.smtp_security", v)}
                restartRequired={needsRestart("email.smtp_security")}
              />
              <SettingField
                label={tr("pages.admin_settings.notifications_admin_settings.username")}
                description={tr(
                  "pages.admin_settings.notifications_admin_settings.leave_empty_if_the_mail_server_needs_no_sign_in",
                )}
                value={form.getValue("email.smtp_username")}
                onChange={(v) => form.setValue("email.smtp_username", v)}
                restartRequired={needsRestart("email.smtp_username")}
              />
              <SecretField
                label={tr("pages.admin_settings.notifications_admin_settings.password")}
                value={form.getValue("email.smtp_password")}
                configured={form.sensitiveConfigured.includes("email.smtp_password")}
                onKeep={() => form.resetValue("email.smtp_password")}
                // The username above can be emptied for a relay that needs no
                // sign-in; without this the password could not follow it.
                onClear={() => form.setValue("email.smtp_password", "")}
                cleared={form.isClearStaged("email.smtp_password")}
                onChange={(v) => form.setValue("email.smtp_password", v)}
                restartRequired={needsRestart("email.smtp_password")}
              />
              <TestEmailRow />
            </div>
            <SettingsSubheading>
              {tr("pages.admin_settings.notifications_admin_settings.delivery")}
            </SettingsSubheading>
            <div className="settings-field-list">
              <SettingField
                label={tr(
                  "pages.admin_settings.notifications_admin_settings.let_people_pick_an_email_per_episode",
                )}
                description={tr(
                  "pages.admin_settings.notifications_admin_settings.off_sends_them_the_daily_summary_instead",
                )}
                type="toggle"
                value={toggleValue("notifications.email.allow_per_episode")}
                onChange={(v) => form.setValue("notifications.email.allow_per_episode", v)}
                restartRequired={needsRestart("notifications.email.allow_per_episode")}
              />
              <SettingField
                label={tr("pages.admin_settings.notifications_admin_settings.daily_summary_hour")}
                description={tr(
                  "pages.admin_settings.notifications_admin_settings.in_the_server_s_own_time_zone",
                )}
                unit="0-23"
                type="number"
                value={numberValue("notifications.email.digest_hour", "8")}
                onChange={(v) => form.setValue("notifications.email.digest_hour", v)}
                restartRequired={needsRestart("notifications.email.digest_hour")}
              />
              <SettingField
                label={tr("pages.admin_settings.notifications_admin_settings.public_url_07dc5c14")}
                description={tr(
                  "pages.admin_settings.notifications_admin_settings.used_for_links_inside_emails_leave_empty_to_omit_them",
                )}
                type="text"
                value={form.getValue("notifications.email.external_url")}
                onChange={(v) => form.setValue("notifications.email.external_url", v)}
                restartRequired={needsRestart("notifications.email.external_url")}
              />
            </div>
          </ChannelCard>

          <ChannelCard
            icon={Bot}
            title={tr("pages.admin_settings.notifications_admin_settings.discord")}
            description={tr(
              "pages.admin_settings.notifications_admin_settings.direct_messages_from_your_discord_bot_to_linked_accounts",
            )}
            enabled={discordOn}
            onEnabledChange={setToggle("notifications.discord_enabled")}
            chips={
              discordAppConfigured ? (
                <Chip tone="positive">
                  {tr("pages.admin_settings.notifications_admin_settings.discord_app_connected")}
                </Chip>
              ) : (
                <Chip tone={discordOn ? "warning" : "neutral"}>
                  {tr(
                    "pages.admin_settings.notifications_admin_settings.discord_app_not_connected",
                  )}
                </Chip>
              )
            }
          >
            <DiscordAppCredentials
              savedClientId={form.getValue("discord.client_id")}
              sensitiveConfigured={form.sensitiveConfigured}
              restartKeys={restartKeys}
            />
            <SettingsSubheading>
              {tr("pages.admin_settings.notifications_admin_settings.delivery")}
            </SettingsSubheading>
            <div className="settings-field-list">
              <SettingField
                label={tr(
                  "pages.admin_settings.notifications_admin_settings.let_people_pick_a_dm_per_episode",
                )}
                description={tr(
                  "pages.admin_settings.notifications_admin_settings.off_sends_them_the_daily_summary_instead",
                )}
                type="toggle"
                value={toggleValue("notifications.discord.allow_per_episode")}
                onChange={(v) => form.setValue("notifications.discord.allow_per_episode", v)}
                restartRequired={needsRestart("notifications.discord.allow_per_episode")}
              />
              <SettingField
                label={tr("pages.admin_settings.notifications_admin_settings.daily_summary_hour")}
                description={tr(
                  "pages.admin_settings.notifications_admin_settings.in_the_server_s_own_time_zone",
                )}
                unit="0-23"
                type="number"
                value={numberValue("notifications.discord.digest_hour", "8")}
                onChange={(v) => form.setValue("notifications.discord.digest_hour", v)}
                restartRequired={needsRestart("notifications.discord.digest_hour")}
              />
            </div>
            <SettingsSubheading>
              {tr("pages.admin_settings.notifications_admin_settings.appearance")}
            </SettingsSubheading>
            <SettingField
              label={tr("pages.admin_settings.notifications_admin_settings.artwork")}
              description={tr(
                "pages.admin_settings.notifications_admin_settings.server_images_reveal_your_server_url_to_anyone_who_sees",
              )}
              type="select"
              value={form.getValue("notifications.discord.poster_mode") || "provider"}
              options={[
                {
                  value: "provider",
                  label: tr(
                    "pages.admin_settings.notifications_admin_settings.provider_images_only",
                  ),
                },
                {
                  value: "server",
                  label: tr(
                    "pages.admin_settings.notifications_admin_settings.provider_and_server_images",
                  ),
                },
                {
                  value: "off",
                  label: tr("pages.admin_settings.notifications_admin_settings.no_artwork"),
                },
              ]}
              onChange={(v) => form.setValue("notifications.discord.poster_mode", v)}
              restartRequired={needsRestart("notifications.discord.poster_mode")}
            />
          </ChannelCard>

          <ChannelCard
            icon={Webhook}
            title={tr("pages.admin_settings.notifications_admin_settings.personal_webhooks")}
            description={tr(
              "pages.admin_settings.notifications_admin_settings.webhooks_people_create_for_themselves_discord_or_generic",
            )}
            enabled={webhooksOn}
            onEnabledChange={setToggle("notifications.webhooks_enabled")}
            chips={
              allowPrivate ? (
                <Chip tone="warning">
                  {tr(
                    "pages.admin_settings.notifications_admin_settings.private_destinations_allowed",
                  )}
                </Chip>
              ) : undefined
            }
          >
            <AdvancedSection
              id="notifications.webhooks"
              count={WEBHOOK_ADVANCED_KEYS.length}
              forceOpen={anyDirty(WEBHOOK_ADVANCED_KEYS)}
            >
              <SettingField
                label={tr("pages.admin_settings.notifications_admin_settings.webhooks_per_person")}
                type="number"
                value={numberValue("notifications.webhooks.max_per_profile", "10")}
                onChange={(v) => form.setValue("notifications.webhooks.max_per_profile", v)}
                restartRequired={needsRestart("notifications.webhooks.max_per_profile")}
              />
              <SettingField
                label={tr(
                  "pages.admin_settings.notifications_admin_settings.deliveries_per_person",
                )}
                description={tr(
                  "pages.admin_settings.notifications_admin_settings.calls_over_the_limit_are_dropped_the_inbox_notification_still",
                )}
                unit="per minute"
                type="number"
                value={numberValue(
                  "notifications.webhooks.deliveries_per_minute_per_profile",
                  "60",
                )}
                onChange={(v) =>
                  form.setValue("notifications.webhooks.deliveries_per_minute_per_profile", v)
                }
                restartRequired={needsRestart(
                  "notifications.webhooks.deliveries_per_minute_per_profile",
                )}
              />
              <SettingField
                label={tr(
                  "pages.admin_settings.notifications_admin_settings.allow_webhooks_to_private_addresses",
                )}
                description={tr(
                  "pages.admin_settings.notifications_admin_settings.allows_lan_and_localhost_destinations_development_only",
                )}
                type="toggle"
                value={form.getValue("notifications.webhooks.allow_private_destinations")}
                onChange={(v) =>
                  form.setValue("notifications.webhooks.allow_private_destinations", v)
                }
                restartRequired={needsRestart("notifications.webhooks.allow_private_destinations")}
              />
              {allowPrivate && (
                <div className="flex items-start gap-2 py-3 text-xs text-amber-500">
                  <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <p>
                    {tr(
                      "pages.admin_settings.notifications_admin_settings.any_user_with_webhook_access_can_make_this_server_send",
                    )}
                  </p>
                </div>
              )}
            </AdvancedSection>
          </ChannelCard>

          <ChannelCard
            icon={Megaphone}
            title={tr("pages.admin_settings.notifications_admin_settings.server_channels")}
            description={tr(
              "pages.admin_settings.notifications_admin_settings.server_wide_announcements_posted_to_a_shared_destination",
            )}
            enabled={serverChannelsOn}
            onEnabledChange={setToggle("notifications.server_channels_enabled")}
            chips={
              <>
                {serverChannels != null && (
                  <Chip>
                    {serverChannels.length}{" "}
                    {tr("pages.admin_settings.notifications_admin_settings.destination")}
                    {serverChannels.length === 1
                      ? ""
                      : tr("pages.admin_settings.notifications_admin_settings.s")}
                  </Chip>
                )}
                {failingServerChannels > 0 && (
                  <Chip tone="warning">
                    {failingServerChannels}{" "}
                    {tr("pages.admin_settings.notifications_admin_settings.failing")}
                  </Chip>
                )}
              </>
            }
          >
            <div className="settings-field-list">
              <SettingField
                label={tr("pages.admin_settings.notifications_admin_settings.batch_window")}
                description={tr(
                  "pages.admin_settings.notifications_admin_settings.new_content_waits_this_long_so_a_season_posts_as",
                )}
                unit="seconds"
                type="number"
                value={numberValue("notifications.server_channels.batch_seconds", "300")}
                onChange={(v) => form.setValue("notifications.server_channels.batch_seconds", v)}
                restartRequired={needsRestart("notifications.server_channels.batch_seconds")}
              />
              <SettingField
                label={tr(
                  "pages.admin_settings.notifications_admin_settings.mention_the_requester_on_discord",
                )}
                description={tr(
                  "pages.admin_settings.notifications_admin_settings.unlinked_accounts_show_their_silo_username_instead",
                )}
                type="toggle"
                value={form.getValue("notifications.server_channels.mention_requesters")}
                onChange={(v) =>
                  form.setValue("notifications.server_channels.mention_requesters", v)
                }
                restartRequired={needsRestart("notifications.server_channels.mention_requesters")}
              />
              <div className="pt-3">
                <ServerNotificationChannels />
              </div>
            </div>
          </ChannelCard>
        </section>

        {/* ── Tuning: everything here has a working default ── */}
        <section className="space-y-3">
          <ZoneHeading title={tr("pages.admin_settings.notifications_admin_settings.tuning")} />
          {/* Full width, not a two-up grid: the settings column is clamped to
              max-w-3xl, so side-by-side groups left each row with a ~140px
              label column beside its control and every description wrapped to
              six lines. */}
          <div className="space-y-3">
            <FieldGroup
              label={tr(
                "pages.admin_settings.notifications_admin_settings.grouping_and_flood_control",
              )}
              restartAll={allRestart(FANOUT_KEYS)}
            >
              <AdvancedSection
                id="notifications.fanout"
                count={FANOUT_KEYS.length}
                forceOpen={anyDirty(FANOUT_KEYS)}
              >
                <SettingField
                  label={tr("pages.admin_settings.notifications_admin_settings.settle_window")}
                  description={tr(
                    "pages.admin_settings.notifications_admin_settings.items_that_finish_scanning_together_arrive_as_one_notification",
                  )}
                  unit="seconds"
                  type="number"
                  value={numberValue("notifications.fanout.settle_seconds", "30")}
                  onChange={(v) => form.setValue("notifications.fanout.settle_seconds", v)}
                  restartRequired={needsRestart("notifications.fanout.settle_seconds")}
                />
                <SettingField
                  label={tr(
                    "pages.admin_settings.notifications_admin_settings.max_messages_per_show",
                  )}
                  description={tr(
                    "pages.admin_settings.notifications_admin_settings.anything_past_this_is_skipped_for_that_batch",
                  )}
                  type="number"
                  value={numberValue("notifications.fanout.max_series_burst", "3")}
                  onChange={(v) => form.setValue("notifications.fanout.max_series_burst", v)}
                  restartRequired={needsRestart("notifications.fanout.max_series_burst")}
                />
                <SettingField
                  label={tr("pages.admin_settings.notifications_admin_settings.max_content_age")}
                  description={tr(
                    "pages.admin_settings.notifications_admin_settings.older_items_are_dropped_instead_of_arriving_as_stale_news",
                  )}
                  unit="hours"
                  type="number"
                  value={numberValue("notifications.fanout.max_event_age_hours", "72")}
                  onChange={(v) => form.setValue("notifications.fanout.max_event_age_hours", v)}
                  restartRequired={needsRestart("notifications.fanout.max_event_age_hours")}
                />
              </AdvancedSection>
            </FieldGroup>

            <FieldGroup
              label={tr("pages.admin_settings.notifications_admin_settings.retention")}
              restartAll={allRestart(RETENTION_KEYS)}
            >
              <AdvancedSection
                id="notifications.retention"
                count={RETENTION_KEYS.length}
                forceOpen={anyDirty(RETENTION_KEYS)}
              >
                <SettingField
                  label={tr("pages.admin_settings.notifications_admin_settings.read_notifications")}
                  unit="days"
                  type="number"
                  value={numberValue("notifications.retention.read_days", "90")}
                  onChange={(v) => form.setValue("notifications.retention.read_days", v)}
                  restartRequired={needsRestart("notifications.retention.read_days")}
                />
                <SettingField
                  label={tr(
                    "pages.admin_settings.notifications_admin_settings.unread_notifications",
                  )}
                  unit="days"
                  type="number"
                  value={numberValue("notifications.retention.unread_days", "180")}
                  onChange={(v) => form.setValue("notifications.retention.unread_days", v)}
                  restartRequired={needsRestart("notifications.retention.unread_days")}
                />
                <SettingField
                  label={tr("pages.admin_settings.notifications_admin_settings.sent_history")}
                  description={tr(
                    "pages.admin_settings.notifications_admin_settings.record_of_what_silo_already_notified_about",
                  )}
                  unit="days"
                  type="number"
                  value={numberValue("notifications.retention.event_days", "30")}
                  onChange={(v) => form.setValue("notifications.retention.event_days", v)}
                  restartRequired={needsRestart("notifications.retention.event_days")}
                />
              </AdvancedSection>
            </FieldGroup>
          </div>
        </section>
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
