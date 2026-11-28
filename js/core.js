// AI OS Companion — Core State, D1 Vault Client, Adaptive Discovery & Proprioception
const STORAGE_KEY = 'aios_v15_modular';
const NL = String.fromCharCode(10);
const BSLASH = String.fromCharCode(92);
const Q1 = String.fromCharCode(34);
const Q2 = String.fromCharCode(39);
const Q3 = String.fromCharCode(96);

const KIND_LABELS = {
  'browser-local': '🌐 Браузер (Текущий)',
  'linux-dietpi': '🐧 Linux / DietPi',
  'esp32-p4': '🖥 ESP32-P4',
  'esp32-c5': '📡 ESP32-C5/C6',
  'esp32-wroom': '🔌 ESP32 WROOM',
  'android-ios': '📱 Android / iOS',
  'desktop-os': '💻 Desktop OS'
};
const PET_LABELS = { blob: 'Плазма-слизень', crab: 'Меха-краб', swarm: 'Рой-4', 'chibi-fox': 'Мини-лисёнок' };

const STATE = {
  appMode: 'game', ui: 'cyber', skin: 'robot', viewMode: 'hybrid', soundOn: true,
  stage: 'egg', eggTaps: 0, name: 'Яйцо', xp: 0, mood: 'normal',
  apiKey: '', groqKey: '', orKey: '', workerUrl: '', appPin: '', d1Online: false,
  ghModuleUrl: '', ghModulePin: '', ghOnline: false,
  vault: { gemini: false, groq: false, openrouter: false, github: false, ghUrl: '' },
  devices: [{ id: 'dev-browser', name: 'Этот браузер', kind: 'browser-local', petSkin: 'chibi-fox', addr: 'local', isLeader: true }],
  activeCompId: null, skills: [],
  catalog: {
    aistudio: { fast: 'gemini-3.1-flash-lite', smart: 'gemini-3.8-flash', list: ['gemini-3.1-flash-lite', 'gemini-flash-lite-latest'], reason: 'default' },
    groq: { fast: 'openai/gpt-oss-20b', smart: 'openai/gpt-oss-120b', whisper: 'whisper-large-v3-turbo', list: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'], reason: 'default' },
    openai: { fast: 'openrouter/free', smart: 'openrouter/free', list: ['openrouter/free'], reason: 'default' },
    critic: { fast: 'gemini-3.1-flash-lite', smart: 'gemini-3.1-flash-lite', list: ['gemini-3.1-flash-lite', 'cross-audit-diff'], reason: 'default' },
    verifier: { fast: 'browser-sandbox-v1', smart: 'browser-sandbox-v1', list: ['browser-sandbox-v1'], reason: 'deterministic' }
  },
  traits: { humor: 6, sass: 4, care: 8, concise: 7 },
  facts: [], summaries: [], lessons: [], chat: [], modNodes: [], modEdges: [], selectedModId: null
};

const RT = {
  dragModId: null, dragEl: null, dragOffset: { x: 0, y: 0 },
  wiringFromId: null, tempPos: null, nodeEls: new Map(), busy: false, rec: null,
  vibePulledContent: '', vibeLastCode: '', vibeLastVerified: false, vibeLastLang: 'js',
  pendingGate: null, audioCtx: null
};

const $ = id => document.getElementById(id);

function saveState() {
  try {
    // Не сохраняем сырые ключи в localStorage, если они уже лежат в D1 Сейфе
    const copy = JSON.parse(JSON.stringify(STATE));
    if (copy.d1Online) { copy.apiKey = ''; copy.groqKey = ''; copy.orKey = ''; copy.ghModulePin = ''; }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
  } catch (_) {}
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('aios_v14_evolving') || localStorage.getItem('aios_v13_vibe');
    if (raw) {
      Object.assign(STATE, JSON.parse(raw));
      if (!Array.isArray(STATE.devices) || STATE.devices.length === 0) STATE.devices = [{ id: 'dev-browser', name: 'Этот браузер', kind: 'browser-local', petSkin: 'chibi-fox', addr: 'local', isLeader: true }];
      if (!Array.isArray(STATE.skills)) STATE.skills = [];
      if (!STATE.vault) STATE.vault = { gemini: false, groq: false, openrouter: false, github: false, ghUrl: '' };
    }
  } catch (_) {}
}
function isRealKey(k) { return Boolean(k && k.trim().length > 16 && !k.includes('demo') && !k.includes('free')); }
function hasMod(type) {
  if (type === 'gemini') return isRealKey(STATE.apiKey) || (STATE.d1Online && Boolean(STATE.vault?.gemini));
  if (type === 'groq') return isRealKey(STATE.groqKey) || (STATE.d1Online && Boolean(STATE.vault?.groq));
  if (type === 'openrouter') return isRealKey(STATE.orKey) || (STATE.d1Online && Boolean(STATE.vault?.openrouter));
  if (type === 'github') return Boolean(STATE.ghOnline || (STATE.d1Online && STATE.vault?.github));
  return false;
}
function normalizeOrigin(u) {
  const s = (u || '').trim(); if (!s) return '';
  try { return new URL(s.startsWith('http') ? s : 'https://' + s).origin; } catch (_) { return s.replace(/\/+$/, ''); }
}
function workerHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (STATE.appPin) h['X-App-Pin'] = STATE.appPin;
  if (isRealKey(STATE.apiKey)) h['X-Gemini-Key'] = STATE.apiKey;
  if (isRealKey(STATE.groqKey)) h['X-Groq-Key'] = STATE.groqKey;
  if (isRealKey(STATE.orKey)) h['X-OpenRouter-Key'] = STATE.orKey;
  return h;
}
function ghHeaders() { const h = { 'Content-Type': 'application/json' }; if (STATE.ghModulePin) h['X-Module-Pin'] = STATE.ghModulePin; return h; }

