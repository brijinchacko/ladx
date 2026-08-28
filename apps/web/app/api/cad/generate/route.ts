// POST /api/cad/generate
//
// A description in, drawing entities out. Nothing is saved: the entities come
// back to the editor, which adds them to the current drawing as an ordinary
// edit that undo will take back out. That is deliberate. A model drawing
// straight into a controlled document with no step in between is not a feature.

import { getApiUser } from "@/lib/auth/server";
import { SYMBOLS } from "@/lib/cad/symbols";
import type { Entity } from "@/lib/cad/types";
import { auditInBackground } from "@/lib/db/audit";
import { complete, firstJsonObject } from "@/lib/inference/complete";
import { ProviderError } from "@/lib/providers";
import { NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 120;

const schema = z.object({
  prompt: z.string().trim().min(3).max(4000),
  // Chosen in the assistant, where the work happens. Optional: absent
  // means the saved default, or whatever the free tier has healthy.
  model: z.string().trim().max(200).nullish(),
  /** Layers on the sheet, so it draws onto ones that exist. */
  layers: z.array(z.string().max(64)).max(40).default([]),
  /** What is already there, summarised, so it can place work beside it. */
  context: z.string().max(4000).optional(),
});

/** The shape the model is asked for, and the only shape accepted back. */
const entitySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("line"),
    layer: z.string().max(64),
    a: z.object({ x: z.number(), y: z.number() }),
    b: z.object({ x: z.number(), y: z.number() }),
  }),
  z.object({
    type: z.literal("rect"),
    layer: z.string().max(64),
    a: z.object({ x: z.number(), y: z.number() }),
    b: z.object({ x: z.number(), y: z.number() }),
  }),
  z.object({
    type: z.literal("circle"),
    layer: z.string().max(64),
    c: z.object({ x: z.number(), y: z.number() }),
    r: z.number().positive(),
  }),
  z.object({
    type: z.literal("arc"),
    layer: z.string().max(64),
    c: z.object({ x: z.number(), y: z.number() }),
    r: z.number().positive(),
    start: z.number(),
    end: z.number(),
  }),
  z.object({
    type: z.literal("ellipse"),
    layer: z.string().max(64),
    c: z.object({ x: z.number(), y: z.number() }),
    rx: z.number().positive(),
    ry: z.number().positive(),
  }),
  z.object({
    type: z.literal("polyline"),
    layer: z.string().max(64),
    points: z
      .array(z.object({ x: z.number(), y: z.number() }))
      .min(2)
      .max(400),
    closed: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("text"),
    layer: z.string().max(64),
    at: z.object({ x: z.number(), y: z.number() }),
    text: z.string().max(400),
    height: z.number().positive().max(200).default(3),
  }),
  z.object({
    type: z.literal("point"),
    layer: z.string().max(64),
    at: z.object({ x: z.number(), y: z.number() }),
  }),
  /** A symbol from the library, placed by name. Cheaper and always correct. */
  z.object({
    type: z.literal("symbol"),
    symbol: z.string().max(64),
    at: z.object({ x: z.number(), y: z.number() }),
  }),
]);

const replySchema = z.object({
  entities: z.array(entitySchema).max(600),
  /** One line saying what it drew and where, shown in the chat. */
  summary: z.string().max(600).optional(),
});

const MAX_COORD = 100_000;

