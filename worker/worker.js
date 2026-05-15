/**
 * Cloudflare Worker — AI Agent Business Kit Payment Verifier
 *
 * Endpoints:
 *   POST /webhook   ← SePay gọi khi có tiền vào
 *   GET  /check?id= ← Frontend polling để kiểm tra đơn hàng
 */

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
      }

      // Luôn trả 200 — SePay retry nếu nhận non-200
      return new Response(JSON.stringify({ received: true }), { headers: cors });
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
