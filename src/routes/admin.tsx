import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { useSEO } from "@/hooks/useSEO";

const AdminPage = lazy(() => import("@/admin/AdminPage"));

function AdminPageWithSuspense() {
  useSEO({
    title: "Admin — Canvas Hub",
    description: "Upload and manage products in your gallery.",
    canonicalPath: "/admin",
    noindex: true,
  });
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
      { title: "Admin — Canvas Hub" },
      {
        name: "description",
        content: "Upload and manage products in your gallery.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});
