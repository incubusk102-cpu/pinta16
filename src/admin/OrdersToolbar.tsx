/* Toolbar for the admin Orders screen — search input, status chips, refund /
 * shipment / date filters, and a saved-views dropdown. Pure UI: takes the
 * current filter and a setter, plus the list of saved views and three
 * mutation callbacks. The OrdersSection owns the actual filter / saved-view
 * state so the rest of the section can react to it without prop drilling
 * back through this component.
 */

import { useState } from "react";
import {
  Bookmark,
  BookmarkPlus,
  ChevronDown,
  Filter,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EMPTY_FILTER,
  ORDER_STATUSES,
  ORDER_STATUS_LABEL,
  type OrderFilter,
  type OrderStatus,
  type RefundFilter,
  type SavedView,
  type ShipmentFilter,
  describeFilter,
  isFilterEmpty,
} from "@/admin/orderFilters";

interface Props {
  filter: OrderFilter;
  onChange: (next: OrderFilter) => void;
  savedViews: SavedView[];
  onSaveView: (name: string) => void;
  onDeleteView: (id: string) => void;
  onApplyView: (view: SavedView) => void;
  matchedCount: number;
  totalCount: number;
}

export function OrdersToolbar({
  filter,
  onChange,
  savedViews,
  onSaveView,
  onDeleteView,
  onApplyView,
  matchedCount,
  totalCount,
}: Props) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  const toggleStatus = (s: OrderStatus) => {
    const has = filter.statuses.includes(s);
    onChange({
      ...filter,
      statuses: has
        ? filter.statuses.filter((x) => x !== s)
        : [...filter.statuses, s],
    });
  };

  const handleSave = () => {
    const name = saveName.trim();
    if (!name) return;
    onSaveView(name);
    setSaveName("");
    setSaveOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={filter.search}
            onChange={(e) => onChange({ ...filter, search: e.target.value })}
            placeholder="Search id / name / email / tracking…"
            className="pl-8 h-9"
          />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Filter className="w-3.5 h-3.5" />
              More filters
              <ChevronDown className="w-3 h-3 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 space-y-3" align="end">
            <div className="space-y-1.5">
              <Label className="text-xs">Refund</Label>
              <Select
                value={filter.refund}
                onValueChange={(v) =>
                  onChange({ ...filter, refund: v as RefundFilter })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="none">No refund</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="succeeded">Succeeded</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tracking</Label>
              <Select
                value={filter.shipment}
                onValueChange={(v) =>
                  onChange({ ...filter, shipment: v as ShipmentFilter })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="with">With tracking</SelectItem>
                  <SelectItem value="without">No tracking</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">From</Label>
                <Input
                  type="date"
                  value={filter.from}
                  onChange={(e) =>
                    onChange({ ...filter, from: e.target.value })
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">To</Label>
                <Input
                  type="date"
                  value={filter.to}
                  onChange={(e) => onChange({ ...filter, to: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Bookmark className="w-3.5 h-3.5" />
              Saved views
              <ChevronDown className="w-3 h-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Apply a saved view</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {savedViews.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                No saved views yet. Set up filters and click "Save view".
              </div>
            ) : (
              savedViews.map((v) => (
                <DropdownMenuItem
                  key={v.id}
                  onSelect={(e) => {
                    e.preventDefault();
                    onApplyView(v);
                  }}
                  className="flex items-start gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">{v.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {describeFilter(v.filter)}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Delete ${v.name}`}
                    className="text-muted-foreground hover:text-destructive shrink-0 mt-0.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteView(v.id);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Popover open={saveOpen} onOpenChange={setSaveOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={isFilterEmpty(filter)}
              title={
                isFilterEmpty(filter)
                  ? "Set up at least one filter first"
                  : "Save current filter combination"
              }
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
              Save view
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 space-y-2" align="end">
            <Label htmlFor="save-view-name" className="text-xs">
              View name
            </Label>
            <Input
              id="save-view-name"
              autoFocus
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="e.g. Pending refunds"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
              className="h-8 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSaveName("");
                  setSaveOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!saveName.trim()}
              >
                Save
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {ORDER_STATUSES.map((s) => {
          const active = filter.statuses.includes(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              className={`text-xs rounded-full border px-2.5 py-1 transition-colors ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {ORDER_STATUS_LABEL[s]}
            </button>
          );
        })}
        {!isFilterEmpty(filter) && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTER)}
            className="text-xs rounded-full border border-border/60 px-2.5 py-1 text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Reset
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {matchedCount} / {totalCount} orders
        </span>
      </div>
    </div>
  );
}
