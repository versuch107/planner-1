// Planner – Frontend-Logik

const PLAN_TITLES = { bardienst: "Bardienstplan", mini: "Miniplan" };
let currentPlan = null;

const $ = (sel) => document.querySelector(sel);

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "Fehler"), { status: res.status });
  return data;
}

function showView(name) {
  for (const v of ["login", "choose", "names"]) $(`#view-${v}`).hidden = v !== name;
}

function showError(el, msg) {
  el.textContent = msg || "";
  el.hidden = !msg;
}

function setUser(user) {
  $("#userbox").hidden = !user;
  $("#userLabel").textContent = user ? `${user.username} (${user.email})` : "";
}

// ---------- Anmeldung ----------

function switchTab(tab) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  $("#loginForm").hidden = tab !== "login";
  $("#registerForm").hidden = tab !== "register";
}
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.tab)));

function onLoggedIn(user) {
  for (const f of [$("#loginForm"), $("#registerForm")]) {
    f.reset();
    showError(f.querySelector(".error"));
  }
  setUser(user);
  showView("choose");
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  try {
    const { user } = await api("POST", "/api/login", {
      email: form.get("email"),
      password: form.get("password"),
    });
    onLoggedIn(user);
  } catch (err) {
    showError(e.target.querySelector(".error"), err.message);
  }
});

$("#registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const errorEl = e.target.querySelector(".error");
  if (form.get("password") !== form.get("password2")) {
    return showError(errorEl, "Die Passwörter stimmen nicht überein.");
  }
  try {
    const { user } = await api("POST", "/api/register", {
      email: form.get("email"),
      username: form.get("username"),
      password: form.get("password"),
    });
    onLoggedIn(user);
  } catch (err) {
    showError(errorEl, err.message);
  }
});

$("#logoutBtn").addEventListener("click", async () => {
  await api("POST", "/api/logout").catch(() => {});
  setUser(null);
  switchTab("login");
  showView("login");
});

// ---------- Planauswahl ----------

document.querySelectorAll(".choice").forEach((btn) =>
  btn.addEventListener("click", () => openPlan(btn.dataset.plan))
);

$("#backBtn").addEventListener("click", () => showView("choose"));

async function openPlan(plan) {
  currentPlan = plan;
  newLabels = new Set();
  filterLabels = new Set();
  editingId = null;
  resetAbsenceForm();
  $("#planTitle").textContent = PLAN_TITLES[plan];
  showError($("#nameError"));
  showView("names");
  if (!$("#scheduleYear").value) $("#scheduleYear").value = new Date().getFullYear() + 1;
  await loadNames();
  await loadSchedule();
  await loadMini();
  $("#nameForm input").focus();
}

// ---------- Namen ----------

// ---------- Labels ----------

let planLabels = [];        // verfügbare Labels des aktuellen Plans
let allNames = [];          // zuletzt geladene Einträge
let newLabels = new Set();  // Auswahl im "Hinzufügen"-Formular
let filterLabels = new Set(); // aktive Filter
let editingId = null;       // Eintrag, dessen Labels gerade bearbeitet werden

const labelClass = (label) => `c${planLabels.indexOf(label) % 5}`;

function chip(label, tag = "span") {
  const el = document.createElement(tag);
  el.className = `chip ${labelClass(label)}`;
  el.textContent = label;
  if (tag === "button") el.type = "button";
  return el;
}

// Reihe von Umschalt-Chips; "selected" ist ein Set, onToggle bekommt das neue Set.
function renderPicker(container, selected, onToggle) {
  container.innerHTML = "";
  for (const label of planLabels) {
    const btn = chip(label, "button");
    btn.setAttribute("aria-pressed", selected.has(label));
    btn.addEventListener("click", () => {
      const next = new Set(selected);
      next.has(label) ? next.delete(label) : next.add(label);
      onToggle(next);
    });
    container.append(btn);
  }
}

function renderNewLabelPicker() {
  renderPicker($("#newLabels"), newLabels, (next) => {
    newLabels = next;
    renderNewLabelPicker();
  });
}

