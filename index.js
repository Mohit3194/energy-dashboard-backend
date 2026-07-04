require("dotenv").config();

const express = require("express");
const cors = require("cors");

const latestMeterData = require("./dataStore");

// START MQTT SERVICE
require("./services/mqttService");

const app = express();

app.use(cors());

app.get("/", (req, res) => {

  res.send("Backend Running");

});

app.get("/api/meters", (req, res) => {

  console.log("API HIT");

  console.log(latestMeterData);

  res.json(latestMeterData);

});

const PORT = 5000;

app.listen(PORT, () => {

  console.log(`Server running on port ${PORT}`);

});