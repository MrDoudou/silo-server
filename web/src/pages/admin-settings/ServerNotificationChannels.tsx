import { useState } from "react";
import {
  AlertTriangle,
  KeyRound,
  Loader2,
  Megaphone,
  Pencil,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "@/i18n/toast";

import type {
  NotificationWebhookTestResult,
  ServerNotificationChannel,
  ServerNotificationChannelInput,
} from "@/api/types";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SigningSecretDialog } from "@/components/SigningSecretDialog";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  useCreateServerNotificationChannel,
  useDeleteServerNotificationChannel,
  useRotateServerNotificationChannelSecret,
  useServerNotificationChannels,
  useTestServerNotificationChannel,
  useUpdateServerNotificationChannel,
} from "@/hooks/queries/admin/serverNotificationChannels";
import { formatRelativeTime } from "@/lib/date";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

type ChannelNotifyKey =
  | "notify_new_movies"
  | "notify_new_episodes"
  | "notify_new_audiobooks"
  | "notify_new_ebooks"
  | "notify_request_submitted"
  | "notify_request_approved"
  | "notify_request_declined"
  | "notify_request_fulfilled";

interface ChannelNotifyField {
  key: ChannelNotifyKey;
  label: string;
  defaultValue: boolean;
}

const EVENT_SECTIONS: { label: string; fields: ChannelNotifyField[] }[] = [
  {
    get label() {
      return tr("pages.admin_settings.server_notification_channels.new_content");
    },
    fields: [
      {
        key: "notify_new_movies",
        get label() {
          return tr("pages.admin_settings.server_notification_channels.new_movies");
        },
        defaultValue: true,
      },
      {
        key: "notify_new_episodes",
        get label() {
          return tr("pages.admin_settings.server_notification_channels.new_episodes");
        },
        defaultValue: true,
      },
      {
        key: "notify_new_audiobooks",
        get label() {
          return tr("pages.admin_settings.server_notification_channels.new_audiobooks");
        },
        defaultValue: true,
      },
      {
        key: "notify_new_ebooks",
        get label() {
          return tr("pages.admin_settings.server_notification_channels.new_ebooks");
        },
        defaultValue: true,
      },
    ],
  },
  {
    get label() {
      return tr("pages.admin_settings.server_notification_channels.media_requests");
    },
    fields: [
      {
        key: "notify_request_submitted",
        get label() {
          return tr("pages.admin_settings.server_notification_channels.request_submitted");
        },
        defaultValue: false,
      },
      {
        key: "notify_request_approved",
        get label() {
          return tr("pages.admin_settings.server_notification_channels.request_approved");
        },
        defaultValue: false,
      },
      {
        key: "notify_request_declined",
        get label() {
          return tr("pages.admin_settings.server_notification_channels.request_declined");
        },
        defaultValue: false,
      },
      {
        key: "notify_request_fulfilled",
        get label() {
          return tr("pages.admin_settings.server_notification_channels.request_fulfilled");
        },
        defaultValue: false,
      },
    ],
  },
];

const CHANNEL_NOTIFY_FIELDS = EVENT_SECTIONS.flatMap((section) => section.fields);

