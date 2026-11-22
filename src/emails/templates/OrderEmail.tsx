import { Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import ActionButton from "../components/ActionButton";
import BaseEmail from "../components/BaseEmail";
import Divider from "../components/Divider";
import ItemTable from "../components/ItemTable";
import OrderTotals from "../components/OrderTotals";
import StatusProgress from "../components/StatusProgress";
import { resolveKindCopy } from "../lib/default-copy";
import {
  DISPLAY_FONT_STACK,
  palette,
  resolveBodyFont,
  safeColor,
} from "../lib/styles";
import {
  buildOrderTrackUrl,
  formatPHP,
  substituteTemplate,
} from "../lib/template-vars";
import type {
  OrderEmailConfig,
  OrderEmailExtra,
  OrderEmailKind,
  OrderRecord,
} from "../types";

export interface OrderEmailProps {
  kind: OrderEmailKind;
  order: OrderRecord;
  extra?: OrderEmailExtra;
  config?: OrderEmailConfig | null;
}

/**
 * Single template for all 7 customer-facing order status emails.
 *
 * Layout:
 *   - BaseEmail chrome (logo / banner / palette / footer)
 *   - Heading (per-kind, admin-editable)
 *   - Intro paragraphs (admin-editable, supports {{var}} placeholders)
 *   - Order ID badge
 *   - StatusProgress (4-step pill — hidden on refund kinds)
 *   - Optional shipment line (when courier / tracking number is attached)
 *   - ItemTable with thumbnails
 *   - OrderTotals
 *   - Optional refund block (refund_requested / refund_succeeded /
 *     refund_failed)
 *   - Per-kind primary CTA:
 *       * out_for_delivery → Track shipment
 *       * received          → Write a review
 *       * other kinds       → none
 *   - "Questions? Just reply to this email." footer line
 */
export default function OrderEmail({
  kind,
  order,
  extra,
  config,
}: OrderEmailProps) {
  const cfg = config || {};
  const primary = safeColor(cfg.primaryColor, palette.light.bodyText);
  const accent = safeColor(cfg.accentColor, palette.light.mutedText);
  const bodyFont = resolveBodyFont(cfg.bodyFont);

  const id = String(order.id || "");
  const fullName =
    String(order.orderInfo?.fullName || "").trim() || "Collector";
  const firstName = fullName.split(/\s+/)[0] || fullName;
  const itemCount = Array.isArray(order.items) ? order.items.length : 0;
  const itemPlural = itemCount > 1 ? "s" : "";
  const totalFormatted = formatPHP(order.total);

  const trackingUrl = extra?.trackingUrl || "";
  const trackingNumber = extra?.trackingNumber || "";
  const courier = extra?.courier || "";
  const refundAmountRaw = extra?.refundAmount ?? 0;
  const refundAmount = formatPHP(refundAmountRaw);
  const failureMessage = extra?.refundFailureMessage
    ? `: ${extra.refundFailureMessage}`
    : "";

  const vars: Record<string, string> = {
    name: fullName,
    firstName,
    orderId: id,
    total: totalFormatted,
    itemCount: String(itemCount),
    itemPlural,
    courier,
    trackingNumber,
    refundAmount,
    failureMessage,
  };

  const copy = resolveKindCopy(cfg, kind);
  const subject = substituteTemplate(copy.subject, vars);
  const heading = substituteTemplate(copy.heading, vars);
  const introBody = substituteTemplate(copy.intro, vars);

  // Split intro on blank lines into paragraphs; preserve hard newlines as <br>.
  const paragraphs = introBody
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const trackButtonText = (cfg.trackButtonText || "Track shipment").trim();
  const reviewButtonText = (cfg.reviewButtonText || "Write a review").trim();

  // Per-kind primary CTA.
  const ctaLabel =
    kind === "out_for_delivery" && trackingUrl
      ? trackButtonText
      : kind === "received" && id
        ? reviewButtonText
        : "";
  const ctaUrl =
    kind === "out_for_delivery" && trackingUrl
      ? trackingUrl
      : kind === "received" && id
        ? buildOrderTrackUrl(id)
        : "";

  // Refund-status banner (different copy per refund state).
  const refundBanner =
    kind === "refund_requested"
      ? {
          tone: "warn" as const,
          eyebrow: "Refund initiated",
          body: `Refund of ${refundAmount} is in progress.`,
        }
      : kind === "refund_succeeded"
        ? {
            tone: "success" as const,
            eyebrow: "Refund completed",
            body: `${refundAmount} has been credited back.`,
          }
        : kind === "refund_failed"
          ? {
              tone: "danger" as const,
              eyebrow: "Refund failed",
              body: `${refundAmount}${failureMessage ? ` — ${failureMessage.replace(/^: /, "")}` : ""}`,
            }
          : null;

  const refundColor =
    refundBanner?.tone === "success"
      ? palette.light.success
      : refundBanner?.tone === "warn"
        ? palette.light.warn
        : refundBanner?.tone === "danger"
          ? palette.light.danger
          : "";

  return (
    <BaseEmail
      config={cfg}
      preview={subject || heading || `Order ${id}`}
      logoSlot="order-logo"
      bannerSlot="order-banner"
    >
      <Heading
        as="h1"
        className="email-text"
        style={{
          margin: "0 0 8px",
          fontFamily: DISPLAY_FONT_STACK,
          fontWeight: 500,
          fontSize: "26px",
          lineHeight: 1.25,
          letterSpacing: "0.01em",
          color: primary,
        }}
      >
        {heading}
      </Heading>

      <Text
        className="email-muted"
        style={{
          margin: "0 0 20px",
          fontSize: "12px",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: accent,
        }}
      >
        Order {id}
      </Text>

      {paragraphs.map((p, idx) => (
        <Text
          key={idx}
          className="email-text"
          style={{
            margin: idx === 0 ? "0 0 14px" : "0 0 14px",
            fontSize: "15px",
            lineHeight: 1.65,
            color: primary,
            fontFamily: bodyFont,
          }}
        >
          {p.split(/\n/).map((line, i, arr) => (
            <React.Fragment key={i}>
              {line}
              {i < arr.length - 1 ? <br /> : null}
            </React.Fragment>
          ))}
        </Text>
      ))}

      <StatusProgress kind={kind} primary={primary} accent={accent} />
      {/* `accent` retained on StatusProgress signature for future use; the
          active pill always uses the brand gold. */}

      {(courier || trackingNumber) && (
        <Text
          className="email-muted"
          style={{
            margin: "0 0 12px",
            fontSize: "13px",
            color: accent,
          }}
        >
          {courier && (
            <>
              Shipped via{" "}
              <strong style={{ color: primary, fontWeight: 600 }}>
                {courier}
              </strong>
            </>
          )}
          {courier && trackingNumber ? " — " : ""}
          {trackingNumber && (
            <>
              tracking{" "}
              <code
                style={{
                  background: palette.light.softBg,
                  padding: "2px 6px",
                  borderRadius: "3px",
                  fontFamily: "monospace",
                  fontSize: "12px",
                  color: primary,
                }}
              >
                {trackingNumber}
              </code>
            </>
          )}
        </Text>
      )}

      <Divider style={cfg.dividerStyle} accent={palette.light.accent} />

      <ItemTable items={order.items || []} primary={primary} accent={accent} />

      <OrderTotals order={order} primary={primary} accent={accent} />

      {refundBanner && (
        <Section
          className="email-soft-bg"
          style={{
            margin: "20px 0 8px",
            padding: "14px 16px",
            background: palette.light.softBg,
            border: `1px solid ${refundColor || palette.light.cardBorder}`,
            borderLeft: `4px solid ${refundColor || palette.light.cardBorder}`,
            borderRadius: "6px",
          }}
        >
          <Text
            style={{
              margin: 0,
              fontSize: "11px",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: refundColor || accent,
              fontWeight: 600,
            }}
          >
            {refundBanner.eyebrow}
          </Text>
          <Text
            className="email-text"
            style={{
              margin: "4px 0 0",
              fontSize: "13px",
              color: primary,
              lineHeight: 1.5,
            }}
          >
            {refundBanner.body}
          </Text>
        </Section>
      )}

      {ctaLabel && ctaUrl && (
        <Section style={{ margin: "24px 0 8px" }}>
          <ActionButton
            label={ctaLabel}
            url={ctaUrl}
            primary={primary}
            style={cfg.buttonStyle}
          />
        </Section>
      )}

      <Text
        className="email-muted"
        style={{
          margin: "28px 0 0",
          fontSize: "12px",
          color: accent,
          lineHeight: 1.6,
        }}
      >
        Questions? Just reply to this email and we'll get back to you.
      </Text>
    </BaseEmail>
  );
}

/**
 * Lightweight subject/text accessor — exported so the host renderer can
 * resolve subject + plaintext fallback without going through React.
 */
export const buildOrderEmailMeta = (
  props: OrderEmailProps,
): { subject: string; heading: string; text: string } => {
  const { kind, order, extra, config } = props;
  const cfg = config || {};
  const id = String(order.id || "");
  const fullName =
    String(order.orderInfo?.fullName || "").trim() || "Collector";
  const firstName = fullName.split(/\s+/)[0] || fullName;
  const itemCount = Array.isArray(order.items) ? order.items.length : 0;
  const itemPlural = itemCount > 1 ? "s" : "";
  const totalFormatted = formatPHP(order.total);
  const trackingUrl = extra?.trackingUrl || "";
  const trackingNumber = extra?.trackingNumber || "";
  const courier = extra?.courier || "";
  const refundAmount = formatPHP(extra?.refundAmount ?? 0);
  const failureMessage = extra?.refundFailureMessage
    ? `: ${extra.refundFailureMessage}`
    : "";
  const vars = {
    name: fullName,
    firstName,
    orderId: id,
    total: totalFormatted,
    itemCount: String(itemCount),
    itemPlural,
    courier,
    trackingNumber,
    refundAmount,
    failureMessage,
  };
  const copy = resolveKindCopy(cfg, kind);
  const subject = substituteTemplate(copy.subject, vars);
  const heading = substituteTemplate(copy.heading, vars);
  const introBody = substituteTemplate(copy.intro, vars);
  const text = `${heading}\n\n${introBody}\n\nOrder ${id}\nTotal ${totalFormatted}${
    courier ? `\nCourier: ${courier}` : ""
  }${trackingNumber ? `\nTracking: ${trackingNumber}` : ""}${
    trackingUrl ? `\nTrack: ${trackingUrl}` : ""
  }\n`;
  return { subject, heading, text };
};
