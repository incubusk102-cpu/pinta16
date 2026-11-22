import { Plus } from "lucide-react";

// Floating "Upload" pill shown on mobile (≤ md) on the Products section so
// operators don't have to scroll to the form to start a new upload. On
// desktop the upload form is already sticky in the left column, so the FAB
// stays hidden. Tapping snaps to the form and focuses the title field.
const AdminMobileUploadFAB = () => {
  const handleClick = () => {
    const target = document.getElementById("upload-product-form");
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    // Wait for scroll to settle before focusing so the keyboard doesn't
    // pop up while we're still scrolling on iOS Safari.
    window.setTimeout(() => {
      const titleInput = document.getElementById(
        "title",
      ) as HTMLInputElement | null;
      titleInput?.focus({ preventScroll: true });
    }, 350);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Upload new product"
      className="md:hidden fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2.5 font-body text-[11px] tracking-[0.25em] uppercase shadow-[0_6px_20px_-4px_rgba(0,0,0,0.35)] hover:bg-primary/90 active:scale-[0.98] transition-all"
    >
      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
      Upload
    </button>
  );
};

export default AdminMobileUploadFAB;
