import { useMemo } from "react";
import { Link } from "react-router";
import { useSettingsForm } from "@/hooks/useSettingsForm";
import { useRestartKeys } from "@/hooks/useRestartKeys";
import { useHWAccelDetection, type HWAccelInfo } from "@/hooks/queries/admin/system";
import { useAdminNodes } from "@/hooks/queries/admin/nodes";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { AdvancedSection } from "@/components/settings/AdvancedSection";
import { PathSettingField } from "@/components/settings/PathSettingField";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { SettingsSubheading } from "@/components/settings/SettingsSubheading";
import { SettingField, SettingFieldRow, SettingFieldStatus } from "./SettingField";
import { SaveBar } from "./SaveBar";
import { FieldGroup } from "./FieldGroup";
import { DEFAULT_FFMPEG_PATH, DEFAULT_TRANSCODE_DIR } from "./settingsPathDefaults";
import {
  CHAPTER_THUMBNAIL_EXECUTION_DEFAULT,
  buildHWDeviceRows,
  chapterThumbnailExecutionOptions,
  hasUsableTranscodeNode,
  nodeInventoriesDiverge,
  parseHWDeviceList,
  toggleHWDevice,
} from "./playbackSettings.utils";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

// Shown without a disclosure: the handful of controls a household admin
// actually touches.
const TRANSCODING_ESSENTIAL_KEYS = [
  "playback.transcode_enabled",
  "playback.hw_accel",
  "allow_4k_transcode",
];

const TRANSCODING_ADVANCED_KEYS = [
  "playback.ffmpeg_path",
  "playback.transcode_dir",
  "playback.segment_retention_seconds",
  "playback.hw_device",
  "playback.transcode_hardware_tone_map_enabled",
  "playback.transcode_software_tone_map_enabled",
  "enable_transcode_throttle",
  "transcode_throttle_seconds",
  "playback.chapter_thumbnail_workers",
  "playback.chapter_thumbnail_execution",
  "playback.chapter_thumbnail_hdr_policy",
  "playback.chapter_thumbnail_software_tone_map_enabled",
];

const executionOptions = [
  {
    value: "prefer_worker",
    get label() {
      return tr("pages.admin_settings.playback_settings.prefer_any_worker");
    },
  },
  {
    value: "prefer_transcode",
    get label() {
      return tr("pages.admin_settings.playback_settings.prefer_transcode_node");
    },
  },
  {
    value: "worker_only",
    get label() {
      return tr("pages.admin_settings.playback_settings.any_worker_only");
    },
  },
  {
    value: "prefer_api",
    get label() {
      return tr("pages.admin_settings.playback_settings.prefer_api_server");
    },
  },
  {
    value: "api_only",
    get label() {
      return tr("pages.admin_settings.playback_settings.api_server_only");
    },
  },
];

const egressOptions = [
  {
    value: "prefer_proxy",
    get label() {
      return tr("pages.admin_settings.playback_settings.prefer_proxy");
    },
  },
  {
    value: "proxy_only",
    get label() {
      return tr("pages.admin_settings.playback_settings.proxy_only");
    },
  },
  {
    value: "prefer_api",
    get label() {
      return tr("pages.admin_settings.playback_settings.prefer_api_server");
    },
  },
  {
    value: "api_only",
    get label() {
      return tr("pages.admin_settings.playback_settings.api_server_only");
    },
  },
];

type ExecutionWorkload = "remux" | "video_transcode";

function executionPreview(value: string, workload: ExecutionWorkload) {
  const worker = workload === "remux" ? "Any worker" : "Transcode node";
  switch (value) {
    case "prefer_transcode":
      return workload === "remux" ? "Transcode node → any worker → API" : "Transcode node → API";
    case "worker_only":
      return `${worker} only`;
    case "prefer_api":
      return `API → ${worker.toLowerCase()}`;
    case "api_only":
      return "API only";
    default:
      return `${worker} → API`;
  }
}

function egressPreview(value: string) {
  switch (value) {
    case "proxy_only":
      return "Proxy only";
    case "prefer_api":
      return "API → proxy";
    case "api_only":
      return "API only";
    default:
      return "Proxy → API";
  }
}

/** The whole path for a workload that needs an executor, e.g. "Worker → API · Proxy → API". */
function routePreview(execution: string, egress: string, workload: ExecutionWorkload) {
  return `${executionPreview(execution, workload)} · ${egressPreview(egress)}`;
}