function toast(msg, type = 'info') {
  const box = $('toastBox'); if (!box) return; box.textContent = msg;
  box.style.borderColor = type === 'err' ? 'var(--danger)' : (type === 'warn' ? 'var(--warn)' : 'var(--accent)');
  box.classList.add('show'); setTimeout(() => box.classList.remove('show'), 2800);
}
function playTone(freq = 520, dur = 0.08) {
  if (!STATE.soundOn) return;
  try {
    if (navigator.vibrate) navigator.vibrate(18);
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    if (!RT.audioCtx) RT.audioCtx = new AC();
    const osc = RT.audioCtx.createOscillator(), g = RT.audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.value = freq; g.gain.setValueAtTime(0.05, RT.audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, RT.audioCtx.currentTime + dur);
    osc.connect(g); g.connect(RT.audioCtx.destination); osc.start(); osc.stop(RT.audioCtx.currentTime + dur);
  } catch (_) {}
}
function addLog(msg, tag = 'SYS') {
  const el = document.createElement('div'); const t = new Date().toLocaleTimeString('ru-RU', { hour12: false });
  el.textContent = '[' + t + '][' + tag + '] ' + msg;
  const box = $('logBox'); if (box) { box.prepend(el); while (box.children.length > 45) box.removeChild(box.lastChild); }
}
function showXpPop(label) { const pop = $('xpPop'); if (!pop) return; pop.textContent = label; pop.classList.add('show'); setTimeout(() => pop.classList.remove('show'), 1400); }
function addXP(pts) {
  STATE.xp += pts; const lvl = Math.floor(STATE.xp / 100) + 1, pct = STATE.xp % 100;
  if ($('hudXpLabel')) $('hudXpLabel').textContent = 'Lv.' + lvl + ' • ' + STATE.xp + ' XP';
  if ($('hudXpFill')) $('hudXpFill').style.width = Math.max(8, pct) + '%';
  if ($('hudStageLabel')) $('hudStageLabel').textContent = lvl >= 3 ? 'Стадия: PRO-Дух' : (lvl === 2 ? 'Стадия: Напарник' : 'Стадия: Малыш');
  if (pts > 0) { showXpPop('+' + pts + ' XP!'); playTone(680, 0.11); }
  saveState();
}
function getLeaderDevice() { return STATE.devices.find(d => d.isLeader) || STATE.devices[0]; }
function getActivePetDevice() { const pets = STATE.devices.filter(d => !d.isLeader); return pets.length ? (pets.find(d => d.id === STATE.activeCompId) || pets[0]) : null; }
function setPetVisual(powerState, mood) {
  STATE.mood = mood || 'normal';
  const pet = $('pet'), compDev = getActivePetDevice();
  const compClass = compDev ? ('companion-' + compDev.petSkin) : 'companion-none';
  pet.classList.remove('state-off', 'state-booting', 'state-awake', 'state-error', 'grim-normal', 'grim-smug', 'grim-focus', 'grim-shock', 'skin-robot', 'skin-beast', 'skin-relic', 'skin-monolith', 'companion-none', 'companion-blob', 'companion-crab', 'companion-swarm', 'companion-chibi-fox');
  pet.classList.add('state-' + powerState, 'grim-' + STATE.mood, 'skin-' + STATE.skin, compClass);
  pet.classList.toggle('mod-memory-on', Boolean(STATE.workerUrl && STATE.d1Online));
  pet.classList.toggle('mod-turbo-on', hasMod('groq'));
  pet.classList.toggle('mod-critic-on', hasMod('openrouter'));
  pet.classList.toggle('mod-gh-on', hasMod('github'));
  document.body.classList.remove('mood-normal', 'mood-smug', 'mood-focus', 'mood-shock');
  document.body.classList.add('mood-' + STATE.mood);
  $('liveDot').classList.toggle('on', powerState === 'awake');
  $('coreDot').setAttribute('fill', powerState === 'awake' ? '#00f5b8' : (powerState === 'booting' ? '#ffb020' : '#475569'));
  $('proEmotionBadge').textContent = 'GRIMACE: ' + STATE.mood.toUpperCase();
  const leader = getLeaderDevice();
  $('svgLeaderDockText').textContent = 'LEADER // ' + (leader ? leader.name.toUpperCase() : 'BROWSER');
  $('svgPetHostTag').textContent = compDev ? ('PET // ' + compDev.name.toUpperCase()) : '';
}

