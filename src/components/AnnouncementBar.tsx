import { useStorefrontConfig } from "@/contexts/StorefrontConfigContext";

const AnnouncementBar = () => {
  const { config } = useStorefrontConfig();
  const { announcement, freeShipping } = config;

  if (!announcement.enabled || !announcement.message.trim()) return null;

  const messages: string[] = [announcement.message.trim()];
  if (freeShipping.enabled && freeShipping.threshold > 0) {
    messages.push(
      `Free shipping on orders ₱${freeShipping.threshold.toLocaleString()}+`,
    );
  }
  const text = messages.join(" · ");

  const inner = (
    <span className="font-medium text-xs sm:text-sm tracking-wide">{text}</span>
  );

  return (
    <div
      className="w-full text-center px-4 py-2"
      style={{
        backgroundColor: announcement.backgroundColor,
        color: announcement.textColor,
      }}
      role="region"
      aria-label="Site announcement"
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
