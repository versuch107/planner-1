// Planner – Miniplan (Einstellungen, Einteilung, Export)

let mini = null;        // { settings, logo, termine, updatedAt } vom Server
let miniSaveTimer = null;

const MINI_ROLES = [
  ["altar", "Altardienst"],
  ["sammeln", "Sammeln"],
  ["weihrauch", "Weihrauch"],
];

const oberminis = () => allNames.filter((n) => n.labels.includes("Oberministrant")).map((n) => n.name);
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ---------- Laden ----------

async function loadMini() {
  const show = currentPlan === "mini";
  $("#miniSection").hidden = !show;
  if (!show) return;
  try {
    const data = await api("GET", "/api/mini");
    mini = data.mini;
    fillMiniSettings(mini.settings);
    renderMiniLogo();
    renderMini();
  } catch (err) {
    if (err.status === 401) return showView("login");
    showError($("#miniError"), err.message);
  }
}

// ---------- Einstellungen ----------

function numberInput(value, label) {
  const i = document.createElement("input");
  i.type = "number";
  i.min = 0;
  i.max = 20;
  i.value = value ?? 0;
  i.setAttribute("aria-label", label);
  return i;
}

function removeCell(tr) {
  const td = document.createElement("td");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "icon-btn remove";
  btn.textContent = "×";
  btn.title = "Zeile entfernen";
  btn.setAttribute("aria-label", "Zeile entfernen");
  btn.addEventListener("click", () => {
    tr.remove();
    scheduleMiniSave();
  });
  td.append(btn);
  return td;
}

const cell = (el) => {
  const td = document.createElement("td");
  td.append(el);
  return td;
};

function addSpecialRow(s = { date: "", time: "", title: "", altar: 2, sammeln: 2, weihrauch: 0 }) {
  const tr = document.createElement("tr");
  const date = Object.assign(document.createElement("input"), { type: "date", value: s.date, className: "date" });
  date.setAttribute("aria-label", "Datum");
  const time = Object.assign(document.createElement("input"), { type: "time", value: s.time, className: "time" });
  time.setAttribute("aria-label", "Uhrzeit");
  const title = Object.assign(document.createElement("input"), {
    type: "text", value: s.title, maxLength: 80, placeholder: "z. B. Heiligabend", className: "title-input",
  });
  title.setAttribute("aria-label", "Anlass");
  tr.append(
    cell(date), cell(time), cell(title),
    cell(numberInput(s.altar, "Altardienst")), cell(numberInput(s.sammeln, "Sammeln")), cell(numberInput(s.weihrauch, "Weihrauch")),
    removeCell(tr)
  );
  $("#specialRows").append(tr);
}

function fillMiniSettings(s) {
  let { from, to } = s;
  if (!from || !to) {
    // Standard: kompletter nächster Monat
    const now = new Date();
    from = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 1));
    to = isoDate(new Date(now.getFullYear(), now.getMonth() + 2, 0));
  }
  $("#miniFrom").value = from;
  $("#miniTo").value = to;
  $("#specialRows").innerHTML = "";
  s.specials.forEach(addSpecialRow);
  $("#miniTermineText").value = s.termineText;
  $("#miniOrgaText").value = s.orgaText;
  renderPlanBy(s.planBy);
}

function renderPlanBy(selected = $("#miniPlanBy").value) {
  const sel = $("#miniPlanBy");
  sel.innerHTML = "";
  sel.append(new Option("— niemand —", ""));
  const names = oberminis();
  if (selected && !names.includes(selected)) names.push(selected);
  for (const n of names) sel.append(new Option(n, n, false, n === selected));
}

function readMiniSettings() {
  const nums = (tr) => [...tr.querySelectorAll('input[type="number"]')].map((i) => Number(i.value) || 0);
  return {
    from: $("#miniFrom").value,
    to: $("#miniTo").value,
    specials: [...$("#specialRows").children].map((tr) => {
      const [altar, sammeln, weihrauch] = nums(tr);
      return {
        date: tr.querySelector(".date").value,
        time: tr.querySelector(".time").value,
        title: tr.querySelector(".title-input").value,
        altar, sammeln, weihrauch,
      };
    }),
    termineText: $("#miniTermineText").value,
    orgaText: $("#miniOrgaText").value,
    planBy: $("#miniPlanBy").value,
  };
}

