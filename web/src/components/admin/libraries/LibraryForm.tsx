import type { FormEvent, ReactNode } from "react";

import type { Library } from "@/api/types";
import { Button } from "@/components/ui/button";

import { AdvancedFields, FolderFields, GeneralFields, MetadataFields } from "./LibraryFormSections";
import { useLibraryForm } from "./useLibraryForm";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

export interface LibraryFormProps {
  library: Library | null;
  chapterThumbnailsSupported: boolean;
  onClose?: () => void;
  onSaved?: (library: Library) => void;
  resetAfterCreate?: boolean;
  submitLabel?: string;
  savingLabel?: string;
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  useUILanguage();
  return (
    <section className="space-y-3">
      <h3 className="text-muted-foreground text-xs font-semibold tracking-[0.1em] uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Inline (non-dialog) library form used by the setup wizard. The admin
 * Libraries page uses LibraryEditorDialog, which renders the same sections
 * behind a left-hand navigation rail.
 */
export function LibraryForm({
  library,
  chapterThumbnailsSupported,
  onClose,
  onSaved,
  resetAfterCreate = false,
  submitLabel = "Save",
  savingLabel = "Saving...",
}: LibraryFormProps) {
  useUILanguage();
  const form = useLibraryForm({ library, onClose, onSaved, resetAfterCreate });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    form.submit();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <FormSection title={tr("components.admin.libraries.library_form.general")}>
        <GeneralFields form={form} />
      </FormSection>
      <FormSection title={tr("components.admin.libraries.library_form.folders")}>
        <FolderFields form={form} />
      </FormSection>
      <FormSection title={tr("components.admin.libraries.library_form.metadata")}>
        <MetadataFields form={form} />
      </FormSection>
      <FormSection title={tr("components.admin.libraries.library_form.advanced")}>
        <AdvancedFields form={form} chapterThumbnailsSupported={chapterThumbnailsSupported} />
      </FormSection>
      <Button type="submit" className="w-full" disabled={form.isPending}>
        {form.isPending ? savingLabel : submitLabel}
      </Button>
    </form>
  );
}