function renderFilter() {
  $("#labelFilter").hidden = allNames.length === 0;
  renderPicker($("#labelFilter .label-picker"), filterLabels, (next) => {
    filterLabels = next;
    renderFilter();
    renderNames();
  });
}

// ---------- Namen ----------

async function loadNames() {
  try {
    const data = await api("GET", `/api/names?plan=${currentPlan}`);
    planLabels = data.labels;
    allNames = data.names;
    renderNewLabelPicker();
    renderFilter();
    renderNames();
    renderAbsences();
    if (schedule) renderSchedule(); // Auswahllisten & Konflikte im Plan aktualisieren
    if (currentPlan === "mini") renderMini();
  } catch (err) {
    if (err.status === 401) return showView("login");
    showError($("#nameError"), err.message);
  }
}

function renderNames() {
  const list = $("#nameList");
  list.innerHTML = "";
  // Filter: Eintrag muss ALLE gewählten Labels haben
  const visible = allNames.filter((n) => [...filterLabels].every((l) => n.labels.includes(l)));

  for (const n of visible) {
    const li = document.createElement("li");
    const main = document.createElement("div");
    main.className = "entry-main";

    const name = document.createElement("span");
    name.className = "entry-name";
    name.textContent = n.name;
    main.append(name, ...n.labels.map((l) => chip(l)));

    const actions = document.createElement("div");
    actions.className = "entry-actions";
    const edit = document.createElement("button");
    edit.className = "icon-btn";
    edit.title = "Labels bearbeiten";
    edit.setAttribute("aria-label", `Labels von ${n.name} bearbeiten`);
    edit.textContent = "✎";
    edit.addEventListener("click", () => {
      editingId = editingId === n.id ? null : n.id;
      renderNames();
    });
    const del = document.createElement("button");
    del.className = "icon-btn remove";
    del.title = "Entfernen";
    del.setAttribute("aria-label", `${n.name} entfernen`);
    del.textContent = "×";
    del.addEventListener("click", () => removeName(n.id));
    actions.append(edit, del);
    main.append(actions);
    li.append(main);

    if (editingId === n.id) {
      const editRow = document.createElement("div");
      editRow.className = "label-picker entry-edit";
      renderPicker(editRow, new Set(n.labels), (next) => updateLabels(n.id, next));
      li.append(editRow);
    }
    list.append(li);
  }

  const filtered = filterLabels.size > 0;
  $("#nameCount").textContent = filtered ? `${visible.length} von ${allNames.length}` : allNames.length;
  $("#emptyHint").hidden = visible.length > 0;
  $("#emptyHint").textContent = filtered
    ? "Niemand hat alle gewählten Labels."
    : "Noch keine Namen eingetragen.";
}

async function updateLabels(id, labels) {
  try {
    const { name } = await api("PATCH", `/api/names/${id}`, { labels: [...labels] });
    allNames = allNames.map((n) => ({ ...(n.id === id ? name : n), absences: n.absences }));
    renderNames();
    if (currentPlan === "mini") renderMini(); // Oberminis-Auswahl aktualisieren
  } catch (err) {
    if (err.status === 401) return showView("login");
    showError($("#nameError"), err.message);
  }
}

$("#nameForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = e.target.elements.name;
  try {
    await api("POST", "/api/names", { plan: currentPlan, name: input.value, labels: [...newLabels] });
    input.value = "";
    newLabels = new Set();
    showError($("#nameError"));
    await loadNames();
  } catch (err) {
    if (err.status === 401) return showView("login");
    showError($("#nameError"), err.message);
  }
  input.focus();
});

// ---------- Abwesenheiten ----------

let absencePeople = new Set(); // ausgewählte Personen-IDs

const fmtRange = (a) => (a.from === a.to ? fmtDate(a.from) : `${fmtDate(a.from)} – ${fmtDate(a.to)}`);

