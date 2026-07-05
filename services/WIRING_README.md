# Wiring these into your existing backend

Install the new dependencies:

```
npm install node-cron nodemailer axios pdfkit xlsx @influxdata/influxdb-client
```

(You already have `@influxdata/influxdb-client` if InfluxDB is writing meter
data today — skip what you have.)

## 1. Environment variables (`.env`)

```
# InfluxDB — point at the same instance/bucket your meter writes already use
INFLUX_URL=http://localhost:8086
INFLUX_TOKEN=your-api-token
INFLUX_ORG=your-org
INFLUX_BUCKET=your-bucket

# Nodemailer (Gmail, matching your existing alert setup)
# GMAIL_PASS must be a Gmail App Password, not your login password:
# https://myaccount.google.com/apppasswords
GMAIL_USER=mohitengineer2016@gmail.com
GMAIL_PASS=your-16-char-app-password

# Comma-separated list of who gets high-power alert emails
ALERT_RECIPIENTS=mohit.temflo@gmail.com,srivastavashreya0401@gmail.com

# Fast2SMS (optional — only needed if you want the SMS ping)
FAST2SMS_API_KEY=your-fast2sms-api-key
```

## 2. Match the Flux query to your real schema

Open `services/reportGenerator.js` and check these constants against how
your existing meter-polling job actually writes to Influx:

```js
const MEASUREMENT = "meter_readings"; // your measurement name
const TAG_METER_ID = "meterId";       // your tag key for the meter
const FIELD_ENERGY = "kwh";           // your energy field name
const FIELD_POWER = "power";          // your instantaneous power field name
const FIELD_COST = null;              // set a field name here IF you store cost directly
```

If any of these don't match your actual write code, the Flux queries will
just return empty results — not an error, just nothing. Worth checking
against your write code (or the Influx UI's Data Explorer) before assuming
something else is broken.

## 3. In your main server file (e.g. `index.js` / `server.js`)

```js
const reportsRouter = require("./routes/reports");
const { startScheduledReportsCron } = require("./cron/scheduledReports");

app.use("/api", reportsRouter);

startScheduledReportsCron();
```

## 4. Replace your old standalone alert file

Wherever you currently `require("./sendEmailAlert")` and call
`sendEmailAlert(meterName, power)`, swap it for:

```js
const { sendPowerAlertEmail } = require("./services/notify");
await sendPowerAlertEmail(meterName, power);
```

Same behavior, just using the shared transporter/env config above instead
of a hardcoded user/pass/recipient list. You can delete the old file once
this is wired in.

## Note on report schedules

Schedules (email, frequency, filters) are stored in Influx too, using a
"last point wins" pattern — saving writes a new point tagged by email,
and reads always take the latest point per email. See the comment at the
top of `services/scheduleStore.js` for why, and the tradeoff (fine for
occasional writes, not a fit for fast-changing data).

That's everything wired end to end: custom-range aggregation reads your
existing Influx data directly (no separate history-logging step needed
since Influx already has it), PDF/Excel generation, emailing, optional
SMS, and the hourly due-schedule check.
