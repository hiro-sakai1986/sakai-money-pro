"use strict";

const STORAGE_KEY = "sakaiMoneyPro7ThirdC";
const LEGACY_KEYS = [
  "sakaiMoneyPro7ThirdB",
  "sakaiMoneyPro7ThirdA",
  "sakaiMoneyPro7SecondRelease",
  "sakaiMoneyPro7FirstRelease",
  "sakaiMoneyPro6FirstRelease",
  "sakaiMoneyPro6SecondRelease"
];

const defaultState = {
  cash: 0,
  loan: 0,
  assetGoal: 10000000,
  dark: false,
  assets: [],
  plans: [],
  transactions: [],
  education: { child1: 0, child2: 0, child3: 0, monthly: 0 },
  snapshots: [],
  lifeEvents: [
    { id: "default-2029", year: 2029, person: "長女", title: "小学校卒業・中学校入学", cost: 0 },
    { id: "default-2031", year: 2031, person: "次女", title: "小学校卒業・中学校入学", cost: 0 },
    { id: "default-2032", year: 2032, person: "長女", title: "中学校卒業・高校入学", cost: 0 },
    { id: "default-2034a", year: 2034, person: "次女", title: "中学校卒業・高校入学", cost: 0 },
    { id: "default-2034b", year: 2034, person: "三女", title: "小学校卒業・中学校入学", cost: 0 },
    { id: "default-2035", year: 2035, person: "長女", title: "高校卒業", cost: 0 },
    { id: "default-2037a", year: 2037, person: "次女", title: "高校卒業", cost: 0 },
    { id: "default-2037b", year: 2037, person: "三女", title: "中学校卒業・高校入学", cost: 0 },
    { id: "default-2040", year: 2040, person: "三女", title: "高校卒業", cost: 0 }
  ]
};

let state = loadState();
let currentOwner = "本人";
let currentRanking = "market";

