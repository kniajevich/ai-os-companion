// AI OS Companion — UI Bindings, Game Mode, Vault Actions & Boot
function applyThemeAndMode() {
  document.body.className = 'ui-' + STATE.ui + ' theme-' + STATE.skin + ' app-mode-' + STATE.appMode + ' mood-' + STATE.mood;
  $('btnModeGame').classList.toggle('active', STATE.appMode === 'game');
  $('btnModePro').classList.toggle('active', STATE.appMode === 'pro');
  $('btnSoundToggle').textContent = STATE.soundOn ? '🔊' : '🔇';
  $('topSubLabel').textContent = STATE.appMode === 'game' ? ('GAME Mode • ' + STATE.catalog.aistudio.fast) : 'PRO Mode • D1 Vault, DAG и Спутники';
  const pet = $('pet'); if (STATE.appMode === 'game') $('gameAvatarSlot').appendChild(pet); else { $('proAvatarSlot').appendChild(pet); setTimeout(renderWires, 30); }
  const live = hasMod('gemini') || hasMod('groq') || Boolean(STATE.workerUrl);
  $('brainBadge').textContent = STATE.d1Online ? ('D1 + ' + STATE.catalog.aistudio.fast) : (live ? ('AUTO // ' + STATE.catalog.aistudio.fast) : 'DEMO');
  $('brainBadge').className = 'badge ' + (live ? 'online' : 'warn');
  syncProDeckStatus(); renderNodesList(); renderSkillsLists();
}

async function playModuleInstallAnim(title, commentText) {
  const pet = $('pet'); setPetVisual('booting', 'focus'); playTone(440, 0.1);
  pet.classList.remove('anim-burst'); void pet.offsetWidth; pet.classList.add('anim-burst');
  await new Promise(r => setTimeout(r, 750)); addXP(25); setPetVisual('awake', 'smug');
  STATE.chat.push({ id: Date.now(), role: 'ai', provider: 'upgrade', model: title, mood: 'smug', text: commentText });
  $('proSpeechBox').textContent = commentText; toast(title + ' подключён ✓'); renderGameChat(); saveState();
  setTimeout(() => pet.classList.remove('anim-burst'), 400);
}

async function activateGeminiKey(k) {
  const clean = k.trim(); if (!isRealKey(clean)) { toast('Нужен ключ AIza...', 'warn'); return; }
  STATE.apiKey = clean;
  if (await saveToVaultAndRefresh({ geminiKey: clean }, 'AI Studio', 'Подключен свежий ' + STATE.catalog.aistudio.fast)) return;
  await discoverGeminiClient(clean).catch(e => toast(e.message, 'err'));
  if (isRealKey(STATE.groqKey)) await discoverGroqClient(STATE.groqKey).catch(() => {});
  syncNodesToFreshCatalog(); applyThemeAndMode(); renderModGraph(); syncInspector();
  await playModuleInstallAnim('AI Studio', 'Подключен свежий ' + STATE.catalog.aistudio.fast + '! (+25 XP)');
}
async function activateGroqKey(k) {
  const clean = k.trim(); if (!isRealKey(clean)) { toast('Нужен ключ gsk_...', 'warn'); return; }
  STATE.groqKey = clean;
  if (await saveToVaultAndRefresh({ groqKey: clean }, 'Groq LPU', 'Турбина Groq подключена')) return;
  const res = await discoverGroqClient(clean);
  syncNodesToFreshCatalog(); applyThemeAndMode(); renderModGraph(); syncInspector();
  if (res && res.corsBlocked) await playModuleInstallAnim('Groq Key Saved', 'Ключ Groq сохранён (подключи D1 Сейф для обхода CORS)! (+25 XP)');
  else if (res) await playModuleInstallAnim('Groq LPU', 'Турбина Groq подключена: ' + res.fast + ' / ' + res.smart + ' (+25 XP)');
}
async function activateOrKey(k) {
  const clean = k.trim(); if (!isRealKey(clean)) { toast('Нужен ключ sk-or-...', 'warn'); return; }
  STATE.orKey = clean;
  if (await saveToVaultAndRefresh({ openRouterKey: clean }, 'OpenRouter Free', 'Критик OpenRouter пристёгнут')) return;
  await discoverOpenRouterClient(clean); syncNodesToFreshCatalog(); applyThemeAndMode(); renderModGraph(); syncInspector();
  await playModuleInstallAnim('OpenRouter Free', 'Критик OpenRouter пристёгнут! (+25 XP)');
}
async function connectGithubModule(url, pin = '') {
  const clean = normalizeOrigin(url); if (!clean.startsWith('http')) { toast('Нужен URL GitHub модуля', 'warn'); return; }
  if (pin !== undefined) STATE.ghModulePin = pin.trim(); $('proStGh').textContent = 'ПРОВЕРКА...'; $('gmStGh').textContent = 'ПРОВЕРКА...';
  if (STATE.workerUrl && STATE.d1Online) {
    if (await saveToVaultAndRefresh({ ghUrl: clean, ghPin: STATE.ghModulePin }, 'GitHub Deploy', 'GitHub Deploy подключён через Сейф D1')) return;
    STATE.ghOnline = false; syncProDeckStatus(); return;
  }
  try {
    const r = await fetch(clean + '/api/health', { headers: ghHeaders() }); if (r.status === 401) throw new Error('Неверный MODULE_PIN (401)'); if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json(); if (!d.ok || !d.hasToken) throw new Error('Нет GITHUB_TOKEN');
    STATE.ghModuleUrl = clean; STATE.ghOnline = true; applyThemeAndMode(); renderNodesList();
    await playModuleInstallAnim('GitHub Deploy', '🐙 GitHub Deploy подключён (' + d.owner + ')! (+25 XP)');
  } catch (err) { STATE.ghOnline = false; syncProDeckStatus(); toast('Ошибка GitHub: ' + err.message, 'err'); }
}

