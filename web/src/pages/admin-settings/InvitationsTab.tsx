import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Invitation, InvitationStatus, SendInvitationResponse } from "@/api/types";
import {
  useAdminInvitations,
  useCreateInvitation,
  useResendInvitation,
  useRevokeInvitation,
} from "@/hooks/queries/admin/invitations";
import { useAccessGroups } from "@/hooks/queries/admin/accessGroups";
import { useAdminLibraries } from "@/hooks/queries/admin/libraries";
import { effectiveAccessGroupID } from "@/components/UserPolicyFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { LibraryAccessSelector } from "@/components/LibraryAccessSelector";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Copy, MailPlus, RotateCw, Trash2 } from "lucide-react";
import { toast } from "@/i18n/toast";

import { formatDate } from "@/lib/datetime";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

// The claim-link box shown after create/resend. min-w-0 + overflow-hidden on
// every level matters: the URL is one unbreakable token, and without them it
// forces the dialog wider than the viewport on phones.
function ClaimLinkBox({
  claimUrl,
  finePrint,
  onCopy,
  onDone,
}: {
  claimUrl: string;
  finePrint: string;
  onCopy: (text: string) => void;
  onDone: () => void;
}) {
  useUILanguage();
  return (
    <div className="min-w-0 space-y-4">
      <div className="bg-muted min-w-0 overflow-hidden rounded-md p-2.5">
        <code className="block truncate text-xs">{claimUrl}</code>
      </div>
      <p className="text-muted-foreground text-xs">{finePrint}</p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => onCopy(claimUrl)}>
          <Copy className="mr-1.5 h-4 w-4" /> {tr("pages.admin_settings.invitations_tab.copy_link")}
        </Button>
        <Button onClick={onDone}>{tr("common.actions.done")}</Button>
      </div>
    </div>
  );
}

const STATUS_BADGES: Record<InvitationStatus, { label: string; variant: "default" | "outline" }> = {
  pending: {
    get label() {
      return tr("pages.admin_settings.invitations_tab.sent");
    },
    variant: "default",
  },
  accepted: {
    get label() {
      return tr("pages.admin_settings.invitations_tab.accepted");
    },
    variant: "outline",
  },
  expired: {
    get label() {
      return tr("pages.admin_settings.invitations_tab.expired");
    },
    variant: "outline",
  },
  revoked: {
    get label() {
      return tr("pages.admin_settings.invitations_tab.revoked");
    },
    variant: "outline",
  },
};

