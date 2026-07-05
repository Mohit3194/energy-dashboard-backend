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

// Start cron
startScheduledReportsCron();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});