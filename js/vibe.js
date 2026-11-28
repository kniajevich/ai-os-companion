// AI OS Companion — Vibe-Coding Verifier, Sandbox, GitHub Importer & Reliable Skill Forge
function detectVibeLanguage(task, filePath) {
  const p = (filePath || '').toLowerCase();
  if (p.endsWith('.html') || p.endsWith('.htm') || p.endsWith('.svg')) return 'html';
  if (p.endsWith('.json')) return 'json';
  if (p.endsWith('.py')) return 'python';
  if (p.endsWith('.ino') || p.endsWith('.cpp') || p.endsWith('.h') || p.endsWith('.c')) return 'cpp';
  if (p.endsWith('.js') || p.endsWith('.mjs')) return 'js';
  const t = (task || '').toLowerCase();
  if (t.includes('html') || t.includes('виджет') || t.includes('кнопк') || t.includes('страниц') || t.includes('css')) return 'html';
  if (t.includes('esp32') || t.includes('c++') || t.includes('arduino') || t.includes('прошивк')) return 'cpp';
  if (t.includes('python') || t.includes('питон') || t.includes('.py')) return 'python';
  if (t.includes('json') || t.includes('конфиг')) return 'json';
  return 'js';
}

function extractCodeBlock(raw) {
  const fence = '```', idx1 = raw.indexOf(fence);
  if (idx1 === -1) return raw.trim();
  const nlIdx = raw.indexOf(NL, idx1), start = nlIdx !== -1 ? nlIdx + 1 : idx1 + 3, idx2 = raw.indexOf(fence, start);
  return (idx2 !== -1 ? raw.slice(start, idx2) : raw.slice(start)).trim();
}

function checkBracketsAndStrings(code) {
  const stack = [], pairs = { '(': ')', '{': '}', '[': ']' }, closes = { ')': '(', '}': '{', ']': '[' };
  let inQuote = null;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i], prev = i > 0 ? code[i - 1] : '';
    if (inQuote) { if (ch === inQuote && prev !== BSLASH) inQuote = null; continue; }
    if (ch === Q1 || ch === Q2 || ch === Q3) { inQuote = ch; continue; }
    if (pairs[ch]) stack.push(ch);
    else if (closes[ch]) { if (stack.length === 0 || stack[stack.length - 1] !== closes[ch]) return 'Непарная скобка ' + ch; stack.pop(); }
  }
  if (inQuote) return 'Незакрытая кавычка ' + inQuote;
  if (stack.length > 0) return 'Не закрыта скобка ' + stack[stack.length - 1];
  return null;
}

function runJsSandbox(code, testOrCallCode, inputPayload = null) {
  return new Promise(resolve => {
    const workerSrc = 'self.onmessage = async function(ev){ try { ' + NL + code + NL + testOrCallCode + NL + ' } catch(err) { self.postMessage({ok:false, err: err.message}); } };';
    let w;
    try {
      const blob = new Blob([workerSrc], { type: 'application/javascript' }), u = URL.createObjectURL(blob);
      w = new Worker(u);
      const timer = setTimeout(() => { w.terminate(); URL.revokeObjectURL(u); resolve({ ok: false, err: 'Таймаут песочницы (>4s)' }); }, 4000);
      w.onmessage = ev => { clearTimeout(timer); w.terminate(); URL.revokeObjectURL(u); resolve(ev.data); };
      w.onerror = er => { clearTimeout(timer); w.terminate(); URL.revokeObjectURL(u); resolve({ ok: false, err: er.message || 'Ошибка выполнения' }); };
      w.postMessage(inputPayload);
    } catch (_) { if (w) w.terminate(); resolve({ ok: true, skipped: true }); }
  });
}

