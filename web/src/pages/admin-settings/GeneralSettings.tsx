import { useMemo } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";

import { useSettingsForm } from "@/hooks/useSettingsForm";
import { useRestartKeys } from "@/hooks/useRestartKeys";
import { AdvancedSection } from "@/components/settings/AdvancedSection";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingField } from "./SettingField";
import { SaveBar } from "./SaveBar";
import { FieldGroup } from "./FieldGroup";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

// Identity (server name, login subtitle) used to live on the Branding tab and
// public signups on the Invite Codes tab; both are plain server-wide switches an
// admin looks for under General, so they save with everything else on this page.
const IDENTITY_KEYS = ["branding.server_name", "branding.login_subtitle"];
const ACCESS_KEYS = ["signup.enabled"];
const LOGGING_ADVANCED_KEYS = ["server.log_quiet"];
const LOGGING_KEYS = ["server.log_level", ...LOGGING_ADVANCED_KEYS];

const KEYS = [...IDENTITY_KEYS, ...ACCESS_KEYS, ...LOGGING_KEYS];

export default function GeneralSettings() {
  useUILanguage();
  useUILanguage();
  const form = useSettingsForm({ keys: useMemo(() => KEYS, []) });
  const restartKeys = useRestartKeys();

  const allRestart = (keys: string[]) => keys.every((key) => restartKeys.has(key));
  const anyDirty = (keys: string[]) => keys.some((key) => form.isDirty(key));

  if (form.isLoading)
    return (
      <div
        className="space-y-6"
        role="status"
        aria-label={tr("pages.admin_settings.general_settings.loading_settings")}
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
          {tr("pages.admin_settings.general_settings.loading_settings")}
        </span>
      </div>
    );

  return (
    <div className="flex h-full flex-col">
      <SettingsPageHeader
        title={tr("pages.admin_settings.general_settings.general")}
        className="mb-7"
      />

      <div className="flex-1 space-y-5">
        <FieldGroup
          label={tr("pages.admin_settings.general_settings.identity")}
          restartAll={allRestart(IDENTITY_KEYS)}
          dirty={anyDirty(IDENTITY_KEYS)}
        >
          <SettingField
            label={tr("pages.admin_settings.general_settings.server_name")}
            settingKey="branding.server_name"
            dirty={form.isDirty("branding.server_name")}
            hint={tr("pages.admin_settings.general_settings.silo")}
            value={form.getValue("branding.server_name")}
            onChange={(v) => form.setValue("branding.server_name", v)}
            restartRequired={restartKeys.has("branding.server_name")}
          />
          <SettingField
            label={tr("pages.admin_settings.general_settings.login_subtitle")}
            settingKey="branding.login_subtitle"
            dirty={form.isDirty("branding.login_subtitle")}
            hint={tr("pages.admin_settings.general_settings.sign_in_with_an_existing_account")}
            description={tr(
              "pages.admin_settings.general_settings.shown_under_the_server_name_on_the_sign_in_page",
            )}
            value={form.getValue("branding.login_subtitle")}
            onChange={(v) => form.setValue("branding.login_subtitle", v)}
            restartRequired={restartKeys.has("branding.login_subtitle")}
          />
        </FieldGroup>

        <FieldGroup
          label={tr("pages.admin_settings.general_settings.access")}
          restartAll={allRestart(ACCESS_KEYS)}
          dirty={anyDirty(ACCESS_KEYS)}
          actions={
            <Link
              to="/admin/users?tab=invite-codes"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
            >
              {tr("pages.admin_settings.general_settings.manage_invite_codes")}
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          }
        >
          <SettingField
            label={tr("pages.admin_settings.general_settings.public_signups")}
            settingKey="signup.enabled"
            dirty={form.isDirty("signup.enabled")}
            type="toggle"
            description={tr(
              "pages.admin_settings.general_settings.anyone_with_a_valid_invite_code_can_create_an_account",
            )}
            value={form.getValue("signup.enabled")}
            onChange={(v) => form.setValue("signup.enabled", v)}
            restartRequired={restartKeys.has("signup.enabled")}
          />
        </FieldGroup>

        <FieldGroup
          label={tr("pages.admin_settings.general_settings.logging")}
          restartAll={allRestart(LOGGING_KEYS)}
          dirty={anyDirty(LOGGING_KEYS)}
        >
          <SettingField
            label={tr("pages.admin_settings.general_settings.log_level")}
            settingKey="server.log_level"
            dirty={form.isDirty("server.log_level")}
            type="select"
            description={tr(
              "pages.admin_settings.general_settings.debug_is_loud_use_it_while_chasing_a_problem",
            )}
            value={form.getValue("server.log_level")}
            onChange={(v) => form.setValue("server.log_level", v)}
            restartRequired={restartKeys.has("server.log_level")}
            options={[
              { value: "debug", label: tr("pages.admin_settings.general_settings.debug") },
              { value: "info", label: tr("pages.admin_settings.general_settings.info") },
              { value: "warn", label: tr("pages.admin_settings.general_settings.warn") },
              { value: "error", label: tr("pages.admin_settings.general_settings.error") },
            ]}
          />
          <AdvancedSection
            id="general.logging"
            count={LOGGING_ADVANCED_KEYS.length}
            forceOpen={form.isDirty("server.log_quiet")}
          >
            <SettingField
              label={tr("pages.admin_settings.general_settings.quiet_log_prefixes")}
              settingKey="server.log_quiet"
              dirty={form.isDirty("server.log_quiet")}
              hint={tr("pages.admin_settings.general_settings.metadata_scanner")}
              description={tr(
                "pages.admin_settings.general_settings.drops_log_lines_starting_with_any_of_these_words",
              )}
              value={form.getValue("server.log_quiet")}
              onChange={(v) => form.setValue("server.log_quiet", v)}
              restartRequired={restartKeys.has("server.log_quiet")}
            />
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
