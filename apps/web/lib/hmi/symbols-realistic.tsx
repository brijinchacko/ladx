import type { SymbolProps } from "@/lib/hmi/symbols";
import type { ReactNode } from "react";

/**
 * The realistic style.
 *
 * The same equipment as the schematic set, drawn as the object rather than as
 * the drafting symbol for it: a cylindrical tank with the light falling down
 * one side, a pump with a machined body and a shaft, a motor with cooling fins.
 *
 * Vector, not raster, and the reason matters. The commercial libraries this is
 * measured against are themselves SVG; the depth comes from gradients, not
 * from pixels. A PNG would lose on every axis here. It blurs the moment
 * somebody zooms a panel, it turns a 32-object screen from kilobytes into
 * megabytes, and it cannot be recoloured, which would break the one thing the
 * graphic is for: a pump that goes green when it runs. Tinting is why the base
 * colour is a parameter and every gradient is derived from it.
 *
 * ISA-101 asks for flat grey on process displays and it is right, which is why
 * this is a style you choose rather than the only one on offer. Realistic
 * reads well on an equipment or overview screen; the schematic set is there
 * for the mimic an operator watches all shift.
 */

/* ─────────────────────────── shading helpers ─────────────────────────── */

/**
 * Lighten or darken a hex colour.
 *
 * Everything is derived from the widget's own fill so a tinted pump shades
 * correctly rather than keeping a hardcoded steel gradient with a green wash
 * over it, which is what makes cheap 3D artwork look like a sticker.
 */