// A routing policy either picks who runs the work (execution) or who serves the
// bytes (egress). The kind decides the choices offered and the value the server
// applies while the row has never been set.
const ROUTING_KINDS = {
  execution: { options: executionOptions, serverDefault: "prefer_worker" },
  egress: { options: egressOptions, serverDefault: "prefer_proxy" },
};

type RoutingKind = keyof typeof ROUTING_KINDS;

const ROUTING_KEYS = [
  "playback.routing.direct_play_egress",
  "playback.routing.remux_execution",
  "playback.routing.remux_egress",
  "playback.routing.video_transcode_execution",
  "playback.routing.video_transcode_egress",
] as const;

type RoutingKey = (typeof ROUTING_KEYS)[number];

interface RoutingField {
  key: RoutingKey;
  label: string;
  kind: RoutingKind;
  description?: string;
}

// One row per key in ROUTING_KEYS, in the order they render.
const ROUTING_FIELDS: readonly RoutingField[] = [
  {
    key: "playback.routing.direct_play_egress",
    get label() {
      return tr("pages.admin_settings.playback_settings.direct_play_egress");
    },
    kind: "egress",
    get description() {
      return tr("pages.admin_settings.playback_settings.original_bytes_need_no_executor");
    },
  },
  {
    key: "playback.routing.remux_execution",
    get label() {
      return tr("pages.admin_settings.playback_settings.remux_execution");
    },
    kind: "execution",
    get description() {
      return tr(
        "pages.admin_settings.playback_settings.a_worker_can_be_a_proxy_or_transcode_node_prefer",
      );
    },
  },
  {
    key: "playback.routing.remux_egress",
    get label() {
      return tr("pages.admin_settings.playback_settings.remux_egress");
    },
    kind: "egress",
  },
  {
    key: "playback.routing.video_transcode_execution",
    get label() {
      return tr("pages.admin_settings.playback_settings.video_transcode_execution");
    },
    kind: "execution",
    get description() {
      return tr(
        "pages.admin_settings.playback_settings.video_transcode_workers_are_transcode_nodes_proxy_nodes_only_provide",
      );
    },
  },
  {
    key: "playback.routing.video_transcode_egress",
    get label() {
      return tr("pages.admin_settings.playback_settings.video_transcode_egress");
    },
    kind: "egress",
  },
];

const ROUTING_PRESETS = {
  standard: {
    get label() {
      return tr("pages.admin_settings.playback_settings.silo_defaults");
    },
    values: {
      "playback.routing.direct_play_egress": "prefer_proxy",
      "playback.routing.remux_execution": "prefer_transcode",
      "playback.routing.remux_egress": "prefer_proxy",
      "playback.routing.video_transcode_execution": "prefer_transcode",
      "playback.routing.video_transcode_egress": "prefer_proxy",
    },
  },
  gpu: {
    get label() {
      return tr("pages.admin_settings.playback_settings.gpu_offload");
    },
    values: {
      "playback.routing.direct_play_egress": "prefer_api",
      "playback.routing.remux_execution": "prefer_api",
      "playback.routing.remux_egress": "prefer_api",
      "playback.routing.video_transcode_execution": "prefer_worker",
      "playback.routing.video_transcode_egress": "prefer_proxy",
    },
  },
  central: {
    get label() {
      return tr("pages.admin_settings.playback_settings.central_egress");
    },
    values: {
      "playback.routing.direct_play_egress": "api_only",
      "playback.routing.remux_execution": "prefer_worker",
      "playback.routing.remux_egress": "api_only",
      "playback.routing.video_transcode_execution": "prefer_worker",
      "playback.routing.video_transcode_egress": "api_only",
    },
  },
} as const;

const WATCH_KEYS = ["playback.watched_threshold", "playback.min_resume_threshold"];

// `playback.chapter_thumbnail_node_capacity` is deliberately absent from the
// UI (hidden tier): it is still saved and read through the settings API, but
// the per-node budget is derived from the node pool rather than typed in.
//
// The `download.*` family is its own page (DownloadsSettings), so it is not
// loaded or saved here.
const KEYS = [
  ...TRANSCODING_ESSENTIAL_KEYS,
  ...TRANSCODING_ADVANCED_KEYS,
  ...ROUTING_KEYS,
  ...WATCH_KEYS,
];

