import type { Tag } from "./types";

/**
 * PLC addressing.
 *
 * A tag name says what a signal means. An address says where it physically
 * is, which terminal on the controller, which bit in which byte of memory.
 * Students who only ever see names never learn to read a wiring drawing or a
 * fault on a real panel, because the panel does not know your tag is called
 * "Start_PB"; it knows terminal I0.0.
 *
 * ── Which scheme, and why ─────────────────────────────────────────
 *
 * The simulated controller is a WARTENS VCX CPU 1212C, modelled on the
 * Siemens S7-1200 family that the course teaches on. So the addressing is
 * S7's, and it is the same on the screen as it is on the terminal strip:
 *
 *   I0.0 … I0.7      digital inputs, byte 0, bits 0-7
 *   I1.0 …           the next byte, once byte 0 is full
 *   Q0.0 … Q0.5      digital outputs, the 1212C has six
 *   M0.0 …           memory bits: internal flags, wired to nothing
 *   IW64, IW66       analog inputs, addressed by word
 *   QW80             analog output
 *   MW0, MW2 …       memory words: internal integers, two bytes apart
 *   T0, T1 …         timers
 *   C0, C1 …         counters
 *
 * The dot in I0.0 is not decoration and it is not a version number: the part
 * before it is the byte, the part after is the bit within that byte. Bits run
 * 0-7 and then the byte increments, which is why I0.7 is followed by I1.0 and
 * never by I0.8, the single most common thing to get wrong when writing
 * addresses by hand.
 *
 * Words step by two because a word is two bytes: MW0 occupies bytes 0 and 1,
 * so the next free word is MW2. MW1 would overlap it.
 */

export type AddressArea = "I" | "Q" | "M" | "IW" | "QW" | "MW" | "T" | "C";

export type ParsedAddress =
  | { kind: "bit"; area: "I" | "Q" | "M"; byte: number; bit: number }
  | { kind: "word"; area: "IW" | "QW" | "MW"; word: number }
  | { kind: "index"; area: "T" | "C"; index: number };

/** How many terminals the simulated CPU actually has. */
export const CPU = {
  model: "VCX CPU 1212C",
  digitalInputs: 8, // I0.0 - I0.7
  digitalOutputs: 6, // Q0.0 - Q0.5
  analogInputs: 2, // IW64, IW66
  analogOutputs: 1, // QW80
  analogInBase: 64,
  analogOutBase: 80,
} as const;

const BIT_RE = /^([IQM])(\d+)\.([0-7])$/i;
const WORD_RE = /^(IW|QW|MW)(\d+)$/i;
const INDEX_RE = /^([TC])(\d+)$/i;

/**
 * Read an address, or say why it cannot be read.
 *
 * Returns null for anything invalid rather than guessing. I0.8 is a genuine
 * mistake, not a request for I1.0, and silently correcting it would teach the
 * wrong lesson at exactly the moment the student is forming the habit.
 */
export function parseAddress(raw: string): ParsedAddress | null {
  const s = raw.trim().toUpperCase();
  if (!s) return null;

  const bit = BIT_RE.exec(s);
  if (bit) {
    return {
      kind: "bit",
      area: bit[1].toUpperCase() as "I" | "Q" | "M",
      byte: Number(bit[2]),
      bit: Number(bit[3]),
    };
  }

  const word = WORD_RE.exec(s);
  if (word) {
    const n = Number(word[2]);
    // A word starts on an even byte. MW1 would straddle MW0 and MW2.
    if (n % 2 !== 0) return null;
    return { kind: "word", area: word[1].toUpperCase() as "IW" | "QW" | "MW", word: n };
  }

  const idx = INDEX_RE.exec(s);
  if (idx) {
    return { kind: "index", area: idx[1].toUpperCase() as "T" | "C", index: Number(idx[2]) };
  }

  return null;
}

/** Back to text, canonically. */
export function formatAddress(a: ParsedAddress): string {
  if (a.kind === "bit") return `${a.area}${a.byte}.${a.bit}`;
  if (a.kind === "word") return `${a.area}${a.word}`;
  return `${a.area}${a.index}`;
}

