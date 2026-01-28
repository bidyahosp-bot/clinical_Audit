function showYear(year) {
  document.querySelectorAll('.year-section').forEach(div => div.style.display = 'none');
  document.getElementById(year).style.display = 'block';
}

// إظهار قسم افتراضي عند تحميل الصفحة
window.onload = function() {
  showYear('2024'); // يمكنك تغييره إلى '2026' إذا أردت أحدث سنة
};

function addAudit(year) {
  const name = document.getElementById('auditName' + year).value;
  const start = document.getElementById('startDate' + year).value;
  const reAudit = document.getElementById('reAuditDate' + year).value;

  if (name && start) {
    const table = document.getElementById('table' + year);
    const row = table.insertRow(-1);

    row.insertCell(0).innerText = name;

    // عرض تاريخ البداية بصيغة شهر/سنة فقط
    const startDate = new Date(start);
    const startMonth = ("0" + (startDate.getMonth() + 1)).slice(-2);
    const startYear = startDate.getFullYear();
    row.insertCell(1).innerText = startMonth + "/" + startYear;

    // خانة Re-Audit History (اختيارية)
    const reAuditCell = row.insertCell(2);
    const reAuditList = document.createElement('ul');
    reAuditList.id = 'reaudit-' + year + '-' + table.rows.length;
    if (reAudit) {
      const reAuditDate = new Date(reAudit);
      const reAuditMonth = ("0" + (reAuditDate.getMonth() + 1)).slice(-2);
      const reAuditYear = reAuditDate.getFullYear();
      const firstItem = document.createElement('li');
      firstItem.innerText = reAuditMonth + "/" + reAuditYear;
      reAuditList.appendChild(firstItem);
    }
    reAuditCell.appendChild(reAuditList);

    const newReAuditInput = document.createElement('input');
    newReAuditInput.type = 'date';
    newReAuditInput.id = 'newReAudit-' + year + '-' + table.rows.length;
    reAuditCell.appendChild(newReAuditInput);

    const btnReAudit = document.createElement('button');
    btnReAudit.innerText = "Add Re-Audit";
    btnReAudit.onclick = function() {
      addReAudit(year + '-' + table.rows.length);
    };
    reAuditCell.appendChild(btnReAudit);

    // خانة الملاحظات
    const notesCell = row.insertCell(3);
    const notesDiv = document.createElement('div');
    notesDiv.id = 'notes-' + year + '-' + table.rows.length;
    notesCell.appendChild(notesDiv);

    const noteInput = document.createElement('input');
    noteInput.placeholder = "Add note...";
    noteInput.id = 'noteText-' + year + '-' + table.rows.length;
    notesCell.appendChild(noteInput);

    const userInput = document.createElement('input');
    userInput.placeholder = "Your name...";
    userInput.id = 'userName-' + year + '-' + table.rows.length;
    notesCell.appendChild(userInput);

    const btn = document.createElement('button');
    btn.innerText = "Add Note";
    btn.onclick = function() {
      addNote(year + '-' + table.rows.length);
    };
    notesCell.appendChild(btn);

    // خانة الإجراءات
    const actionsCell = row.insertCell(4);
    const editBtn = document.createElement('button');
    editBtn.innerText = "Edit";
    editBtn.onclick = function() {
      editAudit(row);
    };
    actionsCell.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.innerText = "Delete";
    deleteBtn.onclick = function() {
      table.deleteRow(row.rowIndex);
    };
    actionsCell.appendChild(deleteBtn);

    document.getElementById('auditName' + year).value = '';
    document.getElementById('startDate' + year).value = '';
    document.getElementById('reAuditDate' + year).value = '';
  } else {
    alert("Please enter Clinical Audit Name and Start Date.");
  }
}

function addReAudit(id) {
  const newDate = document.getElementById('newReAudit-' + id).value;
  if (newDate) {
    const list = document.getElementById('reaudit-' + id);
    const reAuditDate = new Date(newDate);
    const reAuditMonth = ("0" + (reAuditDate.getMonth() + 1)).slice(-2);
    const reAuditYear = reAuditDate.getFullYear();
    const item = document.createElement('li');
    item.innerText = reAuditMonth + "/" + reAuditYear;
    list.appendChild(item);
    document.getElementById('newReAudit-' + id).value = '';
  } else {
    alert("Please select a date.");
  }
}

function addNote(id) {
  const noteText = document.getElementById('noteText-' + id).value;
  const userName = document.getElementById('userName-' + id).value;
  if (noteText && userName) {
    const noteDiv = document.getElementById('notes-' + id);
    const now = new Date();
    const month = ("0" + (now.getMonth() + 1)).slice(-2);
    const year = now.getFullYear();
    const formattedDate = month + "/" + year;

    const note = document.createElement('div');
    note.className = 'note';
    note.innerHTML = `<strong>${userName}</strong> (${formattedDate}): ${noteText}`;
    noteDiv.appendChild(note);

    document.getElementById('noteText-' + id).value = '';
    document.getElementById('userName-' + id).value = '';
  } else {
    alert("Please enter both note and your name.");
  }
}

function editAudit(row) {
  const name = prompt("Edit Clinical Audit Name:", row.cells[0].innerText);
  const start = prompt("Edit Start Date (YYYY-MM):", "");

  if (name && start) {
    row.cells[0].innerText = name;

    // تحويل المدخل إلى شهر/سنة فقط
    const startDate = new Date(start + "-01");
    const startMonth = ("0" + (startDate.getMonth() + 1)).slice(-2);
    const startYear = startDate.getFullYear();
    row.cells[1].innerText = startMonth + "/" + startYear;
  }
}