const $ = id => document.getElementById(id);
const yen = value => new Intl.NumberFormat("ja-JP", {
  style: "currency", currency: "JPY", maximumFractionDigits: 0
}).format(Number(value) || 0);
const num = value => Math.max(0, Number(value) || 0);
const signedYen = value => `${Number(value) >= 0 ? "+" : "−"}${yen(Math.abs(Number(value) || 0))}`;
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
}[c]));
const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function normalize(raw) {
  const s = { ...clone(defaultState), ...(raw || {}) };
  s.assets = Array.isArray(s.assets) ? s.assets : [];
  s.plans = Array.isArray(s.plans) ? s.plans : [];
  s.transactions = Array.isArray(s.transactions) ? s.transactions : [];
  s.snapshots = Array.isArray(s.snapshots) ? s.snapshots : [];
  s.lifeEvents = Array.isArray(s.lifeEvents) ? s.lifeEvents : clone(defaultState.lifeEvents);
  s.education = { ...defaultState.education, ...(s.education || {}) };
  s.assetGoal = num(s.assetGoal) || defaultState.assetGoal;
  return s;
}
function loadState() {
  try {
    const own = localStorage.getItem(STORAGE_KEY);
    if (own) return normalize(JSON.parse(own));
    for (const key of LEGACY_KEYS) {
      const old = localStorage.getItem(key);
      if (old) {
        const migrated = normalize(JSON.parse(old));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    }
  } catch (e) { console.warn(e); }
  return clone(defaultState);
}
function saveState() {
  recordSnapshot();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function today() { return new Date().toISOString().slice(0, 10); }
function monthKey(date = today()) { return String(date).slice(0, 7); }
function monthsSince(dateString) {
  if (!dateString) return 0;
  const start = new Date(`${dateString}T00:00:00`), now = new Date();
  if (start > now) return 0;
  return (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1;
}
function assetMetrics(a) {
  const q = num(a.quantity), cost = num(a.cost), price = num(a.price);
  const market = q * price, invested = q * cost, profit = market - invested;
  return { market, invested, profit, rate: invested ? profit / invested * 100 : 0 };
}
function visibleAssets() { return state.assets.filter(a => currentOwner === "家族合計" || a.owner === currentOwner); }
function visiblePlans() { return state.plans.filter(p => currentOwner === "家族合計" || p.owner === currentOwner); }
function investmentTotals(owner = null) {
  const assets = state.assets.filter(a => !owner || a.owner === owner);
  const plans = state.plans.filter(p => !owner || p.owner === owner);
  const total = assets.reduce((s, a) => {
    const m = assetMetrics(a);
    s.market += m.market; s.invested += m.invested; s.profit += m.profit; s.dividend += num(a.dividend);
    return s;
  }, { market: 0, invested: 0, profit: 0, dividend: 0 });
  for (const p of plans) {
    const months = monthsSince(p.start), contributed = months * num(p.monthly);
    const value = p.value === "" || p.value == null ? contributed : num(p.value);
    total.market += value; total.invested += contributed; total.profit += value - contributed;
  }
  return total;
}
function budgetTotals(month = monthKey()) {
  return state.transactions.filter(t => String(t.date).startsWith(month)).reduce((s, t) => {
    s[t.kind] += num(t.amount); return s;
  }, { income: 0, expense: 0 });
}
function educationTotal() {
  return num(state.education.child1) + num(state.education.child2) + num(state.education.child3);
}
function financialAssets() { return num(state.cash) + investmentTotals().market + educationTotal(); }
function netWorthValue() { return financialAssets() - num(state.loan); }
function recordSnapshot() {
  const month = monthKey();
  const item = { month, financial: financialAssets(), netWorth: netWorthValue(), savedAt: new Date().toISOString() };
  const index = state.snapshots.findIndex(x => x.month === month);
  if (index >= 0) state.snapshots[index] = item; else state.snapshots.push(item);
  state.snapshots = state.snapshots.sort((a, b) => a.month.localeCompare(b.month)).slice(-60);
}
function dashboardChanges() {
  const current = netWorthValue();
  const now = new Date();
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
  const yearKey = `${now.getFullYear()}-`;
  const previous = state.snapshots.find(x => x.month === prevKey);
  const yearFirst = state.snapshots.filter(x => x.month.startsWith(yearKey)).sort((a, b) => a.month.localeCompare(b.month))[0];
  return {
    month: previous ? current - Number(previous.netWorth || 0) : null,
    year: yearFirst ? current - Number(yearFirst.netWorth || 0) : null
  };
}
function renderGreeting() {
  const h = new Date().getHours();
  $("greeting").textContent = `${h < 11 ? "おはよう" : h < 18 ? "こんにちは" : "こんばんは"}、ヒロ`;
}
function charlieAdviceItems() {
  const items = [];
  const inv = investmentTotals(), budget = budgetTotals(), financial = financialAssets();
  const balance = budget.income - budget.expense;
  if (!state.transactions.length) items.push({ icon: "✍️", tone: "neutral", text: "家計を入力すると、今月の使い方をもっと詳しく分析できます。" });
  else if (balance >= 0) items.push({ icon: "◎", tone: "good", text: `今月は${yen(balance)}の黒字です。この調子で無理なく続けましょう。` });
  else items.push({ icon: "!", tone: "warn", text: `今月は${yen(Math.abs(balance))}の赤字です。支出の大きい項目を一度確認してみましょう。` });

  if (state.assets.length) {
    const ranked = state.assets.map(a => ({ a, market: assetMetrics(a).market })).sort((x,y)=>y.market-x.market);
    const top = ranked[0], ratio = inv.market ? top.market / inv.market * 100 : 0;
    if (ratio >= 40) items.push({ icon: "⚖", tone: "warn", text: `${top.a.name}が投資評価額の約${ratio.toFixed(0)}%です。値動きの影響が大きい配分になっています。` });
    else if (inv.profit >= 0) items.push({ icon: "↗", tone: "good", text: `投資全体は${yen(inv.profit)}のプラスです。短期の変動に慌てず、計画を優先しましょう。` });
    else items.push({ icon: "↘", tone: "neutral", text: `投資全体は${yen(Math.abs(inv.profit))}の含み損です。生活資金と分けて長期目線で確認しましょう。` });
  } else items.push({ icon: "↗", tone: "neutral", text: "保有資産を登録すると、銘柄の偏りや投資損益を分析できます。" });

  const goal = num(state.assetGoal), rate = goal ? financial / goal * 100 : 0;
  if (goal && rate >= 100) items.push({ icon: "★", tone: "good", text: `資産目標${yen(goal)}を達成しています。次の目標を設定してもよさそうです。` });
  else if (goal) items.push({ icon: "●", tone: "neutral", text: `資産目標まであと${yen(Math.max(0, goal-financial))}、達成率は${rate.toFixed(1)}%です。` });

  const next = [...state.lifeEvents].filter(e => Number(e.year) >= new Date().getFullYear()).sort((a,b)=>Number(a.year)-Number(b.year))[0];
  if (next) items.push({ icon: "○", tone: "neutral", text: `次の予定は${next.year}年「${next.person}・${next.title}」です${num(next.cost) ? `。予定費用は${yen(next.cost)}です` : ""}。` });
  return items.slice(0,4);
}
function renderCharlieAdvice() {
  const items = charlieAdviceItems();
  $("charlieAdvice").innerHTML = items.map(x => `<div class="advice-item ${x.tone}"><span>${x.icon}</span><p>${escapeHtml(x.text)}</p></div>`).join("");
}
function renderHome() {
  recordSnapshot();
  const inv = investmentTotals(), budget = budgetTotals();
  const financial = financialAssets(), netWorth = netWorthValue();
  $("netWorth").textContent = yen(netWorth);
  $("netWorthSub").textContent = `金融資産 ${yen(financial)} − ローン ${yen(state.loan)}`;
  $("cashSummary").textContent = yen(state.cash);
  $("investmentSummary").textContent = yen(inv.market);
  $("monthlyBalance").textContent = yen(budget.income - budget.expense);
  $("monthlyBalance").className = budget.income - budget.expense < 0 ? "negative" : "positive";
  $("monthlyPlans").textContent = yen(state.plans.reduce((s, p) => s + num(p.monthly), 0) + num(state.education.monthly));
  $("incomeTotal").textContent = yen(budget.income);
  $("expenseTotal").textContent = yen(budget.expense);
  $("dividendTotal").textContent = yen(inv.dividend);
  $("profitTotal").textContent = yen(inv.profit);
  $("profitTotal").className = inv.profit < 0 ? "negative" : "positive";

  const changes = dashboardChanges();
  setChangeMetric("monthChange", "monthChangeSub", changes.month, "前月末との比較");
  setChangeMetric("yearChange", "yearChangeSub", changes.year, "年初との比較");
  $("dashboardDividend").textContent = yen(inv.dividend);

  const goal = num(state.assetGoal), rate = goal ? Math.min(100, financial / goal * 100) : 0;
  $("goalRate").textContent = `${rate.toFixed(1)}%`;
  $("goalSub").textContent = goal ? `金融資産 ${yen(financial)}` : "目標を設定してください";
  $("goalAmount").textContent = yen(goal);
  $("goalRemaining").textContent = financial >= goal ? "目標達成！" : `あと ${yen(Math.max(0, goal - financial))}`;
  $("goalProgress").style.width = `${rate}%`;

  drawAllocation();
  drawTrend();
  renderCharlieAdvice();
}
function setChangeMetric(valueId, subId, value, label) {
  const el = $(valueId);
  if (value == null) {
    el.textContent = "—"; el.className = ""; $(subId).textContent = "記録をためると表示"; return;
  }
  el.textContent = signedYen(value);
  el.className = value < 0 ? "negative" : "positive";
  $(subId).textContent = label;
}
function drawAllocation() {
  const inv = investmentTotals().market, edu = educationTotal();
  const parts = [
    { name: "預金", value: num(state.cash), color: "#9a6f7f" },
    { name: "投資", value: inv, color: "#c29a6b" },
    { name: "教育", value: edu, color: "#78958a" }
  ].filter(x => x.value > 0);
  const canvas = $("allocationChart"), ctx = canvas.getContext("2d"), dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 320, h = 220;
  canvas.width = w * dpr; canvas.height = h * dpr; ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
  const total = parts.reduce((s, p) => s + p.value, 0), cx = w / 2, cy = 95, r = 72, inner = 42;
  if (!total) {
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--surface2");
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--muted");
    ctx.textAlign = "center"; ctx.font = "13px sans-serif";
    ctx.fillText("データを入力すると表示されます", cx, cy + 5);
    $("allocationLegend").innerHTML = ""; return;
  }
  let start = -Math.PI / 2;
  for (const p of parts) {
    const angle = Math.PI * 2 * p.value / total;
    ctx.beginPath(); ctx.arc(cx, cy, r, start, start + angle); ctx.arc(cx, cy, inner, start + angle, start, true); ctx.closePath();
    ctx.fillStyle = p.color; ctx.fill(); start += angle;
  }
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--text");
  ctx.textAlign = "center"; ctx.font = "700 14px sans-serif"; ctx.fillText("金融資産", cx, cy - 2);
  ctx.font = "800 17px sans-serif"; ctx.fillText(yen(total), cx, cy + 20);
  $("allocationLegend").innerHTML = parts.map(p => `<span><i style="background:${p.color}"></i>${p.name} ${Math.round(p.value / total * 100)}%</span>`).join("");
}
function drawTrend() {
  const canvas = $("trendChart"), ctx = canvas.getContext("2d"), dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 640, h = 260;
  canvas.width = w * dpr; canvas.height = h * dpr; ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
  const data = [...state.snapshots].sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  const text = getComputedStyle(document.body).getPropertyValue("--text").trim();
  const muted = getComputedStyle(document.body).getPropertyValue("--muted").trim();
  const line = getComputedStyle(document.body).getPropertyValue("--line").trim();
  const accent = getComputedStyle(document.body).getPropertyValue("--accent").trim();
  if (!data.length) return;
  const pad = { left: 56, right: 16, top: 18, bottom: 38 };
  const values = data.map(x => Number(x.netWorth || 0));
  let min = Math.min(...values), max = Math.max(...values);
  if (min === max) { min -= Math.max(100000, Math.abs(min) * .05); max += Math.max(100000, Math.abs(max) * .05); }
  const range = max - min || 1;
  const x = i => pad.left + (data.length === 1 ? (w - pad.left - pad.right) / 2 : i * (w - pad.left - pad.right) / (data.length - 1));
  const y = v => pad.top + (max - v) / range * (h - pad.top - pad.bottom);
  ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.font = "10px sans-serif"; ctx.fillStyle = muted; ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const yy = pad.top + i * (h - pad.top - pad.bottom) / 4;
    const val = max - i * range / 4;
    ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(w - pad.right, yy); ctx.stroke();
    ctx.fillText(`${Math.round(val / 10000)}万`, pad.left - 7, yy + 3);
  }
  ctx.beginPath(); data.forEach((d, i) => i ? ctx.lineTo(x(i), y(values[i])) : ctx.moveTo(x(i), y(values[i])));
  ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke();
  data.forEach((d, i) => {
    ctx.beginPath(); ctx.arc(x(i), y(values[i]), 4, 0, Math.PI * 2); ctx.fillStyle = accent; ctx.fill();
    ctx.fillStyle = muted; ctx.textAlign = "center"; ctx.font = "10px sans-serif";
    ctx.fillText(d.month.slice(5) + "月", x(i), h - 14);
  });
  ctx.fillStyle = text; ctx.textAlign = "center"; ctx.font = "700 12px sans-serif";
  ctx.fillText(yen(values[values.length - 1]), x(values.length - 1), Math.max(12, y(values[values.length - 1]) - 10));
  $("trendNote").textContent = data.length < 2 ? "今月分を記録しました。来月以降、推移が線でつながります。" : `直近${data.length}か月の純資産推移です。`;
}
function setupMonthOptions() {
  const months = new Set(state.transactions.map(t => monthKey(t.date))); months.add(monthKey());
  $("txMonth").innerHTML = [...months].sort().reverse().map(m => `<option value="${m}">${m}</option>`).join("");
}
function renderTransactions() {
  setupMonthOptions();
  const query = $("txSearch").value.trim().toLowerCase(), month = $("txMonth").value || monthKey();
  const list = state.transactions.filter(t => String(t.date).startsWith(month) && `${t.category} ${t.memo}`.toLowerCase().includes(query)).sort((a, b) => b.date.localeCompare(a.date));
  $("txList").innerHTML = list.length ? list.map(t => `<article class="item-card compact"><div><div class="item-title">${escapeHtml(t.category || "未分類")}</div><div class="item-sub">${escapeHtml(t.date)}${t.memo ? `・${escapeHtml(t.memo)}` : ""}</div></div><div class="tx-right"><strong class="${t.kind === 'expense' ? 'negative' : 'positive'}">${t.kind === 'expense' ? '-' : '+'}${yen(t.amount)}</strong><button class="delete-button" data-delete-tx="${t.id}">削除</button></div></article>`).join("") : `<div class="empty">この月の記録はありません。</div>`;
}
function assetDividendYield(a) {
  const m = assetMetrics(a);
  return m.invested ? num(a.dividend) / m.invested * 100 : 0;
}
function investmentAnalysis() {
  const assets = visibleAssets();
  const totals = assets.reduce((acc, a) => {
    const m = assetMetrics(a);
    acc.market += m.market; acc.invested += m.invested; acc.profit += m.profit; acc.dividend += num(a.dividend);
    return acc;
  }, { market: 0, invested: 0, profit: 0, dividend: 0 });
  totals.profitRate = totals.invested ? totals.profit / totals.invested * 100 : 0;
  totals.yieldRate = totals.invested ? totals.dividend / totals.invested * 100 : 0;
  totals.count = assets.length;
  return totals;
}
function renderInvestmentAnalysis() {
  const t = investmentAnalysis();
  $("analysisInvested").textContent = yen(t.invested);
  $("analysisProfitRate").textContent = `${t.profitRate >= 0 ? "+" : ""}${t.profitRate.toFixed(1)}%`;
  $("analysisProfitRate").className = t.profitRate < 0 ? "negative" : "positive";
  $("analysisYield").textContent = `${t.yieldRate.toFixed(2)}%`;
  $("analysisCount").textContent = `${t.count}銘柄`;
  drawInvestmentAllocation();
}
function drawInvestmentAllocation() {
  const canvas = $("investmentAllocationChart"), ctx = canvas.getContext("2d"), dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 640, h = 230;
  canvas.width = w * dpr; canvas.height = h * dpr; ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
  const colors = ["#9d6b7e", "#c29a6b", "#78958a", "#7c82a3", "#aa7f61"];
  const grouped = {};
  for (const a of visibleAssets()) grouped[a.type || "その他"] = (grouped[a.type || "その他"] || 0) + assetMetrics(a).market;
  const parts = Object.entries(grouped).map(([name, value], i) => ({ name, value, color: colors[i % colors.length] })).filter(x => x.value > 0);
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) {
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--muted"); ctx.textAlign = "center"; ctx.font = "13px sans-serif";
    ctx.fillText("保有資産を登録すると表示されます", w / 2, h / 2); $("investmentAllocationLegend").innerHTML = ""; return;
  }
  const left = 20, right = 20, top = 20, barH = 34, usable = w - left - right;
  let x = left;
  for (const p of parts) {
    const bw = usable * p.value / total; ctx.fillStyle = p.color; ctx.fillRect(x, top, bw, barH); x += bw;
  }
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--text"); ctx.font = "800 22px sans-serif"; ctx.textAlign = "center";
  ctx.fillText(yen(total), w / 2, 105);
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--muted"); ctx.font = "12px sans-serif"; ctx.fillText("投資評価額", w / 2, 126);
  $("investmentAllocationLegend").innerHTML = parts.map(p => `<span><i style="background:${p.color}"></i>${escapeHtml(p.name)} ${Math.round(p.value / total * 100)}%</span>`).join("");
}
function renderRanking() {
  const assets = visibleAssets().map(a => ({ a, m: assetMetrics(a), yieldRate: assetDividendYield(a) }));
  const sorted = [...assets].sort((x, y) => currentRanking === "market" ? y.m.market - x.m.market : currentRanking === "profit" ? y.m.profit - x.m.profit : y.yieldRate - x.yieldRate).slice(0, 5);
  $("rankingList").innerHTML = sorted.length ? sorted.map((x, i) => {
    const value = currentRanking === "market" ? yen(x.m.market) : currentRanking === "profit" ? signedYen(x.m.profit) : `${x.yieldRate.toFixed(2)}%`;
    const cls = currentRanking === "profit" ? (x.m.profit < 0 ? "negative" : "positive") : "";
    return `<article class="ranking-item"><span class="rank-badge">${i + 1}</span><div><strong>${escapeHtml(x.a.name)}</strong><small>${escapeHtml(x.a.type)}・${escapeHtml(x.a.owner)}</small></div><b class="${cls}">${value}</b></article>`;
  }).join("") : `<div class="empty">ランキングを表示する保有資産がありません。</div>`;
}
function renderOwnerSummary() {
  const t = currentOwner === "家族合計" ? investmentTotals() : investmentTotals(currentOwner);
  $("ownerMarket").textContent = yen(t.market); $("ownerProfit").textContent = yen(t.profit);
  $("ownerProfit").className = t.profit < 0 ? "negative" : "positive"; $("ownerDividend").textContent = yen(t.dividend);
  const editable = currentOwner !== "家族合計";
  $("assetFormWrap").classList.toggle("hidden", !editable); $("planFormWrap").classList.toggle("hidden", !editable);
}
function renderAssets() {
  const q = $("assetSearch").value.trim().toLowerCase(), filter = $("assetFilter").value, sort = $("assetSort").value;
  const list = visibleAssets().filter(a => (filter === "all" || a.type === filter) && `${a.name} ${a.broker || ""}`.toLowerCase().includes(q)).sort((a, b) => {
    const am = assetMetrics(a), bm = assetMetrics(b);
    if (sort === "profitDesc") return bm.profit - am.profit;
    if (sort === "profitAsc") return am.profit - bm.profit;
    if (sort === "yieldDesc") return assetDividendYield(b) - assetDividendYield(a);
    if (sort === "nameAsc") return String(a.name).localeCompare(String(b.name), "ja");
    return bm.market - am.market;
  });
  $("assetList").innerHTML = list.length ? list.map(a => {
    const m = assetMetrics(a);
    return `<article class="item-card"><div class="item-head"><div><div class="item-title">${escapeHtml(a.name)}</div><div class="item-sub">${escapeHtml(a.owner)}・${escapeHtml(a.type)}・${escapeHtml(a.account)}${a.broker ? `・${escapeHtml(a.broker)}` : ""}</div></div><div class="item-value">${yen(m.market)}<small class="${m.profit < 0 ? 'negative' : 'positive'}">${m.profit >= 0 ? '+' : ''}${yen(m.profit)}（${m.rate.toFixed(1)}%）</small></div></div><div class="item-grid"><div><span>保有数</span><strong>${num(a.quantity).toLocaleString("ja-JP")}</strong></div><div><span>取得単価</span><strong>${yen(a.cost)}</strong></div><div><span>現在価格</span><strong>${yen(a.price)}</strong></div><div><span>取得総額</span><strong>${yen(m.invested)}</strong></div><div><span>年間配当</span><strong>${yen(a.dividend)}</strong></div><div><span>入力日</span><strong>${escapeHtml(a.date || "—")}</strong></div></div><div class="item-actions"><button class="edit-button" data-edit-asset="${a.id}">編集</button><button class="delete-button" data-delete-asset="${a.id}">削除</button></div></article>`;
  }).join("") : `<div class="empty">保有資産はまだありません。</div>`;
}
function renderPlans() {
  const list = visiblePlans();
  $("planList").innerHTML = list.length ? list.map(p => {
    const months = monthsSince(p.start), contributed = months * num(p.monthly);
    const value = p.value === "" || p.value == null ? contributed : num(p.value), profit = value - contributed;
    return `<article class="item-card"><div class="item-head"><div><div class="item-title">${escapeHtml(p.name)}</div><div class="item-sub">${escapeHtml(p.owner)}・${escapeHtml(p.account)}${p.broker ? `・${escapeHtml(p.broker)}` : ""}</div></div><div class="item-value">月 ${yen(p.monthly)}<small class="${profit < 0 ? 'negative' : 'positive'}">評価 ${yen(value)}</small></div></div><div class="item-grid"><div><span>開始日</span><strong>${escapeHtml(p.start || "—")}</strong></div><div><span>積立月数</span><strong>${months}か月</strong></div><div><span>累計入金</span><strong>${yen(contributed)}</strong></div><div><span>評価損益</span><strong class="${profit < 0 ? 'negative' : 'positive'}">${profit >= 0 ? '+' : ''}${yen(profit)}</strong></div></div><div class="item-actions"><button class="edit-button" data-edit-plan="${p.id}">編集</button><button class="delete-button" data-delete-plan="${p.id}">削除</button></div></article>`;
  }).join("") : `<div class="empty">積立はまだありません。</div>`;
}
function renderDividendCalendar() {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amount: 0, names: [] }));
  for (const a of visibleAssets()) {
    const dividend = num(a.dividend), ms = String(a.dividendMonths || "").split(/[,、\s]+/).map(Number).filter(m => m >= 1 && m <= 12);
    if (!ms.length) continue;
    for (const m of ms) { months[m - 1].amount += dividend / ms.length; months[m - 1].names.push(a.name); }
  }
  $("dividendCalendar").innerHTML = months.map(m => `<div class="month-cell"><span>${m.month}月</span><strong>${yen(m.amount)}</strong><small>${escapeHtml([...new Set(m.names)].join("・"))}</small></div>`).join("");
}
function renderLifeEvents() {
  const list = [...state.lifeEvents].sort((a,b) => Number(a.year)-Number(b.year) || String(a.title).localeCompare(String(b.title), "ja"));
  $("lifeEventList").innerHTML = list.length ? list.map(e => `<article class="timeline-item"><div class="timeline-year">${escapeHtml(e.year)}</div><div class="timeline-dot"></div><div class="timeline-card"><div><strong>${escapeHtml(e.person)}｜${escapeHtml(e.title)}</strong><small>${num(e.cost) ? `予定費用 ${yen(e.cost)}` : "費用未設定"}</small></div><div class="item-actions"><button class="edit-button" data-edit-event="${e.id}">編集</button><button class="delete-button" data-delete-event="${e.id}">削除</button></div></div></article>`).join("") : `<div class="empty">予定はまだありません。</div>`;
}
function clearEventForm() {
  $("eventId").value = ""; $("eventYear").value = ""; $("eventTitle").value = ""; $("eventCost").value = ""; $("eventPerson").value = "家族";
  $("saveEventButton").textContent = "予定を追加"; $("cancelEventEdit").classList.add("hidden");
}
function renderEducation() {
  const e = state.education;
  $("edu1").value = e.child1 || ""; $("edu2").value = e.child2 || ""; $("edu3").value = e.child3 || ""; $("eduMonthly").value = e.monthly || "";
  $("edu1Summary").textContent = yen(e.child1); $("edu2Summary").textContent = yen(e.child2); $("edu3Summary").textContent = yen(e.child3);
  $("eduTotalSummary").textContent = yen(educationTotal());
}
function renderTheme() { document.body.classList.toggle("dark", state.dark); $("themeButton").textContent = state.dark ? "☀️" : "🌙"; }
function renderAll() {
  renderGreeting(); renderTheme(); renderHome(); renderTransactions(); renderOwnerSummary(); renderInvestmentAnalysis(); renderAssets(); renderPlans(); renderRanking(); renderDividendCalendar(); renderEducation(); renderLifeEvents();
  $("cashInput").value = state.cash || ""; $("loanInput").value = state.loan || ""; $("assetGoalInput").value = state.assetGoal || "";
}
function clearAssetForm() {
  $("assetId").value = ""; ["assetName", "assetBroker", "assetQuantity", "assetCost", "assetPrice", "assetDividend", "assetDividendMonths"].forEach(id => $(id).value = "");
  $("assetDate").value = today(); $("saveAssetButton").textContent = "保有資産を追加"; $("cancelAssetEdit").classList.add("hidden");
}
function clearPlanForm() {
  $("planId").value = ""; ["planName", "planMonthly", "planBroker", "planValue"].forEach(id => $(id).value = "");
  $("planStart").value = today(); $("savePlanButton").textContent = "積立を追加"; $("cancelPlanEdit").classList.add("hidden");
}

