// Bidiyah Hospital Clinical Audit - script.js

const APP_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyvwGH45jfOgDUhGL5F7u7zB0moic3fBbH2tzQGuUvsViC5B68Y5v4ZsP4IHowIN8q4/exec";

const STORAGE_KEY = "clinical_audit_items_v5";
const APP_MODE = window.APP_MODE || "manage";
const isView = APP_MODE === "view";

const STATE = {
  items: [],
  selectedYear: "all",
  auditorFilter: "",
};

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

function buildDownloadUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  const m = u.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  if (m && m[1]) {
    return `https://drive.google.com/uc?export=download&id=${m[1]}`;
  }
  return u;
}

function toKeyName(s) {
  return String(s || "").trim().toLowerCase();
}

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
    obj.reaudits += Array.isArray(it.reaudits) ? it.reaudits.length : 0;
    obj.notes += Array.isArray(it.notes) ? it.notes.length : 0;
  });

  if (!map.has("2024")) map.set("2024", { year: "2024", count: 0, reaudits: 0, notes: 0 });
  return Array.from(map.values()).sort((a, b) => Number(b.year) - Number(a.year));
}

function filterByYear(items) {
  if (STATE.selectedYear === "all") return items;
  return (items || []).filter((it) => String(it.year) === String(STATE.selectedYear));
}

function filterByAuditor(items) {
  const q = toKeyName(STATE.auditorFilter);
  if (!q) return items;

  return (items || []).filter((it) => {
    const names = [];
    (it.reaudits || []).forEach((r) => names.push(r?.name || ""));
    (it.notes || []).forEach((n) => names.push(n?.name || ""));
    return names.some((nm) => toKeyName(nm).includes(q));
  });
}

