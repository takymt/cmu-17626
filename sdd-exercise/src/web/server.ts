import { serve } from "@hono/node-server";
import { openDb } from "../store.ts";
import { createApp } from "./app.ts";

// The only place that reads the real clock; everything else receives `now`.
const db = openDb(process.env.PLANTCARE_DB ?? "plantcare.db");
const app = createApp({ db, now: () => new Date() });
const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Plant care is running on http://localhost:${info.port}`);
});
