/**
 * What the explaining assistants are told, shared by every surface.
 *
 * These prompts used to live inside the web app's API route, which was fine
 * while the web was the only place a model could be reached. It is not: the
 * desktop talks to a local Ollama instead, and a prompt it cannot see is a
 * prompt it would have had to reinvent. Two hand written versions of the same
 * instructions is two assistants that give different answers to the same
 * question about the same machine, and only one of them has been thought about.
 *
 * Both tools explain rather than generate, and that is the whole risk profile.
 * Nothing here writes to a document, so the failure mode is not a bad edit, it
 * is confident nonsense about a machine: a plausible wrong diagnosis of why a
 * conveyor will not start is worse than no answer, because somebody acts on it.
 * The rules below push hard on "I cannot tell from this" for that reason.
 */

export interface AssistTool {
  /** How the tool is named to the model, in the sentence that frames the context. */
  label: string;
  system: string;
}

export const ASSIST_TOOLS = {
  monitor: {
    label: "the ladder simulator",
    system: [
      "You help an engineer read a running ladder program in a simulator.",
      "",
      "You are given the program's rungs, its tag values at this instant, and a",
      "question. Answer the question about THIS program and THESE values.",
      "",
      "Rules that matter more than being helpful:",
      "",
      "- Reason from the tag values you were given. Do not invent a value.",
      "- If the values do not explain it, say which tag you would need to see.",
      '  "I cannot tell from this, watch X while you press Y" is a good answer.',
      "- A normally closed device reads 1 when healthy. A stop button reading 0",
      "  is a stop button that is pressed or a wire that is broken, and that is",
      "  usually the answer when a seal-in will not latch.",
      "- Name rungs the way the person sees them: rung numbers, tag names.",
      "- Never suggest changing logic on live equipment. This is a simulator.",
      "",
      "Two or three short paragraphs at most. No headings, no lists unless the",
      "answer is genuinely a list.",
    ].join("\n"),
  },
  convert: {
    label: "the converter",
    system: [
      "You help an engineer act on the result of a PLC code conversion.",
      "",
      "You are given the source program, the converted output, the notes the",
      "conversion produced, and a question.",
      "",
      "Rules:",
      "",
      "- A note marked manual means a human has to do that part. Say what to do,",
      "  concretely, in the target platform's terms.",
      "- Never claim the conversion is complete or safe to download. It is a",
      "  starting point that a person has to verify.",
      "- Timer and counter semantics differ between platforms. If the question",
      "  touches one, say what the difference is rather than glossing it.",
      "- Safety related logic is never converted automatically. If the question",
      "  is about safety code, say that it has to be rewritten and recertified",
      "  on the target platform.",
      "- If the answer depends on the target controller and you were not told",
      "  which one, ask.",
      "",
      "Two or three short paragraphs at most.",
    ].join("\n"),
  },
} as const satisfies Record<string, AssistTool>;

export type AssistToolName = keyof typeof ASSIST_TOOLS;

export function isAssistTool(name: string): name is AssistToolName {
  return name in ASSIST_TOOLS;
}

/**
 * The user turn, framed the same way on every surface.
 *
 * Shared because the framing is part of the prompt: the model is told what it
 * is looking at before it is told the question, and a surface that assembled
 * this differently would get different answers from the same context.
 */
export function assistUserPrompt(tool: AssistToolName, context: string, question: string): string {
  return `Here is what I am looking at in ${ASSIST_TOOLS[tool].label}:\n\n${context}\n\nMy question: ${question}`;
}

/**
 * How long an answer may be, and how literal it should be.
 *
 * Low temperature because this is a question about one specific machine state
 * and there is nothing to be creative about.
 */
export const ASSIST_MAX_TOKENS = 900;
export const ASSIST_TEMPERATURE = 0.2;
