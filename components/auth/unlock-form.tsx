"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { ArrowRight, Check, Code2, Loader2, LockKeyhole, Moon, ShieldCheck, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const subscribe = (notify: () => void) => { const media = window.matchMedia("(prefers-color-scheme: dark)"); media.addEventListener("change", notify); return () => media.removeEventListener("change", notify); };
export function UnlockForm({ configured, returnTo }: { configured: boolean; returnTo: string }) {
  const [pin, setPin] = useState("");
  const [remember, setRemember] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [focused, setFocused] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  const systemDark = useSyncExternalStore(subscribe, () => window.matchMedia("(prefers-color-scheme: dark)").matches, () => false);
  const dark = theme ? theme === "dark" : systemDark;
  const inputRef = useRef<HTMLInputElement>(null);
  const coolingDown = cooldown > 0;
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);
  useEffect(() => {
    if (!coolingDown) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [coolingDown]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || coolingDown || pin.length !== 4 || !configured) return;
    setPending(true); setError("");
    try {
      const response = await fetch("/api/v1/auth/unlock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin, remember }), signal: AbortSignal.timeout(20_000), cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setCooldown(Math.min(86400, Math.max(0, Number(body?.error?.retryAfter ?? 0))));
        throw new Error(body?.error?.message ?? "Unable to unlock. Please try again.");
      }
      setPin("");
      window.location.replace(returnTo);
    } catch (reason) {
      setError(reason instanceof Error && reason.name !== "TimeoutError" ? reason.message : "Unable to connect. Please try again.");
      setPin(""); inputRef.current?.focus();
    } finally { setPending(false); }
  }

  return (
    <main className="relative grid min-h-dvh place-items-center px-4 py-16 sm:px-6">
      <button type="button" aria-label={`Switch to ${dark ? "light" : "dark"} theme`} onClick={() => setTheme(dark ? "light" : "dark")} className="absolute right-4 top-4 grid size-11 place-items-center rounded-full border border-border bg-card text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring sm:right-6 sm:top-6">{dark ? <Sun aria-hidden className="size-5" /> : <Moon aria-hidden className="size-5" />}</button>
      <div className="grid w-full max-w-4xl gap-8 lg:grid-cols-2 lg:items-center lg:gap-14">
        <div className="text-center lg:text-left">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"><Code2 aria-hidden className="size-4" /> Nikhil’s DSA space</span>
          <h1 className="text-balance font-heading text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Welcome back, Nikhil <span aria-hidden>👋</span></h1>
          <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted-foreground lg:mx-0">Let’s practice DSA and work toward your next product-based company.</p>
          <p className="mt-5 text-sm font-medium text-primary">One problem at a time. Consistency builds confidence.</p>
          <div className="mt-7 hidden flex-wrap gap-3 text-xs text-muted-foreground lg:flex">{["452 problems", "Your pace", "Your progress"].map((item) => <span key={item} className="inline-flex items-center gap-1.5"><Check aria-hidden className="size-3.5 text-success" />{item}</span>)}</div>
        </div>
        <section aria-labelledby="unlock-title" className="glass min-w-0 rounded-2xl border border-border p-5 shadow-xl sm:p-8">
          <span className="mb-4 grid size-12 place-items-center rounded-2xl border border-primary/25 bg-primary/10 text-primary"><LockKeyhole aria-hidden className="size-6" /></span>
          <h2 id="unlock-title" className="font-heading text-xl font-semibold">Unlock your tracker</h2>
          <p className="mt-2 text-sm text-muted-foreground">Enter your four-digit PIN to pick up where you left off.</p>
          {!configured ? <div role="alert" className="mt-5 rounded-xl border border-warning/35 bg-warning/10 p-4 text-sm"><p className="font-medium">Set up your private PIN first</p><p className="mt-2 leading-relaxed text-muted-foreground">Run <code>npm run pin:setup</code>, then restart your local app. For Vercel, add the generated server environment values and redeploy.</p></div> : null}
          <form onSubmit={submit} className="mt-6 grid gap-5">
            <div>
              <label htmlFor="owner-pin" className="mb-2 block text-xs font-medium text-muted-foreground">Four-digit PIN</label>
              <div className="relative" aria-busy={pending}>
                <input ref={inputRef} id="owner-pin" type="password" inputMode="numeric" pattern="[0-9]{4}" autoComplete="current-password" maxLength={4} required value={pin} disabled={!configured || pending || coolingDown} aria-invalid={!!error} aria-describedby={error ? "pin-error" : undefined} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChange={(event) => { setPin(event.target.value.replace(/\D/g, "").slice(0, 4)); setError(""); }} className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0 disabled:cursor-not-allowed" />
                <div aria-hidden className="pointer-events-none grid grid-cols-4 gap-3">{[0, 1, 2, 3].map((index) => <span key={index} className={cn("grid h-16 min-w-0 place-items-center rounded-xl border bg-background/60 text-2xl text-foreground transition-colors motion-reduce:transition-none", error ? "border-destructive/60" : focused && index === Math.min(pin.length, 3) ? "border-primary ring-2 ring-primary/25" : "border-input")}>{pin[index] ? "●" : <span className="size-1.5 rounded-full bg-muted-foreground/30" />}</span>)}</div>
              </div>
            </div>
            <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm"><Checkbox checked={remember} onCheckedChange={setRemember} disabled={pending || !configured} />Remember this device for 30 days</label>
            {error && <p id="pin-error" role="alert" className="text-sm text-destructive">{error}</p>}
            {coolingDown && <p role="status" className="text-xs text-muted-foreground">Try again in {Math.floor(cooldown / 60)}:{String(cooldown % 60).padStart(2, "0")}</p>}
            <Button type="submit" disabled={!configured || pending || pin.length !== 4 || coolingDown} className="h-11 w-full">{pending ? <><Loader2 aria-hidden className="size-4 animate-spin" />Unlocking…</> : <>Unlock my tracker <ArrowRight aria-hidden className="size-4" /></>}</Button>
          </form>
          <p className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground"><ShieldCheck aria-hidden className="size-3.5" />Private access. Your progress stays saved.</p>
        </section>
      </div>
    </main>
  );
}
