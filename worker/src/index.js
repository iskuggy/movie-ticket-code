const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

// In-memory sliding window per isolate; the RATE_LIMITER binding below is a
// second layer (per-colo, eventually consistent, may not fire on small bursts).
const RL_LIMIT = 10;
const RL_WINDOW_MS = 60000;
const rlBuckets = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  let hits = rlBuckets.get(ip);
  if (!hits) {
    if (rlBuckets.size > 10000) rlBuckets.clear();
    hits = [];
    rlBuckets.set(ip, hits);
  }
  while (hits.length && now - hits[0] > RL_WINDOW_MS) hits.shift();
  if (hits.length >= RL_LIMIT) return true;
  hits.push(now);
  return false;
}

function corsHeaders(origin, env) {
  const allowed = env.ALLOWED_ORIGIN || 'https://iskuggy.github.io';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function jsonResponse(body, status, origin, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin, env),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function buildPrompt(text) {
  return [
    '从下面的电影订单通知文本中提取信息，严格按照 JSON 格式返回，不要有任何多余文字。',
    '',
    '返回格式：{"movie":"电影名","cinema":"影院名","time":"场次时间","seat":"座位信息","code":"取票码"}',
    '',
    '如果某个字段找不到，对应值填空字符串""。取票码通常是一串数字。',
    '',
    '原文：',
    text
  ].join('\n');
}

function normalizeResult(value) {
  return {
    movie: String(value.movie || ''),
    cinema: String(value.cinema || ''),
    time: String(value.time || ''),
    seat: String(value.seat || ''),
    code: String(value.code || '')
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
    }

    if (request.method !== 'POST' || url.pathname !== '/parse') {
      return jsonResponse({ error: 'Not found' }, 404, origin, env);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (isRateLimited(ip)) {
      return jsonResponse({ error: 'Too many requests, please retry later' }, 429, origin, env);
    }
    if (env.RATE_LIMITER) {
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return jsonResponse({ error: 'Too many requests, please retry later' }, 429, origin, env);
      }
    }

    if (!env.DEEPSEEK_API_KEY) {
      return jsonResponse({ error: 'DeepSeek API key is not configured' }, 500, origin, env);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400, origin, env);
    }

    const text = String(payload.text || '').trim();
    if (!text) {
      return jsonResponse({ error: 'Missing text' }, 400, origin, env);
    }
    if (text.length > 3000) {
      return jsonResponse({ error: 'Text is too long' }, 413, origin, env);
    }

    const deepseekResp = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
        messages: [{ role: 'user', content: buildPrompt(text) }],
        temperature: 0,
        max_tokens: 256
      })
    });

    if (!deepseekResp.ok) {
      const body = await deepseekResp.text();
      return jsonResponse({
        error: `DeepSeek API error ${deepseekResp.status}`,
        detail: body.slice(0, 300)
      }, 502, origin, env);
    }

    const data = await deepseekResp.json();
    let content = String(data?.choices?.[0]?.message?.content || '').trim();
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) content = jsonMatch[1].trim();

    try {
      return jsonResponse(normalizeResult(JSON.parse(content)), 200, origin, env);
    } catch {
      return jsonResponse({ error: 'DeepSeek returned invalid JSON' }, 502, origin, env);
    }
  }
};