function versionScore(id) {
  const m = id.match(/(\d+(?:\.\d+)?)/); let s = m ? parseFloat(m[1]) * 100 : 200;
  if (id.includes('latest')) s = Math.max(s, 305); if (id.includes('exp') || id.includes('001')) s -= 25; return s;
}
async function discoverGeminiClient(key) {
  if (!isRealKey(key)) return null;
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(key)); if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  const raw = (data.models || []).filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent')).map(m => m.name.replace('models/', '')).filter(id => id.includes('gemini') && !id.includes('embedding') && !id.includes('tts') && !id.includes('image') && !id.includes('robotics') && !id.includes('aqa'));
  const lites = raw.filter(id => id.includes('flash-lite') || id.includes('flash_lite')).sort((a, b) => versionScore(b) - versionScore(a));
  const flashes = raw.filter(id => id.includes('flash') && !id.includes('lite')).sort((a, b) => versionScore(b) - versionScore(a));
  const fast = lites[0] || flashes[0] || 'gemini-flash-lite-latest', smart = flashes[0] || fast;
  STATE.catalog.aistudio = { fast, smart, list: [...new Set([...lites.slice(0, 4), ...flashes.slice(0, 4), ...raw.slice(0, 4)])], reason: 'auto-scan' };
  STATE.catalog.critic = { fast, smart, list: [fast, 'cross-audit-diff'], reason: 'auto-scan' };
  return STATE.catalog.aistudio;
}
async function discoverGroqClient(groqKey) {
  if (STATE.workerUrl && STATE.d1Online) {
    try { const r = await fetch(STATE.workerUrl + '/api/models/refresh', { method: 'POST', headers: workerHeaders() }); if (r.ok) { const d = await r.json(); if (d.catalog && d.catalog.groq) { STATE.catalog.groq = d.catalog.groq; return STATE.catalog.groq; } } } catch (_) {}
  }
  if (!isRealKey(groqKey)) return null;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', { headers: { 'Authorization': 'Bearer ' + groqKey } }); if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json(); const chatIds = (data.data || []).filter(m => m.active !== false).map(m => m.id).filter(id => !id.includes('whisper') && !id.includes('guard') && !id.includes('tts'));
    let fast = chatIds.find(id => id.includes('20b') || id.includes('8b')) || chatIds[0] || 'openai/gpt-oss-20b', smart = chatIds.find(id => id.includes('120b') || id.includes('70b') || id.includes('qwen')) || chatIds[0] || 'openai/gpt-oss-120b', reason = 'heuristic';
    if (isRealKey(STATE.apiKey) && chatIds.length > 0) {
      try {
        const raw = await callGeminiDirect(STATE.apiKey, STATE.catalog.aistudio.fast, 'Отвечай только JSON.', 'Список Groq: ' + chatIds.join(', ') + '. Выбери fast и smart. JSON с полями fast, smart, reason.', null, true);
        const m = raw.match(/\{[\s\S]*\}/); if (m) { const p = JSON.parse(m[0]); if (p.fast && chatIds.includes(p.fast)) fast = p.fast; if (p.smart && chatIds.includes(p.smart)) smart = p.smart; if (p.reason) reason = 'Flash-Lite: ' + p.reason; }
      } catch (_) {}
    }
    STATE.catalog.groq = { fast, smart, whisper: 'whisper-large-v3-turbo', list: chatIds.length ? chatIds : [fast, smart], reason }; return STATE.catalog.groq;
  } catch (_) {
    STATE.catalog.groq = { fast: 'openai/gpt-oss-20b', smart: 'openai/gpt-oss-120b', whisper: 'whisper-large-v3-turbo', list: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'], reason: 'cors-via-worker', corsBlocked: true }; return STATE.catalog.groq;
  }
}
async function discoverOpenRouterClient(orKey) {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', { headers: isRealKey(orKey) ? { 'Authorization': 'Bearer ' + orKey } : {} }); if (!res.ok) return STATE.catalog.openai;
    const data = await res.json(); const freeIds = (data.data || []).filter(m => m.id === 'openrouter/free' || (m.pricing && String(m.pricing.prompt) === '0' && String(m.pricing.completion) === '0')).map(m => m.id);
    STATE.catalog.openai = { fast: 'openrouter/free', smart: freeIds.find(id => id.includes('gemma') || id.includes('qwen')) || 'openrouter/free', list: [...new Set(['openrouter/free', ...freeIds.slice(0, 12)])], reason: 'zero-pricing' };
  } catch (_) {} return STATE.catalog.openai;
}
async function refreshAllAdaptiveModels() {
  $('proRouteLabel').textContent = 'SCANNING...';
  if (STATE.workerUrl && STATE.d1Online) {
    try { const r = await fetch(STATE.workerUrl + '/api/models/refresh', { method: 'POST', headers: workerHeaders() }); if (r.ok) { const d = await r.json(); if (d.catalog) { if (d.catalog.aistudio) STATE.catalog.aistudio = d.catalog.aistudio; if (d.catalog.groq) STATE.catalog.groq = d.catalog.groq; if (d.catalog.openrouter) STATE.catalog.openai = d.catalog.openrouter; } } } catch (_) {}
  } else {
    try { await discoverGeminiClient(STATE.apiKey); } catch (_) {}
    try { await discoverGroqClient(STATE.groqKey); } catch (_) {}
    await discoverOpenRouterClient(STATE.orKey);
  }
  syncNodesToFreshCatalog(); syncProDeckStatus(); syncInspector(); renderModGraph(); saveState(); $('proRouteLabel').textContent = 'READY';
}

