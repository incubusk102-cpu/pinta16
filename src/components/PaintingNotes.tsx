import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronDown, NotebookPen } from "lucide-react";

interface PaintingNotesProps {
  productId: string;
  title: string;
}

const STORAGE_KEY = "canvhub_painting_notes_v1";
const MAX_LENGTH = 500;
// localStorage budget: ~5MB. 500 chars × 200 notes ≈ 100 KB, but we
// also cap the number of saved notes to keep the JSON blob small.
const MAX_NOTES = 200;
const SAVE_DEBOUNCE_MS = 400;

type NotesMap = Record<string, string>;

function readNotes(): NotesMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as NotesMap;
    if (parsed && typeof parsed === "object") return parsed;
    return {};
  } catch {
    return {};
  }
}

function writeNotes(map: NotesMap) {
  if (typeof window === "undefined") return;
  try {
    // Trim down to MAX_NOTES entries if the visitor has been
    // collecting for a while — keep the most recently written
    // entries (we re-set every key on save).
    const entries = Object.entries(map).filter(([, v]) => v.trim().length > 0);
    const limited = entries.slice(-MAX_NOTES);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.fromEntries(limited)),
    );
  } catch {
    // Quota exceeded — silently drop. Notes are nice-to-have, not
    // a transactional system.
  }
}

/**
 * Private "My notes" panel beneath the buy column. The visitor can
 * jot up to ~500 characters per painting — palette ideas, where they
 * want to hang it, budget plans. The note auto-saves to
 * `localStorage` keyed by product id, debounced 400ms.
 *
 * The panel is collapsed by default and shows a chip with "(saved)"
 * when there is already content for the current product, so visitors
 * remember they left themselves a note last visit. Empty notes get
 * pruned on save.
 *
 * Pure client-side; no server round-trip, no analytics ping. We
 * deliberately keep this off the network — these are private notes.
 */
export default function PaintingNotes({
  productId,
  title,
}: PaintingNotesProps) {
  const reduceMotion = useReducedMotion();
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const saveTimer = useRef<number | null>(null);

  // Hydrate on mount / when the product changes.
  useEffect(() => {
    const map = readNotes();
    setValue(map[productId] ?? "");
    setSavedAt(null);
  }, [productId]);

  // Debounced save.
  useEffect(() => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const map = readNotes();
      if (value.trim().length === 0) {
        delete map[productId];
      } else {
        map[productId] = value.slice(0, MAX_LENGTH);
      }
      writeNotes(map);
      setSavedAt(Date.now());
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
  }, [value, productId]);

  const hasNote = value.trim().length > 0;
  const charsLeft = MAX_LENGTH - value.length;

  const motionProps = reduceMotion
    ? { initial: false, animate: { height: "auto", opacity: 1 } }
    : {
        initial: { height: 0, opacity: 0 },
        animate: { height: "auto", opacity: 1 },
        exit: { height: 0, opacity: 0 },
      };

  return (
    <div className="border border-border/50 rounded-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`painting-notes-${productId}`}
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-foreground/[0.03] transition-colors duration-200"
      >
        <span className="flex items-center gap-2 min-w-0">
          <NotebookPen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="font-body text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
            My notes
          </span>
          {hasNote && (
            <span className="font-body text-[10px] tracking-[0.2em] uppercase text-emerald-700 dark:text-emerald-400">
              · saved
            </span>
          )}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            {...motionProps}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            id={`painting-notes-${productId}`}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 space-y-2">
              <textarea
                value={value}
                onChange={(e) => setValue(e.target.value.slice(0, MAX_LENGTH))}
                placeholder={`Jot a private note about "${title}" — palette, room, budget…`}
                rows={4}
                className="w-full bg-transparent border border-border/50 rounded-sm px-2.5 py-2 font-body text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/30 resize-none"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="font-body text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
                  Stored locally · {charsLeft} left
                </span>
                {savedAt && hasNote && (
                  <span className="font-body text-[10px] tracking-[0.2em] uppercase text-emerald-700 dark:text-emerald-400">
                    Saved
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
