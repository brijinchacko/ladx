/**
 * @vitest-environment jsdom
 *
 * What reading PLCopen XML must not get wrong.
 *
 * Two failures matter more than the rest. Turning a body it cannot really read
 * into something that looks like ladder, which produces logic that is wrong
 * without saying so. And dropping the vendor `addData` blocks silently, which
 * is documented as causing an import to fail somewhere else entirely.
 *
 * The fixtures are written by hand against the TC6 schema, not taken from a
 * vendor's sample project. See ADR 0003.
 */

import { describe, expect, it } from "vitest";
import { parsePlcopenXml } from "./import-plcopen";

const NS = "http://www.plcopen.org/xml/tc6_0201";

function project(pous: string, opts: { product?: string; addData?: boolean } = {}): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<project xmlns="${NS}">
  <fileHeader companyName="Acme" productName="${opts.product ?? "CODESYS"}" productVersion="3.5" creationDateTime="2026-01-01T00:00:00" />
  <contentHeader name="Conveyor"><coordinateInfo><fbd><scaling x="1" y="1"/></fbd><ld><scaling x="1" y="1"/></ld><sfc><scaling x="1" y="1"/></sfc></coordinateInfo></contentHeader>
  <types><dataTypes /><pous>${pous}</pous></types>
  <instances><configurations /></instances>
  ${opts.addData ? "<addData><data name='vendor' handleUnknown='implementation'><x /></data></addData>" : ""}
</project>`;
}

const vars = (list: [string, string, string?][]) =>
  `<interface><localVars>${list
    .map(
      ([n, t, doc]) =>
        `<variable name="${n}"><type><${t} /></type>${doc ? `<documentation>${doc}</documentation>` : ""}</variable>`,
    )
    .join("")}</localVars></interface>`;

/** A seal-in drawn as a TC6 ladder graph. */
const sealInLd = `<body><LD>
  <leftPowerRail localId="1"><connectionPointOut formalParameter="none" /></leftPowerRail>
  <contact localId="2"><connectionPointIn><connection refLocalId="1" /></connectionPointIn><variable>Start</variable></contact>
  <contact localId="3"><connectionPointIn><connection refLocalId="1" /></connectionPointIn><variable>Motor</variable></contact>
  <contact localId="4" negated="true"><connectionPointIn><connection refLocalId="2" /><connection refLocalId="3" /></connectionPointIn><variable>Stop</variable></contact>
  <coil localId="5"><connectionPointIn><connection refLocalId="4" /></connectionPointIn><variable>Motor</variable></coil>