// Änderungen automatisch speichern (kurz nach der letzten Eingabe)
function scheduleMiniSave() {
  clearTimeout(miniSaveTimer);
  $("#miniSaveState").textContent = "";
  miniSaveTimer = setTimeout(saveMiniSettings, 800);
}

async function saveMiniSettings() {
  clearTimeout(miniSaveTimer);
  try {
    const data = await api("PUT", "/api/mini/settings", { settings: readMiniSettings() });
    mini = data.mini;
    renderMini();
    $("#miniSaveState").textContent = "Einstellungen gespeichert ✓";
  } catch (err) {
    showError($("#miniError"), err.message);
  }
}

for (const id of ["#miniFrom", "#miniTo", "#specialRows", "#miniTermineText", "#miniOrgaText", "#miniPlanBy"]) {
  $(id).addEventListener("input", scheduleMiniSave);
  $(id).addEventListener("change", scheduleMiniSave);
}
$("#clearTermineBtn").addEventListener("click", async () => {
  if (!confirm("Wirklich alle Termine samt Einteilung löschen?")) return;
  clearTimeout(miniSaveTimer);
  try {
    const data = await api("DELETE", "/api/mini/termine");
    mini = data.mini;
    fillMiniSettings(mini.settings);
    renderMini();
  } catch (err) {
    showError($("#miniError"), err.message);
  }
});

$("#addSpecialBtn").addEventListener("click", () => {
  addSpecialRow();
  $("#specialRows").lastElementChild.querySelector(".date").focus();
  scheduleMiniSave();
});

// ---------- Logo ----------

function renderMiniLogo() {
  const img = $("#miniLogoPreview");
  img.hidden = !mini.logo;
  if (mini.logo) img.src = mini.logo;
  $("#miniLogoRemove").hidden = !mini.logo;
}

$("#miniLogoInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    // Auf max. 600 px verkleinern, damit der Plan schnell lädt
    const img = await loadImage(URL.createObjectURL(file));
    const r = Math.min(1, 600 / img.naturalWidth, 600 / img.naturalHeight);
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * r);
    c.height = Math.round(img.naturalHeight * r);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const logo = c.toDataURL("image/jpeg", 0.92);
    await api("PUT", "/api/mini/logo", { logo });
    mini.logo = logo;
    renderMiniLogo();
  } catch (err) {
    showError($("#miniError"), `Logo konnte nicht gespeichert werden: ${err.message}`);
  }
});

$("#miniLogoRemove").addEventListener("click", async () => {
  try {
    await api("PUT", "/api/mini/logo", { logo: null });
    mini.logo = null;
    renderMiniLogo();
  } catch (err) {
    showError($("#miniError"), err.message);
  }
});

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Bild konnte nicht gelesen werden."));
    img.src = src;
  });
}

// ---------- Einteilung (von Hand) ----------