export default function InvitationsTab() {
  useUILanguage();
  const { data: invitations = [], isLoading } = useAdminInvitations();
  const resend = useResendInvitation();
  const revoke = useRevokeInvitation();
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<Invitation | null>(null);
  // A resend mints a fresh single-use link; the response is the only chance
  // to read it, so we offer it for copying right away.
  const [resendResult, setResendResult] = useState<SendInvitationResponse | null>(null);

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("feedback.admin_settings.invitations_tab.copied_to_clipboard");
  }

  function handleResend(id: number) {
    resend.mutate(id, {
      onSuccess: (data) => {
        if (data.claim_url) setResendResult(data);
      },
    });
  }

  if (isLoading) return <div>{tr("pages.admin_settings.invitations_tab.loading_invitations")}</div>;

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={confirmRevoke !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRevoke(null);
        }}
        title={tr("pages.admin_settings.invitations_tab.revoke_invitation")}
        description={tr(
          "pages.admin_settings.invitations_tab.revoke_the_invitation_for_email_their_link_will_stop_working",
          { email: confirmRevoke?.email },
        )}
        confirmLabel={tr("pages.admin_settings.invitations_tab.revoke")}
        variant="destructive"
        onConfirm={() => {
          if (confirmRevoke) revoke.mutate(confirmRevoke.id);
          setConfirmRevoke(null);
        }}
      />

      <Dialog
        open={resendResult !== null}
        onOpenChange={(open) => {
          if (!open) setResendResult(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {tr("pages.admin_settings.invitations_tab.fresh_invitation_link")}
            </DialogTitle>
            <DialogDescription>
              {resendResult?.email_sent
                ? tr(
                    "pages.admin_settings.invitations_tab.emailed_to_email_you_can_also_copy_the_link_and",
                    { email: resendResult.invitation.email },
                  )
                : tr(
                    "pages.admin_settings.invitations_tab.email_isn_t_configured_on_this_server_so_nothing_was",
                  )}
            </DialogDescription>
          </DialogHeader>
          {resendResult?.claim_url && (
            <ClaimLinkBox
              claimUrl={resendResult.claim_url}
              finePrint={tr(
                "pages.admin_settings.invitations_tab.the_link_works_once_any_previous_link_for_this_invitation",
              )}
              onCopy={handleCopy}
              onDone={() => setResendResult(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <div className="flex items-start justify-between gap-4">
        <p className="text-muted-foreground max-w-xl text-sm">
          {tr(
            "pages.admin_settings.invitations_tab.email_someone_a_personal_link_their_access_is_set_here",
          )}
        </p>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <MailPlus className="mr-1 h-4 w-4" />{" "}
              {tr("pages.admin_settings.invitations_tab.invite_someone")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{tr("pages.admin_settings.invitations_tab.invite_someone")}</DialogTitle>
              <DialogDescription>
                {tr(
                  "pages.admin_settings.invitations_tab.they_get_an_email_with_a_link_their_username_is",
                )}
              </DialogDescription>
            </DialogHeader>
            <CreateInvitationForm onClose={() => setCreateOpen(false)} onCopy={handleCopy} />
          </DialogContent>
        </Dialog>
      </div>

      {invitations.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          {tr(
            "pages.admin_settings.invitations_tab.no_invitations_yet_invite_someone_to_get_started",
          )}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("pages.admin_settings.invitations_tab.recipient")}</TableHead>
              <TableHead>{tr("pages.admin_settings.invitations_tab.role")}</TableHead>
              <TableHead>{tr("pages.admin_settings.invitations_tab.status")}</TableHead>
              <TableHead>{tr("pages.admin_settings.invitations_tab.sent")}</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitations.map((inv) => (
              <InvitationRow
                key={inv.id}
                invitation={inv}
                onResend={() => handleResend(inv.id)}
                onRevoke={() => setConfirmRevoke(inv)}
                resending={resend.isPending}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function InvitationRow({
  invitation,
  onResend,
  onRevoke,
  resending,
}: {
  invitation: Invitation;
  onResend: () => void;
  onRevoke: () => void;
  resending: boolean;
}) {
  useUILanguage();
  const badge = STATUS_BADGES[invitation.status];
  const showResend = invitation.status === "pending" || invitation.status === "expired";
  const showRevoke = invitation.status === "pending";

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{invitation.email}</div>
        {invitation.invited_by_name && (
          <div className="text-muted-foreground text-xs">
            {tr("pages.admin_settings.invitations_tab.invited_by")} {invitation.invited_by_name}
          </div>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground capitalize">{invitation.role}</TableCell>
      <TableCell>
        <Badge variant={badge.variant}>{badge.label}</Badge>
        {invitation.status === "pending" && (
          <span className="text-muted-foreground ml-2 text-xs">
            {tr("pages.admin_settings.invitations_tab.expires")} {formatDate(invitation.expires_at)}
          </span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {formatDate(invitation.created_at)}
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          {showResend && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onResend}
              disabled={resending}
              title={tr("pages.admin_settings.invitations_tab.resend_with_a_fresh_link")}
            >
              <RotateCw className="h-4 w-4" />
            </Button>
          )}
          {showRevoke && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRevoke}
              title={tr("pages.admin_settings.invitations_tab.revoke_this_link")}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function CreateInvitationForm({
  onClose,
  onCopy,
}: {
  onClose: () => void;
  onCopy: (text: string) => void;
}) {
  useUILanguage();
  const create = useCreateInvitation();
  const { data: accessGroups = [] } = useAccessGroups();
  const { data: libraries = [] } = useAdminLibraries();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user");
  const [accessGroupID, setAccessGroupID] = useState<number | null>(null);
  const [libraryIDs, setLibraryIDs] = useState<number[] | null>(null);
  const [note, setNote] = useState("");
  const [createProfile, setCreateProfile] = useState(true);
  const [showTour, setShowTour] = useState(true);
  // After creation we keep the dialog open to show the claim link — the
  // token is only readable in this response, so this is the one chance to
  // copy it. emailSent changes the copy: delivered vs deliver-it-yourself.
  const [result, setResult] = useState<{ claimUrl: string; emailSent: boolean } | null>(null);

  const defaultGroup = useMemo(() => accessGroups.find((g) => g.is_default), [accessGroups]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate(
      {
        email,
        role,
        access_group_id: effectiveAccessGroupID(role, accessGroupID),
        library_ids: libraryIDs,
        create_profile: createProfile,
        show_tour: showTour,
        note: note.trim() || undefined,
      },
      {
        onSuccess: (data: SendInvitationResponse) => {
          if (data.email_sent) {
            toast.success("feedback.admin_settings.invitations_tab.invitation_sent_to_email", {
              values: {
                email: data.invitation.email,
              },
            });
          }
          if (data.claim_url) {
            setResult({ claimUrl: data.claim_url, emailSent: data.email_sent });
          } else {
            onClose();
          }
        },
      },
    );
  }

  if (result) {
    return (
      <div className="min-w-0 space-y-4">
        <p className="text-sm">
          {result.emailSent
            ? tr(
                "pages.admin_settings.invitations_tab.invitation_emailed_you_can_also_copy_the_link_and_send",
              )
            : tr(
                "pages.admin_settings.invitations_tab.email_isn_t_configured_on_this_server_so_nothing_was_661cdad1",
              )}
        </p>
        <ClaimLinkBox
          claimUrl={result.claimUrl}
          finePrint={tr(
            "pages.admin_settings.invitations_tab.the_link_works_once_and_expires_in_7_days_resending",
          )}
          onCopy={onCopy}
          onDone={onClose}
        />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="invitation-email">
          {tr("pages.admin_settings.invitations_tab.email_address")}
        </Label>
        <Input
          id="invitation-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={tr("pages.admin_settings.invitations_tab.them_example_com")}
          autoFocus
          required
        />
        <p className="text-muted-foreground text-xs">
          {tr(
            "pages.admin_settings.invitations_tab.this_becomes_both_the_destination_and_their_sign_in_username",
          )}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{tr("pages.admin_settings.invitations_tab.access_group")}</Label>
          <Select
            value={role === "admin" || accessGroupID === null ? "default" : String(accessGroupID)}
            onValueChange={(v) => setAccessGroupID(v === "default" ? null : Number(v))}
            disabled={role === "admin"}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">
                {defaultGroup
                  ? tr("pages.admin_settings.invitations_tab.name_default", {
                      name: defaultGroup.name,
                    })
                  : tr("pages.admin_settings.invitations_tab.server_default")}
              </SelectItem>
              {accessGroups
                .filter((g) => !g.is_default)
                .map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>
                    {g.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{tr("pages.admin_settings.invitations_tab.role")}</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">
                {tr("pages.admin_settings.invitations_tab.user")}
              </SelectItem>
              <SelectItem value="admin">
                {tr("pages.admin_settings.invitations_tab.admin")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <LibraryAccessSelector
        libraries={libraries}
        value={libraryIDs}
        onChange={setLibraryIDs}
        allLabel="Inherit from access group"
        emptyHint="The account created at accept follows the selected group's library scope."
      />

      <div className="space-y-2">
        <Label htmlFor="invitation-note">
          {tr("pages.admin_settings.invitations_tab.personal_note_optional")}
        </Label>
        <textarea
          id="invitation-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={tr("pages.admin_settings.invitations_tab.hey_set_yourself_up_whenever")}
          rows={2}
          className="border-border bg-background text-foreground focus:border-ring focus:ring-ring/50 w-full resize-y rounded-md border px-3 py-2.5 text-sm shadow-xs transition-[color,box-shadow] outline-none focus:ring-[3px]"
        />
        <p className="text-muted-foreground text-xs">
          {tr("pages.admin_settings.invitations_tab.appears_in_the_email_plain_text")}
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="invitation-create-profile">
              {tr("pages.admin_settings.invitations_tab.create_their_first_profile")}
            </Label>
            <p className="text-muted-foreground text-xs">
              {tr(
                "pages.admin_settings.invitations_tab.named_from_the_part_before_the_they_can_rename_it",
              )}
            </p>
          </div>
          <Switch
            id="invitation-create-profile"
            checked={createProfile}
            onCheckedChange={setCreateProfile}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="invitation-show-tour">
              {tr("pages.admin_settings.invitations_tab.show_the_feature_tour_on_first_sign_in")}
            </Label>
            <p className="text-muted-foreground text-xs">
              {tr(
                "pages.admin_settings.invitations_tab.walks_through_what_this_server_can_do_skipping_anything_turned",
              )}
            </p>
          </div>
          <Switch id="invitation-show-tour" checked={showTour} onCheckedChange={setShowTour} />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <p className="text-muted-foreground text-xs">
          {tr("pages.admin_settings.invitations_tab.link_expires_in_7_days_single_use")}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {tr("common.actions.cancel")}
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending
              ? tr("pages.admin_settings.invitations_tab.sending")
              : tr("pages.admin_settings.invitations_tab.send_invite")}
          </Button>
        </div>
      </div>
    </form>
  );
}