function renderGameStage() {
  $('gameEggBox').style.display = STATE.stage === 'egg' ? 'flex' : 'none';
  $('gameAvatarSlot').style.display = STATE.stage !== 'egg' ? 'flex' : 'none';
  $('gameNamingBox').style.display = STATE.stage === 'naming' ? 'flex' : 'none';
  $('gameSparkBox').style.display = STATE.stage === 'spark' ? 'flex' : 'none';
  $('gamePlayBox').style.display = STATE.stage === 'active' ? 'flex' : 'none';
  $('hudPetName').textContent = STATE.stage === 'egg' ? '🥚 Яйцо' : ('✨ ' + STATE.name);
  if (STATE.stage === 'naming') setPetVisual('awake', 'smug'); else if (STATE.stage === 'spark') setPetVisual('booting', 'focus'); else if (STATE.stage === 'active') setPetVisual('awake', STATE.mood); else setPetVisual('off', 'normal');
  addXP(0); renderGameChat(); renderMemoryDrawer(); renderSkillsLists(); syncProDeckStatus();
}
function renderGameChat() {
  const box = $('gameChatList'); if (!box) return; box.innerHTML = '';
  STATE.chat.slice(-14).forEach(msg => {
    const div = document.createElement('div'); div.className = 'msg-bubble ' + (msg.role === 'user' ? 'msg-user' : 'msg-ai');
    const txt = document.createElement('div'); txt.textContent = msg.text; div.appendChild(txt);
    if (msg.role === 'ai') {
      const meta = document.createElement('div'); meta.className = 'msg-meta';
      const lbl = document.createElement('span'); lbl.textContent = msg.model + ' • ' + msg.mood; meta.appendChild(lbl);
      const bad = document.createElement('button'); bad.className = 'msg-bad-btn'; bad.textContent = '👎 Ошибка';
      bad.onclick = () => {
        const rule = prompt('Чему научить ' + STATE.name + '?', 'Быть точнее');
        if (rule) { STATE.lessons.unshift({ id: Date.now(), mistake: msg.text.slice(0, 60), rule }); if (STATE.workerUrl && STATE.d1Online) fetch(STATE.workerUrl + '/api/lesson', { method: 'POST', headers: workerHeaders(), body: JSON.stringify({ mistake: msg.text.slice(0, 60), rule }) }).catch(() => {}); setPetVisual('awake', 'shock'); renderMemoryDrawer(); saveState(); }
      };
      meta.appendChild(bad); div.appendChild(meta);
    }
    box.appendChild(div);
  });
  box.scrollTop = box.scrollHeight;
}
function renderMemoryDrawer() {
  const box = $('gameMemoryList'); if (!box) return; box.innerHTML = '';
  const all = [...STATE.facts.map(f => ({ type: 'Факт', text: f.text, list: 'facts', id: f.id })), ...STATE.summaries.map(s => ({ type: 'Сон', text: s.text, list: 'summaries', id: s.id })), ...STATE.lessons.map(l => ({ type: 'Урок', text: l.rule, list: 'lessons', id: l.id }))];
  $('btnHudMem').textContent = '🧠 ' + all.length;
  if (all.length === 0) { const e = document.createElement('div'); e.style.color = 'var(--muted)'; e.style.fontSize = '11.5px'; e.textContent = 'Память пока пуста.'; box.appendChild(e); return; }
  all.forEach(item => {
    const row = document.createElement('div'); row.className = 'mem-item';
    const sp = document.createElement('span'); const st = document.createElement('strong'); st.textContent = '[' + item.type + '] '; sp.appendChild(st); sp.appendChild(document.createTextNode(item.text)); row.appendChild(sp);
    const del = document.createElement('button'); del.className = 'msg-bad-btn'; del.textContent = '✕';
    del.onclick = () => { STATE[item.list] = STATE[item.list].filter(x => x.id !== item.id); if (item.list === 'facts' && STATE.workerUrl && STATE.d1Online) fetch(STATE.workerUrl + '/api/fact/' + item.id, { method: 'DELETE', headers: workerHeaders() }).catch(() => {}); renderMemoryDrawer(); saveState(); };
    row.appendChild(del); box.appendChild(row);
  });
}
function toggleGameDrawer(name) {
  const target = 'drawer' + name[0].toUpperCase() + name.slice(1), el = $(target); if (!el) return;
  const wasOpen = el.classList.contains('open');
  document.querySelectorAll('.game-drawer').forEach(d => d.classList.remove('open')); document.querySelectorAll('.g-act-btn').forEach(b => b.classList.remove('active'));
  if (!wasOpen) { el.classList.add('open'); const b = document.querySelector('.g-act-btn[data-drawer="' + name + '"]'); if (b) b.classList.add('active'); }
}

