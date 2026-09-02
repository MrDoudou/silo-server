import type { CSSProperties } from "react";
import { Toaster as SonnerToaster, type ToasterProps } from "sonner";
import { useTheme } from "@/hooks/useTheme";
import { THEMES } from "@/lib/themes";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

const Toaster = ({ ...props }: ToasterProps) => {
  useUILanguage();
  const { activeTheme } = useTheme();
  const sonnerTheme = THEMES[activeTheme].appearance;

  return (
    <SonnerToaster
      theme={sonnerTheme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "!text-[var(--popover-foreground)]",
          title: tr("components.ui.sonner.text_var_popover_foreground"),
          description: tr("components.ui.sonner.text_var_popover_foreground"),
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
