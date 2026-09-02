import { useEffect, useMemo, useState } from "react";
import {
  Cast,
  Check,
  ChevronDown,
  Copy,
  KeyRound,
  MonitorSmartphone,
  Server,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { toast } from "@/i18n/toast";

import type { Profile } from "@/api/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useCompatConnectInfo } from "@/hooks/queries/compat";
import { useProfiles } from "@/hooks/queries/profiles";
import { copyTextToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import {
  buildJellyfinPasswordHint,
  buildJellyfinUsername,
  isLoopbackURL,
  jellyfinUsernameIssue,
  JELLYFIN_APP_EXAMPLES,
  SILO_APP_EXAMPLES,
} from "./connectApps";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

type AppKind = "silo" | "jellyfin";

/** Renders `name#Profile` with the separator tinted so `#` reads as structure. */
function HashString({ before, after }: { before: string; after: string }) {
  useUILanguage();
  return (
    <span className="font-mono">
      {before}
      <span className="text-info font-semibold">#</span>
      {after}
    </span>
  );
}

interface FieldRowProps {
  label: string;
  icon: typeof Server;
  kind: AppKind;
  hint?: string;
  /** Rendered value. Omit copyValue for patterns that aren't literal text. */
  children: React.ReactNode;
  copyValue?: string;
}

function FieldRow({ label, icon: Icon, kind, hint, children, copyValue }: FieldRowProps) {
  useUILanguage();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    if (!copyValue) return;
    try {
      await copyTextToClipboard(copyValue);
      setCopied(true);
    } catch {
      toast.error(
        "errors.settings.connect_apps_settings.couldn_t_copy_select_the_text_and_copy_it_manually",
      );
    }
  }

  return (
    <div
      className={cn(
        "rounded-md border px-3.5 py-2.5",
        kind === "jellyfin" ? "border-info/25 bg-info/[0.06]" : "border-border bg-background/40",
      )}
    >
      <div className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.16em] uppercase">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="min-w-0 flex-1 text-[15px] break-all">{children}</div>
        {copyValue ? (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={tr("pages.settings.connect_apps_settings.copy_label", { label: label })}
            onClick={handleCopy}
          >
            {copied ? <Check className="text-success h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        ) : null}
      </div>
      {hint ? <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{hint}</p> : null}
    </div>
  );
}

function ScopeBanner({ kind }: { kind: AppKind }) {
  useUILanguage();
  const isJellyfin = kind === "jellyfin";
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3.5 py-2.5",
        isJellyfin ? "border-info/30 bg-info/[0.07]" : "border-border bg-background/40",
      )}
    >
      {isJellyfin ? (
        <Cast className="text-info mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <MonitorSmartphone className="text-foreground mt-0.5 h-4 w-4 shrink-0" />
      )}
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">
          {isJellyfin
            ? tr("pages.settings.connect_apps_settings.for_jellyfin_compatible_apps_only")
            : tr("pages.settings.connect_apps_settings.for_silo_s_own_apps")}
        </p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {isJellyfin ? JELLYFIN_APP_EXAMPLES : SILO_APP_EXAMPLES}.{" "}
          {isJellyfin
            ? tr(
                "pages.settings.connect_apps_settings.these_credentials_will_not_work_on_a_silo_sign_in",
              )
            : tr("pages.settings.connect_apps_settings.don_t_add_a_to_either_field_here")}
        </p>
      </div>
    </div>
  );
}

