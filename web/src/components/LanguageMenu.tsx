import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { changeLanguage, currentLanguage } from "@/i18n";
import { supportedLanguages } from "@/i18n/preferences";

const languageLabelKeys = {
  en: "common.language.english",
  fr: "common.language.french",
} as const;

export function LanguageMenu() {
  const { t } = useTranslation(undefined);

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="gap-2.5 rounded-lg px-2.5 py-2 text-[13px]">
        <Languages className="h-[18px] w-[18px]" />
        {t("common.language.label")}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup
            value={currentLanguage()}
            onValueChange={(language) => void changeLanguage(language)}
          >
            {supportedLanguages.map((language) => (
              <DropdownMenuRadioItem key={language} value={language}>
                {t(languageLabelKeys[language])}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
