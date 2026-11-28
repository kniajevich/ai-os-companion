// AI OS Companion — PRO Mode: DAG Graph, Inspector, Adaptive Sync & Real Mesh Devices
function syncNodesToFreshCatalog() {
  STATE.modNodes.forEach(n => {
    if (n.provider === 'aistudio') n.model = STATE.catalog.aistudio.fast;
    else if (n.provider === 'groq') n.model = STATE.catalog.groq.fast;
    else if (n.provider === 'openai') n.model = STATE.catalog.openai.smart || 'openrouter/free';
    else if (n.provider === 'critic') n.model = STATE.catalog.aistudio.fast;
  });
}

function syncProDeckStatus() {
  const gOn = hasMod('gemini'), qOn = hasMod('groq'), cOn = hasMod('openrouter'), mOn = Boolean(STATE.workerUrl && STATE.d1Online), ghOn = hasMod('github');
  $('proCardGemini').classList.toggle('active', gOn); $('proStGemini').textContent = gOn ? STATE.catalog.aistudio.fast : 'OFF';
  $('proCardGroq').classList.toggle('active', qOn); $('proStGroq').textContent = qOn ? (STATE.catalog.groq.corsBlocked && !mOn ? 'KEY (нужен D1)' : STATE.catalog.groq.fast) : 'OFF';
  $('proCardOr').classList.toggle('active', cOn); $('proStOr').textContent = cOn ? STATE.catalog.openai.smart : 'OFF';
  $('proCardD1').classList.toggle('active', mOn); $('proStD1').textContent = mOn ? 'ONLINE ✓' : 'LOCAL';
  $('proCardGh').classList.toggle('active', ghOn); $('proStGh').textContent = ghOn ? 'READY ✓' : 'OFF';
  $('vaultStatusLabel').textContent = mOn ? 'CLOUD D1 ✓' : 'LOCAL';

  $('gmStGemini').textContent = gOn ? STATE.catalog.aistudio.fast : 'OFF';
  $('gmStGroq').textContent = qOn ? (STATE.catalog.groq.corsBlocked && !mOn ? 'KEY (нужен D1)' : STATE.catalog.groq.fast) : 'OFF';
  $('gmStOr').textContent = cOn ? 'ON ✓' : 'OFF';
  $('gmStD1').textContent = mOn ? 'CLOUD D1 ✓' : 'LOCAL';
  $('gmStGh').textContent = ghOn ? 'READY ✓' : 'OFF';
  $('vibeGhBadge').textContent = ghOn ? 'GitHub: READY ✓' : 'GitHub: OFF';
  $('vibeGhBadge').style.color = ghOn ? 'var(--accent)' : 'var(--muted)';

  ['proInD1', 'gmInD1'].forEach(id => { if ($(id) && $(id).value !== STATE.workerUrl) $(id).value = STATE.workerUrl; });
  ['proInPin', 'gmInPin'].forEach(id => { if ($(id) && $(id).value !== STATE.appPin) $(id).value = STATE.appPin; });
  const ghDisp = STATE.ghModuleUrl || STATE.vault?.ghUrl || '';
  ['proInGhUrl', 'gmInGhUrl'].forEach(id => { if ($(id) && $(id).value !== ghDisp) $(id).value = ghDisp; });
  $('catalogSummary').textContent = 'AI Studio: ' + STATE.catalog.aistudio.fast + ' / ' + STATE.catalog.aistudio.smart + NL + 'Groq: ' + STATE.catalog.groq.fast + ' / ' + STATE.catalog.groq.smart + NL + 'OpenRouter: ' + STATE.catalog.openai.smart;
}

function syncDevicesToD1() {
  if (STATE.workerUrl && STATE.d1Online) {
    fetch(STATE.workerUrl + '/api/devices', { method: 'POST', headers: workerHeaders(), body: JSON.stringify({ devices: STATE.devices }) }).catch(() => {});
  }
}

