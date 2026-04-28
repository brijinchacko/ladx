// Typed wrappers around Tauri commands. Frontend code calls these —
// never `fetch()` to public domains (per ADR-005 / network policy).
// Talking to Ollama on localhost is the Rust side's responsibility.

import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export const invoke = tauriInvoke;

// ----- shared shapes (mirror src-tauri/src/{ollama,licence}/*.rs) -----

export interface OllamaStatus {
  running: boolean;
  baseUrl: string;
  modelCount: number;
  error: string | null;
}

export interface OllamaModel {
  name: string;
  sizeBytes: number;
  modifiedAt: string | null;
}

export interface OllamaModelsResponse {
  models: OllamaModel[];
  suggested: string | null;
}

export interface ActivationRecord {
  licenceKeyLast4: string;
  machineId: string;
  productTier: string;
  expiresAt: string;
  activatedAt: string;
}

// ----- typed commands -----

export async function ping(): Promise<string> {
  return tauriInvoke<string>("ping");
}

export async function ollamaStatus(): Promise<OllamaStatus> {
  return tauriInvoke<OllamaStatus>("ollama_status");
}

export async function ollamaModels(): Promise<OllamaModelsResponse> {
  return tauriInvoke<OllamaModelsResponse>("ollama_models");
}

export async function licenceStatus(): Promise<ActivationRecord | null> {
  return tauriInvoke<ActivationRecord | null>("licence_status");
}

export async function licenceActivate(licenceKey: string): Promise<ActivationRecord> {
  return tauriInvoke<ActivationRecord>("licence_activate", { licenceKey });
}

export interface StudioSettings {
  defaultModel?: string | null;
}

export async function settingsLoad(): Promise<StudioSettings> {
  return tauriInvoke<StudioSettings>("settings_load");
}

export async function settingsSave(settings: StudioSettings): Promise<void> {
  await tauriInvoke<void>("settings_save", { settings });
}
