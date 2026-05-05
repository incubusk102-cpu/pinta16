import { Column, Img, Row, Section, Text } from "@react-email/components";
import * as React from "react";
import { palette } from "../lib/styles";
import { formatPHP, isSafeImageUrl } from "../lib/template-vars";
import type { OrderItem } from "../types";

interface ItemTableProps {
  items: OrderItem[];
  primary: string;
  accent: string;
}

/**
 * Editorial item list — thumbnails on the left, title + qty in the
 * middle, line total on the right. Each row collapses to a single
 * column on screens narrower than 480px (mobile media-query in
 * BaseEmail's <Head>).
 */
export default function ItemTable({ items, primary, accent }: ItemTableProps) {
  if (!items || items.length === 0) return null;

  return (
    <Section
      style={{
        margin: "20px 0 16px",
        borderTop: `1px solid ${palette.light.cardBorder}`,
        borderBottom: `1px solid ${palette.light.cardBorder}`,
      }}
    >
      {items.map((item, idx) => {
        const qty = Number(item.quantity) || 1;
        const price = Number(item.price) || 0;
        const lineTotal = price * qty;
        const showThumb = isSafeImageUrl(item.image);

        return (
          <Row
            key={item.id || `${idx}`}
            style={{
              borderTop: idx > 0 ? `1px solid ${palette.light.cardBorder}` : 0,
            }}
          >
            <Column
              className="email-thumbnail-cell"
              style={{
                width: "72px",
                padding: "12px 12px 12px 0",
                verticalAlign: "middle",
              }}
            >
              {showThumb ? (
                <Img
                  src={item.image as string}
                  alt={item.title || "Item"}
                  className="email-thumbnail"
                  style={{
                    width: "60px",
                    height: "60px",
                    borderRadius: "4px",
                    objectFit: "cover",
                    background: palette.light.softBg,
                    border: `1px solid ${palette.light.cardBorder}`,
                    display: "block",
                  }}
                />
              ) : (
                <div
                  className="email-thumbnail email-soft-bg"
                  style={{
                    width: "60px",
                    height: "60px",
                    borderRadius: "4px",
                    background: palette.light.softBg,
                    border: `1px solid ${palette.light.cardBorder}`,
                  }}
                />
              )}
            </Column>
            <Column
              className="email-item-cell"
              style={{
                padding: "12px 8px",
                verticalAlign: "middle",
                fontSize: "14px",
                color: primary,
              }}
            >
              <Text
                className="email-text"
                style={{
                  margin: 0,
                  fontWeight: 500,
                  fontSize: "14px",
                  lineHeight: 1.4,
                  color: primary,
                }}
              >
                {item.title || "Item"}
              </Text>
              <Text
                className="email-muted"
                style={{
                  margin: "2px 0 0",
                  fontSize: "12px",
                  color: accent,
                }}
              >
                {qty > 1 ? `${formatPHP(price)} × ${qty}` : formatPHP(price)}
              </Text>
            </Column>
            <Column
              className="email-item-price-cell email-text"
              style={{
                padding: "12px 0 12px 12px",
                textAlign: "right",
                verticalAlign: "middle",
                fontSize: "14px",
                fontWeight: 500,
                color: primary,
                whiteSpace: "nowrap",
              }}
            >
              {formatPHP(lineTotal)}
            </Column>
          </Row>
        );
      })}
    </Section>
  );
}
