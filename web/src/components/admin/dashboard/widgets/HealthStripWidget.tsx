import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router";
import { AlertTriangle, Clock, Database, Server, Tag, Zap } from "lucide-react";

import type { AdminHealthComponent } from "@/api/types";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminNodes } from "@/hooks/queries/admin/nodes";
import { useAdminServerStatus } from "@/hooks/queries/admin/settings";
import { useBuildInfo } from "@/hooks/queries/admin/system";
import { cn } from "@/lib/utils";
import { SectionError } from "../feedback";
import { formatLatency, formatUptime } from "../format";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

/**
 * One-line deployment health.
 *
 * Version, uptime and node health are composed here rather than served by
 * `/admin/server/status`: the build info and the node list already have their
 * own endpoints, and duplicating them into the status payload would give the
 * dashboard two answers that can disagree.
 */
export function HealthStripWidget() {
  useUILanguage();
  const statusQuery = useAdminServerStatus();
  const buildQuery = useBuildInfo();
  const nodesQuery = useAdminNodes();

  const status = statusQuery.data;
  const health = status?.health;
  const buildNumber = buildQuery.data?.build_number ?? 0;
  const versionDisplay = buildQuery.data?.display || "unknown";
  // Only a successful response may claim "none": while the node list is
  // loading or failed, node status is unknown, and "this server transcodes"
  // would be an invented answer.
  const nodesReady = nodesQuery.isSuccess;
  const nodes = nodesQuery.data ?? [];
  // A disabled node is not expected to be healthy, so it belongs in neither
  // half of the ratio: counting it in the denominator would report a warning
  // ("0/1") for a deployment whose only node was deliberately taken out.
  const enabledNodes = nodes.filter((node) => node.enabled);
  const healthyNodes = enabledNodes.filter((node) => node.healthy).length;

  if (statusQuery.isLoading) {
    return <Skeleton className="h-full min-h-[92px] rounded-2xl" />;
  }

  if (statusQuery.error || !status) {
    return (
      <Card className="h-full justify-center py-3">
        <CardContent>
          <SectionError
            message={tr(
              "components.admin.dashboard.widgets.health_strip_widget.failed_to_load_server_health",
            )}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    // One row tall by default, so the card's own padding is the compact one the
    // loading skeleton has always promised rather than the Card default.
    <Card className="h-full py-3">
      <CardContent className="grid min-h-0 flex-1 grid-cols-2 content-center gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <HealthCell
          icon={Tag}
          label={tr("components.admin.dashboard.widgets.health_strip_widget.version")}
          value={buildNumber > 0 ? `${buildNumber} · ${versionDisplay}` : versionDisplay}
          detail={
            buildQuery.data?.dirty
              ? tr("components.admin.dashboard.widgets.health_strip_widget.dirty_build")
              : undefined
          }
        />
        <HealthCell
          icon={Clock}
          label={tr("components.admin.dashboard.widgets.health_strip_widget.uptime")}
          value={formatUptime(status.started_at)}
          detail={
            status.restart_required
              ? tr("components.admin.dashboard.widgets.health_strip_widget.restart_required")
              : undefined
          }
          tone={status.restart_required ? "warn" : undefined}
        />
        <DependencyCell
          icon={Database}
          label={tr("components.admin.dashboard.widgets.health_strip_widget.postgres")}
          component={health?.postgres}
        />
        <DependencyCell
          icon={Zap}
          label={tr("components.admin.dashboard.widgets.health_strip_widget.redis")}
          component={health?.redis}
        />
        <HealthCell
          icon={Server}
          label={tr("components.admin.dashboard.widgets.health_strip_widget.nodes")}
          value={
            !nodesReady
              ? "—"
              : enabledNodes.length === 0
                ? "none"
                : `${healthyNodes}/${enabledNodes.length}`
          }
          detail={
            !nodesReady
              ? nodesQuery.isError
                ? tr("components.admin.dashboard.widgets.health_strip_widget.unavailable")
                : undefined
              : enabledNodes.length === 0
                ? tr(
                    "components.admin.dashboard.widgets.health_strip_widget.this_server_transcodes",
                  )
                : tr("components.admin.dashboard.widgets.health_strip_widget.healthy")
          }
          tone={nodesReady && healthyNodes < enabledNodes.length ? "warn" : undefined}
        />
        <HealthCell
          icon={AlertTriangle}
          label={tr("components.admin.dashboard.widgets.health_strip_widget.errors_24h")}
          value={health ? health.errors_24h.toLocaleString() : "—"}
          detail={
            health
              ? tr("components.admin.dashboard.widgets.health_strip_widget.count_warnings", {
                  count: health.warnings_24h.toLocaleString(),
                })
              : undefined
          }
          tone={health && health.errors_24h > 0 ? "error" : undefined}
          to="/admin/logs"
        />
      </CardContent>
    </Card>
  );
}

/**
 * A dependency reports whether it is configured before whether it is up: a
 * single-node deployment with no Redis is healthy, and rendering that the same
 * as an unreachable Redis would invent an outage.
 */
function DependencyCell({
  icon,
  label,
  component,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  component: AdminHealthComponent | undefined;
}) {
  useUILanguage();
  if (!component) {
    return <HealthCell icon={icon} label={label} value="—" />;
  }
  if (!component.configured) {
    return (
      <HealthCell
        icon={icon}
        label={label}
        value="Not configured"
        detail={tr("components.admin.dashboard.widgets.health_strip_widget.optional")}
      />
    );
  }
  if (!component.ok) {
    return <HealthCell icon={icon} label={label} value="Unreachable" tone="error" />;
  }
  return (
    <HealthCell
      icon={icon}
      label={label}
      value="OK"
      detail={component.latency_ms === undefined ? undefined : formatLatency(component.latency_ms)}
    />
  );
}

function HealthCell({
  icon: Icon,
  label,
  value,
  detail,
  tone,
  to,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail?: string;
  tone?: "warn" | "error";
  to?: string;
}) {
  useUILanguage();
  const body = (
    <>
      <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div
        className={cn(
          "mt-1 truncate text-[15px] leading-none font-bold tabular-nums",
          tone === "error" && "text-destructive",
          tone === "warn" && "text-amber-500",
        )}
        title={value}
      >
        {value}
      </div>
      {detail ? (
        <div className="text-muted-foreground mt-1 truncate text-[10px]">{detail}</div>
      ) : null}
    </>
  );

  return <CellShell to={to}>{body}</CellShell>;
}

function CellShell({ to, children }: { to?: string; children: ReactNode }) {
  useUILanguage();
  const className = "bg-surface border-border min-w-0 rounded-lg border p-2.5";
  if (to) {
    return (
      <Link to={to} className={cn(className, "hover:bg-surface-hover transition-colors")}>
        {children}
      </Link>
    );
  }
  return <div className={className}>{children}</div>;
}