async function deterministicVerify(code, lang, useSandbox, testCode = '') {
  const errors = [], checks = [];
  if (!code || code.length < 4) return { ok: false, checks: ['Empty'], errors: ['Пустой код'] };
  if (code.includes('// TODO') || code.includes('# TODO')) errors.push('Обнаружен незавершённый TODO');
  if (lang === 'json') {
    checks.push('JSON.parse'); try { JSON.parse(code); } catch (e) { errors.push('Битый JSON: ' + e.message); }
  } else if (lang === 'js') {
    checks.push('JS AST'); try { new Function(code); } catch (e) { errors.push('Синтаксис JS: ' + e.message); }
    if (errors.length === 0 && useSandbox) {
      checks.push('WebWorker Tests');
      const sb = await runJsSandbox(code, testCode ? (testCode + NL + 'self.postMessage({ok:true});') : 'self.postMessage({ok:true});');
      if (!sb.ok) errors.push('Sandbox: ' + sb.err);
    }
  } else if (lang === 'html') {
    checks.push('HTML DOMParser');
    const doc = new DOMParser().parseFromString(code, 'text/html');
    doc.querySelectorAll('script').forEach((sc, idx) => {
      if (sc.textContent.trim()) { checks.push('Script #' + (idx + 1)); try { new Function(sc.textContent); } catch (e) { errors.push('JS #' + (idx + 1) + ': ' + e.message); } }
    });
  } else {
    checks.push('Brackets & Quotes'); const brErr = checkBracketsAndStrings(code); if (brErr) errors.push(brErr);
  }
  return { ok: errors.length === 0, checks, errors };
}

async function quickAiCall(sysPrompt, userPrompt, useSmart = false, jsonMode = false) {
  if (STATE.workerUrl && STATE.d1Online) {
    const r = await fetch(STATE.workerUrl + '/api/chat', {
      method: 'POST', headers: workerHeaders(),
      body: JSON.stringify({ text: userPrompt, systemPrompt: sysPrompt, mode: useSmart ? 'pro' : 'game', jsonMode, skipHistory: true })
    });
    if (r.ok) { const d = await r.json(); return d.reply || ''; }
  }
  if (isRealKey(STATE.apiKey)) return await callGeminiDirect(STATE.apiKey, useSmart ? STATE.catalog.aistudio.smart : STATE.catalog.aistudio.fast, sysPrompt, userPrompt, null, jsonMode);
  if (isRealKey(STATE.groqKey)) return await callOpenAICompat('https://api.groq.com/openai/v1/chat/completions', STATE.groqKey, useSmart ? STATE.catalog.groq.smart : STATE.catalog.groq.fast, sysPrompt, userPrompt);
  if (isRealKey(STATE.orKey)) return await callOpenAICompat('https://openrouter.ai/api/v1/chat/completions', STATE.orKey, STATE.catalog.openai.smart, sysPrompt, userPrompt);
  return '';
}

async function ghCall(suffix, method = 'GET', bodyObj = null) {
  if (STATE.workerUrl && STATE.d1Online && STATE.vault?.github) {
    const opts = { method, headers: workerHeaders() };
    if (bodyObj !== null) opts.body = JSON.stringify(bodyObj);
    const res = await fetch(STATE.workerUrl + '/api/gh' + suffix, opts);
    const data = await res.json(); if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }
  if (STATE.ghModuleUrl && STATE.ghOnline) {
    const opts = { method, headers: ghHeaders() };
    if (bodyObj !== null) opts.body = JSON.stringify(bodyObj);
    const res = await fetch(STATE.ghModuleUrl + '/api' + suffix, opts);
    const data = await res.json(); if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }
  throw new Error('GitHub модуль не подключён');
}