/**
 * Why an address will not do, in words a student can act on.
 * Returns null when it is fine.
 */
export function addressProblem(raw: string, tag: Tag, others: Tag[]): string | null {
  const s = raw.trim();
  if (!s) return null; // Blank is allowed: an internal tag needs no terminal.

  const a = parseAddress(s);
  if (!a) {
    if (/^[IQM]\d+\.\d+$/i.test(s)) {
      return "Bits run 0 to 7. After I0.7 comes I1.0, not I0.8, the number after the dot is the bit inside the byte.";
    }
    if (/^(IW|QW|MW)\d+$/i.test(s)) {
      return "A word is two bytes, so word addresses step by two: MW0, MW2, MW4. MW1 would overlap MW0.";
    }
    return "Not an address this controller knows. Use I0.0 for an input, Q0.0 for an output, M0.0 for an internal bit, T0 for a timer, C0 for a counter.";
  }

  const expected = areaFor(tag);
  if (
    expected &&
    a.area !== expected &&
    !(expected === "I" && a.area === "M") &&
    !(expected === "Q" && a.area === "M")
  ) {
    return `${formatAddress(a)} is ${areaName(a.area)}. ${describeExpectation(tag)}`;
  }

  // Beyond what the hardware has.
  if (a.kind === "bit" && a.area === "I" && a.byte * 8 + a.bit >= CPU.digitalInputs) {
    return `This CPU has ${CPU.digitalInputs} digital inputs, I0.0 to I0.${CPU.digitalInputs - 1}. ${formatAddress(a)} would need an expansion module.`;
  }
  if (a.kind === "bit" && a.area === "Q" && a.byte * 8 + a.bit >= CPU.digitalOutputs) {
    return `This CPU has ${CPU.digitalOutputs} digital outputs, Q0.0 to Q0.${CPU.digitalOutputs - 1}. ${formatAddress(a)} would need an expansion module.`;
  }

  const clash = others.find((t) => t.name !== tag.name && t.address && sameAddress(t.address, s));
  if (clash) {
    return `${formatAddress(a)} is already used by "${clash.name}". Two tags cannot share one terminal.`;
  }

  return null;
}

function areaName(area: AddressArea): string {
  switch (area) {
    case "I":
      return "a digital input";
    case "Q":
      return "a digital output";
    case "M":
      return "an internal memory bit";
    case "IW":
      return "an analog input";
    case "QW":
      return "an analog output";
    case "MW":
      return "an internal memory word";
    case "T":
      return "a timer";
    case "C":
      return "a counter";
  }
}

function describeExpectation(tag: Tag): string {
  if (tag.type === "TIMER") return "A timer is addressed T0, T1, and so on.";
  if (tag.type === "COUNTER") return "A counter is addressed C0, C1, and so on.";
  if (tag.type === "INT") {
    if (tag.isInput) return "An analog input is addressed by word: IW64 or IW66.";
    if (tag.isOutput) return "The analog output is QW80.";
    return "An internal number is addressed MW0, MW2, MW4, words step by two.";
  }
  if (tag.isInput) return "An input is addressed I0.0 upwards, or M0.0 if it is internal.";
  if (tag.isOutput) return "An output is addressed Q0.0 upwards, or M0.0 if it is internal.";
  return "An internal bit is addressed M0.0 upwards.";
}

/** Two addresses that mean the same terminal. */
export function sameAddress(a: string, b: string): boolean {
  const pa = parseAddress(a),
    pb = parseAddress(b);
  if (!pa || !pb) return a.trim().toUpperCase() === b.trim().toUpperCase();
  return formatAddress(pa) === formatAddress(pb);
}

/** The area a tag belongs in, given what it is and how it is used. */
export function areaFor(tag: Tag): AddressArea | null {
  if (tag.type === "TIMER") return "T";
  if (tag.type === "COUNTER") return "C";
  if (tag.type === "INT") return tag.isInput ? "IW" : tag.isOutput ? "QW" : "MW";
  if (tag.isInput) return "I";
  if (tag.isOutput) return "Q";
  return "M";
}

