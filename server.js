// Planner – kleiner Webserver. Daten in Supabase (oder lokal in data/db.json).
// Start: node server.js  ->  http://localhost:3000

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bardienst = require("./lib/bardienst");
const miniplan = require("./lib/miniplan");
const { createStore } = require("./lib/store");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const PLAN_TYPES = ["bardienst", "mini"];

// Welche Labels (Funktionen/Rollen) es pro Plan gibt. Reihenfolge = Anzeige-Reihenfolge.
const PLAN_LABELS = {
  bardienst: ["Beisitzer", "Chef", "Cheffe", "Kassier", "Neumitglied"],
  mini: ["Oberministrant", "Neumini", "Weihrauch"],
};

// Nur gültige Labels behalten, Duplikate entfernen, feste Reihenfolge.
function cleanLabels(plan, labels) {
  const wanted = new Set(Array.isArray(labels) ? labels : []);
  return PLAN_LABELS[plan].filter((l) => wanted.has(l));
}

// ---------- Datenspeicher ----------

const store = createStore();
let db = null; // wird beim Start geladen

async function saveDb() {
  try {
    await store.save(db);
  } catch (err) {
    console.error(err);
    throw new Error("Speichern fehlgeschlagen. Bitte später noch einmal versuchen.");
  }
}

// ---------- Passwörter & Sitzungen ----------

