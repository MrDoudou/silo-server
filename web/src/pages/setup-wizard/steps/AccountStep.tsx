import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/i18n/toast";
import { useWizardContext } from "../WizardContext";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

export function AccountStep() {
  useUILanguage();
  const { setupInitialUser } = useWizardContext();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("errors.auth.passwords_do_not_match");
      return;
    }

    setSubmitting(true);
    try {
      await setupInitialUser(username, email, password);
      toast.success("feedback.setup_wizard.steps.account_step.admin_account_created");
    } catch (err) {
      toast.error("errors.setup.admin_account_create_failed", { error: err });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="setup-email" className="text-xs">
          {tr("pages.setup_wizard.steps.account_step.email")}
        </Label>
        <Input
          id="setup-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="setup-username" className="text-xs">
            {tr("pages.setup_wizard.steps.account_step.username")}
          </Label>
          <Input
            id="setup-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="setup-password" className="text-xs">
            {tr("pages.setup_wizard.steps.account_step.password")}
          </Label>
          <Input
            id="setup-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="setup-confirm-password" className="text-xs">
          {tr("pages.setup_wizard.steps.account_step.confirm_password")}
        </Label>
        <Input
          id="setup-confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
      </div>
      <div className="pt-3">
        <Button type="submit" disabled={submitting}>
          {submitting
            ? tr("pages.setup_wizard.steps.account_step.creating")
            : tr("pages.setup_wizard.steps.account_step.create_account")}
        </Button>
      </div>
    </form>
  );
}
