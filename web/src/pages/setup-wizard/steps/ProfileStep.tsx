import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "@/api/client";
import type { CreateProfileRequest, Profile } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/i18n/toast";
import { useWizardContext } from "../WizardContext";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

export function ProfileStep() {
  useUILanguage();
  const { selectProfile, refetchProfiles } = useWizardContext();
  const [profileName, setProfileName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body: CreateProfileRequest = { name: profileName };
      const created = await api<Profile>("/profiles", {
        method: "POST",
        body: JSON.stringify(body),
      });
      selectProfile(created);
      refetchProfiles();
      toast.success("feedback.setup_wizard.steps.profile_step.profile_created");
    } catch (err) {
      toast.error("errors.setup.profile_create_failed", { error: err });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="setup-profile-name" className="text-xs">
          {tr("pages.setup_wizard.steps.profile_step.name")}
        </Label>
        <Input
          id="setup-profile-name"
          value={profileName}
          onChange={(e) => setProfileName(e.target.value)}
          placeholder={tr("pages.setup_wizard.steps.profile_step.alex")}
          required
        />
      </div>
      <div className="pt-3">
        <Button type="submit" disabled={submitting}>
          {submitting
            ? tr("pages.setup_wizard.steps.profile_step.creating")
            : tr("pages.setup_wizard.steps.profile_step.create_profile")}
        </Button>
      </div>
    </form>
  );
}
