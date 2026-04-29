// Shared Google Identity Services (GSI) helpers. Both `/login` and the
// in-cart "Sign in with Google" entry point render the official Google
// branded button via this module so visitors see the same interface and
// a click always goes straight to Google's account chooser — never to an
// intermediate in-app page.

export const GOOGLE_CLIENT_ID =
  "899774942474-kbdt3c4tvpr6tltcggmtnr07aqvg4eb2.apps.googleusercontent.com";

export const GOOGLE_CALLBACK_PATH = "/api/google-callback";

const GSI_SCRIPT_ID = "google-gsi-script";
const GSI_SRC = "https://accounts.google.com/gsi/client";

type GsiConfig = Record<string, unknown>;

interface Gsi {
  accounts: {
    id: {
      initialize: (config: GsiConfig) => void;
      renderButton: (el: HTMLElement, config: GsiConfig) => void;
      prompt?: () => void;
    };
  };
}

const getGsi = (): Gsi | undefined => {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as Record<string, unknown>).google as
    | Gsi
    | undefined;
};

export const loadGsiScript = (): Promise<Gsi> =>
  new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("No window"));
      return;
    }
    const existing = getGsi();
    if (existing) {
      resolve(existing);
      return;
    }
    const existingTag = document.getElementById(
      GSI_SCRIPT_ID,
    ) as HTMLScriptElement | null;
    const onReady = () => {
      const g = getGsi();
      if (g) resolve(g);
      else reject(new Error("Google script loaded but window.google missing"));
    };
    if (existingTag) {
      if (getGsi()) {
        resolve(getGsi() as Gsi);
        return;
      }
      existingTag.addEventListener("load", onReady, { once: true });
      existingTag.addEventListener(
        "error",
        () => reject(new Error("Google script failed to load")),
        { once: true },
      );
      return;
    }
    const tag = document.createElement("script");
    tag.id = GSI_SCRIPT_ID;
    tag.src = GSI_SRC;
    tag.async = true;
    tag.defer = true;
    tag.onload = onReady;
    tag.onerror = () => reject(new Error("Google script failed to load"));
    document.head.appendChild(tag);
  });

export interface RenderRedirectButtonOptions {
  target: HTMLElement;
  // Width passed to GSI. Clamped 240..400 per Google's supported range.
  width?: number;
  // "signin_with" | "signup_with" | "continue_with" | "signin"
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  shape?: "rectangular" | "pill" | "circle" | "square";
  // When set, GSI's popup (postMessage) flow is skipped and the button
  // form-POSTs straight to this URL after the user picks an account.
  loginUri?: string;
  // When provided, GSI uses the popup/postMessage flow and invokes this
  // callback with the credential. Used by `/login` to keep the in-page
  // flow working.
  onCredential?: (credential: string) => void;
}

// Render Google's official branded button. When `loginUri` is provided
// the button triggers a top-level redirect to Google's sign-in page and
// Google form-POSTs the credential back to that URI — no intermediate
// in-app route, no second click.
//
// GSI's `initialize` is idempotent: calling it again simply replaces the
// last config, so each caller passes its own mode without stepping on
// the other.
export const renderGoogleButton = async (
  opts: RenderRedirectButtonOptions,
): Promise<void> => {
  const g = await loadGsiScript();
  const width = Math.max(240, Math.min(400, opts.width ?? 320));
  const config: GsiConfig = {
    client_id: GOOGLE_CLIENT_ID,
    itp_support: true,
    use_fedcm_for_button: true,
    use_fedcm_for_prompt: true,
  };
  if (opts.loginUri) {
    config.ux_mode = "redirect";
    config.login_uri = opts.loginUri;
  } else if (opts.onCredential) {
    config.callback = (resp: { credential: string }) =>
      opts.onCredential?.(resp.credential);
  }
  g.accounts.id.initialize(config);
  g.accounts.id.renderButton(opts.target, {
    theme: opts.theme ?? "outline",
    size: opts.size ?? "large",
    shape: opts.shape ?? "rectangular",
    text: opts.text ?? "continue_with",
    width,
  });
};
