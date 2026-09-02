import { Link } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCatalogSearchStatus } from "@/hooks/queries/admin/settings";
import { formatDateTime } from "@/lib/datetime";

import { SettingFieldStatus } from "./SettingField";
import { useUILanguage } from "@/i18n/uiText";

import { tr } from "@/i18n/translate";

/**
 * Read-only view of the catalog search index: which provider is answering
 * queries, how much of the catalog is indexed, and links to the rebuild/sync
 * tasks. Diagnostics, not settings — it lives behind a disclosure.
 */
export function SearchStatusPanel() {
  useUILanguage();
  const { data: status, isLoading, isError, error } = useCatalogSearchStatus();

  if (isLoading) {
    return (
      <div className="space-y-3 py-3">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-5 w-72" />
        <Skeleton className="h-5 w-48" />
      </div>
    );
  }

  // A failed status request used to leave the skeletons up forever, which reads
  // as "still loading" — the one thing a diagnostics panel must never imply
  // about a request that already came back. Say so, and keep the rebuild/sync
  // links reachable: they are exactly what an admin wants when the index is in
  // a bad enough state that the status endpoint is failing.
  if (isError || !status) {
    return (
      <div className="space-y-3 py-3">
        <SettingFieldStatus tone="warn">
          {tr("pages.admin_settings.search_status_panel.couldn_t_load_search_status_value", {
            value: error ? `: ${tr.error("errors.common.request_failed", error)}` : ".",
          })}
        </SettingFieldStatus>
        <SearchTaskLinks />
      </div>
    );
  }

  return (
    <div className="divide-border divide-y">
      {status.degraded && (
        <div className="py-3">
          <SettingFieldStatus tone="warn">
            {status.degraded_reason ??
              tr("pages.admin_settings.search_status_panel.search_is_running_in_a_degraded_mode")}
          </SettingFieldStatus>
        </div>
      )}
      <StatusRow
        label={tr("pages.admin_settings.search_status_panel.answering_searches")}
        value={
          status.active_provider === "meilisearch"
            ? status.index.rebuild_required
              ? "Meilisearch (keyword only)"
              : "Meilisearch"
            : "Postgres full-text"
        }
        badge={status.configured_provider}
      />
      <StatusRow
        label={tr("pages.admin_settings.search_status_panel.health")}
        value={status.meilisearch.healthy ? "Healthy" : status.meilisearch.circuit_state}
        badge={status.meilisearch.configured ? "configured" : "not configured"}
      />
      <StatusRow
        label={tr("pages.admin_settings.search_status_panel.active_index")}
        value={status.index.active_index_uid || "Not built"}
        badge={
          status.index.rebuild_required
            ? "rebuild required"
            : `schema ${status.index.schema_version}/${status.index.expected_schema_version}`
        }
      />
      <StatusRow
        label={tr("pages.admin_settings.search_status_panel.documents")}
        value={String(status.index.document_count)}
      />
      <StatusRow
        label={tr("pages.admin_settings.search_status_panel.indexed_types")}
        value={formatIndexedTypes(status.meilisearch.index_types)}
      />
      <StatusRow
        label={tr("pages.admin_settings.search_status_panel.compressed_vectors")}
        value={status.meilisearch.binary_quantized ? "Enabled" : "Disabled"}
      />
      <StatusRow
        label={tr("pages.admin_settings.search_status_panel.meaning_based_search")}
        value={status.meilisearch.semantic_enabled ? "Enabled" : "Disabled"}
        badge={status.meilisearch.embedder}
      />
      <StatusRow
        label={tr("pages.admin_settings.search_status_panel.meaning_based_share_of_results")}
        value={formatSemanticRatio(status.meilisearch.semantic_ratio)}
      />
      <StatusRow
        label={tr("pages.admin_settings.search_status_panel.items_with_vectors")}
        value={String(status.index.vector_document_count)}
      />
      {status.semantic && (
        <>
          <StatusRow
            label={tr("pages.admin_settings.search_status_panel.meaning_based_readiness")}
            value={status.semantic.ready ? "Ready" : "Not ready"}
            badge={status.semantic.ready ? undefined : status.semantic.disabled_reason}
          />
          <StatusRow
            label={tr("pages.admin_settings.search_status_panel.vector_coverage")}
            value={formatPercent(status.semantic.vector_coverage_ratio)}
          />
          <StatusRow
            label={tr("pages.admin_settings.search_status_panel.coverage_updated")}
            value={formatStatusDate(status.semantic.coverage_updated_at) || "Never"}
          />
          <StatusRow
            label={tr("pages.admin_settings.search_status_panel.embedding_model")}
            value={
              status.semantic.capability.ok
                ? "OK"
                : (status.semantic.capability.reason ?? "Unavailable")
            }
            badge={status.semantic.capability.embedder}
          />
          {status.semantic.per_type && status.semantic.per_type.length > 0 && (
            <div className="flex flex-col gap-2 py-3">
              <span className="text-sm font-medium">
                {tr("pages.admin_settings.search_status_panel.coverage_by_type")}
              </span>
              <div className="divide-border/60 divide-y">
                {status.semantic.per_type.map((t) => (
                  <div key={t.type} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="text-muted-foreground min-w-0 truncate text-sm">
                      {t.type}: {t.vectorized}/{t.eligible} (
                      {formatPercent(t.vector_coverage_ratio)})
                    </span>
                    <Badge variant={t.ready ? "secondary" : "outline"}>
                      {t.ready
                        ? tr("pages.admin_settings.search_status_panel.ready")
                        : tr("pages.admin_settings.search_status_panel.not_ready")}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <StatusRow
        label={tr("pages.admin_settings.search_status_panel.pending_events")}
        value={String(status.index.pending_events)}
      />
      {status.index.dead_lettered_events > 0 && (
        <StatusRow
          label={tr("pages.admin_settings.search_status_panel.dropped_events")}
          value={String(status.index.dead_lettered_events)}
          badge="stale until rebuild"
        />
      )}
      <StatusRow
        label={tr("pages.admin_settings.search_status_panel.last_sync")}
        value={formatStatusDate(status.index.last_sync_at) || "Never"}
      />
      {status.meilisearch.last_fallback && (
        <StatusRow
          label={tr("pages.admin_settings.search_status_panel.last_fallback")}
          value={status.meilisearch.last_fallback}
        />
      )}
      <SearchTaskLinks />
    </div>
  );
}

/** The two index maintenance tasks. Shown whether or not the status resolved. */
function SearchTaskLinks() {
  useUILanguage();
  return (
    <div className="flex flex-wrap gap-2 py-3">
      <Button asChild size="sm" variant="outline">
        <Link to="/admin/tasks/rebuild_catalog_search_index">
          {tr("pages.admin_settings.search_status_panel.rebuild_index")}
        </Link>
      </Button>
      <Button asChild size="sm" variant="ghost">
        <Link to="/admin/tasks/sync_catalog_search_index">
          {tr("pages.admin_settings.search_status_panel.automatic_maintenance")}
        </Link>
      </Button>
    </div>
  );
}

function StatusRow({ label, value, badge }: { label: string; value: string; badge?: string }) {
  useUILanguage();
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm font-medium">{label}</span>
      <span className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-2 text-sm">
        <span className="max-w-full text-right break-words">{value}</span>
        {badge ? <Badge variant="outline">{badge}</Badge> : null}
      </span>
    </div>
  );
}

function formatStatusDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return formatDateTime(date);
}

function formatIndexedTypes(value?: string[]) {
  if (!value || value.length === 0) return "All";
  return value.join(", ");
}

function formatSemanticRatio(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "0";
  return value.toFixed(2);
}

function formatPercent(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "0%";
  return `${Math.round(value * 100)}%`;
}
