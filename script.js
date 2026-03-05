// Bidiyah Hospital Clinical Audit - script.js
// -------------------------------------------
// Changes:
// - Re-Audits column => "Auditor Name" with {name, yyyymm}
// - New column after Audit Name => "File Link" (editable URL)
// - Notes column => "Re-Auditor Name & Date" with {name, yyyymm, note(optional)}
// - SAFE updates: always fetch latest server copy before saving

const APP_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyvwGH45jfOgDUhGL5F7u7zB0moic3fBbH2tzQGuUvsViC5B68Y5v4ZsP4IHowIN8q4/exec";

const STORAGE_KEY = "clinical_audit_items_v4";

const APP_MODE = window.APP_MODE || "manage";
const isView = APP_MODE === "view";

const STATE = { items: [], selectedYear: "all" };

// ---------- Utilities ----------
function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function monthToLabel(yyyymm) {
  if (!yyyymm) return "-";
  const m = String(yyyymm).trim();
  const match = m.match(/^(\d{4})-(\d{2})$/);
  if (!match) return "-";
  return `${match[2]}/${match[1]}`;
}

function isValidYYYYMM(v) {
  return /^\d{4}-\d{2}$/.test(String(v || "").trim());
}

function makeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return "https://" + u;
}

// Keep 2024 visible
function getYearList(items) {
  const nowYear = new Date().getFullYear();
  const s = new Set(["2024", String(nowYear - 1), String(nowYear), String(nowYear + 1)]);
  (items || []).forEach((it) => it?.year && s.add(String(it.year)));
  return Array.from(s).sort((a, b) => Number(b) - Number(a));
}

function getYearStats(items) {
  const map = new Map();
  (items || []).forEach((it) => {
    const y = String(it.year || "");
    if (!y) return;

    if (!map.has(y)) map.set(y, { year: y, count: 0, reaudits: 0, notes: 0 });
    const obj = map.get(y);
    obj.count += 1;

    // reaudits now array of objects
    obj.reaudits += Array.isArray(it.reaudits) ? it.reaudits.length : 0;

    // notes now array of objects
    obj.notes += Array.isArray(it.notes) ? it.notes.length : 0;
  });

  if (!map.has("2024")) map.set("2024", { year: "2024", count: 0, reaudits: 0, notes: 0 });
  return Array.from(map.values()).sort((a, b) => Number(b.year) - Number(a.year));
}

function filterByYear(items) {
  if (STATE.selectedYear === "all") return items;
  return (items || []).filter((it) => String(it.year) === String(STATE.selectedYear));
}