/**
 * The next free address for a tag, given everything already assigned.
 *
 * Bits fill 0-7 then move to the next byte, which is how a real address list
 * grows and why the eighth input is I0.7 and the ninth is I1.0.
 */
export function nextFreeAddress(tag: Tag, all: Tag[]): string {
  const area = areaFor(tag);
  if (!area) return "";

  const taken = new Set(
    all
      .filter((t) => t.name !== tag.name && t.address)
      .map((t) => {
        const p = parseAddress(t.address!);
        return p ? formatAddress(p) : t.address!.toUpperCase();
      }),
  );

  if (area === "T" || area === "C") {
    for (let i = 0; i < 256; i++) {
      const a = `${area}${i}`;
      if (!taken.has(a)) return a;
    }
    return "";
  }

  if (area === "IW" || area === "QW" || area === "MW") {
    const base = area === "IW" ? CPU.analogInBase : area === "QW" ? CPU.analogOutBase : 0;
    const limit = area === "IW" ? CPU.analogInputs : area === "QW" ? CPU.analogOutputs : 128;
    for (let i = 0; i < limit; i++) {
      const a = `${area}${base + i * 2}`;
      if (!taken.has(a)) return a;
    }
    return "";
  }

  // Bit areas: byte.bit, bits 0-7.
  const limit = area === "I" ? CPU.digitalInputs : area === "Q" ? CPU.digitalOutputs : 1024;
  for (let n = 0; n < limit; n++) {
    const a = `${area}${Math.floor(n / 8)}.${n % 8}`;
    if (!taken.has(a)) return a;
  }
  return "";
}

/** Give every tag that has no address one, in a stable order. */
export function assignMissingAddresses(tags: Tag[]): Tag[] {
  const out = tags.map((t) => ({ ...t }));
  for (const t of out) {
    if (!t.address) {
      const next = nextFreeAddress(t, out);
      if (next) t.address = next;
    }
  }
  return out;
}

/**
 * Which physical terminal an address lands on, if any.
 * Used to draw the wire from a device to the right screw on the CPU.
 */
export function terminalFor(
  address: string | undefined,
): { strip: "in" | "out"; index: number } | null {
  if (!address) return null;
  const a = parseAddress(address);
  if (!a) return null;
  if (a.kind === "bit" && a.area === "I") {
    const n = a.byte * 8 + a.bit;
    return n < CPU.digitalInputs ? { strip: "in", index: n } : null;
  }
  if (a.kind === "bit" && a.area === "Q") {
    const n = a.byte * 8 + a.bit;
    return n < CPU.digitalOutputs ? { strip: "out", index: n } : null;
  }
  if (a.kind === "word" && a.area === "IW") {
    const n = (a.word - CPU.analogInBase) / 2;
    return n >= 0 && n < CPU.analogInputs ? { strip: "in", index: CPU.digitalInputs + n } : null;
  }
  if (a.kind === "word" && a.area === "QW") {
    const n = (a.word - CPU.analogOutBase) / 2;
    return n >= 0 && n < CPU.analogOutputs ? { strip: "out", index: CPU.digitalOutputs + n } : null;
  }
  return null; // M, MW, T, C live in memory. There is no screw to point at.
}

/** True for an address that has a terminal, i.e. something you can wire to. */
export function isPhysical(address: string | undefined): boolean {
  return terminalFor(address) !== null;
}

/** The label printed beside a terminal on the CPU. */
export function terminalLabel(strip: "in" | "out", index: number): string {
  if (strip === "in") {
    if (index < CPU.digitalInputs) return `I${Math.floor(index / 8)}.${index % 8}`;
    return `IW${CPU.analogInBase + (index - CPU.digitalInputs) * 2}`;
  }
  if (index < CPU.digitalOutputs) return `Q${Math.floor(index / 8)}.${index % 8}`;
  return `QW${CPU.analogOutBase + (index - CPU.digitalOutputs) * 2}`;
}
