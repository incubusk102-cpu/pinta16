import { Column, Row, Section } from "@react-email/components";
import * as React from "react";
import { palette } from "../lib/styles";
import { formatPHP } from "../lib/template-vars";
import type { OrderRecord } from "../types";

interface OrderTotalsProps {
  order: OrderRecord;
  primary: string;
  accent: string;
}

const Line: React.FC<{
  label: string;
  value: string;
  emphasis?: boolean;
  primary: string;
  accent: string;
}> = ({ label, value, emphasis, primary, accent }) => (
  <Row
    style={
      emphasis
        ? {
            borderTop: `1px solid ${palette.light.cardBorder}`,
          }
        : {}
    }
  >
    <Column
      className="email-muted"
      style={{
        padding: emphasis ? "10px 0 0" : "4px 0",
        color: emphasis ? primary : accent,
        fontSize: emphasis ? "14px" : "13px",
        fontWeight: emphasis ? 600 : 400,
        textAlign: "left",
      }}
    >
      {label}
    </Column>
    <Column
      className="email-text"
      style={{
        padding: emphasis ? "10px 0 0" : "4px 0",
        color: primary,
        fontSize: emphasis ? "14px" : "13px",
        fontWeight: emphasis ? 600 : 400,
        textAlign: "right",
        whiteSpace: "nowrap",
      }}
    >
      {value}
    </Column>
  </Row>
);

/**
 * Subtotal / shipping / discount / total breakdown. Mirrors the totals
 * block from the order admin page so customers see the same numbers
 * they'd see if they opened the order on the site.
 */
export default function OrderTotals({
  order,
  primary,
  accent,
}: OrderTotalsProps) {
  const subtotal = Number(order.subtotal) || 0;
  const shipping = Number(order.shippingFee) || 0;
  const discount = Number(order.discount) || 0;
  const total = Number(order.total) || subtotal + shipping - discount;

  return (
    <Section style={{ margin: "16px 0 8px" }}>
      <Line
        label="Subtotal"
        value={formatPHP(subtotal)}
        primary={primary}
        accent={accent}
      />
      {shipping > 0 ? (
        <Line
          label="Shipping"
          value={formatPHP(shipping)}
          primary={primary}
          accent={accent}
        />
      ) : null}
      {discount > 0 ? (
        <Line
          label={
            order.voucherCode ? `Discount (${order.voucherCode})` : "Discount"
          }
          value={`- ${formatPHP(discount)}`}
          primary={primary}
          accent={accent}
        />
      ) : null}
      <Line
        label="Total"
        value={formatPHP(total)}
        emphasis
        primary={primary}
        accent={accent}
      />
    </Section>
  );
}