/* EVENT BINDINGS */
$('btnHudMem').onclick = () => { if (STATE.stage === 'active') toggleGameDrawer('memory'); };
$('btnHudSkills').onclick = () => { if (STATE.stage === 'active') toggleGameDrawer('skills'); };
document.querySelectorAll('.g-act-btn[data-drawer]').forEach(btn => btn.addEventListener('click', () => toggleGameDrawer(btn.dataset.drawer)));
$('btnEggLoginD1').onclick = () => $('btnOpenSettings').click();
$('gameEggBox').addEventListener('click', e => {
  if (e.target.id === 'btnEggLoginD1') return;
  STATE.eggTaps += 1; playTone(320 + STATE.eggTaps * 90, 0.08);
  const egg = $('eggSvg'); egg.classList.remove('egg-shake'); void egg.offsetWidth; egg.classList.add('egg-shake');
  egg.classList.toggle('egg-cracks-1', STATE.eggTaps >= 1); egg.classList.toggle('egg-cracks-2', STATE.eggTaps >= 2);
  $('eggTapHint').textContent = 'Нажатий: ' + STATE.eggTaps + ' / 3'; if (STATE.eggTaps >= 3) { STATE.stage = 'naming'; addXP(10); renderGameStage(); } saveState();
});
document.querySelectorAll('[data-gskin]').forEach(btn => btn.addEventListener('click', () => { STATE.skin = btn.dataset.gskin; document.querySelectorAll('[data-gskin]').forEach(b => b.classList.remove('active')); btn.classList.add('active'); applyThemeAndMode(); setPetVisual('awake', 'smug'); saveState(); }));
$('btnConfirmName').addEventListener('click', () => { STATE.name = $('gameNameInput').value.trim() || 'Спарки'; STATE.stage = hasMod('gemini') ? 'active' : 'spark'; addXP(15); renderGameStage(); if (STATE.stage === 'active') askPetBrain('Меня только что назвали ' + STATE.name + '. Поздоровайся!'); saveState(); });
$('btnOpenAiStudio').addEventListener('click', () => window.open('https://aistudio.google.com/apikey', '_blank', 'noopener'));
$('btnIgniteSpark').addEventListener('click', async () => { const k = $('gameKeyInput').value.trim(); if (!k) { toast('Вставь ключ AIza...', 'warn'); return; } STATE.apiKey = k; try { await discoverGeminiClient(k); } catch (_) {} syncNodesToFreshCatalog(); STATE.stage = 'active'; applyThemeAndMode(); renderGameStage(); askPetBrain('Искра зажжена! Выбран ' + STATE.catalog.aistudio.fast + '. Поздоровайся как ' + STATE.name + '!'); saveState(); });
$('btnDemoSpark').addEventListener('click', () => { STATE.stage = 'active'; STATE.chat.push({ id: Date.now(), role: 'ai', provider: 'demo', model: 'demo-sim', mood: 'smug', text: 'Привет! Я ' + STATE.name + '! Загляни в «💻 Вайбкодинг» или «🧩 Модули»!' }); renderGameStage(); saveState(); });

