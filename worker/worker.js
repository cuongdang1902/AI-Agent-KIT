/**
 * Cloudflare Worker — AI Agent Business Kit Payment Verifier
 *
 * Endpoints:
 *   POST /webhook      ← SePay gọi khi có tiền vào
 *   POST /register     ← Landing page gửi email trước khi thanh toán
 *   GET  /check?id=    ← Frontend polling để kiểm tra đơn hàng
 *
 * KV Bindings required:
 *   ORDERS_KV   — lưu trạng thái đơn hàng (TTL 24h)
 *   LICENSES_KV — lưu license key sau khi thanh toán (shared với aikit-mcp worker)
 *
 * Secrets required (npx wrangler secret put RESEND_API_KEY):
 *   RESEND_API_KEY — API key từ resend.com để gửi email license
 */

// ─────────────────────────────────────────────
// License key generator
// Charset không có I, O, 0, 1 để tránh nhầm lẫn
// ─────────────────────────────────────────────
function generateLicenseKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from(
    { length: 5 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('');
  return `AIKIT-${seg()}-${seg()}`;
}

// ─────────────────────────────────────────────
// Gửi email license qua Resend
// ─────────────────────────────────────────────
async function sendLicenseEmail(email, licenseKey, env) {
  const MCP_URL = 'https://aikit-mcp.cuongdang1902.workers.dev/mcp';
  const configBlock = JSON.stringify({
    mcpServers: {
      aikit: {
        command: 'npx',
        args: ['-y', 'mcp-remote', MCP_URL],
        env: { MCP_REMOTE_HEADER_X_LICENSE_KEY: licenseKey },
      },
    },
  }, null, 2);

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;background:#0f0f1a;color:#e2e8f0;margin:0;padding:0;">
  <div style="max-width:560px;margin:40px auto;background:#1e1b2e;border-radius:16px;overflow:hidden;border:1px solid rgba(139,92,246,0.3);">
    <div style="background:linear-gradient(135deg,#7c3aed,#0891b2);padding:32px 24px;text-align:center;">
      <div style="font-size:48px;margin-bottom:8px;">🤖</div>
      <h1 style="color:#fff;margin:0;font-size:22px;">AI Agent Business Kit</h1>
      <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">Cảm ơn anh/chị đã tin tưởng!</p>
    </div>
    <div style="padding:32px 24px;">
      <p style="margin:0 0 20px;color:#cbd5e1;">Đây là license key của anh/chị:</p>
      <div style="background:#0f0f1a;border:1px solid rgba(139,92,246,0.4);border-radius:10px;padding:16px;text-align:center;margin-bottom:24px;">
        <code style="color:#a78bfa;font-size:20px;font-weight:bold;letter-spacing:2px;">${licenseKey}</code>
      </div>
      <p style="margin:0 0 12px;color:#94a3b8;font-size:14px;font-weight:600;">Cách kết nối vào Claude Desktop / Claude Code:</p>
      <p style="margin:0 0 8px;color:#94a3b8;font-size:13px;">Thêm vào file config của Claude:</p>
      <div style="background:#0f0f1a;border-radius:8px;padding:14px;margin-bottom:24px;overflow-x:auto;">
        <pre style="margin:0;font-size:12px;color:#67e8f9;white-space:pre-wrap;word-break:break-all;">${configBlock.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
      </div>
      <div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:10px;padding:14px;margin-bottom:24px;">
        <p style="margin:0;font-size:13px;color:#6ee7b7;">
          <strong>📁 macOS:</strong> ~/Library/Application Support/Claude/claude_desktop_config.json<br>
          <strong>🪟 Windows:</strong> %APPDATA%\Claude\claude_desktop_config.json
        </p>
      </div>
      <p style="margin:0;color:#64748b;font-size:12px;text-align:center;">
        Câu hỏi? Liên hệ qua Telegram sau khi mua.<br>
        License key là thông tin cá nhân — không chia sẻ với người khác.
      </p>
    </div>
  </div>
</body>
</html>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'AI Agent Business Kit <noreply@steve.vn>',
      to:   email,
      subject: '🎉 License Key — AI Agent Business Kit của bạn đã sẵn sàng',
      html,
    }),
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json',
    };

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // ─────────────────────────────────────────────
    // POST /webhook  — SePay webhook receiver
    // ─────────────────────────────────────────────
    if (request.method === 'POST' && url.pathname === '/webhook') {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: cors });
      }

      // SePay gửi các field khác nhau tuỳ version, cover hết
      const content = String(
        body.content ?? body.description ?? body.code ?? body.transferContent ?? ''
      ).toUpperCase();

      const amount  = Number(body.transferAmount ?? body.amount ?? 0);
      const type    = String(body.transferType   ?? body.type   ?? '').toLowerCase();
      const account = String(body.accountNumber  ?? body.account ?? '');

      // Tìm mã đơn hàng dạng AIKIT + 5-10 chữ số
      const match = content.match(/AIKIT\d{5,10}/);

      if (match && type === 'in' && amount >= 759000) {
        const orderId = match[0];

        await env.ORDERS_KV.put(
          orderId,
          JSON.stringify({
            status:      'paid',
            amount,
            account,
            confirmedAt: new Date().toISOString(),
          }),
          { expirationTtl: 86400 } // tự xoá sau 24h
        );

        // ── AUTO-ISSUE LICENSE ────────────────────────────────────────────
        const customerEmail = (await env.ORDERS_KV.get(`email:${orderId}`)) ?? '';
        const licenseKey    = generateLicenseKey();

        await env.LICENSES_KV.put(licenseKey, JSON.stringify({
          email:       customerEmail,
          orderId:     orderId,
          activatedAt: new Date().toISOString(),
          expiresAt:   null,
          revoked:     false,
          plan:        'lifetime',
        }));
        // Reverse lookup: orderId → licenseKey (dùng khi khách hàng báo support)
        await env.LICENSES_KV.put(`order:${orderId}`, licenseKey);

        // Gửi email license tự động
        if (customerEmail) {
          await sendLicenseEmail(customerEmail, licenseKey, env);
        }
        // ─────────────────────────────────────────────────────────────────
      }

      // Luôn trả 200 — SePay retry nếu nhận non-200
      return new Response(JSON.stringify({ received: true }), { headers: cors });
    }

    // ─────────────────────────────────────────────
    // POST /register  — Landing page lưu email trước khi thanh toán
    // ─────────────────────────────────────────────
    if (request.method === 'POST' && url.pathname === '/register') {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: cors });
      }
      const { orderId, email } = body ?? {};
      if (orderId && email && orderId.startsWith('AIKIT')) {
        await env.ORDERS_KV.put(`email:${orderId}`, String(email), { expirationTtl: 86400 });
      }
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    // ─────────────────────────────────────────────
    // GET /check?id=AIKIT1234567  — Frontend polling
    // ─────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/check') {
      const id = (url.searchParams.get('id') ?? '').toUpperCase().trim();

      if (!id || !id.startsWith('AIKIT')) {
        return new Response(
          JSON.stringify({ paid: false, error: 'Invalid order ID' }),
          { headers: cors }
        );
      }

      const raw = await env.ORDERS_KV.get(id);

      if (raw) {
        const data = JSON.parse(raw);
        return new Response(
          JSON.stringify({ paid: true, orderId: id, ...data }),
          { headers: cors }
        );
      }

      return new Response(
        JSON.stringify({ paid: false, orderId: id }),
        { headers: cors }
      );
    }

    // Health check
    return new Response(
      JSON.stringify({ ok: true, service: 'AIKit Payment Worker v1' }),
      { headers: cors }
    );
  },
};
