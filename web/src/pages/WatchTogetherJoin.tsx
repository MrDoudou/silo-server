import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { ApiClientError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useViewTransitionNavigate } from "@/hooks/useViewTransition";
import {
  createWatchTogetherRoom,
  joinWatchTogetherRoom,
  type WatchTogetherSelectionMode,
} from "@/lib/watchTogether";
import { useUILanguage } from "@/i18n/uiText";

import { tr } from "@/i18n/translate";

function describeJoinError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 404) {
      return tr("pages.watch_together_join.room_not_found");
    }
    if (error.status === 410) {
      return tr("pages.watch_together_join.that_room_is_no_longer_active");
    }
    return tr.error("errors.common.request_failed", error);
  }

  return tr.error("errors.watch_together_join.failed_to_join_room", error);
}

const selectionModeOptions = [
  {
    value: "host_pick",
    get title() {
      return tr("pages.watch_together_join.host_picks");
    },
    caption: "Host decides what to watch.",
  },
  {
    value: "vote",
    get title() {
      return tr("pages.watch_together_join.vote_together");
    },
    caption: "Everyone suggests and votes.",
  },
] as const satisfies ReadonlyArray<{
  value: WatchTogetherSelectionMode;
  title: string;
  caption: string;
}>;

export default function WatchTogetherJoin() {
  useUILanguage();
  useDocumentTitle(tr("pages.watch_together_join.watch_party"));
  const navigate = useViewTransitionNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const [code, setCode] = useState("");
  const [selectionMode, setSelectionMode] = useState<WatchTogetherSelectionMode>("host_pick");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modeButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const hasInviteToken = token !== "";

  const handleModeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      let nextIndex: number | null = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        nextIndex = (index + 1) % selectionModeOptions.length;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        nextIndex = (index - 1 + selectionModeOptions.length) % selectionModeOptions.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = selectionModeOptions.length - 1;
      }
      if (nextIndex === null) {
        return;
      }
      const nextOption = selectionModeOptions[nextIndex];
      if (!nextOption) {
        return;
      }
      event.preventDefault();
      setSelectionMode(nextOption.value);
      modeButtonRefs.current[nextIndex]?.focus();
    },
    [],
  );

  const joinRoom = useCallback(
    async (input: { code?: string; join_token?: string }) => {
      setJoining(true);
      setError(null);
      try {
        const response = await joinWatchTogetherRoom(input);
        if (!response.room_access_token) {
          throw new Error("Room access token was missing from the join response.");
        }
        navigate(`/rooms/${response.room.room_id}?room_token=${response.room_access_token}`, {
          replace: true,
        });
      } catch (joinError) {
        setError(describeJoinError(joinError));
      } finally {
        setJoining(false);
      }
    },
    [navigate],
  );

  const createRoom = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const response = await createWatchTogetherRoom({ selection_mode: selectionMode });
      if (!response.room_access_token) {
        throw new Error("Room access token was missing from the create response.");
      }
      navigate(`/rooms/${response.room.room_id}?room_token=${response.room_access_token}`, {
        replace: true,
      });
    } catch (createError) {
      setError(tr.error("errors.watch_together_join.failed_to_create_room", createError));
    } finally {
      setCreating(false);
    }
  }, [navigate, selectionMode]);

  useEffect(() => {
    if (!hasInviteToken) {
      return;
    }

    void joinRoom({ join_token: token });
  }, [hasInviteToken, joinRoom, token]);

  const headline = useMemo(
    () => (hasInviteToken ? "Joining Watch Party" : "Create or Join a Watch Party"),
    [hasInviteToken],
  );

  // While an invite token is being auto-joined (and hasn't failed yet), show a
  // pending state instead of the full create/join form.
  const autoJoinPending = hasInviteToken && !error;

  if (autoJoinPending) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-4 px-6 py-24 text-center">
        <div
          aria-hidden="true"
          className="border-foreground/20 border-t-foreground h-8 w-8 animate-spin rounded-full border-2"
        />
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{headline}</h1>
        <p className="text-muted-foreground max-w-sm text-sm" role="status">
          {tr("pages.watch_together_join.hang_tight_we_re_taking_you_into_the_room")}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-10 sm:px-8">
      <div className="max-w-2xl">
        <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">
          {tr("pages.watch_together_join.watch_party")}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{headline}</h1>
        <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-6">
          {tr("pages.watch_together_join.start_an_empty_room_invite_people_in_then_choose_what")}
        </p>
      </div>

      {/* ─── How it works ─── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface-panel-subtle rounded-xl p-4">
          <div className="text-foreground/50 mb-1.5 text-[11px] font-semibold tracking-[0.15em] uppercase">
            {tr("pages.watch_together_join.synced_playback")}
          </div>
          <p className="text-foreground/65 text-sm leading-relaxed">
            {tr(
              "pages.watch_together_join.everyone_watches_in_sync_when_someone_seeks_or_the_host",
            )}
          </p>
        </div>
        <div className="surface-panel-subtle rounded-xl p-4">
          <div className="text-foreground/50 mb-1.5 text-[11px] font-semibold tracking-[0.15em] uppercase">
            {tr("pages.watch_together_join.playback_controls")}
          </div>
          <p className="text-foreground/65 text-sm leading-relaxed">
            {tr("pages.watch_together_join.by_default_only_the_host_can_play_pause_and_seek")}
          </p>
        </div>
        <div className="surface-panel-subtle rounded-xl p-4">
          <div className="text-foreground/50 mb-1.5 text-[11px] font-semibold tracking-[0.15em] uppercase">
            {tr("pages.watch_together_join.room_invites")}
          </div>
          <p className="text-foreground/65 text-sm leading-relaxed">
            {tr("pages.watch_together_join.share_the_room_code_or_invite_link_to_let_others")}
          </p>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="surface-panel rounded-xl p-5">
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                {tr("pages.watch_together_join.create_a_room")}
              </h2>
              <p className="text-foreground/55 mt-1 text-sm leading-6">
                {tr("pages.watch_together_join.open_a_lobby_copy_the_invite_and_pick_the_movie")}
              </p>
            </div>

            <div>
              <label id="watch-selection-mode-label" className="text-sm font-medium">
                {tr("pages.watch_together_join.selection_mode")}
              </label>
              <div
                className="mt-2 flex gap-2"
                role="radiogroup"
                aria-labelledby="watch-selection-mode-label"
              >
                {selectionModeOptions.map((option, index) => {
                  const selected = selectionMode === option.value;
                  return (
                    <button
                      key={option.value}
                      ref={(element) => {
                        modeButtonRefs.current[index] = element;
                      }}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => setSelectionMode(option.value)}
                      onKeyDown={(event) => handleModeKeyDown(event, index)}
                      className={
                        "flex-1 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors " +
                        (selected
                          ? "border-foreground/50 bg-accent font-medium"
                          : "text-muted-foreground hover:bg-muted/60")
                      }
                    >
                      <div className="font-medium">{option.title}</div>
                      <div className="text-muted-foreground mt-0.5 text-xs">{option.caption}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <Button
              type="button"
              onClick={() => void createRoom()}
              disabled={creating || joining}
              className="h-11 rounded-lg px-5"
            >
              {creating
                ? tr("pages.watch_together_join.creating")
                : tr("pages.watch_together_join.create_watch_party")}
            </Button>
          </div>
        </section>

        <section className="surface-panel rounded-xl p-5">
          <div className="grid gap-4">
            <div>
              <h2 className="text-lg font-semibold">
                {tr("pages.watch_together_join.join_a_room")}
              </h2>
              <p className="text-foreground/55 mt-1 text-sm leading-6">
                {tr("pages.watch_together_join.have_a_room_code_from_the_host_enter_it_here")}
              </p>
            </div>

            <div className="grid gap-2">
              <label htmlFor="watch-room-code" className="text-sm font-medium">
                {tr("pages.watch_together_join.room_code")}
              </label>
              <Input
                id="watch-room-code"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.toUpperCase());
                  if (error) {
                    setError(null);
                  }
                }}
                maxLength={12}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                placeholder={tr("pages.watch_together_join.abcd1234")}
                disabled={joining || creating}
                className="h-11 text-sm tracking-[0.18em] uppercase"
              />
            </div>

            <Button
              type="button"
              onClick={() => void joinRoom({ code: code.trim().toUpperCase() })}
              disabled={joining || creating || code.trim() === ""}
              className="h-11 rounded-lg px-5"
            >
              {joining
                ? tr("pages.watch_together_join.joining")
                : tr("pages.watch_together_join.join_watch_party")}
            </Button>

            {hasInviteToken ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void joinRoom({ join_token: token })}
                disabled={joining || creating}
                className="h-11 rounded-lg px-5"
              >
                {tr("pages.watch_together_join.retry_invite_link")}
              </Button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
