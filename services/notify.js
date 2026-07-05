const nodemailer = require("nodemailer");
const axios = require("axios");

/*
  --- Email (Nodemailer) ---
  Using the "gmail" service shorthand to match your existing alert setup.

  IMPORTANT: GMAIL_PASS must be a Gmail App Password, not your normal
  account password — Gmail rejects plain SMTP auth with regular passwords
  once 2FA is on (and you should have 2FA on). Generate one at:
  https://myaccount.google.com/apppasswords

  Never hardcode GMAIL_USER/GMAIL_PASS in code. Set them as env vars
  (.env locally, and in Render's Environment settings for production).
*/
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

// Default alert recipients, overridable via env (comma-separated) so you
// can change who gets pinged without a code change/redeploy.
const ALERT_RECIPIENTS = (process.env.ALERT_RECIPIENTS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function sendReportEmail({ to, from, toDate, pdfBuffer, excelBuffer }) {
  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to,
    subject: `Energy Report: ${from} to ${toDate}`,
    text: `Your scheduled energy report for ${from} to ${toDate} is attached.`,
    attachments: [
      { filename: `energy-report-${from}_${toDate}.pdf`, content: pdfBuffer },
      { filename: `energy-report-${from}_${toDate}.xlsx`, content: excelBuffer },
    ],
  });
}

/*
  High-power threshold alert — same job your existing sendEmailAlert()
  did, just folded in here so all email sending goes through one
  transporter/config instead of two separate setups.
*/
async function sendPowerAlertEmail(meterName, power, recipients = ALERT_RECIPIENTS) {
  if (!recipients.length) {
    console.warn("sendPowerAlertEmail: no recipients configured (set ALERT_RECIPIENTS env var)");
    return;
  }
  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: recipients,
    subject: "⚠️ Energy Alert",
    text:
      `High Power Alert\n\n` +
      `Meter: ${meterName}\n` +
      `Power: ${power} kW\n` +
      `Time: ${new Date().toLocaleString()}`,
  });
  console.log(`Power alert email sent for ${meterName}`);
}

/*
  --- SMS (Fast2SMS) ---
  Optional: only fires if a phone number was saved with the schedule.

  Fast2SMS expects a plain 10-digit Indian number, no country code and
  no "+" — so we strip a leading "+91" or "91" if someone saved the
  number that way.

  NOTE ON ROUTES: this uses route "q" (Quick SMS), which is meant for
  low-volume/testing use and doesn't require a DLT-registered template.
  For production-volume transactional SMS in India, TRAI rules require
  a registered sender ID + DLT template — at that point switch route to
  "dlt" and pass your approved template ID. Fast2SMS's dashboard has the
  DLT registration flow if/when you need it.
*/
function toFast2SmsNumber(raw) {
  return raw.replace(/^\+?91/, "").replace(/\D/g, "");
}

async function sendReportSms({ to, from, toDate }) {
  if (!process.env.FAST2SMS_API_KEY || !to) return; // silently skip if not configured / no phone on file

  const numbers = toFast2SmsNumber(to);
  const message = `Your energy report (${from} to ${toDate}) has just been emailed to you.`;

  try {
    await axios.post(
      "https://www.fast2sms.com/dev/bulkV2",
      { route: "q", message, language: "english", flash: 0, numbers },
      {
        headers: {
          authorization: process.env.FAST2SMS_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    // Don't let an SMS failure block the email from having already sent
    console.error("Fast2SMS send failed:", err.response?.data || err.message);
  }
}

module.exports = { sendReportEmail, sendReportSms, sendPowerAlertEmail };
