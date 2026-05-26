import { Heading, Section, Text } from "@react-email/components";
import BaseEmail from "../components/BaseEmail";
import {
  DISPLAY_FONT_STACK,
  MONO_FONT_STACK,
  palette,
  resolveBodyFont,
  safeColor,
} from "../lib/styles";
import type { EmailChromeConfig } from "../types";

export interface VoucherEmailProps {
  /** Newsletter discount code already validated/uppercased upstream. */
  code: string;
  /** Optional chrome config so the voucher email picks up the same brand
   *  identity as the welcome / order emails. Uses defaults when omitted. */
  config?: EmailChromeConfig | null;
}

/**
 * Sent immediately after a visitor subscribes to the newsletter and
 * unlocks a welcome discount. Now uses the shared BaseEmail chrome so
 * it visually matches the welcome / order / admin alert emails.
 */
export default function VoucherEmail({ code, config }: VoucherEmailProps) {
  const cfg = config || ({} as EmailChromeConfig);
  const primary = safeColor(cfg.primaryColor, palette.light.bodyText);
  const accent = safeColor(cfg.accentColor, palette.light.mutedText);
  const bodyFont = resolveBodyFont(cfg.bodyFont);
  const upper = String(code || "")
    .trim()
    .toUpperCase();

  return (
    <BaseEmail
      config={cfg}
      preview={`Your welcome code: ${upper}`}
      logoSlot="voucher-logo"
    >
      <Text
        className="email-muted"
        style={{
          margin: "0 0 6px",
          fontSize: "11px",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: accent,
          fontWeight: 600,
        }}
      >
        Your welcome code
      </Text>
      <Heading
        as="h1"
        className="email-text"
        style={{
          margin: "0 0 18px",
          fontFamily: DISPLAY_FONT_STACK,
          fontWeight: 500,
          fontSize: "26px",
          letterSpacing: "0.01em",
          color: primary,
        }}
      >
        Thanks for subscribing.
      </Heading>

      <Text
        className="email-text"
        style={{
          margin: "0 0 18px",
          fontSize: "15px",
          lineHeight: 1.65,
          color: primary,
          fontFamily: bodyFont,
        }}
      >
        Here&rsquo;s the welcome code we promised. Apply it at checkout to claim
        your discount.
      </Text>

      <Section
        className="email-soft-bg"
        style={{
          margin: "8px 0 20px",
          padding: "20px 22px",
          background: palette.light.softBg,
          border: `1px dashed ${palette.light.accent}`,
          borderRadius: "10px",
          textAlign: "center",
        }}
      >
        <Text
          style={{
            display: "inline-block",
            margin: 0,
            padding: "10px 22px",
            background: palette.light.cardBg,
            border: `1px dashed ${palette.light.accent}`,
            borderRadius: "4px",
            fontFamily: MONO_FONT_STACK,
            fontSize: "22px",
            letterSpacing: "0.18em",
            color: primary,
          }}
        >
          {upper}
        </Text>
      </Section>

      <Text
        className="email-muted"
        style={{
          margin: "0",
          fontSize: "12px",
          color: accent,
          lineHeight: 1.55,
        }}
      >
        If you didn&rsquo;t request this, you can safely ignore this email.
      </Text>
    </BaseEmail>
  );
}

export const buildVoucherEmailMeta = (
  props: VoucherEmailProps,
): { subject: string; text: string } => {
  const upper = String(props.code || "")
    .trim()
    .toUpperCase();
  const subject = `Your Canvas Hub welcome code: ${upper}`;
  const text =
    `Thanks for subscribing — here's your welcome code: ${upper}\n\n` +
    `Apply it at checkout to claim your discount.\n\n` +
    `If you didn't request this, you can safely ignore this email.\n`;
  return { subject, text };
};
