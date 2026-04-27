import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import GalleryNav from "@/components/GalleryNav";
import {
  POLICY_SLUGS,
  type PolicySlug,
  usePolicies,
} from "@/contexts/PoliciesContext";
import { useLocale } from "@/contexts/LocaleContext";

export const Route = createFileRoute("/policy/$slug")({
  component: PolicyPage,
});

const isPolicySlug = (s: string): s is PolicySlug =>
  (POLICY_SLUGS as readonly string[]).includes(s);

// Lightweight markdown renderer — supports headings, paragraphs, lists,
// inline links, **bold**, *italic*, and `code`. Avoids pulling in a full
// markdown library for what is essentially long-form static text.
const renderInline = (text: string) => {
  const parts: (string | { type: "link"; href: string; label: string })[] = [];
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ type: "link", label: m[1], href: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));

  return parts.map((p, i) => {
    if (typeof p !== "string") {
      return (
        <a
          key={i}
          href={p.href}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          {p.label}
        </a>
      );
    }
    // bold / italic / code (mutually exclusive simple pass)
    const tokens: { type: "text" | "bold" | "italic" | "code"; v: string }[] =
      [];
    const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
    let lastIdx = 0;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(p)) !== null) {
      if (mm.index > lastIdx)
        tokens.push({ type: "text", v: p.slice(lastIdx, mm.index) });
      const t = mm[0];
      if (t.startsWith("**")) tokens.push({ type: "bold", v: t.slice(2, -2) });
      else if (t.startsWith("`"))
        tokens.push({ type: "code", v: t.slice(1, -1) });
      else tokens.push({ type: "italic", v: t.slice(1, -1) });
      lastIdx = mm.index + t.length;
    }
    if (lastIdx < p.length) tokens.push({ type: "text", v: p.slice(lastIdx) });

    return tokens.map((tok, j) => {
      if (tok.type === "bold")
        return (
          <strong key={`${i}-${j}`} className="font-semibold text-foreground">
            {tok.v}
          </strong>
        );
      if (tok.type === "italic")
        return (
          <em key={`${i}-${j}`} className="italic">
            {tok.v}
          </em>
        );
      if (tok.type === "code")
        return (
          <code
            key={`${i}-${j}`}
            className="font-mono text-xs bg-muted px-1 py-0.5 rounded"
          >
            {tok.v}
          </code>
        );
      return <span key={`${i}-${j}`}>{tok.v}</span>;
    });
  });
};

const renderMarkdown = (md: string) => {
  const lines = md.split("\n");
  const out: React.ReactNode[] = [];
  let listBuf: string[] = [];
  let paraBuf: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listBuf.length) {
      out.push(
        <ul
          key={key++}
          className="list-disc list-outside pl-6 space-y-1.5 text-foreground/80 leading-relaxed"
        >
          {listBuf.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      listBuf = [];
    }
  };
  const flushPara = () => {
    if (paraBuf.length) {
      out.push(
        <p key={key++} className="text-foreground/80 leading-relaxed">
          {renderInline(paraBuf.join(" "))}
        </p>,
      );
      paraBuf = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushList();
      flushPara();
      continue;
    }
    if (line.startsWith("# ")) {
      flushList();
      flushPara();
      out.push(
        <h1
          key={key++}
          className="font-display text-3xl md:text-4xl text-foreground"
        >
          {line.slice(2)}
        </h1>,
      );
      continue;
    }
    if (line.startsWith("## ")) {
      flushList();
      flushPara();
      out.push(
        <h2
          key={key++}
          className="font-display text-xl md:text-2xl text-foreground mt-4"
        >
          {line.slice(3)}
        </h2>,
      );
      continue;
    }
    if (line.startsWith("### ")) {
      flushList();
      flushPara();
      out.push(
        <h3 key={key++} className="font-display text-lg text-foreground mt-3">
          {line.slice(4)}
        </h3>,
      );
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      flushPara();
      listBuf.push(line.slice(2));
      continue;
    }
    // Indented continuation of the previous bullet (e.g. "  more text").
    if (listBuf.length && (raw.startsWith("  ") || raw.startsWith("\t"))) {
      listBuf[listBuf.length - 1] += " " + line.trim();
      continue;
    }
    flushList();
    paraBuf.push(line);
  }
  flushList();
  flushPara();
  return out;
};

function PolicyPage() {
  const { slug } = Route.useParams();
  const { policies, loading } = usePolicies();
  const { t } = useLocale();

  if (!isPolicySlug(slug)) {
    return (
      <div className="min-h-screen bg-background pt-32 px-4 sm:px-6 md:px-12">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="font-display text-3xl text-foreground mb-3">
            Policy not found
          </h1>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to home
          </Link>
        </div>
      </div>
    );
  }

  const policy = policies[slug];
  const updated = policy?.updatedAt
    ? new Date(policy.updatedAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="min-h-screen bg-background pt-24 pb-16">
      <GalleryNav />
      <article className="max-w-3xl mx-auto px-4 sm:px-6 md:px-12 mt-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Pintaterra
        </Link>
        {loading && !policy?.body ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4">
            {renderMarkdown(policy?.body || "")}
            {updated && (
              <p className="text-xs text-muted-foreground pt-6 border-t border-border/30 mt-8">
                {t("footer.lastUpdated").replace("{date}", updated)}
              </p>
            )}
          </div>
        )}
      </article>
    </div>
  );
}
