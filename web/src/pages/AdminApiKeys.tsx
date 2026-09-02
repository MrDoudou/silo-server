import { useState } from "react";
import type { FormEvent } from "react";
import type { AdminAPIKey, AdminCreateAPIKeyRequest } from "@/api/types";
import { useAuth } from "@/hooks/useAuth";
import { useAdminUsers } from "@/hooks/queries/admin/users";
import {
  useAdminApiKeys,
  useAdminCreateApiKey,
  useAdminDeleteApiKey,
  useAdminUpdateApiKeyTier,
} from "@/hooks/queries/admin/apiKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Copy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/i18n/toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { formatDate } from "@/lib/datetime";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

function maskKey(key: string): string {
  if (key.length <= 10) return key;
  return key.slice(0, 6) + "..." + key.slice(-4);
}

const PAGE_SIZE_OPTIONS = ["25", "50", "100"] as const;

export default function AdminApiKeys() {
  useUILanguage();
  const { data: keys = [], isLoading } = useAdminApiKeys();
  const deleteMutation = useAdminDeleteApiKey();
  const updateTier = useAdminUpdateApiKeyTier();
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmRevokeKey, setConfirmRevokeKey] = useState<AdminAPIKey | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const total = keys.length;
  const paginatedKeys = keys.slice(page * pageSize, (page + 1) * pageSize);

  function handleRevoke(key: AdminAPIKey) {
    setConfirmRevokeKey(key);
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("feedback.admin_api_keys.copied_to_clipboard");
  }

  if (isLoading)
    return (
      <div className="page-shell space-y-3 py-4 sm:py-6">
        <Skeleton className="h-10 w-full rounded-lg" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );

  return (
    <div className="page-shell space-y-6 py-4 sm:py-6">
      <ConfirmDialog
        open={confirmRevokeKey !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRevokeKey(null);
        }}
        title={tr("pages.admin_api_keys.revoke_api_key")}
        description={tr("pages.admin_api_keys.revoke_api_key_label_this_action_cannot_be_undone", {
          label: confirmRevokeKey?.label,
        })}
        confirmLabel={tr("pages.admin_api_keys.revoke")}
        variant="destructive"
        onConfirm={() => {
          if (confirmRevokeKey) deleteMutation.mutate(confirmRevokeKey.id);
          setConfirmRevokeKey(null);
        }}
      />
      <div className="page-header gap-5">
        <div className="space-y-3">
          <h1 className="page-title text-[clamp(2rem,4vw,3rem)]">
            {tr("pages.admin_api_keys.api_keys")}
          </h1>
          <p className="page-subtitle text-sm sm:text-base">
            {tr(
              "pages.admin_api_keys.create_and_manage_machine_credentials_for_integrations_automation_and_internal",
            )}
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" /> {tr("pages.admin_api_keys.create_key")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{tr("pages.admin_api_keys.create_api_key")}</DialogTitle>
            </DialogHeader>
            <CreateApiKeyForm onClose={() => setCreateOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="surface-panel overflow-x-auto rounded-2xl border-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("pages.admin_api_keys.label")}</TableHead>
              <TableHead>{tr("pages.admin_api_keys.user")}</TableHead>
              <TableHead>{tr("pages.admin_api_keys.key")}</TableHead>
              <TableHead>{tr("pages.admin_api_keys.tier")}</TableHead>
              <TableHead>{tr("pages.admin_api_keys.created")}</TableHead>
              <TableHead>{tr("pages.admin_api_keys.last_used")}</TableHead>
              <TableHead className="w-24">{tr("pages.admin_api_keys.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground text-center">
                  {tr("pages.admin_api_keys.no_api_keys_yet_create_one_to_get_started")}
                </TableCell>
              </TableRow>
            )}
            {paginatedKeys.map((key) => (
              <TableRow key={key.id}>
                <TableCell className="font-medium">{key.label}</TableCell>
                <TableCell>{key.username}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
                      {maskKey(key.key)}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      aria-label={tr("pages.admin_api_keys.copy_api_key_label", {
                        label: key.label,
                      })}
                      onClick={() => handleCopy(key.key)}
                    >
                      <Copy className="h-3 w-3" aria-hidden="true" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <Select
                    value={key.rate_tier}
                    onValueChange={(tier) => updateTier.mutate({ id: key.id, tier })}
                  >
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">
                        {tr("pages.admin_api_keys.standard")}
                      </SelectItem>
                      <SelectItem value="elevated">
                        {tr("pages.admin_api_keys.elevated")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {formatDate(key.created_at)}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {key.last_used_at
                    ? formatDate(key.last_used_at)
                    : tr("pages.admin_api_keys.never")}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={tr("pages.admin_api_keys.revoke_api_key_label", {
                      label: key.label,
                    })}
                    onClick={() => handleRevoke(key)}
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {total > pageSize && (
          <div className="flex items-center justify-between px-4 py-4">
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground text-sm">
                {tr("pages.admin_api_keys.showing")} {page * pageSize + 1}-
                {Math.min((page + 1) * pageSize, total)} {tr("pages.admin_api_keys.of")} {total}
              </span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setPage(0);
                }}
              >
                <SelectTrigger className="h-8 w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={size}>
                      {size} {tr("pages.admin_api_keys.rows")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 0}
              >
                {tr("common.actions.previous")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * pageSize >= total}
              >
                {tr("common.actions.next")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CreateApiKeyForm({ onClose }: { onClose: () => void }) {
  useUILanguage();
  const { user } = useAuth();
  const { data: users = [] } = useAdminUsers();
  const [label, setLabel] = useState("");
  const [userId, setUserId] = useState<string>(String(user?.id ?? ""));
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const createMutation = useAdminCreateApiKey();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const body: AdminCreateAPIKeyRequest = { label };
    const parsedId = parseInt(userId, 10);
    if (!isNaN(parsedId)) {
      body.user_id = parsedId;
    }
    createMutation.mutate(body, {
      onSuccess: (data) => {
        toast.success("feedback.admin_api_keys.api_key_created");
        setCreatedKey(data.key);
      },
    });
  }

  function handleCopyAndClose() {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      toast.success("feedback.admin_api_keys.copied_to_clipboard");
    }
    onClose();
  }

  if (createdKey) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground text-sm">
          {tr("pages.admin_api_keys.copy_your_api_key_now_you_won_t_be_able")}
        </p>
        <code className="bg-muted block rounded p-3 font-mono text-xs break-all">{createdKey}</code>
        <Button className="w-full" onClick={handleCopyAndClose}>
          <Copy className="mr-1 h-4 w-4" /> {tr("pages.admin_api_keys.copy_close")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>{tr("pages.admin_api_keys.label")}</Label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={tr("pages.admin_api_keys.e_g_ci_cd_pipeline")}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>{tr("pages.admin_api_keys.user")}</Label>
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {users.map((u) => (
              <SelectItem key={u.id} value={String(u.id)}>
                {u.username}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full" disabled={createMutation.isPending}>
        {createMutation.isPending
          ? tr("pages.admin_api_keys.creating")
          : tr("common.actions.create")}
      </Button>
    </form>
  );
}