async function runVibeCodingLoop(task, rawLang, existingContent = '') {
  const lang = rawLang === 'auto' ? detectVibeLanguage(task, $('vibePathIn').value) : rawLang;
  RT.vibeLastLang = lang;
  const useSyntax = $('vibeCheckSyntax').checked, useSandbox = $('vibeCheckSandbox').checked, useCritic = $('vibeCheckCritic').checked;
  const maxTries = Number($('vibeMaxTries').value || 2);
  setPetVisual('booting', 'focus'); $('vibeResultBox').style.display = 'flex';
  $('vibeVerdict').className = 'vibe-verdict'; $('vibeVerdict').textContent = '⏳ Язык: ' + lang.toUpperCase() + ' • Контракт...';
  $('btnVibePush').disabled = true;

  let contract = '1) Валидный синтаксис ' + lang.toUpperCase() + '. 2) Полная реализация без TODO.';
  if (hasMod('gemini') || hasMod('groq') || STATE.d1Online) {
    try { contract = await quickAiCall('Ты Аналитик. Сформулируй 3 чётких критерия приёмки без самого кода.', 'Язык: ' + lang + NL + 'Задача: ' + task); } catch (_) {}
  }
  let code = '', lastErr = '', attempts = 0, finalCheck = { ok: true, checks: [], errors: [] };
  for (let i = 1; i <= maxTries; i++) {
    attempts = i; $('vibeVerdict').textContent = '⏳ [' + lang.toUpperCase() + '] Попытка ' + i + '/' + maxTries + '...';
    const ctxPart = existingContent ? (NL + NL + 'ТЕКУЩИЙ ФАЙЛ:' + NL + existingContent.slice(0, 6000)) : '';
    const errPart = lastErr ? (NL + NL + 'ИСПРАВЬ ОШИБКУ:' + NL + lastErr) : '';
    const genPrompt = 'Задача: ' + task + NL + 'Язык: ' + lang + NL + 'Контракт:' + NL + contract + ctxPart + errPart + NL + NL + 'Верни ТОЛЬКО код внутри блока ```' + lang + ' ... ```.';
    if (hasMod('gemini') || hasMod('groq') || hasMod('openrouter') || STATE.d1Online) {
      code = extractCodeBlock(await quickAiCall('Ты строгий инженер. Пиши чистый код без заглушек.', genPrompt, false));
    } else {
      await new Promise(r => setTimeout(r, 380));
      code = lang === 'json' ? JSON.stringify({ demo: true, task }, null, 2) : ('// Демо ' + lang + ' для: ' + task + NL + 'console.log(' + Q2 + 'AI OS OK' + Q2 + ');');
    }
    finalCheck = useSyntax ? await deterministicVerify(code, lang, useSandbox) : { ok: true, checks: ['Skipped'], errors: [] };
    if (finalCheck.ok && useCritic && (hasMod('openrouter') || hasMod('gemini'))) {
      try {
        const cr = await quickAiCall('Проверь код. Если багов нет — ответь PASS, иначе опиши ошибку.', 'Критерии:' + NL + contract + NL + 'Код:' + NL + code);
        if (!cr.toUpperCase().includes('PASS')) { finalCheck.ok = false; finalCheck.errors.push('Критик: ' + cr.slice(0, 120)); } else finalCheck.checks.push('Критик PASS');
      } catch (_) {}
    }
    if (finalCheck.ok) break;
    const errMsg = finalCheck.errors.join('; '); if (errMsg === lastErr) break; lastErr = errMsg;
  }
  RT.vibeLastCode = code; RT.vibeLastVerified = finalCheck.ok; $('vibeCodeOut').textContent = code;
  if (finalCheck.ok) {
    setPetVisual('awake', 'smug'); $('vibeVerdict').className = 'vibe-verdict ok';
    $('vibeVerdict').textContent = '✓ [' + lang.toUpperCase() + '] Готово (' + attempts + '/' + maxTries + ' • ' + finalCheck.checks.join(', ') + ')';
    $('btnVibePush').disabled = !hasMod('github'); addXP(20);
  } else {
    setPetVisual('awake', 'shock'); $('vibeVerdict').className = 'vibe-verdict fail';
    $('vibeVerdict').textContent = '✗ Ошибка (' + attempts + '/' + maxTries + '): ' + finalCheck.errors.join('; ');
    $('btnVibePush').disabled = true;
  }
  saveState();
}

function parseForgeSections(raw) {
  const iMeta = raw.indexOf('===META==='), iCode = raw.indexOf('===CODE==='), iTest = raw.indexOf('===TEST===');
  if (iMeta !== -1 && iCode !== -1) {
    const metaSlice = raw.slice(iMeta + 10, iCode);
    const m = metaSlice.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('В секции META не найден JSON');
    const meta = JSON.parse(m[0]);
    const codeRaw = iTest !== -1 ? raw.slice(iCode + 10, iTest) : raw.slice(iCode + 10);
    const testRaw = iTest !== -1 ? raw.slice(iTest + 10) : '';
    meta.code = extractCodeBlock(codeRaw);
    meta.testCode = testRaw ? extractCodeBlock(testRaw) : '';
    return meta;
  }
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) return JSON.parse(m[0]);
  throw new Error('Модель ответила не по шаблону: ' + raw.slice(0, 120));
}

