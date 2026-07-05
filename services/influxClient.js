const { InfluxDB } = require("@influxdata/influxdb-client");

/*
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
