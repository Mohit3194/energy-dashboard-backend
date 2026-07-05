const { Point } = require("@influxdata/influxdb-client");
const { queryApi, writeApi, bucket } = require("./influxClient");

/*
  InfluxDB isn't built for mutable config records, but since you'd rather
  not run a second database just for this, we use a standard workaround:
  "last point wins". Saving/updating a schedule writes a NEW point tagged
  by email; reading schedules always takes the MOST RECENT point per email
  (Flux's `last()`). Canceling a schedule just writes a new point with
  active=false rather than deleting anything.

  This is fine for something that changes rarely (a handful of writes per
  user, ever) — it would be a bad fit for data that updates constantly.
*/
const MEASUREMENT = "report_schedules";

async function saveSchedule({ email, phone, frequency, filters }) {
  const point = new Point(MEASUREMENT)
    .tag("email", email)
    .booleanField("active", true)
    .stringField("frequency", frequency)
    .stringField("phone", phone || "")
    .stringField("meters", (filters?.meters || []).join(","))
    .stringField("metrics", (filters?.metrics || []).join(","))
    .stringField("lastSentAt", ""); // empty until the cron actually sends one

  writeApi.writePoint(point);
  await writeApi.flush();
  return { email, phone, frequency, filters, active: true };
}

async function cancelSchedule(email) {
  const point = new Point(MEASUREMENT).tag("email", email).booleanField("active", false);
  writeApi.writePoint(point);
  await writeApi.flush();
}

async function markSent(email, sentAtISO) {
  // Re-fetch current config first so we don't lose frequency/filters when writing the new "state"
  const current = await getSchedule(email);
  if (!current) return;

  const point = new Point(MEASUREMENT)
    .tag("email", email)
    .booleanField("active", current.active)
    .stringField("frequency", current.frequency)
    .stringField("phone", current.phone || "")
    .stringField("meters", (current.filters?.meters || []).join(","))
    .stringField("metrics", (current.filters?.metrics || []).join(","))
    .stringField("lastSentAt", sentAtISO);

  writeApi.writePoint(point);
  await writeApi.flush();
}

function rowToSchedule(row) {
  return {
    email: row.email,
    phone: row.phone || "",
    frequency: row.frequency,
    active: row.active,
    lastSentAt: row.lastSentAt ? new Date(row.lastSentAt) : null,
    filters: {
      meters: row.meters ? row.meters.split(",").map(Number).filter(Boolean) : [],
      metrics: row.metrics ? row.metrics.split(",").filter(Boolean) : [],
    },
  };
}

async function getSchedule(email) {
  const flux = `
    from(bucket: "${bucket}")
      |> range(start: -5y)
      |> filter(fn: (r) => r._measurement == "${MEASUREMENT}")
      |> filter(fn: (r) => r.email == "${email}")
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> sort(columns: ["_time"], desc: true)
      |> limit(n: 1)
  `;
  const rows = await queryApi.collectRows(flux);
  return rows.length ? rowToSchedule(rows[0]) : null;
}

/** All schedules currently marked active, one row per email (latest state only). */
async function getActiveSchedules() {
  const flux = `
    from(bucket: "${bucket}")
      |> range(start: -5y)
      |> filter(fn: (r) => r._measurement == "${MEASUREMENT}")
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> group(columns: ["email"])
      |> sort(columns: ["_time"], desc: true)
      |> limit(n: 1)
  `;
  const rows = await queryApi.collectRows(flux);
  return rows.map(rowToSchedule).filter((s) => s.active);
}

module.exports = { saveSchedule, cancelSchedule, markSent, getSchedule, getActiveSchedules };
