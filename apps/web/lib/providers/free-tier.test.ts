import { describe, expect, it } from "vitest";
import { freeTierNotice, rankFreeModels, streamWithFallback } from "./free-tier";
import { ProviderError } from "./types";
import type { ChatMessage, Credentials, ModelInfo, Provider } from "./types";

const creds: Credentials = { apiKey: "k" };
const messages: ChatMessage[] = [{ role: "user", content: "hi" }];

const m = (id: string, over: Partial<ModelInfo> = {}): ModelInfo => ({
  id,
  label: id,
  free: true,
  ...over,
});

/**
 * A provider whose behaviour per model is scripted, so a fall-through can be
 * driven deterministically: "fail", "empty", or the text to emit.
 */
function scripted(script: Record<string, "fail" | "empty" | "rate" | string>): Provider {
  return {
    kind: "openrouter",
    label: "OpenRouter",
    keyHint: "",
    validateKeyFormat: () => null,
    listModels: async () => [],
    verify: async () => {},
    stream: (_c: Credentials, opts: { model: string }) => {
      const behaviour = script[opts.model];
      return (async function* () {
        if (behaviour === "fail") throw new ProviderError("network", "down");
        if (behaviour === "rate") throw new ProviderError("rate_limited", "busy");
        if (behaviour === "empty") return;
        yield behaviour ?? "";
      })();
    },
  } as unknown as Provider;
}

describe("rankFreeModels", () => {
  it("keeps only free models", () => {
    const ranked = rankFreeModels([m("a/llama-3.3-70b:free"), m("b/gpt-4o", { free: false })]);
    expect(ranked.map((x) => x.id)).toEqual(["a/llama-3.3-70b:free"]);
  });

  it("excludes reasoning-only families", () => {
    const ranked = rankFreeModels([m("x/deepseek-r1:free"), m("y/qwq-32b:free")]);
    expect(ranked).toHaveLength(0);
  });

  it("puts preferred families first, in order", () => {
    const ranked = rankFreeModels([
      m("v/gemma-2-27b:free"),
      m("w/llama-3.3-70b:free"),
      m("z/unknown:free"),
    ]);
    expect(ranked[0]?.id).toContain("llama-3.3-70b");
    expect(ranked[1]?.id).toContain("gemma-2-27b");
  });

  it("excludes models that do not emit text, such as music generators", () => {
    // Ranking by context alone picked a music model, which advertises an
    // enormous context window and returns audio.
    const ranked = rankFreeModels([
      m("google/lyria-3-pro-preview", {
        contextTokens: 1_048_576,
        outputModalities: ["text", "audio"],
      }),
      m("z-ai/glm-5.2:free", { contextTokens: 256_000, outputModalities: ["text"] }),
    ]);
    expect(ranked.map((x) => x.id)).toEqual(["z-ai/glm-5.2:free"]);
  });

  it("excludes classifiers and other non-chat endpoints by name", () => {
    const ranked = rankFreeModels([
      m("nvidia/nemotron-3.5-content-safety:free", { outputModalities: ["text"] }),
      m("some/reranker:free", { outputModalities: ["text"] }),
      m("z-ai/glm-5.2:free", { outputModalities: ["text"] }),
    ]);
    expect(ranked.map((x) => x.id)).toEqual(["z-ai/glm-5.2:free"]);
  });

  it("puts openrouter/free first, since it auto-routes to a healthy model", () => {
    const ranked = rankFreeModels([
      m("z-ai/glm-5.2:free", { contextTokens: 256_000 }),
      m("openrouter/free", { contextTokens: 200_000 }),
    ]);
    expect(ranked[0]?.id).toBe("openrouter/free");
  });

  it("keeps unranked free models as a tail, largest context first", () => {
    const ranked = rankFreeModels([
      m("a/small:free", { contextTokens: 4000 }),
      m("b/big:free", { contextTokens: 128000 }),
    ]);
    expect(ranked.map((x) => x.id)).toEqual(["b/big:free", "a/small:free"]);
  });
});