export async function POST(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const layers = parsed.data.layers.length
    ? parsed.data.layers
    : ["0", "PANEL", "WIRING", "TEXT", "DIMENSIONS"];

  const system = [
    "You draw 2D engineering geometry for control and automation drawings.",
    "",
    "Coordinates are millimetres, Y is up, and the origin is bottom left. Draw at",
    "full size: a 35 mm DIN rail is 35 mm, not 35 of anything else.",
    "",
    "Reply with one JSON object and nothing else:",
    '  { "entities": [...], "summary": "one line on what you drew" }',
    "",
    "Entity shapes, and no others:",
    '  {"type":"line","layer":L,"a":{"x":,"y":},"b":{"x":,"y":}}',
    '  {"type":"rect","layer":L,"a":{...},"b":{...}}          opposite corners',
    '  {"type":"circle","layer":L,"c":{...},"r":N}',
    '  {"type":"arc","layer":L,"c":{...},"r":N,"start":deg,"end":deg}   anticlockwise',
    '  {"type":"ellipse","layer":L,"c":{...},"rx":N,"ry":N}',
    '  {"type":"polyline","layer":L,"points":[{...}],"closed":bool}',
    '  {"type":"text","layer":L,"at":{...},"text":"","height":3}',
    '  {"type":"point","layer":L,"at":{...}}',
    '  {"type":"symbol","symbol":ID,"at":{...}}',
    "",
    `Layers available: ${layers.join(", ")}. Use PANEL for enclosure and mechanical`,
    "parts, WIRING for circuits, TEXT for labels, DIMENSIONS for annotation.",
    "",
    "Prefer a symbol to drawing one yourself. These are already correct and to",
    "size, and a hand drawn contact will not match the rest of the sheet:",
    SYMBOLS.map((s) => `  ${s.id}: ${s.name}, ${s.size}`).join("\n"),
    "",
    "Rules that matter more than looking finished:",
    "- Label everything. An unlabelled symbol on a schematic is not a drawing.",
    "- Line things up. Terminals on a pitch, symbols on a common baseline.",
    "- Do not invent part numbers or ratings. Leave them for the engineer.",
    "- A normally closed contact is a different symbol from a normally open one.",
    "  On a stop button or an E-stop it must be the normally closed one.",
  ].join("\n");

  const user = [
    parsed.data.context ? `Already on this sheet: ${parsed.data.context}` : "The sheet is empty.",
    "",
    parsed.data.prompt,
  ].join("\n");

  try {
    let raw: unknown = null;
    let text = "";
    let model = "";
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 2 && !raw; attempt++) {
      try {
        const result = await complete({
          userId: auth.user.id,
          model: parsed.data.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
            ...(attempt === 0
              ? []
              : ([
                  { role: "assistant" as const, content: text.slice(0, 1500) },
                  {
                    role: "user" as const,
                    content:
                      "That was not usable JSON. Reply with the object only, starting { and ending }.",
                  },
                ] as const)),
          ],
          maxTokens: 4000,
          temperature: 0.2,
        });
        text = result.text;
        model = result.model;
        raw = firstJsonObject(text);
      } catch (err) {
        lastError = err;
      }
    }
    if (!raw && lastError) throw lastError;

    const reply = replySchema.safeParse(raw);
    if (!reply.success) {
      return NextResponse.json(
        {
          error:
            "That came back in a shape the drawing could not use. Try describing it differently, or pick a stronger model.",
        },
        { status: 502 },
      );
    }

    // Coordinates are bounded before they reach the canvas: a stray 1e12 from a
    // model would push the view transform somewhere it cannot come back from.
    const inRange = (n: number) => Number.isFinite(n) && Math.abs(n) <= MAX_COORD;
    const entities = reply.data.entities.filter((e) => {
      const pts =
        "a" in e
          ? [e.a, e.b]
          : "c" in e
            ? [e.c]
            : "at" in e
              ? [e.at]
              : "points" in e
                ? e.points
                : [];
      return pts.every((p) => inRange(p.x) && inRange(p.y));
    });

    auditInBackground({
      userId: auth.user.id,
      actor: auth.user.email,
      event: "cad_generated",
      payload: {
        model,
        entities: entities.length,
        dropped: reply.data.entities.length - entities.length,
      },
    });

    return NextResponse.json({
      entities,
      summary: reply.data.summary ?? "",
      model,
      dropped: reply.data.entities.length - entities.length,
    });
  } catch (err) {
    const message =
      err instanceof ProviderError
        ? err.userMessage
        : "Could not draw that. Try again, or draw it by hand.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export type GeneratedEntity = z.infer<typeof entitySchema>;
export type { Entity };
