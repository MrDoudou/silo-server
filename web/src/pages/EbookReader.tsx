import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent,
} from "react";
import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  GripHorizontal,
  Highlighter,
  Library,
  ListTree,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  RotateCcw,
  Ruler,
  Search,
  Settings,
  StickyNote,
  Square,
  Trash2,
  Type,
  Volume2,
} from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

import type { FileVersion } from "@/api/types";
import PageBack from "@/components/PageBack";
import { Button } from "@/components/ui/button";
import { useScreenWakeLock } from "@/hooks/useScreenWakeLock";
import { useTTS } from "@/hooks/useTTS";
import { useCatalogItemDetail } from "@/hooks/queries/catalogRead";
import { useViewTransitionNavigate } from "@/hooks/useViewTransition";
import { hasEarlierEntry } from "@/lib/navigationHistory";
import { buildItemHref, buildMediaPlayHref } from "@/lib/mediaNavigation";
import { buildMangaList, flattenMangaList } from "@/lib/mangaChapters";
import { cn } from "@/lib/utils";
import type { TOCItem } from "@/reader/readest/libs/document";
import FoliateBookReader, {
  DEFAULT_READER_SETTINGS,
  READER_FONT_STACKS,
  formatReaderProgress,
  isReaderSupportedFile,
  normalizeReaderSettings,
  parseReaderLocation,
  readerFileFormat,
  type FoliateBookReaderHandle,
  type ReaderLoadState,
  type ReaderSearchResult,
  type ReaderSelection,
  type ReaderSettings,
} from "@/reader/FoliateBookReader";
import {
  createEbookReaderAnnotation,
  deleteEbookReaderAnnotation,
  fetchEbookReaderAnnotations,
  fetchEbookReaderConfig,
  saveEbookReaderConfig,
  saveEbookReaderConfigKeepalive,
  type EbookReaderAnnotation,
} from "@/reader/ebookReaderApi";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

export const EBOOK_READER_SETTINGS_STORAGE_KEY = "silo.ebook.reader.settings";

type ReaderPanel = "toc" | "search" | "notes" | "settings";

type TocEntry = TOCItem & {
  depth: number;
};

const READER_FONT_OPTIONS = [
  {
    get label() {
      return tr("pages.ebook_reader.book_default");
    },
    value: READER_FONT_STACKS.inherit,
  },
  {
    get label() {
      return tr("pages.ebook_reader.system_serif");
    },
    value: READER_FONT_STACKS.serif,
  },
  {
    get label() {
      return tr("pages.ebook_reader.system_sans");
    },
    value: READER_FONT_STACKS.sans,
  },
  {
    get label() {
      return tr("pages.ebook_reader.monospace");
    },
    value: READER_FONT_STACKS.mono,
  },
] as const;

const READER_PROFILES = [
  {
    id: "comfortable",
    get label() {
      return tr("pages.ebook_reader.comfortable");
    },
    get description() {
      return tr("pages.ebook_reader.serif_roomier_lines");
    },
    settings: {
      fontFamily: READER_FONT_STACKS.serif,
      fontSize: 112,
      lineHeight: 1.75,
      margin: 28,
    },
  },
  {
    id: "accessible",
    get label() {
      return tr("pages.ebook_reader.accessible");
    },
    get description() {
      return tr("pages.ebook_reader.larger_sans_text");
    },
    settings: {
      fontFamily: READER_FONT_STACKS.sans,
      fontSize: 126,
      lineHeight: 1.9,
      margin: 32,
    },
  },
  {
    id: "compact",
    get label() {
      return tr("pages.ebook_reader.compact");
    },
    get description() {
      return tr("pages.ebook_reader.more_words_per_page");
    },
    settings: {
      fontFamily: READER_FONT_STACKS.inherit,
      fontSize: 96,
      lineHeight: 1.5,
      margin: 16,
    },
  },
] as const;

function profileIsActive(profile: (typeof READER_PROFILES)[number], settings: ReaderSettings) {
  return Object.entries(profile.settings).every(
    ([key, value]) => settings[key as keyof ReaderSettings] === value,
  );
}

// Approximates one rendered text line: the renderer sizes type at fontSize% of the
// 16px browser base, but publisher CSS may override sizes per element, so the band
// is a reading guide rather than an exact line match.
function rulerBandHeight(settings: ReaderSettings): number {
  const approxLinePx = 16 * (settings.fontSize / 100) * settings.lineHeight;
  return Math.min(96, Math.max(28, Math.round(approxLinePx) + 6));
}