async function apiRequest(action, payload) {
  if (!APP_SCRIPT_URL) throw new Error("APP_SCRIPT_URL is not set");

  const res = await fetch(APP_SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify({ action, payload }),
  });

  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}

  if (!res.ok || !data || data.ok !== true) {
    const msg = data?.error ? data.error : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

async function loadAllAudits() {
  if (APP_SCRIPT_URL) {
    const data = await apiRequest("list", {});
    return migrateItems_(Array.isArray(data.items) ? data.items : []);
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

function migrateItems_(items) {
  return (items || []).map((it) => {
    const out = { ...it };

    if (out.fileLink === undefined) out.fileLink = "";
    if (out.posterLink === undefined) out.posterLink = "";

    if (Array.isArray(out.reaudits)) {
      if (out.reaudits.length && typeof out.reaudits[0] === "string") {
        out.reaudits = out.reaudits.map((m) => ({ name: "", yyyymm: String(m || "") }));
      } else {
        out.reaudits = out.reaudits.map((r) => ({
          name: String(r?.name || ""),
          yyyymm: String(r?.yyyymm || ""),
        }));
      }
    } else {
      out.reaudits = [];
    }

    if (Array.isArray(out.notes)) {
      if (out.notes.length && out.notes[0] && out.notes[0].user !== undefined) {
        out.notes = out.notes.map((n) => ({
          name: String(n.user || ""),
          yyyymm: String(n.yyyymm || ""),
          note: String(n.text || ""),
        }));
      } else {
        out.notes = out.notes.map((n) => ({
          name: String(n?.name || ""),
          yyyymm: String(n?.yyyymm || ""),
          note: String(n?.note || ""),
        }));
      }
    } else {
      out.notes = [];
    }

    out.startYYYYMM = String(out.startYYYYMM || "").trim();
    return out;
  });
}

async function updateAuditOnServer(auditId, mutatorFn) {
  const latest = await loadAllAudits();
  const idx = latest.findIndex((a) => String(a.id) === String(auditId));
  if (idx === -1) throw new Error("Audit not found on server.");

  latest[idx].reaudits = Array.isArray(latest[idx].reaudits) ? latest[idx].reaudits : [];
  latest[idx].notes = Array.isArray(latest[idx].notes) ? latest[idx].notes : [];
  if (latest[idx].fileLink === undefined) latest[idx].fileLink = "";
  if (latest[idx].posterLink === undefined) latest[idx].posterLink = "";

  mutatorFn(latest[idx]);

  await saveAllAudits(latest);
  STATE.items = latest;
  renderAll();
}

function computeAuditorStats(items) {
  const counts = new Map();

  (items || []).forEach((it) => {
    (it.reaudits || []).forEach((r) => {
      const nm = String(r?.name || "").trim();
      if (!nm) return;
      const key = toKeyName(nm);
      counts.set(key, { name: nm, count: (counts.get(key)?.count || 0) + 1 });
    });
  });

  const list = Array.from(counts.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const top = list[0] || null;
  return { top, list };
}

function ensureEnhancementsUI() {
  const host = document.querySelector(".panel .table-wrap") || document.body;

  if (!document.getElementById("auditorFilterBox")) {
    const box = document.createElement("div");
    box.id = "auditorFilterBox";
    box.style.margin = "12px 0";
    box.style.display = "flex";
    box.style.gap = "10px";
    box.style.alignItems = "center";
    box.style.flexWrap = "wrap";

    const label = document.createElement("div");
    label.style.fontWeight = "600";
    label.textContent = "Filter by Auditor Name:";
    box.appendChild(label);

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Type auditor name...";
    input.style.padding = "8px 10px";
    input.style.borderRadius = "8px";
    input.style.border = "1px solid #cfd6e4";
    input.style.minWidth = "260px";
    input.value = STATE.auditorFilter;
    input.addEventListener("input", () => {
      STATE.auditorFilter = input.value;
      renderAll();
    });
    box.appendChild(input);

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "btn secondary";
    clearBtn.textContent = "Clear";
    clearBtn.addEventListener("click", () => {
      STATE.auditorFilter = "";
      input.value = "";
      renderAll();
    });
    box.appendChild(clearBtn);

    const table = document.getElementById("auditsTable");
    if (table && table.parentElement) {
      table.parentElement.insertBefore(box, table);
    }
  }

  if (!document.getElementById("auditorStatsPanel")) {
    const panel = document.createElement("div");
    panel.id = "auditorStatsPanel";
    panel.style.margin = "12px 0";
    panel.style.padding = "12px";
    panel.style.border = "1px solid #e2e8f0";
    panel.style.borderRadius = "12px";
    panel.style.background = "#fff";

    const table = document.getElementById("auditsTable");
    if (table && table.parentElement) {
      table.parentElement.insertBefore(panel, table);
    }
  }
}

function renderAuditorStats(items) {
  const panel = document.getElementById("auditorStatsPanel");
  if (!panel) return;

  const { top, list } = computeAuditorStats(items);

  const topHtml = top
    ? `<div style="font-size:18px;font-weight:700;">Top Auditor: ${escapeHtml(top.name)} <span style="font-weight:600;">(${top.count})</span></div>`
    : `<div style="font-size:18px;font-weight:700;">Top Auditor: -</div>`;

  const rows = list
    .slice(0, 10)
    .map((x) => `<tr><td style="padding:6px 10px;border-top:1px solid #eef2f7;">${escapeHtml(x.name)}</td><td style="padding:6px 10px;border-top:1px solid #eef2f7;">${x.count}</td></tr>`)
    .join("");

  panel.innerHTML = `
    ${topHtml}
    <div style="margin-top:10px;font-weight:600;">Audits per Auditor (Top 10)</div>
    <table style="width:100%;border-collapse:collapse;margin-top:6px;">
      <tr>
        <th style="text-align:left;padding:6px 10px;background:#f7f9fc;border:1px solid #eef2f7;">Auditor</th>
        <th style="text-align:left;padding:6px 10px;background:#f7f9fc;border:1px solid #eef2f7;">Count</th>
      </tr>
      ${rows || `<tr><td style="padding:8px 10px;border-top:1px solid #eef2f7;" colspan="2">No auditor entries yet.</td></tr>`}
    </table>
  `;
}

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
    <div class="statbox"><div class="k">Total Auditor Entries</div><div class="v">${totalRe}</div></div>
    <div class="statbox"><div class="k">Total Re-Auditor Entries</div><div class="v">${totalNotes}</div></div>
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
      <th>File</th>
      <th>Poster</th>
      <th>Year</th>
      <th>Start (MM/YYYY)</th>
      <th>Auditor Name</th>
      <th>Re-Auditor Name & Date</th>
      ${isView ? "" : "<th>Actions</th>"}
    </tr>
  `;

  sorted.forEach((audit) => {
    const tr = document.createElement("tr");

    const tdName = document.createElement("td");
    tdName.textContent = audit.name || "";
    tr.appendChild(tdName);

    const tdFile = document.createElement("td");
    const fileLink = String(audit.fileLink || "").trim();
    if (fileLink) {
      const openA = document.createElement("a");
      openA.href = fileLink;
      openA.target = "_blank";
      openA.rel = "noopener noreferrer";
      openA.textContent = "Open";
      tdFile.appendChild(openA);

      const dl = document.createElement("a");
      dl.href = buildDownloadUrl(fileLink);
      dl.target = "_blank";
      dl.rel = "noopener noreferrer";
      dl.textContent = "Download";
      dl.style.marginLeft = "10px";
      tdFile.appendChild(dl);
    } else {
      tdFile.textContent = "-";
    }

    if (!isView) {
      const ctrls = document.createElement("div");
      ctrls.className = "inline-controls";

      const inp = document.createElement("input");
      inp.type = "text";
      inp.placeholder = "Paste file link...";
      inp.className = "file-link";
      inp.dataset.id = audit.id;
      inp.value = fileLink;
      ctrls.appendChild(inp);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn secondary btn-save-link";
      btn.dataset.id = audit.id;
      btn.textContent = "Save";
      ctrls.appendChild(btn);

      tdFile.appendChild(ctrls);
    }

    tr.appendChild(tdFile);

    const tdPoster = document.createElement("td");
    const posterLink = String(audit.posterLink || "").trim();
    if (posterLink) {
      const openP = document.createElement("a");
      openP.href = posterLink;
      openP.target = "_blank";
      openP.rel = "noopener noreferrer";
      openP.textContent = "View Poster";
      tdPoster.appendChild(openP);
    } else {
      tdPoster.textContent = "-";
    }

    if (!isView) {
      const ctrls = document.createElement("div");
      ctrls.className = "inline-controls";

      const inp = document.createElement("input");
      inp.type = "text";
      inp.placeholder = "Paste poster link...";
      inp.className = "poster-link";
      inp.dataset.id = audit.id;
      inp.value = posterLink;
      ctrls.appendChild(inp);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn secondary btn-save-poster";
      btn.dataset.id = audit.id;
      btn.textContent = "Save";
      ctrls.appendChild(btn);

      tdPoster.appendChild(ctrls);
    }

    tr.appendChild(tdPoster);

    const tdYear = document.createElement("td");
    tdYear.textContent = audit.year || "";
    tr.appendChild(tdYear);

    const tdStart = document.createElement("td");
    tdStart.textContent = monthToLabel(audit.startYYYYMM || "");
    tr.appendChild(tdStart);

    const tdAud = document.createElement("td");
    const list = document.createElement("ul");
    list.className = "reaudit-list";
    (audit.reaudits || []).forEach((r) => {
      const li = document.createElement("li");
      const nm = String(r?.name || "").trim();
      li.textContent = nm || "-";
      list.appendChild(li);
    });
    tdAud.appendChild(list);

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

      tdAud.appendChild(ctrls);
    }

    tr.appendChild(tdAud);

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
  ensureEnhancementsUI();

  renderYearCards();

  let filtered = filterByYear(STATE.items);
  filtered = filterByAuditor(filtered);

  const title = document.getElementById("tableTitle");
  if (title) {
    const y = STATE.selectedYear === "all" ? "All Years" : STATE.selectedYear;
    const q = STATE.auditorFilter ? ` | Auditor: "${STATE.auditorFilter}"` : "";
    title.textContent = `All Audits - ${y}${q}`;
  }

  renderStatsGrid(filtered);
  renderAuditorStats(filtered);
  renderTable(filtered);
}

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
    const fileLink = normalizeUrl((document.getElementById("fileLink")?.value || "").trim());
    const posterLink = normalizeUrl((document.getElementById("posterLink")?.value || "").trim());
    const startYYYYMM = (document.getElementById("startMonth")?.value || "").trim();

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
      posterLink: posterLink || "",
      startYYYYMM,
      reaudits: [],
      notes: [],
    });

    await saveAllAudits(latest);
    STATE.items = latest;

    document.getElementById("auditName") && (document.getElementById("auditName").value = "");
    document.getElementById("fileLink") && (document.getElementById("fileLink").value = "");
    document.getElementById("posterLink") && (document.getElementById("posterLink").value = "");
    document.getElementById("startMonth") && (document.getElementById("startMonth").value = "");

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

async function savePosterLink(id) {
  try {
    const inp = document.querySelector(`.poster-link[data-id="${id}"]`);
    const link = normalizeUrl((inp?.value || "").trim());

    await updateAuditOnServer(id, (audit) => {
      audit.posterLink = link || "";
    });
  } catch (e) {
    alert(`Save poster failed: ${e.message || e}`);
  }
}

async function addReAudit(id) {
  try {
    const nameInp = document.querySelector(`.reaudit-name[data-id="${id}"]`);
    const monthInp = document.querySelector(`.reaudit-month[data-id="${id}"]`);

    const nm = (nameInp?.value || "").trim();
    const yyyymm = (monthInp?.value || "").trim();

    if (!nm) {
      alert("Please enter Auditor name.");
      return;
    }
    if (!yyyymm || !isValidYYYYMM(yyyymm)) {
      alert("Please select Month (YYYY-MM).");
      return;
    }

    await updateAuditOnServer(id, (audit) => {
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
    const note = (noteInp?.value || "").trim();

    if (!nm) {
      alert("Please enter Re-auditor name.");
      return;
    }
    if (!yyyymm || !isValidYYYYMM(yyyymm)) {
      alert("Please select Date (YYYY-MM).");
      return;
    }

    await updateAuditOnServer(id, (audit) => {
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

    if (!nm) {
      alert("Name is required.");
      return;
    }
    if (!yyyymm || !isValidYYYYMM(yyyymm)) {
      alert("Date must be YYYY-MM.");
      return;
    }

    await updateAuditOnServer(id, (audit) => {
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

    const newFile = prompt("Edit File Link (optional):", auditLocal.fileLink || "");
    if (newFile === null) return;
    const fileLink = normalizeUrl(newFile.trim());

    const newPoster = prompt("Edit Poster Link (optional):", auditLocal.posterLink || "");
    if (newPoster === null) return;
    const posterLink = normalizeUrl(newPoster.trim());

    if (!year || !/^\d{4}$/.test(year) || !name) {
      alert("Invalid Year/Name.");
      return;
    }
    if (startYYYYMM && !isValidYYYYMM(startYYYYMM)) {
      alert("Start must be YYYY-MM or empty.");
      return;
    }

    const latest = await loadAllAudits();
    const idx = latest.findIndex((a) => String(a.id) === String(id));
    if (idx === -1) throw new Error("Audit not found on server.");

    latest[idx].year = year;
    latest[idx].name = name;
    latest[idx].startYYYYMM = startYYYYMM;
    latest[idx].fileLink = fileLink || "";
    latest[idx].posterLink = posterLink || "";

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

function exportJSON() {
  const items = filterByAuditor(filterByYear(STATE.items));
  const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "clinical_audit_export.json";
  a.click();
}

function exportToCSV() {
  const items = filterByAuditor(filterByYear(STATE.items));
  if (!items.length) {
    alert("No data to export");
    return;
  }

  let csv = "ID,Year,AuditName,FileLink,PosterLink,Start(YYYY-MM),Auditors,ReAuditorEntries\n";

  items.forEach((row) => {
    const auditors = (row.reaudits || [])
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
      (row.posterLink || "").replaceAll('"', '""'),
      row.startYYYYMM || "",
      auditors.replaceAll('"', '""'),
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
    } else if (t.classList.contains("btn-save-poster")) {
      savePosterLink(t.dataset.id);
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