async function saveToVaultAndRefresh(payload, label, msg) {
  if (STATE.workerUrl && STATE.d1Online) {
    try {
      const r = await fetch(STATE.workerUrl + '/api/vault', { method: 'POST', headers: workerHeaders(), body: JSON.stringify(payload) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
      if (d.vaultStatus) { STATE.vault = d.vaultStatus; if (d.vaultStatus.github) { STATE.ghOnline = true; STATE.ghModuleUrl = d.vaultStatus.ghUrl || STATE.ghModuleUrl; } }
      if (d.catalog) { if (d.catalog.aistudio) STATE.catalog.aistudio = d.catalog.aistudio; if (d.catalog.groq) STATE.catalog.groq = d.catalog.groq; if (d.catalog.openrouter) STATE.catalog.openai = d.catalog.openrouter; }
      syncNodesToFreshCatalog(); applyThemeAndMode(); renderModGraph(); syncInspector();
      await playModuleInstallAnim(label, msg + ' (сохранено в Сейф D1 ✓)'); return true;
    } catch (e) { toast('Ошибка Сейфа D1: ' + e.message, 'err'); return false; }
  }
  return false;
}

async function connectD1Memory(url, pin = '') {
  const clean = normalizeOrigin(url); if (!clean.startsWith('http')) { toast('Нужен URL Worker', 'warn'); return; }
  if (pin !== undefined) STATE.appPin = pin.trim();
  $('proStD1').textContent = 'ПРОВЕРКА...'; $('gmStD1').textContent = 'ПРОВЕРКА...';
  try {
    const hRes = await fetch(clean + '/api/health', { headers: workerHeaders() }); if (hRes.status === 401) throw new Error('Неверный APP PIN (401)'); if (!hRes.ok) throw new Error('HTTP ' + hRes.status);
    const hData = await hRes.json(); if (!hData.ok || !hData.d1) throw new Error('D1 не привязана');
    STATE.workerUrl = clean; STATE.d1Online = true;
    const syncRes = await fetch(clean + '/api/sync', { method: 'POST', headers: workerHeaders(), body: JSON.stringify({ profile: { name: STATE.name, stage: STATE.stage, xp: STATE.xp, mood: STATE.mood, skin: STATE.skin, ui: STATE.ui, traits: STATE.traits }, facts: STATE.facts }) });
    if (syncRes.ok) {
      const b = await syncRes.json();
      if (b.catalog) { if (b.catalog.aistudio) STATE.catalog.aistudio = b.catalog.aistudio; if (b.catalog.groq) STATE.catalog.groq = b.catalog.groq; if (b.catalog.openrouter) STATE.catalog.openai = b.catalog.openrouter; }
      if (b.vaultStatus) { STATE.vault = b.vaultStatus; if (b.vaultStatus.github) { STATE.ghOnline = true; STATE.ghModuleUrl = b.vaultStatus.ghUrl || STATE.ghModuleUrl; } }
      if (Array.isArray(b.skills) && b.skills.length > 0) STATE.skills = b.skills.map(s => ({ id: s.id, name: s.name, description: s.description, repo: s.repo, path: s.path, code: s.code, enabled: Boolean(s.enabled) }));
      if (Array.isArray(b.devices) && b.devices.length > 0) STATE.devices = b.devices;
      if (b.profile && !b.adoptedClient) {
        STATE.name = b.profile.name; STATE.stage = b.profile.stage; STATE.xp = b.profile.xp; STATE.skin = b.profile.skin;
        try { STATE.traits = JSON.parse(b.profile.traits_json); } catch (_) {}
        STATE.facts = (b.facts || []).map(f => ({ id: f.id, text: f.fact_text, weight: f.weight }));
        STATE.summaries = (b.summaries || []).map(s => ({ id: s.id, text: s.summary_text }));
        STATE.lessons = (b.lessons || []).map(l => ({ id: l.id, mistake: l.mistake_note, rule: l.rule_text }));
        STATE.chat = (b.chat || []).map(c => ({ id: c.id, role: c.role, provider: c.provider, model: c.model, mood: c.mood, text: c.content }));
      }
    }
    syncNodesToFreshCatalog(); applyThemeAndMode(); renderGameStage(); renderModGraph(); syncInspector();
    await playModuleInstallAnim('Cloudflare D1 Vault', 'Единый Сейф D1 подключён! Модули, навыки и спутники синхронизированы!');
  } catch (err) { STATE.d1Online = false; syncProDeckStatus(); setPetVisual('awake', 'shock'); toast('Ошибка D1: ' + err.message, 'err'); }
}

function getLiveTelemetryText() {
  const leader = getLeaderDevice();
  return ['AI Studio: ' + (hasMod('gemini') ? STATE.catalog.aistudio.fast : 'OFF'), 'Groq: ' + (hasMod('groq') ? STATE.catalog.groq.fast : 'OFF'), 'OpenRouter: ' + (hasMod('openrouter') ? 'ON' : 'OFF'), 'D1: ' + (STATE.d1Online ? 'ONLINE' : 'LOCAL'), 'GitHub: ' + (hasMod('github') ? 'ONLINE' : 'OFF'), 'Хост: ' + (leader ? leader.name : 'Browser'), 'Спутников: ' + (STATE.devices.length - 1)].join(' | ');
}
function buildUnifiedSystemPrompt(extraRole = '') {
  const t = STATE.traits;
  const factsText = STATE.facts.slice(0, 10).map(f => '- ' + f.text).join(NL) || '- Пока нет фактов.';
  const sumText = STATE.summaries.slice(0, 2).map(s => '- ' + s.text).join(NL) || '- Снов нет.';
  const rulesText = STATE.lessons.slice(0, 5).map(l => '- ' + l.rule).join(NL) || '- Ошибок нет.';
  const skillsText = STATE.skills.filter(s => s.enabled).map(s => '- id: ' + s.id + ' (' + s.name + ') — ' + s.description).join(NL) || '- Пока навыков нет.';
  return ['ТЫ — живой цифровой питомец ' + STATE.name + ' (форма: ' + STATE.skin + ', XP: ' + STATE.xp + ').', 'ХАРАКТЕР (0..10): Юмор=' + t.humor + ', Дерзость=' + t.sass + ', Забота=' + t.care + ', Краткость=' + t.concise + '.', 'ПРАВИЛО МИМИКИ: В начале ответа ставь тег [MOOD:normal], [MOOD:smug], [MOOD:focus] или [MOOD:shock].', 'ЖИВОЕ СОСТОЯНИЕ: ' + getLiveTelemetryText(), 'НАВЫКИ:' + NL + skillsText, 'ДЕЙСТВИЯ: [AUTO_FORGE:описание] — создать себе инструмент на GitHub; [RUN_SKILL:id|{}] — запустить навык.', 'ФАКТЫ:' + NL + factsText, 'СНЫ:' + NL + sumText, 'УРОКИ:' + NL + rulesText, extraRole ? ('РОЛЬ: ' + extraRole) : ''].filter(Boolean).join(NL + NL);
}

async function callGeminiDirect(apiKey, model, sysPrompt, userText, imageObj = null, jsonMode = false) {
  const parts = [{ text: userText }]; if (imageObj) parts.push({ inlineData: { mimeType: imageObj.mime, data: imageObj.base64 } });
  const genCfg = { temperature: jsonMode ? 0.35 : 0.55, maxOutputTokens: 1600 }; if (jsonMode) genCfg.responseMimeType = 'application/json';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey);
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: sysPrompt }] }, contents: [{ role: 'user', parts }], generationConfig: genCfg }) });
  if (!res.ok) throw new Error('HTTP ' + res.status); const data = await res.json(); return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
