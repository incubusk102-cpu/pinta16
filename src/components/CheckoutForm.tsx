import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useId,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import {
  X,
  ArrowLeft,
  User,
  Mail,
  Phone,
  MapPin,
  FileText,
  Loader2,
  UserPlus,
  ChevronDown,
  Truck,
} from "lucide-react";
import { useCart, type OrderInfo } from "@/contexts/CartContext";
import {
  useUserAuth,
  type PublicUser,
  type SavedAddress,
} from "@/contexts/UserAuthContext";
import { useStorefrontConfig } from "@/contexts/StorefrontConfigContext";
import {
  sanitizeText,
  isValidEmail,
  isValidPhone,
  enforceMaxLength,
  formatPhPhone,
} from "@/lib/sanitize";
import {
  COURIERS,
  SHIPPABLE_COURIER_IDS,
  hasShippingRates,
  getShippingFee,
} from "@/lib/shipment";
import { zoneForRegion, zoneLabel, isValidPhMobile } from "@/lib/ph-regions";
import {
  PhAddressFields,
  composePhAddressLine,
  isValidPhPostal,
  type PhAddressValue,
} from "@/components/PhAddressFields";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GOOGLE_CALLBACK_PATH,
  cancelGoogleOneTap,
  renderGoogleButton,
} from "@/lib/google-signin";
import PaymentModal from "./PaymentModal";
import { createPayment } from "@/utils/payment.functions";

const RESUME_CHECKOUT_FLAG = "canvhub_resume_checkout";
// Per-tab draft of the guest checkout form. We persist on every change
// so that closing the drawer, navigating back to the cart, or even an
// accidental tab refresh doesn't wipe what the visitor already typed.
// sessionStorage scope (vs. localStorage) because the draft is
// disposable — it should not survive the browser tab. Stripped of
// lat/lng to keep it small.
const CHECKOUT_DRAFT_KEY = "canvhub_checkout_draft_v1";

const loadCheckoutDraft = (): Partial<OrderInfo> | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CHECKOUT_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Partial<OrderInfo>)
      : null;
  } catch {
    return null;
  }
};

const saveCheckoutDraft = (form: OrderInfo): void => {
  if (typeof window === "undefined") return;
  try {
    // Skip persistence when the form is fully empty so we don't leave
    // a stale-but-empty key around once the visitor places their order.
    const meaningful =
      form.fullName ||
      form.email ||
      form.phone ||
      form.address ||
      form.city ||
      form.notes;
    if (!meaningful) {
      sessionStorage.removeItem(CHECKOUT_DRAFT_KEY);
      return;
    }
    sessionStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(form));
  } catch {
    /* sessionStorage full / disabled — silently ignore */
  }
};

const clearCheckoutDraft = (): void => {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(CHECKOUT_DRAFT_KEY);
  } catch {
    /* ignore */
  }
};

const pickDefaultAddress = (
  user: PublicUser | null,
): SavedAddress | undefined => {
  if (!user?.addresses?.length) return undefined;
  if (user.defaultAddressId) {
    const found = user.addresses.find((a) => a.id === user.defaultAddressId);
    if (found) return found;
  }
  return user.addresses[0];
};

const buildSignedInForm = (
  user: PublicUser | null,
  prev: OrderInfo,
): OrderInfo => {
  const addr = pickDefaultAddress(user);
  const addressLine = addr
    ? [addr.line1, addr.line2].filter(Boolean).join(", ")
    : "";
  const cityLine = addr
    ? [addr.city, addr.province].filter(Boolean).join(", ")
    : "";
  return {
    fullName: prev.fullName || addr?.fullName || user?.name || "",
    email: prev.email || user?.email || "",
    phone: prev.phone || addr?.phone || "",
    address: prev.address || addressLine,
    city: prev.city || addr?.city || "",
    notes: prev.notes,
    addressLine1: prev.addressLine1 || addr?.line1 || "",
    addressLine2: prev.addressLine2 || addr?.line2 || "",
    province: prev.province || addr?.province || "",
    postalCode: prev.postalCode || addr?.postalCode || "",
    country: prev.country || addr?.country || "Philippines",
    latitude: prev.latitude ?? addr?.latitude ?? null,
    longitude: prev.longitude ?? addr?.longitude ?? null,
    formattedAddress: prev.formattedAddress || addr?.formatted || cityLine,
    placeId: prev.placeId || addr?.placeId,
    region: prev.region || addr?.region || "",
    barangay: prev.barangay || addr?.barangay || "",
    landmark: prev.landmark || addr?.landmark || "",
    courier: prev.courier || "",
    shippingZone: prev.shippingZone || "",
  };
};

