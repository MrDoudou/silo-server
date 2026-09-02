import { useState } from "react";
import { CheckCircle2, Plus, XCircle } from "lucide-react";

import type { AutoscanConnectionTestInput, AutoscanConnectionTestResult } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateAutoscanConnection,
  useTestAutoscanConnection,
} from "@/hooks/queries/useAutoscan";
import { useRequestIntegrations } from "@/hooks/queries/useRequests";
import type { RequestIntegration } from "@/api/types";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

export interface ConnectionOption {
  id: string;
  name: string;
  kind: string;
  /** Set when this connection is a live link to a Requests integration. */
  requestIntegrationId?: string | null;
}

/** Sentinel values for the picker's non-connection choices. */
const NONE = "__none__";
const ADD_NEW = "__add__";

/** The arr service kind lives in plugin_config; it is the sole source of truth. */
function integrationKind(integration: RequestIntegration): string {
  const kind = integration.plugin_config?.["service_kind"];
  return typeof kind === "string" ? kind : "";
}

/**
 * Connection selector for the Add-source flow, with inline creation.
 *
 * Previously an operator who had not yet made a connection hit a dead end here:
 * the dropdown offered only "no connection", so they had to cancel, create one
 * under Advanced, and start the flow again. A connection is nullable and only
 * read at poll time, so creating one mid-flow is safe and needs no new API.
 *
 * When Requests already holds a matching Sonarr/Radarr, that is offered first —
 * Silo has the credentials, so asking for them again is pure duplication.
 */
