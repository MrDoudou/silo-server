import { Check, CheckCircle2, Play, Save, ShieldCheck } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { toast } from "@/i18n/toast";

import type {
  PolicyCompileIssue,
  PolicyDocument,
  PolicyValidateResult,
  PolicyVersion,
  PolicyVersionSummary,
} from "@/api/types";
import { RegoEditor } from "@/components/policy/RegoEditor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useActivatePolicyVersion,
  useCreatePolicyVersion,
  usePolicyDocument,
  usePolicyVersion,
  usePolicyVersions,
  useValidatePolicy,
} from "@/hooks/queries/admin/policy";
import { cn } from "@/lib/utils";

import { PolicySimulatePanel } from "./PolicySimulatePanel";
import { PolicyVersionHistory } from "./PolicyVersionHistory";
import { compileIssuesFromError, defaultPolicySource, messageFromError } from "./policyPageUtils";
import { PolicyStatusPill, policyDocumentStatus, policyDomainMeta } from "./policyPresentation";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

interface PolicyEditorPanelProps {
  documentId?: number;
  domains: readonly string[];
}

interface PolicyEditorStateProps {
  document: PolicyDocument;
  domains: readonly string[];
  initialSource: string;
  seedIsActive: boolean;
  seedVersion?: PolicyVersion;
  versions: readonly PolicyVersionSummary[];
  onStateChange: (state: EditorDirtyState) => void;
  newerSeed?: NewerSeedInfo;
}

interface EditorDirtyState {
  draft: string;
  pending: boolean;
}

interface NewerSeedInfo {
  versionNumber?: number;
  onAdopt: () => void;
}

interface PinnedSeed {
  documentId: number;
  key: string;
  initialSource: string;
  seedIsActive: boolean;
  seedVersion?: PolicyVersion;
}

interface ValidationState {
  source: string;
  result: PolicyValidateResult;
}

interface ActivationTarget {
  id: number;
  version_number: number;
}

type LifecycleStep = "validate" | "save" | "activate" | "live";

const LIFECYCLE_LABELS = [
  "pages.admin_policy.policy_editor_panel.draft",
  "pages.admin_policy.policy_editor_panel.validated",
  "pages.admin_policy.policy_editor_panel.saved",
  "pages.admin_policy.policy_editor_panel.live",
] as const;

function lifecycleProgress(step: LifecycleStep) {
  // Index of the first label that is NOT yet reached.
  switch (step) {
    case "validate":
      return 1;
    case "save":
      return 2;
    case "activate":
      return 3;
    case "live":
      return 4;
  }
}