</LD></body>`;

describe("variables, which are the genuinely portable part", () => {
  it("reads names, types and documentation", () => {
    const out = parsePlcopenXml(
      project(
        `<pou name="Main" pouType="program">${vars([
          ["Start", "BOOL", "Start button"],
          ["Count", "INT"],
        ])}<body><ST><xhtml xmlns="http://www.w3.org/1999/xhtml">a := 1;</xhtml></ST></body></pou>`,
      ),
    );
    if ("error" in out) throw new Error(out.error);
    const start = out.program.tags.find((t) => t.name === "Start");
    expect(start?.type).toBe("BOOL");
    expect(start?.comment).toBe("Start button");
    expect(out.program.tags.find((t) => t.name === "Count")?.type).toBe("INT");
  });

  it("leaves out a type it does not have rather than coercing it", () => {
    const out = parsePlcopenXml(
      project(
        `<pou name="Main" pouType="program">${vars([["Flow", "REAL"]])}<body><ST><xhtml xmlns="http://www.w3.org/1999/xhtml">x;</xhtml></ST></body></pou>`,
      ),
    );
    if ("error" in out) throw new Error(out.error);
    expect(out.program.tags.find((t) => t.name === "Flow")).toBeUndefined();
    expect(out.notes.some((n) => n.message.includes("REAL"))).toBe(true);
  });
});

describe("an LD body", () => {
  const out = parsePlcopenXml(
    project(
      `<pou name="Main" pouType="program">${vars([
        ["Start", "BOOL"],
        ["Stop", "BOOL"],
        ["Motor", "BOOL"],
      ])}${sealInLd}</pou>`,
    ),
  );

  it("follows the graph into rungs", () => {
    if ("error" in out) throw new Error(out.error);
    expect(out.program.rungs).toHaveLength(1);
  });

  it("reads the seal-in as two parallel legs", () => {
    if ("error" in out) throw new Error(out.error);
    const r = out.program.rungs[0];
    expect(r?.branches).toHaveLength(2);
    const tags = r?.branches.map((b) => b.map((e) => e.tag).join("+")).sort();
    expect(tags).toEqual(["Motor+Stop", "Start+Stop"]);
  });

  it("reads a negated contact as XIO", () => {
    if ("error" in out) throw new Error(out.error);
    const stop = out.program.rungs[0]?.branches[0]?.find((e) => e.tag === "Stop");
    expect(stop?.type).toBe("XIO");
  });

  it("drives the coil", () => {
    if ("error" in out) throw new Error(out.error);
    expect(out.program.rungs[0]?.outputs.map((e) => `${e.type}(${e.tag})`)).toEqual(["OTE(Motor)"]);
  });

  it("reads a set coil as OTL", () => {
    const o = parsePlcopenXml(
      project(
        `<pou name="Main" pouType="program">${vars([["A", "BOOL"]])}<body><LD>
        <leftPowerRail localId="1" />
        <contact localId="2"><connectionPointIn><connection refLocalId="1" /></connectionPointIn><variable>A</variable></contact>
        <coil localId="3" storage="set"><connectionPointIn><connection refLocalId="2" /></connectionPointIn><variable>Latch</variable></coil>
        </LD></body></pou>`,
      ),
    );
    if ("error" in o) throw new Error(o.error);
    expect(o.program.rungs[0]?.outputs[0]?.type).toBe("OTL");
  });

  it("names a function block it cannot represent instead of dropping it quietly", () => {
    const o = parsePlcopenXml(
      project(
        `<pou name="Main" pouType="program">${vars([["A", "BOOL"]])}<body><LD>
        <leftPowerRail localId="1" />
        <contact localId="2"><connectionPointIn><connection refLocalId="1" /></connectionPointIn><variable>A</variable></contact>
        <block localId="3" typeName="PID" instanceName="Loop1"><connectionPointIn><connection refLocalId="2" /></connectionPointIn></block>
        <coil localId="4"><connectionPointIn><connection refLocalId="3" /></connectionPointIn><variable>Out</variable></coil>
        </LD></body></pou>`,
      ),
    );
    if ("error" in o) throw new Error(o.error);
    expect(o.notes.some((n) => n.severity === "manual" && n.message.includes("PID"))).toBe(true);
  });
});

describe("being honest about what it did not read", () => {
  it("refuses to guess at a Structured Text body", () => {
    // Turning arbitrary ST back into rungs is a decompiler, and one that is
    // subtly wrong is worse than not having it at all.
    const out = parsePlcopenXml(
      project(
        `<pou name="Main" pouType="program">${vars([["A", "BOOL"]])}<body><ST><xhtml xmlns="http://www.w3.org/1999/xhtml">IF A THEN B := 1; END_IF</xhtml></ST></body></pou>`,
      ),
    );
    if ("error" in out) throw new Error(out.error);
    expect(out.program.rungs).toHaveLength(0);
    expect(out.notes.some((n) => n.severity === "manual" && n.message.includes("decompiler"))).toBe(
      true,
    );
    // The variables are still worth having.
    expect(out.program.tags.map((t) => t.name)).toContain("A");
  });

  it("says when a body is FBD, IL or SFC", () => {
    const out = parsePlcopenXml(
      project(
        `<pou name="Main" pouType="program">${vars([["A", "BOOL"]])}<body><SFC /></body></pou>`,
      ),
    );
    if ("error" in out) throw new Error(out.error);
    expect(out.notes.some((n) => n.message.includes("FBD, IL or SFC"))).toBe(true);
  });

  it("warns about vendor addData rather than dropping it silently", () => {
    // Documented as the thing whose loss makes an import fail somewhere else.
    const out = parsePlcopenXml(
      project(`<pou name="Main" pouType="program">${vars([["A", "BOOL"]])}</pou>`, {
        addData: true,
      }),
    );
    if ("error" in out) throw new Error(out.error);
    expect(out.notes.some((n) => n.message.includes("addData"))).toBe(true);
  });

  it("names the tool that wrote the file", () => {
    const out = parsePlcopenXml(
      project(`<pou name="Main" pouType="program">${vars([["A", "BOOL"]])}</pou>`, {
        product: "TwinCAT",
      }),
    );
    if ("error" in out) throw new Error(out.error);
    expect(out.notes[0]?.message).toContain("TwinCAT");
  });
});

describe("refusing well", () => {
  it("says what to export when handed the wrong file", () => {
    const out = parsePlcopenXml("<?xml version='1.0'?><root />");
    expect("error" in out && out.error).toContain("PLCopen XML");
  });

  it("says so when the XML is broken", () => {
    expect("error" in parsePlcopenXml("<project><unclosed>")).toBe(true);
  });

  it("is not fooled by an empty string", () => {
    expect("error" in parsePlcopenXml("")).toBe(true);
  });
});
