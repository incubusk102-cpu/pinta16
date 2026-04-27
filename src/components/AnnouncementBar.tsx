import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { X } from "lucide-react";
import {
  useStorefrontConfig,
  type AnnouncementConfig,
  type PromoCodePublic,
} from "@/contexts/StorefrontConfigContext";

const DISMISS_KEY_PREFIX = "pintaterra_announcement_dismissed_";

const formatPromo = (template: string, p: PromoCodePublic): string => {
  const discount =
    p.type === "percent" ? `${p.value}%` : `₱${p.value.toLocaleString()}`;
  const minSpend =
    p.minSpend > 0 ? ` orders ₱${p.minSpend.toLocaleString()}+` : "";
  return template
    .replace(/\{code\}/g, p.code)
    .replace(/\{discount\}/g, discount)
    .replace(/\{minSpend\}/g, minSpend)
    .replace(/\{description\}/g, p.description || "")
    .trim();
};

const sizeClasses: Record<string, string> = {
  compact: "text-xs sm:text-sm py-1.5",
  normal: "text-sm sm:text-base py-2",
  large: "text-base sm:text-lg py-3",
};

// A short content fingerprint so dismissals reset when the admin changes the
// active text — otherwise a customer who dismissed an old promo would keep
// hiding new ones with the same dismissable flag.
const fingerprint = (a: AnnouncementConfig, lines: string[]): string => {
  const head = lines.join("|");
  let hash = 0;
  for (let i = 0; i < head.length; i++) {
    hash = (hash * 31 + head.charCodeAt(i)) | 0;
  }
  return `${a.animation}_${hash}`;
};

