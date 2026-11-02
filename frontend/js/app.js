// ── ChronoPresence Application Logic ──────────────────────────────────────────

const API = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? (window.location.port === '5000' ? '/api/attendance' : 'http://localhost:5000/api/attendance')
  : 'https://attendance-appie.onrender.com/';

// ── State ────────────────────────────────────────────────────────────────────
let allRecords = [];
let currentCalMonth = new Date();
let currentFilter = 'all';
let searchQuery = '';
let activeModalDate = null;

// ── Theme Management ─────────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('cp_theme') || 'light';
  applyTheme(saved);
}

function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  const next = isDark ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('cp_theme', next);
}

function applyTheme(theme) {
  const icon = document.getElementById('theme-toggle-icon');
  const mobileIcon = document.getElementById('theme-toggle-icon-mobile');
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
    document.documentElement.setAttribute('data-theme', 'dark');
    if (icon) icon.textContent = 'light_mode';
    if (mobileIcon) mobileIcon.textContent = 'light_mode';
  } else {
    document.documentElement.classList.remove('dark');
    document.documentElement.setAttribute('data-theme', 'light');
    if (icon) icon.textContent = 'dark_mode';
    if (mobileIcon) mobileIcon.textContent = 'dark_mode';
  }
}

// ── Date & Time Math (Guaranteed UTC/IST Accuracy) ───────────────────────────
function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function nowTimeIST() {
  return new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isWeekend(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 || day === 6;
}

function formatDate(dateStr, format = 'medium') {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (format === 'short') {
    return dt.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  return dt.toLocaleDateString('en-IN', {
    weekday: 'short', month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC'
  });
}

// ── Status Badges (Kinetic Presence Spec) ────────────────────────────────────
function statusBadge(status, autoMarked = false) {
  const map = {
    present: {
      bg: 'bg-secondary/10',
      text: 'text-secondary',
      dot: 'bg-secondary',
      label: 'Present',
      icon: 'check_circle'
    },
    CL: {
      bg: 'bg-primary-fixed/60',
      text: 'text-primary',
      dot: 'bg-primary',
      label: 'Casual Leave',
      icon: 'flight_takeoff'
    },
    SL: {
      bg: 'bg-tertiary-fixed/60',
      text: 'text-tertiary',
      dot: 'bg-tertiary',
      label: 'Sick Leave',
      icon: 'medical_services'
    },
    LOP: {
      bg: 'bg-error-container/40',
      text: 'text-error',
      dot: 'bg-error',
      label: 'Loss of Pay',
      icon: 'money_off'
    },
    absent: {
      bg: 'bg-error-container/50',
      text: 'text-error',
      dot: 'bg-error',
      label: autoMarked ? 'Auto-Marked Absent' : 'Absent',
      icon: 'event_busy'
    },
    weekend: {
      bg: 'bg-surface-container',
      text: 'text-on-surface-variant',
      dot: 'bg-outline-variant',
      label: 'Weekend',
      icon: 'weekend'
    }
  };

  const c = map[status] || map.absent;
  return `
    <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${c.bg} ${c.text} text-xs font-semibold">
      <span class="w-1.5 h-1.5 rounded-full ${c.dot}"></span>
      <span>${c.label}</span>
    </span>
  `;
}

// ── Toast & Spinner ──────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  const bg = type === 'success' ? 'border-secondary text-secondary' : (type === 'error' ? 'border-error text-error' : 'border-primary text-primary');
  el.className = `bg-surface-container-lowest border-l-4 ${bg} shadow-lg rounded-xl px-4 py-3 text-xs font-medium text-on-surface pointer-events-auto flex items-center gap-2 transition-all transform duration-200 translate-y-2 opacity-0`;
  el.innerHTML = `
    <span class="material-symbols-outlined text-base">${type === 'success' ? 'check_circle' : (type === 'error' ? 'error' : 'info')}</span>
    <span>${msg}</span>
  `;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.remove('translate-y-2', 'opacity-0');
  }, 10);
  setTimeout(() => {
    el.classList.add('opacity-0');
    setTimeout(() => el.remove(), 250);
  }, 4000);
}

function showSpinner() { document.getElementById('spinner').style.display = 'flex'; }
function hideSpinner() { document.getElementById('spinner').style.display = 'none'; }

// ── API Fetch Client ─────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Request failed');
  return json.data;
}

