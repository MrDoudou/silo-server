import { ArrowRight, PackageCheck, PenLine, ScrollText } from "lucide-react";
import { useSearchParams } from "react-router";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePolicyCapability } from "@/hooks/queries/admin/policy";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

import { PolicyDecisionLogTable } from "./PolicyDecisionLogTable";
import { PolicyDocumentList } from "./PolicyDocumentList";
import { PolicyVendorViewer } from "./PolicyVendorViewer";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

// Tab ids are stable URL contract (?tab=); labels are presentation only.
const POLICY_TABS = new Set(["documents", "vendor", "decisions"]);

function resolveTab(value: string | null) {
  return value && POLICY_TABS.has(value) ? value : "documents";
}

const PIPELINE_STEPS = [
  {
    icon: PackageCheck,
    get title() {
      return tr("pages.admin_policy.admin_policy_layout.silo_decides_the_baseline");
    },
    get detail() {
      return tr(
        "pages.admin_policy.admin_policy_layout.built_in_rules_ship_with_every_release_profile_restrictions_ratings",
      );
    },
  },
  {
    icon: PenLine,
    get title() {
      return tr("pages.admin_policy.admin_policy_layout.your_overrides_narrow_it");
    },
    get detail() {
      return tr(
        "pages.admin_policy.admin_policy_layout.custom_rules_can_tighten_the_baseline_never_grant_more_than",
      );
    },
  },
  {
    icon: ScrollText,
    get title() {
      return tr("pages.admin_policy.admin_policy_layout.every_decision_is_logged");
    },
    get detail() {
      return tr(
        "pages.admin_policy.admin_policy_layout.denials_are_always_recorded_allowed_requests_are_sampled",
      );
    },
  },
] as const;

function PolicyPipelineStrip() {
  useUILanguage();
  return (
    <div className="surface-panel-subtle rounded-2xl p-4">
      <ol className="grid gap-4 md:grid-cols-3">
        {PIPELINE_STEPS.map((step, index) => (
          <li key={step.title} className="relative flex items-start gap-3">
            <step.icon aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{step.title}</p>
              <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">{step.detail}</p>
            </div>
            {index < PIPELINE_STEPS.length - 1 && (
              <ArrowRight
                aria-hidden
                className="text-muted-foreground/50 absolute top-1 -right-3 hidden size-4 md:block"
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function AdminPolicyLayout() {
  useUILanguage();
  useDocumentTitle(tr("pages.admin_policy.admin_policy_layout.policy"));
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = resolveTab(searchParams.get("tab"));
  const capability = usePolicyCapability();

  function setTab(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value === "documents") {
      next.delete("tab");
    } else {
      next.set("tab", value);
      next.delete("document");
    }
    setSearchParams(next, { replace: true });
  }

  const unavailable =
    capability.isError ||
    capability.data?.enabled === false ||
    capability.data?.editor_available === false;

  return (
    <div className="page-shell space-y-6 py-4 sm:py-6">
      <div className="page-header gap-5">
        <div className="space-y-3">
          <h1 className="page-title text-[clamp(2rem,4vw,3rem)]">
            {tr("pages.admin_policy.admin_policy_layout.policy")}
          </h1>
          <p className="page-subtitle text-sm sm:text-base">
            {tr(
              "pages.admin_policy.admin_policy_layout.household_access_rules_what_silo_allows_by_default_and_where",
            )}
          </p>
        </div>
      </div>

      {capability.isLoading && (
        <p className="text-muted-foreground text-sm">
          {tr("pages.admin_policy.admin_policy_layout.loading_policy_capability")}
        </p>
      )}

      {unavailable && (
        <div className="surface-panel-subtle rounded-2xl p-6">
          <h2 className="text-lg font-semibold">
            {tr("pages.admin_policy.admin_policy_layout.policy_workspace_unavailable")}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {tr(
              "pages.admin_policy.admin_policy_layout.the_policy_engine_or_editor_api_is_not_available_from",
            )}
          </p>
        </div>
      )}

      {capability.data && !unavailable && (
        <>
          <PolicyPipelineStrip />

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="documents">
                {tr("pages.admin_policy.admin_policy_layout.overrides")}
              </TabsTrigger>
              <TabsTrigger value="vendor">
                {tr("pages.admin_policy.admin_policy_layout.baseline")}
              </TabsTrigger>
              <TabsTrigger value="decisions">
                {tr("pages.admin_policy.admin_policy_layout.decision_log")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="documents" className="space-y-5">
              <PolicyDocumentList domains={capability.data.decision_types} />
            </TabsContent>
            <TabsContent value="vendor" className="space-y-5">
              <PolicyVendorViewer />
            </TabsContent>
            <TabsContent value="decisions" className="space-y-5">
              <PolicyDecisionLogTable domains={capability.data.decision_types} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
