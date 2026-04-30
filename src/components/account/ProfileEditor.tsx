import { ChangeEvent, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Camera,
  KeyRound,
  Loader2,
  LogOut,
  Save,
  ShieldOff,
  UserCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUserAuth } from "@/contexts/UserAuthContext";

const MAX_PICTURE_BYTES = 180_000; // ~180 KB once base64 encoded

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(file);
  });

const downscaleImage = async (file: File): Promise<string> => {
  const dataUrl = await readFileAsDataUrl(file);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("invalid image"));
    img.src = dataUrl;
  });
  const max = 256;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unsupported");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.82);
};

export default function ProfileEditor() {
  const { user, updateProfile, changePassword, logout, disconnectGoogle } =
    useUserAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name || "");
  const [savingName, setSavingName] = useState(false);
  const [savingPic, setSavingPic] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [disconnecting, setDisconnecting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!user) return null;
  const isSocial = user.provider === "google";

  const onPickFile = () => fileRef.current?.click();

  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    setSavingPic(true);
    try {
      const dataUrl = await downscaleImage(file);
      if (dataUrl.length > MAX_PICTURE_BYTES) {
        toast.error("Image is still too large after compression");
        return;
      }
      await updateProfile({ picture: dataUrl });
      toast.success("Photo updated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update photo",
      );
    } finally {
      setSavingPic(false);
    }
  };

  const onRemovePhoto = async () => {
    setSavingPic(true);
    try {
      await updateProfile({ picture: "" });
      toast.success("Photo removed");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not remove photo",
      );
    } finally {
      setSavingPic(false);
    }
  };

  const onSaveName = async () => {
    const trimmed = name.trim();
    if (trimmed === (user.name || "")) return;
    setSavingName(true);
    try {
      await updateProfile({ name: trimmed });
      toast.success("Name updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save name");
    } finally {
      setSavingName(false);
    }
  };

  const onSignOut = () => {
    logout();
    toast.success("Signed out");
    void navigate({ to: "/" });
  };

  const onDisconnect = async () => {
    if (confirmText !== "CONFIRM") return;
    setDisconnecting(true);
    try {
      await disconnectGoogle(confirmText);
      toast.success("Google disconnected — your account has been removed");
      void navigate({ to: "/" });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not disconnect Google",
      );
    } finally {
      setDisconnecting(false);
      setShowDisconnect(false);
      setConfirmText("");
    }
  };

  const onChangePassword = async () => {
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword(oldPassword, newPassword);
      toast.success("Password changed");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not change password",
      );
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <section className="bg-card/40 border border-border/60 rounded-xl p-5 space-y-5">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
        <UserCircle className="w-4 h-4" /> Profile
      </div>

      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          {user.picture ? (
            <img
              src={user.picture}
              alt=""
              referrerPolicy="no-referrer"
              loading="lazy"
              decoding="async"
              className="w-20 h-20 rounded-full object-cover border border-border/60"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <UserCircle className="w-10 h-10" />
            </div>
          )}
          {savingPic && (
            <div className="absolute inset-0 rounded-full bg-background/60 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{user.email}</p>
          <p className="text-xs text-muted-foreground">
            {isSocial ? "Signed in with Google" : "Email + password"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onPickFile}
              disabled={savingPic}
            >
              <Camera className="w-3.5 h-3.5 mr-1" />
              {user.picture ? "Change photo" : "Upload photo"}
            </Button>
            {user.picture && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void onRemovePhoto()}
                disabled={savingPic}
              >
                Remove
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => void onFileChange(e)}
              className="hidden"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs uppercase tracking-wider text-muted-foreground">
          Display name
        </label>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={80}
            className="text-sm"
          />
          <Button
            size="sm"
            onClick={() => void onSaveName()}
            disabled={savingName || name.trim() === (user.name || "")}
          >
            {savingName ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Save className="w-4 h-4 mr-1" /> Save
              </>
            )}
          </Button>
        </div>
      </div>

      {!isSocial && (
        <div className="space-y-2 pt-2 border-t border-border/30">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <KeyRound className="w-3.5 h-3.5" /> Change password
          </div>
          <Input
            type="password"
            placeholder="Current password"
            autoComplete="current-password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            className="text-sm"
          />
          <Input
            type="password"
            placeholder="New password (min 8 chars)"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="text-sm"
          />
          <Input
            type="password"
            placeholder="Confirm new password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="text-sm"
          />
          <Button
            size="sm"
            onClick={() => void onChangePassword()}
            disabled={
              savingPassword || !oldPassword || !newPassword || !confirmPassword
            }
          >
            {savingPassword ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1" />
            ) : (
              <KeyRound className="w-4 h-4 mr-1" />
            )}
            Update password
          </Button>
        </div>
      )}

      <div className="space-y-3 pt-4 border-t border-border/30">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <AlertTriangle className="w-3.5 h-3.5" /> Account
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onSignOut}
          className="w-full sm:w-auto"
        >
          <LogOut className="w-4 h-4 mr-1.5" />
          Sign out
        </Button>

        {isSocial &&
          (showDisconnect ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-3">
              <p className="text-xs text-foreground/85 leading-relaxed">
                Disconnecting Google removes your account. Your saved
                addresses, wishlist, and order history attached to this
                profile will be deleted. To continue, type{" "}
                <span className="font-mono font-semibold">CONFIRM</span> below.
              </p>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type CONFIRM"
                autoComplete="off"
                spellCheck={false}
                className="text-sm font-mono"
                aria-label="Type CONFIRM to disconnect Google"
                autoFocus
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => void onDisconnect()}
                  disabled={confirmText !== "CONFIRM" || disconnecting}
                >
                  {disconnecting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                  ) : (
                    <ShieldOff className="w-4 h-4 mr-1.5" />
                  )}
                  Disconnect Google
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowDisconnect(false);
                    setConfirmText("");
                  }}
                  disabled={disconnecting}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowDisconnect(true)}
              className="w-full sm:w-auto text-destructive hover:text-destructive"
            >
              <ShieldOff className="w-4 h-4 mr-1.5" />
              Disconnect Google
            </Button>
          ))}
      </div>
    </section>
  );
}
