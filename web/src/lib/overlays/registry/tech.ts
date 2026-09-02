import { compactHdrSuffix, prettyResolution } from "@/lib/mediaFormat";
import type { OverlayDef, OverlayIconId } from "../types";

import { tr } from "@/i18n/translate";

// Tech overlays — derived from the media file (codec, container, resolution,
// audio properties). All data flows through OverlaySummary on the backend.

// hdrIcon picks the badge icon for a dynamic-range value. Wordmark icons
// (hdr10, hdr) replace the text label when they spell the same thing (see
// WORDMARK_TEXT), so they are only returned for values they fully express;
// HLG has no mark and renders as a plain text label.
function hdrIcon(value: string | undefined): OverlayIconId | null {
  if (!value) return null;
  if (value.includes("DV")) return "dolby-vision";
  if (value === "HDR10") return "hdr10";
  if (value === "HDR") return "hdr";
  return null;
}

function audioIcon(value: string | undefined): OverlayIconId | null {
  if (!value) return null;
  if (value.toLowerCase() === "atmos") return "atmos";
  return "volume";
}

function videoCodecIcon(value: string | undefined): OverlayIconId | null {
  if (!value) return null;
  if (value === "AV1") return "av1";
  return "film";
}

export const TECH_OVERLAYS: readonly OverlayDef[] = [
  {
    id: "resolution",
    category: "tech",
    get label() {
      return tr("lib.overlays.registry.tech.resolution");
    },
    get description() {
      return tr("lib.overlays.registry.tech.video_resolution_4_k_1080p_720p_etc");
    },
    defaultPosition: "top-left",
    defaultEnabled: true,
    iconId: "monitor",
    iconCapable: true,
    getValue: (d) => prettyResolution(d.resolution),
  },
  {
    id: "hdr",
    category: "tech",
    get label() {
      return tr("lib.overlays.registry.tech.hdr_dolby_vision");
    },
    get description() {
      return tr("lib.overlays.registry.tech.dynamic_range_format_hdr10_dv_hlg");
    },
    defaultPosition: "top-left",
    defaultEnabled: true,
    iconCapable: true,
    getValue: (d) => d.hdr ?? null,
    getIcon: (d) => hdrIcon(d.hdr),
  },
  {
    id: "resolution_hdr",
    category: "tech",
    get label() {
      return tr("lib.overlays.registry.tech.resolution_hdr_combined");
    },
    get description() {
      return tr(
        "lib.overlays.registry.tech.single_badge_combining_resolution_and_dynamic_range_e_g_4",
      );
    },
    defaultPosition: "top-left",
    defaultEnabled: false,
    iconCapable: true,
    getValue: (d) => {
      const res = prettyResolution(d.resolution);
      if (!res) return null;
      const hdr = compactHdrSuffix(d.hdr);
      return hdr ? `${res} ${hdr}` : res;
    },
    // Only the DV circle mark works next to a combined label; a wordmark
    // (HDR10) would visually duplicate the label's HDR suffix.
    getIcon: (d) => (d.hdr?.includes("DV") ? "dolby-vision" : null),
  },
  {
    id: "audio",
    category: "tech",
    get label() {
      return tr("lib.overlays.registry.tech.audio_codec");
    },
    get description() {
      return tr("lib.overlays.registry.tech.audio_codec_atmos_dts_hd_true_hd_etc");
    },
    defaultPosition: "top-left",
    defaultEnabled: true,
    iconCapable: true,
    getValue: (d) => d.audio ?? null,
    getIcon: (d) => audioIcon(d.audio),
  },
  {
    id: "audio_channels",
    category: "tech",
    get label() {
      return tr("lib.overlays.registry.tech.audio_channels");
    },
    get description() {
      return tr("lib.overlays.registry.tech.channel_layout_stereo_5_1_7_1");
    },
    defaultPosition: "top-left",
    defaultEnabled: false,
    iconId: "volume",
    iconCapable: true,
    getValue: (d) => d.audio_channels ?? null,
  },
  {
    id: "video_codec",
    category: "tech",
    get label() {
      return tr("lib.overlays.registry.tech.video_codec");
    },
    get description() {
      return tr("lib.overlays.registry.tech.video_codec_h_264_h_265_av1");
    },
    defaultPosition: "top-left",
    defaultEnabled: false,
    iconId: "film",
    iconCapable: true,
    getValue: (d) => d.video_codec ?? null,
    getIcon: (d) => videoCodecIcon(d.video_codec),
  },
  {
    id: "container",
    category: "tech",
    get label() {
      return tr("lib.overlays.registry.tech.container");
    },
    get description() {
      return tr("lib.overlays.registry.tech.file_container_mkv_mp4_etc");
    },
    defaultPosition: "bottom-left",
    defaultEnabled: false,
    iconCapable: false,
    getValue: (d) => d.container ?? null,
  },
  {
    id: "aspect_ratio",
    category: "tech",
    get label() {
      return tr("lib.overlays.registry.tech.aspect_ratio");
    },
    get description() {
      return tr("lib.overlays.registry.tech.display_aspect_ratio_16_9_2_39_1_etc");
    },
    defaultPosition: "bottom-right",
    defaultEnabled: false,
    iconId: "layout",
    iconCapable: true,
    getValue: (d) => d.aspect_ratio ?? null,
  },
  {
    id: "release_type",
    category: "tech",
    get label() {
      return tr("lib.overlays.registry.tech.release_type");
    },
    get description() {
      return tr("lib.overlays.registry.tech.source_format_remux_blu_ray_web_dl_etc");
    },
    defaultPosition: "bottom-left",
    defaultEnabled: true,
    iconCapable: false,
    getValue: (d) => d.release_type ?? null,
  },
  {
    id: "edition",
    category: "tech",
    get label() {
      return tr("lib.overlays.registry.tech.edition");
    },
    get description() {
      return tr("lib.overlays.registry.tech.edition_label_from_the_best_available_media_version");
    },
    defaultPosition: "bottom-left",
    defaultEnabled: false,
    iconCapable: false,
    getValue: (d) => d.edition ?? null,
  },
  {
    id: "multi_audio",
    category: "tech",
    get label() {
      return tr("lib.overlays.registry.tech.multi_audio");
    },
    get description() {
      return tr("lib.overlays.registry.tech.shown_when_the_file_has_audio_in_2_languages");
    },
    defaultPosition: "bottom-right",
    defaultEnabled: false,
    iconId: "languages",
    iconCapable: true,
    getValue: (d) => (d.multi_audio ? "Multi-Audio" : null),
  },
  {
    id: "multi_sub",
    category: "tech",
    get label() {
      return tr("lib.overlays.registry.tech.subtitles_available");
    },
    get description() {
      return tr("lib.overlays.registry.tech.shown_when_the_file_has_any_subtitle_track");
    },
    defaultPosition: "bottom-right",
    defaultEnabled: false,
    iconId: "subtitles",
    iconCapable: true,
    getValue: (d) => (d.multi_sub ? "CC" : null),
  },
];
