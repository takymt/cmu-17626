/** HTML views; every interpolated value is escaped by `hono/html`. */

import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import type { CareEvent, Household, Member, Plant } from "../domain/models.ts";
import { localDate, localDateTime } from "../domain/time.ts";

export type View = HtmlEscapedString | Promise<HtmlEscapedString>;

const CSS = `
body { font-family: system-ui, sans-serif; max-width: 52rem; margin: 0 auto; padding: 1rem; color: #1d2b1f; background: #fbfcf8; }
header { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; border-bottom: 1px solid #cfd8c8; padding-bottom: .5rem; }
nav a { margin-right: .75rem; }
section { margin: 1rem 0; padding: .5rem 1rem; border: 1px solid #cfd8c8; border-radius: .5rem; }
section.attention { border: 2px solid #b3261e; background: #fdecea; }
section.attention h2 { color: #b3261e; }
ul { padding-left: 1rem; }
li { margin: .35rem 0; }
form.inline { display: inline; }
.error { color: #b3261e; font-weight: 600; }
.notice { color: #6b4e00; background: #fff6d6; padding: .5rem; border-radius: .25rem; }
.muted { color: #5b6b5d; }
table { border-collapse: collapse; width: 100%; }
td, th { text-align: left; padding: .25rem .5rem; border-bottom: 1px solid #e3e9de; }
`;

export type Page = {
  title: string;
  household: Household | null;
  member: Member | null;
  members: readonly Member[];
  notice?: string | null;
  error?: string | null;
  body: View;
};

function memberPicker(member: Member | null, members: readonly Member[]): View {
  const active = members.filter((m) => m.active);
  return html`<form class="inline" method="post" action="/session">
    <span>${member ? `Acting as ${member.name}` : "Choose who you are:"}</span>
    <select name="memberId" aria-label="Acting member">
      ${active.map(
        (m) =>
          html`<option value="${m.id}" ${m.id === member?.id ? "selected" : ""}>${m.name}</option>`,
      )}
    </select>
    <button>Switch</button>
  </form>`;
}

export function layout(p: Page): View {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${p.title} · Plant care</title>
<style>${raw(CSS)}</style>
</head>
<body>
<header>
  <strong>${p.household?.name ?? "Plant care"}</strong>
  ${
    p.household
      ? html`<nav><a href="/">Overview</a><a href="/plants">Plants</a><a href="/members">Members</a></nav>
          ${memberPicker(p.member, p.members)}`
      : ""
  }
</header>
${p.notice ? html`<p class="notice">${p.notice}</p>` : ""}
${p.error ? html`<p class="error">${p.error}</p>` : ""}
<main>${p.body}</main>
</body>
</html>`;
}

export function setupPage(): View {
  return html`<h1>Set up your household</h1>
<form method="post" action="/setup">
  <p><label>Household name <input name="name" required></label></p>
  <p><label>Time zone (IANA) <input name="timeZone" required placeholder="America/New_York"></label></p>
  <button>Create household</button>
</form>`;
}

export function membersPage(members: readonly Member[]): View {
  return html`<h1>Members</h1>
<ul>
  ${members.map(
    (m) =>
      html`<li>${m.name} ${
        m.active
          ? html`<form class="inline" method="post" action="/members/${m.id}/remove"><button>Remove</button></form>`
          : html`<span class="muted">(left)</span>`
      }</li>`,
  )}
</ul>
<form method="post" action="/members">
  <label>Name <input name="name" required></label>
  <button>Add member</button>
</form>`;
}

export function messagePage(heading: string, message: string): View {
  return html`<h1>${heading}</h1><p>${message}</p><p><a href="/">Back to overview</a></p>`;
}

const days = (n: number): string => (n === 1 ? "1 day" : `${n} days`);

export function plantLabel(plant: Plant): View {
  return html`<a href="/plants/${plant.id}">[${plant.id}] ${plant.name} (${plant.location})</a>`;
}

export type PlantRow = { plant: Plant; lastWatered: string };

export function plantsPage(rows: readonly PlantRow[], showAll: boolean): View {
  return html`<h1>Plants</h1>
<p>${showAll ? html`<a href="/plants">Hide archived</a>` : html`<a href="/plants?all=1">Show archived</a>`}</p>
<ul>
  ${rows.map(
    ({ plant, lastWatered }) =>
      html`<li>${plantLabel(plant)} · every ${days(plant.intervalDays)}${
        lastWatered ? ` · ${lastWatered}` : ""
      }${plant.archived ? html` · <span class="muted">archived</span>` : ""}</li>`,
  )}
</ul>
<h2>Add a plant</h2>
<form method="post" action="/plants">
  <p><label>Name <input name="name" required></label></p>
  <p><label>Location <input name="location" required></label></p>
  <p><label>Water every <input name="intervalDays" type="number" min="1" required> days</label></p>
  <button>Add plant</button>
</form>`;
}

export function plantPage(plant: Plant, sections: readonly View[]): View {
  return html`<h1>[${plant.id}] ${plant.name}</h1>
<p>${plant.location} · every ${days(plant.intervalDays)}${
    plant.archived ? html` · <span class="muted">archived</span>` : ""
  }</p>
${sections}
${
  plant.archived
    ? ""
    : html`<section id="edit"><h2>Edit</h2>
<form method="post" action="/plants/${plant.id}/edit">
  <p><label>Name <input name="name" value="${plant.name}" required></label></p>
  <p><label>Location <input name="location" value="${plant.location}" required></label></p>
  <p><label>Water every <input name="intervalDays" type="number" min="1" value="${plant.intervalDays}" required> days</label></p>
  <button>Save</button>
</form>
<form method="post" action="/plants/${plant.id}/archive"><button>Archive plant</button></form>
</section>`
}`;
}

export function lastWateredText(last: CareEvent | null, tz: string): string {
  return last
    ? `last watered ${localDate(last.occurredAt, tz)} by ${last.recordedBy}`
    : "never watered";
}

export function waterButton(plant: Plant, returnTo: string): View {
  return html`<form class="inline" method="post" action="/plants/${plant.id}/water">
  <input type="hidden" name="returnTo" value="${returnTo}"><button>Water</button>
</form>`;
}

export function waterSection(plant: Plant): View {
  return html`<section id="water"><h2>Record a watering</h2>
<form method="post" action="/plants/${plant.id}/water">
  <input type="hidden" name="returnTo" value="/plants/${plant.id}">
  <label>When (leave empty for now) <input type="datetime-local" name="at"></label>
  <button>Record watering</button>
</form>
</section>`;
}

function eventDetails(event: CareEvent, voided: ReadonlySet<number>): string {
  const details = [
    event.bringInsideDate ? `until ${event.bringInsideDate}` : null,
    event.voidsEventId !== null ? `voids #${event.voidsEventId}` : null,
    voided.has(event.id) ? "voided" : null,
    event.confirmedDuplicate ? "confirmed duplicate" : null,
  ].filter((d) => d !== null);
  return details.map((d) => ` · ${d}`).join("");
}