async function sendGameMessage(text, img = null) { if (!text && !img) return; STATE.chat.push({ id: Date.now(), role: 'user', text: text || '[Фото]' }); renderGameChat(); await askPetBrain(text || 'Что на этом фото?', img); }
$('btnGameSend').addEventListener('click', () => { const v = $('gameChatInput').value.trim(); if (!v) return; $('gameChatInput').value = ''; sendGameMessage(v); });
$('gameChatInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnGameSend').click(); });
$('btnSaveFact').addEventListener('click', () => { const txt = $('feedFactInput').value.trim(); if (!txt) return; STATE.facts.unshift({ id: Date.now(), text: txt, weight: 8 }); $('feedFactInput').value = ''; if (STATE.workerUrl && STATE.d1Online) fetch(STATE.workerUrl + '/api/fact', { method: 'POST', headers: workerHeaders(), body: JSON.stringify({ text: txt }) }).catch(() => {}); addXP(15); setPetVisual('awake', 'smug'); STATE.chat.push({ id: Date.now(), role: 'ai', provider: 'memory', model: STATE.d1Online ? 'Cloudflare D1' : 'Local Mem', mood: 'smug', text: 'Ням! Запомнил: «' + txt + '» (+15 XP)' }); renderGameChat(); renderMemoryDrawer(); saveState(); });
document.querySelectorAll('input[type=range][data-trait]').forEach(sl => { sl.value = STATE.traits[sl.dataset.trait]; $('val-' + sl.dataset.trait).textContent = sl.value; sl.addEventListener('input', () => { STATE.traits[sl.dataset.trait] = Number(sl.value); $('val-' + sl.dataset.trait).textContent = sl.value; saveState(); if (STATE.workerUrl && STATE.d1Online) fetch(STATE.workerUrl + '/api/profile', { method: 'POST', headers: workerHeaders(), body: JSON.stringify({ traits: STATE.traits }) }).catch(() => {}); }); });
$('btnGameSleep').addEventListener('click', async () => {
  if (STATE.chat.length < 2) { toast('Сначала пообщайтесь немного!', 'warn'); return; }
  setPetVisual('off', 'normal'); let summaryText = 'Сон: обсуждали «' + STATE.chat.slice(-4).map(c => c.text).join(' | ').slice(0, 150) + '...»';
  if (STATE.workerUrl && STATE.d1Online) { try { const r = await fetch(STATE.workerUrl + '/api/sleep', { method: 'POST', headers: workerHeaders() }); if (r.ok) { const d = await r.json(); if (d.summary) summaryText = d.summary; } } catch (_) {} }
  else if (isRealKey(STATE.apiKey)) { try { summaryText = await callGeminiDirect(STATE.apiKey, STATE.catalog.aistudio.fast, 'Сожми диалог в 1-2 факта памяти.', STATE.chat.map(c => c.role + ': ' + c.text).join(NL)); } catch (_) {} }
  STATE.summaries.unshift({ id: Date.now(), text: summaryText.trim() }); STATE.chat = [{ id: Date.now(), role: 'ai', provider: 'sleep', model: STATE.catalog.aistudio.fast, mood: 'smug', text: '💤 Выспался! Сжал диалог в сон-память (+20 XP).' }]; addXP(20); setPetVisual('awake', 'smug'); renderGameChat(); renderMemoryDrawer(); saveState();
});
$('btnGameDuel').addEventListener('click', async () => { const q = prompt('О чём спросить в режиме Спор ИИ?', 'Как улучшить наш проект?'); if (!q) return; STATE.chat.push({ id: Date.now(), role: 'user', text: '⚔️ Спор ИИ: ' + q }); renderGameChat(); await askPetBrain(q, null, 'duel'); addXP(20); });
$('btnGamePhoto').addEventListener('click', () => $('gamePhotoInput').click());
$('gamePhotoInput').addEventListener('change', e => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => sendGameMessage('Посмотри на это фото и скажи, что видишь!', { mime: file.type || 'image/jpeg', base64: String(reader.result || '').replace(/^data:[^;]+;base64,/, '') }); reader.readAsDataURL(file); });
$('btnGameVoice').addEventListener('click', () => { const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) { toast('Используй голосовой ввод на клавиатуре смартфона', 'warn'); return; } if (RT.rec) { RT.rec.stop(); return; } RT.rec = new SR(); RT.rec.lang = 'ru-RU'; $('btnGameVoice').classList.add('rec'); RT.rec.onresult = e => sendGameMessage(e.results[0][0].transcript); RT.rec.onend = () => { $('btnGameVoice').classList.remove('rec'); RT.rec = null; }; RT.rec.start(); });

