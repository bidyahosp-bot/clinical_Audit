// Bidiyah Hospital Clinical Audit
// ------------------------------------------------------------
// IMPORTANT (Network / Shared data):
// 1) If you want ONE unified table for all devices on the network,
//    you need a shared backend (recommended: Google Sheets via Apps Script).
// 2) If APP_SCRIPT_URL is empty, the app will fallback to localStorage
//    (works on ONE device only).
// ------------------------------------------------------------

// Paste your deployed Apps Script Web App URL here (must end with /exec)
const APP_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyvwGH45jfOgDUhGL5F7u7zB0moic3fBbH2tzQGuUvsViC5B68Y5v4ZsP4IHowIN8q4/exec";

// Storage fallback (single device)
const STORAGE_KEY = "clinical_audit_items_v3";

// App mode: manage or view
const APP_MODE = window.APP_MODE || "manage";
const isView = APP_MODE === "view";

// Global state
const STATE = {
  items: [],
  selectedYear: "all",
};

// ---------- Utilities ----------
function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Convert YYYY-MM to MM/YYYY label
function monthToLabel(yyyymm) {
  if (!yyyymm) return "-";
  const m = String(yyyymm).trim();
  const match = m.match(/^(\d{4})-(\d{2})$/);
  if (!match) return "-";
  return `${match[2]}/${match[1]}`;
}