export function historySection(events: readonly CareEvent[], tz: string): View {
  const voided = new Set(events.map((e) => e.voidsEventId).filter((id) => id !== null));
  const ordered = [...events].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id - b.id,
  );
  return html`<section id="history"><h2>History</h2>
<ul>
  ${ordered.map(
    (e) =>
      html`<li>#${e.id} · ${localDateTime(e.occurredAt, tz)} · ${e.kind} · by ${e.recordedBy}${eventDetails(
        e,
        voided,
      )}${
        e.kind === "correction" || voided.has(e.id)
          ? ""
          : html` <form class="inline" method="post" action="/events/${e.id}/correct"><button>Correct</button></form>`
      }</li>`,
  )}
</ul>
</section>`;
}

export function confirmWaterPage(
  plant: Plant,
  last: CareEvent,
  at: string,
  returnTo: string,
  tz: string,
): View {
  return html`<h1>Already watered</h1>
<p>${plant.name} was already watered by ${last.recordedBy} at ${localDateTime(last.occurredAt, tz)}.</p>
<form method="post" action="/plants/${plant.id}/water">
  <input type="hidden" name="at" value="${at}">
  <input type="hidden" name="confirm" value="yes">
  <input type="hidden" name="expectedLastEventId" value="${last.id}">
  <input type="hidden" name="returnTo" value="${returnTo}">
  <button>Record another watering</button>
</form>
<p><a href="${returnTo}">Cancel</a></p>`;
}

export type Overview = {
  attention: readonly View[];
  dueToday: readonly View[];
  upcoming: readonly View[];
  outside: readonly View[];
};

function overviewSection(
  id: string,
  title: string,
  rows: readonly View[],
  attention = false,
): View {
  if (rows.length === 0) return html``;
  return html`<section id="${id}"${attention ? html` class="attention"` : ""}><h2>${title}</h2>
<ul>${rows.map((row) => html`<li>${row}</li>`)}</ul>
</section>`;
}

export function overviewPage(o: Overview): View {
  const empty = [o.attention, o.dueToday, o.upcoming, o.outside].every((rows) => rows.length === 0);
  return html`<h1>Overview</h1>
${empty ? html`<p>Nothing needs care right now.</p>` : ""}
${overviewSection("attention", "Needs attention", o.attention, true)}
${overviewSection("due-today", "Due today", o.dueToday)}
${overviewSection("upcoming", "Upcoming", o.upcoming)}
${overviewSection("outside", "Outside", o.outside)}`;
}

export const daysText = days;

export function locationSection(
  plant: Plant,
  moved: CareEvent | null,
  until: string | null,
  tz: string,
): View {
  if (plant.archived) return html``;
  const atField = html`<label>When (leave empty for now) <input type="datetime-local" name="at"></label>`;
  if (moved?.kind === "moved_outside" && until) {
    return html`<section id="location"><h2>Location</h2>
<p>outside until ${until} (moved out ${localDate(moved.occurredAt, tz)} by ${moved.recordedBy})</p>
<form method="post" action="/plants/${plant.id}/move-in">${atField} <button>Move inside</button></form>
<form method="post" action="/plants/${plant.id}/bring-inside-date">
  <label>Bring inside on <input type="date" name="until" value="${until}" required></label>
  <button>Change date</button>
</form>
</section>`;
  }
  return html`<section id="location"><h2>Location</h2>
<p>inside</p>
<form method="post" action="/plants/${plant.id}/move-out">
  <label>Bring inside on <input type="date" name="until" required></label>
  ${atField}
  <button>Move outside</button>
</form>
</section>`;
}
