import { useState } from "react";
import type { FormEvent } from "react";
import type { InviteCode } from "@/api/types";
import {
  useAdminInviteCodes,
  useCreateInviteCode,
  useUpdateInviteCode,
  useTopUpInviteCode,
  useDeleteInviteCode,
} from "@/hooks/queries/admin/inviteCodes";
import { useAdminServerSettings } from "@/hooks/queries/admin/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AlertTriangle, ArrowRight, Copy, Plus, PlusCircle, Trash2 } from "lucide-react";
import { toast } from "@/i18n/toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { formatDate } from "@/lib/datetime";
import { Link } from "react-router";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

export default function InviteCodesTab() {
  useUILanguage();
  const { data: codes = [], isLoading } = useAdminInviteCodes();
  const { data: serverSettings } = useAdminServerSettings();
  const signupsEnabled = serverSettings?.["signup.enabled"] === "true";
  const updateCode = useUpdateInviteCode();
  const deleteCode = useDeleteInviteCode();
  const [createOpen, setCreateOpen] = useState(false);
  const [topUpCode, setTopUpCode] = useState<InviteCode | null>(null);
  const [confirmDeleteCode, setConfirmDeleteCode] = useState<InviteCode | null>(null);

  function handleToggleCode(code: InviteCode) {
    updateCode.mutate({ id: code.id, body: { enabled: !code.enabled } });
  }

  function handleDelete(code: InviteCode) {
    setConfirmDeleteCode(code);
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("feedback.admin_settings.invite_codes_tab.copied_to_clipboard");
  }

  if (isLoading)
    return <div>{tr("pages.admin_settings.invite_codes_tab.loading_invite_codes")}</div>;

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={confirmDeleteCode !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteCode(null);
        }}
        title={tr("pages.admin_settings.invite_codes_tab.delete_invite_code")}
        description={tr(
          "pages.admin_settings.invite_codes_tab.delete_invite_code_code_this_action_cannot_be_undone",
          {
            code: confirmDeleteCode?.code,
          },
        )}
        confirmLabel={tr("common.actions.delete")}
        variant="destructive"
        onConfirm={() => {
          if (confirmDeleteCode) deleteCode.mutate(confirmDeleteCode.id);
          setConfirmDeleteCode(null);
        }}
      />

      <Dialog
        open={topUpCode !== null}
        onOpenChange={(open) => {
          if (!open) setTopUpCode(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {tr("pages.admin_settings.invite_codes_tab.top_up_invite_code")}
            </DialogTitle>
            <DialogDescription>
              {tr("pages.admin_settings.invite_codes_tab.add_extra_uses_to")} {topUpCode?.code}
              {tr("pages.admin_settings.invite_codes_tab.current_usage_is")} {topUpCode?.use_count}{" "}
              / {topUpCode?.max_uses}.
            </DialogDescription>
          </DialogHeader>
          {topUpCode && <TopUpInviteCodeForm code={topUpCode} onClose={() => setTopUpCode(null)} />}
        </DialogContent>
      </Dialog>

      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" />{" "}
              {tr("pages.admin_settings.invite_codes_tab.create_code")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {tr("pages.admin_settings.invite_codes_tab.create_invite_code")}
              </DialogTitle>
            </DialogHeader>
            <CreateInviteCodeForm onClose={() => setCreateOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {serverSettings !== undefined &&
        (signupsEnabled ? (
          <p className="text-muted-foreground text-sm">
            {tr(
              "pages.admin_settings.invite_codes_tab.codes_only_work_while_public_signups_are_on",
            )}{" "}
            <Link
              to="/admin/settings/general"
              className="text-foreground inline-flex items-center gap-1 font-medium hover:underline"
            >
              {tr("pages.admin_settings.invite_codes_tab.public_signups_setting")}
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </p>
        ) : (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-[13px] leading-relaxed">
              <span className="font-medium text-amber-500">
                {tr("pages.admin_settings.invite_codes_tab.public_signups_are_off")}
              </span>{" "}
              {tr(
                "pages.admin_settings.invite_codes_tab.these_codes_won_t_work_until_you_enable_them",
              )}{" "}
              <Link
                to="/admin/settings/general"
                className="text-foreground inline-flex items-center gap-1 font-medium hover:underline"
              >
                {tr("pages.admin_settings.invite_codes_tab.public_signups_setting")}
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </p>
          </div>
        ))}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{tr("pages.admin_settings.invite_codes_tab.code")}</TableHead>
            <TableHead>{tr("pages.admin_settings.invite_codes_tab.label")}</TableHead>
            <TableHead>{tr("pages.admin_settings.invite_codes_tab.usage")}</TableHead>
            <TableHead>{tr("pages.admin_settings.invite_codes_tab.status")}</TableHead>
            <TableHead>{tr("pages.admin_settings.invite_codes_tab.created")}</TableHead>
            <TableHead className="w-32">
              {tr("pages.admin_settings.invite_codes_tab.actions")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {codes.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground text-center">
                {tr(
                  "pages.admin_settings.invite_codes_tab.no_invite_codes_yet_create_one_to_get_started",
                )}
              </TableCell>
            </TableRow>
          )}
          {codes.map((code) => (
            <TableRow key={code.id}>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
                    {code.code}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleCopy(code.code)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </TableCell>
              <TableCell>
                {code.label || <span className="text-muted-foreground">-</span>}
              </TableCell>
              <TableCell>
                <span className={code.use_count >= code.max_uses ? "text-destructive" : ""}>
                  {code.use_count} / {code.max_uses}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Switch checked={code.enabled} onCheckedChange={() => handleToggleCode(code)} />
                  <Badge variant={code.enabled ? "outline" : "secondary"}>
                    {code.enabled
                      ? tr("pages.admin_settings.invite_codes_tab.active")
                      : tr("pages.admin_settings.invite_codes_tab.disabled")}
                  </Badge>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {formatDate(code.created_at)}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setTopUpCode(code)}
                    aria-label={tr(
                      "pages.admin_settings.invite_codes_tab.top_up_invite_code_code",
                      { code: code.code },
                    )}
                  >
                    <PlusCircle className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleDelete(code)}
                    aria-label={tr(
                      "pages.admin_settings.invite_codes_tab.delete_invite_code_code",
                      { code: code.code },
                    )}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CreateInviteCodeForm({ onClose }: { onClose: () => void }) {
  useUILanguage();
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState("10");
  const createMutation = useCreateInviteCode();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const max = parseInt(maxUses, 10);
    if (isNaN(max) || max <= 0) {
      toast.error("errors.admin_settings.invite_codes_tab.max_uses_must_be_a_positive_number");
      return;
    }
    createMutation.mutate(
      { code: code || undefined, label, max_uses: max },
      { onSuccess: onClose },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>
          {tr("pages.admin_settings.invite_codes_tab.code_optional_auto_generated_if_empty")}
        </Label>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={tr("pages.admin_settings.invite_codes_tab.e_g_beta2026")}
        />
      </div>
      <div className="space-y-2">
        <Label>{tr("pages.admin_settings.invite_codes_tab.label")}</Label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={tr("pages.admin_settings.invite_codes_tab.e_g_beta_testers")}
        />
      </div>
      <div className="space-y-2">
        <Label>{tr("pages.admin_settings.invite_codes_tab.max_uses")}</Label>
        <Input
          type="number"
          min="1"
          value={maxUses}
          onChange={(e) => setMaxUses(e.target.value)}
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={createMutation.isPending}>
        {createMutation.isPending
          ? tr("pages.admin_settings.invite_codes_tab.creating")
          : tr("common.actions.create")}
      </Button>
    </form>
  );
}

function TopUpInviteCodeForm({ code, onClose }: { code: InviteCode; onClose: () => void }) {
  useUILanguage();
  const [additionalUses, setAdditionalUses] = useState("1");
  const topUpMutation = useTopUpInviteCode();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const amount = parseInt(additionalUses, 10);
    if (isNaN(amount) || amount <= 0) {
      toast.error(
        "errors.admin_settings.invite_codes_tab.additional_uses_must_be_a_positive_number",
      );
      return;
    }

    topUpMutation.mutate(
      { id: code.id, body: { additional_uses: amount } },
      { onSuccess: onClose },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>{tr("pages.admin_settings.invite_codes_tab.additional_uses")}</Label>
        <Input
          type="number"
          min="1"
          value={additionalUses}
          onChange={(e) => setAdditionalUses(e.target.value)}
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={topUpMutation.isPending}>
        {topUpMutation.isPending
          ? tr("pages.admin_settings.invite_codes_tab.adding")
          : tr("pages.admin_settings.invite_codes_tab.add_uses")}
      </Button>
    </form>
  );
}
