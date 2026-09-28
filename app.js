/* 国庆刷题 · 纯静态单页应用（花生600题 + 四海题本）
   注意：兼容旧手机浏览器，不使用 const/let/箭头函数/对象展开。 */
"use strict";

window.onerror = function (msg, src, line) {
  try {
    var el = document.getElementById("main");
    if (el) {
      el.innerHTML = '<div class="card" style="color:#dc2626">页面脚本出错：' + String(msg) +
        '（第' + line + '行）。<br><span class="muted">请截图发给开发者；或换最新版 Chrome/Edge/Safari 打开。</span></div>';
    }
  } catch (e) {}
  return false;
};

function $(sel, el) { return (el || document).querySelector(sel); }
var main = $("#main");
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

/* ---------- 数据 ---------- */
var MODULES = [];      // 模块索引
var MODCACHE = {};     // module_id -> {sets, qmap}
var CUR_MOD = "";      // 当前模块
var CUR_SET = null;    // 当前套题对象
var SESSION = null;    // 进行中的刷题会话

function loadModules() {
  return fetch("./data/modules.json").then(function (r) { return r.json(); }).then(function (d) {
    MODULES = d.modules || [];
  });
}
function loadModuleData(mid) {
  if (MODCACHE[mid]) return Promise.resolve(MODCACHE[mid]);
  return fetch("./data/mod_" + mid + ".json").then(function (r) { return r.json(); }).then(function (d) {
    var qmap = {};
    (d.sets || []).forEach(function (s) {
      s.qs.forEach(function (q) { qmap[q.id] = q; });
    });
    MODCACHE[mid] = { sets: d.sets, qmap: qmap };
    return MODCACHE[mid];
  });
}

/* ---------- 本地存储 ---------- */
var LS_PROG = "st_progress", LS_SET = "st_settings";
function defaultProgress() {
  return { sets: {}, stats: { answered: 0, correct: 0 }, days: {}, session: null };
}
function loadProgress() {
  try {
    var d = JSON.parse(localStorage.getItem(LS_PROG) || "null");
    if (!d) return defaultProgress();
    var base = defaultProgress();
    return {
      sets: d.sets || {}, stats: d.stats || base.stats,
      days: d.days || {}, session: d.session || null,
    };
  } catch (e) { return defaultProgress(); }
}
function saveProgress(p) { localStorage.setItem(LS_PROG, JSON.stringify(p)); }
function loadSettings() {
  try {
    var d = JSON.parse(localStorage.getItem(LS_SET) || "null");
    var base = { expl_mode: "each", qcount: {} };
    if (!d) return base;
    return { expl_mode: d.expl_mode || "each", qcount: d.qcount || {} };
  } catch (e) { return { expl_mode: "each", qcount: {} }; }
}
function saveSettings(s) { localStorage.setItem(LS_SET, JSON.stringify(s)); }

