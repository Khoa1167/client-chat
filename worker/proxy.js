// Reverse proxy /api và /socket.io sang backend Render (env.BACKEND_ORIGIN, khai báo trong
// wrangler.jsonc) — cho phép traffic API/WebSocket đi qua mạng Cloudflare (có DDoS protection ở
// tầng network) thay vì browser gọi thẳng domain onrender.com trần trụi như trước. Mọi request
// khác (HTML/JS/CSS/ảnh build ra) vẫn do env.ASSETS xử lý y hệt lúc chưa có Worker script này —
// kể cả fallback SPA (not_found_handling) đã cấu hình trong wrangler.jsonc vẫn áp dụng đúng vì
// gọi qua binding ASSETS, không phụ thuộc route có match "main" hay không.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) {
      // Rate limit theo IP thật của người gọi (CF-Connecting-IP — Cloudflare tự set, đáng tin cậy
      // hơn X-Forwarded-For vì client không tự chèn được) — chặn burst thô ngay tại edge trước khi
      // tốn tài nguyên Render. Chỉ áp cho /api và /socket.io, không áp cho static asset (đã được
      // Cloudflare tự phục vụ hiệu quả từ edge, rate-limit vào đó chỉ hại trải nghiệm user thật).
      const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.RATE_LIMITER.limit({ key: clientIp });
      if (!success) {
        return new Response('Quá nhiều request, vui lòng thử lại sau.', { status: 429 });
      }

      const targetUrl = env.BACKEND_ORIGIN + url.pathname + url.search;
      return fetch(new Request(targetUrl, request));
    }

    return env.ASSETS.fetch(request);
  },
};
