// AddressCombobox — Popover + cmdk-based searchable dropdown used by
// the cascading PH address picker for City/Municipality and Barangay
// fields. Both fields can have hundreds of entries (Manila has 897
// barangays), so we need type-ahead instead of a plain Select.
//
// Behaviour:
//   - Closed state: looks like a Select trigger (button with current
//     value or placeholder + chevron).
//   - Open state: popover with a search input + scrollable list.
//   - If `value` doesn't match any option (e.g. legacy free-text
//     address), it's still rendered in the trigger and a "keep as-is"
//     row appears at the top of the list.
//   - Empty `options` (e.g. parent not picked yet) shows a hint and
//     disables the trigger.

import * as React from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface AddressComboboxProps {
  value: string;
  onChange: (next: string) => void;
  options: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyHint?: string;
  loading?: boolean;
  disabled?: boolean;
  // When true the trigger gets a subtle red border for invalid state.
  invalid?: boolean;
  className?: string;
}

export function AddressCombobox({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyHint,
  loading = false,
  disabled = false,
  invalid = false,
  className,
}: AddressComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const triggerDisabled = disabled || (options.length === 0 && !loading);
  const valueInOptions = value && options.includes(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={triggerDisabled}
          className={cn(
            "h-10 w-full justify-between text-sm font-normal",
            !value && "text-muted-foreground",
            invalid && "border-destructive/60",
            className,
          )}
        >
          <span className="truncate">
            {value || (loading ? "Loading…" : placeholder)}
          </span>
          {loading ? (
            <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" />
          ) : (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[--radix-popover-trigger-width] min-w-[14rem]"
        align="start"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyHint ?? "No results."}</CommandEmpty>
            {value && !valueInOptions && (
              <CommandGroup heading="Your saved entry">
                <CommandItem
                  value={value}
                  onSelect={() => setOpen(false)}
                  className="opacity-90"
                >
                  <Check className="mr-2 h-4 w-4 opacity-100" />
                  {value}
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={(picked) => {
                    onChange(picked);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === opt ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {opt}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
