import { LibraryForm } from "@/components/admin/libraries/LibraryForm";
import { Button } from "@/components/ui/button";
import { toast } from "@/i18n/toast";
import { useWizardContext } from "../WizardContext";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

export function LibraryStep() {
  useUILanguage();
  const { libraries, markDone, refetchLibraries } = useWizardContext();

  function handleSkip() {
    markDone("library");
    toast.success("feedback.setup_wizard.steps.library_step.library_setup_skipped");
  }

  function handleLibrarySaved() {
    refetchLibraries();
  }

  return (
    <div className="space-y-5">
      {libraries.length > 0 && (
        <div className="border-foreground/[0.07] bg-foreground/[0.03] space-y-2 rounded-xl border p-4">
          <p className="text-muted-foreground text-xs font-semibold tracking-[0.1em] uppercase">
            {tr("pages.setup_wizard.steps.library_step.added_libraries")}
          </p>
          <div className="space-y-2">
            {libraries.map((library) => (
              <div key={library.id} className="text-sm">
                <div className="font-medium">{library.name}</div>
                <div className="text-muted-foreground text-xs">
                  {library.type} · {library.paths.length}{" "}
                  {library.paths.length === 1
                    ? tr("pages.setup_wizard.steps.library_step.path")
                    : tr("pages.setup_wizard.steps.library_step.paths")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <LibraryForm
        library={null}
        chapterThumbnailsSupported={libraries[0]?.chapter_thumbnails_supported ?? true}
        onSaved={handleLibrarySaved}
        resetAfterCreate
        submitLabel={tr("pages.setup_wizard.steps.library_step.add_library")}
        savingLabel="Adding..."
      />

      <div className="flex gap-3 pt-3">
        <Button type="button" onClick={() => markDone("library")} disabled={libraries.length === 0}>
          {tr("common.actions.continue")}
        </Button>
        <Button type="button" variant="ghost" onClick={handleSkip}>
          {tr("common.actions.skip")}
        </Button>
      </div>
    </div>
  );
}
