import { Hr, Section } from "@react-email/components";
import type { DividerStyle } from "../types";
import { buildDividerStyle } from "../lib/styles";

interface DividerProps {
  style?: DividerStyle;
  accent: string;
  /** Override the default vertical margin. */
  margin?: string;
}

/**
 * Admin-tunable divider used between content blocks. Three styles:
 *   - "line"  → 1px hairline (default)
 *   - "brush" → 60px gold accent stub, more editorial
 *   - "none"  → renders nothing
 */
export default function Divider({ style, accent, margin }: DividerProps) {
  if (style === "none") return null;
  const css = buildDividerStyle(style, accent);
  if (style === "brush") {
    return (
      <Section style={{ textAlign: "left", margin: margin || "20px 0" }}>
        <div style={css} />
      </Section>
    );
  }
  return (
    <Hr
      className="email-divider"
      style={{
        ...css,
        ...(margin ? { margin } : {}),
      }}
    />
  );
}
