import { beforeAll, describe, expect, it } from "vitest";

/**
 * The envelope that protects users' provider keys.
 *
 * Worth testing carefully because the failure modes are silent: an IV that
 * repeats, an AAD that isn't bound, or a tag that isn't checked all produce
 * code that round-trips perfectly in development and is broken in a way nobody
 * notices until it matters.
 */

// Set before the module loads: it reads the master key through `env` at call
// time, and a missing key would fail every test for the wrong reason.
beforeAll(() => {
  process.env.LADX_SECRETS_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
});

const KEY = "sk-or-v1-cd1745fff7fcb0cb18369d2e171a341a9d0cfbe808bc5a758fee1729c46";
const USER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

describe("seal / open", () => {
  it("round trips", async () => {
    const { open, seal } = await import("./secrets");
    expect(open(seal(KEY, USER), USER)).toBe(KEY);
  });

  it("produces a different ciphertext every time", async () => {
    const { seal } = await import("./secrets");
    // A fresh IV per record. If these ever match, the IV has become
    // deterministic, which under GCM is catastrophic rather than merely weak.
    expect(seal(KEY, USER)).not.toBe(seal(KEY, USER));
  });

  it("refuses to open under a different user id", async () => {
    const { SecretsError, open, seal } = await import("./secrets");
    // The user id is bound in as AAD, so a row lifted from one user and pasted
    // into another fails rather than quietly decrypting.
    expect(() => open(seal(KEY, USER), OTHER)).toThrow(SecretsError);
  });

  it("detects a modified ciphertext", async () => {
    const { SecretsError, open, seal } = await import("./secrets");
    const buf = Buffer.from(seal(KEY, USER), "base64");
    const last = buf.length - 1;
    buf.writeUInt8(buf.readUInt8(last) ^ 0x01, last);
    expect(() => open(buf.toString("base64"), USER)).toThrow(SecretsError);
  });

  it("detects a modified auth tag", async () => {
    const { SecretsError, open, seal } = await import("./secrets");
    const buf = Buffer.from(seal(KEY, USER), "base64");
    // First byte of the tag: 1 (key id) + 12 (iv).
    buf.writeUInt8(buf.readUInt8(13) ^ 0x01, 13);
    expect(() => open(buf.toString("base64"), USER)).toThrow(SecretsError);
  });

  it("rejects an envelope sealed under an unknown key id", async () => {
    const { SecretsError, open, seal } = await import("./secrets");
    const buf = Buffer.from(seal(KEY, USER), "base64");
    buf[0] = 9;
    // This is the rotation path proving it fails closed: an id we have no key
    // for must not silently fall back to the current one.
    expect(() => open(buf.toString("base64"), USER)).toThrow(SecretsError);
  });

  it("rejects a truncated envelope", async () => {
    const { SecretsError, open } = await import("./secrets");
    expect(() => open("AAAA", USER)).toThrow(SecretsError);
  });
});

describe("maskKey", () => {
  it("keeps the provider prefix and the last four", async () => {
    const { maskKey } = await import("./secrets");
    const masked = maskKey(KEY);
    // Enough to recognise which key it is; never enough to use.
    expect(masked.startsWith("sk-or-")).toBe(true);
    expect(masked.endsWith(KEY.slice(-4))).toBe(true);
    expect(masked).not.toContain(KEY.slice(10, 30));
  });

  it("hides a short key entirely", async () => {
    const { maskKey } = await import("./secrets");
    expect(maskKey("short")).toBe("••••");
  });
});

describe("fingerprint", () => {
  it("is stable and ignores surrounding whitespace", async () => {
    const { fingerprint } = await import("./secrets");
    expect(fingerprint(KEY)).toBe(fingerprint(`  ${KEY}\n`));
  });

  it("differs between keys and reveals nothing", async () => {
    const { fingerprint } = await import("./secrets");
    const fp = fingerprint(KEY);
    expect(fp).not.toBe(fingerprint(`${KEY}x`));
    expect(KEY).not.toContain(fp);
  });
});
