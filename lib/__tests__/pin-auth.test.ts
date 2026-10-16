import { afterEach, describe, expect, it, vi } from "vitest";
import { isPinHash, hashPin, verifyPin } from "@/lib/auth/pin";
import { localBypass, newSession, pinConfig, readSession, safeReturnTo } from "@/lib/auth/session";
const config = { ownerId: "dev-user", pinHash: hashPin("0007"), secret: "a-test-secret-with-at-least-32-characters" };
afterEach(() => vi.unstubAllEnvs());
describe("private PIN and sessions", () => {
  it("preserves leading zeroes and salts each PIN hash", () => {
    expect(verifyPin("0007", config.pinHash)).toBe(true);
    expect(verifyPin("0008", config.pinHash)).toBe(false);
    expect(verifyPin("007", config.pinHash)).toBe(false);
    expect(hashPin("0007")).not.toBe(config.pinHash);
    expect(() => hashPin("abcd")).toThrow();
  });
  it("writes environment-safe hashes and accepts legacy hashes", () => {
    const encoded = hashPin("0007");
    expect(encoded).not.toContain("$");
    expect(isPinHash(encoded)).toBe(true);
    const legacy = encoded.replaceAll(":", "$");
    expect(isPinHash(legacy)).toBe(true);
    expect(verifyPin("0007", legacy)).toBe(true);
    expect(isPinHash(encoded.replace(":", "$"))).toBe(false);
  });
  it("rejects tampering, malformed cookies, expiry, changed PIN and changed owner", () => {
    const now = Date.UTC(2026,9,15);
    const session = newSession(config, false, now);
    expect(readSession(session.token, config, now)?.uid).toBe("dev-user");
    expect(readSession(`${session.token}x`,config,now)).toBeNull();
    expect(readSession(`${session.token.split('.')[0]}.${"é".repeat(43)}`,config,now)).toBeNull();
    expect(readSession(session.token,config,now+12*3600*1000)).toBeNull();
    expect(readSession(session.token,{...config,pinHash:hashPin("4321")},now)).toBeNull();
    expect(readSession(session.token,{...config,ownerId:"another-user"},now)).toBeNull();
    expect(readSession("invalid",config,now)).toBeNull();
  });
  it("remembers a device for 30 days, with 12-hour short sessions", () => {
    expect(newSession(config,true).maxAge).toBe(30*24*3600);
    expect(newSession(config,false).maxAge).toBe(12*3600);
    expect(newSession(config,true).payload.sid).not.toBe(newSession(config,true).payload.sid);
  });
  it("fails closed for incomplete configuration and never enables dev bypass on Vercel", () => {
    vi.stubEnv("APP_PIN_HASH",config.pinHash);vi.stubEnv("SESSION_SECRET","");vi.stubEnv("DEV_USER_ID","dev-user");
    expect(pinConfig()).toBeNull();expect(localBypass()).toBe(false);
    vi.stubEnv("APP_PIN_HASH","");vi.stubEnv("VERCEL_ENV","production");
    expect(localBypass()).toBe(false);
  });
  it("allows only safe internal return URLs", () => {
    expect(safeReturnTo("/problems?q=array&page=2")).toBe("/problems?q=array&page=2");
    for(const path of ["//evil.example","https://evil.example","/\\evil.example","/unlock","/api/v1/export","/\nmalicious"]) expect(safeReturnTo(path)).toBe("/");
  });
});