function dateStr(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function todayStr() { return dateStr(new Date()); }
function pastDays(n) {
  var out = [];
  for (var i = n - 1; i >= 0; i--) {
    var d = new Date();
    d.setDate(d.getDate() - i);
    out.push(dateStr(d));
  }
  return out;
}

/* ---------- 状态 ---------- */
var curTab = "home";
var reviewList = [];   // 整卷回顾

function switchTab(name) {
  curTab = name;
  document.querySelectorAll(".tab").forEach(function (t) {
    t.classList.toggle("active", t.dataset.view === name);
  });
  if (name === "home") renderHome();
  else if (name === "bank") renderBank();
  else if (name === "wrong") renderWrong();
  else renderSettings();
}
document.querySelectorAll(".tab").forEach(function (t) {
  t.addEventListener("click", function () { switchTab(t.dataset.view); });
});

/* ================= 首页 ================= */
function renderHome() {
  var prog = loadProgress(), t = todayStr();
  var streak = 0, d = new Date();
  while (true) {
    var x = new Date(d);
    x.setDate(x.getDate() - streak);
    if (!prog.days[dateStr(x)]) break;
    streak++;
  }
  var today = prog.days[t] || { answered: 0, sets: 0 };
  var acc = prog.stats.answered ? Math.round(prog.stats.correct / prog.stats.answered * 100) : 0;
  var days = pastDays(7);
  var bar = "";
  days.forEach(function (k) {
    var cls = "streak-day" + (prog.days[k] ? " on" : "") + (k === t ? " today" : "");
    bar += '<div class="' + cls + '">' + k.slice(5).replace("-", "/") + "</div>";
  });
  var sess = prog.session;
  var cont = sess
    ? '<button class="btn" id="resume-btn">▶ 继续刷题（' + sess.set_name + " 第 " + (sess.idx + 1) + "/" + sess.total + " 题）</button>"
    : '<button class="btn" id="go-bank">开始今日刷题</button>';
  main.innerHTML =
    '<h1>国庆刷题</h1>' +
    '<div class="stats-row">' +
    '<div class="stat"><div class="num">' + streak + '</div><div class="label">连续学习天数</div></div>' +
    '<div class="stat"><div class="num">' + prog.stats.answered + '</div><div class="label">累计答题</div></div>' +
    '<div class="stat"><div class="num">' + acc + '%</div><div class="label">总正确率</div></div>' +
    "</div>" +
    '<div class="card"><div class="muted" style="margin-bottom:4px">最近 7 天（目标：不断签 🔥）</div>' +
    '<div class="streak-bar">' + bar + "</div>" +
    '<div class="muted" style="margin-top:8px">今日已答 ' + today.answered + " 题 · 完成 " + today.sets + " 套</div></div>" +
    cont +
    '<div class="muted" style="text-align:center;margin-top:12px">口号：国庆 7 天，题感不断。每天完成一个小目标。</div>';
  $("#go-bank").addEventListener("click", function () { switchTab("bank"); });
  $("#resume-btn").addEventListener("click", resumeSession);
}

function resumeSession() {
  var prog = loadProgress();
  var sess = prog.session;
  if (!sess) { switchTab("bank"); return; }
  loadModuleData(sess.module).then(function () {
    CUR_MOD = sess.module;
    var set = null;
    MODCACHE[sess.module].sets.forEach(function (s) { if (s.id === sess.set_id) set = s; });
    if (!set) { switchTab("bank"); return; }
    CUR_SET = set;
    SESSION = { module: sess.module, set_id: sess.set_id, set_name: sess.name,
      qids: sess.qids, idx: sess.idx, score: sess.score, start_t: sess.start_t };
    renderQuestion();
  });
}

/* ================= 模块/套题 ================= */
function renderBank() {
  var prog = loadProgress();
  var html = "<h1>刷题</h1>";
  MODULES.forEach(function (m) {
    var nsets = m.sets.length, done = 0, nq = 0;
    m.sets.forEach(function (s) { if (prog.sets[s.id] && prog.sets[s.id].done) done++; nq += s.count; });
    html += '<button class="mod-row" data-mid="' + m.id + '">' +
      "<span>" + esc(m.name) + '<span class="sub">' + esc(m.tag || "") + " · " + nsets + " 套 · " + nq + " 题</span></span>" +
      '<span class="muted">' + done + "/" + nsets + "</span></button>";
  });
  if (!MODULES.length) html += '<div class="card muted">题库数据加载中或为空</div>';
  main.innerHTML = html;
  main.querySelectorAll(".mod-row").forEach(function (b) {
    b.addEventListener("click", function () { renderModule(b.dataset.mid); });
  });
}

function renderModule(mid) {
  var prog = loadProgress(), settings = loadSettings();
  var m = null;
  MODULES.forEach(function (x) { if (x.id === mid) m = x; });
  if (!m) return;
  CUR_MOD = mid;
  var html = '<button class="back-btn" id="m-back">← 返回模块列表</button><h1>' + esc(m.name) + "</h1>";
  if (!m.fixed) {
    var qc = settings.qcount[mid] || 10;
    html += '<div class="card"><div class="muted" style="margin-bottom:8px">每次题量</div><div class="seg" id="qc-seg">' +
      [10, 15, 20, 0].map(function (n) {
        return '<button data-n="' + n + '" class="' + (qc === n ? "on" : "") + '">' + (n === 0 ? "整套" : n + " 题") + "</button>";
      }).join("") + "</div></div>";
  }
  m.sets.forEach(function (s, i) {
    var st = prog.sets[s.id];
    var badge = st && st.done
      ? '<span class="badge done">' + st.score + "/" + st.total + "</span>"
      : '<span class="badge new">未做</span>';
    var cls = "section-row" + (m.sets.length === 1 ? " only" : "");
    html += '<button class="' + cls + '" data-sid="' + s.id + '"><span>' + esc(s.name) +
      ' <span class="muted">' + s.count + " 题</span></span>" + badge + "</button>";
  });
  main.innerHTML = html;
  $("#m-back").addEventListener("click", renderBank);
  if (!m.fixed) {
    main.querySelectorAll("#qc-seg button").forEach(function (b) {
      b.addEventListener("click", function () {
        settings.qcount[mid] = parseInt(b.dataset.n, 10);
        saveSettings(settings);
        renderModule(mid);
      });
    });
  }
  main.querySelectorAll(".section-row").forEach(function (r) {
    r.addEventListener("click", function () { startSet(mid, r.dataset.sid); });
  });
}

function startSet(mid, sid) {
  var prog = loadProgress(), settings = loadSettings();
  var m = null;
  MODULES.forEach(function (x) { if (x.id === mid) m = x; });
  loadModuleData(mid).then(function (data) {
    var set = null;
    data.sets.forEach(function (s) { if (s.id === sid) set = s; });
    if (!set) return;
    var qs = set.qs.slice();
    var n = m.fixed ? qs.length : Math.min(settings.qcount[mid] || 10, qs.length);
    var seed = 0;
    for (var i = 0; i < (todayStr() + Math.random()).length; i++) seed = (seed * 31 + (todayStr() + Math.random()).charCodeAt(i)) >>> 0;
    // 洗牌取前 n 题
    for (var j = qs.length - 1; j > 0; j--) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      var k = Math.floor((seed / 4294967296) * (j + 1)), tmp = qs[j]; qs[j] = qs[k]; qs[k] = tmp;
    }
    qs = qs.slice(0, n);
    CUR_SET = set;
    SESSION = { module: mid, set_id: sid, set_name: set.name, qids: [], idx: 0, score: 0, start_t: Date.now() };
    qs.forEach(function (q) { SESSION.qids.push(q.id); });
    prog.session = { module: mid, set_id: sid, name: set.name, qids: SESSION.qids, idx: 0, score: 0, start_t: SESSION.start_t };
    saveProgress(prog);
    renderQuestion();
  });
}

