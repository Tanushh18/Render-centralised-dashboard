const STORAGE_KEY = "renderdesk.encrypted-vault.v1";
const ITERATIONS = 310_000;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}
function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export type VaultEnvelope = { version: 1; salt: string; iv: string; ciphertext: string; iterations: number };
export function hasSavedVault(): boolean {
  return Boolean(localStorage.getItem(STORAGE_KEY));
}
export async function encryptVault(value: unknown, passphrase: string): Promise<void> {
  if (!crypto?.subtle) throw new Error("This browser does not support secure encryption. Use a modern browser over HTTPS or localhost.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const envelope: VaultEnvelope = { version: 1, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)), iterations: ITERATIONS };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
}
export async function decryptVault<T>(passphrase: string): Promise<T> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error("No saved vault was found.");
  const envelope = JSON.parse(raw) as VaultEnvelope;
  if (envelope.version !== 1) throw new Error("Unsupported vault format.");
  try {
    const key = await deriveKey(passphrase, fromBase64(envelope.salt));
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(envelope.iv) }, key, fromBase64(envelope.ciphertext));
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    throw new Error("Incorrect passphrase, or the saved vault is damaged.");
  }
}
export function deleteSavedVault(): void {
  localStorage.removeItem(STORAGE_KEY);
}