// Build year cards list (includes 2024 always)
function getYearList(items) {
  const nowYear = new Date().getFullYear();
  const s = new Set(["2024", String(nowYear - 1), String(nowYear), String(nowYear + 1)]);
  (items || []).forEach((it) => {
    if (it && it.year) s.add(String(it.year));
  });
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
    obj.reaudits += (it.reaudits || []).length;
    obj.notes += (it.notes || []).length;
  });

  // Ensure 2024 shows even if empty
  if (!map.has("2024")) map.set("2024", { year: "2024", count: 0, reaudits: 0, notes: 0 });

  // newest first
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
    // IMPORTANT: no headers to reduce CORS preflight issues
    body: JSON.stringify({ action, payload }),
  });

  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}

  if (!res.ok || !data || data.ok !== true) {
    const msg = data && data.error ? data.error : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

async function loadAllAudits() {
  if (APP_SCRIPT_URL) {
    const data = await apiRequest("list", {});
    return Array.isArray(data.items) ? data.items : [];
  }
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
}

async function saveAllAudits(items) {
  if (APP_SCRIPT_URL) {
    await apiRequest("replace_all", { items });
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// ---------- UI Rendering ----------
function renderYearCards() {
  const container = document.getElementById("yearCards");
  if (!container) return;

  const stats = getYearStats(STATE.items);

  // Add "All"
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

  stats.forEach((s) => {
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
    <div class="statbox"><div class="k">Total Notes</div><div class="v">${totalNotes}</div></div>
  `;
}

function renderTable(items) {
  const table = document.getElementById("auditsTable");
  if (!table) return;

  // Sort: newest year first, then newest month
  const sorted = [...items].sort((a, b) => {
    const ya = Number(a.year || 0);
    const yb = Number(b.year || 0);
    if (yb !== ya) return yb - ya;
    const ma = a.startYYYYMM || "";
    const mb = b.startYYYYMM || "";
    return String(mb).localeCompare(String(ma));
  });

  table.innerHTML = `
    <tr>
      <th>Clinical Audit Name</th>
      <th>Year</th>
      <th>Start (MM/YYYY)</th>
      <th>Re-Audits</th>
      <th>Notes</th>
      ${isView ? "" : "<th>Actions</th>"}
    </tr>
  `;

  sorted.forEach((audit) => {
    const tr = document.createElement("tr");

    const tdName = document.createElement("td");
    tdName.textContent = audit.name || "";
    tr.appendChild(tdName);

    const tdYear = document.createElement("td");
    tdYear.textContent = audit.year || "";
    tr.appendChild(tdYear);

    const tdStart = document.createElement("td");
    tdStart.textContent = monthToLabel(audit.startYYYYMM || "");
    tr.appendChild(tdStart);

    // Re-Audits
    const tdRe = document.createElement("td");
    const reList = document.createElement("ul");
    reList.className = "reaudit-list";
    (audit.reaudits || []).forEach((r) => {
      const li = document.createElement("li");
      li.textContent = monthToLabel(r);
      reList.appendChild(li);
    });
    tdRe.appendChild(reList);

    if (!isView) {
      const ctrls = document.createElement("div");
      ctrls.className = "inline-controls";

      const reMonth = document.createElement("input");
      reMonth.type = "month";
      reMonth.className = "reaudit-month";
      reMonth.dataset.id = audit.id;
      ctrls.appendChild(reMonth);

      const reBtn = document.createElement("button");
      reBtn.type = "button";
      reBtn.className = "btn secondary btn-add-reaudit";
      reBtn.dataset.id = audit.id;
      reBtn.textContent = "Add";
      ctrls.appendChild(reBtn);

      tdRe.appendChild(ctrls);
    }

    tr.appendChild(tdRe);

    // Notes
    const tdNotes = document.createElement("td");

    const notesDiv = document.createElement("div");
    notesDiv.className = "notes";
    (audit.notes || []).forEach((n, idx) => {
      const div = document.createElement("div");
      div.className = "note";

      const label = document.createElement("span");
      label.innerHTML = `<strong>${escapeHtml(n.user || "")}</strong> (${escapeHtml(
        monthToLabel(n.yyyymm || "")
      )}): ${escapeHtml(n.text || "")}`;
      div.appendChild(label);

      // Edit/Delete note buttons (Manage page only)
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

      const noteText = document.createElement("input");
      noteText.placeholder = "Add note...";
      noteText.className = "note-text";
      noteText.dataset.id = audit.id;
      ctrls.appendChild(noteText);

      const noteUser = document.createElement("input");
      noteUser.placeholder = "Your name...";
      noteUser.className = "note-user";
      noteUser.dataset.id = audit.id;
      ctrls.appendChild(noteUser);

      const noteMonth = document.createElement("input");
      noteMonth.type = "month";
      noteMonth.className = "note-month";
      noteMonth.dataset.id = audit.id;
      ctrls.appendChild(noteMonth);

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
  if (title) {
    title.textContent = STATE.selectedYear === "all" ? "All Audits" : `Audits - ${STATE.selectedYear}`;
  }

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

    if (!year || !/^\d{4}$/.test(year) || !name) {
      alert("Please enter a valid Year (YYYY) and Audit Name.");
      return;
    }
    if (startYYYYMM && !/^\d{4}-\d{2}$/.test(startYYYYMM)) {
      alert("Start Month must be like YYYY-MM or empty.");
      return;
    }

    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    STATE.items.push({
      id,
      year,
      name,
      startYYYYMM,
      reaudits: [],
      notes: [],
    });

    await saveAllAudits(STATE.items);

    // reset form
    const auditName = document.getElementById("auditName");
    const startMonth = document.getElementById("startMonth");
    if (auditName) auditName.value = "";
    if (startMonth) startMonth.value = "";

    renderAll();
    alert("Saved successfully!");
  } catch (e) {
    alert(`Save failed: ${e.message || e}`);
  }
}

async function addReAudit(id) {
  const monthInput = document.querySelector(`.reaudit-month[data-id="${id}"]`);
  const yyyymm = (monthInput?.value || "").trim();

  if (!yyyymm) {
    alert("Please select re-audit month.");
    return;
  }

  const audit = STATE.items.find((a) => a.id === id);
  if (!audit) return;

  audit.reaudits = audit.reaudits || [];
  audit.reaudits.push(yyyymm);

  await saveAllAudits(STATE.items);
  renderAll();
}

async function addNote(id) {
  const noteInput = document.querySelector(`.note-text[data-id="${id}"]`);
  const userInput = document.querySelector(`.note-user[data-id="${id}"]`);
  const monthInput = document.querySelector(`.note-month[data-id="${id}"]`);

  const text = (noteInput?.value || "").trim();
  const user = (userInput?.value || "").trim();
  const yyyymm = (monthInput?.value || "").trim(); // month/year only

  if (!text || !user) {
    alert("Please enter both note and your name.");
    return;
  }

  const audit = STATE.items.find((a) => a.id === id);
  if (!audit) return;

  audit.notes = audit.notes || [];
  audit.notes.push({ user, text, yyyymm: yyyymm || "" });

  await saveAllAudits(STATE.items);
  renderAll();
}

async function editNote(id, idx) {
  const audit = STATE.items.find((a) => a.id === id);
  if (!audit) return;

  audit.notes = audit.notes || [];
  const note = audit.notes[idx];
  if (!note) return;

  const newText = prompt("Edit note text:", note.text || "");
  if (newText === null) return;

  const newUser = prompt("Edit note user/name:", note.user || "");
  if (newUser === null) return;

  const newMonth = prompt("Edit note month (YYYY-MM) - leave empty if none:", note.yyyymm || "");
  if (newMonth === null) return;

  const text = newText.trim();
  const user = newUser.trim();
  const yyyymm = newMonth.trim();

  if (!text || !user) {
    alert("Note text and user cannot be empty.");
    return;
  }
  if (yyyymm && !/^\d{4}-\d{2}$/.test(yyyymm)) {
    alert("Month must be like YYYY-MM or empty.");
    return;
  }

  note.text = text;
  note.user = user;
  note.yyyymm = yyyymm;

  await saveAllAudits(STATE.items);
  renderAll();
}

async function deleteNote(id, idx) {
  if (!confirm("Delete this note?")) return;

  const audit = STATE.items.find((a) => a.id === id);
  if (!audit) return;

  audit.notes = audit.notes || [];
  if (idx < 0 || idx >= audit.notes.length) return;

  audit.notes.splice(idx, 1);

  await saveAllAudits(STATE.items);
  renderAll();
}

async function editAudit(id) {
  const audit = STATE.items.find((a) => a.id === id);
  if (!audit) return;

  const newYear = prompt("Edit Year (e.g. 2026):", String(audit.year || ""));
  if (newYear === null) return;
  const year = newYear.trim();

  const newName = prompt("Edit Clinical Audit Name:", audit.name || "");
  if (newName === null) return;
  const name = newName.trim();

  const newStart = prompt("Edit Start Month (YYYY-MM) - leave empty if none:", audit.startYYYYMM || "");
  if (newStart === null) return;
  const startYYYYMM = newStart.trim();

  if (!year || !/^\d{4}$/.test(year) || !name) {
    alert("Please enter a valid Year (YYYY) and Name.");
    return;
  }
  if (startYYYYMM && !/^\d{4}-\d{2}$/.test(startYYYYMM)) {
    alert("Start Month must be like YYYY-MM or empty.");
    return;
  }

  audit.year = year;
  audit.name = name;
  audit.startYYYYMM = startYYYYMM;

  await saveAllAudits(STATE.items);
  renderAll();
}

async function deleteAudit(id) {
  if (!confirm("Delete this audit?")) return;
  STATE.items = STATE.items.filter((a) => a.id !== id);
  await saveAllAudits(STATE.items);
  renderAll();
}

// Export JSON (view page)
function exportJSON() {
  const filtered = filterByYear(STATE.items);
  const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "clinical_audit_export.json";
  a.click();
}

// Export CSV (view page)
function exportToCSV() {
  const filtered = filterByYear(STATE.items);
  if (!filtered.length) {
    alert("No data to export");
    return;
  }

  let csv =
    "ID,Year,Name,Start(YYYY-MM),ReAudits,Notes\n";

  filtered.forEach((row) => {
    const re = (row.reaudits || []).join(" | ");
    const notes = (row.notes || [])
      .map((n) => `${n.user || ""}:${n.yyyymm || ""}:${(n.text || "").replaceAll("\n", " ")}`)
      .join(" || ");

    const line = [
      row.id || "",
      row.year || "",
      (row.name || "").replaceAll('"', '""'),
      row.startYYYYMM || "",
      re.replaceAll('"', '""'),
      notes.replaceAll('"', '""'),
    ]
      .map((v) => `"${String(v)}"`)
      .join(",");

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
  // Buttons
  document.getElementById("saveBtn")?.addEventListener("click", onSaveNewAudit);
  document.getElementById("btnRefresh")?.addEventListener("click", refresh);
  document.getElementById("btnExport")?.addEventListener("click", exportJSON);

  // CSV button is inline in view.html
  window.exportToCSV = exportToCSV;

  // Year cards click
  document.getElementById("yearCards")?.addEventListener("click", (e) => {
    const t = e.target.closest(".card");
    if (!t) return;
    const year = t.dataset.year;
    STATE.selectedYear = year || "all";
    renderAll();
  });

  // Delegation for dynamic buttons
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;

    if (t.classList.contains("btn-add-reaudit")) {
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
