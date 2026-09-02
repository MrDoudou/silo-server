import { useState } from "react";
import type { FormEvent } from "react";
import type {
  AdminJob,
  CatalogSeedExportResult,
  CatalogSeedImportSource,
  CatalogPathRewrite,
} from "@/api/types";
import {
  useCatalogExportJobs,
  useCatalogImportJobs,
  useCatalogImportSources,
  useCreateCatalogExportJob,
  useImportCatalogSeed,
  useLocalImportSources,
  usePublishCatalogExportJob,
} from "@/hooks/queries/admin/libraries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

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
import {
  addEmptyPathRewrite,
  createEmptyPathRewrite,
  removePathRewrite,
  type PathRewriteRow,
  updatePathRewrite,
} from "./adminCatalogMaintenancePathRewrites";
import { formatExportProgressLabel, formatJobProgress } from "./adminCatalogMaintenanceFormatters";
import { Download, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { formatDateTime } from "@/lib/datetime";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

export default function AdminCatalogMaintenance() {
  useUILanguage();
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const exportJobsQuery = useCatalogExportJobs();
  const importJobsQuery = useCatalogImportJobs();
  const importSourcesQuery = useCatalogImportSources();
  const exportMutation = useCreateCatalogExportJob();
  const publishMutation = usePublishCatalogExportJob();
  const importMutation = useImportCatalogSeed();
  const exportJobs = exportJobsQuery.data ?? [];
  const importJobs = importJobsQuery.data ?? [];
  const completedExportJobs = exportJobs.filter((job) => job.status === "completed");
  const bucketImportSources = importSourcesQuery.data ?? [];
  const localImportSourcesQuery = useLocalImportSources();
  const localImportSources = localImportSourcesQuery.data ?? [];
  const [localPath, setLocalPath] = useState("/catalog-seeds/");
  const [remoteURL, setRemoteURL] = useState("");
  const [importSource, setImportSource] = useState<
    "local_path" | "export_job" | "bucket_artifact" | "remote_url"
  >("local_path");
  const [selectedExportJobId, setSelectedExportJobId] = useState("");
  const [selectedArtifactKey, setSelectedArtifactKey] = useState("");
  const [conflictMode, setConflictMode] = useState<"skip_existing" | "overwrite_existing">(
    "skip_existing",
  );
  const [pathRewrites, setPathRewrites] = useState<PathRewriteRow[]>([createEmptyPathRewrite()]);

  function updateRewrite(index: number, field: keyof CatalogPathRewrite, value: string) {
    setPathRewrites((current) => updatePathRewrite(current, index, field, value));
  }

  function addRewrite() {
    setPathRewrites((current) => addEmptyPathRewrite(current));
  }

  function removeRewrite(index: number) {
    setPathRewrites((current) => removePathRewrite(current, index));
  }

  function resetImportState() {
    setImportSource("local_path");
    setLocalPath("/catalog-seeds/");
    setSelectedExportJobId("");
    setSelectedArtifactKey("");
    setRemoteURL("");
    setConflictMode("skip_existing");
    setPathRewrites([createEmptyPathRewrite()]);
  }

  function handleImportSubmit(e: FormEvent) {
    e.preventDefault();
    if (importSource === "local_path" && !localPath.trim()) return;
    if (importSource === "export_job" && !selectedExportJobId) return;
    if (importSource === "bucket_artifact" && !selectedArtifactKey) return;
    if (importSource === "remote_url" && !remoteURL.trim()) return;

    const filteredRewrites = pathRewrites.filter(
      (rewrite) => rewrite.from.trim() && rewrite.to.trim(),
    );

    importMutation.mutate(
      {
        source: importSource,
        ...(importSource === "local_path"
          ? { local_path: localPath.trim() }
          : importSource === "export_job"
            ? { export_job_id: selectedExportJobId }
            : importSource === "bucket_artifact"
              ? { artifact_key: selectedArtifactKey }
              : { remote_url: remoteURL.trim() }),
        conflict_mode: conflictMode,
        path_rewrites: filteredRewrites,
      },
      {
        onSuccess: () => {
          setImportDialogOpen(false);
          resetImportState();
        },
      },
    );
  }

  const isImportSubmitDisabled =
    importMutation.isPending ||
    (importSource === "local_path"
      ? !localPath.trim()
      : importSource === "export_job"
        ? !selectedExportJobId
        : importSource === "bucket_artifact"
          ? !selectedArtifactKey
          : !remoteURL.trim());

  return (
    <div className="space-y-6">
      <div className="border-border/70 bg-card/60 flex flex-col gap-4 rounded-lg border p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">
            {tr("components.admin_catalog_maintenance.catalog_import_export")}
          </h2>
          <p className="text-muted-foreground text-sm">
            {tr(
              "components.admin_catalog_maintenance.queue_full_catalog_exports_import_seeds_from_uploads_or_s3",
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportMutation.mutate({})}
            disabled={exportMutation.isPending}
          >
            <Download
              className={"mr-1 h-4 w-4 " + (exportMutation.isPending ? "animate-pulse" : "")}
            />
            {tr("components.admin_catalog_maintenance.start_export")}
          </Button>
          <Dialog
            open={importDialogOpen}
            onOpenChange={(open) => {
              setImportDialogOpen(open);
              if (!open) {
                resetImportState();
              }
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Upload className="mr-1 h-4 w-4" />
                {tr("components.admin_catalog_maintenance.import_catalog")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {tr("components.admin_catalog_maintenance.import_catalog_seed")}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleImportSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>{tr("components.admin_catalog_maintenance.import_source")}</Label>
                  <Select
                    value={importSource}
                    onValueChange={(value) =>
                      setImportSource(value as "local_path" | "export_job" | "bucket_artifact")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="local_path">
                        {tr("components.admin_catalog_maintenance.local_file")}
                      </SelectItem>
                      <SelectItem value="export_job">
                        {tr("components.admin_catalog_maintenance.local_export_job")}
                      </SelectItem>
                      <SelectItem value="bucket_artifact">
                        {tr("components.admin_catalog_maintenance.bucket_artifact")}
                      </SelectItem>
                      <SelectItem value="remote_url">
                        {tr("components.admin_catalog_maintenance.remote_url")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {importSource === "local_path" ? (
                  <div className="space-y-2">
                    <Label>{tr("components.admin_catalog_maintenance.file_path")}</Label>
                    <Input
                      value={localPath}
                      onChange={(e) => setLocalPath(e.target.value)}
                      placeholder={tr(
                        "components.admin_catalog_maintenance.catalog_seeds_my_catalog_json_gz",
                      )}
                    />
                    {localImportSources.length > 0 && (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <Label className="text-muted-foreground text-xs">
                            {tr("components.admin_catalog_maintenance.detected_files")}
                          </Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => localImportSourcesQuery.refetch()}
                            disabled={localImportSourcesQuery.isFetching}
                          >
                            <RefreshCw
                              className={
                                "mr-1 h-4 w-4 " +
                                (localImportSourcesQuery.isFetching ? "animate-spin" : "")
                              }
                            />
                            {tr("common.actions.refresh")}
                          </Button>
                        </div>
                        <Select value="" onValueChange={(value) => setLocalPath(value)}>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={tr(
                                "components.admin_catalog_maintenance.select_a_detected_file",
                              )}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {localImportSources.map((source) => (
                              <SelectItem key={source.key} value={source.key}>
                                {describeImportSource(source)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </>
                    )}
                    <p className="text-muted-foreground text-xs">
                      {tr("components.admin_catalog_maintenance.enter_the_absolute_path_to_a")}{" "}
                      <span className="font-mono">
                        {tr("components.admin_catalog_maintenance.json_gz")}
                      </span>{" "}
                      {tr(
                        "components.admin_catalog_maintenance.catalog_seed_file_on_the_server_or_select_a_detected",
                      )}{" "}
                      <span className="font-mono">
                        {tr("components.admin_catalog_maintenance.catalog_seeds")}
                      </span>
                      .
                    </p>
                  </div>
                ) : importSource === "export_job" ? (
                  <div className="space-y-2">
                    <Label>{tr("components.admin_catalog_maintenance.completed_export")}</Label>
                    <Select value={selectedExportJobId} onValueChange={setSelectedExportJobId}>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={tr(
                            "components.admin_catalog_maintenance.choose_a_completed_export_job",
                          )}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {completedExportJobs.length === 0 ? (
                          <SelectItem value="__none" disabled>
                            {tr("components.admin_catalog_maintenance.no_completed_exports_yet")}
                          </SelectItem>
                        ) : (
                          completedExportJobs.map((job) => (
                            <SelectItem key={job.id} value={job.id}>
                              {describeExportJob(job)}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <p className="text-muted-foreground text-xs">
                      {tr(
                        "components.admin_catalog_maintenance.silo_will_load_the_selected_seed_directly_from_the_configured",
                      )}
                    </p>
                  </div>
                ) : importSource === "bucket_artifact" ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label>
                        {tr("components.admin_catalog_maintenance.detected_bucket_artifacts")}
                      </Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => importSourcesQuery.refetch()}
                        disabled={importSourcesQuery.isFetching}
                      >
                        <RefreshCw
                          className={
                            "mr-1 h-4 w-4 " + (importSourcesQuery.isFetching ? "animate-spin" : "")
                          }
                        />
                        {tr("common.actions.refresh")}
                      </Button>
                    </div>
                    <Select value={selectedArtifactKey} onValueChange={setSelectedArtifactKey}>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={tr(
                            "components.admin_catalog_maintenance.choose_a_catalog_seed_from_the_bucket",
                          )}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {bucketImportSources.length === 0 ? (
                          <SelectItem value="__none" disabled>
                            {tr(
                              "components.admin_catalog_maintenance.no_catalog_seed_objects_found",
                            )}
                          </SelectItem>
                        ) : (
                          bucketImportSources.map((source) => (
                            <SelectItem key={source.key} value={source.key}>
                              {describeImportSource(source)}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <p className="text-muted-foreground text-xs">
                      {tr(
                        "components.admin_catalog_maintenance.this_reads_any_detected_catalog_seeds_json_gz_object_in",
                      )}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>{tr("components.admin_catalog_maintenance.remote_url")}</Label>
                    <Input
                      value={remoteURL}
                      onChange={(e) => setRemoteURL(e.target.value)}
                      placeholder={tr(
                        "components.admin_catalog_maintenance.https_example_com_catalog_seeds_export_json_gz",
                      )}
                    />
                    <p className="text-muted-foreground text-xs">
                      {tr("components.admin_catalog_maintenance.paste_a_public")}{" "}
                      <span className="font-mono">
                        {tr("components.admin_catalog_maintenance.json_gz")}
                      </span>{" "}
                      {tr(
                        "components.admin_catalog_maintenance.catalog_seed_url_silo_will_download_it_server_side_before",
                      )}
                    </p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>{tr("components.admin_catalog_maintenance.conflict_mode")}</Label>
                  <Select
                    value={conflictMode}
                    onValueChange={(value) =>
                      setConflictMode(value as "skip_existing" | "overwrite_existing")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skip_existing">
                        {tr("components.admin_catalog_maintenance.skip_existing")}
                      </SelectItem>
                      <SelectItem value="overwrite_existing">
                        {tr("components.admin_catalog_maintenance.overwrite_existing")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>{tr("components.admin_catalog_maintenance.path_rewrites")}</Label>
                    <p className="text-muted-foreground text-xs">
                      {tr(
                        "components.admin_catalog_maintenance.rewrites_use_prefix_matching_mapping",
                      )}{" "}
                      <span className="font-mono">
                        {tr("components.admin_catalog_maintenance.srv_media")}
                      </span>{" "}
                      {tr("components.admin_catalog_maintenance.to")}{" "}
                      <span className="font-mono">
                        {tr("components.admin_catalog_maintenance.media")}
                      </span>{" "}
                      {tr(
                        "components.admin_catalog_maintenance.rewrites_every_nested_library_and_file_path_under_that_root",
                      )}
                    </p>
                  </div>
                  {pathRewrites.map((rewrite, index) => (
                    <div key={rewrite.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <Input
                        value={rewrite.from}
                        onChange={(e) => updateRewrite(index, "from", e.target.value)}
                        placeholder={tr("components.admin_catalog_maintenance.srv_media")}
                      />
                      <Input
                        value={rewrite.to}
                        onChange={(e) => updateRewrite(index, "to", e.target.value)}
                        placeholder={tr("components.admin_catalog_maintenance.media")}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        aria-label={tr("components.admin_catalog_maintenance.remove_path_rewrite")}
                        onClick={() => removeRewrite(index)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addRewrite}>
                    <Plus className="mr-1 h-4 w-4" />{" "}
                    {tr("components.admin_catalog_maintenance.add_rewrite")}
                  </Button>
                </div>
                <div className="border-border/60 bg-muted/30 text-muted-foreground rounded-md border p-3 text-xs">
                  {tr(
                    "components.admin_catalog_maintenance.import_validates_the_rewritten_library_roots_before_writing_anything_so",
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={isImportSubmitDisabled}>
                  {importMutation.isPending
                    ? tr("components.admin_catalog_maintenance.importing")
                    : tr("components.admin_catalog_maintenance.import_catalog")}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="border-border/70 bg-card/60 rounded-lg border">
        <div className="border-border/70 flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">
              {tr("components.admin_catalog_maintenance.recent_catalog_imports")}
            </h3>
            <p className="text-muted-foreground text-xs">
              {tr(
                "components.admin_catalog_maintenance.imports_run_in_the_background_so_progress_stays_visible_while",
              )}
            </p>
          </div>
          {importJobsQuery.isFetching ? (
            <Badge variant="outline">{tr("components.admin_catalog_maintenance.refreshing")}</Badge>
          ) : (
            <Badge variant="secondary">{importJobs.length}</Badge>
          )}
        </div>
        <div className="divide-border/60 divide-y">
          {importJobs.length === 0 ? (
            <div className="text-muted-foreground px-4 py-5 text-sm">
              {tr("components.admin_catalog_maintenance.no_catalog_import_jobs_yet")}
            </div>
          ) : (
            importJobs.map((job) => {
              const importResult = job.result_payload as Record<string, number | undefined>;
              const progressPercent = getJobProgressPercent(job);

              return (
                <div
                  key={job.id}
                  className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          job.status === "failed"
                            ? "destructive"
                            : job.status === "completed"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {job.status}
                      </Badge>
                      <span className="text-sm font-medium">{describeImportJob(job)}</span>
                      <span className="text-muted-foreground text-xs">
                        {tr("components.admin_catalog_maintenance.requested")}{" "}
                        {formatDateTime(job.requested_at)}
                      </span>
                    </div>
                    <div className="text-muted-foreground text-sm">
                      {job.message
                        ? tr.remote({ message: job.message })
                        : tr("components.admin_catalog_maintenance.catalog_import_job")}
                    </div>
                    <div className="bg-muted h-2 overflow-hidden rounded-full">
                      <div
                        className="bg-primary h-full rounded-full transition-[width] duration-300"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <div className="text-muted-foreground flex flex-wrap gap-4 text-xs">
                      <span>
                        {tr("components.admin_catalog_maintenance.progress")}{" "}
                        {formatJobProgress(job)}
                      </span>
                      {job.completed_at ? (
                        <span>
                          {tr("components.admin_catalog_maintenance.finished")}{" "}
                          {formatDateTime(job.completed_at)}
                        </span>
                      ) : null}
                      {job.status === "completed" ? (
                        <span>
                          {tr("components.admin_catalog_maintenance.imported")}{" "}
                          {importResult.items_created ?? 0}{" "}
                          {tr("components.admin_catalog_maintenance.items_and")}{" "}
                          {importResult.files_created ?? 0}{" "}
                          {tr("components.admin_catalog_maintenance.files")}
                        </span>
                      ) : null}
                    </div>
                    {job.error_message ? (
                      <div className="text-destructive text-xs">
                        {tr.remote({ message: job.error_message })}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => importJobsQuery.refetch()}>
                      <RefreshCw className="mr-1 h-4 w-4" />
                      {tr("common.actions.refresh")}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="border-border/70 bg-card/60 rounded-lg border">
        <div className="border-border/70 flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">
              {tr("components.admin_catalog_maintenance.recent_catalog_exports")}
            </h3>
            <p className="text-muted-foreground text-xs">
              {tr(
                "components.admin_catalog_maintenance.export_jobs_run_in_the_background_and_upload_finished_seeds",
              )}
            </p>
          </div>
          {exportJobsQuery.isFetching ? (
            <Badge variant="outline">{tr("components.admin_catalog_maintenance.refreshing")}</Badge>
          ) : (
            <Badge variant="secondary">{exportJobs.length}</Badge>
          )}
        </div>
        <div className="divide-border/60 divide-y">
          {exportJobs.length === 0 ? (
            <div className="text-muted-foreground px-4 py-5 text-sm">
              {tr("components.admin_catalog_maintenance.no_catalog_export_jobs_yet")}
            </div>
          ) : (
            exportJobs.map((job) => {
              const exportRequest = job.request_payload as { library_ids?: number[] };
              const exportResult = job.result_payload as Partial<CatalogSeedExportResult>;
              const scopeLabel =
                exportRequest.library_ids && exportRequest.library_ids.length > 0
                  ? `${exportRequest.library_ids.length} librar${exportRequest.library_ids.length === 1 ? "y" : "ies"}`
                  : "All libraries";
              const progressLabel = formatExportProgressLabel(
                job.progress_current,
                job.progress_total,
                job.status,
              );

              return (
                <div
                  key={job.id}
                  className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          job.status === "failed"
                            ? "destructive"
                            : job.status === "completed"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {job.status}
                      </Badge>
                      <span className="text-sm font-medium">{scopeLabel}</span>
                      <span className="text-muted-foreground text-xs">
                        {tr("components.admin_catalog_maintenance.requested")}{" "}
                        {formatDateTime(job.requested_at)}
                      </span>
                    </div>
                    <div className="text-muted-foreground text-sm">
                      {job.message
                        ? tr.remote({ message: job.message })
                        : tr("components.admin_catalog_maintenance.catalog_export_job")}
                    </div>
                    <div className="text-muted-foreground flex flex-wrap gap-4 text-xs">
                      <span>
                        {tr("components.admin_catalog_maintenance.progress")} {progressLabel}
                      </span>
                      {job.completed_at ? (
                        <span>
                          {tr("components.admin_catalog_maintenance.finished")}{" "}
                          {formatDateTime(job.completed_at)}
                        </span>
                      ) : null}
                      {exportResult.items_exported ? (
                        <span>
                          {tr("components.admin_catalog_maintenance.exported")}{" "}
                          {exportResult.items_exported}{" "}
                          {tr("components.admin_catalog_maintenance.items_and")}{" "}
                          {exportResult.files_exported ?? 0}{" "}
                          {tr("components.admin_catalog_maintenance.files")}
                        </span>
                      ) : null}
                    </div>
                    {job.error_message ? (
                      <div className="text-destructive text-xs">
                        {tr.remote({ message: job.error_message })}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => exportJobsQuery.refetch()}>
                      <RefreshCw className="mr-1 h-4 w-4" />
                      {tr("common.actions.refresh")}
                    </Button>
                    {job.download_url ? (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() =>
                          window.open(job.download_url, "_blank", "noopener,noreferrer")
                        }
                      >
                        <Download className="mr-1 h-4 w-4" />
                        {tr("common.actions.download")}
                      </Button>
                    ) : null}
                    {job.status === "completed" && !job.public_url ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => publishMutation.mutate(job.id)}
                        disabled={publishMutation.isPending}
                      >
                        {tr("components.admin_catalog_maintenance.publish")}
                      </Button>
                    ) : null}
                    {job.public_url ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          await navigator.clipboard.writeText(job.public_url ?? "");
                        }}
                      >
                        {tr("components.admin_catalog_maintenance.copy_url")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function describeExportJob(job: AdminJob) {
  const exportRequest = job.request_payload as { library_ids?: number[] };
  const scopeLabel =
    exportRequest.library_ids && exportRequest.library_ids.length > 0
      ? `${exportRequest.library_ids.length} librar${exportRequest.library_ids.length === 1 ? "y" : "ies"}`
      : "All libraries";
  return `${scopeLabel} • ${formatDateTime(job.requested_at)}`;
}

function describeImportJob(job: AdminJob) {
  const importRequest = job.request_payload as {
    source_label?: string;
    source_key?: string;
  };
  return importRequest.source_label || importRequest.source_key || "Catalog seed";
}

function describeImportSource(source: CatalogSeedImportSource) {
  const label = source.last_modified ? formatDateTime(source.last_modified) : source.key;
  return `${label} • ${source.key}`;
}

function getJobProgressPercent(job: AdminJob) {
  if (job.progress_total > 0) {
    return Math.min(100, Math.max(0, (job.progress_current / job.progress_total) * 100));
  }
  if (job.status === "completed") {
    return 100;
  }
  if (job.status === "running") {
    return 12;
  }
  return 4;
}
