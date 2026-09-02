import { useState, useMemo } from "react";
import type { FormEvent } from "react";
import type { ConnectionCheckResponse } from "@/api/types";
import { ConnectionCheckAction } from "@/components/admin/ConnectionCheckAction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/i18n/toast";
import { useCheckAdminSettingsConnection } from "@/hooks/queries/admin/settings";
import { useSettingsForm } from "@/hooks/useSettingsForm";

import {
  RECOMMENDATION_PROVIDER_OPTIONS,
  type RecommendationProviderPreset,
} from "@/lib/recommendation-provider-presets";
import { useWizardContext } from "../WizardContext";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

const KEYS = [
  "recommendations.enabled",
  "recommendations.embedding_base_url",
  "recommendations.embedding_model",
  "recommendations.embedding_auth_token",
];

export function RecommendationsStep() {
  useUILanguage();
  const { markDone } = useWizardContext();
  const form = useSettingsForm({ keys: useMemo(() => KEYS, []) });
  const checkConnection = useCheckAdminSettingsConnection();
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [connectionResult, setConnectionResult] = useState<ConnectionCheckResponse | null>(null);

  function applyPreset(preset: RecommendationProviderPreset) {
    setSelectedPreset(preset.id);
    form.setValue("recommendations.embedding_base_url", preset.baseUrl);
    form.setValue("recommendations.embedding_model", preset.model);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (form.dirtyCount === 0) {
      markDone("recommendations");
      return;
    }
    setSubmitting(true);
    try {
      await form.save();
      markDone("recommendations");
      toast.success(
        "feedback.setup_wizard.steps.recommendations_step.recommendations_settings_saved",
      );
    } catch (err) {
      toast.error("errors.setup.recommendations_save_failed", { error: err });
    } finally {
      setSubmitting(false);
    }
  }

  function handleSkip() {
    markDone("recommendations");
  }

  async function handleCheckConnection() {
    try {
      setConnectionResult(
        await checkConnection.mutateAsync({
          kind: "recommendations_embedding",
          body: form.buildConnectionCheckRequest(KEYS),
        }),
      );
    } catch (error) {
      setConnectionResult({
        success: false,
        message: tr.error("errors.setup.connection_check_failed", error),
      });
    }
  }

  if (form.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  const activePreset = RECOMMENDATION_PROVIDER_OPTIONS.find(
    (preset) => preset.id === selectedPreset,
  );
  const showToken =
    activePreset?.needsToken ?? form.getValue("recommendations.embedding_auth_token") !== "";
  const enabled = form.getValue("recommendations.enabled") === "true";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Enable toggle */}
      <div className="border-foreground/[0.07] bg-foreground/[0.03] flex items-center justify-between rounded-xl border px-4 py-3.5">
        <Label htmlFor="recs-enabled" className="text-sm font-medium">
          {tr("pages.setup_wizard.steps.recommendations_step.enable_recommendations")}
        </Label>
        <Switch
          id="recs-enabled"
          checked={enabled}
          onCheckedChange={(v) => form.setValue("recommendations.enabled", v ? "true" : "false")}
        />
      </div>

      {enabled && (
        <div className="animate-[fade-in_0.15s_ease-out] space-y-4">
          {/* Provider presets */}
          <div className="space-y-3">
            <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.1em] uppercase">
              {tr("pages.setup_wizard.steps.recommendations_step.provider")}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {RECOMMENDATION_PROVIDER_OPTIONS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={
                    "relative rounded-lg border px-3 py-2.5 text-left transition-all " +
                    (selectedPreset === preset.id
                      ? "border-foreground/20 bg-foreground/10 text-foreground"
                      : "border-foreground/[0.07] bg-foreground/[0.03] text-foreground/60 hover:border-foreground/[0.12] hover:text-foreground/80")
                  }
                >
                  <span className="text-sm font-medium">{preset.label}</span>
                  {preset.tag && (
                    <span
                      className={
                        "mt-0.5 block text-[10px] " +
                        (selectedPreset === preset.id
                          ? "text-foreground/50"
                          : "text-muted-foreground")
                      }
                    >
                      {preset.tag}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {activePreset && (
              <p className="text-muted-foreground text-xs">{activePreset.description}</p>
            )}
          </div>

          {/* Configuration fields */}
          <div className="border-foreground/[0.07] bg-foreground/[0.03] space-y-3 rounded-xl border p-4">
            <div className="space-y-1.5">
              <Label htmlFor="recs-url" className="text-xs">
                {tr("pages.setup_wizard.steps.recommendations_step.base_url")}
              </Label>
              <Input
                id="recs-url"
                value={form.getValue("recommendations.embedding_base_url")}
                onChange={(e) =>
                  form.setValue("recommendations.embedding_base_url", e.target.value)
                }
                placeholder={tr(
                  "pages.setup_wizard.steps.recommendations_step.https_generativelanguage_googleapis_com",
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="recs-model" className="text-xs">
                {tr("pages.setup_wizard.steps.recommendations_step.model")}
              </Label>
              <Input
                id="recs-model"
                value={form.getValue("recommendations.embedding_model")}
                onChange={(e) => form.setValue("recommendations.embedding_model", e.target.value)}
                placeholder={tr(
                  "pages.setup_wizard.steps.recommendations_step.gemini_embedding_001",
                )}
              />
            </div>
            {showToken && (
              <div className="space-y-1.5">
                <Label htmlFor="recs-token" className="text-xs">
                  {tr("pages.setup_wizard.steps.recommendations_step.api_key")}
                </Label>
                <Input
                  id="recs-token"
                  type="password"
                  value={form.getValue("recommendations.embedding_auth_token")}
                  onChange={(e) =>
                    form.setValue("recommendations.embedding_auth_token", e.target.value)
                  }
                  placeholder={
                    form.sensitiveConfigured.includes("recommendations.embedding_auth_token")
                      ? tr("pages.setup_wizard.steps.recommendations_step.configured")
                      : tr("pages.setup_wizard.steps.recommendations_step.enter_api_key")
                  }
                />
              </div>
            )}
            <ConnectionCheckAction
              onClick={handleCheckConnection}
              result={connectionResult}
              isPending={checkConnection.isPending}
              disabled={submitting || form.isSaving}
            />
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={submitting || form.isSaving}>
          {submitting || form.isSaving
            ? tr("pages.setup_wizard.steps.recommendations_step.saving")
            : tr("pages.setup_wizard.steps.recommendations_step.save_continue")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={handleSkip}
          disabled={submitting || form.isSaving}
        >
          {tr("common.actions.skip")}
        </Button>
      </div>
    </form>
  );
}
