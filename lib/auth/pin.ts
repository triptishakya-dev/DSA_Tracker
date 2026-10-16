import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const FORMAT = /^scrypt([:$])[a-f0-9]{32}\1[a-f0-9]{128}$/;
export function isPinHash(value: string) { return FORMAT.test(value); }
export function hashPin(pin: string) {
  if (!/^\d{4}$/.test(pin)) throw new Error("PIN must contain exactly four digits");
  const salt = randomBytes(16).toString("hex");
  // Colons survive both dotenv and Next.js environment expansion.
  return `scrypt:${salt}:${scryptSync(pin, salt, 64).toString("hex")}`;
}
export function verifyPin(pin: string, encoded: string) {
  if (!/^\d{4}$/.test(pin) || !isPinHash(encoded)) return false;
  const [, salt, expected] = encoded.split(/[:$]/);
  return timingSafeEqual(scryptSync(pin, salt, 64), Buffer.from(expected, "hex"));
}
