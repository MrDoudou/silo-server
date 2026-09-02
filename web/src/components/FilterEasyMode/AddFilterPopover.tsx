import { useState } from "react";
import type { FilterChipModel } from "@/lib/filterEasyMode";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

const FIELDS = [
  {
    value: "",
    get label() {
      return tr("components.filter_easy_mode.add_filter_popover.field");
    },
  },
  {
    value: "genre",
    get label() {
      return tr("components.filter_easy_mode.add_filter_popover.genre");
    },
  },
  {
    value: "year",
    get label() {
      return tr("components.filter_easy_mode.add_filter_popover.year");
    },
  },
  {
    value: "rating_imdb",
    get label() {
      return tr("components.filter_easy_mode.add_filter_popover.rating_imdb");
    },
  },
  {
    value: "director",
    get label() {
      return tr("components.filter_easy_mode.add_filter_popover.director");
    },
  },
  {
    value: "studio",
    get label() {
      return tr("components.filter_easy_mode.add_filter_popover.studio");
    },
  },
  {
    value: "cast",
    get label() {
      return tr("components.filter_easy_mode.add_filter_popover.cast");
    },
  },
  {
    value: "library",
    get label() {
      return tr("components.filter_easy_mode.add_filter_popover.library");
    },
  },
  {
    value: "watched",
    get label() {
      return tr("components.filter_easy_mode.add_filter_popover.has_been_watched");
    },
  },
  {
    value: "language",
    get label() {
      return tr("components.filter_easy_mode.add_filter_popover.language");
    },
  },
  {
    value: "runtime",
    get label() {
      return tr("components.filter_easy_mode.add_filter_popover.runtime_min");
    },
  },
  {
    value: "keyword",
    get label() {
      return tr("components.filter_easy_mode.add_filter_popover.keyword");
    },
  },
];

const OPS = [
  {
    value: "is",
    get label() {
      return tr("components.filter_easy_mode.add_filter_popover.is");
    },
  },
  {
    value: "is_not",
    get label() {
      return tr("components.filter_easy_mode.add_filter_popover.is_not");
    },
  },
  { value: "gte", label: "≥" },
  { value: "lte", label: "≤" },
  {
    value: "between",
    get label() {
      return tr("components.filter_easy_mode.add_filter_popover.between");
    },
  },
  {
    value: "contains",
    get label() {
      return tr("components.filter_easy_mode.add_filter_popover.contains");
    },
  },
];

interface Props {
  open: boolean;
  onAdd: (chip: FilterChipModel) => void;
  onCancel: () => void;
}

export default function AddFilterPopover({ open, onAdd, onCancel }: Props) {
  useUILanguage();
  const [field, setField] = useState("");
  const [op, setOp] = useState("contains");
  const [value, setValue] = useState("");
  if (!open) return null;
  return (
    <div className="rounded-lg border border-indigo-500/40 bg-zinc-900 p-3 shadow-lg" role="dialog">
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col text-[11px] text-white/70">
          {tr("components.filter_easy_mode.add_filter_popover.field_c326a466")}
          <select
            value={field}
            onChange={(e) => setField(e.target.value)}
            className="rounded border border-white/15 bg-white/5 px-2 py-1 text-xs text-white"
          >
            {FIELDS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-[11px] text-white/70">
          {tr("components.filter_easy_mode.add_filter_popover.operator")}
          <select
            value={op}
            onChange={(e) => setOp(e.target.value)}
            className="rounded border border-white/15 bg-white/5 px-2 py-1 text-xs text-white"
          >
            {OPS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-[11px] text-white/70">
          {tr("components.filter_easy_mode.add_filter_popover.value")}
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={tr("components.filter_easy_mode.add_filter_popover.value_f32b67c7")}
            className="rounded border border-white/15 bg-white/5 px-2 py-1 text-xs text-white"
          />
        </label>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-white/15 px-2 py-1 text-xs text-white/70"
        >
          {tr("common.actions.cancel")}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!field) return;
            onAdd({ field, op, value });
            setField("");
            setOp("contains");
            setValue("");
          }}
          className="rounded bg-indigo-600 px-2 py-1 text-xs text-white"
        >
          {tr("common.actions.add")}
        </button>
      </div>
    </div>
  );
}
