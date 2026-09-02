import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

export default function ScrollToTopButton() {
  useUILanguage();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={tr("components.scroll_to_top_button.scroll_to_top")}
      className={
        "fixed right-6 bottom-6 z-50 rounded-md transition-opacity duration-150 " +
        (visible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0")
      }
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
    >
      <ArrowUp className="h-4 w-4" />
    </Button>
  );
}