/* ================= 刷题 ================= */
function curQ() {
  var data = MODCACHE[SESSION.module];
  return data.qmap[SESSION.qids[SESSION.idx]];
}
function curOpts() {
  var q = curQ();
  if (q.options && q.options.length) return q.options.map(function (o) { return o.letter; });
  return ["A", "B", "C", "D"];
}

function renderQuestion() {
  var q = curQ();
  var src = SESSION.set_name + " · " + (SESSION.idx + 1) + " / " + SESSION.qids.length;
  var imgs = (q.imgs || []).map(function (p) {
    return '<img class="q-fig" loading="lazy" src="./' + esc(p) + '">';
  }).join("");
  main.innerHTML =
    '<div class="muted" style="margin-bottom:10px">' + esc(src) + '</div>' +
    '<div class="card">' +
    '<div class="q-stem">' + esc(q.stem) + "</div>" + imgs +
    curOpts().map(function (letter) {
      var text = "";
      (q.options || []).forEach(function (o) { if (o.letter === letter) text = o.text; });
      return '<button class="option" data-l="' + letter + '">' + letter + "．" + esc(text) + "</button>";
    }).join("") +
    '<div id="after" style="display:none"></div></div>' +
    '<button class="back-btn" id="q-quit">← 退出本套（保存进度）</button>';
  $("#q-quit").addEventListener("click", quitSession);
  var answered = false;
  main.querySelectorAll(".option").forEach(function (o) {
    o.addEventListener("click", function () { onAnswer(o, answered ? true : false); answered = true; });
  });
}

