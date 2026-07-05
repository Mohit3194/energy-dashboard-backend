const express = require("express");
const router = express.Router();

const { buildReportRows } = require("../services/reportGenerator");
const { saveSchedule, cancelSchedule } = require("../services/scheduleStore");

/*
  GET /api/reports?from=2026-06-28&to=2026-07-05&meters=1,2,3&metrics=kwh,cost
  Matches what ReportsPage.jsx (frontend) already calls.
*/
router.get("/reports", async (req, res) => {
  try {
    const { from, to, meters } = req.query;
    if (!from || !to || !meters) {
      return res.status(400).json({ error: "from, to, and meters are required query params" });
    }

    const meterIds = meters.split(",").map(Number);
    const rows = await buildReportRows({ from, to, meters: meterIds });

    res.json({ series: rows.map((r) => ({ meterId: r.id, ...r })) });
  } catch (err) {
    console.error("GET /api/reports failed:", err);
    res.status(500).json({ error: "Failed to build report" });
  }
});

/*
  POST /api/reports/schedule
  body: { email, phone?, frequency: "daily"|"weekly"|"monthly", filters: { meters, metrics } }
*/
router.post("/reports/schedule", async (req, res) => {
  try {
    const { email, phone, frequency, filters } = req.body;
    if (!email || !frequency) {
      return res.status(400).json({ error: "email and frequency are required" });
    }

    const schedule = await saveSchedule({ email, phone, frequency, filters });
    res.json({ ok: true, schedule });
  } catch (err) {
    console.error("POST /api/reports/schedule failed:", err);
    res.status(500).json({ error: "Failed to save schedule" });
  }
});

// DELETE /api/reports/schedule/:email  — lets a user cancel their schedule
router.delete("/reports/schedule/:email", async (req, res) => {
  try {
    await cancelSchedule(req.params.email);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/reports/schedule failed:", err);
    res.status(500).json({ error: "Failed to cancel schedule" });
  }
});

module.exports = router;