/* VIBE & GITHUB MODULE BINDINGS */
$('btnToggleNewRepo').onclick = () => $('newRepoBox').classList.toggle('open');
$('btnCreateNewRepo').onclick = async () => {
  if (!hasMod('github')) { toast('Подключи 🐙 GitHub Deploy', 'warn'); return; }
  const name = $('newRepoNameIn').value.trim(), isPrivate = $('newRepoVisIn').value === 'true'; if (!name) { toast('Введи имя репо', 'warn'); return; }
  try {
    const d = await ghCall('/repo/create', 'POST', { name, isPrivate, description: 'Created from AI OS Companion' });
    $('vibeRepoIn').value = d.name; $('newRepoNameIn').value = ''; $('newRepoBox').classList.remove('open'); toast((d.created ? 'Создан: ' : 'Готов: ') + d.name);
  } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
};
$('btnVibePull').onclick = async () => {
  if (!hasMod('github')) { toast('Подключи 🐙 GitHub Deploy', 'warn'); return; }
  const repo = $('vibeRepoIn').value.trim(), path = $('vibePathIn').value.trim(); if (!repo || !path) { toast('Укажи репо и файл', 'warn'); return; }
  try {
    const d = await ghCall('/file?repo=' + encodeURIComponent(repo) + '&path=' + encodeURIComponent(path), 'GET');
    RT.vibePulledContent = d.content || ''; $('vibeResultBox').style.display = 'flex'; $('vibeVerdict').className = 'vibe-verdict ok';
    $('vibeVerdict').textContent = '📥 Загружен ' + path + ' (' + RT.vibePulledContent.length + ' симв.)'; $('vibeCodeOut').textContent = RT.vibePulledContent.slice(0, 1200);
  } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
};
$('btnAutoForge').onclick = () => runAutonomousSkillForge('');
$('btnVibeRun').onclick = () => { const t = $('vibeTaskIn').value.trim(); if (!t) { toast('Опиши задачу', 'warn'); return; } runVibeCodingLoop(t, $('vibeLangIn').value, RT.vibePulledContent); };
$('btnVibeCopy').onclick = () => { navigator.clipboard?.writeText(RT.vibeLastCode); toast('Код скопирован ✓'); };
$('btnVibeJson').onclick = () => { const path = $('vibePathIn').value.trim() || 'widget.html'; navigator.clipboard?.writeText(JSON.stringify([{ path, content: RT.vibeLastCode }], null, 2)); toast('JSON для Scaffold скопирован ✓'); };
$('btnVibePush').onclick = () => {
  if (!RT.vibeLastVerified || !RT.vibeLastCode) return;
  const repo = $('vibeRepoIn').value.trim() || 'ai-os-companion', path = $('vibePathIn').value.trim() || 'vibe_output.txt';
  RT.pendingGate = { type: 'commit', repo, path, content: RT.vibeLastCode };
  $('ghGateMeta').textContent = 'Repo: ' + repo + ' | File: ' + path + ' | Verified ✓'; $('ghCommitMsg').value = 'feat: vibe-code ' + path;
  $('ghGatePreview').textContent = RT.vibeLastCode.slice(0, 800); $('ghGateModal').classList.add('open');
};
$('btnGhGateCancel').onclick = () => { $('ghGateModal').classList.remove('open'); RT.pendingGate = null; };
$('btnGhGateConfirm').onclick = async () => {
  const g = RT.pendingGate; if (!g) return; $('ghGateModal').classList.remove('open');
  try {
    if (g.type === 'forge') {
      toast('1/3 Создаю репо ' + g.repo + '...');
      await ghCall('/repo/create', 'POST', { name: g.repo, isPrivate: g.isPrivate, description: g.plan.description });
      toast('2/3 Пушу skill.js и README...');
      const readme = '# ' + g.plan.skillName + NL + NL + g.plan.description + NL + NL + 'Создано агентом ' + STATE.name + '.';
      const cmd = await ghCall('/commit', 'POST', { repo: g.repo, message: $('ghCommitMsg').value.trim(), files: [{ path: 'skill.js', content: g.content }, { path: 'README.md', content: readme }] });
      const sk = { id: g.plan.skillId, name: g.plan.skillName, description: g.plan.description, repo: g.repo, path: 'skill.js', code: g.content, enabled: true, sampleInput: g.plan.sampleInput || {} };
      STATE.skills = [sk, ...STATE.skills.filter(x => x.id !== sk.id)];
      if (STATE.workerUrl && STATE.d1Online) fetch(STATE.workerUrl + '/api/skill', { method: 'POST', headers: workerHeaders(), body: JSON.stringify(sk) }).catch(() => {});
      renderSkillsLists(); toast('3/3 Прогоняю самотест...');
      const tr = await executeSkillInSandbox(sk, sk.sampleInput);
      addXP(40); setPetVisual('awake', 'smug');
      STATE.chat.push({ id: Date.now(), role: 'ai', provider: 'forge', model: sk.name, mood: 'smug', text: '🚀 Инструмент «' + sk.name + '» создан (' + cmd.url + '), встроен и протестирован: ' + (tr.ok ? JSON.stringify(tr.result) : tr.err) });
      renderGameChat(); saveState();
    } else {
      const d = await ghCall('/commit', 'POST', { repo: g.repo, message: $('ghCommitMsg').value.trim() || 'feat: push', files: [{ path: g.path, content: g.content }] });
      setPetVisual('awake', 'smug'); addXP(25); toast('Запушено ✓');
      STATE.chat.push({ id: Date.now(), role: 'ai', provider: 'github', model: 'GitHub Push ✓', mood: 'smug', text: '🚀 Запушено в ' + g.repo + '/' + g.path + ': ' + d.url }); renderGameChat();
    }
  } catch (e) { setPetVisual('awake', 'shock'); toast('Ошибка: ' + e.message, 'err'); }
  RT.pendingGate = null;
};

