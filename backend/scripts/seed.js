require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const dns = require('dns');
try { dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']); } catch (e) {}

const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');

const sampleData = [
  { date: '2026-10-27', status: 'present', checkInTime: '09:42', note: 'Sprint planning and architecture review' },
  { date: '2026-10-28', status: 'present', checkInTime: '09:55', note: 'Created API routes and models' },
  { date: '2026-10-29', status: 'CL', note: 'Casual leave - family function' },
  { date: '2026-10-30', status: 'present', checkInTime: '10:05', note: 'Tested components and closed tickets' },
  { date: '2026-10-31', status: 'weekend' },
  { date: '2026-11-01', status: 'weekend' },
  { date: '2026-11-02', status: 'absent', autoMarked: true, note: 'Auto-marked: missed 10:30 AM check-in cutoff' },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB Atlas');

  for (const item of sampleData) {
    await Attendance.findOneAndUpdate(
      { date: item.date },
      { $set: item },
      { upsert: true, new: true }
    );
  }

  console.log(`Successfully seeded ${sampleData.length} sample records.`);
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(err => {
  console.error('Seeding error:', err.message);
  process.exit(1);
});