// ---------- Backend ----------
async function apiRequest(action, payload) {
  if (!APP_SCRIPT_URL) throw new Error("APP_SCRIPT_URL is not set");
  const res = await fetch(APP_SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify({ action, payload }),
  });

  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}

  if (!res.ok || !data || data.ok !== true) {
    const msg = data?.error ? data.error : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

async function loadAllAudits() {
  if (APP_SCRIPT_URL) {
    const data = await apiRequest("list", {});
    const items = Array.isArray(data.items) ? data.items : [];
    return migrateItems_(items);
  }
  return migrateItems_(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
}

async function saveAllAudits(items) {
  if (APP_SCRIPT_URL) {
    await apiRequest("replace_all", { items });
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

/**
 * MIGRATION:
 * - Old reaudits: ["2026-01"] => [{name:"", yyyymm:"2026-01"}]
 * - Old notes: {user,text,yyyymm} => {name:user, yyyymm, note:text}
 * - fileLink default ""
 */
function migrateItems_(items) {
  return (items || []).map((it) => {
    const out = { ...it };

    // file link
    if (out.fileLink === undefined) out.fileLink = "";

    // reaudits migrate
    if (Array.isArray(out.reaudits)) {
      if (out.reaudits.length && typeof out.reaudits[0] === "string") {
        out.reaudits = out.reaudits.map((m) => ({ name: "", yyyymm: String(m || "") }));
      } else {
        // ensure shape
        out.reaudits = out.reaudits.map((r) => ({
          name: String(r?.name || ""),
          yyyymm: String(r?.yyyymm || r || ""),
        }));
      }
    } else {
      out.reaudits = [];
    }

    // notes migrate
    if (Array.isArray(out.notes)) {
      // old: {user,text,yyyymm}
      if (out.notes.length && out.notes[0] && out.notes[0].user !== undefined) {
        out.notes = out.notes.map((n) => ({
          name: String(n.user || ""),
          yyyymm: String(n.yyyymm || ""),
          note: String(n.text || ""),
        }));
      } else {
        out.notes = out.notes.map((n) => ({
          name: String(n?.name || n?.user || ""),
          yyyymm: String(n?.yyyymm || ""),
          note: String(n?.note || n?.text || ""),
        }));
      }
    } else {
      out.notes = [];
    }

    // start
    out.startYYYYMM = String(out.startYYYYMM || "").trim();

    return out;
  });
}

/**
 * SAFE UPDATE:
 * always fetch latest, mutate, then save
 */
async function updateAuditOnServer(auditId, mutatorFn) {
  const latest = await loadAllAudits();
  const idx = latest.findIndex((a) => String(a.id) === String(auditId));
  if (idx === -1) throw new Error("Audit not found on server.");

  latest[idx].reaudits = Array.isArray(latest[idx].reaudits) ? latest[idx].reaudits : [];
  latest[idx].notes = Array.isArray(latest[idx].notes) ? latest[idx].notes : [];
  if (latest[idx].fileLink === undefined) latest[idx].fileLink = "";

  mutatorFn(latest[idx]);

  await saveAllAudits(latest);

  STATE.items = latest;
  renderAll();
}

// ---------- UI ----------
function renderYearCards() {
  const container = document.getElementById("yearCards");
  if (!container) return;

  const stats = getYearStats(STATE.items);

  const allCard = document.createElement("div");
  allCard.className = "card" + (STATE.selectedYear === "all" ? " active" : "");
  allCard.dataset.year = "all";
  const total = STATE.items.length;
  const totalRe = STATE.items.reduce((s, a) => s + (a.reaudits || []).length, 0);
  const totalNotes = STATE.items.reduce((s, a) => s + (a.notes || []).length, 0);
  allCard.innerHTML = `
    <div class="title">All Years</div>
    <div class="big">${total}</div>
    <div class="sub">Re-Audits: ${totalRe} • Notes: ${totalNotes}</div>
  `;

  container.innerHTML = "";
  container.appendChild(allCard);

  const years = getYearList(STATE.items);
  const byYear = new Map(stats.map((s) => [s.year, s]));
  years.forEach((y) => {
    const s = byYear.get(y) || { year: y, count: 0, reaudits: 0, notes: 0 };
    const card = document.createElement("div");
    card.className = "card" + (STATE.selectedYear === s.year ? " active" : "");
    card.dataset.year = s.year;
    card.innerHTML = `
      <div class="title">${escapeHtml(s.year)}</div>
      <div class="big">${s.count}</div>
      <div class="sub">Re-Audits: ${s.reaudits} • Notes: ${s.notes}</div>
    `;
    container.appendChild(card);
  });
}

function renderStatsGrid(items) {
  const grid = document.getElementById("globalStats");
  if (!grid) return;

  const total = items.length;
  const totalRe = items.reduce((s, a) => s + (a.reaudits || []).length, 0);
  const totalNotes = items.reduce((s, a) => s + (a.notes || []).length, 0);

  grid.innerHTML = `
    <div class="statbox"><div class="k">Total Audits</div><div class="v">${total}</div></div>
    <div class="statbox"><div class="k">Total Re-Audits</div><div class="v">${totalRe}</div></div>
    <div class="statbox"><div class="k">Total Entries</div><div class="v">${totalNotes}</div></div>
  `;
}

function renderTable(items) {
  const table = document.getElementById("auditsTable");
  if (!table) return;

  const sorted = [...items].sort((a, b) => {
    const ya = Number(a.year || 0);
    const yb = Number(b.year || 0);
    if (yb !== ya) return yb - ya;
    return String(b.startYYYYMM || "").localeCompare(String(a.startYYYYMM || ""));
  });

  table.innerHTML = `
    <tr>
      <th>Clinical Audit Name</th>
      <th>File Link</th>
      <th>Year</th>
      <th>Start (MM/YYYY)</th>
      <th>Auditor Name</th>
      <th>Re-Auditor Name & Date</th>
      ${isView ? "" : "<th>Actions</th>"}
    </tr>
  `;

  sorted.forEach((audit) => {
    const tr = document.createElement("tr");

    // Name
    const tdName = document.createElement("td");
    tdName.textContent = audit.name || "";
    tr.appendChild(tdName);

    // File Link
    const tdLink = document.createElement("td");
    const link = String(audit.fileLink || "").trim();

    if (link) {
      const a = document.createElement("a");
      a.href = link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Open";
      tdLink.appendChild(a);
    } else {
      tdLink.textContent = "-";
    }

    if (!isView) {
      const ctrls = document.createElement("div");
      ctrls.className = "inline-controls";

      const inp = document.createElement("input");
      inp.type = "text";
      inp.placeholder = "Paste file link...";
      inp.className = "file-link";
      inp.dataset.id = audit.id;
      inp.value = link;
      ctrls.appendChild(inp);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn secondary btn-save-link";
      btn.dataset.id = audit.id;
      btn.textContent = "Save";
      ctrls.appendChild(btn);

      tdLink.appendChild(ctrls);
    }

    tr.appendChild(tdLink);

    // Year
    const tdYear = document.createElement("td");
    tdYear.textContent = audit.year || "";
    tr.appendChild(tdYear);

    // Start
    const tdStart = document.createElement("td");
    tdStart.textContent = monthToLabel(audit.startYYYYMM || "");
    tr.appendChild(tdStart);

    // Auditor Name (Re-audit entries)
    const tdRe = document.createElement("td");
    const reList = document.createElement("ul");
    reList.className = "reaudit-list";
    (audit.reaudits || []).forEach((r) => {
      const li = document.createElement("li");
      const nm = String(r?.name || "").trim();
      const dt = monthToLabel(r?.yyyymm || "");
      li.textContent = nm ? `${nm} (${dt})` : dt;
      reList.appendChild(li);
    });
    tdRe.appendChild(reList);

    if (!isView) {
      const ctrls = document.createElement("div");
      ctrls.className = "inline-controls";

      const nameInp = document.createElement("input");
      nameInp.type = "text";
      nameInp.placeholder = "Auditor name...";
      nameInp.className = "reaudit-name";
      nameInp.dataset.id = audit.id;
      ctrls.appendChild(nameInp);

      const monthInp = document.createElement("input");
      monthInp.type = "month";
      monthInp.className = "reaudit-month";
      monthInp.dataset.id = audit.id;
      ctrls.appendChild(monthInp);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn secondary btn-add-reaudit";
      btn.dataset.id = audit.id;
      btn.textContent = "Add";
      ctrls.appendChild(btn);

      tdRe.appendChild(ctrls);
    }

    tr.appendChild(tdRe);

    // Re-Auditor Name & Date (notes entries)
    const tdNotes = document.createElement("td");
    const notesDiv = document.createElement("div");
    notesDiv.className = "notes";

    (audit.notes || []).forEach((n, idx) => {
      const div = document.createElement("div");
      div.className = "note";

      const nm = String(n?.name || "").trim();
      const dt = monthToLabel(n?.yyyymm || "");
      const note = String(n?.note || "").trim();

      const label = document.createElement("span");
      label.innerHTML = `<strong>${escapeHtml(nm)}</strong> (${escapeHtml(dt)})${note ? `: ${escapeHtml(note)}` : ""}`;
      div.appendChild(label);

      if (!isView) {
        const btnWrap = document.createElement("span");
        btnWrap.style.marginLeft = "8px";

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "btn secondary btn-edit-note";
        editBtn.dataset.id = audit.id;
        editBtn.dataset.idx = String(idx);
        editBtn.textContent = "Edit";
        editBtn.style.padding = "4px 8px";
        editBtn.style.fontSize = "12px";
        editBtn.style.marginRight = "6px";
        btnWrap.appendChild(editBtn);

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "btn secondary btn-delete-note";
        delBtn.dataset.id = audit.id;
        delBtn.dataset.idx = String(idx);
        delBtn.textContent = "Delete";
        delBtn.style.padding = "4px 8px";
        delBtn.style.fontSize = "12px";
        btnWrap.appendChild(delBtn);

        div.appendChild(btnWrap);
      }

      notesDiv.appendChild(div);
    });

    tdNotes.appendChild(notesDiv);

    if (!isView) {
      const ctrls = document.createElement("div");
      ctrls.className = "inline-controls";

      const nameInp = document.createElement("input");
      nameInp.placeholder = "Re-auditor name...";
      nameInp.className = "note-name";
      nameInp.dataset.id = audit.id;
      ctrls.appendChild(nameInp);

      const monthInp = document.createElement("input");
      monthInp.type = "month";
      monthInp.className = "note-month";
      monthInp.dataset.id = audit.id;
      ctrls.appendChild(monthInp);

      const noteInp = document.createElement("input");
      noteInp.placeholder = "Optional note...";
      noteInp.className = "note-text";
      noteInp.dataset.id = audit.id;
      ctrls.appendChild(noteInp);

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn secondary btn-add-note";
      addBtn.dataset.id = audit.id;
      addBtn.textContent = "Add";
      ctrls.appendChild(addBtn);

      tdNotes.appendChild(ctrls);
    }

    tr.appendChild(tdNotes);

    // Actions
    if (!isView) {
      const tdAct = document.createElement("td");

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn secondary btn-edit";
      editBtn.dataset.id = audit.id;
      editBtn.textContent = "Edit";
      editBtn.style.marginRight = "6px";
      tdAct.appendChild(editBtn);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn secondary btn-delete";
      delBtn.dataset.id = audit.id;
      delBtn.textContent = "Delete";
      tdAct.appendChild(delBtn);

      tr.appendChild(tdAct);
    }

    table.appendChild(tr);
  });
}

function renderAll() {
  renderYearCards();
  const filtered = filterByYear(STATE.items);

  const title = document.getElementById("tableTitle");
  if (title) title.textContent = STATE.selectedYear === "all" ? "All Audits" : `Audits - ${STATE.selectedYear}`;

  renderStatsGrid(filtered);
  renderTable(filtered);
}

// ---------- Actions ----------
async function refresh() {
  try {
    STATE.items = await loadAllAudits();
    renderAll();
  } catch (e) {
    alert(`Load failed: ${e.message || e}`);
  }
}

async function onSaveNewAudit() {
  try {
    const year = (document.getElementById("yearSelect")?.value || "").trim();
    const name = (document.getElementById("auditName")?.value || "").trim();
    const startYYYYMM = (document.getElementById("startMonth")?.value || "").trim();
    const fileLink = normalizeUrl((document.getElementById("fileLink")?.value || "").trim());

    if (!year || !/^\d{4}$/.test(year) || !name) {
      alert("Please enter a valid Year (YYYY) and Audit Name.");
      return;
    }
    if (startYYYYMM && !isValidYYYYMM(startYYYYMM)) {
      alert("Start Month must be like YYYY-MM or empty.");
      return;
    }

    const latest = await loadAllAudits();
    latest.push({
      id: makeId(),
      year,
      name,
      fileLink: fileLink || "",
      startYYYYMM,
      reaudits: [],
      notes: [],
    });

    await saveAllAudits(latest);
    STATE.items = latest;

    document.getElementById("auditName") && (document.getElementById("auditName").value = "");
    document.getElementById("startMonth") && (document.getElementById("startMonth").value = "");
    document.getElementById("fileLink") && (document.getElementById("fileLink").value = "");

    renderAll();
    alert("Saved successfully!");
  } catch (e) {
    alert(`Save failed: ${e.message || e}`);
  }
}

async function saveFileLink(id) {
  try {
    const inp = document.querySelector(`.file-link[data-id="${id}"]`);
    const link = normalizeUrl((inp?.value || "").trim());

    await updateAuditOnServer(id, (audit) => {
      audit.fileLink = link || "";
    });

  } catch (e) {
    alert(`Save link failed: ${e.message || e}`);
  }
}

async function addReAudit(id) {
  try {
    const nameInp = document.querySelector(`.reaudit-name[data-id="${id}"]`);
    const monthInp = document.querySelector(`.reaudit-month[data-id="${id}"]`);
    const nm = (nameInp?.value || "").trim();
    const yyyymm = (monthInp?.value || "").trim();

    if (!nm) { alert("Please enter Auditor name."); return; }
    if (!yyyymm || !isValidYYYYMM(yyyymm)) { alert("Please select Month (YYYY-MM)."); return; }

    await updateAuditOnServer(id, (audit) => {
      audit.reaudits = Array.isArray(audit.reaudits) ? audit.reaudits : [];
      audit.reaudits.push({ name: nm, yyyymm });
    });

  } catch (e) {
    alert(`Add auditor entry failed: ${e.message || e}`);
  }
}

async function addNote(id) {
  try {
    const nameInp = document.querySelector(`.note-name[data-id="${id}"]`);
    const monthInp = document.querySelector(`.note-month[data-id="${id}"]`);
    const noteInp = document.querySelector(`.note-text[data-id="${id}"]`);

    const nm = (nameInp?.value || "").trim();
    const yyyymm = (monthInp?.value || "").trim();
    const note = (noteInp?.value || "").trim(); // optional

    if (!nm) { alert("Please enter Re-auditor name."); return; }
    if (!yyyymm || !isValidYYYYMM(yyyymm)) { alert("Please select Date (YYYY-MM)."); return; }

    await updateAuditOnServer(id, (audit) => {
      audit.notes = Array.isArray(audit.notes) ? audit.notes : [];
      audit.notes.push({ name: nm, yyyymm, note: note || "" });
    });

  } catch (e) {
    alert(`Add entry failed: ${e.message || e}`);
  }
}

async function editNote(id, idx) {
  try {
    const auditLocal = STATE.items.find((a) => a.id === id);
    const current = auditLocal?.notes?.[idx] || {};

    const newName = prompt("Re-auditor name:", current.name || "");
    if (newName === null) return;

    const newMonth = prompt("Date (YYYY-MM):", current.yyyymm || "");
    if (newMonth === null) return;

    const newNote = prompt("Optional note:", current.note || "");
    if (newNote === null) return;

    const nm = newName.trim();
    const yyyymm = newMonth.trim();
    const note = newNote.trim();

    if (!nm) { alert("Name is required."); return; }
    if (!yyyymm || !isValidYYYYMM(yyyymm)) { alert("Date must be YYYY-MM."); return; }

    await updateAuditOnServer(id, (audit) => {
      audit.notes = Array.isArray(audit.notes) ? audit.notes : [];
      if (!audit.notes[idx]) throw new Error("Entry not found.");
      audit.notes[idx].name = nm;
      audit.notes[idx].yyyymm = yyyymm;
      audit.notes[idx].note = note || "";
    });

  } catch (e) {
    alert(`Edit failed: ${e.message || e}`);
  }
}

async function deleteNote(id, idx) {
  try {
    if (!confirm("Delete this entry?")) return;

    await updateAuditOnServer(id, (audit) => {
      audit.notes = Array.isArray(audit.notes) ? audit.notes : [];
      if (idx < 0 || idx >= audit.notes.length) throw new Error("Entry not found.");
      audit.notes.splice(idx, 1);
    });

  } catch (e) {
    alert(`Delete failed: ${e.message || e}`);
  }
}

async function editAudit(id) {
  try {
    const auditLocal = STATE.items.find((a) => a.id === id) || {};

    const newYear = prompt("Edit Year (YYYY):", String(auditLocal.year || ""));
    if (newYear === null) return;
    const year = newYear.trim();

    const newName = prompt("Edit Audit Name:", auditLocal.name || "");
    if (newName === null) return;
    const name = newName.trim();

    const newStart = prompt("Edit Start Month (YYYY-MM) or empty:", auditLocal.startYYYYMM || "");
    if (newStart === null) return;
    const startYYYYMM = newStart.trim();

    const newLink = prompt("Edit File Link (optional):", auditLocal.fileLink || "");
    if (newLink === null) return;
    const fileLink = normalizeUrl(newLink.trim());

    if (!year || !/^\d{4}$/.test(year) || !name) { alert("Invalid Year/Name."); return; }
    if (startYYYYMM && !isValidYYYYMM(startYYYYMM)) { alert("Start must be YYYY-MM or empty."); return; }

    const latest = await loadAllAudits();
    const idx = latest.findIndex((a) => String(a.id) === String(id));
    if (idx === -1) throw new Error("Audit not found on server.");

    latest[idx].year = year;
    latest[idx].name = name;
    latest[idx].startYYYYMM = startYYYYMM;
    latest[idx].fileLink = fileLink || "";

    await saveAllAudits(latest);
    STATE.items = latest;
    renderAll();

  } catch (e) {
    alert(`Edit audit failed: ${e.message || e}`);
  }
}

async function deleteAudit(id) {
  try {
    if (!confirm("Delete this audit?")) return;

    const latest = await loadAllAudits();
    const filtered = latest.filter((a) => String(a.id) !== String(id));

    await saveAllAudits(filtered);
    STATE.items = filtered;
    renderAll();

  } catch (e) {
    alert(`Delete audit failed: ${e.message || e}`);
  }
}

// ---------- Export ----------
function exportJSON() {
  const filtered = filterByYear(STATE.items);
  const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "clinical_audit_export.json";
  a.click();
}

function exportToCSV() {
  const filtered = filterByYear(STATE.items);
  if (!filtered.length) { alert("No data to export"); return; }

  let csv = "ID,Year,AuditName,FileLink,Start(YYYY-MM),Auditors(ReAudit),ReAuditorEntries\n";

  filtered.forEach((row) => {
    const re = (row.reaudits || [])
      .map((r) => `${r.name || ""}:${r.yyyymm || ""}`)
      .join(" | ");

    const entries = (row.notes || [])
      .map((n) => `${n.name || ""}:${n.yyyymm || ""}:${(n.note || "").replaceAll("\n", " ")}`)
      .join(" || ");

    const line = [
      row.id || "",
      row.year || "",
      (row.name || "").replaceAll('"', '""'),
      (row.fileLink || "").replaceAll('"', '""'),
      row.startYYYYMM || "",
      re.replaceAll('"', '""'),
      entries.replaceAll('"', '""'),
    ].map((v) => `"${String(v)}"`).join(",");

    csv += line + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "Clinical_Audit_Data.csv";
  link.click();
}

// ---------- Boot ----------
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("saveBtn")?.addEventListener("click", onSaveNewAudit);
  document.getElementById("btnRefresh")?.addEventListener("click", refresh);
  document.getElementById("btnExport")?.addEventListener("click", exportJSON);

  window.exportToCSV = exportToCSV;

  document.getElementById("yearCards")?.addEventListener("click", (e) => {
    const t = e.target.closest(".card");
    if (!t) return;
    STATE.selectedYear = t.dataset.year || "all";
    renderAll();
  });

  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;

    if (t.classList.contains("btn-save-link")) {
      saveFileLink(t.dataset.id);
    } else if (t.classList.contains("btn-add-reaudit")) {
      addReAudit(t.dataset.id);
    } else if (t.classList.contains("btn-add-note")) {
      addNote(t.dataset.id);
    } else if (t.classList.contains("btn-edit-note")) {
      editNote(t.dataset.id, Number(t.dataset.idx));
    } else if (t.classList.contains("btn-delete-note")) {
      deleteNote(t.dataset.id, Number(t.dataset.idx));
    } else if (t.classList.contains("btn-edit")) {
      editAudit(t.dataset.id);
    } else if (t.classList.contains("btn-delete")) {
      deleteAudit(t.dataset.id);
    }
  });

  refresh();
});
