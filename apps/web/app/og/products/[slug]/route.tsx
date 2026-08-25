import { PRODUCTS, getProduct } from "@/content/products";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
const size = { width: 1200, height: 630 };

/**
 * Share cards, generated per product.
 *
 * Every product page previously shared the same wordmark, so ten links to ten
 * different tools all previewed identically. A card that does not say which
 * tool it is is a card that stops a link being clicked, and the preview is
 * most of what a link is in a chat window.
 *
 * The card carries the tagline rather than the summary. Somebody looking at a
 * preview has about two seconds and one line of attention, and the tagline is
 * the sentence written for exactly that.
 *
 * Satori renders this and supports a subset of CSS, enforcing one rule
 * strictly: any element with more than one child must declare a display mode.
 * Every container below sets `display`, and text always sits in its own leaf.
 */
export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const product = getProduct(slug);

  const name = product?.name ?? "LADX";
  const tagline = product?.tagline ?? "The AI workbench for automation engineers";
  const group = product?.group ?? "";
  const eyebrow =
    group === "logic"
      ? "WRITE THE LOGIC"
      : group === "panel"
        ? "DRAW IT AND PROVE IT"
        : group === "project"
          ? "SHIP THE PROJECT"
          : "LADX";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#FFFFFF",
        padding: 72,
        fontFamily: "sans-serif",
        backgroundImage:
          "linear-gradient(to right, rgba(15,26,36,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,26,36,0.05) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ display: "flex", width: 18, height: 18, background: "#35B6BA" }} />
        <div
          style={{
            display: "flex",
            marginLeft: 16,
            fontSize: 22,
            letterSpacing: 4,
            color: "#1E8C84",
            fontWeight: 700,
          }}
        >
          {eyebrow}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            fontSize: 104,
            lineHeight: 1,
            fontWeight: 800,
            color: "#0F1A24",
            letterSpacing: -3,
          }}
        >
          {name}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 22,
            fontSize: tagline.length > 46 ? 34 : 40,
            lineHeight: 1.2,
            fontWeight: 500,
            color: "#40525C",
            maxWidth: 900,
          }}
        >
          {tagline}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <div
            style={{
              display: "flex",
              fontSize: 44,
              fontWeight: 800,
              color: "#0F1A24",
              letterSpacing: 4,
            }}
          >
            LAD
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 44,
              fontWeight: 800,
              color: "#35B6BA",
              letterSpacing: 4,
            }}
          >
            X
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#8CA0A8", marginLeft: 22 }}>
            ladx.ai/products
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{ display: "flex", width: 4, height: 56, background: "#0F1A24", opacity: 0.4 }}
          />
          <div style={{ display: "flex", width: 46, height: 3, background: "#35B6BA" }} />
          <div style={{ display: "flex", width: 4, height: 34, background: "#0F1A24" }} />
          <div style={{ display: "flex", width: 18, height: 3, background: "#35B6BA" }} />
          <div style={{ display: "flex", width: 4, height: 34, background: "#0F1A24" }} />
          <div style={{ display: "flex", width: 46, height: 3, background: "#35B6BA" }} />
          <div
            style={{ display: "flex", width: 4, height: 56, background: "#0F1A24", opacity: 0.4 }}
          />
        </div>
      </div>
    </div>,
    size,
  );
}

export const dynamic = "force-static";
