import { Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSimulatePolicy } from "@/hooks/queries/admin/policy";

import { exampleInputForDomain } from "./policyExamples";
import {
  compileIssuesFromError,
  formatPolicyDomain,
  formatPolicyEvalMicros,
  prettyPolicyJson,
} from "./policyPageUtils";
import { useUILanguage } from "@/i18n/uiText";

import { tr } from "@/i18n/translate";

interface PolicySimulatePanelProps {
  domains: readonly string[];
  domain?: string;
  source?: string;
}

/**
 * Compact human verdict for a simulated decision. Permission/action decisions
 * carry an `allowed` boolean; scope decisions are summarized by their
 * ceilings. Unknown shapes render nothing — the raw JSON below is the truth.
 */
function SimulateVerdict({ decision }: { decision: unknown }) {
  useUILanguage();
  let parsed: unknown = decision;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;

  if (typeof record.allowed === "boolean") {
    return record.allowed ? (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
        <span aria-hidden className="size-1.5 rounded-full bg-emerald-400" />
        {tr("pages.admin_policy.policy_simulate_panel.allowed")}
      </span>
    ) : (
      <span className="bg-destructive/10 text-destructive inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium">
        <span aria-hidden className="bg-destructive size-1.5 rounded-full" />
        {tr("pages.admin_policy.policy_simulate_panel.denied")}
        {typeof record.reason === "string" && record.reason
          ? tr("pages.admin_policy.policy_simulate_panel.reason", { reason: record.reason })
          : ""}
      </span>
    );
  }

  if (typeof record.unrestricted === "boolean") {
    const rating = typeof record.max_content_rating === "string" ? record.max_content_rating : "";
    const quality =
      typeof record.max_playback_quality === "string" ? record.max_playback_quality : "";
    const parts = [
      record.unrestricted ? "All libraries" : "Restricted libraries",
      rating ? `rating ≤ ${rating}` : "any rating",
      quality ? `quality ≤ ${quality}` : "any quality",
    ];
    return (
      <span className="bg-secondary text-foreground/80 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium">
        {parts.join(" · ")}
      </span>
    );
  }

  return null;
}

export function PolicySimulatePanel({ domains, domain, source }: PolicySimulatePanelProps) {
  useUILanguage();
  const fallbackDomain = domain || domains[0] || "scope";
  const [selectedDomain, setSelectedDomain] = useState(fallbackDomain);
  const [input, setInput] = useState(() => exampleInputForDomain(fallbackDomain));
  const [error, setError] = useState("");
  const [issues, setIssues] = useState(compileIssuesFromError(null));
  const simulate = useSimulatePolicy();

  useEffect(() => {
    setSelectedDomain(fallbackDomain);
    setInput(exampleInputForDomain(fallbackDomain));
  }, [fallbackDomain]);

  const resultJson = useMemo(
    () => prettyPolicyJson(simulate.data?.decision),
    [simulate.data?.decision],
  );

  async function runSimulation() {
    setError("");
    setIssues([]);

    let parsedInput: unknown;
    try {
      parsedInput = JSON.parse(input);
    } catch {
      setError(tr("pages.admin_policy.policy_simulate_panel.simulation_input_must_be_valid_json"));
      return;
    }

    try {
      await simulate.mutateAsync({
        domain: selectedDomain,
        source: source?.trim() ? source : undefined,
        input: parsedInput,
      });
    } catch (err) {
      const nextIssues = compileIssuesFromError(err);
      setIssues(nextIssues);
      setError(
        nextIssues.length > 0
          ? tr("pages.admin_policy.policy_simulate_panel.policy_did_not_compile_for_simulation")
          : tr.error("errors.admin_policy.policy_simulate_panel.simulation_failed", err),
      );
    }
  }

  return (
    <div className="surface-panel-subtle space-y-4 rounded-2xl p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h3 className="text-sm font-semibold">
            {tr("pages.admin_policy.policy_simulate_panel.test_before_going_live")}
          </h3>
          <p className="text-muted-foreground mt-1 text-xs">
            {tr(
              "pages.admin_policy.policy_simulate_panel.runs_the_current_draft_against_a_sample_request_nothing_is",
            )}
          </p>
        </div>
        <Button type="button" size="sm" onClick={runSimulation} disabled={simulate.isPending}>
          <Play className="size-4" />
          {simulate.isPending
            ? tr("pages.admin_policy.policy_simulate_panel.running")
            : tr("pages.admin_policy.policy_simulate_panel.run")}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
        <div className="space-y-2">
          <Label htmlFor="policy-sim-domain">
            {tr("pages.admin_policy.policy_simulate_panel.domain")}
          </Label>
          <Select
            value={selectedDomain}
            onValueChange={(value) => {
              setSelectedDomain(value);
              setInput(exampleInputForDomain(value));
            }}
          >
            <SelectTrigger id="policy-sim-domain" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(domains.length ? domains : [selectedDomain]).map((item) => (
                <SelectItem key={item} value={item}>
                  {formatPolicyDomain(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="policy-sim-input">
            {tr("pages.admin_policy.policy_simulate_panel.input_json")}
          </Label>
          <textarea
            id="policy-sim-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            className="border-border bg-background focus-visible:ring-ring/60 min-h-[220px] w-full rounded-lg border px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2"
            spellCheck={false}
          />
        </div>
      </div>

      {error && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {issues.length > 0 && (
        <ul className="text-destructive space-y-1 text-xs">
          {issues.map((issue, index) => (
            <li key={`${issue.row}-${issue.col}-${index}`}>
              {issue.row > 0
                ? tr("pages.admin_policy.policy_simulate_panel.row_col", {
                    row: issue.row,
                    col: issue.col,
                  })
                : ""}
              {tr.remote({ message: issue.message })}
            </li>
          ))}
        </ul>
      )}

      {simulate.data && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <SimulateVerdict decision={simulate.data.decision} />
            <span className="text-muted-foreground text-xs">
              {tr("pages.admin_policy.policy_simulate_panel.decided_in")}{" "}
              {formatPolicyEvalMicros(simulate.data.eval_time_ns)}
            </span>
          </div>
          <pre className="border-border bg-background max-h-[300px] overflow-auto rounded-lg border p-3 font-mono text-xs">
            {resultJson}
          </pre>
        </div>
      )}
    </div>
  );
}