describe("streamWithFallback", () => {
  async function collect(it: AsyncIterable<string>): Promise<string> {
    let out = "";
    for await (const d of it) out += d;
    return out;
  }

  it("uses the first model when it works", async () => {
    const provider = scripted({ "a:free": "hello" });
    const r = await streamWithFallback({
      provider,
      creds,
      candidates: [m("a:free")],
      messages,
    });
    expect(r.model).toBe("a:free");
    expect(r.attempts).toHaveLength(0);
    expect(await collect(r.stream)).toBe("hello");
  });

  it("falls through to the next model when the first is rate limited", async () => {
    const provider = scripted({ "a:free": "rate", "b:free": "second" });
    const r = await streamWithFallback({
      provider,
      creds,
      candidates: [m("a:free"), m("b:free")],
      messages,
    });
    expect(r.model).toBe("b:free");
    expect(r.attempts).toHaveLength(1);
    expect(await collect(r.stream)).toBe("second");
  });

  it("falls through a model that returns nothing at all", async () => {
    const provider = scripted({ "a:free": "empty", "b:free": "ok" });
    const r = await streamWithFallback({
      provider,
      creds,
      candidates: [m("a:free"), m("b:free")],
      messages,
    });
    expect(r.model).toBe("b:free");
  });

  it("keeps falling through several failures", async () => {
    const provider = scripted({
      "a:free": "rate",
      "b:free": "fail",
      "c:free": "empty",
      "d:free": "finally",
    });
    const r = await streamWithFallback({
      provider,
      creds,
      candidates: ["a:free", "b:free", "c:free", "d:free"].map((id) => m(id)),
      messages,
    });
    expect(r.model).toBe("d:free");
    expect(r.attempts).toHaveLength(3);
  });

  it("throws a useful error when every model fails", async () => {
    const provider = scripted({ "a:free": "rate", "b:free": "rate" });
    await expect(
      streamWithFallback({
        provider,
        creds,
        candidates: [m("a:free"), m("b:free")],
        messages,
      }),
    ).rejects.toThrow(/busy or unavailable/);
  });

  it("does not retry a bad request, which would fail identically every time", async () => {
    const provider = {
      ...scripted({}),
      stream: () =>
        // biome-ignore lint/correctness/useYield: a generator that only throws is the case under test.
        (async function* () {
          throw new ProviderError("bad_request", "malformed");
        })(),
    } as unknown as Provider;

    await expect(
      streamWithFallback({
        provider,
        creds,
        candidates: [m("a:free"), m("b:free")],
        messages,
      }),
    ).rejects.toThrow(/malformed/);
  });

  it("stops after the attempt limit rather than trying forty models", async () => {
    const many = Array.from({ length: 40 }, (_, i) => m(`m${i}:free`));
    const provider = scripted(Object.fromEntries(many.map((x) => [x.id, "rate"])));
    await expect(
      streamWithFallback({ provider, creds, candidates: many, messages, limit: 3 }),
    ).rejects.toThrow(/3 attempted/);
  });

  it("refuses an empty candidate list clearly", async () => {
    await expect(
      streamWithFallback({ provider: scripted({}), creds, candidates: [], messages }),
    ).rejects.toThrow(/no free models/);
  });
});

describe("freeTierNotice", () => {
  it("names the model and tells the user to upgrade", () => {
    const n = freeTierNotice("llama-3.3-70b:free", 0);
    expect(n).toContain("llama-3.3-70b:free");
    expect(n).toMatch(/paid model/i);
    expect(n).toContain("Settings");
  });

  it("mentions how many were busy when it fell through", () => {
    expect(freeTierNotice("x", 1)).toMatch(/first choice was busy/i);
    expect(freeTierNotice("x", 3)).toMatch(/first 3 were busy/i);
  });
});