function buildPairSnippet(dev) {
  const wUrl = STATE.workerUrl || 'https://ТВОЙ-WORKER.workers.dev';
  if (dev.kind === 'linux-dietpi') return { title: '🐧 Агент для ' + dev.name, desc: 'Запусти на DietPi:', code: 'export AI_OS_WORKER=' + Q1 + wUrl + Q1 + NL + 'while true; do curl -s ' + Q1 + '$AI_OS_WORKER/api/poll' + Q1 + '; sleep 3; done' };
  if (dev.kind.startsWith('esp32')) return { title: '📡 Прошивка для ' + dev.name, desc: 'Параметры config.h:', code: '#define AI_OS_NODE_ID ' + Q1 + dev.id + Q1 + NL + '#define AI_OS_WORKER_URL ' + Q1 + wUrl + '/api/poll' + Q1 + NL + '#define AI_OS_ROLE ' + Q1 + (dev.isLeader ? 'LEADER' : 'PET') + Q1 };
  return { title: '📱 Подключение: ' + dev.name, desc: 'Открой ссылку и введи Worker URL + APP PIN:', code: 'URL: https://kniajevich.github.io/ai-os-companion/' + NL + 'Worker: ' + wUrl };
}
function showPairModal(dev) { const i = buildPairSnippet(dev); $('pairModalTitle').textContent = i.title; $('pairModalDesc').textContent = i.desc; $('pairModalCode').textContent = i.code; $('pairModal').classList.add('open'); }

function swapLeaderWithDevice(devId) {
  const target = STATE.devices.find(d => d.id === devId); if (!target || target.isLeader) return;
  const oldLeader = getLeaderDevice(); STATE.devices.forEach(d => { d.isLeader = (d.id === devId); });
  if (oldLeader) STATE.activeCompId = oldLeader.id; setPetVisual('awake', 'smug'); renderNodesList(); syncDevicesToD1(); saveState(); toast('LEADER переехал на ' + target.name);
}

function renderNodesList() {
  const box = $('nodeList'); if (!box) return; box.innerHTML = '';
  const leader = getLeaderDevice(), activePet = getActivePetDevice();
  $('leaderHostLabel').textContent = leader ? leader.name : 'Этот браузер';
  $('petHostLabel').textContent = activePet ? (activePet.name + ' (' + PET_LABELS[activePet.petSkin] + ')') : 'Не добавлен';

  STATE.devices.forEach(dev => {
    const card = document.createElement('div'); card.className = 'dev-card ' + (dev.isLeader ? 'is-leader' : 'is-pet');
    const head = document.createElement('div'); head.className = 'dev-head';
    const title = document.createElement('strong'); title.textContent = dev.name;
    const badge = document.createElement('span'); badge.className = 'dev-role ' + (dev.isLeader ? 'role-leader' : 'role-pet'); badge.textContent = dev.isLeader ? 'LEADER' : 'PET';
    head.appendChild(title); head.appendChild(badge); card.appendChild(head);
    const sub = document.createElement('div'); sub.style.color = 'var(--muted)'; sub.style.fontSize = '9.5px';
    sub.textContent = (KIND_LABELS[dev.kind] || dev.kind) + (dev.isLeader ? '' : (' • Спутник: ' + PET_LABELS[dev.petSkin])); card.appendChild(sub);
    const btns = document.createElement('div'); btns.className = 'dev-btns';
    if (!dev.isLeader) {
      const sw = document.createElement('button'); sw.className = 'dev-mini-btn'; sw.textContent = '⇄ Свап'; sw.onclick = () => swapLeaderWithDevice(dev.id); btns.appendChild(sw);
      const fw = document.createElement('button'); fw.className = 'dev-mini-btn'; fw.textContent = '👁 Сцена'; fw.onclick = () => { STATE.activeCompId = dev.id; setPetVisual('awake', 'smug'); renderNodesList(); saveState(); }; btns.appendChild(fw);
    }
    if (dev.kind !== 'browser-local') {
      const cb = document.createElement('button'); cb.className = 'dev-mini-btn'; cb.textContent = '📋 Код'; cb.onclick = () => showPairModal(dev); btns.appendChild(cb);
      const db = document.createElement('button'); db.className = 'dev-mini-btn'; db.textContent = '✕'; db.onclick = () => { if (dev.isLeader) STATE.devices[0].isLeader = true; STATE.devices = STATE.devices.filter(x => x.id !== dev.id); setPetVisual('awake', 'normal'); renderNodesList(); syncDevicesToD1(); saveState(); }; btns.appendChild(db);
    }
    if (btns.children.length) card.appendChild(btns); box.appendChild(card);
  });

  const makeStatusCard = (name, tag, subTxt, color) => {
    const c = document.createElement('div'); c.className = 'dev-card';
    const h = document.createElement('div'); h.className = 'dev-head';
    const s = document.createElement('strong'); s.textContent = name;
    const r = document.createElement('span'); r.className = 'dev-role role-vault'; r.textContent = tag;
    h.appendChild(s); h.appendChild(r); c.appendChild(h);
    const sub = document.createElement('div'); sub.style.color = color; sub.style.fontSize = '9.5px'; sub.textContent = subTxt;
    c.appendChild(sub); box.appendChild(c);
  };
  if (STATE.workerUrl && STATE.d1Online) makeStatusCard('Cloudflare D1 Vault', 'VAULT', STATE.workerUrl + ' ✓', 'var(--accent)');
  if (hasMod('github')) makeStatusCard('GitHub Deploy Module', 'GIT', (STATE.ghModuleUrl || STATE.vault?.ghUrl || 'Via D1 Proxy') + ' ✓', 'var(--warn)');
}

