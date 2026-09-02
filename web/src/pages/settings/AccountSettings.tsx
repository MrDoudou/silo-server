import { useState, type FormEvent } from "react";
import { toast } from "@/i18n/toast";

import { SettingsGroup } from "@/components/settings/SettingsGroup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccountPasswordCapability, useChangeAccountPassword } from "@/hooks/queries/account";
import { useUILanguage } from "@/i18n/uiText";

import { tr } from "@/i18n/translate";

function passwordByteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

export default function AccountSettings() {
  useUILanguage();
  const capability = useAccountPasswordCapability();
  const changePassword = useChangeAccountPassword();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const limits = capability.data;
    if (!limits?.change_password) {
      setFormError(
        tr("pages.settings.account_settings.password_changes_are_unavailable_for_this_account"),
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError(tr("pages.settings.account_settings.new_passwords_do_not_match"));
      return;
    }
    if (Array.from(newPassword).length < limits.minimum_password_length) {
      setFormError(
        tr("pages.settings.account_settings.new_password_must_be_at_least_value1_characters", {
          value1: limits.minimum_password_length,
        }),
      );
      return;
    }
    if (passwordByteLength(newPassword) > limits.maximum_password_bytes) {
      setFormError(
        tr("pages.settings.account_settings.new_password_must_be_at_most_value1_bytes", {
          value1: limits.maximum_password_bytes,
        }),
      );
      return;
    }

    try {
      await changePassword.mutateAsync({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("feedback.settings.account_settings.password_changed");
    } catch (error) {
      setFormError(tr.error("errors.settings.account_settings.failed_to_change_password", error));
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {tr("pages.settings.account_settings.account")}
        </h2>
        <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
          {tr(
            "pages.settings.account_settings.manage_the_sign_in_credential_shared_by_every_profile_on",
          )}
        </p>
      </div>

      <SettingsGroup
        title={tr("pages.settings.account_settings.password")}
        description={tr(
          "pages.settings.account_settings.only_the_primary_profile_can_change_the_shared_account_password",
        )}
      >
        {capability.isLoading ? (
          <div
            className="max-w-md space-y-4"
            role="status"
            aria-label={tr("pages.settings.account_settings.loading_password_settings")}
          >
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : capability.isError ? (
          <p className="text-destructive text-sm">
            {tr(
              "pages.settings.account_settings.password_settings_could_not_be_loaded_refresh_the_page_to",
            )}
          </p>
        ) : !capability.data?.change_password ? (
          <div className="max-w-2xl space-y-1 text-sm">
            <p className="font-medium">
              {tr("pages.settings.account_settings.local_password_changes_are_unavailable")}
            </p>
            <p className="text-muted-foreground">
              {tr(
                "pages.settings.account_settings.this_account_signs_in_through_an_external_provider_or_the",
              )}
            </p>
          </div>
        ) : (
          <form className="max-w-md space-y-4" onSubmit={(event) => void handleSubmit(event)}>
            <div className="space-y-2">
              <Label htmlFor="account-current-password">
                {tr("pages.settings.account_settings.current_password")}
              </Label>
              <Input
                id="account-current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="account-new-password">
                {tr("pages.settings.account_settings.new_password")}
              </Label>
              <Input
                id="account-new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                aria-describedby="account-password-requirements"
                required
              />
              <p id="account-password-requirements" className="text-muted-foreground text-xs">
                {tr("pages.settings.account_settings.at_least")}{" "}
                {capability.data.minimum_password_length}{" "}
                {tr("pages.settings.account_settings.characters_and_no_more_than")}{" "}
                {capability.data.maximum_password_bytes}{" "}
                {tr("pages.settings.account_settings.bytes")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="account-confirm-password">
                {tr("pages.settings.account_settings.confirm_new_password")}
              </Label>
              <Input
                id="account-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </div>

            {formError ? (
              <p className="text-destructive text-sm" role="alert">
                {formError}
              </p>
            ) : null}

            <Button type="submit" disabled={changePassword.isPending}>
              {changePassword.isPending
                ? tr("pages.settings.account_settings.changing")
                : tr("pages.settings.account_settings.change_password")}
            </Button>
          </form>
        )}
      </SettingsGroup>
    </div>
  );
}
