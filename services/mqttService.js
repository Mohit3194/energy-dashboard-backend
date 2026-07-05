// backend/services/mqttService.js

require("dotenv").config();

const mqtt = require("mqtt");
const { Point } = require("@influxdata/influxdb-client");
const { writeApi } = require("./influxClient");

// ADD THIS LINE
const latestMeterData = require("../dataStore");

// CONNECT MQTT

const client = mqtt.connect(
  process.env.MQTT_URL,
  {
    username: process.env.MQTT_USER,
    password: process.env.MQTT_PASSWORD,
  }
);

client.on("connect", () => {

  console.log("Connected to MQTT");

  client.subscribe("energy/+/data", (err) => {

    if (err) {

      console.log("Subscribe Error:", err);

    } else {

      console.log("Subscribed to energy/+/data");

    }

  });

});

client.on("message", async (topic, message) => {
  try {
    console.log("RAW MQTT:", message.toString());

    const data = JSON.parse(message.toString());

    console.log("PARSED:", data);

    // Store latest values for dashboard
    latestMeterData[data.MeterId] = data;

    console.log("STORE:", latestMeterData);

    // Write to InfluxDB
    const point = new Point("energy_meter")
      .tag("meter_id", String(data.MeterId))
      .floatField("energy", Number(data.Energy))
      .floatField("power", Number(data.Power))
      .floatField("peakPower", Number(data.PeakPower))
      .floatField("voltage", Number(data.Voltage))
      .floatField("current", Number(data.Current))
      .floatField("frequency", Number(data.Frequency))
      .timestamp(new Date(data.Timestamp));

    writeApi.writePoint(point);
    await writeApi.flush();

    console.log(`InfluxDB write successful for Meter ${data.MeterId}`);
  } catch (err) {
    console.error("MQTT / Influx Error:", err);
  }
});

module.exports = client;