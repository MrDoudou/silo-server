import { useWizardContext } from "./WizardContext";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

export interface StepDef {
  id: string;
  label: string;
  complete: boolean;
  active: boolean;
}

export type WizardStepId =
  | "account"
  | "profile"
  | "server"
  | "integrations"
  | "downloads"
  | "recommendations"
  | "library"
  | "nodes";

export function useWizardSteps() {
  useUILanguage();
  const { user, profiles, stepDone } = useWizardContext();

  const accountComplete = !!user;
  const profileComplete = profiles.length > 0;
  const libraryDone = stepDone.library;

  const currentStep: WizardStepId = !accountComplete
    ? "account"
    : !profileComplete
      ? "profile"
      : !stepDone.server
        ? "server"
        : !stepDone.integrations
          ? "integrations"
          : !stepDone.downloads
            ? "downloads"
            : !stepDone.recommendations
              ? "recommendations"
              : !libraryDone
                ? "library"
                : "nodes";

  const steps: StepDef[] = [
    {
      id: "account",
      label: tr("pages.setup_wizard.use_wizard_steps.account"),
      complete: accountComplete,
      active: currentStep === "account",
    },
    {
      id: "profile",
      label: tr("pages.setup_wizard.use_wizard_steps.profile"),
      complete: profileComplete,
      active: currentStep === "profile",
    },
    {
      id: "server",
      label: tr("pages.setup_wizard.use_wizard_steps.server"),
      complete: stepDone.server,
      active: currentStep === "server",
    },
    {
      id: "integrations",
      label: tr("pages.setup_wizard.use_wizard_steps.integrations"),
      complete: stepDone.integrations,
      active: currentStep === "integrations",
    },
    {
      id: "downloads",
      label: tr("pages.setup_wizard.use_wizard_steps.downloads"),
      complete: stepDone.downloads,
      active: currentStep === "downloads",
    },
    {
      id: "recommendations",
      label: tr("pages.setup_wizard.use_wizard_steps.recs"),
      complete: stepDone.recommendations,
      active: currentStep === "recommendations",
    },
    {
      id: "library",
      label: tr("pages.setup_wizard.use_wizard_steps.library"),
      complete: libraryDone,
      active: currentStep === "library",
    },
    {
      id: "nodes",
      label: tr("pages.setup_wizard.use_wizard_steps.finish"),
      complete: false,
      active: currentStep === "nodes",
    },
  ];

  return { steps, currentStep };
}
