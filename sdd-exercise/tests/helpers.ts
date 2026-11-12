import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { getMember, openDb } from "../src/store.ts";
import { createApp } from "../src/web/app.ts";

/** Noon on 2026-11-12 in the household zone (America/New_York, EST). */
export const FIXED_NOW = new Date("2026-11-12T17:00:00Z");
export const NY = "America/New_York";

export function tempDbPath(): string {
  return join(mkdtempSync(join(tmpdir(), "plantcare-")), "home.db");
}

export type Reply = { status: number; location: string | null; text: string };

type App = { request: (path: string, init: RequestInit) => Response | Promise<Response> };

export class Client {
  readonly app: App;
  readonly db: DatabaseSync;
  cookie = "";

  constructor(app: App, db: DatabaseSync) {
    this.app = app;
    this.db = db;
  }

  async get(path: string): Promise<Reply> {
    return this.send(path, { method: "GET" });
  }

  async post(path: string, form: Record<string, string> = {}): Promise<Reply> {
    return this.send(path, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
    });
  }

  /** Acts as the named member for subsequent requests. */
  async as(name: string): Promise<this> {
    const res = await this.post("/session", { memberId: String(getMember(this.db, name).id) });
    if (res.status !== 303) throw new Error(`could not act as ${name}: ${res.status}`);
    return this;
  }

  private async send(path: string, init: RequestInit): Promise<Reply> {
    const headers = new Headers(init.headers);
    if (this.cookie) headers.set("cookie", this.cookie);
    const res = await this.app.request(path, { ...init, headers });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0] ?? "";
    return { status: res.status, location: res.headers.get("location"), text: await res.text() };
  }
}

export function newApp(now: Date = FIXED_NOW): { db: DatabaseSync; client: Client } {
  const db = openDb(tempDbPath());
  const app = createApp({ db, now: () => now });
  return { db, client: new Client(app, db) };
}

/** A household in America/New_York with members Alice and Bob, acting as Alice. */
export async function household(
  now: Date = FIXED_NOW,
): Promise<{ db: DatabaseSync; client: Client }> {
  const ctx = newApp(now);
  await ctx.client.post("/setup", { name: "Home", timeZone: NY });
  await ctx.client.post("/members", { name: "Alice" });
  await ctx.client.post("/members", { name: "Bob" });
  await ctx.client.as("Alice");
  return ctx;
}

export async function addPlant(
  client: Client,
  name: string,
  location: string,
  intervalDays: number,
): Promise<number> {
  const res = await client.post("/plants", { name, location, intervalDays: String(intervalDays) });
  const id = Number(res.location?.match(/^\/plants\/(\d+)/)?.[1]);
  if (res.status !== 303 || !id)
    throw new Error(`could not add ${name}: ${res.status} ${res.text}`);
  return id;
}

/** Text of `<section id="…">` with tags stripped and whitespace collapsed, or null if absent. */
export function section(html: string, id: string): string | null {
  const match = html.match(new RegExp(`<section id="${id}"[^>]*>([\\s\\S]*?)</section>`));
  if (!match?.[1]) return null;
  return match[1]
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
