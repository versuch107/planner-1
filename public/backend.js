// Planner – Datenzugriff direkt auf Supabase (kein eigener Server nötig).
// Backend.request(method, url, body) bildet die frühere Server-API nach, damit die
// Oberfläche (app.js, mini.js) unverändert mit "/api/..." arbeiten kann.
// Zugriffsschutz: Row Level Security in Supabase (supabase/schema.sql).

const Backend = (() => {
  const PLAN_TYPES = ["bardienst", "mini"];
  const PLAN_LABELS = {
    bardienst: ["Beisitzer", "Chef", "Cheffe", "Kassier", "Neumitglied"],
    mini: ["Oberministrant", "Neumini", "Weihrauch"],
  };
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  const cfg = window.PLANNER_CONFIG || {};
  const configured = Boolean(cfg.supabaseUrl && cfg.supabaseKey && window.supabase);
  const sb = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey) : null;

  const fail = (status, message) => {
    throw Object.assign(new Error(message), { status });
  };
  const cleanLabels = (plan, labels) => {
    const wanted = new Set(Array.isArray(labels) ? labels : []);
    return PLAN_LABELS[plan].filter((l) => wanted.has(l));
  };
  const checkPlan = (plan) => {
    if (!PLAN_TYPES.includes(plan)) fail(400, "Unbekannter Plan.");
  };
  const now = () => new Date().toISOString();

  // Supabase-Antwort prüfen und Fehler verständlich machen.
  function check({ data, error }) {
    if (!error) return data;
    console.error(error);
    if (error.code === "PGRST301" || /JWT/i.test(error.message)) fail(401, "Bitte melde dich erneut an.");
    if (error.code === "23505") fail(409, "Das gibt es schon.");
    fail(400, "Speichern fehlgeschlagen. Bitte versuche es noch einmal.");
  }

  const publicUser = (u) => ({ email: u.email, username: u.user_metadata?.username || u.email.split("@")[0] });

  async function currentUser() {
    const { data } = await sb.auth.getSession();
    const user = data.session?.user;
    if (!user) fail(401, "Nicht angemeldet.");
    return user;
  }

  // ---------- Namen ----------

  const toName = (r) => ({ id: r.id, plan: r.plan, name: r.name, labels: r.labels || [], absences: r.absences || [], createdAt: r.created_at });

  async function listNames(plan) {
    const rows = check(await sb.from("names").select("*").eq("plan", plan).order("created_at"));
    return rows.map(toName);
  }

  async function getName(id) {
    const row = check(await sb.from("names").select("*").eq("id", id).maybeSingle());
    if (!row) fail(404, "Eintrag nicht gefunden.");
    return toName(row);
  }

  // ---------- Miniplan ----------

  async function getMini() {
    const row = check(await sb.from("minis").select("*").maybeSingle());
    const settings = { ...Miniplan.DEFAULT_SETTINGS, ...(row?.settings || {}) };
    return {
      settings,
      logo: row?.logo ?? null,
      termine: Miniplan.syncTermine(settings, row?.termine),
      updatedAt: row?.updated_at ?? null,
    };
  }

  async function saveMini(user, mini) {
    check(
      await sb.from("minis").upsert({
        user_id: user.id,
        settings: mini.settings,
        logo: mini.logo,
        termine: mini.termine,
        updated_at: mini.updatedAt,
      })
    );
    return mini;
  }

  // ---------- Bardienst ----------

  const toSchedule = (r) => r && { id: r.id, plan: r.plan, year: r.year, weeks: r.weeks, updatedAt: r.updated_at };

  async function findSchedule(plan, year) {
    return toSchedule(check(await sb.from("schedules").select("*").eq("plan", plan).eq("year", year).maybeSingle()));
  }

  // ---------- Routen ----------

  async function request(method, url, body = {}) {
    if (!configured) fail(503, "Supabase ist noch nicht eingerichtet – bitte public/config.js ausfüllen.");
    const u = new URL(url, location.href);
    const path = u.pathname.replace(/^.*\/api\//, "/api/");
    const q = Object.fromEntries(u.searchParams);
    const route = `${method} ${path}`;

    // --- Anmeldung ---

    if (route === "POST /api/register") {
      const email = String(body.email || "").trim().toLowerCase();
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      if (!EMAIL_RE.test(email)) fail(400, "Bitte eine gültige E-Mail-Adresse eingeben.");
      if (username.length < 2 || username.length > 40) fail(400, "Der Benutzername muss 2 bis 40 Zeichen haben.");
      if (password.length < 8) fail(400, "Das Passwort muss mindestens 8 Zeichen haben.");

      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { username }, emailRedirectTo: location.origin + location.pathname },
      });
      if (error) {
        if (/already registered|already exists/i.test(error.message)) {
          fail(409, "Für diese E-Mail gibt es schon ein Konto. Bitte melde dich an.");
        }
        fail(400, error.message);
      }
      // Ist E-Mail-Bestätigung aktiv, gibt es erst nach dem Klick auf den Link eine Sitzung.
      if (!data.session) return { user: null, confirmEmail: true };
      return { user: publicUser(data.user) };
    }

    if (route === "POST /api/login") {
      const { data, error } = await sb.auth.signInWithPassword({
        email: String(body.email || "").trim().toLowerCase(),
        password: String(body.password || ""),
      });
      if (error) {
        if (/not confirmed/i.test(error.message)) fail(401, "Bitte bestätige zuerst deine E-Mail-Adresse (Link in der E-Mail).");
        if (/rate limit|too many/i.test(error.message)) fail(429, "Zu viele Versuche. Bitte warte kurz.");
        fail(401, "E-Mail oder Passwort ist falsch.");
      }
      return { user: publicUser(data.user) };
    }

    if (route === "POST /api/logout") {
      await sb.auth.signOut();
      return { ok: true };
    }

    const user = await currentUser();

    if (route === "GET /api/me") return { user: publicUser(user) };

    // --- Namen ---

    if (route === "GET /api/names") {
      checkPlan(q.plan);
      return { names: await listNames(q.plan), labels: PLAN_LABELS[q.plan] };
    }

    if (route === "POST /api/names") {
      checkPlan(body.plan);
      const name = String(body.name || "").trim();
      if (!name) fail(400, "Bitte einen Namen eingeben.");
      if (name.length > 100) fail(400, "Der Name ist zu lang.");
      const res = await sb
        .from("names")
        .insert({ user_id: user.id, plan: body.plan, name, labels: cleanLabels(body.plan, body.labels) })
        .select()
        .single();
      if (res.error?.code === "23505") fail(409, `„${name}“ steht schon in der Liste.`);
      return { name: toName(check(res)) };
    }

    const nameMatch = path.match(/^\/api\/names\/([\w-]+)$/);
    if (method === "PATCH" && nameMatch) {
      const entry = await getName(nameMatch[1]);
      const labels = cleanLabels(entry.plan, body.labels);
      check(await sb.from("names").update({ labels }).eq("id", entry.id));
      return { name: { ...entry, labels } };
    }
    if (method === "DELETE" && nameMatch) {
      check(await sb.from("names").delete().eq("id", nameMatch[1]));
      return { ok: true };
    }

    // --- Abwesenheiten ---

    if (route === "POST /api/absences") {
      checkPlan(body.plan);
      const ids = Array.isArray(body.nameIds) ? body.nameIds : [];
      if (!ids.length) fail(400, "Bitte mindestens eine Person auswählen.");
      const ranges = Array.isArray(body.ranges) ? body.ranges : [];
      if (!ranges.length) fail(400, "Bitte mindestens einen Zeitraum angeben.");
      const clean = ranges.map((r) => {
        const from = String(r.from || "");
        const to = String(r.to || r.from || "");
        if (!ISO_DATE_RE.test(from) || !ISO_DATE_RE.test(to)) fail(400, "Bitte bei jedem Zeitraum ein gültiges Datum angeben.");
        if (to < from) fail(400, `Das Enddatum liegt vor dem Startdatum (${from}).`);
        return { from, to };
      });
      const note = String(body.note || "").trim().slice(0, 100);

      const people = (await listNames(body.plan)).filter((n) => ids.includes(n.id));
      if (!people.length) fail(400, "Bitte mindestens eine Person auswählen.");
      for (const p of people) {
        const absences = [...p.absences, ...clean.map((r) => ({ id: crypto.randomUUID(), ...r, note }))];
        absences.sort((a, b) => a.from.localeCompare(b.from));
        check(await sb.from("names").update({ absences }).eq("id", p.id));
      }
      return { ok: true, added: people.length * clean.length };
    }

    if (route === "DELETE /api/absences") {
      checkPlan(q.plan);
      check(await sb.from("names").update({ absences: [] }).eq("plan", q.plan));
      return { ok: true };
    }

    const absMatch = path.match(/^\/api\/absences\/([\w-]+)\/([\w-]+)$/);
    if (method === "DELETE" && absMatch) {
      const person = await getName(absMatch[1]);
      const absences = person.absences.filter((a) => a.id !== absMatch[2]);
      if (absences.length === person.absences.length) fail(404, "Abwesenheit nicht gefunden.");
      check(await sb.from("names").update({ absences }).eq("id", person.id));
      return { ok: true };
    }

    // --- Ganze Seite zurücksetzen ---

    if (route === "DELETE /api/plan") {
      checkPlan(q.plan);
      check(await sb.from("names").delete().eq("plan", q.plan));
      check(await sb.from("schedules").delete().eq("plan", q.plan));
      if (q.plan === "mini") check(await sb.from("minis").delete().eq("user_id", user.id));
      return { ok: true };
    }

    // --- Miniplan ---

    if (route === "GET /api/mini") return { mini: await getMini() };

    if (route === "PUT /api/mini/settings") {
      const mini = await getMini();
      mini.settings = Miniplan.cleanSettings(body.settings);
      mini.termine = Miniplan.syncTermine(mini.settings, mini.termine);
      return { mini: await saveMini(user, mini) };
    }

    if (route === "PUT /api/mini/logo") {
      const logo = body.logo;
      if (logo !== null && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(String(logo))) {
        fail(400, "Bitte ein Bild (PNG oder JPEG) hochladen.");
      }
      if (logo && logo.length > 1.4e6) fail(400, "Das Bild ist zu groß.");
      const mini = await getMini();
      mini.logo = logo;
      await saveMini(user, mini);
      return { ok: true };
    }

    if (route === "DELETE /api/mini/termine") {
      const mini = await getMini();
      mini.settings = { ...mini.settings, specials: [] };
      mini.termine = [];
      mini.updatedAt = null;
      return { mini: await saveMini(user, mini) };
    }

    if (route === "PATCH /api/mini/cell") {
      const mini = await getMini();
      const t = mini.termine.find((x) => x.date === body.date && x.time === body.time);
      const list = t && Miniplan.ROLES.includes(body.role) ? t[body.role] : null;
      if (!list || !Number.isInteger(body.slot) || body.slot < 0 || body.slot >= list.length) fail(400, "Ungültige Zelle.");
      list[body.slot] = String(body.name || "").trim().slice(0, 100);
      mini.updatedAt = now();
      return { mini: await saveMini(user, mini) };
    }

    // --- Bardienstplan ---

    if (path.startsWith("/api/schedule")) {
      const params = method === "GET" ? q : body;
      const plan = params.plan;
      const year = Number(params.year);
      if (plan !== "bardienst") fail(400, "Für diesen Plan gibt es noch keinen Generator.");
      if (!Number.isInteger(year) || year < 2000 || year > 2100) fail(400, "Ungültiges Jahr.");

      if (route === "GET /api/schedule") return { schedule: await findSchedule(plan, year) };

      if (route === "POST /api/schedule/generate") {
        const people = (await listNames(plan)).map((n) => ({ name: n.name, labels: n.labels, absences: n.absences }));
        if (people.length < 2) fail(400, "Bitte trage mindestens 2 Namen ein, bevor du den Plan erstellst.");
        const weeks = Bardienst.generate(year, people);
        const row = check(
          await sb
            .from("schedules")
            .upsert({ user_id: user.id, plan, year, weeks, updated_at: now() }, { onConflict: "user_id,plan,year" })
            .select()
            .single()
        );
        return { schedule: toSchedule(row) };
      }

      if (route === "PATCH /api/schedule") {
        const schedule = await findSchedule(plan, year);
        if (!schedule) fail(404, "Plan nicht gefunden.");
        const week = schedule.weeks[params.week];
        if (!week || ![0, 1].includes(params.slot)) fail(400, "Ungültige Zelle.");
        week.names[params.slot] = String(params.name || "").trim().slice(0, 100);
        const row = check(
          await sb.from("schedules").update({ weeks: schedule.weeks, updated_at: now() }).eq("id", schedule.id).select().single()
        );
        return { schedule: toSchedule(row) };
      }
    }

    fail(404, "Nicht gefunden.");
  }

  return { request, configured };
})();
