// Erstellt einen Miniplan: Termine im gewählten Zeitraum, je Termin Altardienst, Sammeln und Weihrauch.

const DAY = 24 * 60 * 60 * 1000;
const ROLES = ["altar", "sammeln", "weihrauch"];

const DEFAULT_SETTINGS = {
  from: "",
  to: "",
  // Besondere Anlässe: { date, time, title, altar, sammeln, weihrauch }
  specials: [],
  termineText: "",
  orgaText:
    "Gleicht, wie immer, die Termine im Mitteilungsblatt ab !!\n" +
    "Wenn möglich bitte ich euch noch, dass ihr mir per Mail (10 Tage vor Planende) zukommen lasst, wenn ihr nicht ministrieren könnt.",
  planBy: "",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const count = (v) => Math.max(0, Math.min(20, Math.floor(Number(v) || 0)));
const text = (v, max) => String(v ?? "").slice(0, max);

// Eingaben vom Browser prüfen und säubern.
function cleanSettings(input = {}) {
  const s = { ...DEFAULT_SETTINGS };
  if (ISO_DATE.test(input.from)) s.from = input.from;
  if (ISO_DATE.test(input.to)) s.to = input.to;
  if (Array.isArray(input.specials)) {
    s.specials = input.specials.slice(0, 200).map((r) => ({
      date: ISO_DATE.test(r.date) ? r.date : "",
      time: TIME.test(r.time) ? r.time : "",
      title: text(r.title, 80).trim(),
      altar: count(r.altar),
      sammeln: count(r.sammeln),
      weihrauch: count(r.weihrauch),
    }));
  }
  if (input.termineText !== undefined) s.termineText = text(input.termineText, 2000);
  if (input.orgaText !== undefined) s.orgaText = text(input.orgaText, 2000);
  s.planBy = text(input.planBy, 100);
  return s;
}

// Alle Termine (besondere Anlässe) im Zeitraum; steht überall 0, fällt der Termin aus.
function buildTermine(settings) {
  const { from, to } = settings;
  if (!from || !to || to < from) throw new Error("Bitte einen gültigen Zeitraum (von – bis) angeben.");
  const start = Date.parse(from + "T00:00:00Z");
  const end = Date.parse(to + "T00:00:00Z");
  if ((end - start) / DAY > 366) throw new Error("Der Zeitraum darf höchstens ein Jahr lang sein.");

  const byKey = new Map();
  for (const s of settings.specials) {
    if (!s.date || s.date < from || s.date > to) continue;
    byKey.set(`${s.date} ${s.time}`, { ...s });
  }
  return [...byKey.values()]
    .filter((t) => t.altar + t.sammeln + t.weihrauch > 0)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

// Termine passend zu den Einstellungen; bereits eingetragene Namen bleiben erhalten
// (gleicher Tag + gleiche Uhrzeit). Ungültiger Zeitraum → keine Termine.
function syncTermine(settings, old = []) {
  let termine;
  try {
    termine = buildTermine(settings);
  } catch {
    return [];
  }
  const prev = new Map((old || []).map((t) => [`${t.date} ${t.time}`, t]));
  return termine.map((t) => {
    const p = prev.get(`${t.date} ${t.time}`);
    const slots = (role) => Array.from({ length: t[role] }, (_, i) => p?.[role]?.[i] || "");
    return { date: t.date, time: t.time, title: t.title, altar: slots("altar"), sammeln: slots("sammeln"), weihrauch: slots("weihrauch") };
  });
}

module.exports = { DEFAULT_SETTINGS, ROLES, cleanSettings, buildTermine, syncTermine };
