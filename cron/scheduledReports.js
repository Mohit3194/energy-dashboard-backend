const cron = require("node-cron");
const { getActiveSchedules, markSent } = require("../services/scheduleStore");
const { buildReportRows, buildPdfBuffer, buildExcelBuffer } = require("../services/reportGenerator");
const { sendReportEmail, sendReportSms } = require("../services/notify");

function isDue(schedule, now) {
  const last = schedule.lastSentAt;
  if (!last) return true;

  const hoursSince = (now - last) / (1000 * 60 * 60);
  if (schedule.frequency === "daily") return hoursSince >= 24;
  if (schedule.frequency === "weekly") return hoursSince >= 24 * 7;
  if (schedule.frequency === "monthly") return hoursSince >= 24 * 28;
  return false;
}

function rangeForFrequency(frequency, now) {
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now);
  if (frequency === "daily") from.setDate(from.getDate() - 1);
  if (frequency === "weekly") from.setDate(from.getDate() - 7);
  if (frequency === "monthly") from.setDate(from.getDate() - 28);
  return { from: from.toISOString().slice(0, 10), to };
}

async function runDueSchedules() {
  const now = new Date();
  const schedules = await getActiveSchedules();

  for (const schedule of schedules) {
    if (!isDue(schedule, now)) continue;

    try {
      const { from, to } = rangeForFrequency(schedule.frequency, now);
      const meters = schedule.filters?.meters?.length ? schedule.filters.meters : [1, 2, 3, 4, 5];

      const rows = await buildReportRows({ from, to, meters });
      const [pdfBuffer, excelBuffer] = await Promise.all([
        buildPdfBuffer(rows, { from, to }),
        Promise.resolve(buildExcelBuffer(rows)),
      ]);

      await sendReportEmail({ to: schedule.email, from, toDate: to, pdfBuffer, excelBuffer });
      await sendReportSms({ to: schedule.phone, from, toDate: to });

      await markSent(schedule.email, now.toISOString());
      console.log(`Sent scheduled report to ${schedule.email} (${schedule.frequency})`);
    } catch (err) {
      console.error(`Failed to send scheduled report to ${schedule.email}:`, err);
    }
  }
}

/*
  Runs once every hour. isDue() decides whether each individual schedule
  is actually due, so this stays lightweight even with an hourly tick.
  Works fine on a persistent Render web service (not Vercel serverless).
*/
function startScheduledReportsCron() {
  cron.schedule("0 * * * *", () => {
    runDueSchedules().catch((err) => console.error("Scheduled reports cron failed:", err));
  });
  console.log("Scheduled reports cron started (runs hourly, checks due schedules).");
}

module.exports = { startScheduledReportsCron, runDueSchedules };