/* PRO, MODULES & DEVICES BINDINGS */
$('proBtnGemini').onclick = () => activateGeminiKey($('proInGemini').value); $('gmBtnGemini').onclick = () => activateGeminiKey($('gmInGemini').value);
$('proBtnGroq').onclick = () => activateGroqKey($('proInGroq').value); $('gmBtnGroq').onclick = () => activateGroqKey($('gmInGroq').value);
$('proBtnOr').onclick = () => activateOrKey($('proInOr').value); $('gmBtnOr').onclick = () => activateOrKey($('gmInOr').value);
$('proBtnD1').onclick = () => connectD1Memory($('proInD1').value, $('proInPin').value); $('gmBtnD1').onclick = () => connectD1Memory($('gmInD1').value, $('gmInPin').value);
$('proBtnGh').onclick = () => connectGithubModule($('proInGhUrl').value, $('proInGhPin').value); $('gmBtnGh').onclick = () => connectGithubModule($('gmInGhUrl').value, $('gmInGhPin').value);
$('btnRefreshCatalog').onclick = async () => { await refreshAllAdaptiveModels(); await playModuleInstallAnim('Auto-Scan', 'Модели обновлены: ' + STATE.catalog.aistudio.fast + ' / ' + STATE.catalog.groq.smart); };