/** One line of the preferred-path summary: workload on the left, route on the right. */
function PreferredPathRow({ label, route }: { label: string; route: string }) {
  useUILanguage();
  useUILanguage();
  return (
    <div className="flex justify-between gap-5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{route}</span>
    </div>
  );
}

export default function PlaybackSettings() {
  useUILanguage();
  useUILanguage();
  const form = useSettingsForm({ keys: useMemo(() => KEYS, []) });
  const restartKeys = useRestartKeys();
  const hwAccel = form.getValue("playback.hw_accel");
  const hwDetection = useHWAccelDetection(hwAccel !== "none");
  const hwDevice = form.getValue("playback.hw_device");
  const selectedDevices = parseHWDeviceList(hwDevice);
  const deviceRows = buildHWDeviceRows(hwDetection.data, hwDevice);
  const detectedPaths = deviceRows.filter((row) => row.detected).map((row) => row.path);
  // Balancing is QSV/VAAPI-only: NVENC addresses GPUs by CUDA index/UUID, so
  // the multi-select picker is hidden for it (the server uses the first
  // configured entry).
  const isNvenc =
    hwAccel === "nvenc" || (hwAccel === "auto" && hwDetection.data?.resolved === "nvenc");
  const inventoriesDiverge = nodeInventoriesDiverge(hwDetection.data);
  const showDevicePicker = hwAccel !== "none" && !isNvenc && deviceRows.length > 0;

  const nodes = useAdminNodes();
  const chapterExecution =
    form.getValue("playback.chapter_thumbnail_execution") || CHAPTER_THUMBNAIL_EXECUTION_DEFAULT;
  // Gate the node-backed extraction modes only on a node list we actually
  // have: while the query is in flight or after it failed, leave every option
  // reachable rather than blocking a valid choice on a transient error.
  const transcodeNodeAvailable = !nodes.isSuccess || hasUsableTranscodeNode(nodes.data);
  const proxyNodeAvailable =
    !nodes.isSuccess ||
    (nodes.data ?? []).some((node) => node.type === "proxy" && node.enabled && node.healthy);

  const routingValues = Object.fromEntries(
    ROUTING_KEYS.map((key) => [key, form.getValue(key)]),
  ) as Record<RoutingKey, string>;
  const activeRoutingPreset = Object.values(ROUTING_PRESETS).find((preset) =>
    ROUTING_KEYS.every((key) => routingValues[key] === preset.values[key]),
  );
  const applyRoutingPreset = (values: Record<RoutingKey, string>) => {
    for (const key of ROUTING_KEYS) form.setValue(key, values[key]);
  };

  const usesProxyOnlyEgress = ROUTING_KEYS.some((key) => routingValues[key] === "proxy_only");
  // A remux can run on a proxy node (progressive) or a transcode node (HLS), so
  // worker-only remuxing is only stranded when neither kind is available. Both
  // availability flags read as available until the node list has loaded, which
  // keeps the warning quiet on a transient error.
  const strandedRoute =
    (usesProxyOnlyEgress && !proxyNodeAvailable) ||
    (routingValues["playback.routing.remux_execution"] === "worker_only" &&
      !proxyNodeAvailable &&
      !transcodeNodeAvailable) ||
    (routingValues["playback.routing.video_transcode_execution"] === "worker_only" &&
      !transcodeNodeAvailable);

  const isDirty = form.isDirty;
  const anyDirty = (keys: readonly string[]) => keys.some((key) => isDirty(key));
  const allRestart = (keys: readonly string[]) => keys.every((key) => restartKeys.has(key));

  const detection = hwAccel === "none" ? undefined : hwDetection.data;
  const detectedLabel = describeDetection(detection);

  // Everything the hardware-acceleration field has to say about itself, in its
  // own status slot. The NVENC note used to be a bare paragraph between rows,
  // which read as a row with no label and broke the group's rhythm.
  const hwAccelLines =
    hwAccel === "none"
      ? []
      : [
          detectedLabel ? (
            <SettingFieldStatus
              key="detected"
              tone={detection?.resolved && detection.resolved !== "none" ? "ok" : "warn"}
            >
              {detectedLabel}
            </SettingFieldStatus>
          ) : hwDetection.isLoading ? (
            <SettingFieldStatus key="detecting" tone="muted">
              {tr("pages.admin_settings.playback_settings.detecting_hardware")}
            </SettingFieldStatus>
          ) : null,
          isNvenc && selectedDevices.length > 1 ? (
            <SettingFieldStatus key="nvenc" tone="warn">
              {tr("pages.admin_settings.playback_settings.nvenc_uses_the_first_configured_device")}
              {selectedDevices[0]}).
            </SettingFieldStatus>
          ) : null,
        ].filter(Boolean);
  const hwAccelStatus =
    hwAccelLines.length > 0 ? (
      <span className="flex flex-col items-start gap-1">{hwAccelLines}</span>
    ) : undefined;

  if (form.isLoading) return <div>{tr("pages.admin_settings.playback_settings.loading")}</div>;

  return (
    <div className="flex h-full flex-col">
      <SettingsPageHeader
        title={tr("pages.admin_settings.playback_settings.playback")}
        className="mb-8"
      />

      <div className="flex-1 space-y-5">
        <FieldGroup
          label={tr("pages.admin_settings.playback_settings.transcoding")}
          restartAll={allRestart([...TRANSCODING_ESSENTIAL_KEYS, ...TRANSCODING_ADVANCED_KEYS])}
        >
          <SettingField
            label={tr("pages.admin_settings.playback_settings.transcoding")}
            type="toggle"
            description={tr(
              "pages.admin_settings.playback_settings.off_serves_only_files_clients_can_already_play",
            )}
            value={form.getValue("playback.transcode_enabled")}
            onChange={(v) => form.setValue("playback.transcode_enabled", v)}
            restartRequired={restartKeys.has("playback.transcode_enabled")}
          />
          <SettingField
            label={tr("pages.admin_settings.playback_settings.hardware_acceleration")}
            type="select"
            options={[
              { value: "auto", label: tr("pages.admin_settings.playback_settings.auto") },
              {
                value: "qsv",
                label: tr("pages.admin_settings.playback_settings.intel_quick_sync_qsv"),
              },
              { value: "vaapi", label: tr("pages.admin_settings.playback_settings.va_api") },
              { value: "nvenc", label: tr("pages.admin_settings.playback_settings.nvidia_nvenc") },
              {
                value: "videotoolbox",
                label: tr("pages.admin_settings.playback_settings.video_toolbox_mac_os"),
              },
              { value: "none", label: tr("pages.admin_settings.playback_settings.software") },
            ]}
            description={tr(
              "pages.admin_settings.playback_settings.auto_picks_the_best_device_this_server_can_see",
            )}
            status={hwAccelStatus}
            value={hwAccel}
            onChange={(v) => form.setValue("playback.hw_accel", v)}
            restartRequired={restartKeys.has("playback.hw_accel")}
          />
          <SettingField
            label={tr("pages.admin_settings.playback_settings.allow_4_k_transcoding")}
            type="toggle"
            description={tr("pages.admin_settings.playback_settings.heavy_load_on_most_hardware")}
            value={form.getValue("allow_4k_transcode")}
            onChange={(v) => form.setValue("allow_4k_transcode", v)}
            restartRequired={restartKeys.has("allow_4k_transcode")}
          />

          <AdvancedSection
            id="playback.transcoding"
            count={TRANSCODING_ADVANCED_KEYS.length - (showDevicePicker ? 0 : 1)}
            forceOpen={anyDirty(TRANSCODING_ADVANCED_KEYS)}
          >
            <PathSettingField
              label={tr("pages.admin_settings.playback_settings.ffmpeg_path")}
              defaultValue={DEFAULT_FFMPEG_PATH}
              description={tr(
                "pages.admin_settings.playback_settings.leave_blank_to_use_the_ffmpeg_that_ships_with_the",
                { DEFAULT_FFMPEG_PATH: DEFAULT_FFMPEG_PATH },
              )}
              value={form.getValue("playback.ffmpeg_path")}
              onChange={(v) => form.setValue("playback.ffmpeg_path", v)}
              restartRequired={restartKeys.has("playback.ffmpeg_path")}
            />
            <PathSettingField
              label={tr("pages.admin_settings.playback_settings.transcode_directory")}
              defaultValue={DEFAULT_TRANSCODE_DIR}
              description={tr(
                "pages.admin_settings.playback_settings.use_fast_local_storage_with_room_to_spare_leave_blank",
                { DEFAULT_TRANSCODE_DIR: DEFAULT_TRANSCODE_DIR },
              )}
              value={form.getValue("playback.transcode_dir")}
              onChange={(v) => form.setValue("playback.transcode_dir", v)}
              restartRequired={restartKeys.has("playback.transcode_dir")}
            />
            {showDevicePicker && (
              <div>
                <SettingsSubheading
                  caption={
                    selectedDevices.length === 0
                      ? "Auto: the first available device takes every transcode."
                      : selectedDevices.length === 1
                        ? "All transcodes run on the selected device."
                        : "Transcodes balance across the selected devices."
                  }
                >
                  {tr("pages.admin_settings.playback_settings.gpu_devices")}
                </SettingsSubheading>
                {inventoriesDiverge && (
                  <p className="pb-2 text-xs text-amber-500">
                    {tr(
                      "pages.admin_settings.playback_settings.nodes_report_different_devices_only_paths_on_every_node_are",
                    )}{" "}
                    <Link
                      to="/admin/nodes"
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {tr("pages.admin_settings.playback_settings.nodes_page")}
                    </Link>
                    .
                  </p>
                )}
                {/* One shared row shell per device, so these switches land on the
                    same edge as every other control in the group instead of
                    hugging the panel. */}
                {deviceRows.map((row) => (
                  <SettingFieldRow
                    key={row.path}
                    label={
                      <span className={row.detected ? undefined : "text-muted-foreground"}>
                        {row.description}
                      </span>
                    }
                    description={
                      <>
                        <span className="block font-mono">{row.path}</span>
                        {row.missingOnNodes.length > 0 && (
                          <span className="mt-0.5 block text-amber-500">
                            {tr("pages.admin_settings.playback_settings.not_present_on_nodes", {
                              nodes: row.missingOnNodes.join(", "),
                            })}
                          </span>
                        )}
                      </>
                    }
                  >
                    <Switch
                      checked={selectedDevices.includes(row.path)}
                      aria-label={row.description}
                      onCheckedChange={() =>
                        form.setValue(
                          "playback.hw_device",
                          toggleHWDevice(
                            form.getValue("playback.hw_device"),
                            row.path,
                            detectedPaths,
                          ),
                        )
                      }
                    />
                  </SettingFieldRow>
                ))}
              </div>
            )}
            <SettingField
              label={tr("pages.admin_settings.playback_settings.enable_hardware_hdr_tone_mapping")}
              type="toggle"
              hint={tr(
                "pages.admin_settings.playback_settings.allows_validated_local_or_remote_gpu_executors_to_convert_hdr",
              )}
              value={form.getValue("playback.transcode_hardware_tone_map_enabled") || "false"}
              onChange={(v) => form.setValue("playback.transcode_hardware_tone_map_enabled", v)}
              restartRequired={restartKeys.has("playback.transcode_hardware_tone_map_enabled")}
            />
            <SettingField
              label={tr("pages.admin_settings.playback_settings.enable_software_hdr_tone_mapping")}
              type="toggle"
              hint={tr(
                "pages.admin_settings.playback_settings.allows_the_cpu_to_convert_hdr_video_to_sdr_when",
              )}
              value={form.getValue("playback.transcode_software_tone_map_enabled") || "false"}
              onChange={(v) => form.setValue("playback.transcode_software_tone_map_enabled", v)}
              restartRequired={restartKeys.has("playback.transcode_software_tone_map_enabled")}
            />
            <SettingField
              label={tr("pages.admin_settings.playback_settings.throttle_transcoding")}
              type="toggle"
              description={tr(
                "pages.admin_settings.playback_settings.pause_encoding_once_the_client_is_far_enough_ahead",
              )}
              value={form.getValue("enable_transcode_throttle")}
              onChange={(v) => form.setValue("enable_transcode_throttle", v)}
              restartRequired={restartKeys.has("enable_transcode_throttle")}
            />
            {form.getValue("enable_transcode_throttle") === "true" && (
              <SettingField
                label={tr("pages.admin_settings.playback_settings.buffer_ahead")}
                type="number"
                unit="seconds"
                value={form.getValue("transcode_throttle_seconds")}
                onChange={(v) => form.setValue("transcode_throttle_seconds", v)}
                restartRequired={restartKeys.has("transcode_throttle_seconds")}
              />
            )}
            <SettingField
              label={tr("pages.admin_settings.playback_settings.transcode_back_buffer")}
              type="number"
              unit="seconds"
              hint={tr(
                "pages.admin_settings.playback_settings.keeps_this_much_already_downloaded_media_for_instant_backward_seeking",
              )}
              value={form.getValue("playback.segment_retention_seconds")}
              onChange={(v) => form.setValue("playback.segment_retention_seconds", v)}
              restartRequired={restartKeys.has("playback.segment_retention_seconds")}
            />
            <SettingField
              label={tr("pages.admin_settings.playback_settings.chapter_thumbnail_workers")}
              type="number"
              description={tr(
                "pages.admin_settings.playback_settings.parallel_extraction_jobs_per_library_scan",
              )}
              value={form.getValue("playback.chapter_thumbnail_workers")}
              onChange={(v) => form.setValue("playback.chapter_thumbnail_workers", v)}
              restartRequired={restartKeys.has("playback.chapter_thumbnail_workers")}
            />
            <SettingField
              label={tr("pages.admin_settings.playback_settings.generate_chapter_thumbnails_on")}
              type="select"
              options={chapterThumbnailExecutionOptions(chapterExecution, transcodeNodeAvailable)}
              status={
                transcodeNodeAvailable ? undefined : (
                  <SettingFieldStatus tone="warn">
                    {tr("pages.admin_settings.playback_settings.no_transcode_nodes_are_connected")}
                  </SettingFieldStatus>
                )
              }
              value={chapterExecution}
              onChange={(v) => form.setValue("playback.chapter_thumbnail_execution", v)}
              restartRequired={restartKeys.has("playback.chapter_thumbnail_execution")}
            />
            <SettingField
              label={tr("pages.admin_settings.playback_settings.hdr_handling")}
              type="select"
              options={[
                {
                  value: "best_effort",
                  label: tr("pages.admin_settings.playback_settings.generate_when_possible"),
                },
                {
                  value: "disabled",
                  label: tr("pages.admin_settings.playback_settings.skip_hdr_and_dolby_vision"),
                },
              ]}
              description={tr(
                "pages.admin_settings.playback_settings.hdr_frames_need_extra_color_conversion",
              )}
              value={form.getValue("playback.chapter_thumbnail_hdr_policy") || "best_effort"}
              onChange={(v) => form.setValue("playback.chapter_thumbnail_hdr_policy", v)}
              restartRequired={restartKeys.has("playback.chapter_thumbnail_hdr_policy")}
            />
            <SettingField
              label={tr("pages.admin_settings.playback_settings.software_hdr_tone_mapping")}
              type="toggle"
              description={tr(
                "pages.admin_settings.playback_settings.slow_but_works_without_graphics_hardware",
              )}
              value={
                form.getValue("playback.chapter_thumbnail_software_tone_map_enabled") || "false"
              }
              onChange={(v) =>
                form.setValue("playback.chapter_thumbnail_software_tone_map_enabled", v)
              }
              disabled={form.getValue("playback.chapter_thumbnail_hdr_policy") === "disabled"}
              restartRequired={restartKeys.has(
                "playback.chapter_thumbnail_software_tone_map_enabled",
              )}
            />
          </AdvancedSection>
        </FieldGroup>

        <FieldGroup
          label={tr("pages.admin_settings.playback_settings.node_routing")}
          restartAll={allRestart(ROUTING_KEYS)}
        >
          <SettingFieldRow
            label={tr("pages.admin_settings.playback_settings.routing_preset")}
            description={tr(
              "pages.admin_settings.playback_settings.presets_update_the_five_primitive_policies_below_custom_is_not",
            )}
          >
            <div className="flex flex-wrap justify-end gap-2">
              {Object.entries(ROUTING_PRESETS).map(([id, preset]) => (
                <Button
                  key={id}
                  type="button"
                  size="sm"
                  variant={activeRoutingPreset === preset ? "default" : "outline"}
                  onClick={() => applyRoutingPreset(preset.values)}
                >
                  {preset.label}
                </Button>
              ))}
              {!activeRoutingPreset && (
                <span className="text-muted-foreground self-center text-xs">
                  {tr("pages.admin_settings.playback_settings.custom")}
                </span>
              )}
            </div>
          </SettingFieldRow>

          {ROUTING_FIELDS.map((field) => (
            <SettingField
              key={field.key}
              label={field.label}
              type="select"
              options={ROUTING_KINDS[field.kind].options}
              description={field.description}
              value={routingValues[field.key] || ROUTING_KINDS[field.kind].serverDefault}
              onChange={(v) => form.setValue(field.key, v)}
              restartRequired={restartKeys.has(field.key)}
            />
          ))}

          <SettingFieldRow
            label={tr("pages.admin_settings.playback_settings.preferred_paths")}
            description={tr(
              "pages.admin_settings.playback_settings.arrows_show_soft_fallback_order_only_modes_never_cross_that",
            )}
          >
            <div className="grid min-w-64 gap-1 text-xs">
              <PreferredPathRow
                label={tr("pages.admin_settings.playback_settings.direct_play")}
                route={egressPreview(routingValues["playback.routing.direct_play_egress"])}
              />
              <PreferredPathRow
                label={tr("pages.admin_settings.playback_settings.remux")}
                route={routePreview(
                  routingValues["playback.routing.remux_execution"],
                  routingValues["playback.routing.remux_egress"],
                  "remux",
                )}
              />
              <PreferredPathRow
                label={tr("pages.admin_settings.playback_settings.video_transcode")}
                route={routePreview(
                  routingValues["playback.routing.video_transcode_execution"],
                  routingValues["playback.routing.video_transcode_egress"],
                  "video_transcode",
                )}
              />
            </div>
          </SettingFieldRow>

          {strandedRoute && (
            <SettingFieldStatus tone="warn">
              {tr(
                "pages.admin_settings.playback_settings.an_only_route_currently_has_no_healthy_supporting_node_saving",
              )}
            </SettingFieldStatus>
          )}
          {usesProxyOnlyEgress && (
            <SettingFieldStatus tone="warn">
              {tr(
                "pages.admin_settings.playback_settings.proxy_only_egress_requires_every_native_client_to_support_authorized",
              )}
            </SettingFieldStatus>
          )}
        </FieldGroup>

        <FieldGroup
          label={tr("pages.admin_settings.playback_settings.watch_behavior")}
          restartAll={allRestart(WATCH_KEYS)}
        >
          <SettingField
            label={tr("pages.admin_settings.playback_settings.mark_watched_at")}
            type="number"
            unit="%"
            value={form.getValue("playback.watched_threshold")}
            onChange={(v) => form.setValue("playback.watched_threshold", v)}
            restartRequired={restartKeys.has("playback.watched_threshold")}
          />
          <SettingField
            label={tr("pages.admin_settings.playback_settings.show_in_continue_watching_after")}
            type="number"
            unit="%"
            description={tr(
              "pages.admin_settings.playback_settings.progress_below_this_is_ignored",
            )}
            value={form.getValue("playback.min_resume_threshold")}
            onChange={(v) => form.setValue("playback.min_resume_threshold", v)}
            restartRequired={restartKeys.has("playback.min_resume_threshold")}
          />
        </FieldGroup>
      </div>

      <SaveBar
        dirtyCount={form.dirtyCount}
        onSave={form.save}
        onDiscard={form.discard}
        isSaving={form.isSaving}
      />
    </div>
  );
}

function formatResolved(resolved: string): string {
  switch (resolved) {
    case "qsv":
      return "Intel Quick Sync (QSV)";
    case "vaapi":
      return "VA-API";
    case "nvenc":
      return "NVIDIA NVENC";
    case "videotoolbox":
      return "VideoToolbox (macOS)";
    case "none":
      return "Software";
    default:
      return resolved;
  }
}

/**
 * One-line detection result, e.g. "Detected VA-API on renderD128". Returns
 * undefined while nothing has been probed yet so the caller can show its own
 * "detecting" state instead of an empty phrase.
 */
function describeDetection(detection: HWAccelInfo | undefined): string | undefined {
  if (!detection) return undefined;
  if (detection.resolved === "none") return "No supported graphics hardware found";
  const device = detection.render_devices?.[0];
  const onNode = detection.source === "transcode_node" ? " (transcode node)" : "";
  return `Detected ${formatResolved(detection.resolved)}${device ? ` on ${device}` : ""}${onNode}`;
}
