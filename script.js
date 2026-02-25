// Bidiyah Hospital Clinical Audit
// ------------------------------------------------------------
// IMPORTANT (Network / Shared data):
// 1) If you want ONE unified table for all devices on the network,
//    you need a shared backend (recommended: Google Sheets via Apps Script).
// 2) If APP_SCRIPT_URL is empty, the app will fallback to localStorage
//    (works on ONE device only).
// ------------------------------------------------------------

// Paste your deployed Apps Script Web App URL here (ends with /exec)
const APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyWCwCgqTcaYKXjzAqtJ9mjLRQKEZRk4fEMxoN3ulYdutPCvYzFbki3ZNKBY69aJZjy/exec";

const STORAGE_KEY_ALL = "audits_all_v2";

function safeParse(json, fallback) {
  try {
    const v = JSON.parse(json);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function makeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function monthToLabel(yyyymm) {
  // yyyymm: "YYYY-MM" or ""
  if (!yyyymm) return "";
  const m = yyyymm.split("-");
  if (m.length !== 2) return "";
  return `${m[1]}/${m[0]}`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// -------------------- Data Layer --------------------

async function apiRequest(action, payload) {
  if (!APP_SCRIPT_URL) throw new Error("APP_SCRIPT_URL is not set");

  const res = await fetch(APP_SCRIPT_URL, {
    method: "POST",
    // لا تضع Headers هنا حتى لا يحدث preflight (CORS)
    body: JSON.stringify({ action, payload }),
  });

  const text = await res.text(); // نستقبل كنص أولًا
  let data = null;
  try { data = JSON.parse(text); } catch {}

  if (!res.ok || !data || data.ok !== true) {
    const msg = (data && data.error) ? data.error : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

async function loadAllAudits() {
  // Backend preferred
  if (APP_SCRIPT_URL) {
    const data = await apiRequest("list", {});
    return Array.isArray(data.items) ? data.items : [];
  }

  // Fallback: localStorage (single-device)
  return safeParse(localStorage.getItem(STORAGE_KEY_ALL), []);
}

async function saveAllAudits(items) {
  if (APP_SCRIPT_URL) {
    await apiRequest("replace_all", { items });
    return;
  }
  localStorage.setItem(STORAGE_KEY_ALL, JSON.stringify(items));
}

// -------------------- UI State --------------------

let STATE = {
  items: [],
  filterYear: null, // string year or null
};

function getMode() {
  return (window.APP_MODE || "manage").toLowerCase();
}

function getYearList(items) {
  // Collect years from data + add current year and neighbors
  const nowYear = new Date().getFullYear();
  const s = new Set([String(nowYear - 1), String(nowYear), String(nowYear + 1)]);
  (items || []).forEach((it) => {
    if (it && it.year) s.add(String(it.year));
  });

  // Sort DESC so newest year appears first
  return Array.from(s).sort((a, b) => Number(b) - Number(a));
}

function computeStats(items) {
  const out = {
    totalAudits: items.length,
    totalReaudits: 0,
    totalNotes: 0,
  };
  items.forEach((it) => {
    out.totalReaudits += (it.reaudits || []).length;
    out.totalNotes += (it.notes || []).length;
  });
  return out;
}

function computeYearStats(items) {
  const map = new Map();
  items.forEach((it) => {
    const y = String(it.year || "");
    if (!y) return;
    if (!map.has(y)) map.set(y, { year: y, audits: 0, reaudits: 0, notes: 0 });
    const row = map.get(y);
    row.audits += 1;
    row.reaudits += (it.reaudits || []).length;
    row.notes += (it.notes || []).length;
  });
  return Array.from(map.values()).sort((a, b) => b.year.localeCompare(a.year));
}

function setActiveCard(year) {
  document.querySelectorAll(".card[data-year]").forEach((c) => {
    c.classList.toggle("active", c.getAttribute("data-year") === String(year || ""));
  });
}

function renderYearCards(items) {
  const wrap = document.getElementById("yearCards");
  if (!wrap) return;

  const yearStats = computeYearStats(items);
  const years = getYearList(items);

  // Make sure every year exists even if 0
  const byYear = new Map(yearStats.map((x) => [x.year, x]));
  const normalized = years.map((y) => byYear.get(y) || ({ year: y, audits: 0, reaudits: 0, notes: 0 }));

  wrap.innerHTML = "";

  // "All" card
  const all = document.createElement("div");
  all.className = "card";
  all.setAttribute("data-year", "");
  const g = computeStats(items);
  all.innerHTML = `
    <div class="title">All Years</div>
    <div class="big">${g.totalAudits}</div>
    <div class="sub">Re-audits: ${g.totalReaudits} • Notes: ${g.totalNotes}</div>
  `;
  all.addEventListener("click", () => {
    STATE.filterYear = null;
    setActiveCard("");
    renderTable();
    renderHeaderTitles();
    renderGlobalStats();
  });
  wrap.appendChild(all);

  normalized.forEach((s) => {
    const card = document.createElement("div");
    card.className = "card";
    card.setAttribute("data-year", s.year);
    card.innerHTML = `
      <div class="title">${escapeHtml(s.year)}</div>
      <div class="big">${s.audits}</div>
      <div class="sub">Re-audits: ${s.reaudits} • Notes: ${s.notes}</div>
    `;
    card.addEventListener("click", () => {
      STATE.filterYear = s.year;
      setActiveCard(s.year);
      renderTable();
      renderHeaderTitles();
      renderGlobalStats();
    });
    wrap.appendChild(card);
  });

  // default active
  setActiveCard(STATE.filterYear || "");
}

function renderYearSelect(items) {
  const sel = document.getElementById("yearSelect");
  if (!sel) return;

  const years = getYearList(items);

  sel.innerHTML =
    `<option value="" selected disabled>Select Year</option>` +
    years.map((y) => `<option value="${y}">${y}</option>`).join("");

  // default to current filter or current year (if present)
  const nowYear = String(new Date().getFullYear());
  const preferred = (STATE.filterYear && years.includes(STATE.filterYear))
    ? STATE.filterYear
    : (years.includes(nowYear) ? nowYear : (years[0] || ""));

  if (preferred) sel.value = preferred;
}

function tableHeaderHTML(mode) {
  const isView = mode === "view";
  return `
    <tr>
      <th>Year</th>
      <th>Clinical Audit Name</th>
      <th>Start (MM/YYYY)</th>
      <th>Re-Audit History</th>
      <th>Notes</th>
      <th>${isView ? "" : "Actions"}</th>
    </tr>
  `;
}

function getFilteredItems() {
  if (!STATE.filterYear) return STATE.items;
  return STATE.items.filter((it) => String(it.year) === String(STATE.filterYear));
}

function renderHeaderTitles() {
  const title = document.getElementById("tableTitle");
  if (!title) return;
  title.textContent = STATE.filterYear ? `Audits - ${STATE.filterYear}` : "All Audits";
}

function renderGlobalStats() {
  const box = document.getElementById("globalStats");
  if (!box) return;

  const items = getFilteredItems();
  const s = computeStats(items);

  box.innerHTML = `
    <div class="statbox"><div class="k">Total Audits</div><div class="v">${s.totalAudits}</div></div>
    <div class="statbox"><div class="k">Total Re-Audits</div><div class="v">${s.totalReaudits}</div></div>
    <div class="statbox"><div class="k">Total Notes</div><div class="v">${s.totalNotes}</div></div>
  `;
}

function renderTable() {
  const table = document.getElementById("auditsTable");
  if (!table) return;

  const mode = getMode();
  const isView = mode === "view";

  table.innerHTML = tableHeaderHTML(mode);

  const items = getFilteredItems();

  // Sort: newest year first, then newest start month
  items.sort((a, b) => {
    const ya = Number(a.year || 0);
    const yb = Number(b.year || 0);
    if (yb !== ya) return yb - ya;
    return String(b.startYYYYMM || "").localeCompare(String(a.startYYYYMM || ""));
  });

  items.forEach((audit) => {
    const tr = document.createElement("tr");
    tr.dataset.id = audit.id;

    // Year
    const tdYear = document.createElement("td");
    tdYear.textContent = audit.year || "";
    tr.appendChild(tdYear);

    // Name
    const tdName = document.createElement("td");
    tdName.textContent = audit.name || "";
    tr.appendChild(tdName);

    // Start month
    const tdStart = document.createElement("td");
    tdStart.textContent = monthToLabel(audit.startYYYYMM || "") || "-";
    tr.appendChild(tdStart);

    // Re-audit
    const tdRe = document.createElement("td");

    const ul = document.createElement("ul");
    ul.className = "reaudit-list";
    (audit.reaudits || []).forEach((r) => {
      const li = document.createElement("li");
      li.textContent = monthToLabel(r.yyyymm || "");
      ul.appendChild(li);
    });
    tdRe.appendChild(ul);

    if (!isView) {
      const ctrls = document.createElement("div");
      ctrls.className = "inline-controls";

      const reInput = document.createElement("input");
      reInput.type = "month";
      reInput.className = "reaudit-input";
      reInput.dataset.id = audit.id;
      ctrls.appendChild(reInput);

      const reBtn = document.createElement("button");
      reBtn.type = "button";
      reBtn.className = "btn btn-add-reaudit";
      reBtn.dataset.id = audit.id;
      reBtn.textContent = "Add Re-Audit";
      ctrls.appendChild(reBtn);

      tdRe.appendChild(ctrls);
    }

    tr.appendChild(tdRe);

    // Notes
    const tdNotes = document.createElement("td");

    const notesDiv = document.createElement("div");
    notesDiv.className = "notes";
    (audit.notes || []).forEach((n) => {
      const div = document.createElement("div");
      div.className = "note";
      div.innerHTML = `<strong>${escapeHtml(n.user || "")}</strong> (${escapeHtml(monthToLabel(n.yyyymm || ""))}): ${escapeHtml(n.text || "")}`;
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
      // default to current month
      const now = new Date();
      noteMonth.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      ctrls.appendChild(noteMonth);

      const noteBtn = document.createElement("button");
      noteBtn.type = "button";
      noteBtn.className = "btn btn-add-note";
      noteBtn.dataset.id = audit.id;
      noteBtn.textContent = "Add Note";
      ctrls.appendChild(noteBtn);

      tdNotes.appendChild(ctrls);
    }

    tr.appendChild(tdNotes);

    // Actions
    const tdActions = document.createElement("td");
    if (!isView) {
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn-edit";
      editBtn.dataset.id = audit.id;
      editBtn.textContent = "Edit";
      tdActions.appendChild(editBtn);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn-delete";
      delBtn.dataset.id = audit.id;
      delBtn.textContent = "Delete";
      tdActions.appendChild(delBtn);
    } else {
      tdActions.textContent = "";
    }
    tr.appendChild(tdActions);

    table.appendChild(tr);
  });
}

// -------------------- Mutations --------------------

async function addAudit() {
  const nameEl = document.getElementById("auditName");
  const yearEl = document.getElementById("yearSelect");
  const startEl = document.getElementById("startMonth");
  const reEl = document.getElementById("reAuditMonth");

  const name = (nameEl?.value || "").trim();
  const year = String(yearEl?.value || "").trim();
  const startYYYYMM = (startEl?.value || "").trim(); // optional
  const reYYYYMM = (reEl?.value || "").trim(); // optional

  if (!name || !year) {
    alert("Please enter Clinical Audit Name and Year.");
    return;
  }

  const newAudit = {
    id: makeId(),
    year,
    name,
    startYYYYMM: startYYYYMM || "",
    reaudits: [],
    notes: [],
  };

  if (reYYYYMM) newAudit.reaudits.push({ yyyymm: reYYYYMM });

  STATE.items.push(newAudit);
  await saveAllAudits(STATE.items);

  if (nameEl) nameEl.value = "";
  if (startEl) startEl.value = "";
  if (reEl) reEl.value = "";

  renderAll();
}

async function addReAudit(id) {
  const input = document.querySelector(`.reaudit-input[data-id="${id}"]`);
  const yyyymm = (input?.value || "").trim();
  if (!yyyymm) {
    alert("Please select a month.");
    return;
  }

  const audit = STATE.items.find((a) => a.id === id);
  if (!audit) return;

  audit.reaudits = audit.reaudits || [];
  audit.reaudits.push({ yyyymm });

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

// -------------------- Export (View page) --------------------

function exportJson() {
  const items = getFilteredItems();
  const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `clinical-audits-${STATE.filterYear || "all"}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// -------------------- Boot --------------------

async function refresh() {
  try {
    const items = await loadAllAudits();
    STATE.items = Array.isArray(items) ? items : [];

    // If filterYear not present anymore, clear it
    if (STATE.filterYear && !STATE.items.some((x) => String(x.year) === String(STATE.filterYear))) {
      STATE.filterYear = null;
    }

    renderAll();
  } catch (e) {
    alert(`Load failed: ${e.message}`);
  }
}

function renderAll() {
  renderYearCards(STATE.items);
  renderYearSelect(STATE.items);
  renderHeaderTitles();
  renderGlobalStats();
  renderTable();
}

document.addEventListener("DOMContentLoaded", () => {
  // Buttons
  const btnSave = document.getElementById("saveBtn");
  if (btnSave) btnSave.addEventListener("click", () => addAudit());

  const btnRefresh = document.getElementById("btnRefresh");
  if (btnRefresh) btnRefresh.addEventListener("click", () => refresh());

  const btnExport = document.getElementById("btnExport");
  if (btnExport) btnExport.addEventListener("click", () => exportJson());

  // Delegation for dynamic buttons
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;

    if (t.classList.contains("btn-add-reaudit")) {
      addReAudit(t.dataset.id);
    } else if (t.classList.contains("btn-add-note")) {
      addNote(t.dataset.id);
    } else if (t.classList.contains("btn-edit")) {
      editAudit(t.dataset.id);
    } else if (t.classList.contains("btn-delete")) {
      deleteAudit(t.dataset.id);
    }
  });

  refresh();
});
