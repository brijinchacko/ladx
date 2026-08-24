/**
 * The project brief, or design basis.
 *
 * Every deliverable a control project produces is written from the same small
 * set of facts: what the system has to achieve, what it is made of, how it is
 * powered, what has to be safe, and what "finished" means. Today those facts
 * live in the engineer's head and get retyped into the URS, then the FDS, then
 * the I/O list, then the FAT, drifting a little each time. A hardware summary
 * that disagrees with the BOM is the classic finding in a document review.
 *
 * So they are captured once, here, and every document draws from them.
 *
 * The field set follows what the practice actually asks for rather than what
 * was convenient to store:
 *
 * - ANSI/ISA-5.06.01, functional requirements documentation, gives the shape of
 *   what a control application has to state before anybody writes code.
 * - The design basis document, standard practice in PLC/DCS project planning,
 *   contributes the platform, network media, power and redundancy, environmental
 *   protection level, and the security policy as first-class items.
 * - URS practice (GAMP 5 and the general automation templates) contributes the
 *   objective, the scope boundary, operating modes, performance and acceptance.
 * - ISO 13849-1 / IEC 62061 / IEC 61511 contribute the required performance
 *   level or SIL and the risk assessment it derives from.
 * - IEC 62443-3-2 contributes the zone, the target security level, and how
 *   remote access is handled, which is now asked about on most jobs.
 *
 * Stored as one jsonb column rather than twenty text columns. The set will
 * change as the vertical coverage grows, and a migration per field is not a
 * trade worth making for data nothing joins on.
 */

export type BriefKey =
  | "goal"
  | "process"
  | "scopeIn"
  | "scopeOut"
  | "plc"
  | "hmi"
  | "io"
  | "networks"
  | "drives"
  | "power"
  | "enclosure"
  | "environment"
  | "safetyFunctions"
  | "safetyLevel"
  | "riskAssessment"
  | "modes"
  | "performance"
  | "interfaces"
  | "standards"
  | "security"
  | "acceptance"
  | "dates";

export type ProjectBrief = Partial<Record<BriefKey, string>>;

export interface BriefField {
  key: BriefKey;
  label: string;
  /** What the field is for, in the words an engineer would use. */
  hint: string;
  /** A real example, not a format string. */
  placeholder: string;
  /** long fields get a textarea. */
  long?: boolean;
}

export interface BriefGroup {
  id: string;
  title: string;
  blurb: string;
  fields: BriefField[];
}