const CheckoutForm = () => {
  const {
    showCheckout,
    setShowCheckout,
    items,
    subtotal,
    shippingFee,
    discount,
    total,
    estimatedCreationDays,
    placeOrder,
    isFreeShipping,
    shippingFeeOriginal,
    shippingFeePending,
    voucher,
    setCheckoutShipping,
  } = useCart();
  // Mirrors the same state machine the cart drawer uses so the order
  // summary in checkout doesn't accidentally render "₱0 FREE" before
  // the customer has picked a courier.
  const voucherFreeShipping = voucher.applied && voucher.freeShipping;
  const shippingIsWaived =
    !shippingFeePending && (isFreeShipping || voucherFreeShipping);
  const checkoutTitleId = useId();
  // Body scroll lock + ESC-to-close so the page underneath doesn't
  // drift on mobile and keyboard users can dismiss the drawer.
  useBodyScrollLock(showCheckout);
  useEffect(() => {
    if (!showCheckout) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowCheckout(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showCheckout, setShowCheckout]);
  const { config: storefrontConfig } = useStorefrontConfig();
  const { user, token, addAddress, updateAddress } = useUserAuth();
  const isSignedIn = Boolean(token && user);
  // Initialize from auth state so signed-in users land on the form
  // immediately — no flash of the "Continue as Guest / Sign in" choice.
  const [checkoutMode, setCheckoutMode] = useState<
    "choose" | "guest" | "signed_in"
  >(() => (isSignedIn ? "signed_in" : "choose"));
  const [form, setForm] = useState<OrderInfo>(() => {
    const blankGuest: OrderInfo = {
      fullName: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      notes: "",
      country: "Philippines",
    };
    if (isSignedIn) {
      return buildSignedInForm(user, {
        fullName: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        notes: "",
      });
    }
    // Guest path: hydrate from any persisted draft so a refresh / tab
    // close / back-to-cart doesn't wipe the visitor's typing.
    const draft = loadCheckoutDraft();
    return draft ? { ...blankGuest, ...draft } : blankGuest;
  });
  const [errors, setErrors] = useState<
    Partial<Record<keyof OrderInfo, string>>
  >({});
  // Track which fields the visitor has actually interacted with so we
  // only surface validation errors after blur — not on initial focus,
  // and not for fields they haven't reached yet.
  const [touched, setTouched] = useState<
    Partial<Record<keyof OrderInfo, true>>
  >({});
  // Derived PH address picker value. The cascading picker writes back
  // through `onPhAddressChange` which fans the value out to the flat
  // OrderInfo fields the rest of the system expects.
  const phAddress: PhAddressValue = useMemo(
    () => ({
      region: form.region || "",
      province: form.province || "",
      city:
        form.city && form.city.includes(",")
          ? form.city.split(",")[0].trim()
          : form.city || "",
      barangay: form.barangay || "",
      line1: form.addressLine1 || form.address || "",
      landmark: form.landmark || "",
      postalCode: form.postalCode || "",
      country: form.country || "Philippines",
      zone: zoneForRegion(form.region || ""),
    }),
    [
      form.region,
      form.province,
      form.city,
      form.barangay,
      form.addressLine1,
      form.address,
      form.landmark,
      form.postalCode,
      form.country,
    ],
  );
  const ratesConfigured = hasShippingRates(storefrontConfig.shippingRates);
  // Storefront couriers eligible to ship at checkout. We narrow the
  // full COURIERS list to (a) those marked "shippable" by id and
  // (b) those that actually have at least one configured rate when the
  // admin has set up rates. If no rates are configured, we still expose
  // the shippable couriers but the cart falls back to the legacy fee.
  const courierOptions = useMemo(() => {
    const baseline = COURIERS.filter((c) =>
      SHIPPABLE_COURIER_IDS.includes(c.id),
    );
    if (!ratesConfigured) return baseline;
    return baseline.filter((c) =>
      storefrontConfig.shippingRates.some(
        (r) => r.courierId.toLowerCase() === c.id.toLowerCase(),
      ),
    );
  }, [storefrontConfig.shippingRates, ratesConfigured]);
  // Push the customer's courier+zone selection into CartContext so the
  // running total reflects the per-courier × per-zone fee.
  useEffect(() => {
    setCheckoutShipping({
      courier: form.courier || "",
      zone: zoneForRegion(form.region || ""),
    });
  }, [form.courier, form.region, setCheckoutShipping]);
  // Mobile-only collapse state for the order summary so the form fields
  // aren't pushed below the fold on small screens. Defaults to expanded
  // on first render; the visitor can collapse with a tap.
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  // Container for Google's official branded sign-in button. Rendered by
  // GSI directly into this div so a tap goes straight to Google's
  // account chooser — no intermediate /login page visit needed.
  const googleBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showCheckout) {
      if (isSignedIn) {
        setCheckoutMode("signed_in");
        setForm((prev) => buildSignedInForm(user, prev));
      } else {
        setCheckoutMode("choose");
      }
    }
  }, [showCheckout, isSignedIn, user]);

  // If the visitor tapped Google's sign-in button from the choose screen,
  // the browser left for Google → /api/google-callback → /login (to
  // finalize the session) → back to the homepage. After they return
  // signed-in we re-open the checkout panel automatically so they don't
  // have to click back through the cart again.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isSignedIn) return;
    let flagged = false;
    try {
      flagged = sessionStorage.getItem(RESUME_CHECKOUT_FLAG) === "1";
      if (flagged) sessionStorage.removeItem(RESUME_CHECKOUT_FLAG);
    } catch {
      /* ignore */
    }
    if (flagged && items.length > 0 && !showCheckout) {
      setShowCheckout(true);
    }
  }, [isSignedIn, items.length, showCheckout, setShowCheckout]);

  // Render Google's official branded button into the choose screen every
  // time the screen becomes visible, and arm the resume-checkout flag
  // eagerly so that if the visitor taps Google and comes back signed-in
  // the cart drawer re-opens.
  //
  // Eager-arm is necessary because GSI's button is rendered inside a
  // cross-origin iframe from accounts.google.com. Pointer / click events
  // that happen inside that iframe stay within the iframe's browsing
  // context and never bubble up to this component's DOM, so hanging the
  // flag off `onPointerDownCapture` on the wrapper never actually fired.
  // Arming the flag as soon as the button is visible is a safe proxy:
  // if the visitor closes the drawer without signing in we clear it in
  // the effect's cleanup, and if they sign in via a totally unrelated
  // path the normal resume-check requires `items.length > 0` and a
  // signed-in session, which is already the behaviour we want anyway.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isSignedIn) return;
    if (!showCheckout) return;
    if (checkoutMode !== "choose") return;
    const target = googleBtnRef.current;
    if (!target) return;
    target.innerHTML = "";
    try {
      sessionStorage.setItem(RESUME_CHECKOUT_FLAG, "1");
    } catch {
      /* ignore */
    }
    const width = Math.max(240, Math.min(400, target.clientWidth || 320));
    // Abort controller lets the cleanup stop renderGoogleButton if the
    // async GSI script is still loading when the visitor moves on (e.g.
    // they tap "Continue as Guest" or close the drawer). Without this,
    // the late promise could call `initialize({ auto_select: true })`
    // + `prompt()` seconds later and force-redirect the visitor to
    // Google in the middle of an unrelated screen.
    const abortController = new AbortController();
    renderGoogleButton({
      target,
      width,
      text: "continue_with",
      theme: "outline",
      shape: "rectangular",
      loginUri: `${window.location.origin}${GOOGLE_CALLBACK_PATH}`,
      // Near-zero-tap sign-in: if the visitor is already signed into
      // their Google account AND previously granted us consent, Google
      // silently auto-selects that account and form-POSTs the credential
      // to /api/google-callback — no buttons to tap, no extra page to
      // visit. If they've never signed in here before, Google instead
      // shows the One Tap card ("Continue as [Name]") so a single tap
      // signs them in without leaving the site for Google's full login
      // page. If they're not signed into Google at all, One Tap stays
      // hidden and they fall back to the manual "Continue with Google"
      // button above, which opens Google's real email/password page.
      autoSelect: true,
      showOneTap: true,
      signal: abortController.signal,
    }).catch(() => {
      /* GSI script failed to load — leave the empty slot; visitors can
         still use "Continue as Guest" above. */
    });
    return () => {
      // If the visitor closes the drawer or switches to the guest form
      // without completing Google sign-in, abort the pending GSI render
      // (so a late script load can't fire auto_select / One Tap after
      // they've moved on), don't leave the resume flag armed, and hide
      // any One Tap card that already materialized.
      abortController.abort();
      try {
        sessionStorage.removeItem(RESUME_CHECKOUT_FLAG);
      } catch {
        /* ignore */
      }
      cancelGoogleOneTap();
    };
  }, [isSignedIn, showCheckout, checkoutMode]);

  // Validate a single field. Returns the error message, or "" if valid.
  // Centralised so both onBlur and the final submit-time validate() can
  // share the same rules without drifting.
  const validateField = useCallback(
    (key: keyof OrderInfo, value: string): string => {
      switch (key) {
        case "fullName":
          return value.trim() ? "" : "Full name is required";
        case "email":
          if (!value.trim()) return "Email is required";
          if (!isValidEmail(value)) return "Invalid email address";
          return "";
        case "phone":
          if (!value.trim()) return "Phone number is required";
          // Two-tier check: bail out fast on garbage chars, then run the
          // PH-specific validator so couriers won't reject the order on
          // pickup. We accept a foreign +CC number too (couriers will
          // ring it through the carrier's gateway).
          if (!isValidPhone(value)) return "Invalid phone number";
          if (!isValidPhMobile(value) && !value.trim().startsWith("+")) {
            return "Use a PH mobile (09XX XXX XXXX) or +63 9XX XXX XXXX";
          }
          return "";
        case "region":
          return value.trim() ? "" : "Region is required";
        case "province":
          return value.trim() ? "" : "Province is required";
        case "city":
          return value.trim() ? "" : "City / municipality is required";
        case "barangay":
          return value.trim() ? "" : "Barangay is required";
        case "addressLine1":
          return value.trim() ? "" : "Street address is required";
        case "postalCode":
          return isValidPhPostal(value) ? "" : "PH postal code is 4 digits";
        case "address":
          return value.trim() ? "" : "Address is required";
        case "courier":
          // Only require a courier when the storefront has rates set up.
          // Otherwise the legacy flat fee applies and the field is
          // optional.
          return "";
        default:
          return "";
      }
    },
    [],
  );

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof OrderInfo, string>> = {};
    (
      [
        "fullName",
        "email",
        "phone",
        "region",
        "province",
        "city",
        "barangay",
        "addressLine1",
        "postalCode",
      ] as (keyof OrderInfo)[]
    ).forEach((key) => {
      const err = validateField(key, (form[key] as string) || "");
      if (err) newErrors[key] = err;
    });
    if (ratesConfigured && !(form.courier || "").trim()) {
      newErrors.courier = "Pick a courier";
    }
    setErrors(newErrors);
    // Mark all required fields touched on submit so errors render even
    // for fields the visitor never focused (e.g. tapped Pay immediately).
    setTouched({
      fullName: true,
      email: true,
      phone: true,
      region: true,
      province: true,
      city: true,
      barangay: true,
      addressLine1: true,
      postalCode: true,
      courier: true,
    });
    return Object.keys(newErrors).length === 0;
  };

  const handleFieldBlur = (key: keyof OrderInfo): void => {
    setTouched((prev) => ({ ...prev, [key]: true }));
    const err = validateField(key, (form[key] as string) || "");
    setErrors((prev) => ({ ...prev, [key]: err || undefined }));
  };

  // Persist guest form on every change so closing the drawer, switching
  // tabs, or hitting back doesn't wipe what they typed. Skip when the
  // visitor is signed-in — their data already lives on their account.
  useEffect(() => {
    if (isSignedIn) return;
    saveCheckoutDraft(form);
  }, [form, isSignedIn]);

  const handlePayWithQR = async () => {
    if (!validate()) return;
    setIsCreatingPayment(true);

    try {
      const data = await createPayment({
        data: {
          amount: total,
          customer: {
            fullName: form.fullName.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            address: form.address.trim(),
            city: form.city.trim(),
          },
        },
      });
      setPaymentIntentId(data.id);
      setQrCodeUrl(data.qrCodeImageUrl || null);
      setShowPayment(true);
    } catch (error) {
      console.error("Payment creation failed:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to create payment. Please try again.",
      );
    } finally {
      setIsCreatingPayment(false);
    }
  };

  // Whole-form lockout while we're either creating the payment intent
  // or the PaymentModal is open. Guards against the visitor editing
  // their address / email mid-payment, which would create a mismatch
  // between what PayMongo charged and what the order record carries.
  const formLocked = isCreatingPayment || showPayment;

  const handlePaymentSuccess = () => {
    setShowPayment(false);
    // Compose the legacy `address` (single string) from the structured
    // fields so admin tools / waybill PDFs / SMS copy that haven't
    // migrated yet still get a useful one-liner.
    const composedAddress = composePhAddressLine(phAddress);
    const sanitizedForm: OrderInfo = {
      fullName: sanitizeText(enforceMaxLength(form.fullName, 100)),
      email: sanitizeText(enforceMaxLength(form.email, 254)),
      phone: sanitizeText(enforceMaxLength(form.phone, 20)),
      address: sanitizeText(
        enforceMaxLength(composedAddress || form.address, 500),
      ),
      city: sanitizeText(enforceMaxLength(form.city, 100)),
      notes: sanitizeText(enforceMaxLength(form.notes, 500)),
      addressLine1: sanitizeText(
        enforceMaxLength(form.addressLine1 || "", 200),
      ),
      addressLine2: sanitizeText(
        enforceMaxLength(form.addressLine2 || "", 200),
      ),
      province: sanitizeText(enforceMaxLength(form.province || "", 100)),
      postalCode: sanitizeText(enforceMaxLength(form.postalCode || "", 20)),
      country: sanitizeText(enforceMaxLength(form.country || "", 100)),
      latitude: form.latitude ?? null,
      longitude: form.longitude ?? null,
      formattedAddress: sanitizeText(
        enforceMaxLength(form.formattedAddress || composedAddress, 500),
      ),
      placeId: form.placeId,
      // PH cascading-picker fields persisted alongside the order so
      // admin can render the full structured address on the dashboard
      // and the waybill PDF can format each line individually.
      region: sanitizeText(enforceMaxLength(form.region || "", 60)),
      barangay: sanitizeText(enforceMaxLength(form.barangay || "", 120)),
      landmark: sanitizeText(enforceMaxLength(form.landmark || "", 240)),
      courier: sanitizeText(enforceMaxLength(form.courier || "", 60)),
      shippingZone: sanitizeText(
        enforceMaxLength(zoneForRegion(form.region || "") || "", 40),
      ),
    };
    placeOrder(sanitizedForm, {
      paymentIntentId: paymentIntentId ?? undefined,
      qrCodeImageUrl: qrCodeUrl,
    });
    setForm({
      fullName: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      notes: "",
      country: "Philippines",
    });
    setTouched({});
    setErrors({});
    // Persist the structured address to the signed-in user's address
    // book so they don't have to retype it next time. We update the
    // existing default if there is one, otherwise we add a new entry.
    if (isSignedIn && user) {
      const existing = pickDefaultAddress(user);
      const payload = {
        label: existing?.label || "Home",
        fullName: sanitizedForm.fullName,
        phone: sanitizedForm.phone,
        line1: sanitizedForm.addressLine1 || "",
        line2: sanitizedForm.addressLine2 || "",
        city: sanitizedForm.city || "",
        province: sanitizedForm.province || "",
        postalCode: sanitizedForm.postalCode || "",
        country: sanitizedForm.country || "Philippines",
        region: sanitizedForm.region || "",
        barangay: sanitizedForm.barangay || "",
        landmark: sanitizedForm.landmark || "",
        latitude: sanitizedForm.latitude ?? null,
        longitude: sanitizedForm.longitude ?? null,
        formatted: sanitizedForm.formattedAddress || "",
        placeId: sanitizedForm.placeId,
      };
      const op = existing
        ? updateAddress(existing.id, payload)
        : addAddress(payload);
      void op.catch(() => {
        /* swallow — order already placed; next time we'll try again */
      });
    }
    // Order is now placed — drop the draft so future visits to this tab
    // don't pre-fill someone else's information.
    clearCheckoutDraft();
  };

  const fields: {
    key: keyof OrderInfo;
    label: string;
    icon: typeof User;
    type?: string;
    placeholder: string;
    required?: boolean;
  }[] = [
    {
      key: "fullName",
      label: "Full Name",
      icon: User,
      placeholder: "Juan Dela Cruz",
      required: true,
    },
    {
      key: "email",
      label: "Email Address",
      icon: Mail,
      type: "email",
      placeholder: "juan@email.com",
      required: true,
    },
    {
      key: "phone",
      label: "Phone Number",
      icon: Phone,
      type: "tel",
      placeholder: "+63 9XX XXX XXXX",
      required: true,
    },
    {
      key: "notes",
      label: "Order Notes (Optional)",
      icon: FileText,
      placeholder: "Any special instructions...",
    },
  ];

  const onPhAddressChange = (next: PhAddressValue): void => {
    const flatAddress = composePhAddressLine(next);
    setForm((prev) => ({
      ...prev,
      address: flatAddress,
      city: next.city,
      addressLine1: next.line1,
      addressLine2: prev.addressLine2 || "",
      province: next.province,
      postalCode: next.postalCode || "",
      country: next.country || prev.country || "Philippines",
      formattedAddress: flatAddress,
      region: next.region,
      barangay: next.barangay,
      landmark: next.landmark || "",
      shippingZone: next.zone || "",
    }));
    // Live-clear errors as the user fills the cascading picker so red
    // hints disappear the moment a field becomes valid.
    setErrors((prev) => ({
      ...prev,
      region: next.region ? undefined : prev.region,
      province: next.province ? undefined : prev.province,
      city: next.city ? undefined : prev.city,
      barangay: next.barangay ? undefined : prev.barangay,
      addressLine1: next.line1 ? undefined : prev.addressLine1,
      postalCode: isValidPhPostal(next.postalCode || "")
        ? undefined
        : prev.postalCode,
    }));
  };
  // Preview of what the picked courier × region combo will charge,
  // shown next to the selector so the customer sees the impact of
  // their choice before they commit.
  const previewedFee =
    form.courier && form.region
      ? getShippingFee(
          storefrontConfig.shippingRates,
          form.courier,
          zoneForRegion(form.region),
        )
      : null;

  return (
    <>
      <AnimatePresence>
        {showCheckout && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCheckout(false)}
              className="fixed inset-0 z-[90] bg-background/60 backdrop-blur-sm"
              aria-hidden="true"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 bottom-0 z-[95] w-full max-w-md bg-card border-l border-border/20 flex flex-col"
              role="dialog"
              aria-modal="true"
              aria-labelledby={checkoutTitleId}
            >
              <div className="p-6 border-b border-border/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowCheckout(false)}
                    className="p-2 hover:bg-accent rounded-sm transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                    aria-label="Back to cart"
                  >
                    <ArrowLeft className="w-5 h-5 text-foreground" />
                  </button>
                  <h2
                    id={checkoutTitleId}
                    className="font-display text-lg text-foreground"
                  >
                    Checkout
                  </h2>
                </div>
                <button
                  onClick={() => setShowCheckout(false)}
                  className="p-2 hover:bg-accent rounded-sm transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                  aria-label="Close checkout"
                >
                  <X className="w-5 h-5 text-foreground" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {/* Vacation mode replaces the entire checkout body with a
                    friendly explanation. The cart is preserved so the
                    buyer can come back when the shop reopens. */}
                {storefrontConfig.vacationMode.enabled && (
                  <div className="space-y-4 text-center py-12">
                    <div className="text-5xl">🌴</div>
                    <h3 className="font-display text-xl text-foreground">
                      Canvas Hub is briefly paused
                    </h3>
                    <p className="font-body text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                      {storefrontConfig.vacationMode.message?.trim() ||
                        (storefrontConfig.vacationMode.returnDate
                          ? `New orders resume on ${new Date(
                              `${storefrontConfig.vacationMode.returnDate}T00:00:00`,
                            ).toLocaleDateString(undefined, {
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                            })}. Your cart will still be here. Bookmark a piece and I'll reach out when I'm back.`
                          : "New orders resume soon. Your cart will still be here. Bookmark a piece and I'll reach out when I'm back.")}
                    </p>
                    <button
                      onClick={() => setShowCheckout(false)}
                      className="inline-flex items-center gap-2 px-6 py-3 mt-4 border border-foreground/20 text-foreground font-body text-xs tracking-[0.2em] uppercase hover:bg-accent transition-all duration-300 rounded-sm"
                    >
                      Keep browsing
                    </button>
                  </div>
                )}
                {/* Guest vs Sign-in choice — only for signed-out visitors. */}
                {!storefrontConfig.vacationMode.enabled &&
                  !isSignedIn &&
                  checkoutMode === "choose" && (
                    <div className="mb-6 space-y-3">
                      <p className="font-body text-xs tracking-wider uppercase text-muted-foreground">
                        How would you like to checkout?
                      </p>
                      <button
                        onClick={() => setCheckoutMode("guest")}
                        className="w-full flex items-center gap-3 p-4 border border-border/30 rounded-sm hover:bg-accent/50 transition-colors text-left"
                      >
                        <UserPlus className="w-5 h-5 text-muted-foreground shrink-0" />
                        <div>
                          <p className="font-body text-sm font-medium text-foreground">
                            Continue as Guest
                          </p>
                          <p className="font-body text-xs text-muted-foreground">
                            No account needed
                          </p>
                        </div>
                      </button>
                      <div className="w-full flex flex-col items-center gap-2 p-4 border border-border/30 rounded-sm">
                        <div
                          ref={googleBtnRef}
                          className="w-full flex justify-center"
                          aria-label="Continue with Google"
                        />
                        <p className="font-body text-xs text-muted-foreground text-center">
                          Track your order &amp; save your info
                        </p>
                      </div>
                    </div>
                  )}

                {/* Order Summary + Form. Always shown to signed-in users —
                    never the "Continue as Guest / Sign in with Google" prompt.
                    Suppressed entirely when vacation mode is on. */}
                {!storefrontConfig.vacationMode.enabled &&
                  (isSignedIn || checkoutMode !== "choose") && (
                    <>
                      <div className="mb-6 p-4 bg-muted/30 border border-border/10 rounded-sm">
                        {/* Header doubles as a collapse toggle on mobile.
                          Tap on <md to hide the line items — keeps the
                          form fields above the fold on small screens.
                          Always-expanded on md+ where vertical space is
                          plentiful, so the chevron renders hidden there. */}
                        <button
                          type="button"
                          onClick={() => setSummaryExpanded((prev) => !prev)}
                          className="w-full flex items-center justify-between md:cursor-default md:pointer-events-none mb-3"
                          aria-expanded={summaryExpanded}
                          aria-controls="checkout-order-summary-body"
                        >
                          <p className="font-body text-xs tracking-wider uppercase text-muted-foreground">
                            Order Summary
                          </p>
                          <span className="flex items-center gap-2 md:hidden">
                            <span className="font-body text-xs font-semibold text-foreground">
                              ₱{total.toLocaleString()}
                            </span>
                            <ChevronDown
                              className={`w-4 h-4 text-muted-foreground transition-transform ${
                                summaryExpanded ? "rotate-180" : ""
                              }`}
                            />
                          </span>
                        </button>
                        <div
                          id="checkout-order-summary-body"
                          className={`${
                            summaryExpanded ? "block" : "hidden md:block"
                          }`}
                        >
                          {items.map((item) => (
                            <div
                              key={item.id}
                              className="flex justify-between font-body text-xs text-foreground mb-1"
                            >
                              <span>
                                {item.title} × {item.quantity}
                              </span>
                              <span>
                                ₱{(item.price * item.quantity).toLocaleString()}
                              </span>
                            </div>
                          ))}
                          <div className="border-t border-border/10 mt-3 pt-3 space-y-1">
                            <div className="flex justify-between font-body text-xs text-muted-foreground">
                              <span>Subtotal</span>
                              <span>₱{subtotal.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between font-body text-xs text-muted-foreground">
                              <span>Shipping</span>
                              {shippingFeePending ? (
                                <span className="text-foreground/70">
                                  Pick a courier below
                                </span>
                              ) : shippingIsWaived ? (
                                <span>
                                  {shippingFeeOriginal > 0 && (
                                    <span className="line-through mr-1">
                                      ₱{shippingFeeOriginal.toLocaleString()}
                                    </span>
                                  )}
                                  <span className="text-foreground">FREE</span>
                                </span>
                              ) : (
                                <span>₱{shippingFee.toLocaleString()}</span>
                              )}
                            </div>
                            {discount > 0 && (
                              <div className="flex justify-between font-body text-xs text-foreground">
                                <span>
                                  Discount (
                                  {voucher.type === "percent"
                                    ? `${voucher.value}%`
                                    : voucher.type === "flat"
                                      ? `flat \u20b1${voucher.value.toLocaleString()}`
                                      : `\u20b1${voucher.value.toLocaleString()} off`}
                                  )
                                </span>
                                <span>-₱{discount.toLocaleString()}</span>
                              </div>
                            )}
                            <div className="flex justify-between font-body text-sm text-foreground pt-2 border-t border-border/10">
                              <span>Total</span>
                              <span className="font-semibold">
                                ₱{total.toLocaleString()}
                                {shippingFeePending && (
                                  <span className="font-body text-[10px] text-muted-foreground ml-1">
                                    + shipping
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                          {estimatedCreationDays && (
                            <p className="font-body text-[10px] text-muted-foreground mt-2">
                              Est. creation: {estimatedCreationDays}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Form */}
                      <div className="space-y-4">
                        <p className="font-body text-xs tracking-wider uppercase text-muted-foreground">
                          Your Information
                        </p>
                        {fields.map(
                          (
                            {
                              key,
                              label,
                              icon: Icon,
                              type,
                              placeholder,
                              required,
                            },
                            idx,
                          ) => (
                            <div key={String(key)}>
                              {/* Inject the cascading PH address picker
                                + courier selector right before the
                                notes field so they sit with the rest
                                of the delivery details. */}
                              {key === "notes" && (
                                <div className="mb-4 space-y-4">
                                  <div>
                                    <label className="font-body text-xs text-muted-foreground flex items-center gap-1.5 mb-2">
                                      <MapPin className="w-3.5 h-3.5" />
                                      Delivery Address{" "}
                                      <span className="text-destructive">
                                        *
                                      </span>
                                    </label>
                                    <fieldset
                                      disabled={formLocked}
                                      className="contents"
                                    >
                                      <PhAddressFields
                                        value={phAddress}
                                        onChange={onPhAddressChange}
                                        disabled={formLocked}
                                      />
                                    </fieldset>
                                    {[
                                      touched.region && errors.region,
                                      touched.province && errors.province,
                                      touched.city && errors.city,
                                      touched.barangay && errors.barangay,
                                      touched.addressLine1 &&
                                        errors.addressLine1,
                                      touched.postalCode && errors.postalCode,
                                    ]
                                      .filter(Boolean)
                                      .slice(0, 1)
                                      .map((msg, i) => (
                                        <p
                                          key={i}
                                          className="font-body text-[10px] text-destructive mt-2"
                                        >
                                          {msg}
                                        </p>
                                      ))}
                                  </div>
                                  {/* Courier selector — drives the
                                    per-courier × per-zone fee. Hidden
                                    when no shippable couriers are
                                    available so the legacy flat rate
                                    just applies. */}
                                  {courierOptions.length > 0 && (
                                    <div>
                                      <label className="font-body text-xs text-muted-foreground flex items-center gap-1.5 mb-2">
                                        <Truck className="w-3.5 h-3.5" />
                                        Courier{" "}
                                        {ratesConfigured && (
                                          <span className="text-destructive">
                                            *
                                          </span>
                                        )}
                                      </label>
                                      <Select
                                        value={form.courier || ""}
                                        onValueChange={(courier) => {
                                          setForm((prev) => ({
                                            ...prev,
                                            courier,
                                          }));
                                          setErrors((prev) => ({
                                            ...prev,
                                            courier: courier
                                              ? undefined
                                              : prev.courier,
                                          }));
                                        }}
                                        disabled={formLocked}
                                      >
                                        <SelectTrigger className="h-10 text-sm">
                                          <SelectValue placeholder="Pick a courier" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {courierOptions.map((c) => (
                                            <SelectItem key={c.id} value={c.id}>
                                              {c.label}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      {form.courier && form.region && (
                                        <p className="font-body text-[11px] text-muted-foreground mt-1.5">
                                          {previewedFee != null
                                            ? `Estimated fee: \u20b1${previewedFee.toLocaleString()} (${zoneLabel(zoneForRegion(form.region))})`
                                            : "Fee not configured for this region — flat rate will apply."}
                                        </p>
                                      )}
                                      {touched.courier && errors.courier && (
                                        <p className="font-body text-[10px] text-destructive mt-1">
                                          {errors.courier}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                              <label className="font-body text-xs text-muted-foreground flex items-center gap-1.5 mb-1.5">
                                <Icon className="w-3.5 h-3.5" />
                                {label}{" "}
                                {required && (
                                  <span className="text-destructive">*</span>
                                )}
                              </label>
                              {key === "notes" ? (
                                <textarea
                                  value={form[key]}
                                  onChange={(e) =>
                                    setForm((prev) => ({
                                      ...prev,
                                      [key]: e.target.value,
                                    }))
                                  }
                                  placeholder={placeholder}
                                  rows={3}
                                  disabled={formLocked}
                                  className="w-full px-3 py-2 bg-background border border-border/30 text-foreground font-body text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30 transition-colors rounded-sm resize-none disabled:opacity-60 disabled:cursor-not-allowed"
                                />
                              ) : (
                                <input
                                  type={type || "text"}
                                  inputMode={
                                    key === "phone"
                                      ? "tel"
                                      : key === "email"
                                        ? "email"
                                        : undefined
                                  }
                                  autoComplete={
                                    key === "fullName"
                                      ? "name"
                                      : key === "email"
                                        ? "email"
                                        : key === "phone"
                                          ? "tel"
                                          : undefined
                                  }
                                  value={(form[key] as string) || ""}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    const next =
                                      key === "phone"
                                        ? formatPhPhone(raw)
                                        : raw;
                                    setForm((prev) => ({
                                      ...prev,
                                      [key]: next,
                                    }));
                                    // Live-clear an existing error as soon as
                                    // the field becomes valid — keeps the red
                                    // hint from lingering after the visitor
                                    // fixes their typo.
                                    if (touched[key]) {
                                      const err = validateField(key, next);
                                      setErrors((prev) => ({
                                        ...prev,
                                        [key]: err || undefined,
                                      }));
                                    }
                                  }}
                                  onBlur={() => handleFieldBlur(key)}
                                  placeholder={placeholder}
                                  disabled={formLocked}
                                  aria-invalid={
                                    touched[key] && Boolean(errors[key])
                                  }
                                  className={`w-full px-3 py-2 bg-background border ${
                                    touched[key] && errors[key]
                                      ? "border-destructive/60"
                                      : "border-border/30"
                                  } text-foreground font-body text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30 transition-colors rounded-sm disabled:opacity-60 disabled:cursor-not-allowed`}
                                />
                              )}
                              {touched[key] && errors[key] && (
                                <p className="font-body text-[10px] text-destructive mt-1">
                                  {errors[key]}
                                </p>
                              )}
                              {/* TS quiet — idx unused but kept for parity */}
                              {idx < 0 && null}
                            </div>
                          ),
                        )}

                        {/* Pay with QR Ph Button */}
                        <button
                          onClick={handlePayWithQR}
                          disabled={isCreatingPayment}
                          className="w-full py-4 bg-[#0066FF] text-[#FFFFFF] font-body text-xs tracking-[0.3em] uppercase hover:bg-[#0052CC] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 rounded-sm flex items-center justify-center gap-3"
                        >
                          {isCreatingPayment ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Generating QR Code...
                            </>
                          ) : (
                            "Pay with QR Ph"
                          )}
                        </button>

                        <p className="font-body text-[10px] text-center text-muted-foreground/50">
                          Secure payment via PayMongo. Scan with GCash, Maya, or
                          any QR Ph app.
                        </p>
                      </div>
                    </>
                  )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {showPayment && paymentIntentId && (
        <PaymentModal
          paymentIntentId={paymentIntentId}
          qrCodeUrl={qrCodeUrl}
          total={total}
          onSuccess={handlePaymentSuccess}
          onClose={() => setShowPayment(false)}
        />
      )}
    </>
  );
};

export default CheckoutForm;
