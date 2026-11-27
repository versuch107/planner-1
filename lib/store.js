// Datenspeicher. Der Server arbeitet mit einem Objekt im Arbeitsspeicher
// ({ users, names, sessions, schedules, minis }); save() schreibt die Änderungen weg.
//
// - Sind SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY gesetzt: Supabase (Postgres).
//   Es werden nur geänderte, neue und gelöschte Zeilen übertragen.
// - Sonst: lokale Datei data/db.json (zum Entwickeln).
//
// Wichtig: Bei Supabase darf nur EINE Server-Instanz laufen, da die Daten beim
// Start einmal geladen und danach im Speicher gehalten werden.

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "data", "db.json");
const EMPTY = () => ({ users: [], names: [], sessions: [], schedules: [], minis: [] });

// Tabelle ↔ Feld-Zuordnung (JS-Feld → Spalte)
const TABLES = {
  users: { key: "id", cols: { id: "id", email: "email", username: "username", passwordHash: "password_hash", createdAt: "created_at" } },
  sessions: { key: "idHash", cols: { idHash: "id_hash", userId: "user_id", expiresAt: "expires_at" } },
  names: {
    key: "id",
    cols: { id: "id", userId: "user_id", plan: "plan", name: "name", labels: "labels", absences: "absences", createdAt: "created_at" },
  },
  schedules: { key: "id", cols: { id: "id", userId: "user_id", plan: "plan", year: "year", weeks: "weeks", updatedAt: "updated_at" } },
  minis: { key: "userId", cols: { userId: "user_id", settings: "settings", logo: "logo", termine: "termine", updatedAt: "updated_at" } },
};
// Reihenfolge wegen Fremdschlüsseln: erst users anlegen, zuletzt users löschen.
const ORDER = ["users", "sessions", "names", "schedules", "minis"];

const toRow = (table, obj) => {
  const row = {};
  for (const [field, col] of Object.entries(TABLES[table].cols)) row[col] = obj[field] ?? null;
  if (table === "names") {
    row.labels = row.labels || [];
    row.absences = row.absences || [];
  }
  return row;
};
const fromRow = (table, row) => {
  const obj = {};
  for (const [field, col] of Object.entries(TABLES[table].cols)) obj[field] = row[col];
  if (table === "sessions") obj.expiresAt = Number(obj.expiresAt);
  return obj;
};

// ---------- Datei ----------

function fileStore() {
  return {
    kind: "Datei data/db.json",
    async load() {
      try {
        return { ...EMPTY(), ...JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) };
      } catch {
        return EMPTY();
      }
    },
    async save(db) {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
    },
  };
}

// ---------- Supabase ----------

function supabaseStore(url, key) {
  const { createClient } = require("@supabase/supabase-js");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const saved = Object.fromEntries(ORDER.map((t) => [t, new Map()])); // key -> JSON des gespeicherten Stands
  let queue = Promise.resolve();

  const check = (error, what) => {
    if (error) throw new Error(`Supabase (${what}): ${error.message}`);
  };

  async function loadTable(table) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await client.from(table).select("*").range(from, from + 999);
      check(error, `${table} laden`);
      rows.push(...data);
      if (data.length < 1000) break;
    }
    return rows.map((r) => fromRow(table, r));
  }

  async function flush(db) {
    const changes = {};
    for (const table of ORDER) {
      const { key } = TABLES[table];
      const current = new Map((db[table] || []).map((o) => [String(o[key]), o]));
      const upserts = [];
      for (const [k, obj] of current) {
        const json = JSON.stringify(toRow(table, obj));
        if (saved[table].get(k) !== json) upserts.push([k, json]);
      }
      const deletes = [...saved[table].keys()].filter((k) => !current.has(k));
      changes[table] = { upserts, deletes };
    }
    for (const table of ORDER) {
      const { upserts } = changes[table];
      if (!upserts.length) continue;
      const { error } = await client.from(table).upsert(upserts.map(([, json]) => JSON.parse(json)));
      check(error, `${table} speichern`);
      for (const [k, json] of upserts) saved[table].set(k, json);
    }
    for (const table of [...ORDER].reverse()) {
      const { deletes } = changes[table];
      if (!deletes.length) continue;
      const col = TABLES[table].cols[TABLES[table].key];
      for (let i = 0; i < deletes.length; i += 200) {
        const part = deletes.slice(i, i + 200);
        const { error } = await client.from(table).delete().in(col, part);
        check(error, `${table} löschen`);
        part.forEach((k) => saved[table].delete(k));
      }
    }
  }

  return {
    kind: "Supabase",
    async load() {
      const db = EMPTY();
      for (const table of ORDER) {
        db[table] = await loadTable(table);
        const { key } = TABLES[table];
        for (const o of db[table]) saved[table].set(String(o[key]), JSON.stringify(toRow(table, o)));
      }
      return db;
    },
    // Speichervorgänge laufen nacheinander, damit sich nichts überholt.
    save(db) {
      const run = queue.then(() => flush(db));
      queue = run.catch(() => {});
      return run;
    },
  };
}

function createStore() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) return supabaseStore(url, key);
  if (url || key) throw new Error("Bitte SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY beide setzen.");
  return fileStore();
}

module.exports = { createStore, DATA_FILE };
