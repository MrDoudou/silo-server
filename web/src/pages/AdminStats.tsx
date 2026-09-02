import type { ReactNode } from "react";
import { useAdminStats, useAdminSessions } from "@/hooks/queries/admin/stats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Film, FileVideo, Users, Play } from "lucide-react";
import type { AdminSession, AdminStats } from "@/api/types";
import { JellyfinSessionPill } from "@/components/JellyfinSessionPill";
import { classifyActivityMethod, getSessionClientLabel } from "@/pages/adminActivityPresentation";
import { formatDateTime } from "@/lib/datetime";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

export default function AdminStats() {
  useUILanguage();
  const statsQuery = useAdminStats();
  const sessionsQuery = useAdminSessions();
  const sessions = sessionsQuery.data ?? [];

  return (
    <div className="page-shell space-y-6 py-4 sm:py-6">
      <div className="page-header gap-5">
        <div className="space-y-3">
          <h1 className="page-title text-[clamp(2rem,4vw,3rem)]">
            {tr("pages.admin_stats.system_stats")}
          </h1>
          <p className="page-subtitle text-sm sm:text-base">
            {tr("pages.admin_stats.track_the_size_of_the_library_and_inspect_the_sessions")}
          </p>
        </div>
      </div>

      <StatsCards
        stats={statsQuery.data}
        sessionCount={sessions.length}
        isLoading={statsQuery.isLoading}
        error={statsQuery.error}
      />

      <SessionsSection
        sessions={sessions}
        isLoading={sessionsQuery.isLoading}
        error={sessionsQuery.error}
      />
    </div>
  );
}

function StatsCards({
  stats,
  sessionCount,
  isLoading,
  error,
}: {
  stats: AdminStats | undefined;
  sessionCount: number;
  isLoading: boolean;
  error: unknown;
}) {
  useUILanguage();
  if (error) {
    return <SectionError message={tr("pages.admin_stats.failed_to_load_stats")} />;
  }
  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[108px] rounded-2xl" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
      <StatCard
        title={tr("pages.admin_stats.media_items")}
        value={stats.total_items}
        icon={<Film className="h-4 w-4" />}
      />
      <StatCard
        title={tr("pages.admin_stats.files")}
        value={stats.total_files}
        icon={<FileVideo className="h-4 w-4" />}
      />
      <StatCard
        title={tr("pages.admin_stats.users")}
        value={stats.total_users}
        icon={<Users className="h-4 w-4" />}
      />
      <StatCard
        title={tr("pages.admin_stats.active_sessions")}
        value={sessionCount}
        icon={<Play className="h-4 w-4" />}
      />
    </div>
  );
}

function SessionsSection({
  sessions,
  isLoading,
  error,
}: {
  sessions: AdminSession[];
  isLoading: boolean;
  error: unknown;
}) {
  useUILanguage();
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-medium tracking-tight">
        {tr("pages.admin_stats.active_playback_sessions")}
      </h2>
      {isLoading ? (
        <div className="surface-panel space-y-2 rounded-2xl p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : error ? (
        <SectionError message={tr("pages.admin_stats.failed_to_load_active_sessions")} />
      ) : sessions.length === 0 ? (
        <div className="surface-panel text-muted-foreground rounded-2xl py-12 text-center text-sm">
          {tr("pages.admin_stats.no_active_sessions")}
        </div>
      ) : (
        <div className="surface-panel overflow-x-auto rounded-2xl border-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr("pages.admin_stats.session_id")}</TableHead>
                <TableHead>{tr("pages.admin_stats.user_id")}</TableHead>
                <TableHead>{tr("pages.admin_stats.file_id")}</TableHead>
                <TableHead>{tr("pages.admin_stats.method")}</TableHead>
                <TableHead>{tr("pages.admin_stats.client")}</TableHead>
                <TableHead>{tr("pages.admin_stats.started")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.session_id}>
                  <TableCell className="font-mono text-xs">{s.session_id.slice(0, 8)}...</TableCell>
                  <TableCell>{s.user_id}</TableCell>
                  <TableCell>{s.media_file_id}</TableCell>
                  <TableCell className="capitalize">{classifyActivityMethod(s)}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      {getSessionClientLabel(s) || "—"}
                      <JellyfinSessionPill session={s} />
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">{formatDateTime(s.started_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: number; icon: ReactNode }) {
  useUILanguage();
  return (
    <Card className="surface-panel rounded-2xl border-0 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-tight">{value.toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}

function SectionError({ message }: { message: string }) {
  useUILanguage();
  return (
    <div className="surface-panel text-destructive rounded-2xl py-6 text-center text-sm">
      {message}
    </div>
  );
}
