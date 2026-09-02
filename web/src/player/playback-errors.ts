import { PlayerFetchError } from "./player-fetch";
import type { TerminalV3 } from "./protocol-v3";

import { tr } from "@/i18n/translate";

export interface PlaybackPolicyErrorDescription {
  title: string;
  message: string;
}

/**
 * Turns a v3 terminal into something a person can act on.
 *
 * Under protocol v3 a refused plan is not an HTTP error: the start endpoint
 * answers `201` and the replan endpoint `200`, and the decision lives in the
 * body's `terminal`. The status code only describes the request. So the whole
 * "playback was refused" surface is reason-keyed, and the server's own
 * `terminal.message` is the fallback for reasons this table does not name.
 */
export function describePlanTerminal(terminal: TerminalV3): PlaybackPolicyErrorDescription {
  switch (terminal.reason) {
    case "transcoding_disabled":
      return {
        title: tr("player.playback_errors.transcoding_is_disabled"),
        get message() {
          return tr(
            "player.playback_errors.transcoding_is_disabled_for_your_user_ask_your_server_administrator",
          );
        },
      };
    case "audio_transcoding_disabled":
      return {
        title: tr("player.playback_errors.audio_transcoding_is_disabled"),
        get message() {
          return tr(
            "player.playback_errors.this_item_requires_audio_conversion_but_audio_transcoding_is_disabled",
          );
        },
      };
    case "source_unavailable":
      return {
        title: tr("player.playback_errors.this_video_is_no_longer_available"),
        get message() {
          return tr("player.playback_errors.the_file_needed_to_play_it_can_t_be_found");
        },
      };
    case "source_metadata_incomplete":
      return {
        title: tr("player.playback_errors.this_file_hasn_t_finished_scanning"),
        get message() {
          return tr("player.playback_errors.silo_doesn_t_know_enough_about_this_file_yet_to");
        },
      };
    case "client_hls_unsupported":
      return {
        title: tr("player.playback_errors.this_browser_can_t_play_the_stream"),
        get message() {
          return tr(
            "player.playback_errors.playing_this_file_needs_hls_which_this_browser_doesn_t",
          );
        },
      };
    case "adaptation_exhausted":
    case "adaptation_unavailable":
      return {
        title: tr("player.playback_errors.no_playable_version_found"),
        get message() {
          return tr("player.playback_errors.silo_couldn_t_find_a_way_to_play_this_file");
        },
      };
    case "no_alternate_version":
      return {
        title: tr("player.playback_errors.no_playable_version_found"),
        // The server names the policy that ruled the source out (4K
        // transcoding disabled, for one); the generic sentence only covers a
        // missing message.
        get message() {
          return terminal.message?.trim()
            ? tr.remote({ message: terminal.message.trim() })
            : tr("player.playback_errors.silo_couldn_t_find_a_way_to_play_this_file");
        },
      };
    case "hdr_transcode_unsupported":
    case "dv_conversion_unsupported":
      return {
        title: tr("player.playback_errors.this_hdr_format_can_t_be_converted"),
        get message() {
          return tr("player.playback_errors.this_file_s_dynamic_range_can_t_be_converted_for");
        },
      };
    case "video_conversion_unsupported":
    case "audio_conversion_unsupported":
      return {
        title: tr("player.playback_errors.this_file_can_t_be_converted"),
        get message() {
          return tr(
            "player.playback_errors.silo_can_t_convert_this_file_into_something_this_device",
          );
        },
      };
    case "conversion_tool_unavailable":
    case "transcode_node_unavailable":
    case "transcode_node_capability_unavailable":
    case "transcode_start_failed":
      return {
        title: tr("player.playback_errors.playback_unavailable"),
        // The server names which part of the conversion path failed (no
        // transcode node, settings unavailable, transport refused to start);
        // the generic sentence only covers a missing message.
        get message() {
          return terminal.message?.trim()
            ? tr.remote({ message: terminal.message.trim() })
            : tr(
                "player.playback_errors.the_server_couldn_t_start_converting_this_file_please_try",
              );
        },
      };
    case "capacity_unavailable":
      return {
        title: tr("player.playback_errors.the_server_is_busy"),
        get message() {
          return tr("player.playback_errors.there_s_no_capacity_to_convert_this_file_right_now");
        },
      };
    case "session_expired":
      return {
        title: tr("player.playback_errors.playback_session_expired"),
        get message() {
          return tr(
            "player.playback_errors.this_playback_session_is_no_longer_active_start_it_again",
          );
        },
      };
    case "policy_denied":
      return {
        title: tr("player.playback_errors.playback_unavailable"),
        get message() {
          return tr("player.playback_errors.you_do_not_have_permission_to_play_this_item");
        },
      };
    case "subtitle_burn_in_source_unsupported":
    case "subtitle_codec_unsupported":
    case "subtitle_conversion_unsupported":
    case "subtitle_track_invalid":
    case "subtitle_track_unavailable":
    case "subtitle_unavailable_in_version":
    case "subtitle_artifact_unavailable":
      return {
        title: tr("player.playback_errors.that_subtitle_track_can_t_be_used"),
        // The server names the specific blocker (burn-in required, source
        // unsupported); the generic sentence only covers a missing message.
        get message() {
          return terminal.message?.trim()
            ? tr.remote({ message: terminal.message.trim() })
            : tr(
                "player.playback_errors.silo_couldn_t_prepare_the_selected_subtitles_for_this_device",
              );
        },
      };
    default:
      return {
        title: tr("player.playback_errors.playback_unavailable"),
        get message() {
          return terminal.message?.trim()
            ? tr.remote({ message: terminal.message.trim() })
            : tr("player.playback_errors.silo_could_not_start_playback");
        },
      };
  }
}

/**
 * Describes the transport-level failures the v3 endpoints still express as HTTP
 * status codes, which are the ones about the *request* rather than the plan.
 * `426` is the one clients must render distinctly: it means this build is too
 * old for the server's protocol and no amount of retrying will help.
 */
export function describePlaybackTransportError(
  error: unknown,
): PlaybackPolicyErrorDescription | null {
  if (!(error instanceof PlayerFetchError)) {
    return null;
  }

  if (error.status === 426 || error.code === "client_upgrade_required") {
    return {
      title: tr("player.playback_errors.update_required"),
      get message() {
        return tr(
          "player.playback_errors.this_server_speaks_a_newer_playback_protocol_than_this_app",
        );
      },
    };
  }

  if (error.code === "playback_session_not_found") {
    return {
      title: tr("player.playback_errors.playback_session_expired"),
      get message() {
        return tr(
          "player.playback_errors.this_playback_session_is_no_longer_active_start_it_again",
        );
      },
    };
  }

  if (error.status === 404) {
    return {
      title: tr("player.playback_errors.this_item_is_no_longer_available"),
      get message() {
        return tr("player.playback_errors.the_file_needed_to_play_this_item_can_t_be");
      },
    };
  }

  if (error.status === 401 || error.status === 403) {
    return {
      title: tr("player.playback_errors.playback_unavailable"),
      get message() {
        return tr("player.playback_errors.you_do_not_have_permission_to_play_this_item");
      },
    };
  }

  if (error.status >= 500) {
    return {
      title: tr("player.playback_errors.playback_unavailable"),
      get message() {
        return tr(
          "player.playback_errors.silo_could_not_start_playback_right_now_please_try_again",
        );
      },
    };
  }

  return null;
}
