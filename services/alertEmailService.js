const nodemailer = require("nodemailer");

/*
  Sends a high-power alert email.

  Required env vars (same Gmail App Password setup as the scheduled reports):
    GMAIL_USER
    GMAIL_APP_PASSWORD

  Optional:
    ALERT_RECIPIENTS - comma-separated list, e.g. "a@x.com,b@y.com"
                        falls back to the hardcoded list below if unset.
*/

const DEFAULT_RECIPIENTS = ["mohit.temflo@gmail.com", "srivastavashreya0401@gmail.com"];

let transporter;
function getTransporter() {
  if (transporter) return transporter;

  const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    throw new Error("Missing GMAIL_USER or GMAIL_APP_PASSWORD env vars.");
  }

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
  return transporter;
}

// Avoid spamming the same meter repeatedly while it stays above threshold.
const ALERT_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
const lastAlertSentAt = new Map(); // meterName -> timestamp

function isOnCooldown(meterName) {
  const last = lastAlertSentAt.get(meterName);
  return last && Date.now() - last < ALERT_COOLDOWN_MS;
}

async function sendEmailAlert(meterName, power) {
  if (isOnCooldown(meterName)) {
    console.log(`Skipping alert for ${meterName} — sent one within the last ${ALERT_COOLDOWN_MS / 60000} min.`);
    return;
  }

  const recipients = process.env.ALERT_RECIPIENTS
    ? process.env.ALERT_RECIPIENTS.split(",").map((s) => s.trim())
    : DEFAULT_RECIPIENTS;

  try {
    const tx = getTransporter();
    await tx.sendMail({
      from: `"Energy EMS Alerts" <${process.env.GMAIL_USER}>`,
      to: recipients,
      subject: "⚠️ Energy Alert",
      text:
        `High Power Alert\n\n` +
        `Meter: ${meterName}\n` +
        `Power: ${power} kW\n` +
        `Time: ${new Date().toLocaleString()}`,
    });

    lastAlertSentAt.set(meterName, Date.now());
    console.log(`Alert email sent for ${meterName} (${power} kW).`);
  } catch (err) {
    // Don't let a failed email crash whatever's monitoring the meters.
    console.error(`Failed to send alert email for ${meterName}:`, err.message);
  }
}

module.exports = sendEmailAlert;
