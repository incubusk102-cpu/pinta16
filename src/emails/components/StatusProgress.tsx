import { Column, Row, Section } from "@react-email/components";
import * as React from "react";
import { palette } from "../lib/styles";
import type { OrderEmailKind } from "../types";

interface StatusProgressProps {
  /** Current status of the order. Refund states render nothing. */
  kind: OrderEmailKind;
  /** Resolved primary brand color (used to highlight the active step). */
  primary: string;
  /**
   * Resolved accent color used for muted text. Active pills always use
   * the brand gold (palette.light.accent) so the highlight reads as a
   * visual focus rather than body text.
   */
  accent: string;
}

const STEPS: { kind: OrderEmailKind; label: string; short: string }[] = [
  { kind: "confirmed", label: "Confirmed", short: "Conf." },
  { kind: "in_progress", label: "In Progress", short: "Prog." },
  { kind: "out_for_delivery", label: "Out for Delivery", short: "Ship." },
  { kind: "received", label: "Delivered", short: "Done" },
];

/**
 * A 4-step horizontal progress indicator showing where the customer's
 * order sits in the journey. Steps are rendered as connected pills
 * with the active one highlighted by the brand's accent color.
 *
 *   ●━━━●━━━○━━━○
 *  Confirmed → In Progress → Out for Delivery → Delivered
 *
 * Refund states (refund_requested / refund_succeeded / refund_failed)
 * are off the linear flow, so this component renders nothing for those
 * kinds — the refund UI is handled in the body copy block instead.
 *
 * On screens narrower than 480px the labels collapse to abbreviations
 * (`Conf. → Prog. → Ship. → Done`) so the pill still fits one line.
 */
export default function StatusProgress({ kind, primary }: StatusProgressProps) {
  // Refund states aren't part of the linear journey.
  if (kind.startsWith("refund_")) return null;

  const currentIdx = STEPS.findIndex((s) => s.kind === kind);
  if (currentIdx < 0) return null;

  // Brand gold for the active pill — visually distinct from the
  // admin-tunable accentColor (which can be re-purposed for muted text).
  const activeBg = palette.light.accent;

  return (
    <Section
      className="email-status-progress email-soft-bg"
      style={{
        background: palette.light.softBg,
        border: `1px solid ${palette.light.cardBorder}`,
        borderRadius: "10px",
        padding: "16px 12px",
        margin: "0 0 24px",
      }}
    >
      <Row style={{ width: "100%" }}>
        {STEPS.map((step, idx) => {
          const isActive = idx === currentIdx;
          const isDone = idx < currentIdx;

          let pillClass = "email-status-pill ";
          if (isActive) pillClass += "email-status-pill-active";
          else if (isDone) pillClass += "email-status-pill-done";
          else pillClass += "email-status-pill-future";

          const pillStyle: React.CSSProperties = isActive
            ? {
                background: activeBg,
                color: "#1c1c1c",
                fontWeight: 600,
                border: `1px solid ${activeBg}`,
              }
            : isDone
              ? {
                  background: palette.light.cardBorder,
                  color: primary,
                  border: `1px solid ${palette.light.cardBorder}`,
                }
              : {
                  background: "transparent",
                  color: palette.light.mutedText,
                  border: `1px solid ${palette.light.cardBorder}`,
                };
          return (
            <Column
              key={step.kind}
              style={{
                width: `${100 / STEPS.length}%`,
                textAlign: "center",
                verticalAlign: "middle",
                padding: "0 4px",
              }}
            >
              <div
                className={pillClass}
                style={{
                  ...pillStyle,
                  display: "inline-block",
                  minWidth: "0",
                  width: "100%",
                  padding: "8px 6px",
                  borderRadius: "999px",
                  fontFamily:
                    "'Inter','Helvetica Neue',Helvetica,Arial,sans-serif",
                  fontSize: "11px",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  textAlign: "center",
                  lineHeight: 1.2,
                  boxSizing: "border-box",
                }}
              >
                {step.label}
              </div>
            </Column>
          );
        })}
      </Row>
    </Section>
  );
}
