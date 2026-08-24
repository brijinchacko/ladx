import { describe, expect, it } from "vitest";
import { pickFreeModel } from "./auto-model";
import type { Credentials, ModelInfo, Provider } from "./types";

/**
 * The automatic model pick.
 *
 * The case that matters most is the reasoning-only exclusion. Those models can
 * spend an entire token budget on their working and never answer, so choosing
 * one automatically would make a correctly configured account look broken.
 */

const creds: Credentials = { apiKey: "k" };

function providerWith(models: ModelInfo[]): Provider {
  return {
    kind: "openrouter",
    label: "OpenRouter",
    keyHint: "",
    validateKeyFormat: () => null,
    listModels: async () => models,
    verify: async () => {},
    stream: async function* () {},
  } as unknown as Provider;
}

const m = (id: string, over: Partial<ModelInfo> = {}): ModelInfo => ({
  id,
  label: id,
  free: true,
  ...over,
});

describe("pickFreeModel", () => {
  it("returns null when the provider has no free models", async () => {
    const p = providerWith([m("gpt-4o", { free: false })]);
    expect(await pickFreeModel(p, creds)).toBeNull();
  });

  it("returns null when listing fails, so the caller can fall back", async () => {
    const p = {
      ...providerWith([]),
      listModels: async () => {
        throw new Error("network");
      },
    } as unknown as Provider;
    expect(await pickFreeModel(p, creds)).toBeNull();
  });

  it("prefers a known-good free family over an unknown one", async () => {
    const p = providerWith([m("some/unknown-model:free"), m("meta-llama/llama-3.3-70b:free")]);
    const pick = await pickFreeModel(p, creds);
    expect(pick?.model).toBe("meta-llama/llama-3.3-70b:free");
  });

  it("follows the preference order when several known families are present", async () => {
    const p = providerWith([m("google/gemma-2-27b:free"), m("meta-llama/llama-3.3-70b:free")]);
    const pick = await pickFreeModel(p, creds);
    // llama-3.3-70b sits above gemma in the list.
    expect(pick?.model).toContain("llama-3.3-70b");
  });

  it("never picks a reasoning-only model automatically", async () => {
    // These emit their working into a separate channel and can exhaust the
    // budget without answering.
    const p = providerWith([
      m("deepseek/deepseek-r1:free"),
      m("qwen/qwq-32b:free"),
      m("meta-llama/llama-3.1-8b:free"),
    ]);
    const pick = await pickFreeModel(p, creds);
    expect(pick?.model).toBe("meta-llama/llama-3.1-8b:free");
  });

  it("returns null when every free model is reasoning-only", async () => {
    const p = providerWith([m("deepseek/deepseek-r1:free"), m("qwen/qwq-32b:free")]);
    expect(await pickFreeModel(p, creds)).toBeNull();
  });

  it("falls back to the largest context window when no family matches", async () => {
    const p = providerWith([
      m("vendor/small:free", { contextTokens: 8_000 }),
      m("vendor/large:free", { contextTokens: 128_000 }),
    ]);
    const pick = await pickFreeModel(p, creds);
    expect(pick?.model).toBe("vendor/large:free");
  });

  it("carries a notice telling the user a paid model does better", async () => {
    const p = providerWith([m("meta-llama/llama-3.3-70b:free")]);
    const pick = await pickFreeModel(p, creds);
    expect(pick?.automatic).toBe(true);
    expect(pick?.notice).toMatch(/free model/i);
    expect(pick?.notice).toMatch(/Settings/);
  });
});
