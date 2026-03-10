// ---------- SETTINGS ----------
const SHEET_NAME = "Audits";
const SPREADSHEET_ID = "1TeK6BKUwt12K3mysBeMR1uRMTo7SDevhwfZuYfnnfCk";

// ---------- HELPERS ----------
function getSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);

  // Create header if empty
  if (sh.getLastRow() === 0) {
    sh.appendRow([
      "id",
      "year",
      "name",
      "fileLink",
      "startYYYYMM",
      "reaudits_json",
      "notes_json",
      "updatedAt"
    ]);
    return sh;
  }

  // Ensure fileLink column exists for old sheets
  const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  if (header.indexOf("fileLink") === -1) {
    sh.insertColumnAfter(3); // after "name"
    sh.getRange(1, 4).setValue("fileLink");
  }

  return sh;
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function toYYYYMM_(val) {
  if (val === null || val === undefined || val === "") return "";

  if (typeof val === "string") {
    const s = val.trim();
    if (!s) return "";
    if (/^\d{4}-\d{2}$/.test(s)) return s;

    if (/^\d{2}\/\d{4}$/.test(s)) {
      const [mm, yyyy] = s.split("/");
      return `${yyyy}-${mm}`;
    }

    const d = new Date(s);
    if (!isNaN(d)) {
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      return `${d.getFullYear()}-${mm}`;
    }
    return "";
  }

  if (Object.prototype.toString.call(val) === "[object Date]" && !isNaN(val)) {
    const mm = String(val.getMonth() + 1).padStart(2, "0");
    return `${val.getFullYear()}-${mm}`;
  }

  try {
    const d = new Date(val);
    if (!isNaN(d)) {
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      return `${d.getFullYear()}-${mm}`;
    }
  } catch {}

  return "";
}

function readAll_() {
  const sh = getSheet_();
  const values = sh.getDataRange().getValues();
  if (values.length <= 1) return [];

  const header = values[0].map(h => String(h || "").trim());
  const idx = (name) => header.indexOf(name);

  const out = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const id = row[idx("id")];
    if (!id) continue;

    out.push({
      id: String(id || ""),
      year: String(row[idx("year")] || ""),
      name: String(row[idx("name")] || ""),
      fileLink: String(row[idx("fileLink")] || ""),
      startYYYYMM: toYYYYMM_(row[idx("startYYYYMM")]),
      reaudits: row[idx("reaudits_json")] ? JSON.parse(row[idx("reaudits_json")]) : [],
      notes: row[idx("notes_json")] ? JSON.parse(row[idx("notes_json")]) : [],
    });
  }
  return out;
}

function replaceAll_(items) {
  const sh = getSheet_();

  const lastRow = sh.getLastRow();
  if (lastRow > 1) {
    sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).clearContent();
  }

  const rows = (items || []).map(it => ([
    it.id || "",
    it.year || "",
    it.name || "",
    it.fileLink || "",
    toYYYYMM_(it.startYYYYMM),
    JSON.stringify(it.reaudits || []),
    JSON.stringify(it.notes || []),
    new Date().toISOString(),
  ]));

  if (rows.length) {
    sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
}

// ---------- WEB APP ----------
function doGet(e) {
  return jsonOut_({ ok: true, message: "Clinical Audit Web App is running" });
}

function doPost(e) {
  try {
    const body = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
    const req = JSON.parse(body);
    const action = String(req.action || "");
    const payload = req.payload || {};

    if (action === "list") {
      return jsonOut_({ ok: true, items: readAll_() });
    }

    if (action === "replace_all") {
      replaceAll_(payload.items || []);
      return jsonOut_({ ok: true });
    }

    return jsonOut_({ ok: false, error: "Unknown action: " + action });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

// ---------- OPTIONAL TEST ----------
function testSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Logger.log(ss.getName());
}

function fixStartYYYYMM_AllRows() {
  const sh = getSheet_();
  const rng = sh.getDataRange();
  const values = rng.getValues();
  if (values.length <= 1) return;

  const header = values[0].map(h => String(h || "").trim());
  const col = header.indexOf("startYYYYMM");
  if (col === -1) throw new Error('Column "startYYYYMM" not found.');

  let changed = 0;

  for (let r = 1; r < values.length; r++) {
    const oldVal = values[r][col];
    const fixed = toYYYYMM_(oldVal);

    if (fixed !== (typeof oldVal === "string" ? oldVal.trim() : "")) {
      values[r][col] = fixed;
      changed++;
    }
  }

  rng.setValues(values);
  Logger.log("Fixed startYYYYMM rows: " + changed);
}
