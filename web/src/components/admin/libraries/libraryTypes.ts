import { BookHeadphones, BookMarked, BookOpen, Film, Layers, Podcast, Tv } from "lucide-react";

import { tr } from "@/i18n/translate";

export const LIBRARY_TYPES = [
  {
    value: "movies",
    get label() {
      return tr("components.admin.libraries.library_types.movies");
    },
    icon: Film,
  },
  {
    value: "series",
    get label() {
      return tr("components.admin.libraries.library_types.series");
    },
    icon: Tv,
  },
  {
    value: "mixed",
    get label() {
      return tr("components.admin.libraries.library_types.mixed");
    },
    icon: Layers,
  },
  {
    value: "audiobooks",
    get label() {
      return tr("components.admin.libraries.library_types.audiobooks");
    },
    icon: BookHeadphones,
  },
  {
    value: "ebooks",
    get label() {
      return tr("components.admin.libraries.library_types.ebooks");
    },
    icon: BookOpen,
  },
  {
    value: "manga",
    get label() {
      return tr("components.admin.libraries.library_types.manga");
    },
    icon: BookMarked,
  },
  {
    value: "podcasts",
    get label() {
      return tr("components.admin.libraries.library_types.podcasts");
    },
    icon: Podcast,
  },
] as const;

export function libraryTypeMeta(type: string) {
  return LIBRARY_TYPES.find((t) => t.value === type) ?? LIBRARY_TYPES[0];
}