function loadPreset(name) {
  document.querySelectorAll('.preset-chip').forEach(c => c.classList.toggle('active', c.dataset.preset === name));
  if (name === 'vibecode') {
    STATE.modNodes = [
      { id: 'm1', provider: 'aistudio', title: '1. Контракт', model: STATE.catalog.aistudio.fast, key: '', prompt: 'Сформулируй 3 критерия приёмки (без кода).', lastOutput: '', x: 14, y: 100, ms: '150 ms', status: 'idle' },
      { id: 'm2', provider: 'groq', title: '2. Кодер', model: STATE.catalog.groq.smart, key: '', prompt: 'Напиши готовый код строго по контракту.', lastOutput: '', x: 205, y: 100, ms: '240 ms', status: 'idle' },
      { id: 'm3', provider: 'verifier', title: '3. Verifier Sandbox', model: 'browser-sandbox-v1', key: '', prompt: 'Автопроверка.', lastOutput: '', x: 400, y: 100, ms: '5 ms', status: 'idle' }
    ];
    STATE.modEdges = [{ from: 'm1', to: 'm2', state: 'idle' }, { from: 'm2', to: 'm3', state: 'idle' }];
  } else if (name === 'chain') {
    STATE.modNodes = [{ id: 'm1', provider: 'groq', title: '1. Groq', model: STATE.catalog.groq.fast, key: '', prompt: 'Черновик.', lastOutput: '', x: 16, y: 100, ms: '130 ms', status: 'idle' }, { id: 'm2', provider: 'critic', title: '2. Критик', model: STATE.catalog.aistudio.fast, key: '', prompt: 'Ошибки.', lastOutput: '', x: 215, y: 100, ms: '180 ms', status: 'idle' }, { id: 'm3', provider: 'openai', title: '3. Финал OR', model: STATE.catalog.openai.smart, key: '', prompt: 'Итог.', lastOutput: '', x: 415, y: 100, ms: '420 ms', status: 'idle' }];
    STATE.modEdges = [{ from: 'm1', to: 'm2', state: 'idle' }, { from: 'm2', to: 'm3', state: 'idle' }];
  } else if (name === 'fast') {
    STATE.modNodes = [{ id: 'm1', provider: 'aistudio', title: 'Auto Flash-Lite', model: STATE.catalog.aistudio.fast, key: '', prompt: 'Ответь точно.', lastOutput: '', x: 190, y: 100, ms: '210 ms', status: 'idle' }]; STATE.modEdges = [];
  } else {
    STATE.modNodes = [{ id: 'm1', provider: 'groq', title: 'Groq (Auto)', model: STATE.catalog.groq.smart, key: '', prompt: 'Глубокий разбор.', lastOutput: '', x: 16, y: 35, ms: '140 ms', status: 'idle' }, { id: 'm2', provider: 'aistudio', title: 'Auto Flash-Lite', model: STATE.catalog.aistudio.fast, key: '', prompt: 'Системный взгляд.', lastOutput: '', x: 16, y: 165, ms: '210 ms', status: 'idle' }, { id: 'm3', provider: 'critic', title: 'Cross-Audit Критик', model: STATE.catalog.aistudio.fast, key: '', prompt: 'Сверь черновики.', lastOutput: '', x: 220, y: 100, ms: '190 ms', status: 'idle' }];
    STATE.modEdges = [{ from: 'm1', to: 'm3', state: 'idle' }, { from: 'm2', to: 'm3', state: 'idle' }];
  }
  STATE.selectedModId = STATE.modNodes[0]?.id || null; renderModGraph(); syncInspector(); saveState();
}