function addRangeRow(from = "", to = "") {
  const row = document.createElement("div");
  row.className = "range-row";
  row.innerHTML = `
    <input type="date" class="from" aria-label="Von" required />
    <span>bis</span>
    <input type="date" class="to" aria-label="Bis (optional)" />
    <button type="button" class="icon-btn remove" title="Zeitraum entfernen" aria-label="Zeitraum entfernen">×</button>`;
  row.querySelector(".from").value = from;
  row.querySelector(".to").value = to;
  // "Bis" darf nicht vor "Von" liegen
  row.querySelector(".from").addEventListener("change", (e) => (row.querySelector(".to").min = e.target.value));
  row.querySelector(".remove").addEventListener("click", () => {
    row.remove();
    if (!$("#absenceRanges").children.length) addRangeRow();
  });
  $("#absenceRanges").append(row);
}

function resetAbsenceForm() {
  absencePeople = new Set();
  $("#absenceRanges").innerHTML = "";
  addRangeRow();
  $("#absenceForm").elements.note.value = "";
  showError($("#absenceForm .error"));
}

function renderAbsencePeople() {
  const box = $("#absencePeople");
  box.innerHTML = "";
  // Personen, die es nicht mehr gibt, aus der Auswahl nehmen
  absencePeople = new Set([...absencePeople].filter((id) => allNames.some((n) => n.id === id)));
  for (const n of allNames) {
    const btn = chip(n.name, "button");
    btn.className = "chip person";
    btn.setAttribute("aria-pressed", absencePeople.has(n.id));
    btn.addEventListener("click", () => {
      absencePeople.has(n.id) ? absencePeople.delete(n.id) : absencePeople.add(n.id);
      renderAbsencePeople();
    });
    box.append(btn);
  }
}

function renderAbsences() {
  $("#absenceSection").hidden = allNames.length === 0;
  $("#clearAbsencesBtn").hidden = !allNames.some((n) => n.absences.length);
  renderAbsencePeople();

  const list = $("#absenceList");
  list.innerHTML = "";
  const withAbsences = allNames.filter((n) => n.absences.length);
  for (const n of withAbsences) {
    const li = document.createElement("li");
    const who = document.createElement("div");
    who.className = "absence-person";
    who.textContent = n.name;
    const items = document.createElement("div");
    items.className = "absence-items";
    for (const a of n.absences) {
      const item = document.createElement("span");
      item.className = "absence-item";
      item.textContent = fmtRange(a);
      if (a.note) {
        const note = document.createElement("span");
        note.className = "note";
        note.textContent = `· ${a.note}`;
        item.append(" ", note);
      }
      const del = document.createElement("button");
      del.className = "icon-btn remove";
      del.textContent = "×";
      del.title = "Abwesenheit löschen";
      del.setAttribute("aria-label", `Abwesenheit ${fmtRange(a)} von ${n.name} löschen`);
      del.addEventListener("click", () => removeAbsence(n.id, a.id));
      item.append(del);
      items.append(item);
    }
    li.append(who, items);
    list.append(li);
  }
}

$("#absenceAll").addEventListener("click", () => {
  absencePeople = new Set(allNames.map((n) => n.id));
  renderAbsencePeople();
});
$("#absenceNone").addEventListener("click", () => {
  absencePeople = new Set();
  renderAbsencePeople();
});
$("#addRangeBtn").addEventListener("click", () => addRangeRow());

$("#absenceForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = e.target.querySelector(".error");
  const ranges = [...document.querySelectorAll("#absenceRanges .range-row")].map((row) => ({
    from: row.querySelector(".from").value,
    to: row.querySelector(".to").value || row.querySelector(".from").value,
  }));
  if (!absencePeople.size) return showError(errorEl, "Bitte mindestens eine Person auswählen.");
  try {
    await api("POST", "/api/absences", {
      plan: currentPlan,
      nameIds: [...absencePeople],
      ranges,
      note: e.target.elements.note.value,
    });
    resetAbsenceForm();
    await loadNames();
  } catch (err) {
    if (err.status === 401) return showView("login");
    showError(errorEl, err.message);
  }
});

async function removeAbsence(nameId, absenceId) {
  try {
    await api("DELETE", `/api/absences/${nameId}/${absenceId}`);
    await loadNames();
  } catch (err) {
    showError($("#absenceForm .error"), err.message);
  }
}