$("addTxButton").addEventListener("click", () => {
  const amount = num($("txAmount").value); if (!amount) return alert("金額を入力してください");
  state.transactions.push({ id: uid(), date: $("txDate").value || today(), kind: $("txKind").value, category: $("txCategory").value.trim() || "未分類", amount, memo: $("txMemo").value.trim() });
  saveState(); ["txCategory", "txAmount", "txMemo"].forEach(id => $(id).value = ""); renderAll();
});
$("saveAssetButton").addEventListener("click", () => {
  const name = $("assetName").value.trim(); if (!name) return alert("銘柄・商品名を入力してください");
  const id = $("assetId").value, data = { id: id || uid(), owner: currentOwner, name, type: $("assetType").value, broker: $("assetBroker").value.trim(), account: $("assetAccount").value, date: $("assetDate").value, quantity: num($("assetQuantity").value), cost: num($("assetCost").value), price: num($("assetPrice").value), dividend: num($("assetDividend").value), dividendMonths: $("assetDividendMonths").value.trim() };
  if (id) state.assets = state.assets.map(a => a.id === id ? data : a); else state.assets.push(data);
  saveState(); clearAssetForm(); renderAll();
});
$("savePlanButton").addEventListener("click", () => {
  const name = $("planName").value.trim(); if (!name) return alert("商品名を入力してください");
  const id = $("planId").value, data = { id: id || uid(), owner: currentOwner, name, monthly: num($("planMonthly").value), start: $("planStart").value, broker: $("planBroker").value.trim(), account: $("planAccount").value, value: $("planValue").value === "" ? null : num($("planValue").value) };
  if (id) state.plans = state.plans.map(p => p.id === id ? data : p); else state.plans.push(data);
  saveState(); clearPlanForm(); renderAll();
});
document.addEventListener("click", e => {
  const d = e.target.dataset;
  if (d.deleteAsset && confirm("この保有資産を削除しますか？")) { state.assets = state.assets.filter(a => a.id !== d.deleteAsset); saveState(); renderAll(); }
  if (d.deletePlan && confirm("この積立を削除しますか？")) { state.plans = state.plans.filter(p => p.id !== d.deletePlan); saveState(); renderAll(); }
  if (d.deleteTx && confirm("この家計記録を削除しますか？")) { state.transactions = state.transactions.filter(t => t.id !== d.deleteTx); saveState(); renderAll(); }
  if (d.editAsset) {
    const a = state.assets.find(x => x.id === d.editAsset); if (a) {
      $("assetId").value = a.id; $("assetName").value = a.name; $("assetType").value = a.type; $("assetBroker").value = a.broker || ""; $("assetAccount").value = a.account; $("assetDate").value = a.date || today(); $("assetQuantity").value = a.quantity; $("assetCost").value = a.cost; $("assetPrice").value = a.price; $("assetDividend").value = a.dividend; $("assetDividendMonths").value = a.dividendMonths || "";
      $("saveAssetButton").textContent = "変更を保存"; $("cancelAssetEdit").classList.remove("hidden"); $("assetFormWrap").scrollIntoView({ behavior: "smooth" });
    }
  }
  if (d.editPlan) {
    const p = state.plans.find(x => x.id === d.editPlan); if (p) {
      $("planId").value = p.id; $("planName").value = p.name; $("planMonthly").value = p.monthly; $("planStart").value = p.start || today(); $("planBroker").value = p.broker || ""; $("planAccount").value = p.account; $("planValue").value = p.value ?? "";
      $("savePlanButton").textContent = "変更を保存"; $("cancelPlanEdit").classList.remove("hidden"); $("planFormWrap").scrollIntoView({ behavior: "smooth" });
    }
  }
  if (d.editEvent) {
    const item = state.lifeEvents.find(x => x.id === d.editEvent); if (item) {
      $("eventId").value = item.id; $("eventYear").value = item.year; $("eventPerson").value = item.person || "家族"; $("eventTitle").value = item.title; $("eventCost").value = item.cost || "";
      $("saveEventButton").textContent = "予定を更新"; $("cancelEventEdit").classList.remove("hidden"); $("eventYear").scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
  if (d.deleteEvent && confirm("この予定を削除しますか？")) {
    state.lifeEvents = state.lifeEvents.filter(x => x.id !== d.deleteEvent); saveState(); renderAll();
  }
});
$("cancelAssetEdit").addEventListener("click", clearAssetForm);
$("cancelPlanEdit").addEventListener("click", clearPlanForm);
document.querySelectorAll(".owner-tab").forEach(b => b.addEventListener("click", () => {
  currentOwner = b.dataset.owner; document.querySelectorAll(".owner-tab").forEach(x => x.classList.toggle("active", x === b));
  clearAssetForm(); clearPlanForm(); renderOwnerSummary(); renderInvestmentAnalysis(); renderAssets(); renderPlans(); renderRanking(); renderDividendCalendar();
}));
document.querySelectorAll(".ranking-tab").forEach(b => b.addEventListener("click", () => {
  currentRanking = b.dataset.ranking; document.querySelectorAll(".ranking-tab").forEach(x => x.classList.toggle("active", x === b)); renderRanking();
}));
document.querySelectorAll(".nav-button").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === b.dataset.screen));
  document.querySelectorAll(".nav-button").forEach(x => x.classList.toggle("active", x === b)); window.scrollTo({ top: 0, behavior: "smooth" });
  if (b.dataset.screen === "homeScreen") setTimeout(() => { drawAllocation(); drawTrend(); }, 50);
  if (b.dataset.screen === "investScreen") setTimeout(drawInvestmentAllocation, 50);
}));
["assetSearch", "assetFilter", "assetSort"].forEach(id => $(id).addEventListener("input", renderAssets));
["txSearch", "txMonth"].forEach(id => $(id).addEventListener("input", renderTransactions));
$("refreshAdviceButton").addEventListener("click", () => { renderCharlieAdvice(); $("refreshAdviceButton").textContent = "更新済み"; setTimeout(() => $("refreshAdviceButton").textContent = "更新", 900); });
$("saveEventButton").addEventListener("click", () => {
  const year = Number($("eventYear").value), title = $("eventTitle").value.trim();
  if (!year || !title) return alert("年と予定・出来事を入力してください");
  const id = $("eventId").value || uid();
  const item = { id, year, person: $("eventPerson").value, title, cost: num($("eventCost").value) };
  const index = state.lifeEvents.findIndex(e => e.id === id);
  if (index >= 0) state.lifeEvents[index] = item; else state.lifeEvents.push(item);
  saveState(); clearEventForm(); renderAll();
});
$("cancelEventEdit").addEventListener("click", clearEventForm);
$("saveEducation").addEventListener("click", () => {
  state.education = { child1: num($("edu1").value), child2: num($("edu2").value), child3: num($("edu3").value), monthly: num($("eduMonthly").value) };
  saveState(); renderAll(); alert("教育資金を保存しました");
});
$("saveBaseButton").addEventListener("click", () => {
  state.cash = num($("cashInput").value); state.loan = num($("loanInput").value); state.assetGoal = num($("assetGoalInput").value) || defaultState.assetGoal;
  saveState(); renderAll(); alert("基本情報と資産目標を保存しました");
});
$("themeButton").addEventListener("click", () => { state.dark = !state.dark; saveState(); renderTheme(); drawAllocation(); drawTrend(); drawInvestmentAllocation(); });
$("exportButton").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ version: "7.0-third-c", exportedAt: new Date().toISOString(), data: state }, null, 2)], { type: "application/json" }), a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `sakai-money-pro-backup-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$("importInput").addEventListener("change", async e => {
  const file = e.target.files[0]; if (!file) return;
  try { const parsed = JSON.parse(await file.text()); state = normalize(parsed.data || parsed); saveState(); renderAll(); alert("バックアップを読み込みました"); }
  catch { alert("このバックアップは読み込めませんでした"); }
  finally { e.target.value = ""; }
});
$("resetButton").addEventListener("click", () => {
  if (!confirm("すべての入力データを削除します。よろしいですか？")) return;
  state = clone(defaultState); saveState(); renderAll();
});
window.addEventListener("resize", () => { if ($("homeScreen").classList.contains("active")) { drawAllocation(); drawTrend(); } if ($("investScreen").classList.contains("active")) drawInvestmentAllocation(); });

$("txDate").value = today(); $("assetDate").value = today(); $("planStart").value = today();
recordSnapshot(); saveState(); renderAll();
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(console.error));
