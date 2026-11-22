// AddressTypeahead — inline text input + dropdown of suggestions for
// PH address fields (province / city / barangay).
//
// Why we need this on top of `AddressCombobox`:
//   - AddressCombobox is a Popover-style trigger button; the user has
//     to click to open before they can type to search. That gates buyers
//     whose location isn't in the PSGC dataset (or is misspelled in it)
//     into a "search this list, find nothing, give up" trap.
//   - AddressTypeahead is a real `<Input>`. The buyer types their place
//     name freely; matching suggestions appear underneath; clicking one
//     replaces the text. If no suggestion fits they just keep typing
//     and submit — the field accepts arbitrary strings.
//
// In other words: suggestions help, they don't gate.
//
// onChange's second arg distinguishes free-typed updates (`picked=false`)
// from suggestion clicks (`picked=true`) so the parent can cascade-reset
// dependent fields only on explicit picks (typing "Cebu" while editing
// shouldn't wipe the user's already-typed city/barangay).

import * as React from "react";
import { ChevronDown, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export interface AddressTypeaheadProps {
  value: string;
  onChange: (next: string, picked?: boolean) => void;
  options: string[];
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  // Cap how many suggestions render. Manila has ~900 barangays so we
  // truncate aggressively when the query is empty.
  maxSuggestions?: number;
}

export function AddressTypeahead({
  value,
  onChange,
  options,
  placeholder = "Type or pick…",
  loading = false,
  disabled = false,
  invalid = false,
  className,
  maxSuggestions = 12,
}: AddressTypeaheadProps) {
  const [open, setOpen] = React.useState(false);
  const [activeIdx, setActiveIdx] = React.useState(-1);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Filter & sort: case-insensitive substring match. Options that
  // start with the query rank above options that just contain it.
  // Exact matches are excluded so we don't suggest the same value the
  // user already typed.
  const filtered = React.useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return options.slice(0, maxSuggestions);
    const startsWith: string[] = [];
    const contains: string[] = [];
    for (const opt of options) {
      const l = opt.toLowerCase();
      if (l === q) continue;
      if (l.startsWith(q)) startsWith.push(opt);
      else if (l.includes(q)) contains.push(opt);
    }
    return [...startsWith, ...contains].slice(0, maxSuggestions);
  }, [value, options, maxSuggestions]);

  // Close when the user clicks outside the component.
  React.useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Reset the keyboard-active row whenever the visible list changes,
  // so ArrowDown always starts at the top of the new list.
  React.useEffect(() => {
    setActiveIdx(-1);
  }, [filtered.length, open]);

  const pick = (suggestion: string) => {
    onChange(suggestion, true);
    setOpen(false);
    setActiveIdx(-1);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      if (!open) setOpen(true);
      setActiveIdx((i) => (i + 1) % filtered.length);
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      if (!open) setOpen(true);
      setActiveIdx((i) => (i <= 0 ? filtered.length - 1 : i - 1));
      e.preventDefault();
    } else if (e.key === "Enter" && open && activeIdx >= 0) {
      pick(filtered[activeIdx]);
      e.preventDefault();
    } else if (e.key === "Escape" && open) {
      setOpen(false);
      e.preventDefault();
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value, false);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={loading ? "Loading…" : placeholder}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          autoComplete="off"
          className={cn(
            "h-10 text-sm pr-9",
            invalid && "border-destructive/60",
          )}
        />
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-muted-foreground">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin opacity-50" />
          ) : (
            <ChevronDown className="h-4 w-4 opacity-40" />
          )}
        </span>
      </div>

      {open && filtered.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-md border border-border/60 bg-popover shadow-lg"
        >
          {filtered.map((opt, i) => {
            const active = i === activeIdx;
            return (
              <li
                key={opt}
                role="option"
                aria-selected={active}
                onMouseDown={(e) => {
                  // mousedown so the click registers before the input
                  // blurs and tears the dropdown down.
                  e.preventDefault();
                  pick(opt);
                }}
                onMouseEnter={() => setActiveIdx(i)}
                className={cn(
                  "px-3 py-2 text-sm cursor-pointer",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50",
                )}
              >
                {opt}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