function clampRulerTop(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function chooseReaderFile(
  files: FileVersion[],
  requestedID: number | null,
): FileVersion | undefined {
  const requested = requestedID ? files.find((file) => file.file_id === requestedID) : undefined;
  if (requested && isReaderSupportedFile(requested)) return requested;
  return (
    files.find((file) => readerFileFormat(file) === "epub") ??
    files.find((file) => isReaderSupportedFile(file)) ??
    files[0]
  );
}

function readerFileLabel(file: FileVersion): string {
  const format = readerFileFormat(file).toUpperCase();
  const name = file.file_name || file.file_path?.split(/[\\/]/).pop() || `File ${file.file_id}`;
  return format ? `${format} · ${name}` : name;
}

function flattenToc(items: TOCItem[] = [], depth = 0): TocEntry[] {
  return items.flatMap((item) => [
    { ...item, depth },
    ...flattenToc(item.subitems ?? [], depth + 1),
  ]);
}

function readerStorage(): Storage | null {
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadStoredReaderSettings(): ReaderSettings {
  try {
    const raw = readerStorage()?.getItem(EBOOK_READER_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_READER_SETTINGS;
    return normalizeReaderSettings(JSON.parse(raw) as Partial<ReaderSettings>);
  } catch {
    return DEFAULT_READER_SETTINGS;
  }
}

function saveReaderSettings(settings: ReaderSettings) {
  readerStorage()?.setItem(EBOOK_READER_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export default function EbookReader() {
  useUILanguage();
  const { contentId = "" } = useParams<{ contentId: string }>();
  // Swapping the open file re-renders the reader in place, so it stays on the
  // plain navigate; only leaving the reader is a page transition.
  const navigate = useNavigate();
  const exitReader = useViewTransitionNavigate();
  const [searchParams] = useSearchParams();
  const requestedFileID = Number(searchParams.get("file_id") || "");
  const libraryIdParam = searchParams.get("libraryId");
  // Manga chapter rows pass an explicit backTo target (the manga series detail)
  // so the reader's back action returns to the series instead of the chapter's
  // own junk item detail — which would loop straight back into the reader.
  // Absent for normal ebooks, so their back behavior is unchanged.
  const backToParam = searchParams.get("backTo");
  const { data: item, isLoading, error } = useCatalogItemDetail(contentId || undefined);
  // Manga chapters carry their owning series id; fetching the series detail
  // (usually already cached from the series page) gives the ordered chapter
  // list, which powers next-chapter navigation and the default back target.
  const mangaSeriesId = item?.type === "ebook" ? item.series_id : undefined;
  const { data: mangaSeries } = useCatalogItemDetail(mangaSeriesId || undefined);
  const nextChapter = useMemo(() => {
    const seriesChapters = mangaSeries?.manga?.chapters;
    if (!seriesChapters || seriesChapters.length === 0) {
      return null;
    }
    const flat = flattenMangaList(buildMangaList(seriesChapters));
    const index = flat.findIndex((entry) => entry.chapter.content_id === contentId);
    if (index < 0 || index + 1 >= flat.length) {
      return null;
    }
    return flat[index + 1];
  }, [contentId, mangaSeries?.manga?.chapters]);
  const selectedFile = useMemo(
    () =>
      chooseReaderFile(
        item?.versions ?? [],
        Number.isFinite(requestedFileID) ? requestedFileID : null,
      ),
    [item?.versions, requestedFileID],
  );
  const readerFiles = useMemo(
    () => (item?.versions ?? []).filter((file) => isReaderSupportedFile(file)),
    [item?.versions],
  );
  const format = readerFileFormat(selectedFile);
  // Comic archives are image books: prose chrome (TTS, typography, reading
  // ruler) is meaningless and the side panel steals width the pages need, so
  // it starts closed (the toggle still opens it).
  const isComicFormat = format === "cbz" || format === "cbr";
  const readerRef = useRef<FoliateBookReaderHandle>(null);
  const [loadedFile, setLoadedFile] = useState<ReaderLoadState | null>(null);
  const [readerProgress, setReaderProgress] = useState<number | null>(null);
  const [toc, setToc] = useState<TOCItem[]>([]);
  const [panelOpen, setPanelOpen] = useState(true);
  const comicPanelInitRef = useRef(false);
  useEffect(() => {
    if (isComicFormat && !comicPanelInitRef.current) {
      comicPanelInitRef.current = true;
      setPanelOpen(false);
    }
  }, [isComicFormat]);
  const [panel, setPanel] = useState<ReaderPanel>("toc");
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() =>
    loadStoredReaderSettings(),
  );
  const [annotations, setAnnotations] = useState<EbookReaderAnnotation[]>([]);
  const [selection, setSelection] = useState<ReaderSelection | null>(null);
  const [wakeLockEnabled, setWakeLockEnabled] = useState(false);
  const [ttsRate, setTtsRate] = useState(1);
  const [ttsVoiceURI, setTtsVoiceURI] = useState("");
  const rulerDragRef = useRef<{ offsetY: number; surface: DOMRect; top: number } | null>(null);
  const [rulerDragTop, setRulerDragTop] = useState<number | null>(null);
  const readingSurfaceRef = useRef<HTMLElement | null>(null);
  const tts = useTTS();
  useScreenWakeLock(wakeLockEnabled);
  const configLoadedRef = useRef(false);
  // Tracks settings the user changed in this session so a slow server config
  // fetch cannot clobber them after the fact.
  const settingsDirtyRef = useRef(false);
  // Mirrors readerSettings synchronously so updates merge correctly even when
  // several setting changes land in the same render batch.
  const readerSettingsRef = useRef(readerSettings);
  const saveConfigTimerRef = useRef<number | null>(null);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<ReaderSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const progressLabel = formatReaderProgress(readerProgress);
  const tocEntries = useMemo(() => flattenToc(toc), [toc]);
  const handleFileLoaded = useCallback((state: ReaderLoadState | null) => {
    setLoadedFile(state);
  }, []);
  const handleProgressChange = useCallback((progress: number | null) => {
    setReaderProgress(progress);
  }, []);
  const handleReaderReady = useCallback(({ toc: readyToc }: { toc: TOCItem[] }) => {
    setToc(readyToc);
  }, []);
  const reloadAnnotations = useCallback(async () => {
    if (!contentId) return;
    setAnnotations(await fetchEbookReaderAnnotations(contentId));
  }, [contentId]);
  const handleFileChange = useCallback(
    (fileID: string) => {
      if (!contentId) return;
      const nextParams = new URLSearchParams();
      nextParams.set("file_id", fileID);
      if (libraryIdParam) {
        nextParams.set("libraryId", libraryIdParam);
      }
      navigate(`/reader/ebook/${encodeURIComponent(contentId)}?${nextParams.toString()}`, {
        replace: true,
      });
    },
    [contentId, libraryIdParam, navigate],
  );
  const updateReaderSettings = useCallback(
    (next: Partial<ReaderSettings>) => {
      const merged = normalizeReaderSettings({ ...readerSettingsRef.current, ...next });
      readerSettingsRef.current = merged;
      settingsDirtyRef.current = true;
      setReaderSettings(merged);
      saveReaderSettings(merged);
      if (contentId && configLoadedRef.current) {
        if (saveConfigTimerRef.current !== null) {
          window.clearTimeout(saveConfigTimerRef.current);
        }
        saveConfigTimerRef.current = window.setTimeout(() => {
          saveConfigTimerRef.current = null;
          void saveEbookReaderConfig(contentId, { settings: merged });
        }, 400);
      }
    },
    [contentId],
  );
  const resetReaderSettings = useCallback(() => {
    const defaults = normalizeReaderSettings(DEFAULT_READER_SETTINGS);
    if (saveConfigTimerRef.current !== null) {
      window.clearTimeout(saveConfigTimerRef.current);
      saveConfigTimerRef.current = null;
    }
    readerSettingsRef.current = defaults;
    settingsDirtyRef.current = true;
    saveReaderSettings(defaults);
    setReaderSettings(defaults);
    if (contentId) {
      void saveEbookReaderConfig(contentId, { settings: defaults });
    }
  }, [contentId]);
  const handleSearchSubmit = useCallback(async () => {
    const query = searchText.trim();
    if (!query) {
      setSearchResults([]);
      readerRef.current?.clearSearch();
      return;
    }
    setSearching(true);
    try {
      setSearchResults(await (readerRef.current?.search(query) ?? Promise.resolve([])));
    } finally {
      setSearching(false);
    }
  }, [searchText]);
  const handleProgressScrub = useCallback((value: string) => {
    const next = Math.min(1, Math.max(0, Number(value) / 100));
    if (!Number.isFinite(next)) return;
    setReaderProgress(next);
    void readerRef.current?.goToFraction(next);
  }, []);
  const handleCreateHighlight = useCallback(async () => {
    if (!contentId || !selection) return;
    const created = await createEbookReaderAnnotation(contentId, {
      kind: "highlight",
      cfi_range: selection.cfi,
      selected_text: selection.selectedText,
      style: "highlight",
      color: "#facc15",
    });
    setAnnotations((current) => [created, ...current]);
    readerRef.current?.clearSelection();
    setSelection(null);
  }, [contentId, selection]);
  const handleCreateBookmark = useCallback(async () => {
    if (!contentId) return;
    const location = selection?.cfi || `fraction:${(readerProgress ?? 0).toFixed(6)}`;
    const created = await createEbookReaderAnnotation(contentId, {
      kind: "bookmark",
      location,
      note: item?.title || "Bookmark",
    });
    setAnnotations((current) => [created, ...current]);
    setPanel("notes");
  }, [contentId, item?.title, readerProgress, selection]);
  const handleAnnotationNavigate = useCallback((annotation: EbookReaderAnnotation) => {
    // Toolbar bookmarks store synthetic "fraction:<n>" locations that foliate's
    // goTo cannot resolve; route those through goToFraction instead.
    const target = parseReaderLocation(annotation.cfi_range || annotation.location);
    if (!target) return;
    if (target.type === "fraction") {
      void readerRef.current?.goToFraction(target.fraction);
    } else {
      readerRef.current?.goTo(target.location);
    }
  }, []);
  const handleDeleteAnnotation = useCallback(
    async (annotationID: string) => {
      if (!contentId) return;
      await deleteEbookReaderAnnotation(contentId, annotationID);
      setAnnotations((current) => current.filter((annotation) => annotation.id !== annotationID));
    },
    [contentId],
  );
  const handleSpeak = useCallback(() => {
    const text = readerRef.current?.getReadableText() ?? "";
    tts.speak(text, {
      rate: ttsRate,
      voiceURI: ttsVoiceURI || undefined,
    });
  }, [tts, ttsRate, ttsVoiceURI]);
  // Dragging only moves a local draft so the book renderer and persistence layers
  // are untouched until the pointer is released.
  const effectiveRulerTop = rulerDragTop ?? readerSettings.readingRulerTop;
  const handleRulerPointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const surface = readingSurfaceRef.current?.getBoundingClientRect();
      if (!surface || surface.height === 0) return;
      event.preventDefault();
      const top = readerSettings.readingRulerTop;
      const bandCenterY = surface.top + (surface.height * top) / 100;
      rulerDragRef.current = { offsetY: event.clientY - bandCenterY, surface, top };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [readerSettings.readingRulerTop],
  );
  const handleRulerPointerMove = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const drag = rulerDragRef.current;
    if (!drag) return;
    const next = clampRulerTop(
      ((event.clientY - drag.surface.top - drag.offsetY) / drag.surface.height) * 100,
    );
    drag.top = next;
    setRulerDragTop(next);
  }, []);
  const handleRulerPointerUp = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const drag = rulerDragRef.current;
      if (!drag) return;
      rulerDragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
      setRulerDragTop(null);
      updateReaderSettings({ readingRulerTop: drag.top });
    },
    [updateReaderSettings],
  );
  const handleRulerPointerCancel = useCallback(() => {
    rulerDragRef.current = null;
    setRulerDragTop(null);
  }, []);
  const handleRulerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      const step = (event.shiftKey ? 5 : 1) * (event.key === "ArrowUp" ? -1 : 1);
      updateReaderSettings({
        readingRulerTop: clampRulerTop(readerSettings.readingRulerTop + step),
      });
    },
    [readerSettings.readingRulerTop, updateReaderSettings],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return;
      if (event.key === "ArrowLeft") {
        readerRef.current?.prev();
      } else if (event.key === "ArrowRight") {
        readerRef.current?.next();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!contentId) return;
    let cancelled = false;
    configLoadedRef.current = false;
    settingsDirtyRef.current = false;
    void fetchEbookReaderConfig(contentId)
      .then((config) => {
        if (cancelled) return;
        configLoadedRef.current = true;
        if (settingsDirtyRef.current) {
          // The user already changed settings while the fetch was in flight;
          // persist their choices instead of clobbering them with stale config.
          void saveEbookReaderConfig(contentId, { settings: readerSettingsRef.current });
          return;
        }
        const settings =
          config.settings && typeof config.settings === "object" && !Array.isArray(config.settings)
            ? normalizeReaderSettings(config.settings as Partial<ReaderSettings>)
            : loadStoredReaderSettings();
        readerSettingsRef.current = settings;
        saveReaderSettings(settings);
        setReaderSettings(settings);
      })
      .catch(() => {
        if (!cancelled) {
          configLoadedRef.current = true;
        }
      });
    // A scheduled timer means updateReaderSettings has unsaved settings;
    // consume it exactly once so unmount and pagehide cannot double-send.
    const flushPendingConfigSave = (options?: { keepalive?: boolean }) => {
      if (saveConfigTimerRef.current === null) return;
      window.clearTimeout(saveConfigTimerRef.current);
      saveConfigTimerRef.current = null;
      if (options?.keepalive) {
        saveEbookReaderConfigKeepalive(contentId, { settings: readerSettingsRef.current });
      } else {
        void saveEbookReaderConfig(contentId, { settings: readerSettingsRef.current });
      }
    };
    // At tab close a normal request can be torn down with the page; keepalive
    // lets the debounced save survive unload.
    const flushConfigOnPageHide = () => flushPendingConfigSave({ keepalive: true });
    window.addEventListener("pagehide", flushConfigOnPageHide);
    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", flushConfigOnPageHide);
      // Flush instead of dropping the debounced save: on quick SPA navigation a
      // dropped save would let the stale server config revert the user's last
      // change on next open. The page is still alive here, so a normal
      // authenticated request is fine.
      flushPendingConfigSave();
    };
  }, [contentId]);

  useEffect(() => {
    void reloadAnnotations();
  }, [reloadAnnotations]);
  if (isLoading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="text-muted-foreground size-8 animate-spin" />
      </div>
    );
  }

  if (error || !item || item.type !== "ebook") {
    return (
      <div className="page-shell py-10">
        <PageBack />
        <div className="text-muted-foreground mt-10 text-sm">
          {tr("pages.ebook_reader.ebook_not_found")}
        </div>
      </div>
    );
  }

  // backToParam comes from the URL, so it must be validated before use as an
  // href: only accept a single-leading-slash in-app relative path. This rejects
  // absolute URLs, protocol-relative (`//host`), backslash tricks, and
  // `javascript:`/`data:` schemes (open-redirect / XSS).
  const safeBackTo =
    backToParam && backToParam.startsWith("/") && !/^\/[/\\]/.test(backToParam)
      ? backToParam
      : null;
  const libraryIdNumber = libraryIdParam ? Number(libraryIdParam) : undefined;
  // Manga chapters default their back target to the owning series, so entry
  // points that cannot pass backTo (continue-reading cards, deep links) still
  // escape the chapter's own junk item detail.
  const mangaSeriesHref = mangaSeriesId
    ? buildItemHref({
        contentId: mangaSeriesId,
        libraryId: Number.isFinite(libraryIdNumber) ? libraryIdNumber : undefined,
      })
    : null;
  const backHref =
    safeBackTo ||
    mangaSeriesHref ||
    `/item/${encodeURIComponent(item.content_id)}${
      libraryIdParam ? `?libraryId=${encodeURIComponent(libraryIdParam)}` : ""
    }`;
  const nextChapterHref =
    nextChapter && mangaSeriesHref
      ? buildMediaPlayHref({
          contentId: nextChapter.chapter.content_id,
          type: "ebook",
          libraryId: Number.isFinite(libraryIdNumber) ? libraryIdNumber : undefined,
          backTo: mangaSeriesHref,
        })
      : null;
  const showEndOfBookNext = nextChapterHref != null && (readerProgress ?? 0) >= 0.995;

  if (!selectedFile) {
    return (
      <div className="page-shell py-10">
        <PageBack />
        <div className="text-muted-foreground mt-10 text-sm">
          {tr("pages.ebook_reader.no_ebook_files_found")}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen">
      <header className="border-border/70 bg-background/95 sticky top-0 z-20 border-b backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4">
          <Button asChild variant="ghost" size="icon" aria-label={tr("common.actions.back")}>
            <Link
              to={backHref}
              onClick={(event) => {
                // Exiting the reader must consume the reader's history entry,
                // not push the target on top of it — otherwise pressing back
                // on the destination re-opens the reader (issue #189). The
                // href stays for modified clicks (new tab). A directly opened
                // reader replaces itself with that target so browser Back
                // cannot reopen the reader.
                if (
                  event.defaultPrevented ||
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                ) {
                  return;
                }
                event.preventDefault();
                if (hasEarlierEntry()) {
                  exitReader(-1);
                  return;
                }
                exitReader(backHref, { up: true, replace: true });
              }}
            >
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{item.title}</div>
            <div className="text-muted-foreground truncate text-xs">{format.toUpperCase()}</div>
          </div>
          {nextChapterHref && nextChapter && (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="hidden gap-1 sm:inline-flex"
              title={tr("pages.ebook_reader.next_label", { label: nextChapter.label })}
            >
              <Link to={nextChapterHref} replace>
                <span className="text-muted-foreground max-w-36 truncate text-xs">
                  {nextChapter.label}
                </span>
                <ChevronRight className="size-4" />
              </Link>
            </Button>
          )}
          {progressLabel && (
            <div className="text-muted-foreground hidden min-w-12 text-center text-xs tabular-nums sm:block">
              {progressLabel}
            </div>
          )}
          {isReaderSupportedFile(selectedFile) && readerFiles.length > 1 && (
            <select
              aria-label={tr("pages.ebook_reader.reader_file")}
              value={selectedFile.file_id}
              onChange={(event) => handleFileChange(event.target.value)}
              className="border-border bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/50 hidden h-8 max-w-44 rounded-md border px-2 text-xs outline-none focus-visible:ring-[3px] sm:block"
            >
              {readerFiles.map((file) => (
                <option key={file.file_id} value={file.file_id}>
                  {readerFileLabel(file)}
                </option>
              ))}
            </select>
          )}
          <div className="flex shrink-0 items-center gap-1">
            {selection && (
              <Button
                variant="secondary"
                size="sm"
                aria-label={tr("pages.ebook_reader.highlight_selection")}
                title={tr("pages.ebook_reader.highlight_selection")}
                onClick={() => void handleCreateHighlight()}
              >
                <Highlighter className="size-4" />
                {tr("pages.ebook_reader.highlight")}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={tr("pages.ebook_reader.add_bookmark")}
              title={tr("pages.ebook_reader.add_bookmark")}
              onClick={() => void handleCreateBookmark()}
            >
              <Bookmark className="size-4" />
            </Button>
            {!isComicFormat && (
              <Button
                variant={readerSettings.readingRuler ? "secondary" : "ghost"}
                size="icon-sm"
                aria-label={tr("pages.ebook_reader.toggle_reading_ruler")}
                title={tr("pages.ebook_reader.reading_ruler")}
                onClick={() => updateReaderSettings({ readingRuler: !readerSettings.readingRuler })}
              >
                <Ruler className="size-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={
                panelOpen
                  ? tr("pages.ebook_reader.close_reader_panel")
                  : tr("pages.ebook_reader.open_reader_panel")
              }
              title={
                panelOpen
                  ? tr("pages.ebook_reader.close_reader_panel")
                  : tr("pages.ebook_reader.open_reader_panel")
              }
              onClick={() => setPanelOpen((open) => !open)}
            >
              {panelOpen ? (
                <PanelRightClose className="size-4" />
              ) : (
                <PanelRightOpen className="size-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={tr("pages.ebook_reader.previous_page")}
              title={tr("pages.ebook_reader.previous_page")}
              onClick={() => readerRef.current?.prev()}
            >
              <ChevronLeft className="size-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={tr("pages.ebook_reader.next_page")}
              title={tr("pages.ebook_reader.next_page")}
              onClick={() => readerRef.current?.next()}
            >
              <ChevronRight className="size-5" />
            </Button>
          </div>
          {loadedFile && (
            <Button asChild variant="outline" size="sm">
              <a href={loadedFile.objectUrl} download={loadedFile.filename}>
                <Download className="size-4" />
                {tr("pages.ebook_reader.file")}
              </a>
            </Button>
          )}
        </div>
        <div className="border-border/60 flex h-10 items-center gap-3 border-t px-4">
          <BookOpen className="text-muted-foreground size-4 shrink-0" />
          <input
            aria-label={tr("pages.ebook_reader.reading_progress")}
            type="range"
            min="0"
            max="100"
            step="1"
            value={Math.round((readerProgress ?? 0) * 100)}
            onChange={(event) => handleProgressScrub(event.target.value)}
            className="accent-primary h-2 min-w-0 flex-1"
          />
          <div className="text-muted-foreground w-11 text-right text-xs tabular-nums">
            {progressLabel ?? tr("pages.ebook_reader.value_0")}
          </div>
        </div>
      </header>

      <main
        className={cn(
          "grid h-[calc(100vh-6rem)] min-h-0 w-full overflow-hidden",
          panelOpen ? "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem]" : "grid-cols-1",
        )}
      >
        {isReaderSupportedFile(selectedFile) ? (
          <section ref={readingSurfaceRef} className="relative min-h-0 min-w-0 overflow-hidden">
            <FoliateBookReader
              ref={readerRef}
              contentID={contentId}
              file={selectedFile}
              title={item.title}
              settings={readerSettings}
              annotations={annotations}
              onFileLoaded={handleFileLoaded}
              onProgressChange={handleProgressChange}
              onReady={handleReaderReady}
              onSelectionChange={setSelection}
            />
            {readerSettings.readingRuler && (
              <div
                className="pointer-events-none absolute inset-x-0 z-10 -translate-y-1/2 border-y border-yellow-400/70 bg-yellow-200/15"
                style={{
                  top: `${effectiveRulerTop}%`,
                  height: `${rulerBandHeight(readerSettings)}px`,
                  boxShadow:
                    "0 -100vh 0 100vh rgb(0 0 0 / 0.24), 0 100vh 0 100vh rgb(0 0 0 / 0.24)",
                }}
              >
                <button
                  type="button"
                  role="slider"
                  aria-label={tr("pages.ebook_reader.reading_ruler_position")}
                  aria-orientation="vertical"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(effectiveRulerTop)}
                  aria-valuetext={`${Math.round(effectiveRulerTop)}%`}
                  title={tr("pages.ebook_reader.drag_to_reposition_the_reading_ruler")}
                  className="focus-visible:ring-ring/50 pointer-events-auto absolute top-1/2 right-2 flex h-11 w-6 -translate-y-1/2 cursor-ns-resize touch-none items-center justify-center rounded-md border border-yellow-500/60 bg-yellow-400/90 text-yellow-950 shadow-sm transition-colors select-none hover:bg-yellow-300 focus-visible:ring-[3px] focus-visible:outline-none"
                  onPointerDown={handleRulerPointerDown}
                  onPointerMove={handleRulerPointerMove}
                  onPointerUp={handleRulerPointerUp}
                  onPointerCancel={handleRulerPointerCancel}
                  onKeyDown={handleRulerKeyDown}
                >
                  <GripHorizontal className="size-3.5" />
                </button>
              </div>
            )}
          </section>
        ) : (
          <div className="flex h-full items-center justify-center px-6">
            <div className="max-w-md text-center">
              <Library className="text-muted-foreground mx-auto mb-4 size-10" />
              <h1 className="text-lg font-semibold">{item.title}</h1>
              <p className="text-muted-foreground mt-2 text-sm">
                {tr("pages.ebook_reader.unsupported_ebook_format")}
              </p>
            </div>
          </div>
        )}
        {panelOpen && isReaderSupportedFile(selectedFile) && (
          <aside className="border-border bg-background min-h-0 min-w-0 overflow-hidden border-t lg:border-t-0 lg:border-l">
            <div className="border-border/70 grid grid-cols-4 gap-1 border-b px-2 py-1.5">
              {[
                {
                  id: "toc" as const,
                  label: tr("pages.ebook_reader.contents"),
                  icon: ListTree,
                  aria: "Table of contents",
                },
                {
                  id: "search" as const,
                  label: tr("common.actions.search"),
                  icon: Search,
                  aria: "Search book",
                },
                {
                  id: "notes" as const,
                  label: tr("pages.ebook_reader.notes"),
                  icon: StickyNote,
                  aria: "Annotations and bookmarks",
                },
                {
                  id: "settings" as const,
                  label: tr("pages.ebook_reader.settings"),
                  icon: Settings,
                  aria: "Reader settings",
                },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <Button
                    key={tab.id}
                    variant={panel === tab.id ? "secondary" : "ghost"}
                    size="sm"
                    aria-label={tab.aria}
                    title={tab.label}
                    onClick={() => setPanel(tab.id)}
                    className="h-10 min-w-0 flex-col gap-0.5 px-1 text-[0.68rem] leading-none"
                  >
                    <Icon className="size-3.5 shrink-0" />
                    <span
                      data-reader-panel-tab-label
                      className="min-w-0 text-center leading-3 break-words whitespace-normal"
                    >
                      {tab.label}
                    </span>
                  </Button>
                );
              })}
            </div>

            <div className="h-[calc(100%-3.25rem)] overflow-y-auto p-3">
              {panel === "toc" && (
                <div className="space-y-1">
                  {tocEntries.length === 0 ? (
                    <div className="text-muted-foreground px-2 py-8 text-center text-sm">
                      {tr("pages.ebook_reader.no_contents_found")}
                    </div>
                  ) : (
                    tocEntries.map((entry) => (
                      <Button
                        key={`${entry.id}-${entry.href}`}
                        variant="ghost"
                        size="sm"
                        onClick={() => readerRef.current?.goTo(entry.href)}
                        className="h-auto w-full justify-start py-2 text-left text-sm whitespace-normal"
                        style={{ paddingLeft: `${0.5 + entry.depth * 1}rem` }}
                      >
                        {entry.label}
                      </Button>
                    ))
                  )}
                </div>
              )}

              {panel === "search" && (
                <div className="space-y-3">
                  <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleSearchSubmit();
                    }}
                  >
                    <input
                      aria-label={tr("pages.ebook_reader.search_text")}
                      value={searchText}
                      onChange={(event) => setSearchText(event.target.value)}
                      className="border-border bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 min-w-0 flex-1 rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px]"
                    />
                    <Button
                      aria-label={tr("pages.ebook_reader.run_search")}
                      title={tr("pages.ebook_reader.run_search")}
                      size="icon"
                      disabled={searching}
                    >
                      {searching ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Search className="size-4" />
                      )}
                    </Button>
                  </form>
                  <div className="space-y-1">
                    {searchResults.map((result, index) => (
                      <Button
                        key={`${result.cfi}-${index}`}
                        variant="ghost"
                        size="sm"
                        onClick={() => readerRef.current?.goTo(result.cfi)}
                        className="h-auto w-full justify-start py-2 text-left whitespace-normal"
                      >
                        <span className="min-w-0">
                          {result.label && (
                            <span className="text-muted-foreground block text-xs">
                              {result.label}
                            </span>
                          )}
                          <span className="block text-sm">{result.excerpt || result.cfi}</span>
                        </span>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {panel === "notes" && (
                <div className="space-y-2">
                  {annotations.length === 0 ? (
                    <div className="text-muted-foreground px-2 py-8 text-center text-sm">
                      {tr("pages.ebook_reader.no_annotations_yet")}
                    </div>
                  ) : (
                    annotations.map((annotation) => (
                      <div
                        key={annotation.id}
                        className="border-border rounded-md border p-2 text-sm"
                      >
                        <div className="flex items-start gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAnnotationNavigate(annotation)}
                            className="h-auto min-w-0 flex-1 justify-start px-1 py-1 text-left whitespace-normal"
                          >
                            <span className="min-w-0">
                              <span className="text-muted-foreground block text-xs capitalize">
                                {annotation.kind}
                              </span>
                              <span className="block">
                                {annotation.selected_text || annotation.note || annotation.location}
                              </span>
                            </span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={tr("pages.ebook_reader.delete_annotation")}
                            title={tr("pages.ebook_reader.delete_annotation")}
                            onClick={() => void handleDeleteAnnotation(annotation.id)}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {panel === "settings" && (
                <div className="space-y-4">
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={tr("pages.ebook_reader.reset_reader_settings")}
                    onClick={resetReaderSettings}
                    className="w-full justify-center"
                  >
                    <RotateCcw className="size-4" />
                    {tr("common.actions.reset")}
                  </Button>
                  <div className="space-y-3">
                    {!isComicFormat && (
                      <div className="border-border space-y-2 border-b pb-3">
                        <div className="text-muted-foreground text-xs font-medium">
                          {tr("pages.ebook_reader.reading_profile")}
                        </div>
                        <div className="grid gap-2">
                          {READER_PROFILES.map((profile) => {
                            const active = profileIsActive(profile, readerSettings);
                            return (
                              <Button
                                key={profile.id}
                                type="button"
                                variant={active ? "secondary" : "outline"}
                                size="sm"
                                aria-pressed={active}
                                onClick={() => updateReaderSettings(profile.settings)}
                                className="h-auto min-h-11 w-full justify-between px-3 py-2 text-left"
                              >
                                <span className="min-w-0">
                                  <span className="block text-sm font-medium">{profile.label}</span>
                                  <span className="text-muted-foreground block text-xs">
                                    {profile.description}
                                  </span>
                                </span>
                                {active && <Check className="size-4 shrink-0" />}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {!isComicFormat && (
                      <>
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Volume2 className="size-4" />
                          {tr("pages.ebook_reader.read_aloud")}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            aria-label={tr("pages.ebook_reader.speak_text")}
                            onClick={handleSpeak}
                          >
                            <Play className="size-4" />
                            {tr("pages.ebook_reader.speak")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={
                              tts.state === "paused"
                                ? tr("pages.ebook_reader.resume_speech")
                                : tr("pages.ebook_reader.pause_speech")
                            }
                            onClick={tts.state === "paused" ? tts.resume : tts.pause}
                          >
                            <Pause className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={tr("pages.ebook_reader.stop_speech")}
                            onClick={tts.stop}
                          >
                            <Square className="size-4" />
                          </Button>
                        </div>
                        <ReaderRange
                          label={tr("pages.ebook_reader.speech_rate")}
                          value={ttsRate}
                          min={0.5}
                          max={2}
                          step={0.1}
                          onChange={setTtsRate}
                        />
                        <label className="block space-y-1 text-sm">
                          <span className="text-muted-foreground text-xs font-medium">
                            {tr("pages.ebook_reader.voice")}
                          </span>
                          <select
                            aria-label={tr("pages.ebook_reader.voice")}
                            value={ttsVoiceURI}
                            onChange={(event) => setTtsVoiceURI(event.target.value)}
                            className="border-border bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-[3px]"
                          >
                            <option value="">{tr("pages.ebook_reader.default")}</option>
                            {tts.voices.map((voice) => (
                              <option key={voice.voiceURI} value={voice.voiceURI}>
                                {voice.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}
                  </div>
                  <div className="border-border space-y-2 border-t pt-3">
                    <label className="flex items-center justify-between gap-3 text-sm">
                      <span>{tr("pages.ebook_reader.keep_screen_awake")}</span>
                      <input
                        aria-label={tr("pages.ebook_reader.keep_screen_awake")}
                        type="checkbox"
                        checked={wakeLockEnabled}
                        onChange={(event) => setWakeLockEnabled(event.target.checked)}
                      />
                    </label>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Type className="size-4" />
                    {tr("pages.ebook_reader.typography")}
                  </div>
                  <label className="block space-y-1 text-sm">
                    <span className="text-muted-foreground text-xs font-medium">
                      {tr("pages.ebook_reader.theme")}
                    </span>
                    <select
                      aria-label={tr("pages.ebook_reader.theme")}
                      value={readerSettings.theme}
                      onChange={(event) =>
                        updateReaderSettings({
                          theme: event.target.value as ReaderSettings["theme"],
                        })
                      }
                      className="border-border bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-[3px]"
                    >
                      <option value="light">{tr("pages.ebook_reader.light")}</option>
                      <option value="sepia">{tr("pages.ebook_reader.sepia")}</option>
                      <option value="dark">{tr("pages.ebook_reader.dark")}</option>
                    </select>
                  </label>
                  {!isComicFormat && (
                    <label className="block space-y-1 text-sm">
                      <span className="text-muted-foreground text-xs font-medium">
                        {tr("pages.ebook_reader.font")}
                      </span>
                      <select
                        aria-label={tr("pages.ebook_reader.font_family")}
                        value={readerSettings.fontFamily}
                        onChange={(event) =>
                          updateReaderSettings({ fontFamily: event.target.value })
                        }
                        className="border-border bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-[3px]"
                      >
                        {READER_FONT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                        {!READER_FONT_OPTIONS.some(
                          (option) => option.value === readerSettings.fontFamily,
                        ) && (
                          <option value={readerSettings.fontFamily}>
                            {tr("pages.ebook_reader.custom")}
                          </option>
                        )}
                      </select>
                    </label>
                  )}
                  {!isComicFormat && (
                    <ReaderRange
                      label={tr("pages.ebook_reader.font_size")}
                      value={readerSettings.fontSize}
                      min={80}
                      max={180}
                      step={1}
                      suffix="%"
                      onChange={(fontSize) => updateReaderSettings({ fontSize })}
                    />
                  )}
                  <ReaderRange
                    label={tr("pages.ebook_reader.brightness")}
                    value={readerSettings.fontBrightness}
                    min={70}
                    max={125}
                    step={1}
                    suffix="%"
                    onChange={(fontBrightness) => updateReaderSettings({ fontBrightness })}
                  />
                  {!isComicFormat && (
                    <ReaderRange
                      label={tr("pages.ebook_reader.line_height")}
                      value={readerSettings.lineHeight}
                      min={1.1}
                      max={2.4}
                      step={0.05}
                      onChange={(lineHeight) => updateReaderSettings({ lineHeight })}
                    />
                  )}
                  <ReaderRange
                    label={tr("pages.ebook_reader.margin")}
                    value={readerSettings.margin}
                    min={0}
                    max={64}
                    step={1}
                    suffix="px"
                    onChange={(margin) => updateReaderSettings({ margin })}
                  />
                  {!isComicFormat && readerSettings.flow !== "scrolled" && (
                    <ReaderRange
                      label={tr("pages.ebook_reader.width")}
                      value={readerSettings.maxWidth}
                      min={42}
                      max={96}
                      step={1}
                      suffix="ch"
                      onChange={(maxWidth) => updateReaderSettings({ maxWidth })}
                    />
                  )}
                  <div className="border-border space-y-2 border-t pt-3">
                    {!isComicFormat && (
                      <label className="flex items-center justify-between gap-3 text-sm">
                        <span>{tr("pages.ebook_reader.hyphenation")}</span>
                        <input
                          aria-label={tr("pages.ebook_reader.hyphenation")}
                          type="checkbox"
                          checked={readerSettings.hyphenation}
                          onChange={(event) =>
                            updateReaderSettings({ hyphenation: event.target.checked })
                          }
                        />
                      </label>
                    )}
                    <label className="flex items-center justify-between gap-3 text-sm">
                      <span>{tr("pages.ebook_reader.right_to_left")}</span>
                      <input
                        aria-label={tr("pages.ebook_reader.right_to_left")}
                        type="checkbox"
                        checked={readerSettings.rtl}
                        onChange={(event) => updateReaderSettings({ rtl: event.target.checked })}
                      />
                    </label>
                    {!isComicFormat && (
                      <label className="flex items-center justify-between gap-3 text-sm">
                        <span>{tr("pages.ebook_reader.reading_ruler")}</span>
                        <input
                          aria-label={tr("pages.ebook_reader.reading_ruler")}
                          type="checkbox"
                          checked={readerSettings.readingRuler}
                          onChange={(event) =>
                            updateReaderSettings({ readingRuler: event.target.checked })
                          }
                        />
                      </label>
                    )}
                    {readerSettings.readingRuler && (
                      <ReaderRange
                        label={tr("pages.ebook_reader.ruler_position")}
                        value={readerSettings.readingRulerTop}
                        min={0}
                        max={100}
                        step={1}
                        suffix="%"
                        onChange={(readingRulerTop) => updateReaderSettings({ readingRulerTop })}
                      />
                    )}
                  </div>
                  {!isComicFormat && (
                    <label className="block space-y-1 text-sm">
                      <span className="text-muted-foreground text-xs font-medium">
                        {tr("pages.ebook_reader.writing_mode")}
                      </span>
                      <select
                        aria-label={tr("pages.ebook_reader.writing_mode")}
                        value={readerSettings.writingMode}
                        onChange={(event) =>
                          updateReaderSettings({
                            writingMode: event.target.value as ReaderSettings["writingMode"],
                          })
                        }
                        className="border-border bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-[3px]"
                      >
                        <option value="auto">{tr("pages.ebook_reader.auto")}</option>
                        <option value="horizontal-tb">{tr("pages.ebook_reader.horizontal")}</option>
                        <option value="vertical-rl">{tr("pages.ebook_reader.vertical")}</option>
                      </select>
                    </label>
                  )}
                  {readerSettings.flow !== "scrolled" && (
                    <label className="block space-y-1 text-sm">
                      <span className="text-muted-foreground text-xs font-medium">
                        {tr("pages.ebook_reader.spread")}
                      </span>
                      <select
                        aria-label={tr("pages.ebook_reader.spread")}
                        value={readerSettings.spread}
                        onChange={(event) =>
                          updateReaderSettings({
                            spread: event.target.value as ReaderSettings["spread"],
                          })
                        }
                        className="border-border bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-[3px]"
                      >
                        <option value="auto">{tr("pages.ebook_reader.auto")}</option>
                        <option value="none">{tr("pages.ebook_reader.single_page")}</option>
                      </select>
                    </label>
                  )}
                  <label className="block space-y-1 text-sm">
                    <span className="text-muted-foreground text-xs font-medium">
                      {tr("pages.ebook_reader.flow")}
                    </span>
                    <select
                      aria-label={tr("pages.ebook_reader.flow")}
                      value={readerSettings.flow}
                      onChange={(event) =>
                        updateReaderSettings({ flow: event.target.value as ReaderSettings["flow"] })
                      }
                      className="border-border bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-[3px]"
                    >
                      <option value="paginated">{tr("pages.ebook_reader.paginated")}</option>
                      <option value="scrolled">{tr("pages.ebook_reader.scrolled")}</option>
                    </select>
                  </label>
                </div>
              )}
            </div>
          </aside>
        )}
      </main>
      {showEndOfBookNext && nextChapter && nextChapterHref && (
        <div className="fixed inset-x-0 bottom-6 z-30 flex justify-center px-4">
          <Button
            asChild
            size="lg"
            className="h-11 gap-2 rounded-full px-6 text-[15px] font-bold shadow-lg"
          >
            <Link to={nextChapterHref} replace>
              {tr("pages.ebook_reader.next")} {nextChapter.label}
              <ChevronRight className="size-[18px]" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

type ReaderRangeProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
};

function ReaderRange({ label, value, min, max, step, suffix = "", onChange }: ReaderRangeProps) {
  useUILanguage();
  return (
    <label className="block space-y-1 text-sm">
      <span
        data-reader-range-header
        className="text-muted-foreground grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 text-xs font-medium"
      >
        <span data-reader-range-name className="min-w-0 leading-4 break-words">
          {label}
        </span>
        <span data-reader-range-value className="justify-self-end leading-4 tabular-nums">
          {Number.isInteger(step) ? value : value.toFixed(2)}
          {suffix}
        </span>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-primary h-2 w-full"
      />
    </label>
  );
}
