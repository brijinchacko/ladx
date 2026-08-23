/**
 * One interface, every provider.
 *
 * LADX holds no inference key of its own. Every request runs on credentials the
 * user connected, which means the interesting question is not "which model do
 * we use" but "how few assumptions can we make about where the model lives".
 *
 * Four adapters cover the field, and the fourth covers the future: any endpoint
 * that speaks the OpenAI chat-completions shape — Groq, Together, a corporate
 * gateway, a local Ollama on the engineer's own laptop — works through `custom`
 * without new code. That slot is why this file does not need to change when the
 * next provider launches.
 */

export type ProviderKind = "openrouter" | "anthropic" | "openai" | "custom";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ModelInfo {
  /** Provider-native id, passed straight back on requests. */
  id: string;
  label: string;
  /** Maximum context in tokens, when the provider reports it. */
  contextTokens?: number;
  /** True when the provider charges nothing for this model. */
  free?: boolean;
  /** Whether the model can be given tools. Absent means unknown. */
  tools?: boolean;
  /** Whether the model accepts images — gates the PDF/screenshot import path. */
  vision?: boolean;
}

export interface Credentials {
  apiKey: string;
  /** Required for `custom`; ignored otherwise. */
  baseUrl?: string;
}

export interface StreamOptions {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

/**
 * Why a provider call failed, in terms the UI can act on.
 *
 * The distinction that matters most is `rate_limited`: on a free tier it is not
 * an error at all, it is a queue, and telling somebody their key is broken when
 * they simply need to wait twenty seconds is the fastest way to lose them.
 */
export type ProviderErrorKind =
  | "auth"
  | "rate_limited"
  | "model_unavailable"
  | "network"
  | "bad_request"
  | "unknown";

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  /** Seconds to wait, when the provider says. */
  readonly retryAfter?: number;

  constructor(kind: ProviderErrorKind, message: string, retryAfter?: number) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
    this.retryAfter = retryAfter;
  }

  /** What to show a person. Deliberately not the provider's raw wording. */
  get userMessage(): string {
    switch (this.kind) {
      case "auth":
        return "That key was rejected. Check it is still valid in your provider's dashboard.";
      case "rate_limited":
        return this.retryAfter
          ? `Your provider is rate-limiting this key. Try again in ${this.retryAfter}s.`
          : "Your provider is rate-limiting this key. Free tiers cap requests per minute — wait a moment and try again.";
      case "model_unavailable":
        return "That model is not available on your key right now. Free models rotate; pick another.";
      case "network":
        return "Could not reach your provider. Check the connection and try again.";
      case "bad_request":
        return `Your provider rejected the request: ${this.message}`;
      default:
        return "Something went wrong talking to your provider.";
    }
  }
}

export interface Provider {
  readonly kind: ProviderKind;
  readonly label: string;
  /** Human guidance for the connect screen — where to get a key. */
  readonly keyHint: string;
  /** Shape check before any network call, so obvious typos fail instantly. */
  validateKeyFormat(key: string): string | null;
  /** Models this key can actually reach. */
  listModels(creds: Credentials): Promise<ModelInfo[]>;
  /** Cheapest call that proves the key works. */
  verify(creds: Credentials): Promise<void>;
  /** Token deltas. Throws `ProviderError`. */
  stream(creds: Credentials, opts: StreamOptions): AsyncIterable<string>;
}