export function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = Number.parseInt(m[1] as string, 16);
  const to = amount < 0 ? 0 : 255;
  const t = Math.min(1, Math.abs(amount));
  const ch = (shift: number) => {
    const c = (n >> shift) & 0xff;
    return Math.round(c + (to - c) * t);
  };
  return `#${[ch(16), ch(8), ch(0)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

interface Ctx extends SymbolProps {
  /** Unique per rendered instance: two tanks on one screen must not share a gradient id. */
  uid: string;
}

/** A cylinder lit from the upper left, which is the whole trick. */
function cylinderGradient(id: string, base: string, vertical = false): ReactNode {
  return (
    <linearGradient
      id={id}
      x1={vertical ? "0" : "0"}
      y1={vertical ? "0" : "0"}
      x2={vertical ? "0" : "1"}
      y2={vertical ? "1" : "0"}
    >
      <stop offset="0%" stopColor={shade(base, -0.28)} />
      <stop offset="18%" stopColor={shade(base, 0.22)} />
      <stop offset="38%" stopColor={shade(base, 0.42)} />
      <stop offset="62%" stopColor={base} />
      <stop offset="88%" stopColor={shade(base, -0.3)} />
      <stop offset="100%" stopColor={shade(base, -0.42)} />
    </linearGradient>
  );
}

/** A machined-metal face: a bright band near the top, falling away below. */
function metalGradient(id: string, base: string): ReactNode {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%" stopColor={shade(base, 0.5)} />
      <stop offset="30%" stopColor={shade(base, 0.16)} />
      <stop offset="60%" stopColor={shade(base, -0.14)} />
      <stop offset="100%" stopColor={shade(base, -0.38)} />
    </linearGradient>
  );
}

/** Liquid, slightly translucent, darker at the bottom. */
function liquidGradient(id: string, base: string): ReactNode {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stopColor={shade(base, -0.2)} />
      <stop offset="30%" stopColor={shade(base, 0.18)} />
      <stop offset="70%" stopColor={base} />
      <stop offset="100%" stopColor={shade(base, -0.3)} />
    </linearGradient>
  );
}

/** The contact shadow that stops equipment floating. */
function groundShadow(cx: number, cy: number, rx: number): ReactNode {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={rx * 0.13} fill="#000" opacity="0.16" />;
}

const OUTLINE = (p: Ctx) => ({
  fill: "none",
  stroke: shade(p.stroke, -0.1),
  strokeWidth: Math.max(0.8, p.strokeWidth * 0.7),
});

/* ─────────────────────────── the drawings ─────────────────────────── */

type Draw = (p: Ctx) => ReactNode;

const REALISTIC: Record<string, Draw> = {
  /** A vertical cylindrical tank with a dished top and a level. */
  tank: (p) => {
    const g = `g-${p.uid}`;
    const l = `l-${p.uid}`;
    const clip = `c-${p.uid}`;
    const lv = Math.max(0, Math.min(1, p.level ?? 0));
    const bodyTop = 18;
    const bodyBottom = 90;
    const h = bodyBottom - bodyTop;
    const top = bodyBottom - lv * h;
    return (
      <>
        <title>Tank</title>
        <defs>
          {cylinderGradient(g, p.fill)}
          {liquidGradient(l, p.stroke)}
          <clipPath id={clip}>
            <path d={`M12 ${bodyTop} H88 V${bodyBottom} H12 Z`} />
          </clipPath>
        </defs>
        {groundShadow(50, 95, 40)}
        {/* body */}
        <path d={`M12 ${bodyTop} H88 V${bodyBottom} H12 Z`} fill={`url(#${g})`} />
        {/* liquid, clipped to the shell so a full tank does not overflow it */}
        {lv > 0 && (
          <>
            <rect
              x="12"
              y={top}
              width="76"
              height={lv * h}
              fill={`url(#${l})`}
              opacity="0.85"
              clipPath={`url(#${clip})`}
            />
            {/* the meniscus: a bright line where the surface catches the light */}
            <ellipse cx="50" cy={top} rx="38" ry="3.4" fill={shade(p.stroke, 0.45)} opacity="0.9" />
          </>
        )}
        {/* dished ends */}
        <ellipse cx="50" cy={bodyBottom} rx="38" ry="7" fill={shade(p.fill, -0.34)} />
        <ellipse cx="50" cy={bodyTop} rx="38" ry="7" fill={shade(p.fill, 0.34)} />
        <ellipse cx="50" cy={bodyTop} rx="38" ry="7" {...OUTLINE(p)} />
        {/* nozzle */}
        <rect x="45" y="6" width="10" height="10" fill={shade(p.fill, -0.1)} />
        <path d={`M12 ${bodyTop} V${bodyBottom} M88 ${bodyTop} V${bodyBottom}`} {...OUTLINE(p)} />
      </>
    );
  },

  /** Horizontal vessel, lit along its length. */
  "tank-horizontal": (p) => {
    const g = `g-${p.uid}`;
    return (
      <>
        <title>Horizontal vessel</title>
        <defs>{cylinderGradient(g, p.fill, true)}</defs>
        {groundShadow(50, 82, 42)}
        <path
          d="M18 24 H82 Q96 24 96 50 Q96 76 82 76 H18 Q4 76 4 50 Q4 24 18 24 Z"
          fill={`url(#${g})`}
        />
        <path d="M18 24 Q32 24 32 50 Q32 76 18 76" {...OUTLINE(p)} />
        <path d="M82 24 Q68 24 68 50 Q68 76 82 76" {...OUTLINE(p)} opacity="0.5" />
        {/* saddles */}
        <path d="M24 76 v8 h12 v-8 M64 76 v8 h12 v-8" fill={shade(p.fill, -0.4)} />
      </>
    );
  },

  /** Silo: a cone bottom under a lit cylinder. */
  silo: (p) => {
    const g = `g-${p.uid}`;
    const c = `c-${p.uid}`;
    return (
      <>
        <title>Silo</title>
        <defs>
          {cylinderGradient(g, p.fill)}
          <linearGradient id={c} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={shade(p.fill, -0.34)} />
            <stop offset="40%" stopColor={shade(p.fill, 0.2)} />
            <stop offset="100%" stopColor={shade(p.fill, -0.44)} />
          </linearGradient>
        </defs>
        {groundShadow(50, 96, 26)}
        <path d="M16 24 H84 V64 H16 Z" fill={`url(#${g})`} />
        <path d="M16 64 L58 92 H42 L16 64 Z M16 64 H84 L58 92 H42 Z" fill={`url(#${c})`} />
        <ellipse cx="50" cy="24" rx="34" ry="7" fill={shade(p.fill, 0.36)} />
        <path d="M50 10 v7" {...OUTLINE(p)} strokeWidth={p.strokeWidth} />
      </>
    );
  },

  /** Centrifugal pump: a volute casing, a motor stub and a base. */
  pump: (p) => {
    const g = `g-${p.uid}`;
    const m = `m-${p.uid}`;
    return (
      <>
        <title>Centrifugal pump</title>
        <defs>
          <radialGradient id={g} cx="0.34" cy="0.3" r="0.85">
            <stop offset="0%" stopColor={shade(p.fill, 0.5)} />
            <stop offset="55%" stopColor={p.fill} />
            <stop offset="100%" stopColor={shade(p.fill, -0.42)} />
          </radialGradient>
          {metalGradient(m, p.fill)}
        </defs>
        {groundShadow(50, 90, 38)}
        {/* base plate */}
        <rect x="10" y="80" width="80" height="9" rx="1.5" fill={shade(p.fill, -0.36)} />
        {/* motor stub */}
        <rect x="56" y="40" width="34" height="34" rx="4" fill={`url(#${m})`} />
        {[62, 68, 74, 80].map((x) => (
          <line
            key={x}
            x1={x}
            y1="42"
            x2={x}
            y2="72"
            stroke={shade(p.fill, -0.3)}
            strokeWidth="1.4"
          />
        ))}
        {/* volute */}
        <circle cx="38" cy="52" r="28" fill={`url(#${g})`} />
        <circle cx="38" cy="52" r="28" {...OUTLINE(p)} />
        <circle cx="38" cy="52" r="9" fill={shade(p.fill, -0.3)} />
        <circle cx="38" cy="52" r="4" fill={shade(p.fill, 0.3)} />
        {/* discharge, up and out of the volute */}
        <rect x="30" y="14" width="16" height="12" fill={shade(p.fill, -0.12)} />
        <rect x="27" y="10" width="22" height="5" rx="1" fill={shade(p.fill, -0.34)} />
        {/* suction */}
        <rect x="4" y="45" width="8" height="15" fill={shade(p.fill, -0.24)} />
      </>
    );
  },

  /** Motor: a finned barrel with a terminal box and a shaft. */
  motor: (p) => {
    const g = `g-${p.uid}`;
    return (
      <>
        <title>Motor</title>
        <defs>{cylinderGradient(g, p.fill, true)}</defs>
        {groundShadow(50, 84, 34)}
        <rect x="14" y="26" width="66" height="50" rx="5" fill={`url(#${g})`} />
        {/* cooling fins, the thing that makes a motor read as a motor */}
        {[22, 30, 38, 46, 54, 62, 70].map((x) => (
          <line
            key={x}
            x1={x}
            y1="28"
            x2={x}
            y2="74"
            stroke={shade(p.fill, -0.26)}
            strokeWidth="1.6"
          />
        ))}
        {/* end bells */}
        <rect x="10" y="30" width="6" height="42" rx="2" fill={shade(p.fill, -0.3)} />
        <rect x="78" y="30" width="6" height="42" rx="2" fill={shade(p.fill, -0.3)} />
        {/* terminal box */}
        <rect x="36" y="14" width="24" height="13" rx="2" fill={shade(p.fill, -0.2)} />
        {/* shaft */}
        <rect x="84" y="47" width="12" height="7" rx="1" fill={shade(p.fill, 0.2)} />
        {/* feet */}
        <path d="M20 76 v8 h10 v-8 M64 76 v8 h10 v-8" fill={shade(p.fill, -0.4)} />
      </>
    );
  },

  /** Ball valve with a lever handle. */
  "valve-ball": (p) => {
    const g = `g-${p.uid}`;
    return (
      <>
        <title>Ball valve</title>
        <defs>{metalGradient(g, p.fill)}</defs>
        {/* pipe stubs */}
        <rect x="2" y="42" width="18" height="18" fill={shade(p.fill, -0.24)} />
        <rect x="80" y="42" width="18" height="18" fill={shade(p.fill, -0.24)} />
        {/* body */}
        <rect x="18" y="34" width="64" height="34" rx="6" fill={`url(#${g})`} />
        <rect x="18" y="34" width="64" height="34" rx="6" {...OUTLINE(p)} />
        {/* stem and lever */}
        <rect x="46" y="18" width="8" height="18" rx="1.5" fill={shade(p.fill, -0.3)} />
        <rect x="28" y="12" width="44" height="8" rx="4" fill={shade(p.fill, 0.24)} />
        <rect x="28" y="12" width="44" height="8" rx="4" {...OUTLINE(p)} />
      </>
    );
  },

  /** Control valve: diaphragm actuator over a globe body. */
  "valve-control": (p) => {
    const g = `g-${p.uid}`;
    const a = `a-${p.uid}`;
    return (
      <>
        <title>Control valve</title>
        <defs>
          {metalGradient(g, p.fill)}
          <linearGradient id={a} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={shade(p.fill, -0.26)} />
            <stop offset="35%" stopColor={shade(p.fill, 0.36)} />
            <stop offset="100%" stopColor={shade(p.fill, -0.34)} />
          </linearGradient>
        </defs>
        <rect x="2" y="66" width="16" height="16" fill={shade(p.fill, -0.24)} />
        <rect x="82" y="66" width="16" height="16" fill={shade(p.fill, -0.24)} />
        <rect x="16" y="60" width="68" height="28" rx="5" fill={`url(#${g})`} />
        <rect x="16" y="60" width="68" height="28" rx="5" {...OUTLINE(p)} />
        {/* yoke */}
        <path d="M42 60 v-10 M58 60 v-10" stroke={shade(p.fill, -0.3)} strokeWidth="4" />
        {/* diaphragm case: the dome that says it modulates */}
        <path d="M22 50 Q22 16 50 16 Q78 16 78 50 Z" fill={`url(#${a})`} />
        <path d="M22 50 H78" stroke={shade(p.fill, -0.34)} strokeWidth="3" />
        <rect x="46" y="6" width="8" height="11" fill={shade(p.fill, -0.24)} />
      </>
    );
  },

  /** Gate valve with a handwheel. */
  "valve-gate": (p) => {
    const g = `g-${p.uid}`;
    return (
      <>
        <title>Gate valve</title>
        <defs>{metalGradient(g, p.fill)}</defs>
        <rect x="2" y="46" width="18" height="16" fill={shade(p.fill, -0.24)} />
        <rect x="80" y="46" width="18" height="16" fill={shade(p.fill, -0.24)} />
        <rect x="18" y="40" width="64" height="28" rx="4" fill={`url(#${g})`} />
        <rect x="18" y="40" width="64" height="28" rx="4" {...OUTLINE(p)} />
        <rect x="46" y="18" width="8" height="24" fill={shade(p.fill, -0.3)} />
        {/* handwheel, seen edge on */}
        <ellipse cx="50" cy="16" rx="24" ry="6" fill={shade(p.fill, 0.28)} />
        <ellipse cx="50" cy="16" rx="24" ry="6" {...OUTLINE(p)} />
        <ellipse cx="50" cy="16" rx="9" ry="2.4" fill={shade(p.fill, -0.3)} />
      </>
    );
  },

  /** Belt conveyor on legs, with pulleys at each end. */
  conveyor: (p) => {
    const g = `g-${p.uid}`;
    return (
      <>
        <title>Belt conveyor</title>
        <defs>{cylinderGradient(g, p.fill, true)}</defs>
        {groundShadow(50, 92, 44)}
        {/* belt */}
        <path d="M16 36 H84 A14 14 0 0 1 84 64 H16 A14 14 0 0 1 16 36 Z" fill={`url(#${g})`} />
        <path d="M16 36 H84" stroke={shade(p.fill, 0.4)} strokeWidth="2.4" />
        {/* pulleys */}
        <circle cx="16" cy="50" r="13" fill={shade(p.fill, -0.28)} />
        <circle cx="84" cy="50" r="13" fill={shade(p.fill, -0.28)} />
        <circle cx="16" cy="50" r="4" fill={shade(p.fill, 0.3)} />
        <circle cx="84" cy="50" r="4" fill={shade(p.fill, 0.3)} />
        {/* legs */}
        <path d="M28 62 v28 M72 62 v28" stroke={shade(p.fill, -0.4)} strokeWidth="4" />
      </>
    );
  },

  /** Shell and tube exchanger with flanged heads. */
  "heat-exchanger": (p) => {
    const g = `g-${p.uid}`;
    return (
      <>
        <title>Heat exchanger</title>
        <defs>{cylinderGradient(g, p.fill, true)}</defs>
        {groundShadow(50, 80, 40)}
        <rect x="12" y="30" width="76" height="40" rx="6" fill={`url(#${g})`} />
        <rect x="8" y="26" width="9" height="48" rx="2" fill={shade(p.fill, -0.3)} />
        <rect x="83" y="26" width="9" height="48" rx="2" fill={shade(p.fill, -0.3)} />
        <path
          d="M26 50 h48"
          stroke={shade(p.fill, -0.24)}
          strokeWidth="1.4"
          strokeDasharray="4 4"
        />
        <rect x="30" y="20" width="10" height="11" fill={shade(p.fill, -0.2)} />
        <rect x="60" y="69" width="10" height="11" fill={shade(p.fill, -0.2)} />
      </>
    );
  },

  /** Agitated reactor: a dished vessel with a drive on top. */
  reactor: (p) => {
    const g = `g-${p.uid}`;
    return (
      <>
        <title>Reactor</title>
        <defs>{cylinderGradient(g, p.fill)}</defs>
        {groundShadow(50, 94, 32)}
        <path d="M18 30 H82 V74 Q82 92 50 92 Q18 92 18 74 Z" fill={`url(#${g})`} />
        <ellipse cx="50" cy="30" rx="32" ry="7" fill={shade(p.fill, 0.34)} />
        <ellipse cx="50" cy="30" rx="32" ry="7" {...OUTLINE(p)} />
        {/* drive */}
        <rect x="40" y="8" width="20" height="14" rx="2" fill={shade(p.fill, -0.2)} />
        <rect x="46" y="22" width="8" height="8" fill={shade(p.fill, -0.3)} />
        {/* shaft and impeller, seen through the vessel */}
        <line x1="50" y1="30" x2="50" y2="72" stroke={shade(p.fill, -0.3)} strokeWidth="3" />
        <path d="M34 72 h32" stroke={shade(p.fill, -0.3)} strokeWidth="4" />
      </>
    );
  },

  /** Fan in a ring housing. */
  fan: (p) => {
    const g = `g-${p.uid}`;
    return (
      <>
        <title>Fan</title>
        <defs>
          <radialGradient id={g} cx="0.35" cy="0.3" r="0.8">
            <stop offset="0%" stopColor={shade(p.fill, 0.45)} />
            <stop offset="70%" stopColor={p.fill} />
            <stop offset="100%" stopColor={shade(p.fill, -0.4)} />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="40" fill={shade(p.fill, -0.3)} />
        <circle cx="50" cy="50" r="34" fill={`url(#${g})`} />
        {[0, 72, 144, 216, 288].map((a) => (
          <path
            key={a}
            d="M50 50 Q64 32 50 16 Q44 34 50 50"
            fill={shade(p.fill, -0.16)}
            transform={`rotate(${a} 50 50)`}
          />
        ))}
        <circle cx="50" cy="50" r="8" fill={shade(p.fill, -0.34)} />
        <circle cx="50" cy="50" r="3" fill={shade(p.fill, 0.4)} />
      </>
    );
  },

  /** Hopper: a lit box over a chute. */
  hopper: (p) => {
    const g = `g-${p.uid}`;
    return (
      <>
        <title>Hopper</title>
        <defs>{cylinderGradient(g, p.fill)}</defs>
        {groundShadow(50, 96, 22)}
        <path d="M8 10 H92 V50 H8 Z" fill={`url(#${g})`} />
        <path d="M8 50 H92 L58 90 H42 Z" fill={shade(p.fill, -0.2)} />
        <path d="M8 50 L42 90 H58 L8 50 Z" fill={shade(p.fill, 0.12)} />
        <rect x="42" y="90" width="16" height="6" fill={shade(p.fill, -0.4)} />
        <ellipse cx="50" cy="10" rx="42" ry="4" fill={shade(p.fill, 0.36)} />
      </>
    );
  },
};

export function hasRealistic(id: string): boolean {
  return id in REALISTIC;
}

export function drawRealistic(id: string, props: SymbolProps, uid: string): ReactNode | null {
  const fn = REALISTIC[id];
  return fn ? fn({ ...props, uid }) : null;
}

export const REALISTIC_IDS = Object.keys(REALISTIC);
