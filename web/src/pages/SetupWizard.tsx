import { Navigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { WizardProvider, useWizardContext } from "./setup-wizard/WizardContext";
import { useWizardSteps } from "./setup-wizard/useWizardSteps";
import { StepIndicator } from "./setup-wizard/StepIndicator";
import { AccountStep } from "./setup-wizard/steps/AccountStep";
import { ProfileStep } from "./setup-wizard/steps/ProfileStep";
import { LibraryStep } from "./setup-wizard/steps/LibraryStep";
import { ServerStorageStep } from "./setup-wizard/steps/ServerStorageStep";
import { IntegrationsStep } from "./setup-wizard/steps/IntegrationsStep";
import { DownloadsStep } from "./setup-wizard/steps/DownloadsStep";
import { RecommendationsStep } from "./setup-wizard/steps/RecommendationsStep";
import { NodesFinishStep } from "./setup-wizard/steps/NodesFinishStep";
import type { WizardStepId } from "./setup-wizard/useWizardSteps";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

const STEP_TITLES: Record<WizardStepId, string> = {
  account: "pages.setup_wizard.create_your_account",
  profile: "pages.setup_wizard.add_a_profile",
  server: "pages.setup_wizard.server_storage",
  integrations: "pages.setup_wizard.integrations",
  downloads: "pages.setup_wizard.downloads",
  recommendations: "pages.setup_wizard.recommendations",
  library: "pages.setup_wizard.add_a_library",
  nodes: "pages.setup_wizard.you_re_all_set",
};

const STEP_DESCRIPTIONS: Record<WizardStepId, string> = {
  account: "pages.setup_wizard.this_will_be_the_admin_account_for_managing_your_server",
  profile: "pages.setup_wizard.profiles_let_different_people_track_their_own_watch_history_and",
  server: "pages.setup_wizard.configure_core_infrastructure_all_fields_are_optional_and_can_be",
  integrations:
    "pages.setup_wizard.configure_subtitle_providers_for_automatic_subtitle_downloading",
  downloads: "pages.setup_wizard.allow_users_to_download_media_files_for_offline_viewing",
  recommendations:
    "pages.setup_wizard.ai_powered_recommendations_using_embeddings_requires_pgvector",
  library: "pages.setup_wizard.point_silo_at_your_media_files_you_can_add_more",
  nodes: "pages.setup_wizard.silo_is_ready_start_exploring_or_fine_tune_in_admin",
};

function WizardContent() {
  useUILanguage();
  const { user, profiles, librariesLoading, profilesLoading } = useWizardContext();
  const { steps, currentStep } = useWizardSteps();
  const isAdmin = user?.role === "admin";
  const profileComplete = profiles.length > 0;

  if (profilesLoading || (user && profileComplete && isAdmin && librariesLoading)) {
    return (
      <div className="auth-shell items-start py-10 sm:py-14">
        <div className="glass panel-border relative z-1 w-full max-w-2xl rounded-2xl p-7 sm:p-10">
          <div className="space-y-3">
            <div className="flex gap-1">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-foreground/[0.06] h-1 flex-1 rounded-full" />
              ))}
            </div>
            <div className="bg-foreground/[0.06] h-3 w-32 animate-pulse rounded" />
          </div>
          <div className="bg-foreground/[0.06] mt-8 h-8 w-48 animate-pulse rounded" />
          <div className="bg-foreground/[0.06] mt-3 h-4 w-72 animate-pulse rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell items-start py-10 sm:py-14">
      <div className="glass panel-border relative z-1 w-full max-w-2xl rounded-2xl p-7 sm:p-10">
        {/* Header */}
        <div className="mb-10">
          <StepIndicator steps={steps} />
          <h1 className="text-foreground mt-6 text-[1.7rem] leading-tight font-bold tracking-[-0.03em] sm:text-3xl">
            {tr(STEP_TITLES[currentStep])}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            {tr(STEP_DESCRIPTIONS[currentStep])}
          </p>
        </div>

        {/* Step content — keyed to trigger entrance animation on step change */}
        <div key={currentStep} className="animate-[fade-in_0.25s_ease-out]">
          {currentStep === "account" && <AccountStep />}
          {currentStep === "profile" && <ProfileStep />}
          {currentStep === "library" && <LibraryStep />}
          {currentStep === "server" && <ServerStorageStep />}
          {currentStep === "integrations" && <IntegrationsStep />}
          {currentStep === "downloads" && <DownloadsStep />}
          {currentStep === "recommendations" && <RecommendationsStep />}
          {currentStep === "nodes" && <NodesFinishStep />}
        </div>
      </div>
    </div>
  );
}

export default function SetupWizard() {
  useUILanguage();
  const { user, loading, setupLoading, setupRequired } = useAuth();
  useDocumentTitle(tr("pages.setup_wizard.setup"));

  if (loading || setupLoading) {
    return (
      <div className="text-muted-foreground p-8 text-sm">{tr("pages.setup_wizard.loading")}</div>
    );
  }

  if (!setupRequired && !user) {
    return <Navigate to="/login" replace />;
  }

  if (user && user.role !== "admin") {
    return <Navigate to="/profiles" replace />;
  }

  return (
    <WizardProvider>
      <WizardContent />
    </WizardProvider>
  );
}