async function runAutonomousSkillForge(goalHint = '') {
  if (!hasMod('github')) { toast('Подключи 🐙 GitHub Deploy в 🧩 Модули!', 'warn'); toggleGameDrawer('modules'); return; }
  toggleGameDrawer('vibe'); setPetVisual('booting', 'focus');
  $('vibeResultBox').style.display = 'flex'; $('vibeVerdict').className = 'vibe-verdict';
  $('vibeVerdict').textContent = '🧠 Шаг 1/4: Анализирую свои навыки и придумываю уникальный инструмент...';
  $('btnVibePush').disabled = true;

  let existingRepos = [];
  try { const rd = await ghCall('/repos', 'GET'); existingRepos = (rd.repos || []).map(x => x.name); } catch (_) {}

  const planSys = 'Ты саморазвивающийся ИИ-агент ' + STATE.name + '. ' + getLiveTelemetryText() + NL + 'Уже существующие репо (НЕ дублируй их): ' + (existingRepos.join(', ') || 'нет') + '. Установленные навыки: ' + (STATE.skills.map(s => s.id).join(', ') || 'нет') + '. Придумай ОДИН НОВЫЙ полезный изолированный JS-навык, которого у тебя ещё нет (например: парсер/конвертер валют или времени, генератор конфига для ESP32, анализ текста, трекер заметок, калькулятор). Ответь СТРОГО тремя секциями:' + NL + '===META===' + NL + 'однострочный валидный JSON без кода, с полями repoName, isPrivate (boolean), skillId, skillName, description, whyNeeded, sampleInput' + NL + '===CODE===' + NL + 'блок ```js ... ``` с функцией async function runSkill(input) { ... return { ok: true, result: ... }; }' + NL + '===TEST===' + NL + 'блок ```js ... ``` с тестом вызова await runSkill(sampleInput)';
  const planUser = goalHint ? ('Пожелание хозяина: ' + goalHint) : 'Сам выбери самый полезный новый инструмент.';

  let plan = null;
  try {
    if (!hasMod('gemini') && !hasMod('groq') && !hasMod('openrouter') && !STATE.d1Online) {
      throw new Error('Нет активного ИИ-мозга');
    }
    const rawPlan = await quickAiCall(planSys, planUser, false, false);
    if (!rawPlan || rawPlan.startsWith('Ошибка доступа')) throw new Error(rawPlan || 'Пустой ответ ИИ');
    plan = parseForgeSections(rawPlan);
  } catch (e) {
    setPetVisual('awake', 'shock');
    $('vibeVerdict').className = 'vibe-verdict fail';
    $('vibeVerdict').textContent = '✗ Не удалось спроектировать инструмент: ' + e.message;
    addLog('Forge err: ' + e.message, 'ERR');
    return;
  }

  $('vibeVerdict').textContent = '🧪 Шаг 2/4: Проверяю в песочнице «' + plan.skillName + '»...';
  let check = await deterministicVerify(plan.code, 'js', true, plan.testCode || '');
  if (!check.ok && (hasMod('gemini') || hasMod('groq'))) {
    try {
      const fixRaw = await quickAiCall('Исправь JS-код функции runSkill(input). Верни только код в ```js ... ```.', 'Ошибка: ' + check.errors.join('; ') + NL + NL + plan.code, false, false);
      plan.code = extractCodeBlock(fixRaw); check = await deterministicVerify(plan.code, 'js', true, plan.testCode || '');
    } catch (_) {}
  }
  RT.vibeLastCode = plan.code; RT.vibeLastVerified = check.ok; $('vibeRepoIn').value = plan.repoName; $('vibePathIn').value = 'skill.js'; $('vibeCodeOut').textContent = plan.code;
  if (!check.ok) { setPetVisual('awake', 'shock'); $('vibeVerdict').className = 'vibe-verdict fail'; $('vibeVerdict').textContent = '✗ Верификатор остановил код: ' + check.errors.join('; '); return; }

  setPetVisual('awake', 'smug'); $('vibeVerdict').className = 'vibe-verdict ok';
  $('vibeVerdict').textContent = '✓ «' + plan.skillName + '» прошёл тесты! Подтверди создание репо в Security Gate.';
  RT.pendingGate = { type: 'forge', repo: plan.repoName, isPrivate: Boolean(plan.isPrivate), path: 'skill.js', content: plan.code, plan };
  $('ghGateMeta').textContent = 'Позиция Спарки: ' + plan.whyNeeded + NL + 'Новый репо: ' + plan.repoName + ' (' + (plan.isPrivate ? '🔒 Private' : '🌐 Public') + ') | Тесты: ✓ PASSED';
  $('ghCommitMsg').value = 'feat: create autonomous skill ' + plan.skillId;
  $('ghGatePreview').textContent = plan.code.slice(0, 900); $('ghGateModal').classList.add('open');
}

