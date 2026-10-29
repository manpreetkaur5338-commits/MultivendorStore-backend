import nodemailer from "nodemailer";

/**
 * Creates and returns configured Nodemailer transporter
 */
export const getEmailTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

  if (host) {
    return nodemailer.createTransport({
      host,
      port: port || 587,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  // Default to standard service (e.g. Gmail) using EMAIL_USER / EMAIL_PASS
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
};

/**
 * Generates an elegant, brand-aligned responsive HTML email for MarketNest OTP
 */
export const sendOtpEmail = async ({ to, name, otp }) => {
  const transporter = getEmailTransporter();
  const fromAddress = process.env.EMAIL_FROM || `"MarketNest Security" <${process.env.EMAIL_USER || "no-reply@marketnest.com"}>`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MarketNest Verification Code</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #F8F5EC;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #202824;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #F8F5EC;
      padding: 40px 0;
    }
    .main {
      background-color: #FFFFFF;
      margin: 0 auto;
      width: 100%;
      max-width: 540px;
      border: 1px solid #E6E0D2;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(23, 76, 60, 0.05);
    }
    .header {
      background-color: #174C3C;
      padding: 30px;
      text-align: center;
      border-bottom: 3px solid #D5B779;
    }
    .brand-title {
      color: #FFFFFF;
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -0.5px;
      margin: 0;
      font-family: Georgia, 'Playfair Display', serif;
    }
    .brand-title span {
      color: #D5B779;
    }
    .brand-sub {
      color: #D5B779;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-top: 6px;
      font-weight: 600;
    }
    .content {
      padding: 36px 32px;
    }
    .greeting {
      font-size: 16px;
      font-weight: 600;
      color: #202824;
      margin-bottom: 12px;
    }
    .text {
      font-size: 14px;
      line-height: 1.6;
      color: #68736C;
      margin-bottom: 24px;
    }
    .otp-container {
      background: #F8F5EC;
      border: 2px dashed #D5B779;
      border-radius: 14px;
      padding: 20px;
      text-align: center;
      margin: 24px 0;
    }
    .otp-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #174C3C;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .otp-code {
      font-size: 34px;
      font-weight: 800;
      letter-spacing: 8px;
      color: #174C3C;
      font-family: 'Courier New', Courier, monospace;
      padding-left: 8px;
    }
    .notice {
      background-color: #E8EFE8;
      border-left: 3px solid #174C3C;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 12px;
      color: #174C3C;
      line-height: 1.5;
      margin-bottom: 24px;
    }
    .footer {
      background-color: #F8F5EC;
      padding: 20px;
      text-align: center;
      border-top: 1px solid #E6E0D2;
      font-size: 11px;
      color: #68736C;
    }
    .footer p {
      margin: 4px 0;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <table class="main" cellpadding="0" cellspacing="0" align="center">
      <tr>
        <td class="header">
          <h1 class="brand-title">MarketNest<span>.</span></h1>
          <div class="brand-sub">Curated Marketplace Security</div>
        </td>
      </tr>
      <tr>
        <td class="content">
          <div class="greeting">Hello ${name ? name.split(" ")[0] : "Customer"},</div>
          <div class="text">
            We received a request to reset the password for your MarketNest account. Use the verification code below to authorize your new password:
          </div>
          
          <div class="otp-container">
            <div class="otp-label">Your One-Time Password (OTP)</div>
            <div class="otp-code">${otp}</div>
          </div>

          <div class="notice">
            ⏰ <strong>Expiry Notice:</strong> This code is valid for <strong>10 minutes</strong> only. For your security, never share this code with anyone. MarketNest staff will never ask for your verification code.
          </div>

          <div class="text" style="font-size: 12px; color: #68736C; margin-bottom: 0;">
            If you did not request a password reset, you can safely disregard this email. Your account remains completely secure.
          </div>
        </td>
      </tr>
      <tr>
        <td class="footer">
          <p>© ${new Date().getFullYear()} MarketNest Marketplace. All rights reserved.</p>
          <p>Handcrafted quality & character from independent artisans across India.</p>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>
  `;

  return transporter.sendMail({
    from: fromAddress,
    to,
    subject: "Your MarketNest Password Reset Code",
    text: `Your MarketNest password reset verification code is: ${otp}. It will expire in 10 minutes. If you did not request this, please ignore this email.`,
    html,
  });
};

