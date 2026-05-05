import { Button } from "@react-email/components";
import * as React from "react";
import type { ButtonStyle } from "../types";
import { buildActionStyle, isSafeUrl } from "../lib/styles";

interface ActionButtonProps {
  label: string;
  url: string;
  primary: string;
  style?: ButtonStyle;
  /**
   * Optional CSS class so dark-mode media queries can target the
   * filled variant specifically and lift contrast on dark backgrounds.
   */
  className?: string;
}

/**
 * Single source of truth for CTA buttons across every email template.
 * Three admin-tunable styles: filled (default), outline, underline.
 * Renders nothing for unsafe URLs so admins can't ship invalid links.
 */
export default function ActionButton({
  label,
  url,
  primary,
  style,
  className,
}: ActionButtonProps) {
  if (!label || !url || !isSafeUrl(url)) return null;
  const css = buildActionStyle(style, primary);
  return (
    <Button
      href={url}
      className={className || (style === "filled" ? "email-button-filled" : "")}
      style={css}
    >
      {label}
    </Button>
  );
}
