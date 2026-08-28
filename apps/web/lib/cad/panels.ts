import { createDock } from "@ladx/studio";

/**
 * The CAD workspace panels.
 *
 * Three booleans and a fixed column each, until now. That is fine until
 * somebody is drawing a long schematic on a laptop and wants the canvas: the
 * panels could be hidden from a menu but not resized, not moved, and a hidden
 * one left no trace on screen, so the way back was to remember which menu it
 * was under.
 *
 * Sides are stated per panel rather than allowed anywhere. The command line is
 * a line of text and belongs along the bottom; the sheet list and the library
 * are columns. Offering a move that produces something unusable is worse than
 * not offering the move.
 */

export type CadPanelId = "sheets" | "properties" | "library" | "command";

export const cadDock = createDock<CadPanelId>(
  [
    {
      id: "sheets",
      title: "Sheets",
      side: "left",
      size: 208,
      min: 160,
      max: 380,
      blurb: "Every sheet in this set, and the way between them.",
      sides: ["left", "right"],
    },
    {
      id: "properties",
      title: "Properties",
      side: "right",
      size: 224,
      min: 180,
      max: 400,
      blurb: "Layer, colour and geometry of whatever is selected.",
      sides: ["right", "left"],
    },
    {
      id: "library",
      title: "Library",
      side: "right",
      size: 240,
      min: 190,
      max: 420,
      blurb: "Symbols, sheet frames, drawing templates and the layer list.",
      sides: ["right", "left"],
    },
    {
      id: "command",
      title: "Command",
      side: "bottom",
      size: 96,
      min: 64,
      max: 320,
      blurb: "Type a command or a coordinate, the way a drafter works.",
    },
  ],
  "ladx.cad.layout.v1",
);