async function callOpenAICompat(endpoint, key, model, sysPrompt, userText) {
  const hdrs = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key };
  if (endpoint.includes('openrouter')) { hdrs['HTTP-Referer'] = 'https://kniajevich.github.io/ai-os-companion/'; hdrs['X-Title'] = 'AI OS Companion'; }
  const res = await fetch(endpoint, { method: 'POST', headers: hdrs, body: JSON.stringify({ model, messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: userText }], max_tokens: 1400 }) });
  if (!res.ok) throw new Error('HTTP ' + res.status); const data = await res.json(); return data?.choices?.[0]?.message?.content || '';
}
function parseReplyTags(rawText) {
  const moodRx = /^\[MOOD:(normal|smug|focus|shock)\]\s*/i, mm = rawText.match(moodRx), mood = mm ? mm[1].toLowerCase() : 'normal';
  let txt = rawText.replace(moodRx, '');
  const fm = txt.match(/\[AUTO_FORGE:([^\]]+)\]/i), autoForgeGoal = fm ? fm[1].trim() : null; txt = txt.replace(/\[AUTO_FORGE:([^\]]+)\]/i, '');
  const sm = txt.match(/\[RUN_SKILL:([^|\]]+)(?:\|([^\]]+))?\]/i), runSkillReq = sm ? { id: sm[1].trim(), argRaw: sm[2] || '{}' } : null; txt = txt.replace(/\[RUN_SKILL:([^|\]]+)(?:\|([^\]]+))?\]/i, '').trim();
  return { mood, cleanText: txt, autoForgeGoal, runSkillReq };
}
async function askPetBrain(userText, imageObj = null, mode = 'game') {
  setPetVisual('booting', 'focus');
  const sys = buildUnifiedSystemPrompt();
  const shortHist = STATE.chat.slice(-4).map(c => (c.role === 'user' ? 'Хозяин: ' : STATE.name + ': ') + c.text).join(NL);
  const fullHist = STATE.chat.slice(-8).map(c => (c.role === 'user' ? 'Хозяин: ' : STATE.name + ': ') + c.text).join(NL);
  let rawReply = '', usedModel = 'demo-sim';
  if (STATE.workerUrl && STATE.d1Online) {
    try { const res = await fetch(STATE.workerUrl + '/api/chat', { method: 'POST', headers: workerHeaders(), body: JSON.stringify({ text: userText, mode, image: imageObj, telemetry: getLiveTelemetryText() }) }); if (res.ok) { const d = await res.json(); rawReply = '[MOOD:' + (d.mood || 'normal') + '] ' + (d.reply || ''); usedModel = (d.provider || 'd1') + ' / ' + (d.model || 'brain'); if (Number.isFinite(d.xp)) STATE.xp = d.xp; } } catch (err) { addLog('Worker error: ' + err.message, 'ERR'); }
  }
  if (!rawReply) {
    const isShort = !imageObj && mode !== 'duel' && userText.length < 90 && !userText.toLowerCase().includes('гитхаб') && !userText.toLowerCase().includes('инструмент');
    if (isShort && isRealKey(STATE.groqKey)) { try { rawReply = await callOpenAICompat('https://api.groq.com/openai/v1/chat/completions', STATE.groqKey, STATE.catalog.groq.fast, sys, (shortHist ? shortHist + NL + NL : '') + userText); usedModel = 'groq / ' + STATE.catalog.groq.fast; } catch (_) {} }
    if (!rawReply && isRealKey(STATE.apiKey)) {
      try { rawReply = await callGeminiDirect(STATE.apiKey, STATE.catalog.aistudio.fast, sys, (fullHist ? fullHist + NL + NL : '') + userText, imageObj); usedModel = STATE.catalog.aistudio.fast; }
      catch (err) {
        if (isRealKey(STATE.orKey)) { try { rawReply = await callOpenAICompat('https://openrouter.ai/api/v1/chat/completions', STATE.orKey, STATE.catalog.openai.fast, sys, userText); usedModel = STATE.catalog.openai.fast; } catch (_) {} }
        if (!rawReply) rawReply = '[MOOD:shock] Ошибка API (' + err.message + ').';
      }
    }
  }
  if (!rawReply) {
    await new Promise(r => setTimeout(r, 300));
    rawReply = (userText.toLowerCase().includes('гитхаб') || userText.toLowerCase().includes('инструмент')) ? ('[MOOD:focus] Иду на GitHub проектировать инструмент! [AUTO_FORGE:' + userText + ']') : ('[MOOD:smug] Принял, хозяин! Я ' + STATE.name + ' (демо). На «' + userText.slice(0, 40) + '» отвечаю бодро!');
  }
  const { mood, cleanText, autoForgeGoal, runSkillReq } = parseReplyTags(rawReply);
  setPetVisual('awake', mood); playTone(mood === 'shock' ? 280 : 540, 0.08);
  STATE.chat.push({ id: Date.now(), role: 'ai', provider: 'brain', model: usedModel, mood, text: cleanText });
  if (STATE.chat.length > 30) STATE.chat.shift();
  addXP(STATE.workerUrl && STATE.d1Online ? 0 : 5); renderGameChat(); saveState();
  if (runSkillReq) {
    const sk = STATE.skills.find(s => s.id === runSkillReq.id && s.enabled);
    if (sk) { let a = {}; try { a = JSON.parse(runSkillReq.argRaw); } catch (_) {} const r = await executeSkillInSandbox(sk, a); STATE.chat.push({ id: Date.now(), role: 'ai', provider: 'skill', model: sk.name, mood: r.ok ? 'smug' : 'shock', text: r.ok ? ('⚡ «' + sk.name + '»: ' + JSON.stringify(r.result)) : ('✗ Сбой: ' + r.err) }); renderGameChat(); }
  }
  if (autoForgeGoal) await runAutonomousSkillForge(autoForgeGoal);
}
