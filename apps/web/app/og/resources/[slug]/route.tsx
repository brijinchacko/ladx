import { getPost } from "@/content/posts";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Share cards, generated per article.
 *
 * Worth the effort beyond social: pages combining text, images and structured
 * data are selected for AI answers markedly more often than text alone, and a
 * real image per article satisfies that without inventing decoration.
 *
 * Satori, which renders this, supports a subset of CSS and enforces one rule
 * strictly: any element with more than one child must declare a display mode.
 * Every container below therefore sets `display` explicitly, and text always
 * sits inside its own leaf element rather than beside a sibling.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const post = getPost(slug);

  const title = post?.title ?? "LADX";
  const topic = post?.topic ?? "Automation";
  const meta = post ? `${post.topic} / ${post.minutes} min read` : "ladx.ai";

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
            textTransform: "uppercase",
          }}
        >
          {meta}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          fontSize: title.length > 58 ? 56 : 68,
          lineHeight: 1.12,
          fontWeight: 800,
          color: "#0F1A24",
          letterSpacing: -1.5,
          maxWidth: 980,
        }}
      >
        {title}
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
            ladx.ai
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

// `topic` is folded into `meta`; kept out of the tree so no element ends up
// with two text children, which Satori rejects.
export const dynamic = "force-static";