function LifecycleRail({ step, liveVersion }: { step: LifecycleStep; liveVersion?: number }) {
  useUILanguage();
  const reached = lifecycleProgress(step);
  return (
    <ol
      aria-label={tr("pages.admin_policy.policy_editor_panel.policy_lifecycle")}
      className="flex flex-wrap items-center gap-1.5"
    >
      {LIFECYCLE_LABELS.map((label, index) => {
        const done = index < reached;
        const current = index === reached;
        return (
          <li key={label} className="flex items-center gap-1.5">
            {index > 0 && (
              <span
                aria-hidden
                className={cn("h-px w-4", done ? "bg-emerald-400/60" : "bg-border")}
              />
            )}
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                done && "bg-emerald-500/10 text-emerald-300",
                current && "bg-secondary text-foreground",
                !done && !current && "text-muted-foreground",
              )}
            >
              {done && <Check aria-hidden className="size-3" />}
              {label === "pages.admin_policy.policy_editor_panel.live" &&
              liveVersion !== undefined &&
              step === "live"
                ? tr("pages.admin_policy.policy_editor_panel.live_v_live_version", {
                    liveVersion: liveVersion,
                  })
                : tr(label)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function activationTargetFromVersion(version: PolicyVersionSummary | undefined) {
  if (!version || !version.compiled_ok) return undefined;
  return { id: version.id, version_number: version.version_number };
}

function issueKey(issue: PolicyCompileIssue, index: number) {
  return `${issue.row}-${issue.col}-${issue.message}-${index}`;
}

function seedKey(document: PolicyDocument, seedVersion: PolicyVersion | undefined) {
  return `${document.id}:${seedVersion?.id ?? "template"}:${
    seedVersion?.source_sha256 ?? document.domain
  }`;
}

export function PolicyEditorPanel({ documentId, domains }: PolicyEditorPanelProps) {
  useUILanguage();
  const documentQuery = usePolicyDocument(documentId);
  const versionsQuery = usePolicyVersions(documentId);
  const document = documentQuery.data;
  const latestVersionId =
    document?.active_version?.source !== undefined ? undefined : versionsQuery.data?.[0]?.id;
  const latestVersionQuery = usePolicyVersion(documentId, latestVersionId);
  const seedVersion: PolicyVersion | undefined =
    document?.active_version?.source !== undefined
      ? document.active_version
      : latestVersionQuery.data;
  const waitingForSeedSource = Boolean(
    document &&
    document.active_version?.source === undefined &&
    (versionsQuery.isLoading || (latestVersionId !== undefined && latestVersionQuery.isLoading)),
  );

  // The seed we are currently editing against. It only advances to a newer
  // server seed when doing so cannot discard unsaved work (see reconcile below),
  // so a background refetch never silently drops an admin's dirty draft.
  const [pinned, setPinned] = useState<PinnedSeed | null>(null);
  // Latest reported editor state, used only to decide whether an incoming seed
  // may replace the editor. PolicyEditorState is memoized, so reporting this
  // does not re-render the (heavy) editor subtree on every keystroke.
  const [editorState, setEditorState] = useState<EditorDirtyState | null>(null);

  if (!documentId) {
    return (
      <div className="surface-panel-subtle text-muted-foreground rounded-2xl p-6 text-sm">
        {tr("pages.admin_policy.policy_editor_panel.select_an_override_to_edit_its_rego_source")}
      </div>
    );
  }

  if (documentQuery.isLoading || waitingForSeedSource) {
    return (
      <p className="text-muted-foreground text-sm">
        {tr("pages.admin_policy.policy_editor_panel.loading_policy_document")}
      </p>
    );
  }

  if (!document) {
    return (
      <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm">
        {tr("pages.admin_policy.policy_editor_panel.policy_document_could_not_be_loaded")}
      </div>
    );
  }

  const fresh: PinnedSeed = {
    documentId: document.id,
    key: seedKey(document, seedVersion),
    initialSource: seedVersion?.source ?? defaultPolicySource(document.domain),
    seedIsActive: seedVersion !== undefined && seedVersion.id === document.active_version_id,
    seedVersion,
  };

  // Adopting `fresh` remounts the editor and resets the draft to fresh.initialSource.
  // That is safe when the editor has no unsaved work relative to the pinned seed,
  // or when the draft already equals the incoming source (e.g. right after the
  // admin activated their own version — nothing is lost). Otherwise we keep the
  // pinned seed mounted and surface the newer version as a non-destructive notice.
  // Switching documents always adopts: the draft belongs to the previous
  // document and must never ride along into another document's editor.
  const sameDocument = pinned !== null && pinned.documentId === document.id;
  const editorDirty =
    sameDocument &&
    pinned !== null &&
    editorState !== null &&
    (editorState.draft !== pinned.initialSource || editorState.pending);
  const safeToAdopt =
    !editorDirty || (editorState !== null && editorState.draft === fresh.initialSource);
  const shouldAdopt = pinned === null || !sameDocument || (pinned.key !== fresh.key && safeToAdopt);
  const effective = shouldAdopt ? fresh : pinned;
  const keepingPinned = !shouldAdopt && pinned.key !== fresh.key;

  if (shouldAdopt && pinned?.key !== fresh.key) {
    // setState during render: React re-renders before commit; the guard above
    // makes it a fixed point (next render pinned.key === fresh.key). Clearing
    // the reported editor state keeps a stale report from the outgoing editor
    // from blocking or mislabeling the next seed until the new editor reports.
    setPinned(fresh);
    setEditorState(null);
  }

  return (
    <PolicyEditorState
      key={effective.key}
      document={document}
      domains={domains}
      initialSource={effective.initialSource}
      seedIsActive={effective.seedIsActive}
      seedVersion={effective.seedVersion}
      versions={versionsQuery.data ?? []}
      onStateChange={setEditorState}
      newerSeed={
        keepingPinned
          ? { versionNumber: fresh.seedVersion?.version_number, onAdopt: () => setPinned(fresh) }
          : undefined
      }
    />
  );
}

const PolicyEditorState = memo(function PolicyEditorState({
  document,
  domains,
  initialSource,
  seedIsActive,
  seedVersion,
  versions,
  onStateChange,
  newerSeed,
}: PolicyEditorStateProps) {
  useUILanguage();
  const [draft, setDraft] = useState(initialSource);
  const [comment, setComment] = useState("");
  const [issues, setIssues] = useState<PolicyCompileIssue[]>([]);
  const [validation, setValidation] = useState<ValidationState | null>(null);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState<{ source: string; target: ActivationTarget } | undefined>();
  const [confirmActivate, setConfirmActivate] = useState(false);
  const validatePolicy = useValidatePolicy();
  const createVersion = useCreatePolicyVersion();
  const activateVersion = useActivatePolicyVersion();

  // Report the draft plus whether there is uncommitted work (a saved-but-not-yet
  // activated version, or a typed comment) so the panel can decide whether an
  // incoming seed may safely replace this editor.
  const pending = Boolean(saved) || comment.trim().length > 0;
  useEffect(() => {
    onStateChange({ draft, pending });
  }, [draft, pending, onStateChange]);

  const meta = policyDomainMeta(document.domain);
  const validated = validation?.source === draft && validation.result.compiled_ok;

  // An unedited seed from a compiled-but-inactive version is already "saved":
  // the remaining step is activation (e.g. after a page reload mid-flow).
  const seedSummary = versions.find((version) => version.id === seedVersion?.id);
  const savedTarget =
    saved?.source === draft
      ? saved.target
      : !seedIsActive && draft === initialSource
        ? activationTargetFromVersion(seedSummary)
        : undefined;

  const liveInSync = seedIsActive && draft === initialSource && !saved;
  const step: LifecycleStep = liveInSync
    ? "live"
    : savedTarget
      ? "activate"
      : validated
        ? "save"
        : "validate";

  async function validateDraft() {
    setMessage("");
    setIssues([]);
    try {
      const result = await validatePolicy.mutateAsync({
        domain: document.domain,
        source: draft,
      });
      setValidation({ source: draft, result });
      setIssues(result.errors);
      setMessage(
        result.compiled_ok
          ? tr("pages.admin_policy.policy_editor_panel.validation_passed_the_draft_compiles")
          : "",
      );
    } catch (error) {
      const nextIssues = compileIssuesFromError(error);
      setIssues(nextIssues);
      setValidation({
        source: draft,
        result: { compiled_ok: false, errors: nextIssues },
      });
      setMessage(nextIssues.length > 0 ? "" : messageFromError(error, "Validation failed."));
    }
  }

  async function saveVersion() {
    setMessage("");
    try {
      const result = await createVersion.mutateAsync({
        documentId: document.id,
        source: draft,
        comment,
      });
      if (result.compiled_ok) {
        setSaved({
          source: draft,
          target: { id: result.id, version_number: result.version_number },
        });
      }
      setComment("");
      toast.success("feedback.admin_policy.policy_editor_panel.saved_v_version", {
        values: { version: result.version_number },
      });
    } catch (error) {
      const nextIssues = compileIssuesFromError(error);
      setIssues(nextIssues);
      setMessage(
        nextIssues.length > 0
          ? tr(
              "pages.admin_policy.policy_editor_panel.the_server_rejected_this_draft_fix_the_issues_below",
            )
          : tr.error(
              "errors.admin_policy.policy_editor_panel.failed_to_save_policy_version",
              error,
            ),
      );
    }
  }

  async function activateSavedVersion() {
    if (!savedTarget) return;
    try {
      await activateVersion.mutateAsync({ documentId: document.id, version: savedTarget.id });
      setConfirmActivate(false);
      setSaved(undefined);
      toast.success("feedback.admin_policy.policy_editor_panel.v_version_is_now_live", {
        values: { version: savedTarget.version_number },
      });
    } catch (error) {
      toast.error("errors.admin_policy.policy_editor_panel.reported_message", {
        values: { message: messageFromError(error, "Failed to activate policy version") },
      });
    }
  }

  const primaryAction = (() => {
    switch (step) {
      case "validate":
        return (
          <Button type="button" onClick={validateDraft} disabled={validatePolicy.isPending}>
            <CheckCircle2 className="size-4" />
            {validatePolicy.isPending
              ? tr("pages.admin_policy.policy_editor_panel.validating")
              : tr("pages.admin_policy.policy_editor_panel.validate_draft")}
          </Button>
        );
      case "save":
        return (
          <Button type="button" onClick={saveVersion} disabled={createVersion.isPending}>
            <Save className="size-4" />
            {createVersion.isPending
              ? tr("pages.admin_policy.policy_editor_panel.saving")
              : tr("pages.admin_policy.policy_editor_panel.save_as_version")}
          </Button>
        );
      case "activate":
        return (
          <Button type="button" onClick={() => setConfirmActivate(true)}>
            <ShieldCheck className="size-4" />
            {tr("pages.admin_policy.policy_editor_panel.activate_v")}
            {savedTarget?.version_number}
          </Button>
        );
      case "live":
        return null;
    }
  })();

  return (
    <div className="space-y-5">
      <div className="surface-panel rounded-2xl border-0 p-4">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl font-semibold tracking-tight">{document.name}</h2>
              <span className="text-muted-foreground text-sm">{meta.title}</span>
              <PolicyStatusPill
                status={policyDocumentStatus(document)}
                versionNumber={document.active_version?.version_number}
              />
            </div>
            <LifecycleRail step={step} liveVersion={document.active_version?.version_number} />
          </div>

          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            {step !== "validate" && step !== "live" && (
              <Button
                type="button"
                variant="ghost"
                onClick={validateDraft}
                disabled={validatePolicy.isPending}
              >
                {tr("pages.admin_policy.policy_editor_panel.re_validate")}
              </Button>
            )}
            {primaryAction}
          </div>
        </div>

        {step === "live" && (
          <p className="text-muted-foreground mt-3 text-sm">
            {tr(
              "pages.admin_policy.policy_editor_panel.this_source_is_what_the_live_policy_runs_today_edit",
            )}
          </p>
        )}
        {!document.enabled && (
          <p className="text-warning mt-3 text-sm">
            {tr(
              "pages.admin_policy.policy_editor_panel.this_override_is_disabled_the_silo_baseline_applies_unchanged_until",
            )}
          </p>
        )}

        {newerSeed && (
          <div className="border-warning/40 bg-warning/10 mt-4 flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="text-warning">
              {newerSeed.versionNumber !== undefined
                ? tr(
                    "pages.admin_policy.policy_editor_panel.version_version_number_is_now_live_elsewhere",
                    {
                      versionNumber: newerSeed.versionNumber,
                    },
                  )
                : tr(
                    "pages.admin_policy.policy_editor_panel.a_newer_policy_is_now_live_elsewhere",
                  )}{" "}
              {tr(
                "pages.admin_policy.policy_editor_panel.loading_it_will_discard_your_unsaved_draft",
              )}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={newerSeed.onAdopt}
            >
              {tr("pages.admin_policy.policy_editor_panel.load_live_version")}
            </Button>
          </div>
        )}

        {step === "save" && (
          <div className="mt-4 max-w-lg">
            <Input
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={tr(
                "pages.admin_policy.policy_editor_panel.what_changed_optional_shown_in_history",
              )}
              aria-label={tr("pages.admin_policy.policy_editor_panel.policy_version_comment")}
            />
          </div>
        )}

        {message && (
          <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            {message}
          </div>
        )}

        {issues.length > 0 && (
          <div className="border-destructive/40 bg-destructive/10 text-destructive mt-4 rounded-lg border px-3 py-2">
            <h3 className="text-sm font-semibold">
              {tr("pages.admin_policy.policy_editor_panel.compile_issues")}
            </h3>
            <ul className="mt-2 space-y-1 text-xs">
              {issues.map((issue, index) => (
                <li key={issueKey(issue, index)}>
                  {issue.row > 0
                    ? tr("pages.admin_policy.policy_editor_panel.row_col", {
                        row: issue.row,
                        col: issue.col,
                      })
                    : ""}
                  {tr.remote({ message: issue.message })}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <RegoEditor value={draft} onChange={setDraft} issues={issues} height="520px" />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.7fr)]">
        <PolicySimulatePanel domains={domains} domain={document.domain} source={draft} />
        <PolicyVersionHistory
          documentId={document.id}
          activeVersionId={document.active_version_id}
        />
      </div>

      <AlertDialog open={confirmActivate} onOpenChange={setConfirmActivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tr("pages.admin_policy.policy_editor_panel.make_v")}
              {savedTarget?.version_number}{" "}
              {tr("pages.admin_policy.policy_editor_panel.the_live_policy")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tr(
                "pages.admin_policy.policy_editor_panel.new_requests_start_using_it_immediately_on_every_server_node",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("common.actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={activateSavedVersion} disabled={activateVersion.isPending}>
              <Play className="size-4" />
              {tr("pages.admin_policy.policy_editor_panel.go_live")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});
