const { Resend } = require('resend');
const {
  RESEND_API_KEY,
  RESEND_FROM_EMAIL,
  RESEND_REPLY_TO,
  APP_BASE_URL,
  EMAIL_LOGO_URL,
  PASSWORD_RESET_OTP_TTL_MINUTES
} = require('../config/env');

let resendClient;

function getClient() {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    throw new Error('Resend OTP email is not configured');
  }
  if (!resendClient) resendClient = new Resend(RESEND_API_KEY);
  return resendClient;
}

function buildOtpEmail({ otp }) {
  const subject = 'Mã OTP khôi phục tài khoản DG Store';
  const html = `<!doctype html>
<html lang="vi">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#172033">
  <div style="display:none;max-height:0;overflow:hidden">Mã xác minh của bạn có hiệu lực trong ${PASSWORD_RESET_OTP_TTL_MINUTES} phút.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #dbe3ef;border-radius:20px;overflow:hidden">
        <tr><td style="height:5px;background:linear-gradient(90deg,#4f46e5,#2563eb,#0891b2)"></td></tr>
        <tr><td style="padding:32px">
          <div style="text-align:center">
            <img src="${EMAIL_LOGO_URL}" width="96" height="96" alt="Logo DG Store" style="display:block;width:96px;height:96px;margin:0 auto;border:0;border-radius:20px;object-fit:cover">
            <h1 style="margin:18px 0 8px;font-size:26px">Khôi phục tài khoản</h1>
            <p style="margin:0;color:#64748b;line-height:1.65">Dùng mã xác minh bên dưới để tiếp tục đặt lại mật khẩu DG Store.</p>
          </div>
          <div style="margin:26px 0;padding:22px;border-radius:16px;background:#eef2ff;text-align:center">
            <div style="font-size:11px;font-weight:700;letter-spacing:.12em;color:#4f46e5;text-transform:uppercase">Mã OTP của bạn</div>
            <div style="margin-top:10px;font-size:38px;font-weight:800;letter-spacing:.2em;color:#172033">${otp}</div>
            <div style="margin-top:10px;color:#64748b;font-size:13px">Hết hạn sau ${PASSWORD_RESET_OTP_TTL_MINUTES} phút</div>
          </div>
          <a href="${APP_BASE_URL}/reset-password.html" style="display:block;padding:14px 18px;border-radius:12px;background:#4f46e5;color:#fff;text-align:center;text-decoration:none;font-weight:700">Mở trang khôi phục</a>
          <p style="margin:24px 0 0;color:#64748b;font-size:13px;line-height:1.6">Không chia sẻ mã này với bất kỳ ai. Nếu bạn không yêu cầu khôi phục mật khẩu, hãy bỏ qua email này.</p>
        </td></tr>
        <tr><td style="padding:18px 32px;background:#f8fafc;color:#94a3b8;text-align:center;font-size:12px">© DG Store · Email bảo mật tự động, vui lòng không trả lời.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  const text = `Khôi phục tài khoản DG Store\n\nMã OTP: ${otp}\nMã hết hạn sau ${PASSWORD_RESET_OTP_TTL_MINUTES} phút.\n\nNếu không phải bạn yêu cầu, hãy bỏ qua email này.`;
  return { subject, html, text };
}

async function sendResetOtpEmail({ email, otp }) {
  const content = buildOtpEmail({ otp });
  const payload = {
    from: RESEND_FROM_EMAIL,
    to: [email],
    subject: content.subject,
    html: content.html,
    text: content.text
  };
  if (RESEND_REPLY_TO) payload.replyTo = RESEND_REPLY_TO;
  const result = await getClient().emails.send(payload);
  if (result.error) throw new Error(result.error.message || 'Resend rejected OTP email');
  return result.data;
}

module.exports = { sendResetOtpEmail, buildOtpEmail };
