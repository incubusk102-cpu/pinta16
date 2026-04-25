import { useEffect, useMemo, useState } from "react";
import {
  useStorefrontConfig,
  type PromoCodePublic,
} from "@/contexts/StorefrontConfigContext";

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
  useEffect(() => {
    if (announcement.rotateSeconds <= 0) return;
    if (messages.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % messages.length);
    }, announcement.rotateSeconds * 1000);
    return () => window.clearInterval(id);
  }, [announcement.rotateSeconds, messages.length]);

  if (!announcement.enabled || messages.length === 0) return null;

  const rotate = announcement.rotateSeconds > 0 && messages.length > 1;
  const text = rotate ? messages[index] : messages.join(" · ");
  const sizeCls = sizeClasses[announcement.size] || sizeClasses.normal;
  const weightCls = announcement.bold ? "font-semibold" : "font-medium";

  const inner = (
    <span
      key={rotate ? index : "all"}
      className={`${weightCls} tracking-wide announcement-fade`}
    >
      {text}
    </span>
  );

  return (
    <div
      className={`w-full text-center px-4 ${sizeCls}`}
      style={{
        backgroundColor: announcement.backgroundColor,
        color: announcement.textColor,
      }}
      role="region"
      aria-label="Site announcement"
      aria-live="polite"
    >
      {announcement.link ? (
        <a
          href={announcement.link}
          target={announcement.link.startsWith("http") ? "_blank" : undefined}
          rel="noopener noreferrer"
          className="hover:underline"
        >
          {inner}
        </a>
      ) : (
        inner
      )}
    </div>
  );
};

export default AnnouncementBar;
