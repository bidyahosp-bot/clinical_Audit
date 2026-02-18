// Bidiyah Hospital Clinical Audit
// Data is saved in localStorage so it remains after refresh.

const YEARS = ["2024", "2025", "2026"];

function storageKey(year) {
  return `audits_${year}`;
}

function safeParse(json, fallback) {
  try {
    const v = JSON.parse(json);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function getAudits(year) {
  return safeParse(localStorage.getItem(storageKey(year)), []);
}

function setAudits(year, audits) {
  localStorage.setItem(storageKey(year), JSON.stringify(audits));
}

function makeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function fmtMonthYear(isoDate) {
  // isoDate: YYYY-MM-DD
  if (!isoDate) return "";
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return "";
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${month}/${year}`;
}

function showYear(year) {
  document.querySelectorAll(".year-section").forEach((div) => {
    div.style.display = "none";
  });
  const section = document.getElementById(year);
  if (section) section.style.display = "block";
}

function tableHeaderHTML() {
  return `
    <tr>
      <th>Clinical Audit Name</th>
      <th>Start Date</th>
      <th>Re-Audit History</th>
      <th>Notes</th>
      <th>Actions</th>
    </tr>
  `;
}

function renderYear(year) {
  const table = document.getElementById("table" + year);
  if (!table) return;

  table.innerHTML = tableHeaderHTML();

  const audits = getAudits(year);

  audits.forEach((audit) => {
    const tr = document.createElement("tr");
    tr.dataset.id = audit.id;
    tr.dataset.year = year;

    // 1) Name
    const tdName = document.createElement("td");
    tdName.textContent = audit.name || "";
    tr.appendChild(tdName);

    // 2) Start Date (MM/YYYY)
    const tdStart = document.createElement("td");
    tdStart.textContent = fmtMonthYear(audit.startISO);
    tr.appendChild(tdStart);

    // 3) Re-audit
    const tdRe = document.createElement("td");

    const ul = document.createElement("ul");
    ul.className = "reaudit-list";
    (audit.reaudits || []).forEach((r) => {
      const li = document.createElement("li");
      li.textContent = fmtMonthYear(r.iso);
      ul.appendChild(li);
    });
    tdRe.appendChild(ul);

    const reInput = document.createElement("input");
    reInput.type = "date";
    reInput.className = "reaudit-input";
    reInput.dataset.id = audit.id;
    reInput.dataset.year = year;
    tdRe.appendChild(reInput);

    const reBtn = document.createElement("button");
    reBtn.type = "button";
    reBtn.className = "btn-add-reaudit";
    reBtn.dataset.id = audit.id;
    reBtn.dataset.year = year;
    reBtn.textContent = "Add Re-Audit";
    tdRe.appendChild(reBtn);

    tr.appendChild(tdRe);

    // 4) Notes
    const tdNotes = document.createElement("td");

    const notesDiv = document.createElement("div");
    notesDiv.className = "notes";
    (audit.notes || []).forEach((n) => {
      const div = document.createElement("div");
      div.className = "note";
      div.innerHTML = `<strong>${escapeHtml(n.user || "")}</strong> (${fmtMonthYear(n.iso || "")}): ${escapeHtml(n.text || "")}`;
      notesDiv.appendChild(div);
    });
    tdNotes.appendChild(notesDiv);

    const noteInput = document.createElement("input");
    noteInput.placeholder = "Add note...";
    noteInput.className = "note-text";
    noteInput.dataset.id = audit.id;
    noteInput.dataset.year = year;
    tdNotes.appendChild(noteInput);

    const userInput = document.createElement("input");
    userInput.placeholder = "Your name...";
    userInput.className = "note-user";
    userInput.dataset.id = audit.id;
    userInput.dataset.year = year;
    tdNotes.appendChild(userInput);

    const noteBtn = document.createElement("button");
    noteBtn.type = "button";
    noteBtn.className = "btn-add-note";
    noteBtn.dataset.id = audit.id;
    noteBtn.dataset.year = year;
    noteBtn.textContent = "Add Note";
    tdNotes.appendChild(noteBtn);

    tr.appendChild(tdNotes);

    // 5) Actions
    const tdActions = document.createElement("td");

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn-edit";
    editBtn.dataset.id = audit.id;
    editBtn.dataset.year = year;
    editBtn.textContent = "Edit";
    tdActions.appendChild(editBtn);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn-delete";
    delBtn.dataset.id = audit.id;
    delBtn.dataset.year = year;
    delBtn.textContent = "Delete";
    tdActions.appendChild(delBtn);

    tr.appendChild(tdActions);

    table.appendChild(tr);
  });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function addAudit(year) {
  const nameEl = document.getElementById("auditName" + year);
  const startEl = document.getElementById("startDate" + year);
  const reEl = document.getElementById("reAuditDate" + year);

  const name = (nameEl?.value || "").trim();
  const startISO = startEl?.value || "";
  const reISO = reEl?.value || "";

  if (!name || !startISO) {
    alert("Please enter Clinical Audit Name and Start Date.");
    return;
  }

  const audits = getAudits(year);
  const newAudit = {
    id: makeId(),
    name,
    startISO,
    reaudits: [],
    notes: [],
  };

  if (reISO) {
    newAudit.reaudits.push({ iso: reISO });
  }

  audits.push(newAudit);
  setAudits(year, audits);

  // Clear inputs
  if (nameEl) nameEl.value = "";
  if (startEl) startEl.value = "";
  if (reEl) reEl.value = "";

  renderYear(year);
}

function addReAudit(year, id) {
  const audits = getAudits(year);
  const audit = audits.find((a) => a.id === id);
  if (!audit) return;

  const input = document.querySelector(`.reaudit-input[data-year="${year}"][data-id="${id}"]`);
  const iso = input?.value || "";
  if (!iso) {
    alert("Please select a date.");
    return;
  }

  audit.reaudits = audit.reaudits || [];
  audit.reaudits.push({ iso });

  setAudits(year, audits);
  renderYear(year);
}

function addNote(year, id) {
  const audits = getAudits(year);
  const audit = audits.find((a) => a.id === id);
  if (!audit) return;

  const noteInput = document.querySelector(`.note-text[data-year="${year}"][data-id="${id}"]`);
  const userInput = document.querySelector(`.note-user[data-year="${year}"][data-id="${id}"]`);
  const text = (noteInput?.value || "").trim();
  const user = (userInput?.value || "").trim();

  if (!text || !user) {
    alert("Please enter both note and your name.");
    return;
  }

  const now = new Date();
  // store an ISO date (YYYY-MM-DD) for month/year display
  const iso = now.toISOString().slice(0, 10);

  audit.notes = audit.notes || [];
  audit.notes.push({ user, text, iso });

  setAudits(year, audits);
  renderYear(year);
}

function editAudit(year, id) {
  const audits = getAudits(year);
  const audit = audits.find((a) => a.id === id);
  if (!audit) return;

  const newName = prompt("Edit Clinical Audit Name:", audit.name || "");
  if (newName === null) return; // cancelled
  const name = newName.trim();

  const currentYYYYMM = (audit.startISO || "").slice(0, 7); // YYYY-MM
  const newStart = prompt("Edit Start Date (YYYY-MM):", currentYYYYMM);
  if (newStart === null) return; // cancelled
  const startYYYYMM = newStart.trim();

  if (!name || !/^\d{4}-\d{2}$/.test(startYYYYMM)) {
    alert("Please enter a valid name and date like 2026-02.");
    return;
  }

  audit.name = name;
  audit.startISO = startYYYYMM + "-01";

  setAudits(year, audits);
  renderYear(year);
}

function deleteAudit(year, id) {
  const audits = getAudits(year);
  const filtered = audits.filter((a) => a.id !== id);
  setAudits(year, filtered);
  renderYear(year);
}

document.addEventListener("DOMContentLoaded", () => {
  // Year buttons
  document.querySelectorAll(".year-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      showYear(btn.dataset.year);
    });
  });

  // Save Audit buttons
  document.querySelectorAll(".btn-save-audit").forEach((btn) => {
    btn.addEventListener("click", () => addAudit(btn.dataset.year));
  });

  // Event delegation for dynamic buttons
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.classList.contains("btn-add-reaudit")) {
      addReAudit(target.dataset.year, target.dataset.id);
    } else if (target.classList.contains("btn-add-note")) {
      addNote(target.dataset.year, target.dataset.id);
    } else if (target.classList.contains("btn-edit")) {
      editAudit(target.dataset.year, target.dataset.id);
    } else if (target.classList.contains("btn-delete")) {
      deleteAudit(target.dataset.year, target.dataset.id);
    }
  });

  // Initial render
  YEARS.forEach((y) => renderYear(y));
  showYear("2024");
});
