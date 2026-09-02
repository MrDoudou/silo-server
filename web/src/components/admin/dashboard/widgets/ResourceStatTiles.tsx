import type { ReactNode } from "react";
import { Cpu, MemoryStick, MonitorCog, Network } from "lucide-react";

import { useSystemResources } from "@/hooks/queries/admin/system";
import { usePageActivity } from "@/hooks/usePageActivity";
import { describeResourceSample, type ResourceMetric } from "@/pages/adminNodesPresentation";
import { StatTile } from "./statTiles";

type ResourceKind = "cpu" | "memory" | "gpu" | "network";

const resourceIcons = {
  cpu: <Cpu className="h-4 w-4" />,
  memory: <MemoryStick className="h-4 w-4" />,
  gpu: <MonitorCog className="h-4 w-4" />,
  network: <Network className="h-4 w-4" />,
} satisfies Record<ResourceKind, ReactNode>;

export function CPUStatWidget() {
  return <ResourceStatTile kind="cpu" />;
}

export function MemoryStatWidget() {
  return <ResourceStatTile kind="memory" />;
}

export function GPUStatWidget() {
  return <ResourceStatTile kind="gpu" />;
}

export function NetworkStatWidget() {
  return <ResourceStatTile kind="network" />;
}

function ResourceStatTile({ kind }: { kind: ResourceKind }) {
  const pageActivity = usePageActivity();
  const resourcesQuery = useSystemResources(pageActivity.canPollDashboard);
  const sample = describeResourceSample(resourcesQuery.data);
  const metric = resourceMetric(sample, kind);

  return (
    <StatTile
      label={metric.label}
      value={metric.value}
      sub={metric.detail}
      icon={resourceIcons[kind]}
      isLoading={resourcesQuery.isLoading || (!resourcesQuery.data && !resourcesQuery.error)}
      error={resourcesQuery.error}
      tooltip={metric.title}
    />
  );
}

function resourceMetric(
  sample: ReturnType<typeof describeResourceSample>,
  kind: ResourceKind,
): ResourceMetric {
  if (sample.kind === "unavailable") {
    return unavailableMetric(kind, sample.title);
  }
  if (kind === "gpu") {
    return sample.gpu ?? unavailableMetric(kind, "This host reported no GPU reading.");
  }
  const metric = sample[kind];
  if (kind === "memory") {
    return {
      ...metric,
      value: metric.detail.replace(/\s+used$/, ""),
      detail: metric.value,
    };
  }
  if (kind === "network") {
    const [receive, send] = metric.value.split(" · ");
    return {
      ...metric,
      value: receive ?? metric.value,
      detail: send ?? metric.detail,
    };
  }
  return metric;
}

function unavailableMetric(kind: ResourceKind, title: string): ResourceMetric {
  const labels: Record<ResourceKind, string> = {
    cpu: "CPU",
    memory: "RAM",
    gpu: "GPU",
    network: "Net",
  };
  return {
    label: labels[kind],
    value: "—",
    detail: "not sampled",
    title,
    muted: true,
    warning: false,
    fill: null,
  };
}
