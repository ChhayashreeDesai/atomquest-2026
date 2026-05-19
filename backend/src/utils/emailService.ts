import nodemailer from "nodemailer";

interface EmailPayload {
  to: string;
  subject: string;
  htmlBody: string;
  type: "GOAL_SUBMISSION" | "GOAL_APPROVAL" | "GOAL_REJECTION" | "CHECK_IN_REMINDER";
}

let transporter: nodemailer.Transporter | null = null;

export async function initializeEmailService() {
  try {
    if (process.env.NODE_ENV === "development" && process.env.ADMIN_DEV_MODE === "true") {
      // Use Ethereal test account
      try {
        let testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
          host: testAccount.smtp.host,
          port: testAccount.smtp.port,
          secure: testAccount.smtp.secure,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });
        console.log("✉️  Email service initialized (Ethereal Test Account)");
      } catch (error) {
        console.log("⚠️  Ethereal test account creation failed. Email will be logged to console only.");
        transporter = null;
      }
    } else {
      // Production SMTP
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_PORT === "465",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    }
  } catch (error) {
    console.error("⚠️  Email service initialization failed:", error);
    transporter = null;
  }
}

export async function sendEmail(payload: EmailPayload) {
  if (!transporter) {
    console.log("📧 Email service not initialized. Console log instead:");
    console.log(`
    ╔════════════════════════════════════════════════════════════╗
    ║                    EMAIL NOTIFICATION                      ║
    ╠════════════════════════════════════════════════════════════╣
    ║ TO: ${payload.to.padEnd(52)} ║
    ║ TYPE: ${payload.type.padEnd(47)} ║
    ║ SUBJECT: ${payload.subject.padEnd(43)} ║
    ╠════════════════════════════════════════════════════════════╣
    ${payload.htmlBody.split("\n").slice(0, 10).map((line) => "║ " + line.padEnd(58) + " ║").join("\n")}
    ╚════════════════════════════════════════════════════════════╝
    `);
    return;
  }

  try {
    const mailOptions = {
      from: process.env.SMTP_FROM || "noreply@atomquest.dev",
      to: payload.to,
      subject: payload.subject,
      html: payload.htmlBody,
    };

    const info = await transporter.sendMail(mailOptions);

    console.log(`✅ Email sent: ${info.messageId}`);

    if (process.env.NODE_ENV === "development") {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`📧 Preview URL: ${previewUrl}`);
    }
  } catch (error) {
    console.error("❌ Email send failed:", error);
    throw error;
  }
}

export function generateEmailTemplate(
  type: EmailPayload["type"],
  data: Record<string, any>
): string {
  const baseStyle = `
    font-family: Arial, sans-serif;
    max-width: 600px;
    margin: 0 auto;
    background-color: #f5f5f5;
    padding: 20px;
  `;

  switch (type) {
    case "GOAL_SUBMISSION":
      return `
        <div style="${baseStyle}">
          <h2>Goal Sheet Submitted</h2>
          <p>Dear ${data.userName},</p>
          <p>Your goal sheet for FY ${data.cycleYear} has been successfully submitted for approval.</p>
          <p><strong>Number of Goals:</strong> ${data.goalCount}</p>
          <p><strong>Submitted On:</strong> ${new Date().toLocaleDateString()}</p>
          <p>Your manager will review and provide feedback shortly.</p>
          <p>Best regards,<br/>Atomquest Team</p>
        </div>
      `;

    case "GOAL_APPROVAL":
      return `
        <div style="${baseStyle}">
          <h2>Goal Sheet Approved ✓</h2>
          <p>Dear ${data.userName},</p>
          <p>Your goal sheet for FY ${data.cycleYear} has been approved by your manager.</p>
          <p><strong>Approved By:</strong> ${data.approverName}</p>
          <p><strong>Approved On:</strong> ${new Date().toLocaleDateString()}</p>
          <p>Your goals are now locked and you can begin tracking progress during check-in periods.</p>
          <p>Best regards,<br/>Atomquest Team</p>
        </div>
      `;

    case "GOAL_REJECTION":
      return `
        <div style="${baseStyle}">
          <h2>Goal Sheet Returned for Rework</h2>
          <p>Dear ${data.userName},</p>
          <p>Your goal sheet for FY ${data.cycleYear} has been returned for rework.</p>
          <p><strong>Returned By:</strong> ${data.managerName}</p>
          <p><strong>Comments:</strong> ${data.comments || "No specific comments provided"}</p>
          <p>Please review the feedback and resubmit your updated goal sheet.</p>
          <p>Best regards,<br/>Atomquest Team</p>
        </div>
      `;

    case "CHECK_IN_REMINDER":
      return `
        <div style="${baseStyle}">
          <h2>Check-in Period Reminder</h2>
          <p>Dear ${data.userName},</p>
          <p>This is a reminder that the <strong>${data.quarter} Check-in window</strong> is now active.</p>
          <p>Please log in to Atomquest and update your goal achievements and progress during this period.</p>
          <p><strong>Check-in Window:</strong> ${data.windowDates}</p>
          <p>Best regards,<br/>Atomquest Team</p>
        </div>
      `;

    default:
      return "<p>Notification from Atomquest</p>";
  }
}
