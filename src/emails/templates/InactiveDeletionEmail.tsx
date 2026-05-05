import { Heading, Link, Section, Text } from "@react-email/components";
import * as React from "react";
import ActionButton from "../components/ActionButton";
import BaseEmail from "../components/BaseEmail";
import {
  DISPLAY_FONT_STACK,
  palette,
  resolveBodyFont,
  safeColor,
} from "../lib/styles";
import type { EmailChromeConfig } from "../types";

export interface InactiveDeletionEmailProps {
  user: { name?: string; email?: string };
  inactiveDays: number;
  signupUrl: string;
  /** Optional chrome config — defaults to plain Canvas Hub identity. */
  config?: EmailChromeConfig | null;
}

/**
 * Sent when an account is auto-removed for inactivity. Uses the shared
 * BaseEmail chrome so this admin-triggered email isn't visually
 * disconnected from the rest of the customer's email history.
 */
export default function InactiveDeletionEmail({
  user,
  inactiveDays,
  signupUrl,
  config,
}: InactiveDeletionEmailProps) {
  const cfg = config || ({} as EmailChromeConfig);
  const primary = safeColor(cfg.primaryColor, palette.light.bodyText);
  const accent = safeColor(cfg.accentColor, palette.light.mutedText);
  const bodyFont = resolveBodyFont(cfg.bodyFont);
  const name = String(user?.name || "there").trim() || "there";
  const email = String(user?.email || "").trim();

  return (
    <BaseEmail
      config={cfg}
      preview="Your Canvas Hub account was removed for inactivity"
      logoSlot="inactive-logo"
    >
      <Heading
        as="h1"
        className="email-text"
        style={{
          margin: "0 0 16px",
          fontFamily: DISPLAY_FONT_STACK,
          fontWeight: 500,
          fontSize: "24px",
          letterSpacing: "0.01em",
          color: primary,
        }}
      >
        Hi {name},
      </Heading>
      <Text
        className="email-text"
        style={{
          margin: "0 0 14px",
          fontSize: "15px",
          lineHeight: 1.65,
          color: primary,
          fontFamily: bodyFont,
        }}
      >
        Your Canvas Hub account
        {email ? (
          <>
            {" "}
            (<strong>{email}</strong>)
          </>
        ) : (
          ""
        )}{" "}
        has been removed because it has been inactive for {inactiveDays} days.
      </Text>
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
        If this was a mistake, you&rsquo;re welcome to sign up again any time at{" "}
        <Link
          href={signupUrl}
          style={{ color: primary, textDecoration: "underline" }}
        >
          {signupUrl}
        </Link>
        .
      </Text>

      <Section style={{ margin: "20px 0 0" }}>
        <ActionButton
          label="Sign up again"
          url={signupUrl}
          primary={primary}
          style={cfg.buttonStyle}
        />
      </Section>

      <Text
        className="email-muted"
        style={{
          margin: "28px 0 0",
          fontSize: "12px",
          color: accent,
          lineHeight: 1.55,
        }}
      >
        Reply to this email if you think this happened in error.
      </Text>
    </BaseEmail>
  );
}

export const buildInactiveDeletionEmailMeta = (
  props: InactiveDeletionEmailProps,
): { subject: string; text: string } => {
  const name = String(props.user?.name || "there").trim() || "there";
  const email = String(props.user?.email || "").trim();
  const subject = "Your Canvas Hub account was removed for inactivity";
  const text =
    `Hi ${name},\n\n` +
    `Your Canvas Hub account${email ? ` (${email})` : ""} was removed because it has been inactive for ${props.inactiveDays} days.\n\n` +
    `If this was a mistake, you're welcome to sign up again any time at ${props.signupUrl}.\n`;
  return { subject, text };
};
