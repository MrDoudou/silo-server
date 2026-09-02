import { useRef } from "react";
import { Upload, Download } from "lucide-react";
import { toast } from "@/i18n/toast";

import { serializeTheme, downloadTheme, readThemeFile } from "@/lib/themeExport";
import type { ThemeId } from "@/lib/themes";
import type { ThemeVarOverrides } from "@/hooks/useCustomTheme";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

interface ImportExportBarProps {
  currentTheme: ThemeId;
  vars: ThemeVarOverrides;
  customCss: string;
  onImport: (vars: ThemeVarOverrides, css: string, baseTheme: ThemeId) => void;
}

export function ImportExportBar({ currentTheme, vars, customCss, onImport }: ImportExportBarProps) {
  useUILanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleExport() {
    const theme = serializeTheme({
      name: "My Custom Theme",
      baseTheme: currentTheme,
      vars,
      customCss,
    });
    downloadTheme(theme);
  }

  async function handleImport(file: File) {
    try {
      const themeFile = await readThemeFile(file);
      onImport(themeFile.vars, themeFile.customCss, themeFile.baseTheme);
      toast.success("feedback.theme.import_export_bar.imported_name", {
        values: { name: themeFile.name },
      });
    } catch (err) {
      toast.error("errors.theme.import_export_bar.failed_to_import_theme_file", { error: err });
    }
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={handleExport}
        className="border-border text-foreground hover:bg-accent inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors"
      >
        <Download className="h-3.5 w-3.5" />
        {tr("components.theme.import_export_bar.export")}
      </button>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="border-border text-foreground hover:bg-accent inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors"
      >
        <Upload className="h-3.5 w-3.5" />
        {tr("components.theme.import_export_bar.import")}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.silo-theme.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImport(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