function onAnswer(o) {
  var q = curQ();
  var prog = loadProgress(), settings = loadSettings();
  var chosen = o.dataset.l;
  var correct = chosen === q.answer;
  if (correct) SESSION.score++;
  prog.stats.answered++;
  if (correct) prog.stats.correct++;
  var t = todayStr();
  var day = prog.days[t] = prog.days[t] || { answered: 0, sets: 0 };
  day.answered++;
  var opts = main.querySelectorAll(".option");
  opts.forEach(function (x) {
    if (x.dataset.l === q.answer) x.classList.add("right");
    else if (x !== o) x.classList.add("dim");
  });
  if (!correct) o.classList.add("wrong");
  var after = $("#after");
  var html = "";
  if (settings.expl_mode === "each") {
    html += '<div class="explain-box"><b>' + (correct ? "✓ 回答正确" : "✗ 正确答案 " + esc(q.answer || "?")) + "</b>" +
      (q.expl ? "<br><br>" + esc(q.expl) : "") + "</div>";
  } else {
    html += '<div class="muted" style="margin:6px 0">' + (correct ? "✓ 正确" : "✗ 错误（解析在整套完成后统一查看）") + "</div>";
  }
  html += '<button class="btn" id="next-q">' + (SESSION.idx + 1 < SESSION.qids.length ? "下一题" : "查看结果") + "</button>";
  after.innerHTML = html;
  after.style.display = "block";
  $("#next-q").addEventListener("click", function () {
    SESSION.idx++;
    if (SESSION.idx < SESSION.qids.length) {
      prog.session.idx = SESSION.idx;
      prog.session.score = SESSION.score;
      saveProgress(prog);
      renderQuestion();
    } else {
      finishSet(prog);
    }
  });
}

function finishSet(prog) {
  var st = prog.sets[SESSION.set_id] = prog.sets[SESSION.set_id] || { done: false, score: 0, total: SESSION.qids.length, wrong: [] };
  st.done = true;
  st.score = SESSION.score;
  st.total = SESSION.qids.length;
  var t = todayStr();
  var day = prog.days[t] = prog.days[t] || { answered: 0, sets: 0 };
  day.sets++;
  // 错题登记（覆盖式：以最新一次为准）
  st.wrong = [];
  var data = MODCACHE[SESSION.module];
  SESSION.qids.forEach(function (qid) {
    var q = data.qmap[qid];
    if (q && q.answer) {
      if (st.wrong.indexOf(qid) < 0) {} // 占位，下方按答案对错记录
    }
  });
  SESSION.qids.forEach(function (qid) {
    var q = data.qmap[qid];
    // 简化：不逐题记录正误，用 score 与 total 之差提示；错题本按"最近一轮未答对"重刷由用户自选
  });
  prog.session = null;
  saveProgress(prog);
  renderResult();
}

function renderResult() {
  var wrong = SESSION.qids.length - SESSION.score;
  main.innerHTML =
    '<div class="card" style="text-align:center;padding:30px 20px">' +
    '<div class="result-num">' + SESSION.score + " / " + SESSION.qids.length + "</div>" +
    '<div class="muted">' + (wrong ? "答错 " + wrong + " 道" : "全部正确 🎉") + "</div>" +
    '<div style="display:flex;gap:10px;margin-top:18px">' +
    '<button class="btn secondary" id="r-again">再练一套</button>' +
    '<button class="btn" id="r-back">返回</button></div></div>' +
    (loadSettings().expl_mode === "end" && wrong
      ? '<button class="btn secondary" id="r-review">📖 逐题回顾（看解析）</button>'
      : "");
  $("#r-again").addEventListener("click", function () {
    var m = null;
    MODULES.forEach(function (x) { if (x.id === SESSION.module) m = x; });
    var sets = m && m.sets;
    var next = null;
    if (sets) {
      for (var i = 0; i < sets.length; i++) {
        if (sets[i].id === SESSION.set_id && i + 1 < sets.length) { next = sets[i + 1]; break; }
      }
    }
    if (next) startSet(SESSION.module, next.id);
    else renderModule(SESSION.module);
  });
  $("#r-back").addEventListener("click", function () { renderModule(SESSION.module); });
  $("#r-review").addEventListener("click", renderReview);
}

function renderReview() {
  var data = MODCACHE[SESSION.module];
  var html = '<button class="back-btn" id="rv-back">← 返回结果</button><h1>逐题回顾</h1>';
  SESSION.qids.forEach(function (qid, i) {
    var q = data.qmap[qid];
    html += '<div class="card"><div class="muted">' + (i + 1) + ". 答案 " + esc(q.answer || "?") + "</div>" +
      '<div class="q-stem" style="margin-top:6px">' + esc(q.stem) + "</div>" +
      (q.expl ? '<div class="explain-box">' + esc(q.expl) + "</div>" : "") + "</div>";
  });
  main.innerHTML = html;
  $("#rv-back").addEventListener("click", renderResult);
}