const SESSION_DAYS = 30;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  const expected = Buffer.from(hash, "hex");
  const actual = crypto.scryptSync(password, salt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// In der Datenbank wird nur ein Hash der Sitzungs-ID gespeichert.
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

async function createSession(req, userId) {
  const sid = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  db.sessions = db.sessions.filter((s) => s.expiresAt > Date.now());
  db.sessions.push({ idHash: sha256(sid), userId, expiresAt });
  await saveDb();
  return sessionCookie(req, sid, SESSION_DAYS * 24 * 60 * 60);
}

function sessionCookie(req, value, maxAge) {
  // Hinter HTTPS (z. B. beim Hoster) wird das Cookie zusätzlich als "Secure" markiert.
  const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  return `sid=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

// Einfacher Schutz gegen massenhaftes Passwort-Raten: max. 10 Fehlversuche / 15 Min. pro E-Mail.
const failedLogins = new Map(); // email -> { count, since }
function tooManyAttempts(email) {
  const entry = failedLogins.get(email);
  if (!entry) return false;
  if (Date.now() - entry.since > 15 * 60 * 1000) {
    failedLogins.delete(email);
    return false;
  }
  return entry.count >= 10;
}
function recordFailedLogin(email) {
  const entry = failedLogins.get(email) || { count: 0, since: Date.now() };
  entry.count++;
  failedLogins.set(email, entry);
}

const publicUser = (u) => ({ email: u.email, username: u.username });

// ---------- Hilfsfunktionen ----------

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 1e5) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > limit) reject(new Error("Die Daten sind zu groß."));
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Ungültiges JSON"));
      }
    });
  });
}

function getCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((part) => {
    const [k, ...v] = part.trim().split("=");
    if (k) out[k] = decodeURIComponent(v.join("="));
  });
  return out;
}

function currentUser(req) {
  const sid = getCookies(req).sid;
  if (!sid) return null;
  const session = db.sessions.find((s) => s.idHash === sha256(sid) && s.expiresAt > Date.now());
  return session ? db.users.find((u) => u.id === session.userId) : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------- API ----------

async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;

  if (route === "POST /api/register") {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    if (!EMAIL_RE.test(email)) return sendJson(res, 400, { error: "Bitte eine gültige E-Mail-Adresse eingeben." });
    if (username.length < 2 || username.length > 40) {
      return sendJson(res, 400, { error: "Der Benutzername muss 2 bis 40 Zeichen haben." });
    }
    if (password.length < 8) return sendJson(res, 400, { error: "Das Passwort muss mindestens 8 Zeichen haben." });
    if (password.length > 200) return sendJson(res, 400, { error: "Das Passwort ist zu lang." });

    if (db.users.some((u) => u.email === email)) {
      return sendJson(res, 409, { error: "Für diese E-Mail gibt es schon ein Konto. Bitte melde dich an." });
    }
    if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      return sendJson(res, 409, { error: "Dieser Benutzername ist schon vergeben." });
    }

    const user = {
      id: crypto.randomUUID(),
      email,
      username,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    await saveDb();
    return sendJson(res, 201, { user: publicUser(user) }, { "Set-Cookie": await createSession(req, user.id) });
  }

  if (route === "POST /api/login") {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (tooManyAttempts(email)) {
      return sendJson(res, 429, { error: "Zu viele Fehlversuche. Bitte versuche es in 15 Minuten erneut." });
    }
    const user = db.users.find((u) => u.email === email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      recordFailedLogin(email);
      return sendJson(res, 401, { error: "E-Mail oder Passwort ist falsch." });
    }
    failedLogins.delete(email);
    return sendJson(res, 200, { user: publicUser(user) }, { "Set-Cookie": await createSession(req, user.id) });
  }

  if (route === "POST /api/logout") {
    const sid = getCookies(req).sid;
    if (sid) {
      db.sessions = db.sessions.filter((s) => s.idHash !== sha256(sid));
      await saveDb();
    }
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, "", 0) });
  }

  const user = currentUser(req);
  if (!user) return sendJson(res, 401, { error: "Nicht angemeldet." });

  if (route === "GET /api/me") {
    return sendJson(res, 200, { user: publicUser(user) });
  }

  if (route === "GET /api/names") {
    const plan = url.searchParams.get("plan");
    if (!PLAN_TYPES.includes(plan)) return sendJson(res, 400, { error: "Unbekannter Plan." });
    const names = db.names
      .filter((n) => n.userId === user.id && n.plan === plan)
      .map((n) => ({ ...n, labels: n.labels || [], absences: n.absences || [] }));
    return sendJson(res, 200, { names, labels: PLAN_LABELS[plan] });
  }

  if (route === "POST /api/names") {
    const body = await readBody(req);
    const plan = body.plan;
    const name = String(body.name || "").trim();
    if (!PLAN_TYPES.includes(plan)) return sendJson(res, 400, { error: "Unbekannter Plan." });
    if (!name) return sendJson(res, 400, { error: "Bitte einen Namen eingeben." });
    if (name.length > 100) return sendJson(res, 400, { error: "Der Name ist zu lang." });

    const exists = db.names.some(
      (n) => n.userId === user.id && n.plan === plan && n.name.toLowerCase() === name.toLowerCase()
    );
    if (exists) return sendJson(res, 409, { error: `„${name}“ steht schon in der Liste.` });

    const entry = {
      id: crypto.randomUUID(),
      userId: user.id,
      plan,
      name,
      labels: cleanLabels(plan, body.labels),
      createdAt: new Date().toISOString(),
    };
    db.names.push(entry);
    await saveDb();
    return sendJson(res, 201, { name: entry });
  }

  // ---------- Abwesenheiten ----------

  // Mehrere Personen × mehrere Zeiträume auf einmal:
  // { plan, nameIds: [...], ranges: [{ from: "2026-03-01", to: "2026-03-07" }], note }
  if (route === "POST /api/absences") {
    const body = await readBody(req);
    const ids = Array.isArray(body.nameIds) ? body.nameIds : [];
    const people = db.names.filter((n) => n.userId === user.id && n.plan === body.plan && ids.includes(n.id));
    if (people.length === 0) return sendJson(res, 400, { error: "Bitte mindestens eine Person auswählen." });

    const ranges = Array.isArray(body.ranges) ? body.ranges : [];
    if (ranges.length === 0) return sendJson(res, 400, { error: "Bitte mindestens einen Zeitraum angeben." });
    const clean = [];
    for (const r of ranges) {
      const from = String(r.from || "");
      const to = String(r.to || r.from || "");
      if (!ISO_DATE_RE.test(from) || !ISO_DATE_RE.test(to)) {
        return sendJson(res, 400, { error: "Bitte bei jedem Zeitraum ein gültiges Datum angeben." });
      }
      if (to < from) return sendJson(res, 400, { error: `Das Enddatum liegt vor dem Startdatum (${from}).` });
      clean.push({ from, to });
    }
    const note = String(body.note || "").trim().slice(0, 100);

    for (const person of people) {
      person.absences = person.absences || [];
      for (const r of clean) person.absences.push({ id: crypto.randomUUID(), ...r, note });
      person.absences.sort((a, b) => a.from.localeCompare(b.from));
    }
    await saveDb();
    return sendJson(res, 201, { ok: true, added: people.length * clean.length });
  }

  // Alle Abwesenheiten eines Plans löschen
  if (route === "DELETE /api/absences") {
    const plan = url.searchParams.get("plan");
    if (!PLAN_TYPES.includes(plan)) return sendJson(res, 400, { error: "Unbekannter Plan." });
    for (const n of db.names) if (n.userId === user.id && n.plan === plan) n.absences = [];
    await saveDb();
    return sendJson(res, 200, { ok: true });
  }

  // Ganze Seite eines Plans zurücksetzen: Namen, Abwesenheiten und Pläne/Einstellungen
  if (route === "DELETE /api/plan") {
    const plan = url.searchParams.get("plan");
    if (!PLAN_TYPES.includes(plan)) return sendJson(res, 400, { error: "Unbekannter Plan." });
    db.names = db.names.filter((n) => !(n.userId === user.id && n.plan === plan));
    db.schedules = db.schedules.filter((x) => !(x.userId === user.id && x.plan === plan));
    if (plan === "mini") db.minis = db.minis.filter((m) => m.userId !== user.id);
    await saveDb();
    return sendJson(res, 200, { ok: true });
  }

  const absMatch = url.pathname.match(/^\/api\/absences\/([\w-]+)\/([\w-]+)$/);
  if (req.method === "DELETE" && absMatch) {
    const person = db.names.find((n) => n.id === absMatch[1] && n.userId === user.id);
    const before = person?.absences?.length || 0;
    if (person) person.absences = (person.absences || []).filter((a) => a.id !== absMatch[2]);
    if (!person || person.absences.length === before) return sendJson(res, 404, { error: "Abwesenheit nicht gefunden." });
    await saveDb();
    return sendJson(res, 200, { ok: true });
  }

  const delMatch = url.pathname.match(/^\/api\/names\/([\w-]+)$/);

  // Labels eines Eintrags ändern
  if (req.method === "PATCH" && delMatch) {
    const body = await readBody(req);
    const entry = db.names.find((n) => n.id === delMatch[1] && n.userId === user.id);
    if (!entry) return sendJson(res, 404, { error: "Eintrag nicht gefunden." });
    entry.labels = cleanLabels(entry.plan, body.labels);
    await saveDb();
    return sendJson(res, 200, { name: entry });
  }
  if (req.method === "DELETE" && delMatch) {
    const idx = db.names.findIndex((n) => n.id === delMatch[1] && n.userId === user.id);
    if (idx === -1) return sendJson(res, 404, { error: "Eintrag nicht gefunden." });
    db.names.splice(idx, 1);
    await saveDb();
    return sendJson(res, 200, { ok: true });
  }

  // ---------- Miniplan ----------
  // Ein Miniplan pro Benutzer: Einstellungen (Zeitraum, Gottesdienste, Anlässe, Texte),
  // optional ein Logo, und die Termine, in die die Namen von Hand eingetragen werden.

  if (url.pathname.startsWith("/api/mini")) {
    let mini = db.minis.find((m) => m.userId === user.id);
    const ensure = () => {
      if (!mini) {
        mini = { userId: user.id, settings: { ...miniplan.DEFAULT_SETTINGS }, logo: null, termine: null, updatedAt: null };
        db.minis.push(mini);
      }
      return mini;
    };

    if (route === "GET /api/mini") {
      const m = mini || { settings: miniplan.DEFAULT_SETTINGS, logo: null, termine: null, updatedAt: null };
      return sendJson(res, 200, { mini: { ...m, termine: miniplan.syncTermine(m.settings, m.termine) } });
    }

    if (route === "PUT /api/mini/settings") {
      const body = await readBody(req);
      ensure().settings = miniplan.cleanSettings(body.settings);
      mini.termine = miniplan.syncTermine(mini.settings, mini.termine);
      await saveDb();
      return sendJson(res, 200, { mini });
    }

    if (route === "PUT /api/mini/logo") {
      const body = await readBody(req, 1.5e6);
      const logo = body.logo;
      if (logo !== null && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(String(logo))) {
        return sendJson(res, 400, { error: "Bitte ein Bild (PNG oder JPEG) hochladen." });
      }
      ensure().logo = logo;
      await saveDb();
      return sendJson(res, 200, { ok: true });
    }

    // Alle Termine (Gottesdienste samt Einteilung) löschen
    if (route === "DELETE /api/mini/termine") {
      ensure().settings = { ...mini.settings, specials: [] };
      mini.termine = [];
      mini.updatedAt = null;
      await saveDb();
      return sendJson(res, 200, { mini });
    }

    // Einzelne Zelle ändern: { date, time, role: "altar"|"sammeln"|"weihrauch", slot: Index, name }
    if (route === "PATCH /api/mini/cell") {
      const body = await readBody(req);
      if (mini) mini.termine = miniplan.syncTermine(mini.settings, mini.termine);
      const t = mini?.termine?.find((x) => x.date === body.date && x.time === body.time);
      const list = t && miniplan.ROLES.includes(body.role) ? t[body.role] : null;
      if (!list || !Number.isInteger(body.slot) || body.slot < 0 || body.slot >= list.length) {
        return sendJson(res, 400, { error: "Ungültige Zelle." });
      }
      list[body.slot] = String(body.name || "").trim().slice(0, 100);
      mini.updatedAt = new Date().toISOString();
      await saveDb();
      return sendJson(res, 200, { mini });
    }
  }

  // ---------- Erstellte Pläne (bisher: Bardienstplan) ----------

  if (url.pathname.startsWith("/api/schedule")) {
    const params = req.method === "GET" ? Object.fromEntries(url.searchParams) : await readBody(req);
    const plan = params.plan;
    const year = Number(params.year);
    if (plan !== "bardienst") return sendJson(res, 400, { error: "Für diesen Plan gibt es noch keinen Generator." });
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return sendJson(res, 400, { error: "Ungültiges Jahr." });

    const find = () => db.schedules.find((s) => s.userId === user.id && s.plan === plan && s.year === year);

    if (route === "GET /api/schedule") {
      return sendJson(res, 200, { schedule: find() || null });
    }

    if (route === "POST /api/schedule/generate") {
      const people = db.names
        .filter((n) => n.userId === user.id && n.plan === plan)
        .map((n) => ({ name: n.name, labels: n.labels || [], absences: n.absences || [] }));
      if (people.length < 2) {
        return sendJson(res, 400, { error: "Bitte trage mindestens 2 Namen ein, bevor du den Plan erstellst." });
      }
      const weeks = bardienst.generate(year, people);
      let schedule = find();
      if (schedule) {
        schedule.weeks = weeks;
        schedule.updatedAt = new Date().toISOString();
      } else {
        schedule = { id: crypto.randomUUID(), userId: user.id, plan, year, weeks, updatedAt: new Date().toISOString() };
        db.schedules.push(schedule);
      }
      await saveDb();
      return sendJson(res, 200, { schedule });
    }

    // Einzelne Zelle ändern: { week: Index, slot: 0|1, name: "..." }
    if (route === "PATCH /api/schedule") {
      const schedule = find();
      if (!schedule) return sendJson(res, 404, { error: "Plan nicht gefunden." });
      const week = schedule.weeks[params.week];
      if (!week || ![0, 1].includes(params.slot)) return sendJson(res, 400, { error: "Ungültige Zelle." });
      week.names[params.slot] = String(params.name || "").trim().slice(0, 100);
      schedule.updatedAt = new Date().toISOString();
      await saveDb();
      return sendJson(res, 200, { schedule });
    }
  }

  return sendJson(res, 404, { error: "Nicht gefunden." });
}

// ---------- Statische Dateien ----------

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function serveStatic(req, res, url) {
  const rel = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Nicht gefunden");
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(content);
  });
}

// ---------- Server ----------

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
      return serveStatic(req, res, url);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  });

store
  .load()
  .then((data) => {
    db = data;
    server.listen(PORT, () => console.log(`Planner läuft auf http://localhost:${PORT} (Daten: ${store.kind})`));
  })
  .catch((err) => {
    console.error("Daten konnten nicht geladen werden:", err.message);
    process.exit(1);
  });
