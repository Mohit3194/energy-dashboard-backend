const express = require("express");
const router = express.Router();

const { runDueSchedules } = require("../services/scheduledReportRunner");

/*
  POST /api/reports/run-scheduled
  --------------------------------
  Triggers a check of all scheduled reports and sends whichever are due.
  Designed to be called by an external scheduler (cron-job.org, GitHub
  Actions scheduled workflow, EasyCron, etc.) instead of a platform-native
  cron job — call this once a day and it figures out who's actually due.

  Auth: requires header  x-cron-secret: <CRON_SECRET>
  Set CRON_SECRET in your backend's env vars, and configure your external
  scheduler to send that same value as a header on its request.
*/
router.post("/reports/run-scheduled", async (req, res) => {
  const provided = req.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    console.error("CRON_SECRET is not set — refusing to run until it's configured.");
    return res.status(500).json({ error: "CRON_SECRET not configured on the server" });
  }
  if (!provided || provided !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const summary = await runDueSchedules();
    console.log("Scheduled report run complete:", summary);
    res.json(summary);
  } catch (err) {
    console.error("run-scheduled failed:", err);
    res.status(500).json({ error: "Failed to run scheduled reports" });
  }
});

module.exports = router;