$('inspTitle').oninput = () => { const n = STATE.modNodes.find(x => x.id === STATE.selectedModId); if (n) { n.title = $('inspTitle').value; renderModGraph(); saveState(); } };
$('inspProvider').onchange = () => { const n = STATE.modNodes.find(x => x.id === STATE.selectedModId); if (n) { n.provider = $('inspProvider').value; n.model = (STATE.catalog[n.provider]?.fast || 'openrouter/free'); renderModGraph(); syncInspector(); saveState(); } };
$('inspModel').onchange = () => { const n = STATE.modNodes.find(x => x.id === STATE.selectedModId); if (n) { n.model = $('inspModel').value; renderModGraph(); saveState(); } };
$('inspKey').oninput = () => { const n = STATE.modNodes.find(x => x.id === STATE.selectedModId); if (n) { n.key = $('inspKey').value; saveState(); } };
$('inspPrompt').oninput = () => { const n = STATE.modNodes.find(x => x.id === STATE.selectedModId); if (n) { n.prompt = $('inspPrompt').value; saveState(); } };
$('btnDeleteModNode').onclick = () => { if (STATE.modNodes.length <= 1) return; const id = STATE.selectedModId; STATE.modNodes = STATE.modNodes.filter(n => n.id !== id); STATE.modEdges = STATE.modEdges.filter(e => e.from !== id && e.to !== id); STATE.selectedModId = STATE.modNodes[0]?.id; renderModGraph(); syncInspector(); saveState(); };
document.querySelectorAll('.preset-chip').forEach(b => b.onclick = () => loadPreset(b.dataset.preset));
document.querySelectorAll('.add-node-btn').forEach(b => b.onclick = () => { const p = b.dataset.addType, id = 'm' + Math.floor(100 + Math.random() * 900); STATE.modNodes.push({ id, provider: p, title: p.toUpperCase() + ' Блок', model: STATE.catalog[p]?.fast || 'openrouter/free', key: '', prompt: p === 'verifier' ? 'Автопроверка.' : 'Обработай контекст.', lastOutput: '', x: 35, y: 40, ms: '200 ms', status: 'idle' }); STATE.selectedModId = id; renderModGraph(); syncInspector(); saveState(); });
$('btnProRunGraph').onclick = () => { const v = $('proCmdInput').value.trim() || 'Оцени текущую архитектуру'; $('proCmdInput').value = ''; runProDag(v); };

$('btnToggleAddDev').onclick = () => $('addDevBox').classList.toggle('open');
$('btnCreateDev').onclick = async () => {
  const kind = $('devKindIn').value, petSkin = $('devPetIn').value;
  const name = $('devNameIn').value.trim() || (KIND_LABELS[kind].replace(/^[^ ]+ /, '') + ' #' + STATE.devices.length);
  const id = 'dev-' + Math.floor(100 + Math.random() * 900);
  STATE.devices.push({ id, name, kind, petSkin, addr: $('devAddrIn').value.trim(), isLeader: false });
  STATE.activeCompId = id; $('devNameIn').value = ''; $('devAddrIn').value = ''; $('addDevBox').classList.remove('open');
  renderNodesList(); syncDevicesToD1(); await playModuleInstallAnim(name, 'Новый спутник «' + name + '» (' + PET_LABELS[petSkin] + ') подключён!');
};
$('btnClosePair').onclick = () => $('pairModal').classList.remove('open');
$('btnCopyPair').onclick = () => { navigator.clipboard?.writeText($('pairModalCode').textContent); toast('Скопировано ✓'); };

