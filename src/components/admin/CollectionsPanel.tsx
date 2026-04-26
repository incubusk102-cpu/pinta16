import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
  useStorefrontConfig,
  type CollectionConfig,
} from "@/contexts/StorefrontConfigContext";
import { useProducts } from "@/contexts/ProductContext";
import { toast } from "sonner";

const COLLECTION_LIMIT = 8;

const newId = () =>
  `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function CollectionsPanel() {
  const { token } = useAdminAuth();
  const { config, refresh } = useStorefrontConfig();
  const { products } = useProducts();
  const [collections, setCollections] = useState<CollectionConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [pendingProductId, setPendingProductId] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    setCollections(config.collections);
  }, [config.collections]);

  const productById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products) map.set(p.id, p.title);
    return map;
  }, [products]);

  const addCollection = () => {
    if (collections.length >= COLLECTION_LIMIT) {
      return toast.error(`At most ${COLLECTION_LIMIT} collections.`);
    }
    setCollections([
      ...collections,
      {
        id: newId(),
        title: "New collection",
        description: "",
        productIds: [],
        enabled: true,
      },
    ]);
  };

  const updateCollection = (id: string, patch: Partial<CollectionConfig>) =>
    setCollections((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );

  const removeCollection = (id: string) =>
    setCollections((prev) => prev.filter((c) => c.id !== id));

  const addProduct = (collectionId: string) => {
    const productId = (pendingProductId[collectionId] || "").trim();
    if (!productId) return;
    const collection = collections.find((c) => c.id === collectionId);
    if (!collection) return;
    if (collection.productIds.includes(productId)) {
      return toast.error("Already in this collection.");
    }
    if (!productById.has(productId)) {
      return toast.error("That product id doesn't exist.");
    }
    updateCollection(collectionId, {
      productIds: [...collection.productIds, productId],
    });
    setPendingProductId((prev) => ({ ...prev, [collectionId]: "" }));
  };

  const removeProduct = (collectionId: string, productId: string) => {
    const collection = collections.find((c) => c.id === collectionId);
    if (!collection) return;
    updateCollection(collectionId, {
      productIds: collection.productIds.filter((pid) => pid !== productId),
    });
  };

  const moveProduct = (
    collectionId: string,
    productId: string,
    direction: -1 | 1,
  ) => {
    const collection = collections.find((c) => c.id === collectionId);
    if (!collection) return;
    const idx = collection.productIds.indexOf(productId);
    const next = idx + direction;
    if (idx === -1 || next < 0 || next >= collection.productIds.length) return;
    const updated = [...collection.productIds];
    [updated[idx], updated[next]] = [updated[next], updated[idx]];
    updateCollection(collectionId, { productIds: updated });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/storefront-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: "set-collections", collections }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      await refresh();
      toast.success("Collections saved");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not save collections",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4 border border-border/50 rounded-lg p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display text-base">Curated collections</h3>
          <p className="text-xs text-muted-foreground">
            Group paintings into spotlight rows on the homepage. Drag-free
            reorder via the up/down buttons; disabled collections stay hidden
            from the storefront.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={addCollection}
          disabled={collections.length >= COLLECTION_LIMIT}
        >
          <Plus className="w-4 h-4 mr-1" /> Add collection
        </Button>
      </div>

      {collections.length === 0 ? (
        <div className="border border-dashed rounded-md p-6 text-center text-xs text-muted-foreground">
          No collections yet. Add one to spotlight a curated selection on the
          home page.
        </div>
      ) : (
        <ul className="space-y-3">
          {collections.map((c) => (
            <li
              key={c.id}
              className="bg-card/40 border border-border/40 rounded-md p-3 space-y-3"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Switch
                    id={`coll-${c.id}-enabled`}
                    checked={c.enabled}
                    onCheckedChange={(v) =>
                      updateCollection(c.id, { enabled: Boolean(v) })
                    }
                  />
                  <Label htmlFor={`coll-${c.id}-enabled`} className="text-xs">
                    Visible
                  </Label>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeCollection(c.id)}
                  aria-label={`Delete ${c.title || "collection"}`}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor={`coll-${c.id}-title`}>Title</Label>
                  <Input
                    id={`coll-${c.id}-title`}
                    value={c.title}
                    onChange={(e) =>
                      updateCollection(c.id, { title: e.target.value })
                    }
                    maxLength={80}
                    placeholder="Featured paintings"
                  />
                </div>
                <div>
                  <Label htmlFor={`coll-${c.id}-desc`}>Description</Label>
                  <Textarea
                    id={`coll-${c.id}-desc`}
                    value={c.description}
                    onChange={(e) =>
                      updateCollection(c.id, { description: e.target.value })
                    }
                    maxLength={240}
                    rows={2}
                    placeholder="Optional one-liner shown beneath the title."
                  />
                </div>
              </div>

              <div>
                <Label>Paintings ({c.productIds.length}/24)</Label>
                <div className="flex gap-2 mt-1">
                  <select
                    className="h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm"
                    value={pendingProductId[c.id] || ""}
                    onChange={(e) =>
                      setPendingProductId((prev) => ({
                        ...prev,
                        [c.id]: e.target.value,
                      }))
                    }
                  >
                    <option value="">Add a painting…</option>
                    {products
                      .filter((p) => !c.productIds.includes(p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => addProduct(c.id)}
                    disabled={!pendingProductId[c.id]}
                  >
                    <Plus className="w-4 h-4 mr-1" /> Add
                  </Button>
                </div>
                {c.productIds.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {c.productIds.map((pid, idx) => (
                      <li
                        key={pid}
                        className="flex items-center gap-2 bg-muted/40 rounded px-2 py-1.5 text-xs"
                      >
                        <span className="flex-1 truncate">
                          {idx + 1}.{" "}
                          {productById.get(pid) || `Unknown (${pid})`}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => moveProduct(c.id, pid, -1)}
                          disabled={idx === 0}
                          aria-label="Move up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => moveProduct(c.id, pid, 1)}
                          disabled={idx === c.productIds.length - 1}
                          aria-label="Move down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeProduct(c.id, pid)}
                          aria-label={`Remove ${productById.get(pid) || pid}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Save collections
        </Button>
      </div>
    </section>
  );
}