function renderMini() {
  if (!mini || currentPlan !== "mini") return;
  renderPlanBy();
  const hasPlan = (mini.termine || []).length > 0;
  $("#miniResult").hidden = !hasPlan;
  $("#miniEmpty").hidden = hasPlan;
  $("#miniDownloadMenu").open = false;
  if (!hasPlan) return;

  $("#miniInfo").textContent =
    `${mini.termine.length} Termine` +
    (mini.updatedAt ? ` · zuletzt geändert ${new Date(mini.updatedAt).toLocaleString("de-DE")}` : "") +
    " · Namen auswählen zum Eintragen";

  const known = allNames.map((n) => n.name);
  const tbody = $("#miniRows");
  tbody.innerHTML = "";

  mini.termine.forEach((t) => {
    const tr = document.createElement("tr");
    const head = document.createElement("td");
    head.className = "termin";
    if (t.title) {
      const strong = document.createElement("strong");
      strong.textContent = t.title;
      head.append(strong);
    }
    head.append(`${PlanExport.weekday(t.date)} ${PlanExport.shortDate(t.date)}`);
    if (t.time) head.append(document.createElement("br"), `${t.time.replace(/^0/, "")} Uhr`);
    tr.append(head);

    for (const [role, roleLabel] of MINI_ROLES) {
      const td = document.createElement("td");
      t[role].forEach((current, slot) => {
        const select = document.createElement("select");
        select.setAttribute("aria-label", `${roleLabel} am ${fmtDate(t.date)}, Platz ${slot + 1}`);
        const options = ["", ...known];
        if (current && !known.includes(current)) options.push(current);
        for (const name of options) select.append(new Option(name || "—", name, false, name === current));
        select.addEventListener("change", () => updateMiniCell(t, role, slot, select.value));

        const person = allNames.find((n) => n.name === current);
        const clash = person?.absences.find((a) => a.from <= t.date && a.to >= t.date);
        if (clash) {
          td.classList.add("conflict");
          select.classList.add("clash");
          select.title = `${current} ist abwesend: ${fmtRange(clash)}${clash.note ? ` (${clash.note})` : ""}`;
        }
        td.append(select);
      });
      tr.append(td);
    }
    tbody.append(tr);
  });

  // Statistik
  const counts = new Map();
  mini.termine.forEach((t) =>
    [...t.altar, ...t.sammeln, ...t.weihrauch].filter(Boolean).forEach((n) => counts.set(n, (counts.get(n) || 0) + 1))
  );
  const stats = $("#miniStats");
  stats.innerHTML = "";
  [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de"))
    .forEach(([name, c]) => {
      const li = document.createElement("li");
      li.textContent = `${name}: ${c}×`;
      stats.append(li);
    });
}

async function updateMiniCell(t, role, slot, name) {
  try {
    const data = await api("PATCH", "/api/mini/cell", { date: t.date, time: t.time, role, slot, name });
    mini = data.mini;
    renderMini();
  } catch (err) {
    showError($("#miniError"), err.message);
  }
}

// ---------- Herunterladen ----------

document.querySelectorAll("#miniDownloadMenu [data-format]").forEach((btn) =>
  btn.addEventListener("click", async () => {
    const format = btn.dataset.format;
    const s = mini.settings;
    const filename = `Miniplan_${s.from || ""}_bis_${s.to || ""}`;
    btn.disabled = true;
    try {
      if (format === "csv") {
        const esc = (v) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
        const rows = [["Datum", "Uhrzeit", "Anlass", "Altardienst", "Sammeln", "Weihrauch"]];
        mini.termine.forEach((t) =>
          rows.push([fmtDate(t.date), t.time, t.title, t.altar.join(", "), t.sammeln.join(", "), t.weihrauch.join(", ")])
        );
        const csv = "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n");
        PlanExport.download(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${filename}.csv`);
      } else {
        const pages = PlanExport.drawMiniPlan({
          logo: mini.logo ? await loadImage(mini.logo) : null,
          termine: mini.termine,
          termineText: s.termineText,
          orgaText: s.orgaText,
          oberminis: oberminis(),
          planBy: s.planBy,
        });
        const blob =
          format === "pdf"
            ? await PlanExport.toPdfBlob(pages)
            : await PlanExport.toJpegBlob(PlanExport.stackPages(pages));
        PlanExport.download(blob, `${filename}.${format === "pdf" ? "pdf" : "jpg"}`);
      }
      $("#miniDownloadMenu").open = false;
    } catch (err) {
      showError($("#miniError"), `Download fehlgeschlagen: ${err.message}`);
    } finally {
      btn.disabled = false;
    }
  })
);

document.addEventListener("click", (e) => {
  if (!e.target.closest("#miniDownloadMenu")) $("#miniDownloadMenu").open = false;
});