// ── Master Loader ────────────────────────────────────────────────────────────
async function loadAll() {
  showSpinner();
  try {
    const [records, summary] = await Promise.all([
      apiFetch(''),
      apiFetch('/summary'),
    ]);
    allRecords = records;
    renderTodayBanner();
    renderSummary(summary);
    renderCalendar();
    renderHistoryTable();
    document.getElementById('sync-status').textContent = 'Atlas Synced';
  } catch (err) {
    document.getElementById('sync-status').textContent = 'Sync Offline';
    toast('Error syncing records: ' + err.message, 'error');
  } finally {
    hideSpinner();
  }
}

// ── Section 1: Hero Today's Status Banner ────────────────────────────────────
function renderTodayBanner() {
  const today = todayIST();
  const timeNow = nowTimeIST();
  const record = allRecords.find(r => r.date === today);

  const dateHeading = document.getElementById('today-date-heading');
  const badgeEl = document.getElementById('today-status-badge');
  const ruleText = document.getElementById('today-rule-text');
  const progressPercent = document.getElementById('today-progress-percent');
  const progressBar = document.getElementById('today-progress-bar');
  const actionsBar = document.getElementById('today-actions-bar');
  const memoInput = document.getElementById('today-memo-input');

  dateHeading.textContent = formatDate(today);
  const weekend = isWeekend(today);
  const isPastCutoff = timeNow > '10:30';

  if (record) {
    memoInput.value = record.note || '';
    const isAutoAbsent = record.status === 'absent' && record.autoMarked;

    if (record.status === 'present') {
      badgeEl.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-secondary/10 text-secondary text-xs font-semibold';
      badgeEl.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse"></span>
        <span>Checked In at ${record.checkInTime || 'Morning'}</span>
      `;
      ruleText.textContent = 'Daily attendance requirement completed';
      progressPercent.textContent = 'Present';
      progressBar.style.width = '100%';
      actionsBar.innerHTML = `
        <button onclick="openDayModal('${today}')" class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface text-xs font-semibold transition-all">
          <span class="material-symbols-outlined text-sm">visibility</span>
          <span>View / Edit Details</span>
        </button>
      `;
    } else if (isAutoAbsent) {
      badgeEl.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-error-container text-error text-xs font-semibold';
      badgeEl.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full bg-error"></span>
        <span>10:30 AM Cutoff Passed — Auto-Marked Absent</span>
      `;
      ruleText.textContent = 'Missed 10:30 AM check-in deadline. Classify below:';
      progressPercent.textContent = 'Action Required';
      progressBar.style.width = '25%';
      actionsBar.innerHTML = `
        <button onclick="quickApplyLeave('${today}', 'CL')" class="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary-container text-on-primary text-xs font-semibold hover:opacity-90 transition-all shadow-sm">
          <span class="material-symbols-outlined text-sm">flight_takeoff</span>
          <span>Apply Casual Leave (CL)</span>
        </button>
        <button onclick="quickApplyLeave('${today}', 'SL')" class="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-tertiary text-on-tertiary text-xs font-semibold hover:opacity-90 transition-all shadow-sm">
          <span class="material-symbols-outlined text-sm">medical_services</span>
          <span>Apply Sick Leave (SL)</span>
        </button>
        <button onclick="openLeaveModal('${today}')" class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface text-xs font-semibold transition-all">
          <span>More…</span>
        </button>
      `;
    } else {
      // CL, SL, or LOP
      badgeEl.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary-fixed/60 text-primary text-xs font-semibold';
      badgeEl.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full bg-primary"></span>
        <span>On Leave (${record.status})</span>
      `;
      ruleText.textContent = `Applied leave: ${record.status}`;
      progressPercent.textContent = 'On Leave';
      progressBar.style.width = '100%';
      actionsBar.innerHTML = `
        <button onclick="openDayModal('${today}')" class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface text-xs font-semibold transition-all">
          <span class="material-symbols-outlined text-sm">edit</span>
          <span>Modify Leave</span>
        </button>
      `;
    }
  } else if (weekend) {
    memoInput.value = '';
    badgeEl.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant text-xs font-semibold';
    badgeEl.innerHTML = `
      <span class="w-1.5 h-1.5 rounded-full bg-outline-variant"></span>
      <span>Weekend (Rest & Recharge)</span>
    `;
    ruleText.textContent = 'No check-in required on Saturdays & Sundays';
    progressPercent.textContent = 'Off Duty';
    progressBar.style.width = '0%';
    actionsBar.innerHTML = `<span class="text-xs text-on-surface-variant font-medium">Enjoy your weekend!</span>`;
  } else {
    // Weekday, no record yet
    memoInput.value = '';
    if (isPastCutoff) {
      badgeEl.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-error-container text-error text-xs font-semibold';
      badgeEl.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full bg-error"></span>
        <span>10:30 AM Cutoff Passed — Not Checked In</span>
      `;
      ruleText.textContent = 'Check-in is closed for today. Please classify as CL or SL:';
      progressPercent.textContent = 'Cutoff Passed';
      progressBar.style.width = '30%';
      actionsBar.innerHTML = `
        <button onclick="quickApplyLeave('${today}', 'CL')" class="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary-container text-on-primary text-xs font-semibold hover:opacity-90 transition-all shadow-sm">
          <span class="material-symbols-outlined text-sm">flight_takeoff</span>
          <span>Apply CL</span>
        </button>
        <button onclick="quickApplyLeave('${today}', 'SL')" class="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-tertiary text-on-tertiary text-xs font-semibold hover:opacity-90 transition-all shadow-sm">
          <span class="material-symbols-outlined text-sm">medical_services</span>
          <span>Apply SL</span>
        </button>
      `;
    } else {
      badgeEl.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container-low text-on-surface text-xs font-semibold';
      badgeEl.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full bg-secondary"></span>
        <span>Ready for Check-In (Before 10:30 AM)</span>
      `;
      ruleText.textContent = 'Check in before 10:30 AM to confirm presence';
      progressPercent.textContent = 'Pending Check-In';
      progressBar.style.width = '10%';
      actionsBar.innerHTML = `
        <button onclick="checkIn()" class="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-secondary text-on-secondary text-xs sm:text-sm font-semibold hover:opacity-90 transition-all shadow-md">
          <span class="material-symbols-outlined text-base">login</span>
          <span>Check In for Today</span>
        </button>
        <button onclick="openLeaveModal('${today}')" class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface text-xs font-semibold transition-all">
          <span class="material-symbols-outlined text-sm">event_busy</span>
          <span>Take Leave</span>
        </button>
      `;
    }
  }
}

// ── Section 2: Summary Stats ─────────────────────────────────────────────────
function renderSummary(s) {
  document.getElementById('stat-present').textContent = s.present ?? 0;
  document.getElementById('stat-cl').textContent = s.CL ?? 0;
  document.getElementById('stat-sl').textContent = s.SL ?? 0;
  document.getElementById('stat-lop').textContent = s.LOP ?? 0;
  document.getElementById('stat-absent').textContent = s.absent ?? 0;
}

// ── Section 3: Interactive Calendar ──────────────────────────────────────────
function renderCalendar() {
  const year = currentCalMonth.getFullYear();
  const month = currentCalMonth.getMonth();
  const today = todayIST();

  document.getElementById('cal-month-title').textContent =
    currentCalMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const recordMap = {};
  for (const r of allRecords) recordMap[r.date] = r;

  const grid = document.getElementById('cal-grid-cells');
  grid.innerHTML = '';

  for (let i = 0; i < firstDay; i++) {
    const blank = document.createElement('div');
    blank.className = 'h-10 flex flex-col items-center justify-center rounded-lg text-outline-variant/40 select-none';
    grid.appendChild(blank);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const record = recordMap[dateStr];
    const isToday = dateStr === today;
    const isFuture = dateStr > today;
    const weekend = isWeekend(dateStr);

    const cell = document.createElement('div');
    cell.className = 'h-10 flex flex-col items-center justify-center rounded-xl cursor-pointer transition-all relative text-xs font-semibold select-none';

    let dotColor = null;
    let cellBg = 'hover:bg-surface-container';

    if (isToday) {
      cellBg = 'bg-primary-container text-on-primary shadow-sm';
      dotColor = 'bg-secondary-fixed';
    } else if (isFuture) {
      cellBg = 'text-outline-variant/50 cursor-default';
    } else if (record) {
      if (record.status === 'present') {
        dotColor = 'bg-secondary';
        cellBg = 'hover:bg-secondary/15';
      } else if (record.status === 'CL') {
        dotColor = 'bg-primary';
        cellBg = 'bg-primary-fixed/30 hover:bg-primary-fixed/50 text-primary';
      } else if (record.status === 'SL') {
        dotColor = 'bg-tertiary';
        cellBg = 'bg-tertiary-fixed/30 hover:bg-tertiary-fixed/50 text-tertiary';
      } else if (record.status === 'absent' || record.status === 'LOP') {
        dotColor = 'bg-error';
        cellBg = 'bg-error-container/30 hover:bg-error-container/50 text-error';
      } else if (record.status === 'weekend') {
        cellBg = 'bg-surface-container-low text-on-surface-variant';
      }
    } else if (weekend) {
      cellBg = 'bg-surface-container-low text-on-surface-variant/80';
    } else {
      dotColor = 'bg-error';
      cellBg = 'bg-error-container/20 text-error';
    }

    cell.className += ` ${cellBg}`;
    cell.innerHTML = `<span>${day}</span>${dotColor ? `<span class="w-1.5 h-1.5 rounded-full ${dotColor} mt-0.5"></span>` : ''}`;

    if (!isFuture) {
      cell.onclick = () => openDayModal(dateStr);
    }

    grid.appendChild(cell);
  }
}

function prevMonth() {
  currentCalMonth.setMonth(currentCalMonth.getMonth() - 1);
  renderCalendar();
}

function nextMonth() {
  currentCalMonth.setMonth(currentCalMonth.getMonth() + 1);
  renderCalendar();
}

function goToCurrentMonth() {
  currentCalMonth = new Date();
  renderCalendar();
}

// ── Section 4: History Table & Filtering ─────────────────────────────────────
function setFilter(filter, el) {
  currentFilter = filter;
  const pills = document.querySelectorAll('.filter-tag');
  pills.forEach(p => {
    p.classList.remove('bg-primary-container', 'text-on-primary', 'shadow-sm');
    p.classList.add('bg-surface-container-low', 'text-on-surface-variant');
  });
  if (el) {
    el.classList.remove('bg-surface-container-low', 'text-on-surface-variant');
    el.classList.add('bg-primary-container', 'text-on-primary', 'shadow-sm');
  }
  renderHistoryTable();
}

function handleSearch(val) {
  searchQuery = val.trim().toLowerCase();
  renderHistoryTable();
}

function renderHistoryTable() {
  const tbody = document.getElementById('attendanceTableBody');
  let records = [...allRecords];

  if (currentFilter !== 'all') {
    records = records.filter(r => r.status === currentFilter);
  }

  if (searchQuery) {
    records = records.filter(r =>
      r.date.includes(searchQuery) ||
      (r.note && r.note.toLowerCase().includes(searchQuery)) ||
      r.status.toLowerCase().includes(searchQuery)
    );
  }

  if (records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="py-8 text-center text-on-surface-variant text-xs">
          No records matching the filter criteria.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = records.map(r => `
    <tr class="hover:bg-surface-container-low/40 transition-colors">
      <td class="py-3 whitespace-nowrap">
        <div class="flex flex-col">
          <span class="font-semibold text-xs text-on-surface">${formatDate(r.date, 'short')}</span>
          <span class="text-[10px] text-on-surface-variant">${r.date}</span>
        </div>
      </td>
      <td class="py-3 whitespace-nowrap">
        ${statusBadge(r.status, r.autoMarked)}
      </td>
      <td class="py-3 whitespace-nowrap font-mono text-xs text-on-surface">
        ${r.checkInTime ? `<span class="text-secondary font-medium">${r.checkInTime} IST</span>` : '<span class="text-on-surface-variant">—</span>'}
      </td>
      <td class="py-3 max-w-xs">
        <p class="truncate text-on-surface-variant text-xs" title="${escHtml(r.note || 'No memo logged')}">
          ${escHtml(r.note || '—')}
        </p>
      </td>
      <td class="py-3 text-right whitespace-nowrap">
        <button onclick="openDayModal('${r.date}')" class="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors" title="Edit Memo / Change Status">
          <span class="material-symbols-outlined text-sm">edit</span>
        </button>
      </td>
    </tr>
  `).join('');
}

// ── Actions ──────────────────────────────────────────────────────────────────
async function checkIn() {
  try {
    showSpinner();
    const memo = document.getElementById('today-memo-input').value.trim();
    await apiFetch('/checkin', {
      method: 'POST',
      body: JSON.stringify({ note: memo }),
    });
    toast('Check-in confirmed for today!', 'success');
    await loadAll();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    hideSpinner();
  }
}

async function quickApplyLeave(dateStr, type) {
  try {
    showSpinner();
    await apiFetch('/leave', {
      method: 'POST',
      body: JSON.stringify({ date: dateStr, leaveType: type }),
    });
    toast(`Classified ${dateStr} as ${type}`, 'success');
    await loadAll();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    hideSpinner();
  }
}

async function saveTodayMemo() {
  const today = todayIST();
  const memo = document.getElementById('today-memo-input').value.trim();
  const btn = document.getElementById('save-memo-btn');
  const existing = allRecords.find(r => r.date === today);

  try {
    if (existing) {
      await apiFetch(`/${today}/note`, {
        method: 'PATCH',
        body: JSON.stringify({ note: memo }),
      });
    } else {
      await apiFetch('/leave', {
        method: 'POST',
        body: JSON.stringify({ date: today, leaveType: 'CL', note: memo }),
      });
    }

    const orig = btn.innerHTML;
    btn.innerHTML = '<span class="material-symbols-outlined text-sm text-secondary">check</span><span>Saved</span>';
    setTimeout(() => { btn.innerHTML = orig; }, 1800);
    toast('Daily log memo updated.', 'success');
    await loadAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ── Modals: Apply Leave ──────────────────────────────────────────────────────
function openLeaveModal(defaultDate = null) {
  const dateInput = document.getElementById('leaveDateInput');
  dateInput.value = defaultDate || todayIST();
  document.getElementById('leaveModalBackdrop').classList.remove('hidden');
}

function closeLeaveModal() {
  document.getElementById('leaveModalBackdrop').classList.add('hidden');
}

async function submitLeaveApplication() {
  const radios = document.getElementsByName('leaveCategory');
  let type = 'CL';
  for (const r of radios) {
    if (r.checked) type = r.value;
  }
  const date = document.getElementById('leaveDateInput').value;
  const reason = document.getElementById('leaveReasonInput').value.trim();

  try {
    showSpinner();
    await apiFetch('/leave', {
      method: 'POST',
      body: JSON.stringify({ date, leaveType: type, note: reason }),
    });
    closeLeaveModal();
    toast(`Leave applied: ${type} for ${date}`, 'success');
    await loadAll();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    hideSpinner();
  }
}

// ── Modals: Day Record Detail & Status Override ──────────────────────────────
function openDayModal(dateStr) {
  activeModalDate = dateStr;
  const record = allRecords.find(r => r.date === dateStr);

  document.getElementById('modalDayDate').textContent = formatDate(dateStr);
  const badgeContainer = document.getElementById('modalDayBadge');
  const noteInput = document.getElementById('modalDayNote');
  const statusSelect = document.getElementById('modalDayStatusSelect');

  if (record) {
    badgeContainer.innerHTML = statusBadge(record.status, record.autoMarked);
    noteInput.value = record.note || '';
    statusSelect.value = record.status;
  } else {
    badgeContainer.innerHTML = '<span class="text-xs text-on-surface-variant font-medium">No record saved</span>';
    noteInput.value = '';
    statusSelect.value = 'present';
  }

  document.getElementById('dayModalBackdrop').classList.remove('hidden');
}

function closeDayModal() {
  document.getElementById('dayModalBackdrop').classList.add('hidden');
  activeModalDate = null;
}

async function saveModalDayNote() {
  if (!activeModalDate) return;
  const note = document.getElementById('modalDayNote').value.trim();
  try {
    showSpinner();
    await apiFetch(`/${activeModalDate}/note`, {
      method: 'PATCH',
      body: JSON.stringify({ note }),
    });
    toast('Note updated.', 'success');
    closeDayModal();
    await loadAll();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    hideSpinner();
  }
}

async function saveModalDayStatus() {
  if (!activeModalDate) return;
  const status = document.getElementById('modalDayStatusSelect').value;
  try {
    showSpinner();
    await apiFetch(`/${activeModalDate}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    toast(`Status updated to ${status}`, 'success');
    closeDayModal();
    await loadAll();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    hideSpinner();
  }
}

// ── Export to CSV ────────────────────────────────────────────────────────────
function exportToCsv() {
  if (allRecords.length === 0) {
    toast('No records to export.', 'error');
    return;
  }
  const headers = ['Date', 'Status', 'CheckInTime', 'Note', 'AutoMarked'];
  const rows = allRecords.map(r => [
    r.date,
    r.status,
    r.checkInTime || '',
    `"${(r.note || '').replace(/"/g, '""')}"`,
    r.autoMarked ? 'Yes' : 'No'
  ]);
  const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `attendance_log_${todayIST()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV exported successfully!', 'success');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Startup ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadAll();
  setInterval(renderTodayBanner, 60000);
});