document.querySelectorAll('.ui-btn').forEach(b => b.onclick = () => { STATE.ui = b.dataset.ui; document.querySelectorAll('.ui-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); applyThemeAndMode(); saveState(); });
document.querySelectorAll('.skin-btn').forEach(b => b.onclick = () => { STATE.skin = b.dataset.skin; document.querySelectorAll('.skin-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); applyThemeAndMode(); setPetVisual('awake', STATE.mood); saveState(); });
document.querySelectorAll('.view-mode-btn').forEach(b => b.onclick = () => { STATE.viewMode = b.dataset.view; document.querySelectorAll('.view-mode-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); $('stageArena').className = 'stage-arena mode-' + STATE.viewMode; setTimeout(renderWires, 25); });
$('btnModeGame').onclick = () => { STATE.appMode = 'game'; applyThemeAndMode(); renderGameStage(); saveState(); };
$('btnModePro').onclick = () => { STATE.appMode = 'pro'; applyThemeAndMode(); renderModGraph(); syncInspector(); saveState(); };
$('btnSoundToggle').onclick = () => { STATE.soundOn = !STATE.soundOn; applyThemeAndMode(); if (STATE.soundOn) playTone(600, 0.08); saveState(); };

$('btnOpenSettings').onclick = () => { $('setGeminiKey').value = STATE.apiKey; $('setGroqKey').value = STATE.groqKey; $('setOrKey').value = STATE.orKey; $('setWorkerUrl').value = STATE.workerUrl; $('setAppPin').value = STATE.appPin; $('setGhUrl').value = STATE.ghModuleUrl; $('setGhPin').value = STATE.ghModulePin; $('settingsModal').classList.add('open'); };
$('btnCloseSettings').onclick = () => $('settingsModal').classList.remove('open');
$('btnSaveSettings').onclick = async () => {
  const newW = normalizeOrigin($('setWorkerUrl').value), newPin = $('setAppPin').value.trim();
  const g = $('setGeminiKey').value.trim(), q = $('setGroqKey').value.trim(), o = $('setOrKey').value.trim();
  const newGh = normalizeOrigin($('setGhUrl').value), newGhPin = $('setGhPin').value.trim();
  $('settingsModal').classList.remove('open');
  if (newW && (newW !== STATE.workerUrl || newPin !== STATE.appPin || !STATE.d1Online)) await connectD1Memory(newW, newPin);
  if (STATE.d1Online && (g || q || o || newGh)) {
    await saveToVaultAndRefresh({ geminiKey: g, groqKey: q, openRouterKey: o, ghUrl: newGh, ghPin: newGhPin }, 'D1 Vault', 'Настройки сохранены в Сейф D1');
  } else {
    if (g) STATE.apiKey = g; if (q) STATE.groqKey = q; if (o) STATE.orKey = o;
    if (newGh) await connectGithubModule(newGh, newGhPin);
    await refreshAllAdaptiveModels(); applyThemeAndMode();
  }
};
$('btnResetAll').onclick = () => { if (!confirm('Сбросить локальное состояние до яйца? (В облаке D1 данные останутся)')) return; try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem('aios_v14_evolving'); localStorage.removeItem('aios_v13_vibe'); } catch (_) {} location.reload(); };

window.addEventListener('pointermove', e => {
  if (STATE.mood !== 'normal' || STATE.stage === 'egg') return; const r = $('pet').getBoundingClientRect(); if (!r.width) return;
  const dx = Math.max(-5, Math.min(5, ((e.clientX - r.left) / r.width - 0.5) * 14)), dy = Math.max(-5, Math.min(5, ((e.clientY - r.top) / r.height - 0.42) * 14));
  $('pupilLeft').setAttribute('transform', 'translate(' + dx.toFixed(1) + ',' + dy.toFixed(1) + ')'); $('pupilRight').setAttribute('transform', 'translate(' + dx.toFixed(1) + ',' + dy.toFixed(1) + ')');
});
setInterval(() => { if (STATE.mood !== 'normal') return; $('pet').classList.add('is-blinking'); setTimeout(() => $('pet').classList.remove('is-blinking'), 130); }, 3500);

loadState();
if (!STATE.modNodes || STATE.modNodes.length === 0) loadPreset('ensemble'); else { renderModGraph(); syncInspector(); }
applyThemeAndMode(); renderGameStage();
if (STATE.workerUrl) { connectD1Memory(STATE.workerUrl, STATE.appPin).catch(() => {}); }
else if (isRealKey(STATE.apiKey) || isRealKey(STATE.groqKey)) { refreshAllAdaptiveModels().catch(() => {}); }
if (!STATE.d1Online && STATE.ghModuleUrl) { connectGithubModule(STATE.ghModuleUrl, STATE.ghModulePin).catch(() => {}); }
addLog('AI OS Companion v15 (Modular Vault Edition) готов.', 'SYS');
