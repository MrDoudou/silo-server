import { toast } from "@/i18n/toast";

import {
  buildWatchTogetherInviteUrl,
  type GuestControlPolicy,
  type WatchTogetherRoomSnapshot,
} from "@/lib/watchTogether";
import { copyTextToClipboard } from "@/lib/clipboard";
import { tr } from "@/i18n/translate";

/**
 * Copies the room invite link to the clipboard with toast feedback.
 * Returns false when the invite link is not available yet (no toast is shown),
 * so callers can surface their own "not ready" message.
 */
export async function copyWatchTogetherInvite(
  invitePath: string | null | undefined,
  roomCode?: string | null,
): Promise<boolean> {
  const inviteUrl = buildWatchTogetherInviteUrl(invitePath);
  if (!inviteUrl) {
    return false;
  }
  try {
    await copyTextToClipboard(inviteUrl);
    toast.success("feedback.watch_together_actions.reported_message", {
      values: {
        message: roomCode
          ? tr("feedback.watch_together_actions.invite_copied_room_code_code", { code: roomCode })
          : "Invite copied",
      },
    });
  } catch {
    toast.error("errors.watch_together_actions.failed_to_copy_invite_link");
  }
  return true;
}

/** Applies a guest-control policy change with toast feedback. */
export async function setWatchTogetherGuestControl(
  updatePolicy: (policy: GuestControlPolicy) => Promise<WatchTogetherRoomSnapshot | null>,
  policy: GuestControlPolicy,
): Promise<void> {
  try {
    const nextRoom = await updatePolicy(policy);
    if (nextRoom) {
      toast.success("feedback.watch_together_actions.reported_message", {
        values: {
          message:
            nextRoom.guest_control_policy === "guest_play_pause"
              ? "Guests can now pause and resume"
              : "Room is now host controlled",
        },
      });
    }
  } catch (error) {
    toast.error("errors.watch_together_actions.failed_to_update_room", { error: error });
  }
}

/** Ends the watch party with toast feedback. */
export async function endWatchTogetherRoom(closeRoom: () => Promise<void>): Promise<void> {
  try {
    await closeRoom();
    toast.success("feedback.watch_together_actions.room_ended");
  } catch (error) {
    toast.error("errors.watch_together_actions.failed_to_end_room", { error: error });
  }
}
