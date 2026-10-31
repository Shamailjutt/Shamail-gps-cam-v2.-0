/**
 * Client-side Settings authentication utility using PBKDF2-HMAC-SHA256 via Web Crypto API.
 * Never logs, displays, or stores plaintext credentials.
 */

const AUTH_STORAGE_KEY = 'shamail_secure_web_session_v2';
const SALT_HEX = '8f4b2e91c73a60d54e18b9f27a3c5d61';
const ITERATIONS = 65536;
const KEY_LENGTH_BITS = 256;
const EXPECTED_USER_HASH = '4b27b96d0a6b5154840c926b0e3e379fe540f409f3197350e392768d17bd4d4b';
const EXPECTED_PASS_HASH = '70ea70e1187f0ab2b5f61ba662098056374c30a463291a19ca46e6afff5962b3';

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function derivePbkdf2Bytes(input: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(input),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const saltBytes = hexToBytes(SALT_HEX);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes.buffer as ArrayBuffer,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    KEY_LENGTH_BITS
  );
  return new Uint8Array(derivedBits);
}

export async function verifySettingsCredentials(
  usernameInput: string,
  passwordInput: string,
  rememberUser: boolean
): Promise<boolean> {
  const trimmedUser = usernameInput.trim();
  if (!trimmedUser || !passwordInput) return false;

  try {
    const [userDerived, passDerived] = await Promise.all([
      derivePbkdf2Bytes(trimmedUser),
      derivePbkdf2Bytes(passwordInput),
    ]);

    const userMatch = constantTimeEqual(userDerived, hexToBytes(EXPECTED_USER_HASH));
    const passMatch = constantTimeEqual(passDerived, hexToBytes(EXPECTED_PASS_HASH));
    const verified = userMatch && passMatch;

    if (verified) {
      if (rememberUser) {
        saveRememberedSession(true);
      } else {
        saveRememberedSession(false);
      }
    }
    return verified;
  } catch {
    return false;
  }
}

export function isRememberedSettingsSessionActive(): boolean {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { rememberUser?: boolean; token?: string };
    return Boolean(parsed.rememberUser && typeof parsed.token === 'string' && parsed.token.length > 8);
  } catch {
    return false;
  }
}

export function saveRememberedSession(rememberUser: boolean): void {
  try {
    if (rememberUser) {
      const randomBytes = new Uint8Array(16);
      crypto.getRandomValues(randomBytes);
      const token = Array.from(randomBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ rememberUser: true, token })
      );
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restriction errors
  }
}

export function logoutSettingsSession(): void {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Ignore storage restriction errors
  }
}
