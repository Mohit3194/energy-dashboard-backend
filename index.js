require("dotenv").config();

const express = require("express");
const cors = require("cors");

const latestMeterData = require("./dataStore");

// START MQTT SERVICE
require("./services/mqttService");

const reportsRouter = require("./routes/reports");
const { startScheduledReportsCron } = require("./cron/scheduledReports");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Backend Running");
});

app.get("/api/meters", (req, res) => {
  console.log("API HIT");
  res.json(latestMeterData);
});

// Register routes BEFORE app.listen()
app.use("/api", reportsRouter);
const reportsCronRouter = require("./routes/reportsCron");
app.use("/api", reportsCronRouter);

// Start cron
startScheduledReportsCron();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
//added extra
app.get("/api/influx-test", async (req, res) => {
  try {
    const { queryApi, bucket } = require("./services/influxClient");

    const flux = `
      from(bucket: "${bucket}")
        |> range(start: -1d)
        |> filter(fn: (r) => r._measurement == "energy_meter")
        |> limit(n: 10)
    `;

    console.log("========================================");
    console.log("INFLUX TEST");
    console.log(flux);
    console.log("========================================");

    const rows = [];

    for await (const { values, tableMeta } of queryApi.iterateRows(flux)) {
      const row = tableMeta.toObject(values);

      console.log("TEST ROW:", row);

      rows.push({
        time: row._time,
        measurement: row._measurement,
        field: row._field,
        value: row._value,
        meter_id: row.meter_id,
      });
    }

    res.json({
      success: true,
      bucket,
      count: rows.length,
      rows,
    });

  } catch (error) {
    console.error("INFLUX TEST ERROR:", error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});