const AnnouncementBar = () => {
  const { config } = useStorefrontConfig();
  const { announcement, freeShipping, promoCodes } = config;

  const messages = useMemo(() => {
    const out: string[] = [];
    const main = announcement.message.trim();
    if (main) out.push(main);
    if (
      announcement.showFreeShipping &&
      freeShipping.enabled &&
      freeShipping.threshold > 0
    ) {
      out.push(
        `Free shipping on orders ₱${freeShipping.threshold.toLocaleString()}+`,
      );
    }
    if (announcement.showPromoCodes) {
      const template =
        announcement.promoTemplate ||
        "Use code {code} for {discount} off{minSpend}";
      for (const p of promoCodes) {
        const line = formatPromo(template, p);
        if (line) out.push(line);
      }
    }
    return out;
  }, [announcement, freeShipping, promoCodes]);

  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
  }, [messages.length]);

  // Rotation only applies when animation is fade/slide/typewriter (per-message
  // styles). Marquee shows everything in one continuous scrolling track and
  // pulse highlights the joined string, so neither rotates.
  const supportsRotation =
    announcement.animation === "fade" ||
    announcement.animation === "slide" ||
    announcement.animation === "typewriter";
  // Whether rotation is actually happening right now — needed so per-message
  // styles can fall back to joined text when rotation is disabled
  // (rotateSeconds = 0) instead of silently dropping every message after the
  // first.
  const actuallyRotating =
    supportsRotation && announcement.rotateSeconds > 0 && messages.length > 1;

  useEffect(() => {
    if (!actuallyRotating) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % messages.length);
    }, announcement.rotateSeconds * 1000);
    return () => window.clearInterval(id);
  }, [actuallyRotating, announcement.rotateSeconds, messages.length]);

  // Dismissable banner state — keyed to the current content so a new
  // promo wakes the bar back up.
  const dismissKey = useMemo(
    () => DISMISS_KEY_PREFIX + fingerprint(announcement, messages),
    [announcement, messages],
  );
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!announcement.dismissable) {
      setDismissed(false);
      return;
    }
    try {
      setDismissed(localStorage.getItem(dismissKey) === "1");
    } catch {
      setDismissed(false);
    }
  }, [announcement.dismissable, dismissKey]);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(dismissKey, "1");
    } catch {
      /* ignore */
    }
  };

  if (!announcement.enabled || messages.length === 0) return null;
  if (announcement.dismissable && dismissed) return null;

  const sizeCls = sizeClasses[announcement.size] || sizeClasses.normal;
  const weightCls = announcement.bold ? "font-semibold" : "font-medium";
  const prefix = announcement.iconPrefix.trim();
  const decorate = (text: string) => (prefix ? `${prefix} ${text}` : text);

  // Background — solid color or gradient.
  const wrapperStyle: CSSProperties = {
    color: announcement.textColor,
    ...(announcement.gradientEnabled
      ? {
          backgroundImage: `linear-gradient(90deg, ${announcement.gradientFrom}, ${announcement.gradientTo})`,
          backgroundColor: announcement.gradientFrom,
        }
      : { backgroundColor: announcement.backgroundColor }),
  };

  let content: React.ReactNode = null;

  if (announcement.animation === "marquee") {
    // Duplicate the joined message twice so the loop appears seamless.
    const joined = messages.map(decorate).join("    ·    ");
    const trackStyle: CSSProperties = {
      ["--ann-duration" as string]: `${announcement.marqueeSpeedSeconds}s`,
    };
    content = (
      <div className="announcement-marquee w-full">
        <div
          className={`announcement-marquee-track ${weightCls} tracking-wide`}
          data-direction={announcement.marqueeDirection}
          style={trackStyle}
        >
          <span>{joined}</span>
          <span aria-hidden="true">{joined}</span>
        </div>
      </div>
    );
  } else if (announcement.animation === "pulse") {
    const joined = messages.map(decorate).join(" · ");
    content = (
      <span className={`announcement-pulse ${weightCls} tracking-wide`}>
        {joined}
      </span>
    );
  } else if (announcement.animation === "typewriter") {
    const text = actuallyRotating
      ? decorate(messages[index] ?? "")
      : messages.map(decorate).join(" · ");
    const dur = Math.max(
      1.2,
      Math.min(8, (announcement.rotateSeconds || 4) * 0.6),
    );
    const typeStyle: CSSProperties = {
      ["--ann-type-duration" as string]: `${dur}s`,
    };
    content = (
      <span
        key={actuallyRotating ? `tw-${index}-${text}` : "tw-all"}
        className={`announcement-typewriter ${weightCls} tracking-wide`}
        style={typeStyle}
      >
        {text}
      </span>
    );
  } else if (announcement.animation === "slide") {
    const text = actuallyRotating
      ? decorate(messages[index] ?? "")
      : messages.map(decorate).join(" · ");
    content = (
      <span
        key={actuallyRotating ? `sl-${index}` : "sl-all"}
        className={`announcement-slide ${weightCls} tracking-wide`}
      >
        {text}
      </span>
    );
  } else {
    // fade (default / legacy behaviour)
    const text = actuallyRotating
      ? decorate(messages[index] ?? "")
      : messages.map(decorate).join(" · ");
    content = (
      <span
        key={actuallyRotating ? `fd-${index}` : "fd-all"}
        className={`${weightCls} tracking-wide announcement-fade`}
      >
        {text}
      </span>
    );
  }

  // Marquee already handles its own width; for non-marquee variants we keep
  // the centered text layout.
  const isMarquee = announcement.animation === "marquee";

  const inner = announcement.link ? (
    <a
      href={announcement.link}
      target={announcement.link.startsWith("http") ? "_blank" : undefined}
      rel="noopener noreferrer"
      className="hover:underline"
    >
      {content}
    </a>
  ) : (
    content
  );

  return (
    <div
      className={`relative w-full ${isMarquee ? "" : "text-center"} ${
        isMarquee ? "px-0" : "px-4"
      } ${sizeCls}`}
      style={wrapperStyle}
      role="region"
      aria-label="Site announcement"
      aria-live="polite"
    >
      {isMarquee ? <div className="px-4">{inner}</div> : inner}
      {announcement.dismissable && (
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss announcement"
          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-6 h-6 rounded hover:bg-white/15"
          style={{ color: announcement.textColor }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

export default AnnouncementBar;
