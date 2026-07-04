// backend/services/mqttService.js

require("dotenv").config();

const mqtt = require("mqtt");

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

client.on("message", (topic, message) => {

  try {

    console.log("RAW MQTT:", message.toString());

    const data = JSON.parse(message.toString());

    console.log("PARSED:", data);

    // STORE DATA

    latestMeterData[data.MeterId] = data;

    console.log("STORE:", latestMeterData);

  } catch (err) {

    console.log("MQTT Parse Error:", err);

  }

});

module.exports = client;