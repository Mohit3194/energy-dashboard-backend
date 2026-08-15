const nodemailer = require("nodemailer");

/*
  Sends emails via Gmail SMTP using Nodemailer.

  Required env vars:
    GMAIL_USER            - the Gmail address sending the reports
    GMAIL_APP_PASSWORD    - a 16-character Gmail "App Password", NOT your real password
                             (Google Account -> Security -> 2-Step Verification -> App Passwords)
  Gmail requires 2-Step Verification to be enabled before App Passwords are available.
  Regular account passwords will NOT work here and will fail auth.
*/

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    throw new Error(
      "Missing GMAIL_USER or GMAIL_APP_PASSWORD env vars. Set these in Render's environment settings."
    );
  }

  transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    family: 4, // force IPv4 — some hosts (e.g. Render) can't route Gmail's IPv6 address
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  return transporter;
}

/**
 * Sends one report email with a PDF attachment.
 * @param {string} to - recipient email
 * @param {{from: string, to: string}} range - the date range the report covers (display only)
 * @param {Buffer} pdfBuffer
 */
async function sendReportEmail(to, range, pdfBuffer) {
  const tx = getTransporter();
  const filename = `energy-report-${range.from}_to_${range.to}.pdf`;

  await tx.sendMail({
    from: `"Energy EMS Reports" <${process.env.GMAIL_USER}>`,
    to,
    subject: `Energy Report: ${range.from} to ${range.to}`,
    text: `Your scheduled energy report for ${range.from} to ${range.to} is attached.`,
    html: `<p>Your scheduled energy report for <strong>${range.from}</strong> to <strong>${range.to}</strong> is attached.</p>`,
    attachments: [{ filename, content: pdfBuffer, contentType: "application/pdf" }],
  });
}

/** Optional: verify SMTP credentials work, without sending anything. Useful for a one-off sanity check. */
async function verifyConnection() {
  const tx = getTransporter();
  await tx.verify();
}

module.exports = { sendReportEmail, verifyConnection };
