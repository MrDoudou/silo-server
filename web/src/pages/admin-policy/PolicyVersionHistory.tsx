import { RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "@/i18n/toast";

import { RegoEditor } from "@/components/policy/RegoEditor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useActivatePolicyVersion,
  usePolicyVersion,
  usePolicyVersions,
} from "@/hooks/queries/admin/policy";

import { formatPolicyDate, messageFromError } from "./policyPageUtils";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

interface PolicyVersionHistoryProps {
  documentId: number;
  activeVersionId?: number;
}

export function PolicyVersionHistory({ documentId, activeVersionId }: PolicyVersionHistoryProps) {
  useUILanguage();
  const { data: versions, isLoading } = usePolicyVersions(documentId);
  const [selectedVersionId, setSelectedVersionId] = useState<number | undefined>(undefined);
  const [rollbackVersionId, setRollbackVersionId] = useState<number | undefined>(undefined);
  const selectedVersion = usePolicyVersion(documentId, selectedVersionId);
  const activate = useActivatePolicyVersion();

  const effectiveSelectedId = selectedVersionId ?? versions?.[0]?.id;
  const effectiveVersion = usePolicyVersion(
    documentId,
    selectedVersionId === undefined ? versions?.[0]?.id : undefined,
  );
  const sourceVersion =
    selectedVersionId === undefined ? effectiveVersion.data : selectedVersion.data;

  const rollbackVersion = useMemo(
    () => versions?.find((version) => version.id === rollbackVersionId),
    [rollbackVersionId, versions],
  );

  async function confirmRollback() {
    if (!rollbackVersionId) return;
    try {
      await activate.mutateAsync({ documentId, version: rollbackVersionId });
      toast.success("feedback.admin_policy.policy_version_history.policy_version_activated");
      setRollbackVersionId(undefined);
    } catch (error) {
      toast.error("errors.admin_policy.policy_version_history.reported_message", {
        values: { message: messageFromError(error, "Failed to activate policy version") },
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="surface-panel-subtle overflow-hidden rounded-2xl">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("pages.admin_policy.policy_version_history.version")}</TableHead>
              <TableHead>{tr("pages.admin_policy.policy_version_history.author")}</TableHead>
              <TableHead>{tr("pages.admin_policy.policy_version_history.created")}</TableHead>
              <TableHead>{tr("pages.admin_policy.policy_version_history.comment")}</TableHead>
              <TableHead>{tr("pages.admin_policy.policy_version_history.compile")}</TableHead>
              <TableHead className="text-right">
                {tr("pages.admin_policy.policy_version_history.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-6 text-center">
                  {tr("pages.admin_policy.policy_version_history.loading_versions")}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && versions?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-6 text-center">
                  {tr(
                    "pages.admin_policy.policy_version_history.no_versions_have_been_saved_for_this_document",
                  )}
                </TableCell>
              </TableRow>
            )}
            {versions?.map((version) => {
              const isActive = version.id === activeVersionId;
              const isSelected = version.id === effectiveSelectedId;
              return (
                <TableRow
                  key={version.id}
                  data-state={isSelected ? "selected" : undefined}
                  className="cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedVersionId(version.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedVersionId(version.id);
                    }
                  }}
                >
                  <TableCell className="font-medium">
                    {tr("pages.admin_policy.policy_version_history.v")}
                    {version.version_number}
                    {isActive && (
                      <Badge variant="secondary" className="ml-2">
                        {tr("pages.admin_policy.policy_version_history.live")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {version.created_by_user_id
                      ? tr("pages.admin_policy.policy_version_history.user_created_by_user_id", {
                          created_by_user_id: version.created_by_user_id,
                        })
                      : "—"}
                  </TableCell>
                  <TableCell>{formatPolicyDate(version.created_at)}</TableCell>
                  <TableCell className="max-w-[260px] truncate">
                    {version.comment?.trim() || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={version.compiled_ok ? "secondary" : "destructive"}>
                      {version.compiled_ok
                        ? tr("pages.admin_policy.policy_version_history.compiled")
                        : tr("pages.admin_policy.policy_version_history.failed")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isActive || !version.compiled_ok}
                      onClick={(event) => {
                        event.stopPropagation();
                        setRollbackVersionId(version.id);
                      }}
                    >
                      <RotateCcw className="size-4" />
                      {tr("pages.admin_policy.policy_version_history.make_live")}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {sourceVersion?.source !== undefined && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">
            {tr("pages.admin_policy.policy_version_history.selected_source")}
          </h3>
          <RegoEditor value={sourceVersion.source} readOnly height="260px" />
        </div>
      )}

      <AlertDialog
        open={rollbackVersionId !== undefined}
        onOpenChange={(open) => !open && setRollbackVersionId(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tr("pages.admin_policy.policy_version_history.make_v")}
              {rollbackVersion?.version_number}{" "}
              {tr("pages.admin_policy.policy_version_history.the_live_policy")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tr(
                "pages.admin_policy.policy_version_history.new_requests_start_using_it_immediately_on_every_server_node",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("common.actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRollback} disabled={activate.isPending}>
              {tr("pages.admin_policy.policy_version_history.activate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
