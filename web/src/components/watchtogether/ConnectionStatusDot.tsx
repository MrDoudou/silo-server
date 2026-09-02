import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

export type WatchTogetherConnectionState = "disconnected" | "connecting" | "connected";

const connectionLabels: Record<WatchTogetherConnectionState, string> = {
  connected: "components.watchtogether.connection_status_dot.connected",
  connecting: "components.watchtogether.connection_status_dot.connecting",
  disconnected: "components.watchtogether.connection_status_dot.disconnected",
};

/**
 * Shared watch-together connection status label. Pair with
 * `ConnectionStatusDot` so every surface uses the same palette + vocabulary.
 */
export function ConnectionStateLabel({ state }: { state: WatchTogetherConnectionState }) {
  useUILanguage();
  return <>{tr(connectionLabels[state] ?? connectionLabels.disconnected)}</>;
}

/** Shared watch-together connection indicator dot. */
export function ConnectionStatusDot({
  state,
  className = "h-2 w-2",
}: {
  state: WatchTogetherConnectionState;
  className?: string;
}) {
  const color =
    state === "connected"
      ? "bg-emerald-400"
      : state === "connecting"
        ? "animate-pulse bg-amber-300"
        : "bg-red-400";
  return (
    <span aria-hidden="true" className={"inline-block rounded-full " + color + " " + className} />
  );
}
