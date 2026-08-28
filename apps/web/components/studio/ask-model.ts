"use client";

import { httpAskModel } from "@ladx/ui";

/**
 * How the web's tools reach a model.
 *
 * A client module so a server rendered page can hand it to a client component,
 * the same arrangement `save-record` uses. One instance rather than a factory
 * call per render, so the identity is stable and the assistant's callbacks do
 * not rebuild on every pass.
 *
 * The route behind it holds the prompts, the keys and the audit entry. The
 * desktop has its own, talking to a local Ollama, and neither surface knows
 * about the other's.
 */
export const askModelViaApi = httpAskModel("/api/assist");
