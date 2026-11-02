import { onRequestPost } from './functions/api/send-push.js';
import { onRequestPost as onBookingCreated } from './functions/api/booking-created.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/send-push') {
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ ok: false, error: 'Method not allowed.' }), {
          status: 405,
          headers: { Allow: 'POST', 'Content-Type': 'application/json' },
        });
      }
      return onRequestPost({ request, env });
    }
    if (url.pathname === '/api/booking-created') {
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ ok: false, error: 'Method not allowed.' }), {
          status: 405,
          headers: { Allow: 'POST', 'Content-Type': 'application/json' },
        });
      }
      return onBookingCreated({ request, env });
    }

    return env.ASSETS.fetch(request);
  },
};
