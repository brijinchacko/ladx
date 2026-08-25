/**
 * Sanitise an imported SVG.
 *
 * This is the escape hatch for the commercial symbol libraries. Symbol Factory
 * and the others are per-machine products that cannot be bundled into an HMI
 * somebody sells, so LADX ships its own drawings and anyone who has licensed
 * one of those sets exports SVG and brings it in here. That keeps the licence
 * where it belongs.
 *
 * It also means arbitrary files arrive by email and get pasted into a screen,
 * and SVG is not an image format: it is a document format that supports
 * script, external references and embedded HTML. So this parses rather than
 * pattern-matches. Stripping tags with regular expressions is how sanitisers
 * get bypassed, because the attacker writes the markup and gets to choose
 * exactly which shape the pattern misses.
 *
 * The policy is an allow-list. Anything not named here is dropped, which fails
 * closed: a new SVG feature is missing artwork, not a new hole.
 */

const ALLOWED_TAGS = new Set([
  "svg",
  "g",
  "defs",
  "title",
  "desc",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "clippath",
  "mask",
  "lineargradient",
  "radialgradient",
  "stop",
  "pattern",
  "use",
  "symbol",
  "marker",
]);

/**
 * Attributes worth keeping.
 *
 * No `href` of any kind: `use` referencing an external document is a request
 * to a server, and `href="javascript:"` is the oldest trick there is. A
 * drawing that needs an external reference is a drawing that phones home.
 */
const ALLOWED_ATTRS = new Set([
  "d",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-miterlimit",
  "fill-rule",
  "fill-opacity",
  "stroke-opacity",
  "opacity",
  "transform",
  "viewbox",
  "preserveaspectratio",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "width",
  "height",
  "points",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientunits",
  "gradienttransform",
  "patternunits",
  "clip-path",
  "clip-rule",
  "mask",
  "font-size",
  "font-family",
  "font-weight",
  "text-anchor",
  "dominant-baseline",
  "id",
  "class",
  "style",
  "vector-effect",
  "paint-order",
  "letter-spacing",
]);

/** Anything that can fetch or execute from inside a style declaration. */
const STYLE_BANNED = /(expression|url\s*\(|@import|javascript:|behaviou?r\s*:)/i;

export interface SvgImportResult {
  svg: string | null;
  error: string | null;
  /** What was removed, so the person can see their drawing was altered. */
  removed: string[];
}

const MAX_BYTES = 200_000;
const MAX_NODES = 4000;

export function sanitiseSvg(source: string): SvgImportResult {
  const removed: string[] = [];

  if (source.length > MAX_BYTES) {
    return {
      svg: null,
      error: "That SVG is over 200 kB. Simplify it in your drawing tool first.",
      removed,
    };
  }
  if (typeof DOMParser === "undefined") {
    return { svg: null, error: "SVG import needs a browser.", removed };
  }

  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  if (doc.querySelector("parsererror")) {
    return { svg: null, error: "That file is not valid SVG.", removed };
  }
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg") {
    return { svg: null, error: "That file does not contain an SVG.", removed };
  }

  let nodes = 0;
  const walk = (el: Element): void => {
    if (++nodes > MAX_NODES) return;
    // Copy the list first: removing children while iterating skips siblings,
    // which is exactly how a sanitiser leaves something behind.
    for (const child of [...el.children]) {
      const tag = child.nodeName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        removed.push(`<${tag}>`);
        child.remove();
        continue;
      }
      for (const attr of [...child.attributes]) {
        const name = attr.name.toLowerCase();
        if (!ALLOWED_ATTRS.has(name)) {
          removed.push(`${tag}[${attr.name}]`);
          child.removeAttribute(attr.name);
          continue;
        }
        if (name === "style" && STYLE_BANNED.test(attr.value)) {
          removed.push(`${tag}[style]`);
          child.removeAttribute(attr.name);
        }
      }
      walk(child);
    }
  };

  for (const attr of [...root.attributes]) {
    const name = attr.name.toLowerCase();
    if (!ALLOWED_ATTRS.has(name) && name !== "xmlns") {
      removed.push(`svg[${attr.name}]`);
      root.removeAttribute(attr.name);
    }
  }
  walk(root);

  if (nodes > MAX_NODES) {
    return {
      svg: null,
      error: `That SVG has more than ${MAX_NODES} elements. Simplify it first.`,
      removed,
    };
  }

  return {
    svg: new XMLSerializer().serializeToString(root),
    error: null,
    removed: [...new Set(removed)],
  };
}

/**
 * Force an imported drawing to fill the box it was given.
 *
 * Drawing tools export a fixed width and height, so without this an imported
 * symbol ignores the size it has on the panel and sits at whatever Illustrator
 * happened to write.
 */
export function fitSvg(svg: string, w: number, h: number): string {
  return svg.replace(/<svg([^>]*)>/i, (_m, attrs: string) => {
    const cleaned = attrs.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi, "");
    const hasViewBox = /viewBox\s*=/i.test(cleaned);
    return `<svg${cleaned} width="${w}" height="${h}"${
      hasViewBox ? "" : ` viewBox="0 0 ${w} ${h}"`
    } preserveAspectRatio="none">`;
  });
}