function ChannelFormDialog({
  open,
  onOpenChange,
  channel,
  onSecret,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: ServerNotificationChannel | null;
  onSecret: (secret: string) => void;
}) {
  useUILanguage();
  const create = useCreateServerNotificationChannel();
  const update = useUpdateServerNotificationChannel();
  const [name, setName] = useState(channel?.name ?? "");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<Record<ChannelNotifyKey, boolean>>(
    () =>
      Object.fromEntries(
        CHANNEL_NOTIFY_FIELDS.map((field) => [
          field.key,
          channel?.[field.key] ?? field.defaultValue,
        ]),
      ) as Record<ChannelNotifyKey, boolean>,
  );
  const pending = create.isPending || update.isPending;
  const editing = channel != null;

  const submit = () => {
    const input: ServerNotificationChannelInput = { name: name.trim(), ...events };
    if (url.trim()) {
      input.url = url.trim();
    }
    if (editing) {
      update.mutate(
        { id: channel.id, ...input },
        {
          onSuccess: () => onOpenChange(false),
        },
      );
      return;
    }
    if (!input.url) {
      toast.error("errors.admin_settings.server_notification_channels.a_webhook_url_is_required");
      return;
    }
    create.mutate(input, {
      onSuccess: (created) => {
        onOpenChange(false);
        toast.success("feedback.admin_settings.server_notification_channels.channel_name_created", {
          values: { name: created.name },
        });
        if (created.signing_secret) {
          onSecret(created.signing_secret);
        }
      },
      onError: (error) => {
        toast.error("errors.admin_settings.server_notification_channels.failed_to_create_channel", {
          error: error,
        });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing
              ? tr("pages.admin_settings.server_notification_channels.edit_name", {
                  name: channel.name,
                })
              : tr("pages.admin_settings.server_notification_channels.add_server_channel")}
          </DialogTitle>
          <DialogDescription>
            {tr(
              "pages.admin_settings.server_notification_channels.server_channels_broadcast_server_wide_events_every_profile_sees_the",
            )}
          </DialogDescription>
        </DialogHeader>
        <fieldset disabled={pending} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="server-channel-name">
              {tr("pages.admin_settings.server_notification_channels.name")}
            </Label>
            <Input
              id="server-channel-name"
              value={name}
              maxLength={64}
              placeholder={tr(
                "pages.admin_settings.server_notification_channels.community_new_content",
              )}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="server-channel-url">
              {editing
                ? tr("pages.admin_settings.server_notification_channels.replace_url_optional")
                : tr("pages.admin_settings.server_notification_channels.url")}
            </Label>
            <Input
              id="server-channel-url"
              value={url}
              placeholder={
                editing
                  ? tr(
                      "pages.admin_settings.server_notification_channels.currently_pointing_at_url_host",
                      { url_host: channel.url_host },
                    )
                  : tr(
                      "pages.admin_settings.server_notification_channels.https_discord_com_api_webhooks",
                    )
              }
              onChange={(event) => setUrl(event.target.value)}
            />
          </div>
          {EVENT_SECTIONS.map((section) => (
            <div key={section.label} className="space-y-2">
              <Label>{section.label}</Label>
              {section.fields.map((field) => (
                <div key={field.key} className="flex items-center justify-between gap-3">
                  <div className="text-sm">{field.label}</div>
                  <Switch
                    checked={events[field.key]}
                    onCheckedChange={(checked) =>
                      setEvents((current) => ({ ...current, [field.key]: checked }))
                    }
                  />
                </div>
              ))}
            </div>
          ))}
        </fieldset>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tr("common.actions.cancel")}
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? tr("common.actions.save") : tr("common.actions.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChannelCard({
  channel,
  onEdit,
  onSecret,
}: {
  channel: ServerNotificationChannel;
  onEdit: () => void;
  onSecret: (secret: string) => void;
}) {
  useUILanguage();
  const update = useUpdateServerNotificationChannel();
  const remove = useDeleteServerNotificationChannel();
  const test = useTestServerNotificationChannel();
  const rotate = useRotateServerNotificationChannelSecret();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [testResult, setTestResult] = useState<NotificationWebhookTestResult | null>(null);

  const lastSuccess = formatRelativeTime(channel.last_success_at);
  const lastFailure = formatRelativeTime(channel.last_failure_at);
  const failing =
    channel.last_failure_at != null &&
    (channel.last_success_at == null || channel.last_failure_at > channel.last_success_at);
  const enabledEvents = CHANNEL_NOTIFY_FIELDS.filter((field) => channel[field.key]).map(
    (field) => field.label,
  );

  return (
    <div className="border-border/60 space-y-2 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{channel.name}</span>
        <Badge variant="secondary">{channel.type}</Badge>
        <span className="text-muted-foreground text-xs">{channel.url_host}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-muted-foreground text-xs">
            {channel.enabled
              ? tr("pages.admin_settings.server_notification_channels.enabled")
              : tr("pages.admin_settings.server_notification_channels.disabled")}
          </span>
          <Switch
            checked={channel.enabled}
            onCheckedChange={(checked) => update.mutate({ id: channel.id, enabled: checked })}
          />
        </div>
      </div>

      <div className="text-muted-foreground text-xs">
        {enabledEvents.length > 0
          ? enabledEvents.join(" · ")
          : tr("pages.admin_settings.server_notification_channels.no_events_selected")}
      </div>

      {lastSuccess && !failing && (
        <div className="text-muted-foreground text-xs">
          {tr("pages.admin_settings.server_notification_channels.last_post")} {lastSuccess}
        </div>
      )}
      {failing && (
        <div className="flex items-start gap-1.5 text-xs text-amber-500">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {channel.disabled_reason
              ? tr(
                  "pages.admin_settings.server_notification_channels.disabled_disabled_reason_re_enable_the_channel_to_resume_from",
                  {
                    disabled_reason: channel.disabled_reason,
                  },
                )
              : tr(
                  "pages.admin_settings.server_notification_channels.last_failure_value_value2_check_the_destination_url",
                  {
                    value: lastFailure ? ` ${lastFailure}` : "",
                    value2:
                      channel.last_failure_message ||
                      `HTTP ${channel.last_failure_status ?? "error"}`,
                  },
                )}
          </span>
        </div>
      )}
      {testResult && (
        <div className={"text-xs " + (testResult.ok ? "text-emerald-500" : "text-amber-500")}>
          {tr("pages.admin_settings.server_notification_channels.test")}{" "}
          {testResult.ok
            ? tr("pages.admin_settings.server_notification_channels.succeeded")
            : tr("pages.admin_settings.server_notification_channels.failed")}
          {testResult.http_status
            ? tr("pages.admin_settings.server_notification_channels.http_http_status", {
                http_status: testResult.http_status,
              })
            : " ("}
          {tr("pages.admin_settings.server_notification_channels.duration_ms_ms", {
            duration_ms: testResult.duration_ms,
          })}
          {testResult.message
            ? tr("pages.admin_settings.server_notification_channels.message", {
                message: tr.remote({ message: testResult.message }),
              })
            : ""}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 pt-1">
        <Button
          variant="outline"
          size="sm"
          disabled={test.isPending}
          onClick={() =>
            test.mutate(channel.id, {
              onSuccess: setTestResult,
              onError: () =>
                toast.error(
                  "errors.admin_settings.server_notification_channels.test_request_failed",
                ),
            })
          }
        >
          {test.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="mr-1.5 h-3.5 w-3.5" />
          )}
          {tr("pages.admin_settings.server_notification_channels.test")}
        </Button>
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          {tr("common.actions.edit")}
        </Button>
        {channel.type === "generic" && (
          <Button
            variant="outline"
            size="sm"
            disabled={rotate.isPending}
            onClick={() =>
              rotate.mutate(channel.id, {
                onSuccess: (result) => onSecret(result.signing_secret),
              })
            }
          >
            <KeyRound className="mr-1.5 h-3.5 w-3.5" />
            {tr("pages.admin_settings.server_notification_channels.rotate_secret")}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="text-destructive"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          {tr("common.actions.delete")}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={tr("pages.admin_settings.server_notification_channels.delete_name", {
          name: channel.name,
        })}
        description={tr(
          "pages.admin_settings.server_notification_channels.server_events_will_stop_posting_to_this_destination_this_cannot",
        )}
        confirmLabel={tr("common.actions.delete")}
        variant="destructive"
        isPending={remove.isPending}
        onConfirm={() => remove.mutate(channel.id, { onSettled: () => setConfirmDelete(false) })}
      />
      {update.isPending && (
        <span className="sr-only">
          {tr("pages.admin_settings.server_notification_channels.saving")}
        </span>
      )}
    </div>
  );
}

/**
 * Admin CRUD for server notification channels: broadcast webhook destinations
 * that announce newly added content and media request lifecycle events to a
 * shared audience (e.g. a community Discord channel).
 */
export default function ServerNotificationChannels() {
  useUILanguage();
  const { data: channels, isLoading } = useServerNotificationChannels();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ServerNotificationChannel | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <>
          {(channels ?? []).map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              onSecret={setSecret}
              onEdit={() => {
                setEditing(channel);
                setFormOpen(true);
              }}
            />
          ))}
          {(channels ?? []).length === 0 && (
            <div className="text-muted-foreground flex items-center gap-2 py-1 text-sm">
              <Megaphone className="h-4 w-4" />
              {tr(
                "pages.admin_settings.server_notification_channels.no_server_channels_yet_create_one_to_broadcast_new_content",
              )}
            </div>
          )}
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {tr("pages.admin_settings.server_notification_channels.add_server_channel")}
            </Button>
          </div>
        </>
      )}

      {formOpen && (
        <ChannelFormDialog
          key={editing?.id ?? "new"}
          open={formOpen}
          onOpenChange={(open) => {
            setFormOpen(open);
            if (!open) {
              setEditing(null);
            }
          }}
          channel={editing}
          onSecret={setSecret}
        />
      )}
      <SigningSecretDialog secret={secret} onClose={() => setSecret(null)} />
    </div>
  );
}
