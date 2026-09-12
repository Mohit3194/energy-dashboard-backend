'const { InfluxDB } = require("@influxdata/influxdb-client");

```js/*
  Env vars needed (add to .env):
    INFLUX_URL=http://localhost:8086      // or your Influx Cloud URL
    INFLUX_TOKEN=your-api-token
    INFLUX_ORG=your-org
    INFLUX_BUCKET=your-bucket             // the bucket your meter writes already go into
*/
const client = new InfluxDB({
  url: process.env.INFLUX_URL,
  token: process.env.INFLUX_TOKEN,
});

const queryApi = client.getQueryApi(process.env.INFLUX_ORG);
const writeApi = client.getWriteApi(process.env.INFLUX_ORG, process.env.INFLUX_BUCKET, "s");

module.exports = { queryApi, writeApi, bucket: process.env.INFLUX_BUCKET };
```

require("dotenv").config();

const { InfluxDB } = require("@influxdata/influxdb-client");

const INFLUX_URL = process.env.INFLUX_URL;
const INFLUX_TOKEN = process.env.INFLUX_TOKEN;
const INFLUX_ORG = process.env.INFLUX_ORG;
const INFLUX_BUCKET = process.env.INFLUX_BUCKET;

console.log("========================================");
console.log("INFLUXDB CONFIG");
console.log("========================================");
console.log("INFLUX_URL:", INFLUX_URL);
console.log("INFLUX_ORG:", INFLUX_ORG);
console.log("INFLUX_BUCKET:", INFLUX_BUCKET);
console.log(
  "INFLUX_TOKEN:",
  INFLUX_TOKEN ? "SET" : "MISSING"
);
console.log("========================================");

if (!INFLUX_URL) {
  throw new Error("INFLUX_URL is missing");
}

if (!INFLUX_TOKEN) {
  throw new Error("INFLUX_TOKEN is missing");
}

if (!INFLUX_ORG) {
  throw new Error("INFLUX_ORG is missing");
}

if (!INFLUX_BUCKET) {
  throw new Error("INFLUX_BUCKET is missing");
}

const client = new InfluxDB({
  url: INFLUX_URL,
  token: INFLUX_TOKEN,
});

const queryApi = client.getQueryApi(INFLUX_ORG);

const writeApi = client.getWriteApi(
  INFLUX_ORG,
  INFLUX_BUCKET,
  "s"
);

module.exports = {
  queryApi,
  writeApi,
  bucket: INFLUX_BUCKET,
};

