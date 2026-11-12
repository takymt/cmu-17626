/** HTTP routes; time comes only from the injected `now`. */

import type { DatabaseSync } from "node:sqlite";
import { type Context, Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { html } from "hono/html";
import { type Member, ValidationError } from "../domain/models.ts";
import {
  bringInsideDate,
  classify,
  isSameCycle,
  lastMove,
  lastWatering,
  needsBringInside,
} from "../domain/schedule.ts";
import { isCalendarDate, localDate, zonedToInstant } from "../domain/time.ts";
import {
  activePlant,
  addMember,
  addPlant,
  archivePlant,
  ConflictError,
  changeBringInsideDate,
  editPlant,
  findActivePlants,
  getHousehold,
  getMemberById,
  getPlant,
  initHousehold,
  isInitialized,
  listEvents,
  listMembers,
  listPlants,
  NotFoundError,
  NotInitializedError,
  recordCorrection,
  recordMove,
  recordWatering,
  removeMember,
  StaleStateError,
} from "../store.ts";
import {
  confirmWaterPage,
  daysText,
  historySection,
  lastWateredText,
  layout,
  locationSection,
  membersPage,
  messagePage,
  overviewPage,
  plantLabel,
  plantPage,
  plantsPage,
  setupPage,
  type View,
  waterButton,
  waterSection,
} from "./views.ts";

class ForbiddenError extends Error {}

type Env = { Variables: { member: Member | null } };
type Ctx = Context<Env>;

export type Deps = { db: DatabaseSync; now: () => Date };

type Form = (name: string) => string;

async function readForm(c: Ctx): Promise<Form> {
  const body = await c.req.parseBody();
  return (name) => {
    const value = body[name];
    return typeof value === "string" ? value.trim() : "";
  };
}

/** Parses a `datetime-local` value in the household zone; empty means now. */
function parseAt(input: string, tz: string, now: Date): Date {
  if (!input) return now;
  let at: Date;
  try {
    at = zonedToInstant(input, tz);
  } catch {
    throw new ValidationError(`invalid time: ${input}`);
  }
  if (at.getTime() > now.getTime()) {
    throw new ValidationError("care cannot be recorded in the future");
  }
  return at;
}

function parseDate(input: string): string {
  if (!isCalendarDate(input)) throw new ValidationError("enter a bring-inside date (YYYY-MM-DD)");
  return input;
}

const safeReturn = (path: string, fallback: string): string =>
  path.startsWith("/") && !path.startsWith("//") ? path : fallback;

export function createApp({ db, now }: Deps): Hono<Env> {
  const app = new Hono<Env>();

  function render(
    c: Ctx,
    title: string,
    body: View,
    opts: { status?: 200 | 400 | 403 | 404 | 409; notice?: string | null; error?: string } = {},
  ) {
    const household = isInitialized(db) ? getHousehold(db) : null;
    const page = layout({
      title,
      household,
      member: c.get("member"),
      members: household ? listMembers(db) : [],
      notice: opts.notice ?? c.req.query("notice") ?? null,
      error: opts.error ?? null,
      body,
    });
    return c.html(page, opts.status ?? 200);
  }

  function acting(c: Ctx): Member {
    const member = c.get("member");
    if (!member) throw new ForbiddenError("Choose who you are before recording anything.");
    return member;
  }

  app.use("*", async (c, next) => {
    if (!isInitialized(db) && !c.req.path.startsWith("/setup")) return c.redirect("/setup", 303);
    const id = Number(getCookie(c, "member"));
    let member: Member | null = null;
    if (Number.isInteger(id) && id > 0) {
      try {
        const found = getMemberById(db, id);
        member = found.active ? found : null;
      } catch {
        member = null;
      }
    }
    c.set("member", member);
    await next();
  });

  app.onError((error, c) => {
    if (error instanceof NotInitializedError) return c.redirect("/setup", 303);
    if (error instanceof ForbiddenError) {
      return render(c, "Who are you?", messagePage("Who are you?", error.message), {
        status: 403,
        error: error.message,
      });
    }
    const status =
      error instanceof ValidationError
        ? 400
        : error instanceof NotFoundError
          ? 404
          : error instanceof ConflictError
            ? 409
            : null;
    if (status === null) throw error;
    return render(c, "Something went wrong", messagePage("Not recorded", error.message), {
      status,
      error: error.message,
    });
  });

  app.get("/setup", (c) =>
    isInitialized(db) ? c.redirect("/", 303) : render(c, "Set up", setupPage()),
  );

  app.post("/setup", async (c) => {
    const form = await readForm(c);
    try {
      initHousehold(db, form("name"), form("timeZone"), now());
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      return render(c, "Set up", setupPage(), { status: 400, error: error.message });
    }
    return c.redirect("/members", 303);
  });

  app.get("/members", (c) => render(c, "Members", membersPage(listMembers(db))));

  app.post("/members", async (c) => {
    const form = await readForm(c);
    addMember(db, form("name"), now());
    return c.redirect("/members", 303);
  });

  app.post("/members/:id/remove", (c) => {
    removeMember(db, Number(c.req.param("id")));
    return c.redirect("/members", 303);
  });

  app.post("/session", async (c) => {
    const form = await readForm(c);
    const member = getMemberById(db, Number(form("memberId")));
    if (!member.active) throw new ConflictError(`${member.name} has left the household`);
    setCookie(c, "member", String(member.id), { httpOnly: true, sameSite: "Lax", path: "/" });
    return c.redirect("/", 303);
  });

  const plantFields = (form: Form) => ({
    name: form("name"),
    location: form("location"),
    intervalDays: Number(form("intervalDays") || Number.NaN),
  });
  const plantId = (c: Ctx) => Number(c.req.param("id"));

  app.get("/plants", (c) => {
    const showAll = c.req.query("all") === "1";
    const tz = getHousehold(db).timeZone;
    const rows = listPlants(db, showAll).map((plant) => ({
      plant,
      lastWatered: lastWateredText(lastWatering(listEvents(db, plant.id)), tz),
    }));
    return render(c, "Plants", plantsPage(rows, showAll));
  });

  app.post("/plants", async (c) => {
    const member = acting(c);
    const fields = plantFields(await readForm(c));
    const existing = findActivePlants(db, fields.name, fields.location);
    const plant = addPlant(db, fields, member, now());
    const notice = existing.length
      ? `?notice=${encodeURIComponent(
          `${plant.name} (${plant.location}) already exists as ${existing
            .map((p) => `[${p.id}]`)
            .join(", ")}; this new plant is [${plant.id}].`,
        )}`
      : "";
    return c.redirect(`/plants/${plant.id}${notice}`, 303);
  });

  app.get("/plants/:id", (c) => {
    const plant = getPlant(db, plantId(c));
    const tz = getHousehold(db).timeZone;
    const events = listEvents(db, plant.id);
    const sections = [
      html`<p>${lastWateredText(lastWatering(events), tz)}</p>`,
      plant.archived ? html`` : waterSection(plant),
      locationSection(plant, lastMove(events), bringInsideDate(events), tz),
      historySection(events, tz),
    ];
    return render(c, plant.name, plantPage(plant, sections));
  });

  app.post("/plants/:id/edit", async (c) => {
    const member = acting(c);
    const plant = editPlant(db, plantId(c), plantFields(await readForm(c)), member, now());
    return c.redirect(`/plants/${plant.id}`, 303);
  });

  app.post("/plants/:id/archive", (c) => {
    archivePlant(db, plantId(c), acting(c), now());
    return c.redirect("/plants", 303);
  });

  app.post("/plants/:id/water", async (c) => {
    const member = acting(c);
    const form = await readForm(c);
    const t = now();
    const tz = getHousehold(db).timeZone;
    const plant = activePlant(db, plantId(c));
    const returnTo = safeReturn(form("returnTo"), `/plants/${plant.id}`);
    const at = parseAt(form("at"), tz, t);
    const confirmed = form("confirm") === "yes";
    const ask = (last: NonNullable<ReturnType<typeof lastWatering>>) =>
      render(c, "Already watered", confirmWaterPage(plant, last, form("at"), returnTo, tz), {
        status: 409,
      });

    const last = lastWatering(listEvents(db, plant.id));
    const duplicate = isSameCycle(plant, last, at);
    if (duplicate && last && !confirmed) return ask(last);
    const expected =
      confirmed && form("expectedLastEventId")
        ? Number(form("expectedLastEventId"))
        : (last?.id ?? null);
    try {
      recordWatering(db, {
        plantId: plant.id,
        member,
        occurredAt: at,
        now: t,
        expectedLastEventId: expected,
        confirmedDuplicate: duplicate,
      });
    } catch (error) {
      if (!(error instanceof StaleStateError)) throw error;
      // Someone watered while this member was deciding: decide again on fresh data.
      const fresh = lastWatering(listEvents(db, plant.id));
      if (fresh) return ask(fresh);
      throw error;
    }
    return c.redirect(returnTo, 303);
  });

  app.post("/plants/:id/move-out", async (c) => {
    const member = acting(c);
    const form = await readForm(c);
    const t = now();
    const until = parseDate(form("until"));
    const at = parseAt(form("at"), getHousehold(db).timeZone, t);
    const plant = activePlant(db, plantId(c));
    recordMove(db, {
      plantId: plant.id,
      kind: "moved_outside",
      member,
      occurredAt: at,
      now: t,
      bringInsideDate: until,
    });
    return c.redirect(`/plants/${plant.id}`, 303);
  });

  app.post("/plants/:id/move-in", async (c) => {
    const member = acting(c);
    const form = await readForm(c);
    const t = now();
    const at = parseAt(form("at"), getHousehold(db).timeZone, t);
    const plant = activePlant(db, plantId(c));
    recordMove(db, { plantId: plant.id, kind: "moved_inside", member, occurredAt: at, now: t });
    return c.redirect(`/plants/${plant.id}`, 303);
  });

  app.post("/plants/:id/bring-inside-date", async (c) => {
    const member = acting(c);
    const until = parseDate((await readForm(c))("until"));
    const plant = activePlant(db, plantId(c));
    changeBringInsideDate(db, { plantId: plant.id, member, now: now(), bringInsideDate: until });
    return c.redirect(`/plants/${plant.id}`, 303);
  });

  app.post("/events/:id/correct", (c) => {
    const correction = recordCorrection(db, Number(c.req.param("id")), acting(c), now());
    return c.redirect(`/plants/${correction.plantId}`, 303);
  });

  app.get("/", (c) => {
    const t = now();
    const tz = getHousehold(db).timeZone;
    // Attention rows sort by days late (most first), then plant id (FR-020).
    const attention: { late: number; id: number; row: View }[] = [];
    const dueToday: View[] = [];
    const upcoming: { due: string; id: number; row: View }[] = [];
    const outside: View[] = [];
    for (const plant of listPlants(db)) {
      const events = listEvents(db, plant.id);
      const ws = classify(plant, events, t, tz);
      const last = lastWateredText(ws.last, tz);
      if (ws.status === "overdue") {
        attention.push({
          late: ws.daysOverdue,
          id: plant.id,
          row: html`${plantLabel(plant)} · OVERDUE by ${daysText(ws.daysOverdue)} · ${last} ${waterButton(plant, "/")}`,
        });
      } else if (ws.status === "due_today") {
        dueToday.push(html`${plantLabel(plant)} · ${last} ${waterButton(plant, "/")}`);
      } else if (ws.status === "upcoming" && ws.dueDate) {
        upcoming.push({
          due: ws.dueDate,
          id: plant.id,
          row: html`${plantLabel(plant)} · due ${ws.dueDate} · ${last}`,
        });
      }
      const until = bringInsideDate(events);
      if (until === null) continue;
      outside.push(html`${plantLabel(plant)} · bring inside ${until}`);
      const late = needsBringInside(plant, events, t, tz);
      const moved = lastMove(events);
      if (late !== null && moved) {
        attention.push({
          late,
          id: plant.id,
          row: html`${plantLabel(plant)} · BRING INSIDE (due ${until}) · outside since ${localDate(
            moved.occurredAt,
            tz,
          )} by ${moved.recordedBy}`,
        });
      }
    }
    attention.sort((a, b) => b.late - a.late || a.id - b.id);
    upcoming.sort((a, b) => a.due.localeCompare(b.due) || a.id - b.id);
    return render(
      c,
      "Overview",
      overviewPage({
        attention: attention.map((a) => a.row),
        dueToday,
        upcoming: upcoming.map((u) => u.row),
        outside,
      }),
    );
  });

  return app;
}
