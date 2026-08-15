/*
  services/scheduledReportRunner.js
  ----------------------------------
  The actual "check what's due, build it, email it, mark it sent" logic,
  independent of how it gets triggered (HTTP route, manual script, etc).
*/

const { getActiveSchedules, markSent } = require("./scheduleStore");
const { buildReportRows, buildPdfBuffer } = require("./reportGenerator");
const { sendReportEmail } = require("./emailService");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const FREQUENCY_INTERVAL_DAYS = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function isDue(schedule) {
  const intervalDays = FREQUENCY_INTERVAL_DAYS[schedule.frequency];
  if (!intervalDays) return false;
  if (!schedule.lastSentAt) return true;

  const daysSinceLastSend = (Date.now() - schedule.lastSentAt.getTime()) / MS_PER_DAY;
  return daysSinceLastSend >= intervalDays;
}

function dateRangeFor(frequency) {
  const intervalDays = FREQUENCY_INTERVAL_DAYS[frequency] ?? 7;
  return { from: todayISO(-intervalDays), to: todayISO() };
}

async function processSchedule(schedule) {
  const { email, filters } = schedule;
  const range = dateRangeFor(schedule.frequency);

  if (!filters?.meters?.length) {
    return { email, status: "skipped", reason: "no meters selected" };
  }

  const rows = await buildReportRows({ from: range.from, to: range.to, meters: filters.meters });
  const pdfBuffer = await buildPdfBuffer(rows, range);

  await sendReportEmail(email, range, pdfBuffer);
  await markSent(email, new Date().toISOString());

  return { email, status: "sent", range };
}

/**
 * Checks all active schedules, sends whichever are due, marks them sent.
 * Returns a JSON-safe summary — never throws for individual schedule failures.
 */
async function runDueSchedules() {
  const schedules = await getActiveSchedules();
  const due = schedules.filter(isDue);

  const settled = await Promise.allSettled(due.map(processSchedule));

  const results = settled.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { email: due[i].email, status: "failed", error: String(r.reason?.message || r.reason) }
  );

  return {
    checkedAt: new Date().toISOString(),
    totalActive: schedules.length,
    totalDue: due.length,
    sent: results.filter((r) => r.status === "sent").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };
}

module.exports = { runDueSchedules };
