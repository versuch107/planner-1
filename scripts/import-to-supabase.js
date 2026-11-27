// Überträgt die lokalen Daten aus data/db.json einmalig nach Supabase.
// Aufruf: npm run import   (liest SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY aus .env)

const fs = require("fs");
const { createStore, DATA_FILE } = require("../lib/store");

(async () => {
  const store = createStore();
  if (store.kind !== "Supabase") throw new Error("Bitte SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY in .env eintragen.");
  const local = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const remote = await store.load();
  const remoteCount = Object.values(remote).reduce((n, list) => n + list.length, 0);
  if (remoteCount > 0 && !process.argv.includes("--force")) {
    throw new Error(`In Supabase sind schon ${remoteCount} Einträge. Mit "npm run import -- --force" werden sie durch die lokalen Daten ersetzt.`);
  }
  const db = { users: [], names: [], sessions: [], schedules: [], minis: [], ...local };
  await store.save(db);
  for (const [table, list] of Object.entries(db)) console.log(`${table}: ${list.length}`);
  console.log("Fertig – Daten sind in Supabase.");
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
