import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

const PRESET_VALUES = [
  {
    value: "0 * * * *",
    get label() {
      return tr("components.collections.sync_schedule_field.every_hour");
    },
  },
  {
    value: "0 */6 * * *",
    get label() {
      return tr("components.collections.sync_schedule_field.every_6_hours");
    },
  },
  {
    value: "0 3 * * *",
    get label() {
      return tr("components.collections.sync_schedule_field.daily_at_3_00_am");
    },
  },
  {
    value: "0 3 * * 1",
    get label() {
      return tr("components.collections.sync_schedule_field.weekly_monday_3_00_am");
    },
  },
  {
    value: "0 3 * * 0",
    get label() {
      return tr("components.collections.sync_schedule_field.weekly_sunday_3_00_am");
    },
  },
  {
    value: "0 3 1 * *",
    get label() {
      return tr("components.collections.sync_schedule_field.monthly_1st_at_3_00_am");
    },
  },
] as const;

function findPreset(value: string): string | undefined {
  return PRESET_VALUES.find((p) => p.value === value)?.value;
}

function deriveMode(value: string): "none" | "preset" | "custom" {
  if (!value) return "none";
  if (findPreset(value)) return "preset";
  return "custom";
}

interface SyncScheduleFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function SyncScheduleField({ value, onChange, disabled }: SyncScheduleFieldProps) {
  useUILanguage();
  const [mode, setMode] = useState<"none" | "preset" | "custom">(() => deriveMode(value));

  const selectValue =
    mode === "none" ? "__none__" : mode === "custom" ? "custom" : (findPreset(value) ?? "custom");

  return (
    <div className="space-y-2">
      <Label>{tr("components.collections.sync_schedule_field.sync_schedule")}</Label>
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === "__none__") {
            setMode("none");
            onChange("");
          } else if (v === "custom") {
            setMode("custom");
            if (!value || findPreset(value)) {
              onChange("0 3 * * *");
            }
          } else {
            setMode("preset");
            onChange(v);
          }
        }}
        disabled={disabled}
      >
        <SelectTrigger className="w-full sm:w-[280px]">
          <SelectValue
            placeholder={tr("components.collections.sync_schedule_field.select_a_schedule")}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">
            {tr("components.collections.sync_schedule_field.no_automatic_sync")}
          </SelectItem>
          {PRESET_VALUES.map((preset) => (
            <SelectItem key={preset.value} value={preset.value}>
              {preset.label}
            </SelectItem>
          ))}
          <SelectItem value="custom">
            {tr("components.collections.sync_schedule_field.custom_cron_expression")}
          </SelectItem>
        </SelectContent>
      </Select>

      {mode === "custom" && (
        <div className="space-y-1">
          <Input
            type="text"
            placeholder={tr("components.collections.sync_schedule_field.value_0_3")}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="w-full font-mono sm:w-[280px]"
          />
          <p className="text-muted-foreground text-xs">
            {tr(
              "components.collections.sync_schedule_field.standard_cron_format_minute_hour_day_of_month_month_day",
            )}
          </p>
        </div>
      )}
    </div>
  );
}
