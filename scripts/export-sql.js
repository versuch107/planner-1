// Wandelt alte lokale Daten (data/db.json) in SQL um, das du im Supabase SQL Editor ausführst.
// Vorher auf der neuen Webseite registrieren, dann:
//   node scripts/export-sql.js deine@email.de > import.sql
// Inhalt von import.sql im Supabase SQL Editor einfügen und "Run" klicken.

const fs = require("fs");
const path = require("path");

const email = (process.argv[2] || "").trim().toLowerCase();
if (!email) {
  console.error("Aufruf: node scripts/export-sql.js deine@email.de > import.sql");
  process.exit(1);
}
const db = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "db.json"), "utf8"));
const lit = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const json = (v) => `${lit(JSON.stringify(v ?? null))}::jsonb`;
const uid = `(select id from auth.users where lower(email) = ${lit(email)})`;

const out = [
  "-- Import alter Planner-Daten",
  "do $$ begin",
  `  if ${uid} is null then raise exception 'Kein Supabase-Konto mit dieser E-Mail – bitte zuerst auf der Webseite registrieren.'; end if;`,
  "end $$;",
];
for (const n of db.names || []) {
  out.push(
    `insert into public.names (user_id, plan, name, labels, absences) values (${uid}, ${lit(n.plan)}, ${lit(n.name)}, ${json(n.labels || [])}, ${json(n.absences || [])}) on conflict do nothing;`
  );
}
for (const s of db.schedules || []) {
  out.push(
    `insert into public.schedules (user_id, plan, year, weeks, updated_at) values (${uid}, ${lit(s.plan)}, ${s.year}, ${json(s.weeks)}, ${lit(s.updatedAt)}) on conflict (user_id, plan, year) do update set weeks = excluded.weeks;`
  );
}
for (const m of (db.minis || []).slice(0, 1)) {
  out.push(
    `insert into public.minis (user_id, settings, logo, termine, updated_at) values (${uid}, ${json(m.settings)}, ${lit(m.logo)}, ${json(m.termine)}, ${lit(m.updatedAt)}) on conflict (user_id) do update set settings = excluded.settings, logo = excluded.logo, termine = excluded.termine;`
  );
}
console.log(out.join("\n"));
