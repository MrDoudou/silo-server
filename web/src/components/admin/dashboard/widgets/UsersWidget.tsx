import { Link, useNavigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminUser } from "@/api/types";
import { formatRelativeTime } from "@/lib/date";
import { useAdminUsers } from "@/hooks/queries/admin/users";
import { SectionError, UserSkeletonRows } from "../feedback";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

// Most recently active first; users with no recorded activity sink to the
// bottom. The list endpoint itself returns account-creation order.
function byLastActive(a: AdminUser, b: AdminUser): number {
  const at = a.last_active_at ? Date.parse(a.last_active_at) : 0;
  const bt = b.last_active_at ? Date.parse(b.last_active_at) : 0;
  if (at !== bt) {
    return bt - at;
  }
  return a.username.localeCompare(b.username);
}

export function UsersWidget() {
  useUILanguage();
  const navigate = useNavigate();
  const usersQuery = useAdminUsers();
  const users = [...(usersQuery.data ?? [])].sort(byLastActive);

  return (
    <Card className="h-full">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-bold">
          {tr("components.admin.dashboard.widgets.users_widget.users")}
        </CardTitle>
        <Link
          to="/admin/users"
          className="text-muted-foreground hover:text-primary text-[11px] transition-colors"
        >
          {tr("components.admin.dashboard.widgets.users_widget.manage")}
        </Link>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto">
        {usersQuery.isLoading ? (
          <UserSkeletonRows />
        ) : usersQuery.error ? (
          <SectionError
            message={tr("components.admin.dashboard.widgets.users_widget.failed_to_load_users")}
          />
        ) : users.length === 0 ? (
          <div className="text-muted-foreground py-4 text-center text-sm">
            {tr("components.admin.dashboard.widgets.users_widget.no_users")}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr("components.admin.dashboard.widgets.users_widget.user")}</TableHead>
                <TableHead className="hidden sm:table-cell">
                  {tr("components.admin.dashboard.widgets.users_widget.last_active")}
                </TableHead>
                <TableHead>
                  {tr("components.admin.dashboard.widgets.users_widget.status")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.slice(0, 8).map((u) => (
                <TableRow
                  key={u.id}
                  className="hover:bg-accent/50 focus-visible:ring-ring cursor-pointer focus-visible:ring-2 focus-visible:outline-none"
                  role="link"
                  tabIndex={0}
                  aria-label={tr("components.admin.dashboard.widgets.users_widget.open_username", {
                    username: u.username,
                  })}
                  onClick={() => navigate(`/admin/users/${u.id}`)}
                  onKeyDown={(event) => {
                    // Space scrolls the page by default; a row that behaves like
                    // a link has to swallow it before navigating.
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(`/admin/users/${u.id}`);
                    }
                  }}
                >
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div
                        className="text-primary-foreground flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                        style={{ background: `var(--primary)` }}
                      >
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-semibold">{u.username}</span>
                          {u.role === "admin" && (
                            <Badge variant="default" className="px-1.5 py-0 text-[9px]">
                              {tr("components.admin.dashboard.widgets.users_widget.admin")}
                            </Badge>
                          )}
                        </div>
                        <div className="text-muted-foreground hidden truncate text-[10px] sm:block">
                          {u.email}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-xs whitespace-nowrap sm:table-cell">
                    {formatRelativeTime(u.last_active_at ?? null, {
                      rounding: "floor",
                      justNowLabel: "Just now",
                    }) ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.enabled ? "outline" : "destructive"}>
                      {u.enabled
                        ? tr("components.admin.dashboard.widgets.users_widget.active")
                        : tr("components.admin.dashboard.widgets.users_widget.disabled")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
