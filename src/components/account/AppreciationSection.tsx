import { useState } from "react";
import { useUserAuth, type UserReward } from "@/contexts/UserAuthContext";
import { buildReferralLink } from "@/lib/referral";
import { Cake, Copy, Crown, Gift, Share2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const rewardLabel = (kind: UserReward["kind"]) => {
  if (kind === "birthday") return "Birthday gift";
  if (kind === "anniversary") return "Anniversary thank-you";
  if (kind === "referral-give") return "Friend referral reward";
  return "Welcome from a friend";
};

const rewardIcon = (kind: UserReward["kind"]) => {
  if (kind === "birthday") return <Cake className="w-4 h-4" />;
  if (kind === "anniversary") return <Sparkles className="w-4 h-4" />;
  return <Gift className="w-4 h-4" />;
};

const formatExpiry = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
};

const formatValue = (reward: UserReward) => {
  if (reward.type === "percent") return `${reward.value}% off`;
  if (reward.type === "free_shipping") return "Free shipping";
  return `₱${reward.value.toLocaleString()} off`;
};

const copy = async (text: string, msg: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(msg);
  } catch {
    toast.error("Could not copy — please copy manually");
  }
};

export default function AppreciationSection() {
  const { user, rewards, updatePrefs } = useUserAuth();
  const [birthday, setBirthday] = useState(user?.birthday || "");
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const referralLink = user.referralCode
    ? buildReferralLink(user.referralCode)
    : "";

  const saveBirthday = async () => {
    setSaving(true);
    try {
      await updatePrefs({ birthday });
      toast.success("Birthday saved");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not save";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const toggleVip = async (next: boolean) => {
    try {
      await updatePrefs({ vipEarlyAccess: next });
      toast.success(
        next ? "Joined VIP early-access" : "Left VIP early-access list",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not update";
      toast.error(msg);
    }
  };

  return (
    <div
      id="account-appreciation"
      className="bg-card/40 border border-border/60 rounded-xl p-5 space-y-6 scroll-mt-28"
    >
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
        <Sparkles className="w-4 h-4" /> Rewards & perks
      </div>

      {rewards.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">
            Active gifts for you
          </p>
          <ul className="space-y-2">
            {rewards.map((r) => (
              <li
                key={r.code}
                className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 border border-amber-400/40 bg-amber-500/5 rounded-md"
              >
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-semibold uppercase tracking-wide">
                  {rewardIcon(r.kind)}
                  {rewardLabel(r.kind)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">
                    {r.description}{" "}
                    <span className="font-semibold">— {formatValue(r)}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Code <code className="font-mono">{r.code}</code> · expires{" "}
                    {formatExpiry(r.expiresAt)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    copy(r.code, "Code copied — paste at checkout")
                  }
                >
                  <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-foreground text-sm font-medium">
          <Cake className="w-4 h-4" /> Birthday
        </div>
        <p className="text-xs text-muted-foreground">
          Every year on your birthday we'll send a ₱500 gift code straight to
          your account. Format: <code className="font-mono">MM-DD</code> — we
          don't store the year.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="08-12"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            maxLength={10}
            className="text-sm sm:max-w-[180px]"
          />
          <Button
            size="sm"
            onClick={() => void saveBirthday()}
            disabled={saving || birthday === (user.birthday || "")}
          >
            {saving ? "Saving…" : "Save birthday"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-foreground text-sm font-medium">
          <Share2 className="w-4 h-4" /> Refer a friend — give ₱200, get ₱200
        </div>
        <p className="text-xs text-muted-foreground">
          Share your personal link. When your friend places their first paid
          order, you both receive a ₱200 voucher.
        </p>
        {user.referralCode ? (
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            <Input
              readOnly
              value={referralLink}
              className="text-xs font-mono"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => copy(referralLink, "Referral link copied")}
            >
              <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy link
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copy(user.referralCode || "", "Code copied")}
            >
              Code: {user.referralCode}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Your code is being generated — refresh in a moment.
          </p>
        )}
        {user.referredBy && (
          <p className="text-[11px] text-muted-foreground">
            Welcome — you joined via{" "}
            <code className="font-mono">{user.referredBy}</code>. Your friend's
            ₱200 reward unlocks once you place your first paid order.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-foreground text-sm font-medium">
          <Crown className="w-4 h-4" /> VIP early-access
        </div>
        <p className="text-xs text-muted-foreground">
          Be first to see new pieces. VIP members can browse embargoed artworks
          up to 24 hours before the public reveal.
        </p>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={user.vipEarlyAccess === true}
            onChange={(e) => void toggleVip(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-amber-500"
          />
          <span className="text-sm text-foreground">
            {user.vipEarlyAccess
              ? "You're on the VIP list"
              : "Join the VIP early-access list"}
          </span>
        </label>
      </div>
    </div>
  );
}