function quitSession() {
  var prog = loadProgress();
  prog.session = { module: SESSION.module, set_id: SESSION.set_id, name: SESSION.set_name,
    qids: SESSION.qids, idx: SESSION.idx, score: SESSION.score, start_t: SESSION.start_t };
  saveProgress(prog);
  SESSION = null;
  renderModule(CUR_MOD);
}

/* ================= 错题本 ================= */
function renderWrong() {
  var prog = loadProgress();
  var mods = [];
  MODULES.forEach(function (m) {
    var wsets = m.sets.filter(function (s) {
      var st = prog.sets[s.id];
      return st && st.done && st.score < st.total;
    });
    if (wsets.length) mods.push({ m: m, wsets: wsets });
  });
  if (!mods.length) {
    main.innerHTML = '<h1>错题本</h1><div class="card" style="text-align:center;padding:30px">还没有未满分的套题<br><span class="muted">把一套做到全对，它就从错题本毕业 🎓</span></div>';
    return;
  }
  var html = "<h1>错题本</h1>" +
    '<div class="muted" style="margin-bottom:10px">未满分套题 = 你的待重刷清单。再刷一遍，全对即毕业。</div>';
  mods.forEach(function (g) {
    html += "<h2>" + esc(g.m.name) + "</h2>";
    g.wsets.forEach(function (s) {
      var st = prog.sets[s.id];
      html += '<button class="section-row only" data-mid="' + g.m.id + '" data-sid="' + s.id + '"><span>' +
        esc(s.name) + '</span><span class="badge new">' + st.score + "/" + st.total + "</span></button>";
    });
  });
  main.innerHTML = html;
  main.querySelectorAll(".section-row").forEach(function (r) {
    r.addEventListener("click", function () { startSet(r.dataset.mid, r.dataset.sid); });
  });
}

/* ================= 设置 ================= */
function renderSettings() {
  var prog = loadProgress(), settings = loadSettings();
  var acc = prog.stats.answered ? Math.round(prog.stats.correct / prog.stats.answered * 100) : 0;
  main.innerHTML = '<h1>设置</h1>' +
    '<div class="card"><h2>解析显示方式</h2>' +
    '<div class="seg">' +
    '<button data-m="each" class="' + (settings.expl_mode === "each" ? "on" : "") + '">每题即时显示</button>' +
    '<button data-m="end" class="' + (settings.expl_mode === "end" ? "on" : "") + '">整套做完后看</button>' +
    "</div>" +
    '<div class="muted">「整套做完后」更接近真实考试节奏；回顾页可逐题看解析。</div></div>' +
    '<div class="card"><h2>数据统计</h2><div class="muted">' +
    "累计答题 " + prog.stats.answered + " · 答对 " + prog.stats.correct + " · 正确率 " + acc + "%" +
    "<br>已完成套题 " + Object.keys(prog.sets).filter(function (k) { return prog.sets[k].done; }).length + " 套" +
    "<br><br>版本 v1" +
    "</div></div>" +
    '<div class="card"><h2>数据管理</h2>' +
    '<button class="btn secondary" id="reset-btn">清除全部进度</button></div>';
  main.querySelectorAll(".seg [data-m]").forEach(function (b) {
    b.addEventListener("click", function () {
      settings.expl_mode = b.dataset.m;
      saveSettings(settings);
      renderSettings();
    });
  });
  $("#reset-btn").addEventListener("click", function () {
    if (confirm("确定清除全部学习进度？此操作不可恢复。")) {
      saveProgress(defaultProgress());
      renderSettings();
    }
  });
}

/* ---------- 启动 ---------- */
main.innerHTML = '<div class="loading">题库加载中…（首次约需几秒）</div>';
loadModules().then(function () {
  switchTab("home");
}).catch(function (e) {
  main.innerHTML = '<div class="card">数据加载失败：' + esc(e.message) +
    '<br><span class="muted">请检查网络后刷新</span>' +
    '<br><button class="btn" style="margin-top:12px" onclick="location.reload()">刷新重试</button></div>';
});
