import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const AdminPage = lazy(() => import("@/admin/AdminPage"));

function AdminPageWithSuspense() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <AdminPage />
    </Suspense>
  );
}

export const Route = createFileRoute("/admin")({
  component: AdminPageWithSuspense,
  head: () => ({
    meta: [
      { title: "Admin — Pintaterra" },
      {
        name: "description",
        content: "Upload and manage paintings in your gallery.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});