export const BRIEF_GROUPS: BriefGroup[] = [
  {
    id: "goal",
    title: "Goal and scope",
    blurb: "What the system is for, and where your responsibility stops.",
    fields: [
      {
        key: "goal",
        label: "Project goal",
        hint: "What must be true when this is finished that is not true today.",
        placeholder:
          "Replace the relay control on the line 4 filler with a PLC, and lift changeover from 40 minutes to under 10.",
        long: true,
      },
      {
        key: "process",
        label: "Process or machine",
        hint: "What the plant actually does, for somebody who has never seen it.",
        placeholder:
          "Rotary filler, 12 head, 500 ml glass. Infeed from the depalletiser, discharge to the capper.",
        long: true,
      },
      {
        key: "scopeIn",
        label: "In scope",
        hint: "The work you are quoting and will be held to.",
        placeholder:
          "Control panel, PLC and HMI software, field wiring from the panel, FAT, SAT, commissioning, O&M pack.",
        long: true,
      },
      {
        key: "scopeOut",
        label: "By others",
        hint: "Stated explicitly, because this is what arguments at handover are about.",
        placeholder:
          "Mechanical installation, 400 V supply to the panel isolator, instrument calibration certificates.",
        long: true,
      },
    ],
  },
  {
    id: "platform",
    title: "Control platform",
    blurb: "The hardware the documents describe and the BOM has to match.",
    fields: [
      {
        key: "plc",
        label: "Controller",
        hint: "Family, CPU and firmware. Safety CPU too, if the safety is integrated.",
        placeholder: "Siemens S7-1516F-3 PN/DP, firmware 3.1, ET 200SP remote I/O",
      },
      {
        key: "hmi",
        label: "HMI and SCADA",
        hint: "Panel, product and version. Say if there is a plant historian to feed.",
        placeholder: "TP1200 Comfort, WinCC Advanced V19. No SCADA.",
      },
      {
        key: "io",
        label: "I/O count",
        hint: "By type, with the spare capacity you are holding.",
        placeholder: "96 DI, 64 DO, 24 AI, 8 AO, plus 20 percent spare",
      },
      {
        key: "networks",
        label: "Networks and protocols",
        hint: "Control, safety and plant layers, with the media for each.",
        placeholder: "PROFINET on copper for control, PROFIsafe for safety, OPC UA to the MES",
      },
      {
        key: "drives",
        label: "Drives and instruments",
        hint: "The significant field devices. Enough to size the panel and write the I/O list.",
        placeholder: "8 x G120C on PROFINET, 4 x Endress+Hauser Promag, 2 x SEW gearmotor",
      },
    ],
  },
  {
    id: "electrical",
    title: "Electrical and environment",
    blurb: "What the panel is fed from and what it has to survive.",
    fields: [
      {
        key: "power",
        label: "Electrical supply",
        hint: "Voltage, phases, frequency, prospective fault level, and any UPS.",
        placeholder: "400 V 3ph 50 Hz TN-S, 10 kA prospective, 24 V DC UPS holding the CPU 20 min",
      },
      {
        key: "enclosure",
        label: "Panels and protection",
        hint: "Enclosure, rating and where it stands.",
        placeholder: "One 2000 x 1200 x 400 floor panel, IP55, stainless, in the packing hall",
      },
      {
        key: "environment",
        label: "Environment and area classification",
        hint: "Ambient, washdown, and any hazardous area with the governing standard.",
        placeholder: "5 to 35 C, daily caustic washdown, safe area throughout",
      },
    ],
  },
  {
    id: "safety",
    title: "Safety",
    blurb: "The safety functions, what they have to achieve, and where that came from.",
    fields: [
      {
        key: "safetyFunctions",
        label: "Safety functions",
        hint: "One line each: what is guarded, what trips, and what the stop does.",
        placeholder:
          "E-stop, category 0 to the filler drive. Guard door interlock, category 1 stop. Light curtain on the infeed, muted during pallet entry.",
        long: true,
      },
      {
        key: "safetyLevel",
        label: "Required PL or SIL",
        hint: "The target and the standard it is assessed against.",
        placeholder: "PLd, category 3, to ISO 13849-1",
      },
      {
        key: "riskAssessment",
        label: "Risk assessment reference",
        hint: "The document the safety requirements derive from, and who owns it.",
        placeholder: "RA-2601 rev B, issued by the client's engineering manager",
      },
    ],
  },
  {
    id: "operation",
    title: "Operation and performance",
    blurb: "How it is run, what it has to hit, and what it has to talk to.",
    fields: [
      {
        key: "modes",
        label: "Operating modes",
        hint: "Every mode the machine has, including the ones only maintenance sees.",
        placeholder: "Auto, manual, jog, clean-in-place, maintenance under key switch",
      },
      {
        key: "performance",
        label: "Performance targets",
        hint: "The numbers the FAT and SAT will be argued against.",
        placeholder: "220 bottles per minute sustained, 98 percent availability, 8 s cycle",
      },
      {
        key: "interfaces",
        label: "Interfaces and handshakes",
        hint: "Upstream, downstream, and anything at business level.",
        placeholder:
          "Depalletiser handshake on hardwired ready/run. Capper on PROFINET. Batch data to SAP via OPC UA.",
        long: true,
      },
    ],
  },
  {
    id: "compliance",
    title: "Compliance and security",
    blurb: "The rules the job is run against, including the OT network.",
    fields: [
      {
        key: "standards",
        label: "Standards",
        hint: "What the design is held to. Machinery, electrical, software, sector.",
        placeholder: "IEC 60204-1, ISO 13849-1, IEC 61131-3, ISA-18.2, client spec ENG-014",
      },
      {
        key: "security",
        label: "OT security",
        hint: "Zone and conduit position, target security level, and how remote access works.",
        placeholder:
          "Cell zone behind the plant firewall, SL-T 2 to IEC 62443-3-3. Remote access by client VPN and jump host only, no direct inbound.",
      },
    ],
  },
  {
    id: "acceptance",
    title: "Acceptance and dates",
    blurb: "What finished means, and when it is due.",
    fields: [
      {
        key: "acceptance",
        label: "Acceptance criteria",
        hint: "The conditions that release payment. Write them so they can be witnessed.",
        placeholder:
          "FAT passed with no category A defects. 72 h continuous run at rate on site. O&M pack and as-built issued.",
        long: true,
      },
      {
        key: "dates",
        label: "Key dates",
        hint: "The fixed points: FAT, delivery, site, handover.",
        placeholder: "FAT week 12, delivery week 14, SAT week 16, handover week 18",
      },
    ],
  },
];

