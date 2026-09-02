import type { SmartCollectionAccess } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

interface CollectionAccessEditorProps {
  value: SmartCollectionAccess;
  onChange: (value: SmartCollectionAccess) => void;
  profiles?: Array<{ id: string; name: string }>;
  readOnly?: boolean;
  creatorProfileId?: string | null;
}

export default function CollectionAccessEditor({
  value,
  onChange,
  profiles = [],
  readOnly = false,
  creatorProfileId,
}: CollectionAccessEditorProps) {
  useUILanguage();
  return (
    <div className="space-y-4">
      {readOnly ? (
        <div className="text-muted-foreground rounded-md border px-3 py-2 text-sm">
          {tr(
            "components.collections.collection_access_editor.only_the_creator_can_edit_this_collection",
          )}
          {creatorProfileId
            ? tr("components.collections.collection_access_editor.created_by_creator_profile_id", {
                creatorProfileId: creatorProfileId,
              })
            : ""}
        </div>
      ) : null}

      <div className="border-border flex items-center justify-between rounded-lg border px-4 py-3">
        <div>
          <Label className="text-sm font-medium">
            {tr("components.collections.collection_access_editor.share_with_this_account")}
          </Label>
          <p className="text-muted-foreground mt-1 text-xs">
            {tr(
              "components.collections.collection_access_editor.shared_collections_appear_for_the_selected_profiles_across_the_account",
            )}
          </p>
        </div>
        <Switch
          checked={value.is_shared}
          onCheckedChange={(checked) =>
            onChange({
              ...value,
              is_shared: checked,
              allowed_profile_ids: checked ? value.allowed_profile_ids : [],
            })
          }
          disabled={readOnly}
        />
      </div>

      {value.is_shared && profiles.length > 0 ? (
        <div className="space-y-2">
          <Label>{tr("components.collections.collection_access_editor.allowed_profiles")}</Label>
          <div className="flex flex-wrap gap-2">
            {profiles.map((profile) => {
              const selected = value.allowed_profile_ids.includes(profile.id);
              return (
                <Button
                  key={profile.id}
                  type="button"
                  variant={selected ? "default" : "outline"}
                  size="sm"
                  disabled={readOnly}
                  onClick={() =>
                    onChange({
                      ...value,
                      allowed_profile_ids: selected
                        ? value.allowed_profile_ids.filter((id) => id !== profile.id)
                        : [...value.allowed_profile_ids, profile.id],
                    })
                  }
                >
                  {profile.name}
                </Button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
