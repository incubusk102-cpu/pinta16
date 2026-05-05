import { Heading, Link, Section, Text } from "@react-email/components";
import * as React from "react";
import ActionButton from "../components/ActionButton";
import BaseEmail from "../components/BaseEmail";
import Divider from "../components/Divider";
import ItemTable from "../components/ItemTable";
import OrderTotals from "../components/OrderTotals";
import {
  DISPLAY_FONT_STACK,
  palette,
  resolveBodyFont,
  safeColor,
} from "../lib/styles";
import { buildAdminOrderUrl, formatPHP } from "../lib/template-vars";
import type { OrderEmailConfig, OrderRecord } from "../types";

export interface NewOrderAdminAlertProps {
  order: OrderRecord;
  config?: OrderEmailConfig | null;
}

/**
 * Admin-side alert sent when a new order lands. Now uses the same
 * BaseEmail chrome as the customer-facing order emails, so the alert
 * and the customer copy that arrive seconds apart look like part of
 * the same conversation.
 */
export default function NewOrderAdminAlert({
  order,
  config,
}: NewOrderAdminAlertProps) {
  const cfg = config || {};
  const primary = safeColor(cfg.primaryColor, palette.light.bodyText);
  const accent = safeColor(cfg.accentColor, palette.light.mutedText);
  const bodyFont = resolveBodyFont(cfg.bodyFont);

  const id = String(order.id || "");
  const customer =
    String(order.orderInfo?.fullName || "").trim() || "Anonymous guest";
  const customerEmail = String(order.orderInfo?.email || "").trim();
  const customerPhone = String(order.orderInfo?.phone || "").trim();
  const itemCount = Array.isArray(order.items) ? order.items.length : 0;
  const total = formatPHP(order.total);
  const adminUrl = buildAdminOrderUrl(id);

  return (
    <BaseEmail
      config={cfg}
      preview={`New order ${id} — ${total}`}
      logoSlot="admin-alert-logo"
      bannerSlot="admin-alert-banner"
    >
      <Text
        className="email-muted"
        style={{
          margin: "0 0 8px",
          fontSize: "11px",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: accent,
          fontWeight: 600,
        }}
      >
        New order received
      </Text>
      <Heading
        as="h1"
        className="email-text"
        style={{
          margin: "0 0 6px",
          fontFamily: DISPLAY_FONT_STACK,
          fontWeight: 500,
          fontSize: "24px",
          letterSpacing: "0.01em",
          color: primary,
        }}
      >
        Order {id}
      </Heading>
      <Text
        className="email-muted"
        style={{
          margin: "0 0 18px",
          fontSize: "13px",
          color: accent,
        }}
      >
        {itemCount} item{itemCount === 1 ? "" : "s"} · {total}
      </Text>

      <Section
        className="email-soft-bg"
        style={{
          margin: "0 0 18px",
          padding: "14px 16px",
          background: palette.light.softBg,
          border: `1px solid ${palette.light.cardBorder}`,
          borderRadius: "8px",
        }}
      >
        <Text
          className="email-text"
          style={{
            margin: "0 0 4px",
            fontSize: "13px",
            color: primary,
            fontFamily: bodyFont,
          }}
        >
          <strong>Customer:</strong> {customer}
        </Text>
        {customerEmail && (
          <Text
            className="email-text"
            style={{
              margin: "0 0 4px",
              fontSize: "13px",
              color: primary,
            }}
          >
            <strong>Email:</strong>{" "}
            <Link
              href={`mailto:${customerEmail}`}
              style={{ color: primary, textDecoration: "underline" }}
            >
              {customerEmail}
            </Link>
          </Text>
        )}
        {customerPhone && (
          <Text
            className="email-text"
            style={{
              margin: 0,
              fontSize: "13px",
              color: primary,
            }}
          >
            <strong>Phone:</strong> {customerPhone}
          </Text>
        )}
      </Section>

      <Divider style={cfg.dividerStyle} accent={palette.light.accent} />

      <ItemTable items={order.items || []} primary={primary} accent={accent} />
      <OrderTotals order={order} primary={primary} accent={accent} />

      <Section style={{ margin: "20px 0 0" }}>
        <ActionButton
          label="Open in admin"
          url={adminUrl}
          primary={primary}
          style={cfg.buttonStyle}
        />
      </Section>
    </BaseEmail>
  );
}

export const buildNewOrderAdminAlertMeta = (
  props: NewOrderAdminAlertProps,
): { subject: string; text: string } => {
  const { order } = props;
  const id = String(order.id || "");
  const customer =
    String(order.orderInfo?.fullName || "").trim() || "Anonymous guest";
  const customerEmail = String(order.orderInfo?.email || "").trim();
  const customerPhone = String(order.orderInfo?.phone || "").trim();
  const itemCount = Array.isArray(order.items) ? order.items.length : 0;
  const itemPlural = itemCount === 1 ? "" : "s";
  const total = formatPHP(order.total);
  const subject = `New order ${id} — ${total}`;
  const itemLines = (order.items || [])
    .slice(0, 20)
    .map(
      (it) =>
        `- ${it.title || "Item"} × ${Number(it.quantity) || 1}: ${formatPHP(
          (Number(it.price) || 0) * (Number(it.quantity) || 1),
        )}`,
    )
    .join("\n");
  const text =
    `New order ${id}\n\n` +
    `Customer: ${customer}\n` +
    (customerEmail ? `Email: ${customerEmail}\n` : "") +
    (customerPhone ? `Phone: ${customerPhone}\n` : "") +
    `Items: ${itemCount} item${itemPlural}\n` +
    `Total: ${total}\n\n` +
    `${itemLines}\n\n` +
    `Open: ${buildAdminOrderUrl(id)}\n`;
  return { subject, text };
};