function ProfilePicker({
  profiles,
  selectedId,
  onSelect,
}: {
  profiles: Profile[];
  selectedId: string | null;
  onSelect: (profile: Profile) => void;
}) {
  useUILanguage();
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.16em] uppercase">
        {tr("pages.settings.connect_apps_settings.which_profile_are_you_signing_in_as")}
      </p>
      <div className="flex flex-wrap gap-2">
        {profiles.map((profile) => {
          const active = profile.id === selectedId;
          return (
            <button
              key={profile.id}
              type="button"
              onClick={() => onSelect(profile)}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-info/50 bg-info/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-accent/60",
              )}
            >
              <Avatar className="h-6 w-6">
                {profile.avatar_url ? <AvatarImage src={profile.avatar_url} alt="" /> : null}
                <AvatarFallback className="text-[10px] font-semibold">
                  {profile.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {profile.name}
              {profile.has_pin ? <KeyRound className="text-muted-foreground h-3.5 w-3.5" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TroubleshootingPanel({
  accountUsername,
  compatURL,
}: {
  accountUsername: string;
  compatURL: string | null;
}) {
  useUILanguage();
  const [open, setOpen] = useState(false);

  const rows = [
    {
      q: "You left the profile off the username",
      a: `Signing in as plain "${accountUsername}" only works if a profile is named "${accountUsername}", or exactly one profile has no PIN. Adding #ProfileName always works.`,
    },
    {
      q: "The profile has a PIN and you didn't append it",
      a: "PIN-protected profiles need password#PIN. There is no second prompt — a Jellyfin app never asks.",
    },
    {
      q: "Your account password itself contains a #",
      a: "Type it in full and append #PIN anyway. Silo splits at the last # only.",
    },
    {
      q: "Two profiles share a name",
      a: "Profile names are matched without case sensitivity, so duplicates are ambiguous. Rename one in Settings → Profiles.",
    },
    ...(compatURL
      ? [
          {
            q: "You used the Silo app's address",
            a: `The compatibility API is a separate address: ${compatURL}`,
          },
        ]
      : []),
  ];

  return (
    <section className="surface-panel rounded-md border px-4 py-4 shadow-none sm:px-5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
      >
        <TriangleAlert className="text-warning h-4 w-4" />
        <span className="text-sm font-semibold">
          {tr(
            "pages.settings.connect_apps_settings.a_jellyfin_app_says_my_username_or_password_is_wrong",
          )}
        </span>
        <ChevronDown
          className={cn(
            "text-muted-foreground ml-auto h-4 w-4 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <dl className="mt-3 space-y-3 text-sm">
          {rows.map((row) => (
            <div key={row.q} className="border-info/40 border-l-2 pl-3">
              <dt className="font-medium">{row.q}</dt>
              <dd className="text-muted-foreground mt-0.5 text-sm leading-relaxed break-words">
                {row.a}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

export default function ConnectAppsSettings() {
  useUILanguage();
  const { user, profile: activeProfile } = useAuth();
  const {
    data: profiles = [],
    isLoading: profilesLoading,
    isError: profilesFailed,
  } = useProfiles();
  const {
    data: connectInfo,
    isLoading: connectInfoLoading,
    isError: connectInfoFailed,
  } = useCompatConnectInfo();

  const [kind, setKind] = useState<AppKind>("jellyfin");
  const [selectedProfileID, setSelectedProfileID] = useState<string | null>(null);

  // Default to the profile the user is already using — the one they're most
  // likely setting an app up for.
  const selectedProfile = useMemo<Profile | null>(() => {
    return (
      profiles.find((candidate) => candidate.id === selectedProfileID) ??
      profiles.find((candidate) => candidate.id === activeProfile?.id) ??
      profiles[0] ??
      null
    );
  }, [activeProfile?.id, profiles, selectedProfileID]);

  const accountUsername = user?.username ?? "";
  const siloURL = typeof window === "undefined" ? "" : window.location.origin;
  const compatEnabled = connectInfo?.jellyfin.enabled ?? false;
  const compatPendingRestart = connectInfo?.jellyfin.pending_restart ?? false;
  const compatURL = connectInfo?.jellyfin.public_url?.trim() || null;
  const compatURLIsLoopback = compatURL !== null && isLoopbackURL(compatURL);
  // Absent field (older server) means the account can use a password.
  const passwordLoginAvailable = connectInfo?.account?.password_login_available ?? true;
  const isJellyfin = kind === "jellyfin";
  const isLoading = profilesLoading || connectInfoLoading;
  // A failed load must not read as "compat is switched off", and an empty
  // profile list must not read as "your account name alone is enough".
  const loadFailed = connectInfoFailed || profilesFailed;
  // Everything below the credential panel is only meaningful when we actually
  // showed credentials above it.
  const showCompatCredentials =
    isJellyfin && !isLoading && !loadFailed && compatEnabled && passwordLoginAvailable;

  const jellyfinUsername = selectedProfile
    ? buildJellyfinUsername(accountUsername, selectedProfile.name)
    : "";
  const usernameIssue = selectedProfile ? jellyfinUsernameIssue(selectedProfile.name) : null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {tr("pages.settings.connect_apps_settings.connect_apps")}
        </h2>
        <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
          {tr("pages.settings.connect_apps_settings.exactly_what_to_type_on_a_sign_in_screen_pick")}
        </p>
      </div>

      <div
        className="surface-panel-subtle grid grid-cols-1 gap-1 rounded-[1.1rem] p-1 sm:grid-cols-2"
        role="group"
        aria-label={tr("pages.settings.connect_apps_settings.app_type")}
      >
        {(
          [
            {
              id: "silo",
              label: tr("pages.settings.connect_apps_settings.silo_app_or_website"),
              icon: MonitorSmartphone,
            },
            {
              id: "jellyfin",
              label: tr("pages.settings.connect_apps_settings.jellyfin_compatible_app"),
              icon: Cast,
            },
          ] as const
        ).map((option) => {
          const active = option.id === kind;
          const Icon = option.icon;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setKind(option.id)}
              aria-pressed={active}
              className={cn(
                "flex items-center justify-center gap-2 rounded-[0.85rem] px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? option.id === "jellyfin"
                    ? "bg-info/15 text-info ring-info/30 ring-1"
                    : "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {option.label}
            </button>
          );
        })}
      </div>

      <section
        className={cn(
          "surface-panel space-y-4 rounded-md border px-4 py-5 shadow-none sm:px-5",
          isJellyfin && "border-info/35",
        )}
      >
        <ScopeBanner kind={kind} />

        {isLoading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-[76px] w-full rounded-md" />
            ))}
          </div>
        ) : loadFailed ? (
          <div className="border-destructive/40 rounded-md border border-dashed px-3.5 py-4">
            <p className="text-sm font-medium">
              {tr("pages.settings.connect_apps_settings.couldn_t_load_your_sign_in_details")}
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              {tr(
                "pages.settings.connect_apps_settings.reload_the_page_to_try_again_credentials_are_withheld_rather",
              )}
            </p>
          </div>
        ) : isJellyfin && !passwordLoginAvailable ? (
          <div className="border-border rounded-md border border-dashed px-3.5 py-4">
            <p className="text-sm font-medium">
              {tr(
                "pages.settings.connect_apps_settings.this_account_can_t_sign_in_to_a_jellyfin_app",
              )}
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              {tr(
                "pages.settings.connect_apps_settings.it_signs_in_through_an_external_provider_rather_than_a",
              )}
            </p>
          </div>
        ) : isJellyfin && !compatEnabled ? (
          <div className="border-border rounded-md border border-dashed px-3.5 py-4">
            <p className="text-sm font-medium">
              {compatPendingRestart
                ? tr(
                    "pages.settings.connect_apps_settings.the_jellyfin_compatibility_api_isn_t_running_yet",
                  )
                : tr(
                    "pages.settings.connect_apps_settings.the_jellyfin_compatibility_api_is_turned_off",
                  )}
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              {compatPendingRestart
                ? tr(
                    "pages.settings.connect_apps_settings.an_administrator_has_turned_it_on_but_the_server_has",
                  )
                : tr(
                    "pages.settings.connect_apps_settings.third_party_jellyfin_apps_can_t_reach_this_server_until",
                  )}
            </p>
          </div>
        ) : (
          <>
            {isJellyfin && profiles.length > 0 ? (
              <ProfilePicker
                profiles={profiles}
                selectedId={selectedProfile?.id ?? null}
                onSelect={(profile) => setSelectedProfileID(profile.id)}
              />
            ) : null}

            <div className="space-y-2.5">
              <FieldRow
                label={tr("pages.settings.connect_apps_settings.server")}
                icon={Server}
                kind={kind}
                copyValue={
                  isJellyfin
                    ? compatURLIsLoopback
                      ? undefined
                      : (compatURL ?? undefined)
                    : siloURL
                }
                hint={
                  isJellyfin
                    ? compatURLIsLoopback
                      ? tr(
                          "pages.settings.connect_apps_settings.this_address_only_works_on_the_server_itself_so_phones",
                        )
                      : tr(
                          "pages.settings.connect_apps_settings.the_compatibility_api_listens_on_its_own_address_not_the",
                        )
                    : undefined
                }
              >
                {isJellyfin ? (
                  compatURL ? (
                    <code
                      className={cn("font-mono", compatURLIsLoopback && "text-muted-foreground")}
                    >
                      {compatURL}
                    </code>
                  ) : (
                    <span className="text-muted-foreground text-sm">
                      {tr(
                        "pages.settings.connect_apps_settings.no_public_address_configured_ask_an_administrator",
                      )}
                    </span>
                  )
                ) : (
                  <code className="font-mono">{siloURL}</code>
                )}
              </FieldRow>

              <FieldRow
                label={tr("pages.settings.connect_apps_settings.username")}
                icon={Users}
                kind={kind}
                copyValue={
                  isJellyfin
                    ? usernameIssue
                      ? undefined
                      : jellyfinUsername || undefined
                    : accountUsername || undefined
                }
                hint={
                  isJellyfin
                    ? (usernameIssue ??
                      tr(
                        "pages.settings.connect_apps_settings.your_account_name_then_then_the_profile_name_not_just",
                        { accountUsername },
                      ))
                    : tr("pages.settings.connect_apps_settings.just_your_account_name")
                }
              >
                {isJellyfin && selectedProfile ? (
                  <HashString before={accountUsername} after={selectedProfile.name} />
                ) : (
                  <code className="font-mono">{accountUsername}</code>
                )}
              </FieldRow>

              <FieldRow
                label={tr("pages.settings.connect_apps_settings.password")}
                icon={KeyRound}
                kind={kind}
                hint={
                  isJellyfin
                    ? buildJellyfinPasswordHint(selectedProfile)
                    : tr(
                        "pages.settings.connect_apps_settings.your_account_password_the_profile_pin_is_asked_for_separately",
                      )
                }
              >
                {isJellyfin && selectedProfile?.has_pin ? (
                  <HashString before="your password" after="PIN" />
                ) : (
                  <code className="font-mono">
                    {tr("pages.settings.connect_apps_settings.your_password")}
                  </code>
                )}
              </FieldRow>
            </div>

            {isJellyfin ? (
              <p className="text-muted-foreground flex items-start gap-1.5 text-xs leading-relaxed">
                <X className="text-info mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {tr(
                    "pages.settings.connect_apps_settings.jellyfin_apps_offer_only_two_boxes_and_never_prompt_for",
                  )}
                </span>
              </p>
            ) : (
              <div className="border-border/70 rounded-md border border-dashed px-3.5 py-2.5">
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {tr(
                    "pages.settings.connect_apps_settings.after_signing_in_you_ll_choose_a_profile_from_the",
                  )}
                </p>
              </div>
            )}
          </>
        )}
      </section>

      {showCompatCredentials ? (
        <TroubleshootingPanel accountUsername={accountUsername} compatURL={compatURL} />
      ) : null}

      {showCompatCredentials && profiles.length > 1 ? (
        <section className="surface-panel rounded-md border px-4 py-4 shadow-none sm:px-5">
          <h3 className="text-sm font-semibold">
            {tr("pages.settings.connect_apps_settings.every_profile_at_a_glance")}
          </h3>
          <ul className="mt-2.5 space-y-1.5">
            {profiles.map((profile) => {
              // Same guard as the Username field: a name containing # yields a
              // username the resolver can't parse, so don't list one here either.
              const issue = jellyfinUsernameIssue(profile.name);
              return (
                <li key={profile.id} className="flex flex-wrap items-center gap-2 text-sm">
                  {issue ? (
                    <>
                      <span className="text-muted-foreground font-mono line-through">
                        {profile.name}
                      </span>
                      <Badge variant="outline" className="text-muted-foreground">
                        {tr(
                          "pages.settings.connect_apps_settings.rename_to_use_from_a_jellyfin_app",
                        )}
                      </Badge>
                    </>
                  ) : (
                    <>
                      <HashString before={accountUsername} after={profile.name} />
                      {profile.has_pin ? (
                        <Badge variant="outline" className="text-muted-foreground">
                          {tr("pages.settings.connect_apps_settings.needs_pin")}
                        </Badge>
                      ) : null}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