function wouldCreateCycle(fromId, toId) { if (fromId === toId) return true; const seen = new Set([toId]), q = [toId]; while (q.length) { const c = q.shift(); if (c === fromId) return true; STATE.modEdges.forEach(e => { if (e.from === c && !seen.has(e.to)) { seen.add(e.to); q.push(e.to); } }); } return false; }
function getWaves() {
  const deg = new Map(), adj = new Map(); STATE.modNodes.forEach(n => { deg.set(n.id, 0); adj.set(n.id, []); });
  STATE.modEdges.forEach(e => { if (deg.has(e.to) && adj.has(e.from)) { deg.set(e.to, deg.get(e.to) + 1); adj.get(e.from).push(e.to); } });
  let cur = STATE.modNodes.filter(n => deg.get(n.id) === 0).map(n => n.id); const waves = [];
  while (cur.length) { waves.push(cur.map(id => STATE.modNodes.find(n => n.id === id)).filter(Boolean)); const next = []; cur.forEach(id => adj.get(id).forEach(nb => { deg.set(nb, deg.get(nb) - 1); if (deg.get(nb) === 0) next.push(nb); })); cur = next; }
  return waves;
}

function renderModGraph() {
  const c = $('graphCanvas'); if (!c) return; c.querySelectorAll('.ai-node').forEach(el => el.remove()); RT.nodeEls.clear();
  STATE.modNodes.forEach(node => {
    const card = document.createElement('div'); card.className = 'ai-node' + (node.id === STATE.selectedModId ? ' selected' : '') + (node.status === 'running' ? ' running' : '') + (node.status === 'done' ? ' done' : '') + (node.status === 'error' ? ' error' : '');
    card.style.left = node.x + 'px'; card.style.top = node.y + 'px';
    card.innerHTML = '<div class="node-port port-in" data-node="' + node.id + '"></div><div class="ai-node-head"><span class="ai-node-provider prov-' + node.provider + '">' + node.provider.toUpperCase() + '</span><span>' + node.ms + '</span></div><div class="ai-node-title">' + node.title + '</div><div class="ai-node-model">' + node.model + '</div><div class="node-port port-out" data-node="' + node.id + '"></div>';
    card.addEventListener('pointerdown', e => { if (e.target.classList.contains('node-port')) return; e.preventDefault(); STATE.selectedModId = node.id; RT.dragModId = node.id; RT.dragEl = card; const r = c.getBoundingClientRect(); RT.dragOffset = { x: e.clientX - r.left - node.x, y: e.clientY - r.top - node.y }; c.querySelectorAll('.ai-node').forEach(el => el.classList.remove('selected')); card.classList.add('selected'); syncInspector(); });
    card.querySelector('.port-out').addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); RT.wiringFromId = node.id; const r = c.getBoundingClientRect(); RT.tempPos = { x: e.clientX - r.left, y: e.clientY - r.top }; });
    RT.nodeEls.set(node.id, card); c.appendChild(card);
  });
  renderWires();
}
function renderWires() {
  const svg = $('wireSvg'); if (!svg) return; svg.innerHTML = '';
  STATE.modEdges.forEach((edge, i) => {
    const a = STATE.modNodes.find(n => n.id === edge.from), b = STATE.modNodes.find(n => n.id === edge.to); if (!a || !b) return;
    const x1 = a.x + 160, y1 = a.y + 30, x2 = b.x, y2 = b.y + 30, dx = Math.max(35, Math.abs(x2 - x1) * 0.45), p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + dx) + ' ' + y1 + ', ' + (x2 - dx) + ' ' + y2 + ', ' + x2 + ' ' + y2); p.setAttribute('class', 'wire-edge' + (edge.state === 'active' ? ' active-flow' : '') + (edge.state === 'done' ? ' done-flow' : '')); p.onclick = () => { STATE.modEdges.splice(i, 1); renderWires(); saveState(); }; svg.appendChild(p);
  });
  if (RT.wiringFromId && RT.tempPos) { const a = STATE.modNodes.find(n => n.id === RT.wiringFromId); if (a) { const x1 = a.x + 160, y1 = a.y + 30, x2 = RT.tempPos.x, y2 = RT.tempPos.y, dx = Math.max(35, Math.abs(x2 - x1) * 0.45), p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + dx) + ' ' + y1 + ', ' + (x2 - dx) + ' ' + y2 + ', ' + x2 + ' ' + y2); p.setAttribute('class', 'wire-temp'); svg.appendChild(p); } }
}
window.addEventListener('pointermove', e => {
  if (RT.dragModId && RT.dragEl) { const n = STATE.modNodes.find(x => x.id === RT.dragModId), r = $('graphCanvas').getBoundingClientRect(); if (n) { n.x = Math.max(4, Math.min(r.width - 165, e.clientX - r.left - RT.dragOffset.x)); n.y = Math.max(4, Math.min(r.height - 68, e.clientY - r.top - RT.dragOffset.y)); RT.dragEl.style.left = n.x + 'px'; RT.dragEl.style.top = n.y + 'px'; renderWires(); } }
  else if (RT.wiringFromId) { const r = $('graphCanvas').getBoundingClientRect(); RT.tempPos = { x: e.clientX - r.left, y: e.clientY - r.top }; renderWires(); }
});
window.addEventListener('pointerup', e => {
  if (RT.dragModId) { RT.dragModId = null; RT.dragEl = null; saveState(); }
  if (RT.wiringFromId) { const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.port-in'); if (target) { const toId = target.dataset.node, fromId = RT.wiringFromId; if (wouldCreateCycle(fromId, toId)) { $('graphCanvas').classList.add('cycle-warn'); setTimeout(() => $('graphCanvas').classList.remove('cycle-warn'), 600); setPetVisual('awake', 'shock'); } else if (!STATE.modEdges.some(x => x.from === fromId && x.to === toId)) { STATE.modEdges.push({ from: fromId, to: toId, state: 'idle' }); saveState(); } } RT.wiringFromId = null; RT.tempPos = null; renderWires(); }
});

function syncInspector() {
  const n = STATE.modNodes.find(x => x.id === STATE.selectedModId); if (!n) return;
  $('inspProviderTag').textContent = n.provider.toUpperCase(); $('inspTitle').value = n.title; $('inspProvider').value = n.provider;
  const catEntry = STATE.catalog[n.provider] || STATE.catalog.aistudio, ms = [...new Set([...(catEntry.list || []), n.model])];
  const sel = $('inspModel'); sel.innerHTML = '';
  ms.forEach(m => { const opt = document.createElement('option'); opt.value = m; opt.textContent = m; opt.selected = (m === n.model); sel.appendChild(opt); });
  $('inspKey').value = n.key || ''; $('inspPrompt').value = n.prompt || ''; $('inspOutput').textContent = n.lastOutput || 'Нет вывода.';
}

async function runProDag(query) {
  if (RT.busy) return; RT.busy = true; setPetVisual('booting', 'focus'); $('proRouteLabel').textContent = 'RUNNING';
  const waves = getWaves(); STATE.modNodes.forEach(n => n.status = 'idle'); STATE.modEdges.forEach(e => e.state = 'idle'); renderModGraph(); let finalTxt = '';
  for (let w = 0; w < waves.length; w++) {
    const wave = waves[w], ids = new Set(wave.map(n => n.id)); wave.forEach(n => n.status = 'running'); STATE.modEdges.forEach(e => { if (ids.has(e.to)) e.state = 'active'; }); renderModGraph();
    await Promise.all(wave.map(async node => {
      const parents = STATE.modEdges.filter(e => e.to === node.id).map(e => STATE.modNodes.find(x => x.id === e.from)).filter(Boolean);
      const ctx = parents.map(p => '[' + p.title + ']: ' + p.lastOutput).join(NL + NL), prompt = ctx ? ('Запрос: ' + query + NL + NL + 'Входы:' + NL + ctx) : query;
      const sys = buildUnifiedSystemPrompt(node.prompt), k = isRealKey(node.key) ? node.key : (node.provider === 'groq' ? STATE.groqKey : (node.provider === 'openai' ? STATE.orKey : STATE.apiKey)), t0 = performance.now();
      try {
        if (node.provider === 'verifier') {
          const rawCode = extractCodeBlock(parents[parents.length - 1]?.lastOutput || ''), lang = detectVibeLanguage(query, '');
          const v = await deterministicVerify(rawCode, lang, true);
          node.lastOutput = (v.ok ? '✓ VERIFIER PASS' : '✗ VERIFIER FAIL') + ' [' + lang.toUpperCase() + '] (' + v.checks.join(', ') + ')' + (v.errors.length ? (NL + 'Ошибки: ' + v.errors.join('; ')) : '') + NL + NL + rawCode;
        } else if (STATE.workerUrl && STATE.d1Online && !isRealKey(node.key)) {
          const r = await fetch(STATE.workerUrl + '/api/chat', { method: 'POST', headers: workerHeaders(), body: JSON.stringify({ text: prompt, systemPrompt: sys, mode: 'pro', skipHistory: true }) });
          if (!r.ok) throw new Error('Worker HTTP ' + r.status);
          const d = await r.json(); node.lastOutput = d.reply || '';
        } else if (isRealKey(k)) {
          if (node.provider === 'groq') node.lastOutput = await callOpenAICompat('https://api.groq.com/openai/v1/chat/completions', k, node.model, sys, prompt);
          else if (node.provider === 'openai') node.lastOutput = await callOpenAICompat(node.model.includes('/') ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions', k, node.model, sys, prompt);
          else node.lastOutput = await callGeminiDirect(k, node.model, sys, prompt);
        } else { await new Promise(r => setTimeout(r, 340)); node.lastOutput = '[' + node.title + ' SIM]: Готово для «' + query + '».'; }
        node.ms = Math.round(performance.now() - t0) + ' ms'; node.status = 'done'; finalTxt = node.lastOutput;
      } catch (err) { node.status = 'error'; node.lastOutput = 'ERR: ' + err.message; }
    }));
    STATE.modEdges.forEach(e => { if (ids.has(e.to)) e.state = 'done'; }); renderModGraph(); syncInspector();
  }
  RT.busy = false; $('proRouteLabel').textContent = 'DONE';
  const { cleanText, mood } = parseReplyTags(finalTxt || '[MOOD:smug] Конвейер завершён.');
  setPetVisual('awake', mood); $('proSpeechBox').textContent = cleanText;
}
