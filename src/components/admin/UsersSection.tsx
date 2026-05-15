import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, Mail, RefreshCcw, Trash2, UserCircle } from "lucide-react";
import ScrollableTable from "./ScrollableTable";

interface AdminUser {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
  lastSeenAt: string;
}

interface UsersResponse {
  users: AdminUser[];
  total: number;
  inactiveDays: number;
}

interface CleanupResponse {
  removed: AdminUser[];
  remaining: number;
  emails: Array<{
    email: string;
    ok?: boolean;
    skipped?: boolean;
    reason?: string;
    status?: number;
    error?: string;
    detail?: unknown;
  }>;
}

const formatDate = (iso: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
};

const daysAgo = (iso: string) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
};

export function UsersSection() {
  const { token } = useAdminAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [inactiveDays, setInactiveDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!token) return;
      if (!silent) setRefreshing(true);
      try {
        const response = await fetch("/api/users?action=list", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error("Could not load users");
        }
        const data = (await response.json()) as UsersResponse;
        setUsers(data.users || []);
        setInactiveDays(data.inactiveDays || 30);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not load users",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (user: AdminUser) => {
    if (!token) return;
    setDeletingId(user.id);
    try {
      const response = await fetch(
        `/api/users?id=${encodeURIComponent(user.id)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Could not delete user");
      }
      toast.success(`Deleted ${user.email}`);
      setUsers((current) => current.filter((u) => u.id !== user.id));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete user",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleRunCleanup = async () => {
    if (!token) return;
    setRunning(true);
    try {
      const response = await fetch("/api/users?action=cleanup-now", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Cleanup failed");
      }
      const data = (await response.json()) as CleanupResponse;
      const removedCount = data.removed?.length || 0;
      const skipped = data.emails?.filter((e) => e.skipped).length || 0;
      const sent = data.emails?.filter((e) => e.ok).length || 0;
      toast.success(
        `Cleanup ran: removed ${removedCount}, sent ${sent} email${sent === 1 ? "" : "s"}` +
          (skipped ? `, skipped ${skipped} (no Resend key)` : ""),
      );
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cleanup failed");
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading users…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="bg-card/40 border border-border/60 rounded-xl p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
            <UserCircle className="w-4 h-4" />
            Registered
          </div>
          <div className="mt-2 font-display text-3xl">{users.length}</div>
        </div>
        <div className="bg-card/40 border border-border/60 rounded-xl p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
            <RefreshCcw className="w-4 h-4" />
            Active in 7 days
          </div>
          <div className="mt-2 font-display text-3xl">
            {
              users.filter((u) => {
                const d = daysAgo(u.lastSeenAt);
                return d !== null && d <= 7;
              }).length
            }
          </div>
        </div>
        <div className="bg-card/40 border border-border/60 rounded-xl p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
            <Mail className="w-4 h-4" />
            Auto-delete after
          </div>
          <div className="mt-2 font-display text-3xl">{inactiveDays}d</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Inactive users get a Resend email and are removed.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => load()}
          disabled={refreshing}
        >
          <RefreshCcw
            className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={running}>
              {running ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Mail className="w-4 h-4 mr-2" />
              )}
              Run cleanup now
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Run inactive-user cleanup?</AlertDialogTitle>
              <AlertDialogDescription>
                This deletes any user whose last sign-in is older than{" "}
                {inactiveDays} days and emails them via Resend (if{" "}
                <code>RESEND_API_KEY</code> is set). Normally runs daily on a
                schedule.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep users</AlertDialogCancel>
              <AlertDialogAction variant="warning" onClick={handleRunCleanup}>
                <Mail className="w-4 h-4 mr-2" />
                Run inactive-user cleanup
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {users.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-10 text-center text-muted-foreground">
          No registered users yet.
        </div>
      ) : (
        <ScrollableTable>
          <table className="w-full text-sm">
            <thead className="bg-card/40 text-muted-foreground text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">
                  Name
                </th>
                <th className="text-left px-4 py-3 hidden md:table-cell">
                  Joined
                </th>
                <th className="text-left px-4 py-3">Last seen</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const d = daysAgo(user.lastSeenAt);
                const danger = d !== null && d >= inactiveDays - 5;
                return (
                  <tr
                    key={user.id}
                    className="border-t border-border/40 hover:bg-card/30"
                  >
                    <td className="px-4 py-3 font-medium">{user.email}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">
                      {user.name || "—"}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">
                      {formatDate(user.createdAt)}
                    </td>
                    <td
                      className={`px-4 py-3 text-xs ${danger ? "text-amber-500" : "text-muted-foreground"}`}
                    >
                      {d === null
                        ? "—"
                        : d === 0
                          ? "Today"
                          : `${d} day${d === 1 ? "" : "s"} ago`}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={deletingId === user.id}
                            aria-label={`Delete ${user.email}`}
                          >
                            {deletingId === user.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4 text-destructive" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Delete {user.email}?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              The account will be removed immediately. This
                              cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep account</AlertDialogCancel>
                            <AlertDialogAction
                              variant="dangerSoft"
                              onClick={() => handleDelete(user)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollableTable>
      )}
    </div>
  );
}
