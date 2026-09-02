import { ChevronRight } from "lucide-react";

import type { PolicyVendorModule } from "@/api/types";
import { RegoEditor } from "@/components/policy/RegoEditor";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { usePolicyVendor } from "@/hooks/queries/admin/policy";

import { policyDomainMeta } from "./policyPresentation";
import { groupVendorModules, parseRankLadder, type LadderTier } from "./vendorBaseline";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

const DOMAIN_ORDER = ["scope", "permission", "action"] as const;

function ModuleSourceAccordion({ module }: { module: PolicyVendorModule }) {
  useUILanguage();
  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="source" className="border-0">
        <AccordionTrigger className="text-muted-foreground py-2 text-xs font-medium hover:no-underline [&>svg]:hidden">
          <span className="inline-flex items-center gap-1">
            <ChevronRight aria-hidden className="size-3.5 transition-transform" />
            {tr("pages.admin_policy.policy_vendor_viewer.view_rego_source")}
            <span className="font-mono font-normal">({module.path})</span>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <RegoEditor value={module.source} readOnly height="320px" />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function Ladder({ tiers, caption }: { tiers: LadderTier[]; caption: string }) {
  useUILanguage();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5" role="list" aria-label={caption}>
        {tiers.map((tier, index) => (
          <div key={tier.rank} className="flex items-center gap-1.5" role="listitem">
            {index > 0 && (
              <ChevronRight aria-hidden className="text-muted-foreground/50 size-3.5" />
            )}
            <span className="bg-secondary text-foreground/85 rounded-md px-2 py-1 font-mono text-xs">
              {tier.labels.join(" · ")}
            </span>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">{caption}</p>
    </div>
  );
}

interface LadderCardProps {
  title: string;
  caption: string;
  module: PolicyVendorModule;
}

function LadderCard({ title, caption, module }: LadderCardProps) {
  useUILanguage();
  const tiers = parseRankLadder(module.source);
  return (
    <section className="surface-panel-subtle rounded-2xl p-5">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3">
        {tiers ? (
          <Ladder tiers={tiers} caption={caption} />
        ) : (
          <p className="text-muted-foreground text-xs">
            {tr(
              "pages.admin_policy.policy_vendor_viewer.the_tier_table_could_not_be_summarized_see_the_source",
            )}
          </p>
        )}
      </div>
      <div className="mt-2">
        <ModuleSourceAccordion module={module} />
      </div>
    </section>
  );
}

export function PolicyVendorViewer() {
  useUILanguage();
  const { data: modules, isLoading, error } = usePolicyVendor();

  if (isLoading) {
    return (
      <p className="text-muted-foreground text-sm">
        {tr("pages.admin_policy.policy_vendor_viewer.loading_vendor_policy_modules")}
      </p>
    );
  }

  if (error) {
    return (
      <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm">
        {tr("pages.admin_policy.policy_vendor_viewer.failed_to_load_vendor_policy_modules")}
      </div>
    );
  }

  if (!modules?.length) {
    return (
      <div className="surface-panel-subtle text-muted-foreground rounded-2xl p-6 text-sm">
        {tr("pages.admin_policy.policy_vendor_viewer.no_vendor_policy_modules_are_available")}
      </div>
    );
  }

  const grouped = groupVendorModules(modules);

  return (
    <div className="space-y-5">
      <p className="text-muted-foreground max-w-prose text-sm">
        {tr(
          "pages.admin_policy.policy_vendor_viewer.these_rules_ship_with_each_silo_release_and_always_apply",
        )}
      </p>

      {DOMAIN_ORDER.map((domain) => {
        const module = grouped.domains.get(domain);
        if (!module) return null;
        const meta = policyDomainMeta(domain);
        return (
          <section key={domain} className="surface-panel rounded-2xl border-0 p-5">
            <div className="flex items-start gap-3">
              <div className="bg-secondary text-secondary-foreground rounded-xl p-2.5">
                <meta.icon aria-hidden className="size-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold tracking-tight">{meta.title}</h2>
                <ul className="text-foreground/85 mt-3 space-y-2 text-sm">
                  {meta.baseline.map((rule) => (
                    <li key={rule} className="flex gap-2.5">
                      <span
                        aria-hidden
                        className="bg-muted-foreground/40 mt-[7px] size-1.5 shrink-0 rounded-full"
                      />
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
                {meta.overrideCan && (
                  <p className="text-muted-foreground border-border mt-4 border-l-2 pl-3 text-xs leading-relaxed">
                    {meta.overrideCan}
                  </p>
                )}
                <div className="mt-3">
                  <ModuleSourceAccordion module={module} />
                </div>
              </div>
            </div>
          </section>
        );
      })}

      <div className="grid gap-5 lg:grid-cols-2">
        {grouped.ratings && (
          <LadderCard
            title={tr("pages.admin_policy.policy_vendor_viewer.content_rating_tiers")}
            caption="A ceiling admits its own tier and everything before it. Unrated ceilings admit everything; unknown ratings are hidden once a ceiling is set."
            module={grouped.ratings}
          />
        )}
        {grouped.quality && (
          <LadderCard
            title={tr("pages.admin_policy.policy_vendor_viewer.playback_quality_tiers")}
            caption="File resolutions are ranked left to right; a ceiling admits files at or below it. Ceiling presets normalize to 1080p or 4K."
            module={grouped.quality}
          />
        )}
      </div>

      {grouped.other.map((module) => (
        <section key={module.path} className="surface-panel-subtle rounded-2xl p-5">
          <h3 className="font-mono text-sm font-semibold">{module.path}</h3>
          <div className="mt-3">
            <RegoEditor value={module.source} readOnly height="320px" />
          </div>
        </section>
      ))}
    </div>
  );
}