export const BRIEF_FIELDS: BriefField[] = BRIEF_GROUPS.flatMap((g) => g.fields);

const FIELD_BY_KEY = new Map(BRIEF_FIELDS.map((f) => [f.key, f]));

export function briefField(key: BriefKey): BriefField | undefined {
  return FIELD_BY_KEY.get(key);
}

/**
 * What each document actually needs before it is worth generating.
 *
 * Deliberately short lists. Asking for all twenty-two fields before somebody
 * can start an I/O list would be the form-filling this is supposed to replace,
 * so each template asks only for what it cannot be written without.
 */
const NEEDS: Record<string, BriefKey[]> = {
  "urs-user-requirement-specification": ["goal", "process", "scopeIn", "scopeOut", "performance"],
  "fds-functional-design-specification": ["goal", "plc", "hmi", "networks", "modes", "interfaces"],
  "control-narrative": ["process", "modes", "interfaces"],
  "software-design-specification": ["plc", "networks", "standards"],

  "io-list": ["plc", "io", "drives"],
  "bom-bill-of-materials": ["plc", "hmi", "io", "enclosure", "power"],
  "cable-schedule": ["io", "enclosure", "environment"],
  "cause-and-effect-matrix": ["safetyFunctions", "interfaces"],
  "rats-range-alarm-trip-schedule": ["io", "drives"],
  "alarm-rationalisation": ["modes", "standards"],

  "machinery-risk-assessment": ["process", "safetyFunctions", "safetyLevel", "riskAssessment"],

  "fat-factory-acceptance-test": ["goal", "modes", "performance", "acceptance"],
  "sat-site-acceptance-test": ["goal", "acceptance", "dates"],
  "commissioning-checklist": ["power", "safetyFunctions", "modes"],

  "handover-pack": ["plc", "hmi", "standards", "acceptance"],
  "om-manual": ["process", "plc", "hmi", "modes", "safetyFunctions"],
  "change-control-record": ["goal", "standards"],
};

/** The brief fields a template is written from. */
export function needsFor(slug: string): BriefKey[] {
  return NEEDS[slug] ?? ["goal", "process"];
}

/** The ones a template needs that have not been answered yet. */
export function missingFor(slug: string, brief: ProjectBrief | null | undefined): BriefKey[] {
  return needsFor(slug).filter((k) => !brief?.[k]?.trim());
}

export function briefProgress(brief: ProjectBrief | null | undefined): {
  filled: number;
  total: number;
} {
  const filled = BRIEF_FIELDS.filter((f) => brief?.[f.key]?.trim()).length;
  return { filled, total: BRIEF_FIELDS.length };
}

/**
 * The brief as a markdown section, for the head of a generated document.
 *
 * Only the fields that document is written from, and only the ones answered.
 * A design basis table padded with "TBC" rows is worse than a short one: it
 * reads as though the questions were asked and nobody cared about the answers.
 */
export function designBasisSection(slug: string, brief: ProjectBrief | null | undefined): string {
  const rows = needsFor(slug)
    .map((key) => [briefField(key), brief?.[key]?.trim()] as const)
    .filter((pair): pair is readonly [BriefField, string] => Boolean(pair[0] && pair[1]));

  if (rows.length === 0) return "";

  const body = rows
    .map(([field, value]) => `| **${field.label}** | ${value.replace(/\s*\n\s*/g, " ")} |`)
    .join("\n");

  return `## Project design basis

Captured on the project and shared by every document it produces. Change it on the
project rather than here, so the set stays consistent.

| | |
|---|---|
${body}

---

`;
}

const MAX_FIELD = 4000;

/**
 * Accept only known keys, as strings, capped.
 *
 * This lands in a jsonb column and is read back into generated documents, so an
 * unvalidated body would let a caller store arbitrary structure and arbitrary
 * length under the project. Unknown keys are dropped rather than rejected, so
 * an older client posting a field that has since been removed still saves the
 * rest of the form.
 */
export function sanitizeBrief(input: unknown): ProjectBrief {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: ProjectBrief = {};
  for (const field of BRIEF_FIELDS) {
    const value = (input as Record<string, unknown>)[field.key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim().slice(0, MAX_FIELD);
    if (trimmed) out[field.key] = trimmed;
  }
  return out;
}

/** Merge a partial answer into what is already stored. */
export function mergeBrief(current: ProjectBrief | null | undefined, patch: unknown): ProjectBrief {
  return { ...(current ?? {}), ...sanitizeBrief(patch) };
}