// ---------- Erstellter Plan ----------

let schedule = null;      // aktuell angezeigter Plan
let savedSchedule = null; // gespeicherter Plan des gewählten Jahres (noch nicht angezeigt)

const fmtDate = (isoDate) => isoDate.split("-").reverse().join(".");

// Prüft nur, ob es für das Jahr schon einen Plan gibt – angezeigt wird er erst per Klick.
async function loadSchedule() {
  const show = currentPlan === "bardienst";
  $("#scheduleSection").hidden = !show;
  schedule = null;
  savedSchedule = null;
  renderSchedule();
  if (!show) return;
  try {
    const data = await api("GET", `/api/schedule?plan=${currentPlan}&year=${$("#scheduleYear").value}`);
    savedSchedule = data.schedule;
    renderSchedule();
  } catch (err) {
    showError($("#scheduleError"), err.message);
  }
}

$("#openSavedBtn").addEventListener("click", () => {
  schedule = savedSchedule;
  renderSchedule();
});

function renderSchedule() {
  showError($("#scheduleError"));
  $("#scheduleResult").hidden = !schedule;
  $("#openSavedBtn").hidden = !savedSchedule || !!schedule;
  $("#generateBtn").textContent = schedule || savedSchedule ? "Neu erstellen" : "Plan erstellen";
  $("#downloadMenu").open = false;
  if (!schedule) return;

  $("#printTitle").textContent = `${PLAN_TITLES[currentPlan]} ${schedule.year}`;
  $("#scheduleInfo").textContent =
    `${schedule.weeks.length} Wochen · zuletzt geändert ${new Date(schedule.updatedAt).toLocaleString("de-DE")} · Namen anklicken zum Ändern`;

  const tbody = $("#scheduleTable tbody");
  tbody.innerHTML = "";
  const known = allNames.map((n) => n.name);

  schedule.weeks.forEach((week, w) => {
    const tr = document.createElement("tr");
    const td = (text, cls) => {
      const el = document.createElement("td");
      el.textContent = text;
      if (cls) el.className = cls;
      return el;
    };
    tr.append(td(fmtDate(week.start), "date"), td("bis", "bis"), td(fmtDate(week.end), "date"));

    week.names.forEach((current, slot) => {
      const cell = document.createElement("td");
      const select = document.createElement("select");
      select.setAttribute("aria-label", `Woche ab ${fmtDate(week.start)}, Name ${slot + 1}`);
      const options = ["", ...known];
      if (current && !known.includes(current)) options.push(current); // z. B. inzwischen gelöschter Name
      for (const name of options) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name || "—";
        opt.selected = name === current;
        select.append(opt);
      }
      select.addEventListener("change", () => updateCell(w, slot, select.value));
      // Konflikt markieren: Person ist in dieser Woche abwesend
      const person = allNames.find((n) => n.name === current);
      const clash = person?.absences.find((a) => a.from <= week.end && a.to >= week.start);
      if (clash) {
        cell.classList.add("conflict");
        select.title = `${current} ist abwesend: ${fmtRange(clash)}${clash.note ? ` (${clash.note})` : ""}`;
        select.setAttribute("aria-label", `${select.getAttribute("aria-label")} – Achtung, abwesend`);
      }
      const printName = document.createElement("span");
      printName.className = "print-name";
      printName.textContent = current;
      select.classList.add("screen-only");
      cell.append(select, printName);
      tr.append(cell);
    });
    tbody.append(tr);
  });

  // Statistik
  const counts = new Map();
  schedule.weeks.forEach((wk) => wk.names.filter(Boolean).forEach((n) => counts.set(n, (counts.get(n) || 0) + 1)));
  const stats = $("#scheduleStats");
  stats.innerHTML = "";
  [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de"))
    .forEach(([name, c]) => {
      const li = document.createElement("li");
      li.textContent = `${name}: ${c}×`;
      stats.append(li);
    });
}