export function InlineConnectionPicker({
  value,
  onChange,
  options,
  required,
  connectionKinds,
  idPrefix = "conn",
}: {
  /** Selected connection id, or "" for none. */
  value: string;
  onChange: (connectionId: string) => void;
  options: ConnectionOption[];
  required: boolean;
  /** Connection kinds this source accepts; empty means any. */
  connectionKinds: string[];
  idPrefix?: string;
}) {
  useUILanguage();
  const createConnection = useCreateAutoscanConnection();
  const testConnection = useTestAutoscanConnection();
  const requestIntegrations = useRequestIntegrations();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [reuseId, setReuseId] = useState("");
  // Which kind a manually-entered server is. Only asked when the descriptor
  // accepts more than one: recording every manual entry as connectionKinds[0]
  // would label a Radarr server "sonarr", and the connection test cannot catch
  // it because it probes only the URL and key.
  const [manualKind, setManualKind] = useState("");
  const [testResult, setTestResult] = useState<AutoscanConnectionTestResult | null>(null);

  // Requests integrations this source could bind, minus any already linked by a
  // saved connection — re-offering those would create a second connection to
  // the same server. Compare integration ids, not connection ids: they are
  // different identifier spaces, and mixing them matches nothing.
  const linkedIntegrationIds = new Set(
    options.map((option) => option.requestIntegrationId).filter(Boolean),
  );
  const reusable = (requestIntegrations.data ?? []).filter((integration) => {
    // A disabled integration is rejected at poll time, so binding one here
    // would produce a connection that is known-unusable the moment it is made.
    if (!integration.enabled) return false;
    const kind = integrationKind(integration);
    if (!kind) return false;
    if (connectionKinds.length > 0 && !connectionKinds.includes(kind)) return false;
    return !linkedIntegrationIds.has(integration.id);
  });

  const defaultKind = connectionKinds[0] ?? "sonarr";
  const kindChoices = connectionKinds.length > 1 ? connectionKinds : [];
  const effectiveManualKind = manualKind || defaultKind;

  function resetDraft() {
    setName("");
    setBaseUrl("");
    setApiKey("");
    setReuseId("");
    setManualKind("");
    setTestResult(null);
  }

  function handleSelect(next: string) {
    if (next === ADD_NEW) {
      setAdding(true);
      // Pre-select a reusable Requests server so the common path is one click.
      setReuseId(reusable[0]?.id ?? "");
      return;
    }
    setAdding(false);
    resetDraft();
    onChange(next === NONE ? "" : next);
  }

  function handleTest() {
    setTestResult(null);
    const body: AutoscanConnectionTestInput = reuseId
      ? { request_integration_id: reuseId }
      : { base_url: baseUrl.trim(), ...(apiKey.trim() ? { api_key_ref: apiKey.trim() } : {}) };

    testConnection.mutate(body, {
      onSuccess: setTestResult,
      onError: (err) =>
        setTestResult({
          ok: false,
          error: err instanceof Error ? err.message : "Connection test failed",
        }),
    });
  }

  function handleCreate() {
    const linked = reusable.find((integration) => integration.id === reuseId);
    const body = linked
      ? {
          name: linked.name,
          kind: integrationKind(linked) || defaultKind,
          request_integration_id: linked.id,
        }
      : {
          name: name.trim(),
          kind: effectiveManualKind,
          base_url: baseUrl.trim(),
          ...(apiKey.trim() ? { api_key_ref: apiKey.trim() } : {}),
        };

    createConnection.mutate(body, {
      onSuccess: (created) => {
        // Select what was just made, so the operator never has to find it.
        onChange(created.id);
        setAdding(false);
        resetDraft();
      },
    });
  }

  const canTest = reuseId ? true : baseUrl.trim().length > 0;
  const canCreate = reuseId
    ? true
    : name.trim().length > 0 && baseUrl.trim().length > 0 && apiKey.trim().length > 0;

  return (
    <div className="space-y-2">
      <Label htmlFor={idPrefix + "-select"}>
        {tr("pages.admin.autoscan.inline_connection_picker.which_server")}
        {required && tr("pages.admin.autoscan.inline_connection_picker.required")}
      </Label>

      <Select value={adding ? ADD_NEW : value || NONE} onValueChange={handleSelect}>
        <SelectTrigger id={idPrefix + "-select"} className="w-full">
          <SelectValue
            placeholder={tr("pages.admin.autoscan.inline_connection_picker.no_connection")}
          />
        </SelectTrigger>
        <SelectContent>
          {!required && (
            <SelectItem value={NONE}>
              {tr("pages.admin.autoscan.inline_connection_picker.no_server_needed")}
            </SelectItem>
          )}
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
          <SelectItem value={ADD_NEW}>
            {tr("pages.admin.autoscan.inline_connection_picker.add_a_server")}
          </SelectItem>
        </SelectContent>
      </Select>

      {!adding && (
        <p className="text-muted-foreground text-xs">
          {required
            ? tr(
                "pages.admin.autoscan.inline_connection_picker.this_source_needs_credentials_to_reach_its_server",
              )
            : tr(
                "pages.admin.autoscan.inline_connection_picker.optional_bind_one_if_this_source_needs_to_reach_a",
              )}
        </p>
      )}

      {adding && (
        <div className="border-border space-y-3 rounded-md border p-3">
          {reusable.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor={idPrefix + "-reuse"}>
                {tr("pages.admin.autoscan.inline_connection_picker.server")}
              </Label>
              <Select
                value={reuseId || "__manual__"}
                onValueChange={(next) => {
                  setTestResult(null);
                  setReuseId(next === "__manual__" ? "" : next);
                }}
              >
                <SelectTrigger id={idPrefix + "-reuse"} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {reusable.map((integration) => (
                    <SelectItem key={integration.id} value={integration.id}>
                      {integration.name}{" "}
                      {tr(
                        "pages.admin.autoscan.inline_connection_picker.already_set_up_in_requests",
                      )}
                    </SelectItem>
                  ))}
                  <SelectItem value="__manual__">
                    {tr("pages.admin.autoscan.inline_connection_picker.use_different_credentials")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                {tr(
                  "pages.admin.autoscan.inline_connection_picker.silo_already_has_these_credentials_no_need_to_enter_them",
                )}
              </p>
            </div>
          )}

          {!reuseId && (
            <>
              {kindChoices.length > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor={idPrefix + "-kind"}>
                    {tr("pages.admin.autoscan.inline_connection_picker.service")}
                  </Label>
                  <Select value={effectiveManualKind} onValueChange={setManualKind}>
                    <SelectTrigger id={idPrefix + "-kind"} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {kindChoices.map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {kind === "sonarr"
                            ? tr("pages.admin.autoscan.inline_connection_picker.sonarr")
                            : kind === "radarr"
                              ? tr("pages.admin.autoscan.inline_connection_picker.radarr")
                              : kind}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor={idPrefix + "-name"}>
                  {tr("pages.admin.autoscan.inline_connection_picker.name")}
                </Label>
                <Input
                  id={idPrefix + "-name"}
                  placeholder={tr("pages.admin.autoscan.inline_connection_picker.my_sonarr")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={idPrefix + "-url"}>
                  {tr("pages.admin.autoscan.inline_connection_picker.base_url")}
                </Label>
                <Input
                  id={idPrefix + "-url"}
                  placeholder={tr(
                    "pages.admin.autoscan.inline_connection_picker.http_localhost_8989",
                  )}
                  value={baseUrl}
                  onChange={(e) => {
                    setTestResult(null);
                    setBaseUrl(e.target.value);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={idPrefix + "-key"}>
                  {tr("pages.admin.autoscan.inline_connection_picker.api_key")}
                </Label>
                <Input
                  id={idPrefix + "-key"}
                  type="password"
                  placeholder={tr("pages.admin.autoscan.inline_connection_picker.enter_api_key")}
                  autoComplete="new-password"
                  value={apiKey}
                  onChange={(e) => {
                    setTestResult(null);
                    setApiKey(e.target.value);
                  }}
                />
              </div>
            </>
          )}

          {testResult && (
            <div
              role="status"
              className={
                "flex items-start gap-2 rounded-md border p-2.5 text-sm " +
                (testResult.ok
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-destructive/30 bg-destructive/10 text-destructive")
              }
            >
              {testResult.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0" />
              )}
              <span>
                {testResult.ok
                  ? tr("pages.admin.autoscan.inline_connection_picker.connected_value", {
                      value: testResult.version ? ` (v${testResult.version})` : "",
                    })
                  : (testResult.error ??
                    tr("pages.admin.autoscan.inline_connection_picker.connection_failed"))}
              </span>
            </div>
          )}

          <div className="flex flex-wrap justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleTest}
              disabled={!canTest || testConnection.isPending}
            >
              {testConnection.isPending
                ? tr("pages.admin.autoscan.inline_connection_picker.testing")
                : tr("pages.admin.autoscan.inline_connection_picker.test_connection")}
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setAdding(false);
                  resetDraft();
                }}
                disabled={createConnection.isPending}
              >
                {tr("common.actions.cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleCreate}
                disabled={!canCreate || createConnection.isPending}
              >
                <Plus />
                {createConnection.isPending
                  ? tr("pages.admin.autoscan.inline_connection_picker.adding")
                  : tr("pages.admin.autoscan.inline_connection_picker.add_server")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default InlineConnectionPicker;
