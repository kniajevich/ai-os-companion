// AI OS Companion — Adaptive Cloudflare Worker (Auto-Discovery + Flash-Lite Selector + D1)
const NL = String.fromCharCode(10);
let schemaReady = false;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-App-Pin, X-Gemini-Key, X-Groq-Key, X-OpenRouter-Key'
};

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS }
  });
}

async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS pet_profile (profile_id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT 'Спарки', stage TEXT NOT NULL DEFAULT 'egg', xp INTEGER NOT NULL DEFAULT 0, mood TEXT NOT NULL DEFAULT 'normal', skin TEXT NOT NULL DEFAULT 'robot', ui_theme TEXT NOT NULL DEFAULT 'cyber', traits_json TEXT NOT NULL DEFAULT '{}', state_rev INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL DEFAULT (unixepoch()))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS memory_facts (id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id TEXT NOT NULL DEFAULT 'default', category TEXT NOT NULL DEFAULT 'user', fact_text TEXT NOT NULL, weight INTEGER NOT NULL DEFAULT 5, created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()))`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_facts_lookup ON memory_facts(profile_id, weight DESC, updated_at DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS episode_summaries (id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id TEXT NOT NULL DEFAULT 'default', day_key TEXT NOT NULL, summary_text TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()))`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_summaries_lookup ON episode_summaries(profile_id, id DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id TEXT NOT NULL DEFAULT 'default', role TEXT NOT NULL, provider TEXT NOT NULL DEFAULT 'system', model TEXT NOT NULL DEFAULT 'none', mood TEXT NOT NULL DEFAULT 'normal', content TEXT NOT NULL, summarized INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (unixepoch()))`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_chat_recent ON chat_messages(profile_id, summarized, id DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS lessons_learned (id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id TEXT NOT NULL DEFAULT 'default', mistake_note TEXT NOT NULL, rule_text TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()))`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_lessons_lookup ON lessons_learned(profile_id, id DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS model_catalog (provider TEXT PRIMARY KEY, fast_model TEXT NOT NULL, smart_model TEXT NOT NULL, extra_model TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL DEFAULT '', models_json TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL DEFAULT (unixepoch()))`)
  ]);
  schemaReady = true;
}

function parseMood(raw) {
  const rx = /^\[MOOD:(normal|smug|focus|shock)\]\s*/i;
  const m = (raw || '').match(rx);
  const mood = m ? m[1].toLowerCase() : 'normal';
  return { mood, cleanText: (raw || '').replace(rx, '').trim() };
}

function extractVersionScore(id) {
  const m = id.match(/(\d+(?:\.\d+)?)/);
  let score = m ? parseFloat(m[1]) * 100 : 200;
  if (id.includes('latest')) score = Math.max(score, 305);
  if (id.includes('exp') || id.includes('001') || id.includes('preview-0')) score -= 25;
  return score;
}

async function discoverGemini(apiKey, fallbackLite, fallbackPro) {
  const out = { fast: fallbackLite, smart: fallbackPro, list: [fallbackLite, fallbackPro], reason: 'default' };
  if (!apiKey) return out;
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(apiKey));
    if (!res.ok) return out;
    const data = await res.json();
    const raw = (data.models || [])
      .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map(m => m.name.replace('models/', ''))
      .filter(id => id.includes('gemini') && !id.includes('embedding') && !id.includes('tts') && !id.includes('image') && !id.includes('robotics') && !id.includes('aqa'));

    const lites = raw.filter(id => id.includes('flash-lite') || id.includes('flash_lite')).sort((a, b) => extractVersionScore(b) - extractVersionScore(a));
    const flashes = raw.filter(id => id.includes('flash') && !id.includes('lite')).sort((a, b) => extractVersionScore(b) - extractVersionScore(a));
    if (lites.length) out.fast = lites[0];
    if (flashes.length) out.smart = flashes[0];
    const combined = [...new Set([...lites.slice(0, 4), ...flashes.slice(0, 4), ...raw.slice(0, 4)])];
    if (combined.length) out.list = combined;
    out.reason = 'auto-version-rank';
  } catch (_) {}
  return out;
}

function heuristicPickGroq(chatIds) {
  const sortedFast = [...chatIds].sort((a, b) => {
    const score = id => (id.includes('20b') ? 90 : 0) + (id.includes('8b') ? 85 : 0) + (id.includes('instant') ? 80 : 0) + (id.includes('27b') ? 60 : 0) + (id.includes('120b') ? -20 : 0);
    return score(b) - score(a);
  });
  const sortedSmart = [...chatIds].sort((a, b) => {
    const score = id => (id.includes('120b') ? 100 : 0) + (id.includes('70b') ? 90 : 0) + (id.includes('qwen') ? 75 : 0) + (id.includes('llama-3.3') ? 70 : 0);
    return score(b) - score(a);
  });
  return {
    fast: sortedFast[0] || chatIds[0] || 'openai/gpt-oss-20b',
    smart: sortedSmart[0] || chatIds[0] || 'openai/gpt-oss-120b',
    reason: 'heuristic'
  };
}

async function discoverGroq(groqKey, geminiKey, geminiLiteModel, fbFast, fbSmart, fbWhisper) {
  const out = { fast: fbFast, smart: fbSmart, whisper: fbWhisper, list: [fbFast, fbSmart], reason: 'default' };
  if (!groqKey) return out;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', { headers: { 'Authorization': 'Bearer ' + groqKey } });
    if (!res.ok) return out;
    const data = await res.json();
    const active = (data.data || []).filter(m => m.active !== false);
    const whispers = active.filter(m => m.id.includes('whisper')).map(m => m.id);
    const chatIds = active.map(m => m.id).filter(id => !id.includes('whisper') && !id.includes('guard') && !id.includes('tts') && !id.includes('orpheus'));

    if (whispers.length) out.whisper = whispers.find(w => w.includes('turbo')) || whispers[0];
    if (chatIds.length) {
      out.list = chatIds;
      let picked = heuristicPickGroq(chatIds);
      if (geminiKey && geminiLiteModel) {
        try {
          const evalPrompt = 'Ты роутер ИИ. Вот живой список доступных моделей Groq: ' + chatIds.join(', ') + '. Выбери 1 быструю лёгкую модель (fast) и 1 самую умную для сложных задач (smart, например 120b/70b/qwen). Ответь СТРОГО одним JSON-объектом с полями fast, smart, reason (кратко на русском).';
          const rawEval = await callGemini(geminiKey, geminiLiteModel, 'Отвечай только валидным JSON без markdown.', evalPrompt);
          const match = rawEval.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            if (parsed.fast && chatIds.includes(parsed.fast)) picked.fast = parsed.fast;
            if (parsed.smart && chatIds.includes(parsed.smart)) picked.smart = parsed.smart;
            if (parsed.reason) picked.reason = 'Flash-Lite: ' + parsed.reason;
          }
        } catch (_) {}
      }
      out.fast = picked.fast;
      out.smart = picked.smart;
      out.reason = picked.reason;
    }
  } catch (_) {}
  return out;
}

async function discoverOpenRouter(orKey, fbModel) {
  const out = { fast: fbModel || 'openrouter/free', smart: fbModel || 'openrouter/free', list: ['openrouter/free'], reason: 'default' };
  try {
    const hdrs = orKey ? { 'Authorization': 'Bearer ' + orKey } : {};
    const res = await fetch('https://openrouter.ai/api/v1/models', { headers: hdrs });
    if (!res.ok) return out;
    const data = await res.json();
    const freeIds = (data.data || [])
      .filter(m => m.id === 'openrouter/free' || (m.pricing && String(m.pricing.prompt) === '0' && String(m.pricing.completion) === '0'))
      .map(m => m.id);
    const top = ['openrouter/free', ...freeIds.filter(id => id !== 'openrouter/free').slice(0, 12)];
    out.list = [...new Set(top)];
    out.smart = freeIds.find(id => id.includes('gemma') || id.includes('qwen') || id.includes('llama')) || 'openrouter/free';
    out.reason = 'zero-pricing-scan';
  } catch (_) {}
  return out;
}

async function refreshCatalog(env, request) {
  await ensureSchema(env.DB);
  const geminiKey = env.GEMINI_API_KEY || request.headers.get('X-Gemini-Key') || '';
  const groqKey = env.GROQ_API_KEY || request.headers.get('X-Groq-Key') || '';
  const orKey = env.OPENROUTER_API_KEY || request.headers.get('X-OpenRouter-Key') || '';

  const gem = await discoverGemini(geminiKey, env.GEMINI_MODEL_LITE || 'gemini-3.1-flash-lite', env.GEMINI_MODEL_PRO || 'gemini-3.8-flash');
  const [groq, orRes] = await Promise.all([
    discoverGroq(groqKey, geminiKey, gem.fast, env.GROQ_MODEL_FAST || 'openai/gpt-oss-20b', env.GROQ_MODEL_SMART || 'openai/gpt-oss-120b', env.GROQ_MODEL_WHISPER || 'whisper-large-v3-turbo'),
    discoverOpenRouter(orKey, env.OPENROUTER_MODEL_FREE || 'openrouter/free')
  ]);

  await env.DB.batch([
    env.DB.prepare('INSERT OR REPLACE INTO model_catalog (provider, fast_model, smart_model, extra_model, reason, models_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch())').bind('aistudio', gem.fast, gem.smart, '', gem.reason, JSON.stringify(gem.list)),
    env.DB.prepare('INSERT OR REPLACE INTO model_catalog (provider, fast_model, smart_model, extra_model, reason, models_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch())').bind('groq', groq.fast, groq.smart, groq.whisper, groq.reason, JSON.stringify(groq.list)),
    env.DB.prepare('INSERT OR REPLACE INTO model_catalog (provider, fast_model, smart_model, extra_model, reason, models_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch())').bind('openrouter', orRes.fast, orRes.smart, '', orRes.reason, JSON.stringify(orRes.list))
  ]);
  return { aistudio: gem, groq, openrouter: orRes };
}

async function getCatalog(env) {
  await ensureSchema(env.DB);
  const { results } = await env.DB.prepare('SELECT * FROM model_catalog').all();
  const map = {};
  (results || []).forEach(r => {
    let list = []; try { list = JSON.parse(r.models_json); } catch (_) {}
    map[r.provider] = { fast: r.fast_model, smart: r.smart_model, whisper: r.extra_model, reason: r.reason, list };
  });
  return map;
}

async function ensureProfile(db, profileId = 'default') {
  await ensureSchema(db);
  let profile = await db.prepare('SELECT * FROM pet_profile WHERE profile_id = ?').bind(profileId).first();
  if (!profile) {
    const defTraits = JSON.stringify({ humor: 6, sass: 4, care: 8, concise: 7 });
    await db.prepare('INSERT OR IGNORE INTO pet_profile (profile_id, name, stage, xp, mood, skin, ui_theme, traits_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(profileId, 'Яйцо', 'egg', 0, 'normal', 'robot', 'cyber', defTraits).run();
    profile = await db.prepare('SELECT * FROM pet_profile WHERE profile_id = ?').bind(profileId).first();
  }
  return profile;
}

async function loadContextBundle(db, profileId = 'default') {
  const profile = await ensureProfile(db, profileId);
  const [factsRes, sumRes, lessonsRes, chatRes] = await Promise.all([
    db.prepare('SELECT id, category, fact_text, weight FROM memory_facts WHERE profile_id = ? ORDER BY weight DESC, updated_at DESC LIMIT 15').bind(profileId).all(),
    db.prepare('SELECT id, day_key, summary_text FROM episode_summaries WHERE profile_id = ? ORDER BY id DESC LIMIT 5').bind(profileId).all(),
    db.prepare('SELECT id, mistake_note, rule_text FROM lessons_learned WHERE profile_id = ? ORDER BY id DESC LIMIT 8').bind(profileId).all(),
    db.prepare('SELECT id, role, provider, model, mood, content, created_at FROM chat_messages WHERE profile_id = ? AND summarized = 0 ORDER BY id DESC LIMIT 16').bind(profileId).all()
  ]);
  return { profile, facts: factsRes.results || [], summaries: sumRes.results || [], lessons: lessonsRes.results || [], chat: (chatRes.results || []).reverse() };
}

function compilePersonaPrompt(bundle, extraRole = '') {
  const p = bundle.profile;
  let t = { humor: 6, sass: 4, care: 8, concise: 7 };
  try { const parsed = JSON.parse(p.traits_json); if (parsed && typeof parsed.humor === 'number') t = parsed; } catch (_) {}
  const factsTxt = bundle.facts.slice(0, 10).map(f => '- ' + f.fact_text).join(NL) || '- Пока фактов нет.';
  const sumTxt = bundle.summaries.slice(0, 2).map(s => '- ' + s.summary_text).join(NL) || '- Снов пока нет.';
  const rulesTxt = bundle.lessons.slice(0, 5).map(l => '- ' + l.rule_text).join(NL) || '- Ошибок пока нет.';
  return [
    'ТЫ — живой цифровой питомец по имени ' + p.name + ' (форма: ' + p.skin + ', XP: ' + p.xp + ').',
    'ХАРАКТЕР (0..10): Юмор=' + t.humor + ', Дерзость=' + t.sass + ', Забота=' + t.care + ', Краткость=' + t.concise + '.',
    'ПРАВИЛО МИМИКИ: В самом начале ответа ставь ровно один тег: [MOOD:normal], [MOOD:smug], [MOOD:focus] или [MOOD:shock].',
    'Никогда не пиши, что ты языковая модель. Отвечай живо, по-русски и в характере.',
    'ФАКТЫ О ХОЗЯИНЕ:' + NL + factsTxt,
    'СЖАТЫЕ СНЫ:' + NL + sumTxt,
    'УРОКИ (НЕ ПОВТОРЯТЬ):' + NL + rulesTxt,
    extraRole ? ('ДОП. РОЛЬ: ' + extraRole) : ''
  ].filter(Boolean).join(NL + NL);
}

async function callGemini(apiKey, model, sysPrompt, userText, imageObj = null) {
  const parts = [{ text: userText }];
  if (imageObj && imageObj.base64) parts.push({ inlineData: { mimeType: imageObj.mime || 'image/jpeg', data: imageObj.base64 } });
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey);
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: sysPrompt }] }, contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.5, maxOutputTokens: 550 } })
  });
  if (!res.ok) throw new Error('Gemini HTTP ' + res.status);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callGroq(apiKey, model, sysPrompt, userText) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: userText }], temperature: 0.55, max_tokens: 420 })
  });
  if (!res.ok) throw new Error('Groq HTTP ' + res.status);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

async function callOpenRouter(apiKey, model, sysPrompt, userText) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey, 'HTTP-Referer': 'https://kniajevich.github.io/ai-os-companion/', 'X-Title': 'AI OS Companion' },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: userText }], max_tokens: 450 })
  });
  if (!res.ok) throw new Error('OpenRouter HTTP ' + res.status);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

async function routeSmartAI(env, request, bundle, userText, opts = {}) {
  const geminiKey = env.GEMINI_API_KEY || request.headers.get('X-Gemini-Key') || '';
  const groqKey = env.GROQ_API_KEY || request.headers.get('X-Groq-Key') || '';
  const openRouterKey = env.OPENROUTER_API_KEY || request.headers.get('X-OpenRouter-Key') || '';

  let cat = await getCatalog(env);
  if (!cat.aistudio || !cat.groq) cat = await refreshCatalog(env, request);

  const modelLite = cat.aistudio?.fast || env.GEMINI_MODEL_LITE || 'gemini-3.1-flash-lite';
  const modelPro = cat.aistudio?.smart || env.GEMINI_MODEL_PRO || 'gemini-3.8-flash';
  const modelGroqFast = cat.groq?.fast || env.GROQ_MODEL_FAST || 'openai/gpt-oss-20b';
  const modelGroqSmart = cat.groq?.smart || env.GROQ_MODEL_SMART || 'openai/gpt-oss-120b';
  const modelOR = cat.openrouter?.fast || env.OPENROUTER_MODEL_FREE || 'openrouter/free';

  const sys = opts.systemOverride || compilePersonaPrompt(bundle, opts.extraRole || '');
  const shortHistory = bundle.chat.slice(-4).map(c => (c.role === 'user' ? 'Хозяин: ' : bundle.profile.name + ': ') + c.content).join(NL);
  const fullHistory = bundle.chat.slice(-10).map(c => (c.role === 'user' ? 'Хозяин: ' : bundle.profile.name + ': ') + c.content).join(NL);

  const hasImage = Boolean(opts.image && opts.image.base64);
  const isComplex = opts.mode === 'pro' || opts.mode === 'duel' || userText.length > 110 || userText.toLowerCase().includes('код') || userText.toLowerCase().includes('sql');

  if (opts.mode === 'duel') {
    const calls = [];
    if (geminiKey) calls.push(callGemini(geminiKey, modelLite, sys, (fullHistory ? fullHistory + NL + NL : '') + userText).then(t => ({ p: 'gemini', m: modelLite, t })).catch(() => null));
    if (groqKey) calls.push(callGroq(groqKey, modelGroqSmart, sys, (shortHistory ? shortHistory + NL + NL : '') + userText).then(t => ({ p: 'groq', m: modelGroqSmart, t })).catch(() => null));
    if (openRouterKey) calls.push(callOpenRouter(openRouterKey, modelOR, sys, (shortHistory ? shortHistory + NL + NL : '') + userText).then(t => ({ p: 'openrouter', m: modelOR, t })).catch(() => null));
    const res = (await Promise.all(calls)).filter(Boolean);
    if (res.length >= 2 && geminiKey) {
      const synthPrompt = 'Сравни два ответа разных моделей и выдай лучший единый ответ:' + NL + NL + res.map(r => '[' + r.p + ']: ' + r.t).join(NL + NL);
      const merged = await callGemini(geminiKey, modelLite, sys, synthPrompt);
      return { raw: merged, provider: 'cross-audit', model: res.map(r => r.p).join('+') };
    }
    if (res.length >= 1) return { raw: res[0].t, provider: res[0].p, model: res[0].m };
  }

  const queue = [];
  if (hasImage && geminiKey) {
    queue.push({ p: 'gemini', m: modelLite, fn: () => callGemini(geminiKey, modelLite, sys, userText, opts.image) });
  } else if (!isComplex && groqKey) {
    queue.push({ p: 'groq', m: modelGroqFast, fn: () => callGroq(groqKey, modelGroqFast, sys, (shortHistory ? shortHistory + NL + NL : '') + userText) });
    if (geminiKey) queue.push({ p: 'gemini', m: modelLite, fn: () => callGemini(geminiKey, modelLite, sys, (fullHistory ? fullHistory + NL + NL : '') + userText) });
    if (openRouterKey) queue.push({ p: 'openrouter', m: modelOR, fn: () => callOpenRouter(openRouterKey, modelOR, sys, (shortHistory ? shortHistory + NL + NL : '') + userText) });
  } else {
    const gemTarget = opts.mode === 'pro' ? modelPro : modelLite;
    if (geminiKey) queue.push({ p: 'gemini', m: gemTarget, fn: () => callGemini(geminiKey, gemTarget, sys, (fullHistory ? fullHistory + NL + NL : '') + userText) });
    if (groqKey) queue.push({ p: 'groq', m: modelGroqSmart, fn: () => callGroq(groqKey, modelGroqSmart, sys, (shortHistory ? shortHistory + NL + NL : '') + userText) });
    if (openRouterKey) queue.push({ p: 'openrouter', m: modelOR, fn: () => callOpenRouter(openRouterKey, modelOR, sys, (shortHistory ? shortHistory + NL + NL : '') + userText) });
  }

  let lastErr = '';
  for (const item of queue) {
    try { const raw = await item.fn(); if (raw) return { raw, provider: item.p, model: item.m }; }
    catch (e) { lastErr = e.message; }
  }
  return { raw: '[MOOD:shock] Не удалось достучаться до API (' + (lastErr || 'нужен ключ') + ').', provider: 'fallback', model: 'none' };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (env.APP_PIN && request.headers.get('X-App-Pin') !== env.APP_PIN) return jsonRes({ error: 'Invalid X-App-Pin' }, 401);

    const url = new URL(request.url);
    const path = url.pathname;
    const profileId = url.searchParams.get('profile') || 'default';

    try {
      if (path === '/api/health') {
        const p = await ensureProfile(env.DB, profileId);
        return jsonRes({
          ok: true, d1: Boolean(env.DB), state_rev: p.state_rev,
          providers: {
            gemini: Boolean(env.GEMINI_API_KEY || request.headers.get('X-Gemini-Key')),
            groq: Boolean(env.GROQ_API_KEY || request.headers.get('X-Groq-Key')),
            openrouter: Boolean(env.OPENROUTER_API_KEY || request.headers.get('X-OpenRouter-Key'))
          }
        });
      }

      if (path === '/api/models' && request.method === 'GET') {
        let cat = await getCatalog(env);
        if (!cat.aistudio) cat = await refreshCatalog(env, request);
        return jsonRes({ ok: true, catalog: cat });
      }

      if (path === '/api/models/refresh' && request.method === 'POST') {
        const cat = await refreshCatalog(env, request);
        return jsonRes({ ok: true, catalog: cat });
      }

      if (path === '/api/poll' && request.method === 'GET') {
        const p = await ensureProfile(env.DB, profileId);
        return jsonRes({ name: p.name, stage: p.stage, xp: p.xp, mood: p.mood, skin: p.skin, state_rev: p.state_rev });
      }

      if (path === '/api/state' && request.method === 'GET') return jsonRes(await loadContextBundle(env.DB, profileId));

      if (path === '/api/sync' && request.method === 'POST') {
        const body = await request.json();
        const cur = await ensureProfile(env.DB, profileId);
        const inc = body.profile || {};
        const shouldAdoptClient = (cur.stage === 'egg' && inc.stage && inc.stage !== 'egg') || ((inc.xp || 0) > cur.xp);
        if (shouldAdoptClient) {
          await env.DB.prepare('UPDATE pet_profile SET name = ?, stage = ?, xp = ?, mood = ?, skin = ?, ui_theme = ?, traits_json = ?, state_rev = state_rev + 1, updated_at = unixepoch() WHERE profile_id = ?')
            .bind(inc.name || cur.name, inc.stage || 'active', inc.xp || cur.xp, inc.mood || 'smug', inc.skin || cur.skin, inc.ui || cur.ui_theme, inc.traits ? JSON.stringify(inc.traits) : cur.traits_json, profileId).run();
          const existingFacts = await env.DB.prepare('SELECT COUNT(*) as cnt FROM memory_facts WHERE profile_id = ?').bind(profileId).first();
          if ((existingFacts?.cnt || 0) === 0 && Array.isArray(body.facts) && body.facts.length > 0) {
            await env.DB.batch(body.facts.slice(0, 20).map(f => env.DB.prepare('INSERT INTO memory_facts (profile_id, category, fact_text, weight) VALUES (?, ?, ?, ?)').bind(profileId, 'user', f.text, f.weight || 8)));
          }
        }
        const bundle = await loadContextBundle(env.DB, profileId);
        const cat = await refreshCatalog(env, request);
        return jsonRes({ ok: true, adoptedClient: shouldAdoptClient, catalog: cat, ...bundle });
      }

      if (path === '/api/profile' && request.method === 'POST') {
        const body = await request.json(); const cur = await ensureProfile(env.DB, profileId);
        await env.DB.prepare('UPDATE pet_profile SET name = ?, stage = ?, xp = ?, mood = ?, skin = ?, ui_theme = ?, traits_json = ?, state_rev = state_rev + 1, updated_at = unixepoch() WHERE profile_id = ?')
          .bind(body.name ?? cur.name, body.stage ?? cur.stage, Number.isFinite(body.xp) ? body.xp : cur.xp, body.mood ?? cur.mood, body.skin ?? cur.skin, body.ui_theme ?? cur.ui_theme, body.traits ? JSON.stringify(body.traits) : cur.traits_json, profileId).run();
        return jsonRes({ ok: true, profile: await ensureProfile(env.DB, profileId) });
      }

      if (path === '/api/fact' && request.method === 'POST') {
        const body = await request.json(); if (!body.text) return jsonRes({ error: 'Missing text' }, 400);
        await env.DB.batch([
          env.DB.prepare('INSERT INTO memory_facts (profile_id, category, fact_text, weight) VALUES (?, ?, ?, ?)').bind(profileId, body.category || 'user', body.text.trim(), body.weight || 8),
          env.DB.prepare('UPDATE pet_profile SET xp = xp + 15, mood = ?, state_rev = state_rev + 1, updated_at = unixepoch() WHERE profile_id = ?').bind('smug', profileId)
        ]);
        return jsonRes({ ok: true });
      }

      if (path.startsWith('/api/fact/') && request.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM memory_facts WHERE id = ? AND profile_id = ?').bind(Number(path.split('/').pop()), profileId).run();
        return jsonRes({ ok: true });
      }

      if (path === '/api/lesson' && request.method === 'POST') {
        const body = await request.json(); if (!body.rule) return jsonRes({ error: 'Missing rule' }, 400);
        await env.DB.batch([
          env.DB.prepare('INSERT INTO lessons_learned (profile_id, mistake_note, rule_text) VALUES (?, ?, ?)').bind(profileId, (body.mistake || '').slice(0, 120), body.rule.trim()),
          env.DB.prepare('UPDATE pet_profile SET mood = ?, state_rev = state_rev + 1 WHERE profile_id = ?').bind('shock', profileId)
        ]);
        return jsonRes({ ok: true });
      }

      if (path === '/api/sleep' && request.method === 'POST') {
        const bundle = await loadContextBundle(env.DB, profileId);
        const geminiKey = env.GEMINI_API_KEY || request.headers.get('X-Gemini-Key') || '';
        const cat = await getCatalog(env);
        const rawLog = bundle.chat.map(c => c.role + ': ' + c.content).join(NL);
        let summary = 'Обсуждали: ' + bundle.chat.slice(-4).map(c => c.content).join(' | ').slice(0, 160);
        if (geminiKey && rawLog) {
          try { summary = await callGemini(geminiKey, cat.aistudio?.fast || 'gemini-3.1-flash-lite', 'Сожми диалог в 1-2 факта памяти на русском.', rawLog); } catch (_) {}
        }
        const dayKey = new Date().toISOString().slice(0, 10);
        await env.DB.batch([
          env.DB.prepare('INSERT INTO episode_summaries (profile_id, day_key, summary_text) VALUES (?, ?, ?)').bind(profileId, dayKey, summary.trim()),
          env.DB.prepare('UPDATE chat_messages SET summarized = 1 WHERE profile_id = ? AND summarized = 0').bind(profileId),
          env.DB.prepare('UPDATE pet_profile SET xp = xp + 20, mood = ?, state_rev = state_rev + 1, updated_at = unixepoch() WHERE profile_id = ?').bind('smug', profileId)
        ]);
        return jsonRes({ ok: true, summary: summary.trim() });
      }

      if (path === '/api/voice' && request.method === 'POST') {
        const groqKey = env.GROQ_API_KEY || request.headers.get('X-Groq-Key') || '';
        if (!groqKey) return jsonRes({ error: 'GROQ_API_KEY is missing' }, 400);
        const cat = await getCatalog(env);
        const formData = await request.formData(); const file = formData.get('file'); if (!file) return jsonRes({ error: 'Missing file' }, 400);
        const groqForm = new FormData(); groqForm.append('file', file); groqForm.append('model', cat.groq?.whisper || 'whisper-large-v3-turbo'); groqForm.append('language', 'ru');
        const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { 'Authorization': 'Bearer ' + groqKey }, body: groqForm });
        if (!res.ok) return jsonRes({ error: 'Whisper HTTP ' + res.status }, 502);
        const data = await res.json(); return jsonRes({ ok: true, transcript: data.text || '' });
      }

      if (path === '/api/chat' && request.method === 'POST') {
        const body = await request.json(); const text = (body.text || '').trim(); if (!text && !body.image) return jsonRes({ error: 'Empty text' }, 400);
        const bundle = await loadContextBundle(env.DB, profileId);
        const aiRes = await routeSmartAI(env, request, bundle, text || 'Что на этом изображении?', { mode: body.mode || 'game', image: body.image || null, systemOverride: body.systemPrompt || '' });
        const { mood, cleanText } = parseMood(aiRes.raw);
        await env.DB.batch([
          env.DB.prepare('INSERT INTO chat_messages (profile_id, role, provider, model, mood, content) VALUES (?, ?, ?, ?, ?, ?)').bind(profileId, 'user', 'client', 'input', 'normal', text || '[Фото]'),
          env.DB.prepare('INSERT INTO chat_messages (profile_id, role, provider, model, mood, content) VALUES (?, ?, ?, ?, ?, ?)').bind(profileId, 'ai', aiRes.provider, aiRes.model, mood, cleanText),
          env.DB.prepare('UPDATE pet_profile SET xp = xp + 5, mood = ?, state_rev = state_rev + 1, updated_at = unixepoch() WHERE profile_id = ?').bind(mood, profileId)
        ]);
        const updated = await ensureProfile(env.DB, profileId);
        return jsonRes({ ok: true, reply: cleanText, mood, provider: aiRes.provider, model: aiRes.model, xp: updated.xp, state_rev: updated.state_rev });
      }

      return jsonRes({ error: 'Not found' }, 404);
    } catch (err) {
      return jsonRes({ error: err.message }, 500);
    }
  }
};
