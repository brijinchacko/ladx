import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { env } from "../env";

/**
 * Sealing a user's provider key.
 *
 * These are the user's own credentials for OpenAI, Anthropic, OpenRouter — real
 * money attached to real accounts. They are stored so that "connect once" works
 * across sessions, and that means storing them properly rather than storing
 * them at all costs.
 *
 * AES-256-GCM: authenticated, in Node core, and the same primitive every cloud
 * KMS speaks. Random 12-byte IV per record — never a counter, never reused,
 * because IV reuse under GCM is catastrophic rather than merely weak.
 *
 * The envelope carries a key id in its first byte. That is the whole rotation
 * story: a new master key can be introduced, new writes seal under it, old
 * records still open under the previous one, and nothing needs a bulk
 * re-encryption pass at 3am. Without the byte, rotating means rewriting every
 * row at once and hoping nothing fails halfway.
 *
 * The user's id is bound in as additional authenticated data, so a ciphertext
 * lifted from one row and pasted into another fails to open rather than
 * silently decrypting somebody else's key.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const CURRENT_KEY_ID = 1;

/**
 * Master keys by id. Only `LADX_SECRETS_KEY` exists today; rotation adds
 * `LADX_SECRETS_KEY_2` here, bumps CURRENT_KEY_ID, and old rows keep opening.
 */
function masterKey(id: number): Buffer {
  if (id !== CURRENT_KEY_ID) {
    throw new SecretsError(`no master key with id ${id}`);
  }
  const raw = env.requireSecretsKey();
  // Accept hex (the documented form) or fall back to a KDF over a passphrase,
  // so a misconfigured dev environment fails loudly at the right place rather
  // than producing a 31-byte key and an unhelpful OpenSSL error.
  const hex = /^[0-9a-fA-F]{64}$/.test(raw);
  return hex ? Buffer.from(raw, "hex") : createHash("sha256").update(raw).digest();
}

export class SecretsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretsError";
  }
}

/**
 * Seal `plaintext` for `userId`.
 *
 * Layout: `[key id (1)] [iv (12)] [tag (16)] [ciphertext]`, base64. The IV and
 * tag are not secret — they are inputs to the open, and are meant to travel
 * beside the ciphertext.
 */
export function seal(plaintext: string, userId: string): string {
  const key = masterKey(CURRENT_KEY_ID);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(userId, "utf8"));

  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([Buffer.from([CURRENT_KEY_ID]), iv, tag, body]).toString("base64");
}

/** Open a sealed value. Throws if the envelope was altered or belongs elsewhere. */
export function open(sealed: string, userId: string): string {
  let buf: Buffer;
  try {
    buf = Buffer.from(sealed, "base64");
  } catch {
    throw new SecretsError("stored value is not valid base64");
  }
  if (buf.length < 1 + IV_BYTES + TAG_BYTES) {
    throw new SecretsError("stored value is too short to be an envelope");
  }

  const keyId = buf[0] as number;
  const iv = buf.subarray(1, 1 + IV_BYTES);
  const tag = buf.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
  const body = buf.subarray(1 + IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, masterKey(keyId), iv);
  decipher.setAAD(Buffer.from(userId, "utf8"));
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    // Deliberately vague: the caller cannot act differently on "wrong key"
    // versus "tampered", and saying which is a small oracle.
    throw new SecretsError("could not decrypt — wrong key, or the value was altered");
  }
}

/**
 * What the UI shows instead of the key.
 *
 * Enough tail to recognise which key it is, never enough to use. Provider
 * prefixes (`sk-or-v1-`, `sk-ant-`) are kept because they identify the provider
 * and are not secret.
 */
export function maskKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 12) return "••••";
  const prefixMatch = trimmed.match(/^(sk-[a-z0-9]+-|sk-)/i);
  const prefix = prefixMatch?.[0] ?? "";
  return `${prefix}••••${trimmed.slice(-4)}`;
}

/**
 * A stable non-reversible id for a key.
 *
 * Lets us answer "is this the same key you already stored?" without opening the
 * envelope, and lets logs refer to a key without containing one.
 */
export function fingerprint(key: string): string {
  return createHash("sha256").update(key.trim()).digest("hex").slice(0, 16);
}

/** Constant-time compare, for anywhere a secret is checked against a candidate. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
