const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');

// ─── Helpers ────────────────────────────────────────────────────────────────

// Return today's date string in IST as YYYY-MM-DD
function todayIST() {
  return new Date()
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// Return current time in IST as HH:MM
function nowTimeIST() {
  return new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Check if a YYYY-MM-DD date string falls on a weekend (Sat/Sun)
function isWeekend(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun, 6=Sat
  return day === 0 || day === 6;
}

// Generate every date string (YYYY-MM-DD) from startDate to endDate inclusive
function dateRange(startStr, endStr) {
  const dates = [];
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  const cur = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Auto-mark rule: for every past weekday with no record, insert an 'absent' entry.
 * "Past" means: all weekdays before today in IST.
 * Called lazily on every GET so missed days are always filled in.
 */
async function backfillMissedDays() {
  const today = todayIST();
  const timeNow = nowTimeIST();

  const earliest = await Attendance.findOne().sort({ date: 1 });
  const startDate = earliest ? (earliest.date < today ? earliest.date : today) : today;

  const allDates = dateRange(startDate, today);
  const existingDocs = await Attendance.find({
    date: { $in: allDates },
  }).select('date');
  const existingSet = new Set(existingDocs.map((d) => d.date));

  const toInsert = [];
  for (const d of allDates) {
    if (existingSet.has(d)) continue;
    if (d < today) {
      if (isWeekend(d)) {
        toInsert.push({ date: d, status: 'weekend', autoMarked: true });
      } else {
        toInsert.push({ date: d, status: 'absent', autoMarked: true });
      }
    } else if (d === today) {
      // If weekday and past 10:30 AM with no checkin, auto-mark as absent/leave
      if (!isWeekend(today) && timeNow > '10:30') {
        toInsert.push({
          date: today,
          status: 'absent',
          autoMarked: true,
          note: 'Auto-marked: missed 10:30 AM check-in cutoff',
        });
      }
    }
  }

  if (toInsert.length > 0) {
    await Attendance.insertMany(toInsert, { ordered: false }).catch(() => {});
  }
}

// ─── Routes ─────────────────────────────────────────────────────────────────

/**
 * GET /api/attendance
 * Returns all records sorted newest first.
 * Also runs backfill before responding.
 */
router.get('/', async (req, res) => {
  try {
    await backfillMissedDays();
    const records = await Attendance.find().sort({ date: -1 });
    res.json({ success: true, data: records });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/attendance/summary
 * Returns leave balance counts.
 */
router.get('/summary', async (req, res) => {
  try {
    await backfillMissedDays();
    const all = await Attendance.find();
    const summary = { present: 0, CL: 0, SL: 0, LOP: 0, absent: 0, weekend: 0 };
    for (const r of all) {
      if (summary[r.status] !== undefined) summary[r.status]++;
    }
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/attendance/:date
 * Returns one record by date (YYYY-MM-DD).
 */
router.get('/:date', async (req, res) => {
  try {
    const record = await Attendance.findOne({ date: req.params.date });
    if (!record) return res.json({ success: true, data: null });
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/attendance/checkin
 * Records today's check-in.
 * Rules enforced here:
 *  - Only one check-in per day.
 *  - Check-in is only allowed on weekdays.
 *  - After 10:30 IST the status is still recorded as present (user chose to check in).
 *    The auto-absent rule only applies to days that PASSED with no check-in at all.
 */
router.post('/checkin', async (req, res) => {
  try {
    const today = todayIST();
    const timeNow = nowTimeIST();

    if (isWeekend(today)) {
      return res.status(400).json({
        success: false,
        message: 'Today is a weekend. No check-in needed.',
      });
    }

    if (timeNow > '10:30') {
      return res.status(400).json({
        success: false,
        message: 'Check-in deadline (10:30 AM) has passed. Please mark the day as CL or SL.',
      });
    }

    const existing = await Attendance.findOne({ date: today });
    if (existing && existing.status === 'present') {
      return res.status(409).json({
        success: false,
        message: 'You have already checked in today.',
      });
    }
    if (existing && ['CL', 'SL', 'LOP'].includes(existing.status)) {
      return res.status(409).json({
        success: false,
        message: `Today is already marked as ${existing.status}. Cannot check in.`,
      });
    }

    const { note = '' } = req.body;

    let record;
    if (existing) {
      // Was auto-marked absent, override with actual check-in
      existing.status = 'present';
      existing.checkInTime = timeNow;
      existing.note = note;
      existing.autoMarked = false;
      record = await existing.save();
    } else {
      record = await Attendance.create({
        date: today,
        status: 'present',
        checkInTime: timeNow,
        note,
      });
    }

    res.status(201).json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/attendance/leave
 * Marks today (or a specified date) as CL, SL, or LOP.
 * Body: { date?: 'YYYY-MM-DD', leaveType: 'CL'|'SL'|'LOP', note?: string }
 */
router.post('/leave', async (req, res) => {
  try {
    const { leaveType, note = '' } = req.body;
    const date = req.body.date || todayIST();

    if (!['CL', 'SL', 'LOP'].includes(leaveType)) {
      return res.status(400).json({
        success: false,
        message: 'leaveType must be CL, SL, or LOP.',
      });
    }

    if (isWeekend(date)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot apply leave on a weekend.',
      });
    }

    const existing = await Attendance.findOne({ date });

    if (existing && existing.status === 'present') {
      return res.status(409).json({
        success: false,
        message: 'You already checked in on this day.',
      });
    }

    let record;
    if (existing) {
      existing.status = leaveType;
      existing.note = note || existing.note;
      existing.autoMarked = false;
      record = await existing.save();
    } else {
      record = await Attendance.create({ date, status: leaveType, note });
    }

    res.status(201).json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PATCH /api/attendance/:date/note
 * Update the note on any existing record.
 */
router.patch('/:date/note', async (req, res) => {
  try {
    const { note } = req.body;
    if (typeof note !== 'string') {
      return res.status(400).json({ success: false, message: 'note must be a string.' });
    }
    const record = await Attendance.findOneAndUpdate(
      { date: req.params.date },
      { note },
      { new: true }
    );
    if (!record) return res.status(404).json({ success: false, message: 'Record not found.' });
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PATCH /api/attendance/:date/status
 * Manually override the status of any past record.
 * Body: { status: 'CL'|'SL'|'LOP'|'absent'|'present' }
 */
router.patch('/:date/status', async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['present', 'CL', 'SL', 'LOP', 'absent'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `status must be one of: ${allowed.join(', ')}` });
    }
    const record = await Attendance.findOneAndUpdate(
      { date: req.params.date },
      { status, autoMarked: false },
      { new: true }
    );
    if (!record) return res.status(404).json({ success: false, message: 'Record not found.' });
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