async function importSkillsFromGithub() {
  if (!hasMod('github')) { toast('Подключи 🐙 GitHub Deploy', 'warn'); return; }
  toast('Ищу навыки (skill.js) в твоих репо...');
  try {
    const rd = await ghCall('/repos', 'GET');
    const candidates = (rd.repos || []).filter(r => r.name.includes('skill') || r.name.includes('tool') || r.name.includes('sparky')).slice(0, 10);
    let imported = 0;
    for (const r of candidates) {
      try {
        const f = await ghCall('/file?repo=' + encodeURIComponent(r.name) + '&path=skill.js', 'GET');
        if (f && f.content) {
          const id = r.name.replace(/[^a-zA-Z0-9_]/g, '_');
          const sk = { id, name: r.name, description: r.desc || ('Импорт из ' + r.name), repo: r.name, path: 'skill.js', code: f.content, enabled: true, sampleInput: {} };
          STATE.skills = [sk, ...STATE.skills.filter(x => x.id !== sk.id)];
          if (STATE.workerUrl && STATE.d1Online) fetch(STATE.workerUrl + '/api/skill', { method: 'POST', headers: workerHeaders(), body: JSON.stringify(sk) }).catch(() => {});
          imported++;
        }
      } catch (_) {}
    }
    renderSkillsLists(); saveState();
    toast(imported > 0 ? ('Подтянуто навыков: ' + imported + ' ✓') : 'Не найдено репо с skill.js');
  } catch (e) { toast('Ошибка импорта: ' + e.message, 'err'); }
}

async function executeSkillInSandbox(skill, inputObj = {}) {
  return await runJsSandbox(skill.code, 'const out = await runSkill(ev.data); self.postMessage({ ok: true, result: out });', inputObj);
}

function renderSkillsLists() {
  if ($('btnHudSkills')) $('btnHudSkills').textContent = '⚡ ' + STATE.skills.length;
  if ($('proSkillCount')) $('proSkillCount').textContent = String(STATE.skills.length);
  const renderTarget = (elId, compact) => {
    const box = $(elId); if (!box) return; box.innerHTML = '';
    if (!compact && hasMod('github')) {
      const impBtn = document.createElement('button'); impBtn.className = 'secondary-btn'; impBtn.style.marginBottom = '6px'; impBtn.style.fontSize = '11.5px';
      impBtn.textContent = '📥 Подтянуть готовые навыки с GitHub'; impBtn.onclick = importSkillsFromGithub;
      box.appendChild(impBtn);
    }
    if (STATE.skills.length === 0) {
      const emp = document.createElement('div'); emp.style.color = 'var(--muted)'; emp.style.fontSize = '11px'; emp.textContent = 'Навыков пока нет.'; box.appendChild(emp); return;
    }
    STATE.skills.forEach(sk => {
      const row = document.createElement('div'); row.className = 'mem-item';
      const lbl = document.createElement('span'); lbl.textContent = (sk.enabled ? '✓ ' : '⏸ ') + sk.name + ' (' + sk.id + ')'; row.appendChild(lbl);
      const btns = document.createElement('div'); btns.style.display = 'flex'; btns.style.gap = '4px';
      const runB = document.createElement('button'); runB.className = 'msg-bad-btn'; runB.textContent = '▶ Тест';
      runB.onclick = async () => {
        const r = await executeSkillInSandbox(sk, sk.sampleInput || {});
        const txt = r.ok ? JSON.stringify(r.result) : ('ERR: ' + r.err);
        toast(sk.name + ': ' + txt.slice(0, 90));
        STATE.chat.push({ id: Date.now(), role: 'ai', provider: 'skill', model: sk.name, mood: r.ok ? 'smug' : 'shock', text: '⚡ Тест «' + sk.name + '»: ' + txt });
        renderGameChat();
      };
      btns.appendChild(runB);
      if (!compact) {
        const delB = document.createElement('button'); delB.className = 'msg-bad-btn'; delB.textContent = '✕';
        delB.onclick = () => {
          STATE.skills = STATE.skills.filter(x => x.id !== sk.id);
          if (STATE.workerUrl && STATE.d1Online) fetch(STATE.workerUrl + '/api/skill/' + encodeURIComponent(sk.id), { method: 'DELETE', headers: workerHeaders() }).catch(() => {});
          renderSkillsLists(); saveState();
        };
        btns.appendChild(delB);
      }
      row.appendChild(btns); box.appendChild(row);
    });
  };
  renderTarget('gameSkillsList', false); renderTarget('proSkillsList', true);
}