async function updateCell(week, slot, name) {
  try {
    const data = await api("PATCH", "/api/schedule", {
      plan: currentPlan, year: schedule.year, week, slot, name,
    });
    schedule = savedSchedule = data.schedule;
    renderSchedule();
  } catch (err) {
    showError($("#scheduleError"), err.message);
  }
}

$("#scheduleYear").addEventListener("change", loadSchedule);

$("#generateBtn").addEventListener("click", async () => {
  const existing = schedule || savedSchedule;
  if (existing && !confirm(`Für ${existing.year} gibt es schon einen Plan. Er wird neu erstellt und deine Änderungen daran gehen verloren. Fortfahren?`)) return;
  const btn = $("#generateBtn");
  btn.disabled = true;
  btn.textContent = "Wird erstellt …";
  try {
    const data = await api("POST", "/api/schedule/generate", { plan: currentPlan, year: $("#scheduleYear").value });
    schedule = savedSchedule = data.schedule;
    renderSchedule();
  } catch (err) {
    showError($("#scheduleError"), err.message);
    btn.textContent = schedule || savedSchedule ? "Neu erstellen" : "Plan erstellen";
  } finally {
    btn.disabled = false;
  }
});

// ---------- Herunterladen ----------

const HEADER = ["Startdatum", "", "Enddatum", "Name1", "Name2"];
const scheduleRows = () => schedule.weeks.map((wk) => [fmtDate(wk.start), "bis", fmtDate(wk.end), ...wk.names]);

document.querySelectorAll("#downloadMenu [data-format]").forEach((btn) =>
  btn.addEventListener("click", async () => {
    const format = btn.dataset.format;
    const filename = `${PLAN_TITLES[currentPlan]}_${schedule.year}`;
    btn.disabled = true;
    try {
      if (format === "csv") {
        const esc = (v) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
        // Semikolon + BOM, damit deutsches Excel die Datei direkt richtig öffnet
        const csv = "﻿" + [HEADER, ...scheduleRows()].map((r) => r.map(esc).join(";")).join("\r\n");
        PlanExport.download(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${filename}.csv`);
      } else {
        const canvas = PlanExport.drawTable({
          title: `${PLAN_TITLES[currentPlan]} ${schedule.year}`,
          header: HEADER,
          rows: scheduleRows(),
          align: ["right", "center", "right", "left", "left"],
        });
        const blob = format === "pdf" ? await PlanExport.toPdfBlob(canvas) : await PlanExport.toJpegBlob(canvas);
        PlanExport.download(blob, `${filename}.${format === "pdf" ? "pdf" : "jpg"}`);
      }
      $("#downloadMenu").open = false;
    } catch (err) {
      showError($("#scheduleError"), `Download fehlgeschlagen: ${err.message}`);
    } finally {
      btn.disabled = false;
    }
  })
);

// Menü schließen, wenn man daneben klickt
document.addEventListener("click", (e) => {
  if (!e.target.closest("#downloadMenu")) $("#downloadMenu").open = false;
});

async function removeName(id) {
  try {
    await api("DELETE", `/api/names/${id}`);
    await loadNames();
  } catch (err) {
    showError($("#nameError"), err.message);
  }
}

// ---------- Start ----------

(async () => {
  try {
    const { user } = await api("GET", "/api/me");
    setUser(user);
    showView("choose");
  } catch {
    showView("login");
  }
})();

// ---------- Alles löschen ----------

$("#clearAbsencesBtn").addEventListener("click", async () => {
  if (!confirm("Wirklich alle Abwesenheiten löschen?")) return;
  try {
    await api("DELETE", `/api/absences?plan=${currentPlan}`);
    await loadNames();
  } catch (err) {
    showError($("#absenceForm .error"), err.message);
  }
});

$("#resetPlanBtn").addEventListener("click", async () => {
  if (!confirm(`Wirklich die komplette Seite „${PLAN_TITLES[currentPlan]}“ löschen? Alle Namen, Abwesenheiten, Termine und Einstellungen gehen verloren.`)) return;
  try {
    await api("DELETE", `/api/plan?plan=${currentPlan}`);
    await openPlan(currentPlan);
  } catch (err) {
    showError($("#nameError"), err.message);
  }
});
