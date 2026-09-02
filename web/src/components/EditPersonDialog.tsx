import { useMemo, useState } from "react";

import type { Person, UpdatePersonRequest } from "@/api/types";
import { useUpdatePersonMetadata } from "@/hooks/queries/people";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

interface EditPersonDialogProps {
  person: Person;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function createFormState(person: Person) {
  return {
    name: person.name ?? "",
    bio: person.bio ?? "",
    birth_date: person.birth_date ?? "",
    death_date: person.death_date ?? "",
    birthplace: person.birthplace ?? "",
    homepage: person.homepage ?? "",
    tmdb_id: person.tmdb_id ?? "",
    imdb_id: person.imdb_id ?? "",
    tvdb_id: person.tvdb_id ?? "",
  };
}

export default function EditPersonDialog({ person, open, onOpenChange }: EditPersonDialogProps) {
  useUILanguage();
  const [form, setForm] = useState(() => createFormState(person));
  const mutation = useUpdatePersonMetadata(String(person.id));
  const originalForm = useMemo(() => createFormState(person), [person]);

  function setField<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSave() {
    const data: UpdatePersonRequest = {};

    if (form.name !== originalForm.name) data.name = form.name;
    if (form.bio !== originalForm.bio) data.bio = form.bio;
    if (form.birth_date !== originalForm.birth_date) data.birth_date = form.birth_date || null;
    if (form.death_date !== originalForm.death_date) data.death_date = form.death_date || null;
    if (form.birthplace !== originalForm.birthplace) data.birthplace = form.birthplace;
    if (form.homepage !== originalForm.homepage) data.homepage = form.homepage;
    if (form.tmdb_id !== originalForm.tmdb_id) data.tmdb_id = form.tmdb_id;
    if (form.imdb_id !== originalForm.imdb_id) data.imdb_id = form.imdb_id;
    if (form.tvdb_id !== originalForm.tvdb_id) data.tvdb_id = form.tvdb_id;

    if (Object.keys(data).length === 0) {
      onOpenChange(false);
      return;
    }

    mutation.mutate(data, {
      onSuccess: () => onOpenChange(false),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{tr("components.edit_person_dialog.edit_person_metadata")}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="person-name">{tr("components.edit_person_dialog.name")}</Label>
            <Input
              id="person-name"
              value={form.name}
              onChange={(event) => setField("name", event.target.value)}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="person-bio">{tr("components.edit_person_dialog.bio")}</Label>
            <textarea
              id="person-bio"
              value={form.bio}
              onChange={(event) => setField("bio", event.target.value)}
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring min-h-32 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="person-birth-date">
              {tr("components.edit_person_dialog.birth_date")}
            </Label>
            <Input
              id="person-birth-date"
              type="date"
              value={form.birth_date}
              onChange={(event) => setField("birth_date", event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="person-death-date">
              {tr("components.edit_person_dialog.death_date")}
            </Label>
            <Input
              id="person-death-date"
              type="date"
              value={form.death_date}
              onChange={(event) => setField("death_date", event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="person-birthplace">
              {tr("components.edit_person_dialog.birthplace")}
            </Label>
            <Input
              id="person-birthplace"
              value={form.birthplace}
              onChange={(event) => setField("birthplace", event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="person-homepage">{tr("components.edit_person_dialog.homepage")}</Label>
            <Input
              id="person-homepage"
              value={form.homepage}
              onChange={(event) => setField("homepage", event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="person-tmdb-id">{tr("components.edit_person_dialog.tmdb_id")}</Label>
            <Input
              id="person-tmdb-id"
              value={form.tmdb_id}
              onChange={(event) => setField("tmdb_id", event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="person-imdb-id">{tr("components.edit_person_dialog.imdb_id")}</Label>
            <Input
              id="person-imdb-id"
              value={form.imdb_id}
              onChange={(event) => setField("imdb_id", event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="person-tvdb-id">{tr("components.edit_person_dialog.tvdb_id")}</Label>
            <Input
              id="person-tvdb-id"
              value={form.tvdb_id}
              onChange={(event) => setField("tvdb_id", event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tr("common.actions.cancel")}
          </Button>
          <Button type="button" onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending
              ? tr("components.edit_person_dialog.saving")
              : tr("common.actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
