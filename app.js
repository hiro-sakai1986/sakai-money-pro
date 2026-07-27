"use strict";

const STORAGE_KEY = "sakaiMoneyPro8Alpha";
const MIRROR_KEY = "sakaiMoneyPro8PermanentMirror";
const IDB_NAME = "sakaiMoneyProPermanentStorage";
const IDB_STORE = "appState";
const IDB_RECORD_KEY = "current";
let persistentStorageReady = false;
const LEGACY_KEYS = [
  "sakaiMoneyPro7ThirdD",
  "sakaiMoneyPro7ThirdC",
  "sakaiMoneyPro7ThirdB",
  "sakaiMoneyPro7ThirdA",
  "sakaiMoneyPro7SecondRelease",
  "sakaiMoneyPro70",
  "sakaiMoneyPro7FirstRelease",
  "sakaiMoneyPro61",
  "sakaiMoneyPro6FirstRelease",
  "sakaiMoneyPro6SecondRelease",
  "sakaiMoneyPro50"
];

const defaultState = {
  cash: 0,
  loan: 0,
  assetGoal: 10000000,
  dark: false,
  assets: [],
  plans: [],
  nisaUsage: {},
  nisaPurchases: [],
  confirmedDuplicateGroups: [],
  dividendReceipts: [],
  transactions: [],
  budgetSettings: { monthlyLimits: {} },
  education: { child1: 0, child2: 0, child3: 0, monthly: 0, target1: 0, target2: 0, target3: 0 },
  mortgage: { originalBalance: 0, balance: 0, rate: 1.05, monthly: 108000, bonusAnnual: 0, endYear: 2064, extra: 0 },
  savingsGoals: [
    { id: "default-car", category: "車", name: "セレナ買い替え", current: 0, target: 2000000, monthly: 20000, deadline: "2027-04-01" },
    { id: "default-travel", category: "旅行", name: "家族旅行", current: 0, target: 500000, monthly: 10000, deadline: "2027-10-01" },
    { id: "default-repair", category: "住宅修繕", name: "家の修繕・家電", current: 0, target: 1000000, monthly: 10000, deadline: "2030-12-31" }
  ],
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
let currentInvestmentView = "assets";

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

function normalizeOwner(value) {
  const text = String(value ?? "").normalize("NFKC").trim();
  if (["本人", "ヒロ", "妻", "自分", "私", "本人分"].includes(text)) return "本人";
  if (["夫", "旦那", "主人", "夫分"].includes(text)) return "夫";
  return text || "本人";
}

function parseDividendMonths(value) {
  const normalized = String(value ?? "").normalize("NFKC");
  const months = [...normalized.matchAll(/(?:^|\D)(1[0-2]|[1-9])(?=\D|$)/g)]
    .map(match => Number(match[1]))
    .filter(month => month >= 1 && month <= 12);
  return [...new Set(months)];
}

function normalize(raw) {
  const s = { ...clone(defaultState), ...(raw || {}) };
  s.assets = Array.isArray(s.assets)
    ? s.assets.map(asset => ({ ...asset, owner: normalizeOwner(asset?.owner) }))
    : [];
  s.plans = Array.isArray(s.plans)
    ? s.plans.map(plan => ({
        ...plan,
        owner: normalizeOwner(plan?.owner),
        method: plan?.method === "lump" ? "lump" : "monthly",
        invested: plan?.invested === "" || plan?.invested == null ? null : num(plan.invested)
      }))
    : [];
  s.nisaUsage = s.nisaUsage && typeof s.nisaUsage === "object" && !Array.isArray(s.nisaUsage) ? s.nisaUsage : {};
  s.nisaPurchases = Array.isArray(s.nisaPurchases)
    ? s.nisaPurchases.map(item => ({
        ...item,
        id: item?.id || uid(),
        owner: normalizeOwner(item?.owner),
        date: String(item?.date || today()),
        kind: item?.kind === "growth" ? "growth" : "tsumitate",
        amount: num(item?.amount),
        name: String(item?.name || "").trim(),
        broker: String(item?.broker || "").trim(),
        memo: String(item?.memo || "").trim()
      })).filter(item => item.amount > 0)
    : [];
  s.confirmedDuplicateGroups = Array.isArray(s.confirmedDuplicateGroups)
    ? [...new Set(s.confirmedDuplicateGroups.map(value => String(value || "")).filter(Boolean))]
    : [];
  s.dividendReceipts = Array.isArray(s.dividendReceipts)
    ? s.dividendReceipts.map(item => ({
        ...item,
        id: item?.id || uid(),
        owner: normalizeOwner(item?.owner),
        assetId: String(item?.assetId || ""),
        name: String(item?.name || "").trim(),
        date: String(item?.date || today()),
        amount: num(item?.amount),
        memo: String(item?.memo || "").trim()
      })).filter(item => item.amount > 0)
    : [];
  s.transactions = Array.isArray(s.transactions) ? s.transactions : [];
  s.budgetSettings = { ...defaultState.budgetSettings, ...(s.budgetSettings || {}) };
  s.budgetSettings.monthlyLimits = s.budgetSettings.monthlyLimits && typeof s.budgetSettings.monthlyLimits === "object" ? s.budgetSettings.monthlyLimits : {};
  s.snapshots = Array.isArray(s.snapshots) ? s.snapshots.map(item => ({
    ...item,
    month: String(item.month || monthKey()),
    financial: num(item.financial),
    netWorth: num(item.netWorth),
    investment: item.investment == null ? null : num(item.investment),
    annualDividend: item.annualDividend == null ? null : num(item.annualDividend),
    receivedDividend: item.receivedDividend == null ? null : num(item.receivedDividend)
  })) : [];
  s.lifeEvents = Array.isArray(s.lifeEvents) ? s.lifeEvents : clone(defaultState.lifeEvents);
  s.savingsGoals = Array.isArray(s.savingsGoals) ? s.savingsGoals : clone(defaultState.savingsGoals);
  s.education = { ...defaultState.education, ...(s.education || {}) };
  s.mortgage = { ...defaultState.mortgage, ...(s.mortgage || {}) };
  // 旧版や途中版で使われた借入時金額の別名も引き継ぐ。
  s.mortgage.originalBalance = num(
    s.mortgage.originalBalance || s.mortgage.borrowAmount || s.mortgage.initialBalance || s.originalLoan
  );
  if (!s.mortgage.balance && s.loan) s.mortgage.balance = Math.max(0, Number(s.loan) || 0);
  s.mortgage.originalBalance = num(s.mortgage.originalBalance) || num(s.mortgage.balance);
  if (s.mortgage.originalBalance < num(s.mortgage.balance)) s.mortgage.originalBalance = num(s.mortgage.balance);
  s.assetGoal = num(s.assetGoal) || defaultState.assetGoal;
  return s;
}
function hasMeaningfulData(raw) {
  if (!raw || typeof raw !== "object") return false;
  const education = raw.education || {};
  const mortgage = raw.mortgage || {};
  const goals = Array.isArray(raw.savingsGoals) ? raw.savingsGoals : [];
  return Boolean(
    Number(raw.cash) ||
    Number(raw.loan) ||
    (Array.isArray(raw.assets) && raw.assets.length) ||
    (Array.isArray(raw.plans) && raw.plans.length) ||
    (Array.isArray(raw.nisaPurchases) && raw.nisaPurchases.length) ||
    (Array.isArray(raw.transactions) && raw.transactions.length) ||
    Number(education.child1) ||
    Number(education.child2) ||
    Number(education.child3) ||
    Number(education.monthly) ||
    Number(education.target1) ||
    Number(education.target2) ||
    Number(education.target3) ||
    Number(mortgage.balance) ||
    goals.some(goal => Number(goal?.current))
  );
}

function localStorageCandidateKeys() {
  const keys = [...LEGACY_KEYS];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith("sakaiMoneyPro") && key !== STORAGE_KEY && key !== MIRROR_KEY && !keys.includes(key)) {
      keys.push(key);
    }
  }
  return keys;
}

function loadState() {
  try {
    const ownText = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(MIRROR_KEY);
    const ownRaw = ownText ? JSON.parse(ownText) : null;

    // すでに8.0に実データがある場合は、そのデータを最優先する。
    if (hasMeaningfulData(ownRaw)) return normalize(ownRaw);

    // 8.0が一度空の状態で保存されていても、旧版の実データを探して復旧する。
    for (const key of localStorageCandidateKeys()) {
      const oldText = localStorage.getItem(key);
      if (!oldText) continue;
      try {
        const oldRaw = JSON.parse(oldText);
        if (!hasMeaningfulData(oldRaw)) continue;
        const migrated = normalize(oldRaw);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      } catch (error) {
        console.warn(`旧データ ${key} は読み込めませんでした`, error);
      }
    }

    if (ownRaw) return normalize(ownRaw);
  } catch (e) { console.warn(e); }
  return clone(defaultState);
}
function stateTimestamp(value) {
  const timestamp = Date.parse(value?._savedAt || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function openPersistentDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return resolve(null);
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(IDB_STORE)) {
        database.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readIndexedState() {
  const database = await openPersistentDatabase();
  if (!database) return null;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(IDB_STORE, "readonly");
    const request = transaction.objectStore(IDB_STORE).get(IDB_RECORD_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

async function writeIndexedState(snapshot) {
  const database = await openPersistentDatabase();
  if (!database) return;
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(IDB_STORE, "readwrite");
    transaction.objectStore(IDB_STORE).put(snapshot, IDB_RECORD_KEY);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
}

function writeLocalCopies(snapshot) {
  const payload = JSON.stringify(snapshot);
  localStorage.setItem(STORAGE_KEY, payload);
  localStorage.setItem(MIRROR_KEY, payload);
}

function saveState() {
  recordSnapshot();
  state._savedAt = new Date().toISOString();
  try {
    writeLocalCopies(state);
  } catch (error) {
    console.warn("端末内の通常保存に失敗しました", error);
  }
  if (persistentStorageReady) {
    writeIndexedState(clone(state)).catch(error => {
      console.warn("端末内の予備保存に失敗しました", error);
    });
  }
}

async function initializePersistentStorage() {
  try {
    if (navigator.storage?.persist) {
      navigator.storage.persist().catch(() => {});
    }

    const indexedState = await readIndexedState();
    const currentHasData = hasMeaningfulData(state);
    const indexedHasData = hasMeaningfulData(indexedState);

    if (
      indexedHasData &&
      (!currentHasData || stateTimestamp(indexedState) > stateTimestamp(state))
    ) {
      state = normalize(indexedState);
      try {
        writeLocalCopies(state);
      } catch (error) {
        console.warn("復旧データの通常保存に失敗しました", error);
      }
      renderAll();
    }

    persistentStorageReady = true;
    await writeIndexedState(clone(state));
  } catch (error) {
    persistentStorageReady = true;
    console.warn("予備保存の初期化に失敗しました", error);
  }
}

function saveBeforeClosing() {
  try {
    recordSnapshot();
    state._savedAt = new Date().toISOString();
    writeLocalCopies(state);
  } catch (error) {
    console.warn("終了前の保存に失敗しました", error);
  }
}
function today() { return new Date().toISOString().slice(0, 10); }
function formatTodayLabel() {
  return new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short" }).format(new Date());
}
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
function visibleAssets() { return state.assets.filter(a => currentOwner === "家族合計" || normalizeOwner(a.owner) === currentOwner); }
function visiblePlans() { return state.plans.filter(p => currentOwner === "家族合計" || normalizeOwner(p.owner) === currentOwner); }
const NISA_LIMITS = { tsumitate: 1200000, growth: 2400000 };
function currentNisaYear() { return String(new Date().getFullYear()); }
function nisaBaseUsageFor(owner, year = currentNisaYear()) {
  const yearly = state.nisaUsage?.[year];
  const item = yearly?.[owner];
  return { tsumitate: num(item?.tsumitate), growth: num(item?.growth) };
}
function nisaPurchasesFor(owner, year = currentNisaYear()) {
  return state.nisaPurchases.filter(item => {
    const sameOwner = owner === "家族合計" || normalizeOwner(item?.owner) === owner;
    return sameOwner && String(item?.date || "").startsWith(String(year));
  });
}
function nisaPurchaseTotals(owner, year = currentNisaYear()) {
  return nisaPurchasesFor(owner, year).reduce((totals, item) => {
    const kind = item?.kind === "growth" ? "growth" : "tsumitate";
    totals[kind] += num(item?.amount);
    totals.total += num(item?.amount);
    totals.count += 1;
    return totals;
  }, { tsumitate: 0, growth: 0, total: 0, count: 0 });
}
function nisaUsageFor(owner, year = currentNisaYear()) {
  const base = nisaBaseUsageFor(owner, year);
  const purchases = nisaPurchaseTotals(owner, year);
  return {
    tsumitate: base.tsumitate + purchases.tsumitate,
    growth: base.growth + purchases.growth,
    base,
    purchases
  };
}
function nisaKindLabel(kind) {
  return kind === "growth" ? "成長投資枠" : "つみたて投資枠";
}
function nisaLimitRow(label, used, limit) {
  const remaining = Math.max(0, limit - used);
  const rate = limit ? Math.min(100, used / limit * 100) : 0;
  const over = used > limit;
  return `<div class="nisa-limit-row ${over ? "over" : ""}"><div class="nisa-limit-head"><span>${label}</span><b>${over ? `上限超過 ${yen(used-limit)}` : `残り ${yen(remaining)}`}</b></div><div class="nisa-limit-amount"><strong>${yen(used)}</strong><small>／ ${yen(limit)}</small></div><div class="nisa-limit-track"><div style="width:${rate}%"></div></div><small class="nisa-limit-rate">${rate.toFixed(1)}% 使用</small></div>`;
}
function nisaPlanKind(account) {
  const text = String(account ?? "").normalize("NFKC").replace(/\s+/g, "");
  if (!/NISA/i.test(text)) return null;
  if (text.includes("つみたて") || text.includes("積立投資枠")) return "tsumitate";
  if (text.includes("成長")) return "growth";
  return "unclassified";
}
function nisaMonthlySettings(owner) {
  const totals = { tsumitate: 0, growth: 0, unclassified: 0 };
  for (const plan of state.plans) {
    if (normalizeOwner(plan?.owner) !== owner || plan?.method === "lump") continue;
    const monthly = num(plan?.monthly);
    if (!monthly) continue;
    const kind = nisaPlanKind(plan?.account);
    if (kind) totals[kind] += monthly;
  }
  return totals;
}
function nisaForecastRow(label, used, limit, monthly, remainingMonths) {
  const futurePurchases = monthly * remainingMonths;
  const projected = used + futurePurchases;
  const difference = limit - projected;
  const over = difference < 0;
  const targetMonthly = remainingMonths ? Math.floor(Math.max(0, limit - used) / remainingMonths) : 0;
  const targetText = remainingMonths
    ? `残り枠を使い切る単純目安：月 ${yen(targetMonthly)}`
    : "年内の積立予定期間は終了";
  return `<div class="nisa-forecast-row ${over ? "over" : ""}"><div class="nisa-forecast-head"><span>${label}</span><b>${over ? `超過見込み ${yen(Math.abs(difference))}` : `年末残り見込み ${yen(difference)}`}</b></div><div class="nisa-forecast-values"><div><small>毎月設定</small><strong>${yen(monthly)}</strong></div><div><small>年末利用見込み</small><strong>${yen(projected)}</strong></div></div><p>${targetText}</p></div>`;
}
function nisaForecastBlock(owner) {
  const usage = nisaUsageFor(owner);
  const monthly = nisaMonthlySettings(owner);
  const remainingMonths = Math.max(0, 11 - new Date().getMonth());
  const period = remainingMonths ? `来月〜12月（${remainingMonths}か月）` : "年内の残り積立なし";
  const unclassifiedNote = monthly.unclassified
    ? `<p class="nisa-forecast-warning">口座区分が「NISA」のみの積立 ${yen(monthly.unclassified)}／月は、どちらの枠か判定できないため予測に含めていません。</p>`
    : "";
  return `<div class="nisa-forecast-block"><div class="nisa-forecast-title"><strong>年末着地予測</strong><span>${period}</span></div><div class="nisa-forecast-grid">${nisaForecastRow("つみたて投資枠", usage.tsumitate, NISA_LIMITS.tsumitate, monthly.tsumitate, remainingMonths)}${nisaForecastRow("成長投資枠", usage.growth, NISA_LIMITS.growth, monthly.growth, remainingMonths)}</div><p class="nisa-forecast-note">入力済みの今年の利用額に、現在登録している毎月積立を来月分から加えて試算しています。使い切る目安は投資を増やす推奨ではなく、残り枠の単純計算です。</p>${unclassifiedNote}</div>`;
}
function nisaOwnerBlock(owner) {
  const usage = nisaUsageFor(owner);
  const baseTotal = usage.base.tsumitate + usage.base.growth;
  return `<section class="nisa-owner-block"><div class="nisa-owner-title"><strong>${owner}</strong><span>年間上限 ${yen(NISA_LIMITS.tsumitate + NISA_LIMITS.growth)}</span></div><div class="nisa-auto-source"><span>開始時点 ${yen(baseTotal)}</span><b>＋</b><span>買付履歴 ${yen(usage.purchases.total)}（${usage.purchases.count}件）</span><b>＝</b><strong>${yen(usage.tsumitate + usage.growth)}</strong></div><div class="nisa-limit-grid">${nisaLimitRow("つみたて投資枠", usage.tsumitate, NISA_LIMITS.tsumitate)}${nisaLimitRow("成長投資枠", usage.growth, NISA_LIMITS.growth)}</div>${nisaForecastBlock(owner)}</section>`;
}
function nisaProductCandidates(owner) {
  const names = new Set();
  for (const plan of state.plans) {
    if (normalizeOwner(plan?.owner) === owner && nisaPlanKind(plan?.account)) names.add(String(plan?.name || "").trim());
  }
  for (const asset of state.assets) {
    if (normalizeOwner(asset?.owner) === owner && nisaPlanKind(asset?.account)) names.add(String(asset?.name || "").trim());
  }
  return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b, "ja"));
}
function renderNisaPurchases() {
  const year = currentNisaYear();
  const family = currentOwner === "家族合計";
  const list = nisaPurchasesFor(currentOwner, year).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const total = list.reduce((sum, item) => sum + num(item.amount), 0);
  $("nisaPurchaseSummary").textContent = `${list.length}件・${yen(total)}`;
  $("nisaPurchaseFormWrap").classList.toggle("hidden", family);
  $("nisaPurchaseFamilyNote").classList.toggle("hidden", !family);
  if (!family) {
    $("nisaPurchaseProductList").innerHTML = nisaProductCandidates(currentOwner).map(name => `<option value="${escapeHtml(name)}"></option>`).join("");
  }
  $("nisaPurchaseList").innerHTML = list.length ? list.map(item => `<article class="nisa-purchase-item"><div><div class="investment-chip-row"><span class="asset-type-chip">${nisaKindLabel(item.kind)}</span><span class="account-chip">${escapeHtml(item.owner)}</span></div><strong>${escapeHtml(item.name || "商品名なし")}</strong><small>${escapeHtml(item.date)}${item.broker ? `・${escapeHtml(item.broker)}` : ""}${item.memo ? `・${escapeHtml(item.memo)}` : ""}</small></div><div class="nisa-purchase-right"><b>${yen(item.amount)}</b><div class="item-actions"><button class="edit-button" data-edit-nisa-purchase="${item.id}">編集</button><button class="delete-button" data-delete-nisa-purchase="${item.id}">削除</button></div></div></article>`).join("") : `<div class="empty nisa-purchase-empty">${year}年の買付履歴はまだありません。</div>`;
}
function renderNisaUsage() {
  const year = currentNisaYear();
  $("nisaYearLabel").textContent = `${year}年`;
  $("nisaYearPurchaseLabel").textContent = `${year}年`;
  const family = currentOwner === "家族合計";
  $("nisaUsageContent").innerHTML = family ? `${nisaOwnerBlock("本人")}${nisaOwnerBlock("夫")}` : nisaOwnerBlock(currentOwner);
  $("nisaUsageEditor").classList.toggle("hidden", family);
  $("nisaFamilyEditNote").classList.toggle("hidden", !family);
  if (!family) {
    const base = nisaBaseUsageFor(currentOwner, year);
    $("nisaEditorOwner").textContent = `${currentOwner}の開始時点利用額`;
    $("nisaTsumitateUsed").value = base.tsumitate || "";
    $("nisaGrowthUsed").value = base.growth || "";
    $("nisaUsageEditor").open = false;
  }
  renderNisaPurchases();
}
function investmentTotals(owner = null) {
  const assets = state.assets.filter(a => !owner || normalizeOwner(a.owner) === owner);
  const plans = state.plans.filter(p => !owner || normalizeOwner(p.owner) === owner);
  const total = assets.reduce((s, a) => {
    const m = assetMetrics(a);
    s.market += m.market; s.invested += m.invested; s.profit += m.profit; s.dividend += num(a.dividend);
    return s;
  }, { market: 0, invested: 0, profit: 0, dividend: 0 });
  for (const p of plans) {
    const metrics = planMetrics(p);
    total.market += metrics.value;
    total.invested += metrics.contributed;
    total.profit += metrics.profit;
  }
  return total;
}
function budgetTotals(month = monthKey()) {
  return state.transactions.filter(t => String(t.date).startsWith(month)).reduce((s, t) => {
    s[t.kind] += num(t.amount); return s;
  }, { income: 0, expense: 0 });
}
function selectedBudgetMonth() { return $("txMonth")?.value || monthKey(); }
function budgetLimitFor(month = selectedBudgetMonth()) { return num(state.budgetSettings?.monthlyLimits?.[month]); }
function categoryExpenseTotals(month = selectedBudgetMonth()) {
  const grouped = {};
  for (const t of state.transactions) {
    if (t.kind !== "expense" || !String(t.date).startsWith(month)) continue;
    const category = String(t.category || "未分類");
    grouped[category] = (grouped[category] || 0) + num(t.amount);
  }
  return Object.entries(grouped).sort((a, b) => b[1] - a[1]);
}
function budgetMonthKeys(anchor = selectedBudgetMonth(), count = 6) {
  const [year, month] = String(anchor || monthKey()).split("-").map(Number);
  const keys = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const d = new Date(year, month - 1 - offset, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}
function educationTotal() {
  return num(state.education.child1) + num(state.education.child2) + num(state.education.child3);
}
function monthsUntil(dateString) {
  if (!dateString) return 0;
  const now = new Date(), end = new Date(`${dateString}T00:00:00`);
  return Math.max(0, (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth()));
}
function goalMetrics(g) {
  const current = num(g.current), target = num(g.target), monthly = num(g.monthly);
  const remaining = Math.max(0, target - current), months = monthsUntil(g.deadline);
  const neededMonthly = months ? Math.ceil(remaining / months) : remaining;
  const rate = target ? Math.min(100, current / target * 100) : 0;
  return { current, target, monthly, remaining, months, neededMonthly, rate };
}
function mortgageProjection() {
  const m = state.mortgage;
  const now = new Date();
  let balance = Math.max(0, num(m.balance) - num(m.extra));
  const monthlyRate = num(m.rate) / 100 / 12;
  const payment = num(m.monthly) + num(m.bonusAnnual) / 12;
  const points = [{ year: now.getFullYear(), balance }];
  let totalInterest = 0, months = 0;
  const maxMonths = 60 * 12;
  while (balance > 0.5 && months < maxMonths && payment > 0) {
    const interest = balance * monthlyRate;
    totalInterest += interest;
    const principal = payment - interest;
    if (principal <= 0) break;
    balance = Math.max(0, balance - principal);
    months += 1;
    if (months % 12 === 0 || balance <= 0.5) {
      points.push({ year: now.getFullYear() + Math.ceil(months / 12), balance });
    }
  }
  const configuredEnd = Number(m.endYear || 0);
  const projectedEnd = balance <= 0.5 ? now.getFullYear() + Math.ceil(months / 12) : null;
  return { points, totalInterest, months, projectedEnd, configuredEnd, remainingBalance: balance, payment };
}
function mortgageMetrics() {
  const m = state.mortgage, balance = num(m.balance), original = Math.max(num(m.originalBalance), balance), annual = num(m.monthly) * 12 + num(m.bonusAnnual);
  const projection = mortgageProjection();
  const years = projection.projectedEnd ? Math.max(0, projection.projectedEnd - new Date().getFullYear()) : Math.max(0, Number(m.endYear || 0) - new Date().getFullYear());
  const paid = Math.max(0, original - balance);
  const progress = original ? Math.min(100, paid / original * 100) : 0;
  return { balance, original, paid, progress, annual, years, roughInterest: projection.totalInterest, afterExtra: Math.max(0, balance - num(m.extra)), projection };
}
function financialAssets() { return num(state.cash) + investmentTotals().market + educationTotal(); }
function netWorthValue() { return financialAssets() - num(state.loan); }
function recordSnapshot() {
  const month = monthKey();
  const annualDividend = investmentTotals().dividend;
  const receivedDividend = state.dividendReceipts.filter(x => String(x.date || "").startsWith(String(new Date().getFullYear()))).reduce((s,x)=>s+num(x.amount),0);
  const item = { month, financial: financialAssets(), netWorth: netWorthValue(), investment: investmentTotals().market, annualDividend, receivedDividend, savedAt: new Date().toISOString() };
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

  const currentLimit = budgetLimitFor(monthKey());
  if (currentLimit && budget.expense > currentLimit) items.push({ icon: "⚠", tone: "warn", text: `今月の支出は予算を${yen(budget.expense - currentLimit)}超えています。家計画面で内訳を確認しましょう。` });
  else if (currentLimit && budget.expense > currentLimit * .85) items.push({ icon: "△", tone: "neutral", text: `今月の支出予算は残り${yen(Math.max(0, currentLimit - budget.expense))}です。` });

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
  const behind = state.savingsGoals.map(g => ({ g, m: goalMetrics(g) })).filter(x => x.m.months > 0 && x.m.monthly < x.m.neededMonthly).sort((a,b)=>(b.m.neededMonthly-b.m.monthly)-(a.m.neededMonthly-a.m.monthly))[0];
  if (behind) items.push({ icon: "⏳", tone: "warn", text: `${behind.g.name}は、目標日に間に合わせるには月${yen(behind.m.neededMonthly)}が目安です。現在より${yen(Math.max(0, behind.m.neededMonthly-behind.m.monthly))}増やすと近づきます。` });
  else if (state.savingsGoals.length) items.push({ icon: "✓", tone: "good", text: "目的別積立は、登録した目標ペースにおおむね沿っています。" });
  return items.slice(0,5);
}
function renderCharlieAdvice() {
  const items = charlieAdviceItems();
  $("charlieAdvice").innerHTML = items.map(x => `<div class="advice-item ${x.tone}"><span>${x.icon}</span><p>${escapeHtml(x.text)}</p></div>`).join("");
}
function goalDashboardItem({ icon, title, current, target, remainingLabel, detail, tone = "accent", reverse = false }) {
  const safeTarget = Math.max(0, num(target));
  const safeCurrent = Math.max(0, num(current));
  const rate = safeTarget ? Math.min(100, reverse ? (safeTarget - Math.min(safeTarget, safeCurrent)) / safeTarget * 100 : safeCurrent / safeTarget * 100) : 0;
  const remaining = reverse ? safeCurrent : Math.max(0, safeTarget - safeCurrent);
  return `<article class="card life-goal-card ${tone}"><div class="life-goal-head"><span class="life-goal-icon">${icon}</span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail || "")}</small></div><b>${rate.toFixed(0)}%</b></div><div class="progress-track"><div class="progress-bar" style="width:${rate}%"></div></div><div class="life-goal-values"><span>${reverse ? `残高 ${yen(safeCurrent)}` : `${yen(safeCurrent)} / ${yen(safeTarget)}`}</span><strong>${escapeHtml(remainingLabel || (remaining ? `あと ${yen(remaining)}` : "達成！"))}</strong></div></article>`;
}
function renderLifeGoalDashboard() {
  const wrap = $("lifeGoalDashboard"); if (!wrap) return;
  const items = [];
  const mx = mortgageMetrics();
  if (mx.balance || mx.original) items.push(goalDashboardItem({ icon:"🏠", title:"住宅ローン", current:mx.balance, target:mx.original, reverse:true, remainingLabel:mx.balance ? `完済まで約${mx.years || "—"}年` : "完済！", detail:`返済済み ${yen(mx.paid)}`, tone:"mortgage" }));
  const e = state.education;
  [["長女",e.child1,e.target1],["次女",e.child2,e.target2],["三女",e.child3,e.target3]].forEach(([name,current,target])=>{ if(num(current)||num(target)) items.push(goalDashboardItem({icon:"🎓",title:`${name}の教育資金`,current,target,detail:target?`目標 ${yen(target)}`:"目標額を設定してください",tone:"education"})) });
  state.savingsGoals.forEach(g=>{ const m=goalMetrics(g); if(m.current||m.target) items.push(goalDashboardItem({icon:({"車":"🚗","旅行":"🌴","住宅修繕":"🔧","教育":"🎓","家電":"🏠"}[g.category]||"🎯"),title:g.name,current:m.current,target:m.target,detail:g.deadline?`${g.deadline.replaceAll("-","/")}まで`:`毎月 ${yen(m.monthly)}`,tone:"saving"})) });
  const financial=financialAssets(), assetTarget=num(state.assetGoal);
  if(assetTarget) items.push(goalDashboardItem({icon:"💰",title:"総資産目標",current:financial,target:assetTarget,detail:`現在の金融資産 ${yen(financial)}`,tone:"asset"}));
  wrap.innerHTML = items.length ? items.join("") : '<article class="card life-goal-empty">ライフ画面で住宅ローン・教育資金・積立目標を登録すると、ここに進捗グラフが並びます。</article>';
}

function futureSnapshotData() {
  const rows = [];
  const mx = mortgageMetrics();
  if (mx.original > 0) rows.push({ icon:"🏠", title:"住宅ローン", rate:Math.min(100, mx.progress), current:mx.paid, target:mx.original, detail:`残高 ${yen(mx.balance)}`, status:`返済済み ${yen(mx.paid)}`, tone:"mortgage" });
  const e = state.education;
  const eduCurrent = num(e.child1)+num(e.child2)+num(e.child3);
  const eduTarget = num(e.target1)+num(e.target2)+num(e.target3);
  if (eduCurrent || eduTarget) rows.push({ icon:"🎓", title:"教育資金（3人合計）", rate:eduTarget?Math.min(100,eduCurrent/eduTarget*100):0, current:eduCurrent, target:eduTarget, detail:eduTarget?`目標 ${yen(eduTarget)}`:"目標額を設定", status:eduTarget?`あと ${yen(Math.max(0,eduTarget-eduCurrent))}`:"目標未設定", tone:"education" });
  const goalCurrent = state.savingsGoals.reduce((sum,g)=>sum+num(g.current),0);
  const goalTarget = state.savingsGoals.reduce((sum,g)=>sum+num(g.target),0);
  if (goalCurrent || goalTarget) rows.push({ icon:"🎯", title:"目的別積立", rate:goalTarget?Math.min(100,goalCurrent/goalTarget*100):0, current:goalCurrent, target:goalTarget, detail:`${state.savingsGoals.length}件の目標`, status:goalTarget?`あと ${yen(Math.max(0,goalTarget-goalCurrent))}`:"目標未設定", tone:"saving" });
  const financial = financialAssets(), assetTarget = num(state.assetGoal);
  if (assetTarget) rows.push({ icon:"💰", title:"金融資産目標", rate:Math.min(100,financial/assetTarget*100), current:financial, target:assetTarget, detail:`現在 ${yen(financial)}`, status:financial>=assetTarget?"達成！":`あと ${yen(assetTarget-financial)}`, tone:"asset" });
  const year=String(new Date().getFullYear());
  const base=state.nisaUsage?.[year]||{};
  const purchases=state.nisaPurchases.filter(x=>String(x.date||"").startsWith(year));
  const used=["本人","夫"].reduce((sum,owner)=>sum+num(base?.[owner]?.tsumitate)+num(base?.[owner]?.growth),0)+purchases.reduce((sum,x)=>sum+num(x.amount),0);
  const nisaTarget=7200000;
  if(used) rows.push({icon:"N",title:`${year}年 NISA`,rate:Math.min(100,used/nisaTarget*100),current:used,target:nisaTarget,detail:"夫婦の年間枠",status:`残り ${yen(Math.max(0,nisaTarget-used))}`,tone:"nisa"});
  return rows;
}
function renderFutureSnapshot() {
  const wrap=$("futureSnapshotRows"); if(!wrap) return;
  const rows=futureSnapshotData();
  const overall=rows.length?rows.reduce((sum,x)=>sum+x.rate,0)/rows.length:0;
  $("futureOverallRate").textContent=`${overall.toFixed(0)}%`;
  $("futureRingValue").textContent=`${overall.toFixed(0)}%`;
  $("futureOverallSub").textContent=rows.length?`${rows.length}項目の平均`:`目標を登録すると表示`;
  const ring=$("futureOverallRing"); if(ring) ring.style.setProperty("--rate",`${overall*3.6}deg`);
  wrap.innerHTML=rows.length?rows.map(x=>`<div class="future-row ${x.tone}"><span class="future-row-icon">${x.icon}</span><div class="future-row-main"><div class="future-row-title"><strong>${escapeHtml(x.title)}</strong><b>${x.rate.toFixed(0)}%</b></div><div class="future-row-track"><i style="width:${Math.max(0,Math.min(100,x.rate))}%"></i></div><div class="future-row-meta"><span>${escapeHtml(x.detail)}</span><strong>${escapeHtml(x.status)}</strong></div></div></div>`).join(""):'<p class="future-empty">ライフ画面で住宅ローン・教育資金・積立目標を登録すると、ここに進捗が表示されます。</p>';
}
function roadmapGoalRows() {
  const rows = [];
  const mx = mortgageMetrics();
  if (mx.original > 0) rows.push({ key:"mortgage", title:"住宅ローン", rate:Math.min(100, mx.progress), remaining:mx.balance, deadline:num(state.mortgage.endYear) || null, detail:`残高 ${yen(mx.balance)}`, attention:false });
  const e=state.education;
  [["長女",e.child1,e.target1],["次女",e.child2,e.target2],["三女",e.child3,e.target3]].forEach(([name,current,target])=>{
    current=num(current); target=num(target); if(!target) return;
    const event=[...state.lifeEvents].filter(x=>x.person===name && Number(x.year)>=new Date().getFullYear()).sort((a,b)=>Number(a.year)-Number(b.year))[0];
    rows.push({key:`edu-${name}`,title:`${name}の教育資金`,rate:Math.min(100,current/target*100),remaining:Math.max(0,target-current),deadline:event?Number(event.year):null,detail:`あと ${yen(Math.max(0,target-current))}`,attention:false});
  });
  state.savingsGoals.forEach(g=>{
    const m=goalMetrics(g); if(!m.target) return;
    const y=g.deadline?Number(String(g.deadline).slice(0,4)):null;
    rows.push({key:`goal-${g.id}`,title:g.name,rate:m.rate,remaining:m.remaining,deadline:y,deadlineText:g.deadline||"",detail:`あと ${yen(m.remaining)}`,attention:Boolean(m.months>0 && m.monthly<m.neededMonthly),neededMonthly:m.neededMonthly,monthly:m.monthly});
  });
  const target=num(state.assetGoal), current=financialAssets();
  if(target) rows.push({key:"asset",title:"総資産目標",rate:Math.min(100,current/target*100),remaining:Math.max(0,target-current),deadline:null,detail:`あと ${yen(Math.max(0,target-current))}`,attention:false});
  return rows;
}
function renderLifeRoadmap() {
  const rows=roadmapGoalRows();
  const active=rows.filter(x=>x.rate<100);
  const overall=rows.length ? rows.reduce((sum,x)=>sum+x.rate,0)/rows.length : 0;
  $("roadmapOverallRate").textContent=`${overall.toFixed(0)}%`;
  $("roadmapOverallSub").textContent=rows.length?`${rows.length}目標の平均`:`目標を登録すると表示`;
  const closest=[...active].sort((a,b)=>b.rate-a.rate)[0] || [...rows].sort((a,b)=>b.rate-a.rate)[0];
  $("roadmapClosestGoal").textContent=closest?closest.title:"—";
  $("roadmapClosestSub").textContent=closest?`${closest.rate.toFixed(0)}%・${closest.detail}`:"—";
  const dated=active.filter(x=>x.deadline).sort((a,b)=>a.deadline-b.deadline);
  const next=dated[0];
  $("roadmapNextDeadline").textContent=next?`${next.deadline}年`:"—";
  $("roadmapNextDeadlineSub").textContent=next?next.title:"期限付き目標なし";
  const attention=active.filter(x=>x.attention);
  $("roadmapAttentionCount").textContent=`${attention.length}件`;
  $("roadmapAttentionSub").textContent=attention.length?"積立ペースを確認":"順調です";
  let focus=attention.sort((a,b)=>(b.neededMonthly-b.monthly)-(a.neededMonthly-a.monthly))[0];
  if(!focus) focus=next || closest;
  if(focus){
    $("roadmapFocusTitle").textContent=focus.title;
    $("roadmapFocusBadge").textContent=focus.attention?"要調整":`${focus.rate.toFixed(0)}%`;
    $("roadmapFocusText").textContent=focus.attention?`目標日に間に合わせるには月${yen(focus.neededMonthly)}が目安です。現在より月${yen(Math.max(0,focus.neededMonthly-focus.monthly))}増やすと近づきます。`:`現在の進捗は${focus.rate.toFixed(1)}%。${focus.detail}${focus.deadline?`、目安は${focus.deadline}年です。`:"です。"}`;
  } else {
    $("roadmapFocusTitle").textContent="目標を登録してください"; $("roadmapFocusBadge").textContent="—"; $("roadmapFocusText").textContent="ライフ画面で期限と毎月積立を設定すると、優先度を自動判定します。";
  }
  const year=new Date().getFullYear();
  const events=[];
  state.lifeEvents.filter(e=>Number(e.year)>=year).forEach(e=>events.push({year:Number(e.year),title:`${e.person}・${e.title}`,sub:num(e.cost)?`予定費用 ${yen(e.cost)}`:"ライフイベント",type:"event"}));
  state.savingsGoals.filter(g=>g.deadline).forEach(g=>events.push({year:Number(String(g.deadline).slice(0,4)),title:g.name,sub:`目標 ${yen(g.target)}`,type:"goal"}));
  if(num(state.mortgage.endYear)>=year) events.push({year:num(state.mortgage.endYear),title:"住宅ローン完済予定",sub:`現在残高 ${yen(state.mortgage.balance)}`,type:"mortgage"});
  const timeline=events.filter(x=>x.year>=year).sort((a,b)=>a.year-b.year).slice(0,6);
  $("roadmapTimeline").innerHTML=timeline.length?timeline.map((x,i)=>`<div class="roadmap-timeline-item ${x.type}"><div class="roadmap-year">${x.year}</div><div class="roadmap-dot"></div><div class="roadmap-event"><strong>${escapeHtml(x.title)}</strong><small>${escapeHtml(x.sub)}</small></div></div>`).join(""):'<div class="empty">ライフイベントや目標日を登録すると、ここに時系列で表示されます。</div>';
}

function lifeTimelineProjection() {
  const currentYear = new Date().getFullYear();
  const mx = mortgageMetrics();
  const annualInvest = state.plans.reduce((sum,p)=>sum+(p.method === "lump" ? 0 : num(p.monthly))*12,0);
  const annualEducation = num(state.education.monthly) * 12;
  const annualGoals = state.savingsGoals.reduce((sum,g)=>sum+num(g.monthly)*12,0);
  const annualSaving = annualInvest + annualEducation + annualGoals;
  const currentFinancial = financialAssets();
  const years = new Set([currentYear]);
  state.lifeEvents.forEach(e=>{ const y=Number(e.year); if(y>=currentYear) years.add(y); });
  state.savingsGoals.forEach(g=>{ const y=Number(String(g.deadline||"").slice(0,4)); if(y>=currentYear) years.add(y); });
  if(num(state.mortgage.endYear)>=currentYear) years.add(num(state.mortgage.endYear));
  [currentYear+1,currentYear+3,currentYear+5,currentYear+10].forEach(y=>years.add(y));
  const mortgageAt = year => {
    if(!mx.balance) return 0;
    const points=mx.projection.points||[];
    const exact=points.find(p=>p.year===year); if(exact) return exact.balance;
    const before=[...points].filter(p=>p.year<year).sort((x,y)=>y.year-x.year)[0];
    const after=[...points].filter(p=>p.year>year).sort((x,y)=>x.year-y.year)[0];
    if(before&&after){ const ratio=(year-before.year)/(after.year-before.year); return Math.max(0,before.balance+(after.balance-before.balance)*ratio); }
    if(before && !after) return before.balance;
    return mx.balance;
  };
  const sorted=[...years].filter(y=>y>=currentYear).sort((a,b)=>a-b).slice(0,14);
  return sorted.map(year=>{
    const events=[];
    state.lifeEvents.filter(e=>Number(e.year)===year).forEach(e=>events.push({icon:"🎓",title:`${e.person}・${e.title}`,sub:num(e.cost)?`予定費用 ${yen(e.cost)}`:"登録済みライフイベント"}));
    state.savingsGoals.filter(g=>Number(String(g.deadline||"").slice(0,4))===year).forEach(g=>events.push({icon:({"車":"🚗","旅行":"🌴","住宅修繕":"🔧","教育":"🎓"}[g.category]||"🎯"),title:g.name,sub:`目標 ${yen(g.target)}`}));
    if(num(state.mortgage.endYear)===year) events.push({icon:"🏠",title:"住宅ローン完済予定",sub:"登録された完済予定年"});
    if(year===currentYear) events.unshift({icon:"●",title:"現在",sub:`金融資産 ${yen(currentFinancial)}`});
    const yearsAhead=year-currentYear;
    return {year,events,financial:currentFinancial+annualSaving*yearsAhead,mortgage:mortgageAt(year),yearsAhead};
  });
}
function renderLifePlanTimeline() {
  const wrap=$("lifePlanTimeline"); if(!wrap) return;
  const rows=lifeTimelineProjection();
  const currentYear=new Date().getFullYear();
  const next=rows.flatMap(r=>r.events.map(e=>({...e,year:r.year}))).filter(e=>e.year>currentYear).sort((a,b)=>a.year-b.year)[0];
  const y10=rows.find(r=>r.year===currentYear+10) || rows[rows.length-1];
  $("lifeTimelineNext").textContent=next?`${next.year}年`:`—`;
  $("lifeTimelineNextSub").textContent=next?next.title:"予定を登録すると表示";
  $("lifeTimelineAsset10").textContent=y10?yen(y10.financial):"—";
  $("lifeTimelineAsset10Sub").textContent=y10?`${y10.year}年・運用益を含めない単純積立`:`—`;
  $("lifeTimelineLoan10").textContent=y10?yen(y10.mortgage):"—";
  $("lifeTimelineLoan10Sub").textContent=y10?`${y10.year}年の概算残高`:`—`;
  wrap.innerHTML=rows.map(r=>`<div class="life-plan-year ${r.year===currentYear?"current":""}">
    <div class="life-plan-year-label"><strong>${r.year}</strong><small>${r.year===currentYear?"いま":`${r.yearsAhead}年後`}</small></div>
    <div class="life-plan-axis"><i></i></div>
    <div class="life-plan-content">
      <div class="life-plan-money"><span>金融資産見込み <b>${yen(r.financial)}</b></span><span>ローン残高 <b>${yen(r.mortgage)}</b></span></div>
      ${r.events.length?r.events.map(e=>`<article class="life-plan-event"><span>${e.icon}</span><div><strong>${escapeHtml(e.title)}</strong><small>${escapeHtml(e.sub)}</small></div></article>`).join(""):`<p class="life-plan-empty">この年の登録イベントはありません</p>`}
    </div>
  </div>`).join("");
}

function drawMortgageBalanceChart() {
  const canvas=$("mortgageBalanceChart"); if(!canvas) return;
  const ctx=canvas.getContext("2d"), dpr=window.devicePixelRatio||1, w=canvas.clientWidth||640, h=280;
  canvas.width=w*dpr; canvas.height=h*dpr; ctx.scale(dpr,dpr); ctx.clearRect(0,0,w,h);
  const x=mortgageMetrics(), data=x.projection.points;
  const styles=getComputedStyle(document.body), muted=styles.getPropertyValue("--muted").trim(), line=styles.getPropertyValue("--line").trim(), accent=styles.getPropertyValue("--accent").trim(), text=styles.getPropertyValue("--text").trim();
  if(!x.balance || data.length<2){ ctx.fillStyle=muted;ctx.textAlign="center";ctx.font="13px sans-serif";ctx.fillText("ローン残高と返済額を入力すると予測を表示します",w/2,h/2);$("mortgageChartBadge").textContent="未設定";$("mortgageChartSub").textContent="住宅ローンを入力すると表示されます";return; }
  const max=Math.max(...data.map(d=>d.balance),1), pad={left:58,right:16,top:22,bottom:40};
  const px=i=>pad.left+(data.length===1?0:i*(w-pad.left-pad.right)/(data.length-1));
  const py=v=>pad.top+(max-v)/max*(h-pad.top-pad.bottom);
  ctx.strokeStyle=line;ctx.lineWidth=1;ctx.font="10px sans-serif";ctx.fillStyle=muted;ctx.textAlign="right";
  for(let i=0;i<=4;i++){const yy=pad.top+i*(h-pad.top-pad.bottom)/4,val=max-i*max/4;ctx.beginPath();ctx.moveTo(pad.left,yy);ctx.lineTo(w-pad.right,yy);ctx.stroke();ctx.fillText(`${Math.round(val/10000)}万`,pad.left-7,yy+3)}
  ctx.beginPath();data.forEach((d,i)=>i?ctx.lineTo(px(i),py(d.balance)):ctx.moveTo(px(i),py(d.balance)));ctx.strokeStyle=accent;ctx.lineWidth=4;ctx.lineCap="round";ctx.lineJoin="round";ctx.stroke();
  const labelEvery=Math.max(1,Math.ceil(data.length/6));data.forEach((d,i)=>{ctx.beginPath();ctx.arc(px(i),py(d.balance),i===data.length-1?5:3,0,Math.PI*2);ctx.fillStyle=accent;ctx.fill();if(i%labelEvery===0||i===data.length-1){ctx.fillStyle=muted;ctx.textAlign="center";ctx.font="10px sans-serif";ctx.fillText(String(d.year),px(i),h-15)}});
  const end=x.projection.projectedEnd;$("mortgageChartBadge").textContent=end?`${end}年 完済見込み`:"要確認";$("mortgageChartSub").textContent=`現在 ${yen(x.balance)} → ${end?`${end}年に¥0見込み`:"返済額では完済時期を算出できません"}`;$("mortgageChartNote").textContent=`金利${num(state.mortgage.rate).toFixed(2)}%、毎月返済とボーナス返済を月割りして概算。実際の返済予定表とは差が出る場合があります。`;
  ctx.fillStyle=text;ctx.textAlign="left";ctx.font="700 11px sans-serif";ctx.fillText(yen(data[0].balance),pad.left,pad.top-7);
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
  $("monthlyPlans").textContent = yen(state.plans.reduce((s, p) => s + (p.method === "lump" ? 0 : num(p.monthly)), 0) + num(state.education.monthly));
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
  renderFutureSnapshot(); renderLifeGoalDashboard();
  renderLifeRoadmap();
  renderLifePlanTimeline();
  drawMortgageBalanceChart();

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

function historyValue(item, key) {
  if (item && item[key] != null) return num(item[key]);
  if (key === "investment") return Math.max(0, num(item?.financial) - num(state.cash) - educationTotal());
  if (key === "annualDividend") return 0;
  return num(item?.[key]);
}
function drawHistoryLine(canvasId, series, labels, options = {}) {
  const canvas = $(canvasId); if (!canvas) return;
  const ctx = canvas.getContext("2d"), dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 640, h = options.height || 260;
  canvas.width = w*dpr; canvas.height = h*dpr; ctx.scale(dpr,dpr); ctx.clearRect(0,0,w,h);
  const all = series.flatMap(s=>s.values).filter(Number.isFinite);
  if (!all.length) return;
  let min = Math.min(...all), max = Math.max(...all);
  if (options.zeroBase) min = 0;
  if (min===max) { max += Math.max(1000,Math.abs(max)*.1); min = options.zeroBase ? 0 : min-Math.max(1000,Math.abs(min)*.1); }
  const pad={left:58,right:16,top:20,bottom:38}, range=max-min||1;
  const x=i=>pad.left+(labels.length===1?(w-pad.left-pad.right)/2:i*(w-pad.left-pad.right)/(labels.length-1));
  const y=v=>pad.top+(max-v)/range*(h-pad.top-pad.bottom);
  const styles=getComputedStyle(document.body), grid=styles.getPropertyValue("--line").trim(), muted=styles.getPropertyValue("--muted").trim();
  ctx.font="10px sans-serif"; ctx.fillStyle=muted; ctx.textAlign="right"; ctx.strokeStyle=grid; ctx.lineWidth=1;
  for(let i=0;i<=4;i++){const yy=pad.top+i*(h-pad.top-pad.bottom)/4,val=max-i*range/4;ctx.beginPath();ctx.moveTo(pad.left,yy);ctx.lineTo(w-pad.right,yy);ctx.stroke();ctx.fillText(`${Math.round(val/10000)}万`,pad.left-7,yy+3)}
  series.forEach((s,si)=>{ctx.beginPath();s.values.forEach((v,i)=>i?ctx.lineTo(x(i),y(v)):ctx.moveTo(x(i),y(v)));ctx.strokeStyle=s.color;ctx.lineWidth=3;ctx.lineCap="round";ctx.lineJoin="round";ctx.stroke();s.values.forEach((v,i)=>{ctx.beginPath();ctx.arc(x(i),y(v),3.5,0,Math.PI*2);ctx.fillStyle=s.color;ctx.fill()})});
  labels.forEach((lab,i)=>{ctx.fillStyle=muted;ctx.textAlign="center";ctx.font="10px sans-serif";ctx.fillText(lab.slice(5)+"月",x(i),h-14)});
}
function renderHistoryDashboard() {
  if (!$('wealthHistoryChart')) return;
  const data=[...state.snapshots].sort((a,b)=>String(a.month).localeCompare(String(b.month))).slice(-12);
  const inv=investmentTotals(), financial=financialAssets(), annual=inv.dividend;
  const prev=data.length>1?data[data.length-2]:null;
  const current=data[data.length-1]||null;
  const signed=(v)=>v==null?'前月比 —':`前月比 ${v>=0?'+':''}${yen(v)}`;
  $('historyFinancialNow').textContent=yen(financial);
  $('historyInvestmentNow').textContent=yen(inv.market);
  $('historyDividendNow').textContent=yen(annual);
  $('historyFinancialChange').textContent=signed(prev?financial-num(prev.financial):null);
  $('historyInvestmentChange').textContent=signed(prev?inv.market-historyValue(prev,'investment'):null);
  $('historyDividendChange').textContent=signed(prev?annual-historyValue(prev,'annualDividend'):null);
  const highest=data.reduce((best,x)=>!best||num(x.financial)>num(best.financial)?x:best,null);
  $('historyHighest').textContent=yen(highest?highest.financial:financial);
  $('historyHighestMonth').textContent=highest?`${highest.month.replace('-','年')}月時点`:'今月時点';
  const labels=data.map(x=>x.month);
  const styles=getComputedStyle(document.body);
  drawHistoryLine('wealthHistoryChart',[{values:data.map(x=>num(x.financial)),color:styles.getPropertyValue('--accent').trim()},{values:data.map(x=>historyValue(x,'investment')),color:'#4f9478'}],labels,{height:280});
  drawHistoryLine('dividendHistoryChart',[{values:data.map(x=>historyValue(x,'annualDividend')),color:'#c24c9a'}],labels,{height:240,zeroBase:true});
  $('historyNote').textContent=data.length<2?'今月分を記録しました。来月以降、推移がつながります。':`直近${data.length}か月の資産・配当予想を記録しています。`;
}

function setupMonthOptions() {
  const previous = $("txMonth").value;
  const months = new Set(state.transactions.map(t => monthKey(t.date)));
  const now = new Date();
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const values = [...months].sort().reverse();
  $("txMonth").innerHTML = values.map(m => {
    const [y, mo] = m.split("-");
    return `<option value="${m}">${y}年${Number(mo)}月</option>`;
  }).join("");
  $("txMonth").value = values.includes(previous) ? previous : (values.includes(monthKey()) ? monthKey() : values[0]);
}
function renderBudgetDashboard() {
  const month = selectedBudgetMonth(), totals = budgetTotals(month), balance = totals.income - totals.expense;
  const monthItems = state.transactions.filter(t => String(t.date).startsWith(month));
  const incomeCount = monthItems.filter(t => t.kind === "income").length;
  const expenseCount = monthItems.filter(t => t.kind === "expense").length;
  const savingsRate = totals.income ? balance / totals.income * 100 : 0;
  $("budgetIncomeSummary").textContent = yen(totals.income);
  $("budgetExpenseSummary").textContent = yen(totals.expense);
  $("budgetBalanceSummary").textContent = yen(balance);
  $("budgetBalanceSummary").className = balance < 0 ? "negative" : "positive";
  $("budgetSavingsRate").textContent = `${savingsRate.toFixed(1)}%`;
  $("budgetSavingsRate").className = savingsRate < 0 ? "negative" : "positive";
  $("budgetIncomeCount").textContent = `${incomeCount}件`;
  $("budgetExpenseCount").textContent = `${expenseCount}件`;
  $("budgetTxCount").textContent = `${monthItems.length}件`;

  const limit = budgetLimitFor(month), remaining = limit - totals.expense;
  $("budgetLimitInput").value = limit || "";
  $("budgetLimitLabel").textContent = limit ? yen(limit) : "未設定";
  $("budgetSpentText").textContent = `支出 ${yen(totals.expense)}`;
  const usage = limit ? totals.expense / limit * 100 : 0;
  $("budgetUsageProgress").style.width = `${Math.min(100, usage)}%`;
  $("budgetUsageProgress").classList.toggle("over", Boolean(limit && totals.expense > limit));
  $("budgetUsageText").textContent = limit ? `使用率 ${usage.toFixed(1)}%` : "使用率 0%";
  $("budgetRemainingText").textContent = !limit ? "予算を設定すると使いすぎを確認できます" : remaining >= 0 ? `残り ${yen(remaining)}` : `${yen(Math.abs(remaining))} 予算オーバー`;
  $("budgetRemainingText").className = limit && remaining < 0 ? "negative" : "";

  renderCategoryBreakdown(month, totals.expense);
  drawBudgetTrend(month);
}
function renderCategoryBreakdown(month, totalExpense) {
  const items = categoryExpenseTotals(month);
  $("categoryBreakdown").innerHTML = items.length ? items.map(([name, value], index) => {
    const rate = totalExpense ? value / totalExpense * 100 : 0;
    return `<div class="category-row"><div class="category-row-head"><span><i>${index + 1}</i>${escapeHtml(name)}</span><strong>${yen(value)}</strong></div><div class="category-track"><div style="width:${rate}%"></div></div><small>${rate.toFixed(1)}%</small></div>`;
  }).join("") : `<div class="empty budget-empty">この月の支出を入力すると、カテゴリ別に表示します。</div>`;
}
function drawBudgetTrend(anchorMonth = selectedBudgetMonth()) {
  const canvas = $("budgetTrendChart"); if (!canvas) return;
  const ctx = canvas.getContext("2d"), dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 640, h = 260;
  canvas.width = w * dpr; canvas.height = h * dpr; ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
  const months = budgetMonthKeys(anchorMonth, 6);
  const values = months.map(m => ({ month: m, ...budgetTotals(m) }));
  const max = Math.max(1, ...values.flatMap(v => [v.income, v.expense]));
  const muted = getComputedStyle(document.body).getPropertyValue("--muted").trim();
  const line = getComputedStyle(document.body).getPropertyValue("--line").trim();
  const good = getComputedStyle(document.body).getPropertyValue("--good").trim();
  const bad = getComputedStyle(document.body).getPropertyValue("--bad").trim();
  const pad = { left: 45, right: 10, top: 18, bottom: 38 }, chartH = h - pad.top - pad.bottom;
  ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.font = "10px sans-serif"; ctx.fillStyle = muted; ctx.textAlign = "right";
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + chartH * i / 4, value = max * (1 - i / 4);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
    ctx.fillText(`${Math.round(value / 10000)}万`, pad.left - 6, y + 3);
  }
  const groupW = (w - pad.left - pad.right) / months.length, barW = Math.min(22, groupW * .27);
  values.forEach((v, i) => {
    const center = pad.left + groupW * i + groupW / 2;
    const incomeH = chartH * v.income / max, expenseH = chartH * v.expense / max;
    ctx.fillStyle = good; ctx.fillRect(center - barW - 2, pad.top + chartH - incomeH, barW, incomeH);
    ctx.fillStyle = bad; ctx.fillRect(center + 2, pad.top + chartH - expenseH, barW, expenseH);
    ctx.fillStyle = muted; ctx.textAlign = "center"; ctx.font = "10px sans-serif";
    ctx.fillText(`${Number(v.month.slice(5))}月`, center, h - 16);
  });
  ctx.textAlign = "left"; ctx.font = "11px sans-serif";
  ctx.fillStyle = good; ctx.fillRect(pad.left, 4, 10, 10); ctx.fillStyle = muted; ctx.fillText("収入", pad.left + 15, 13);
  ctx.fillStyle = bad; ctx.fillRect(pad.left + 58, 4, 10, 10); ctx.fillStyle = muted; ctx.fillText("支出", pad.left + 73, 13);
}
function renderTransactions() {
  setupMonthOptions();
  const query = $("txSearch").value.trim().toLowerCase(), month = selectedBudgetMonth();
  const list = state.transactions.filter(t => String(t.date).startsWith(month) && `${t.category} ${t.memo}`.toLowerCase().includes(query)).sort((a, b) => b.date.localeCompare(a.date));
  $("txList").innerHTML = list.length ? list.map(t => `<article class="item-card compact transaction-card"><div><div class="item-title">${escapeHtml(t.category || "未分類")}</div><div class="item-sub">${escapeHtml(t.date)}${t.memo ? `・${escapeHtml(t.memo)}` : ""}</div></div><div class="tx-right"><strong class="${t.kind === 'expense' ? 'negative' : 'positive'}">${t.kind === 'expense' ? '-' : '+'}${yen(t.amount)}</strong><div class="tx-actions"><button class="edit-button" data-edit-tx="${t.id}">編集</button><button class="delete-button" data-delete-tx="${t.id}">削除</button></div></div></article>`).join("") : `<div class="empty">この月の記録はありません。</div>`;
  renderBudgetDashboard();
}
function assetDividendYield(a) {
  const m = assetMetrics(a);
  return m.invested ? num(a.dividend) / m.invested * 100 : 0;
}
function planMetrics(p) {
  const method = p.method === "lump" ? "lump" : "monthly";
  const months = method === "monthly" ? monthsSince(p.start) : 0;
  const estimated = method === "monthly" ? months * num(p.monthly) : 0;
  const hasActualInvested = p.invested !== "" && p.invested != null;
  const contributed = hasActualInvested ? num(p.invested) : estimated;
  const value = p.value === "" || p.value == null ? contributed : num(p.value);
  return {
    method,
    months,
    estimated,
    contributed,
    value,
    profit: value - contributed,
    contributionSource: hasActualInvested ? "actual" : "estimated"
  };
}
function normalizeCheckText(value) {
  return String(value ?? "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "");
}
function duplicateGroups(items, keyMaker) {
  const grouped = new Map();
  for (const item of items) {
    const key = keyMaker(item);
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }
  return [...grouped.values()].filter(group => group.length > 1);
}
function assetDuplicateKey(a) {
  return [normalizeOwner(a.owner), normalizeCheckText(a.name), normalizeCheckText(a.broker), normalizeCheckText(a.account), normalizeCheckText(a.type), String(a.date || ""), num(a.quantity), num(a.cost), num(a.price)].join("|");
}
function planDuplicateKey(p) {
  return [normalizeOwner(p.owner), normalizeCheckText(p.name), normalizeCheckText(p.broker), normalizeCheckText(p.account), p.method === "lump" ? "lump" : "monthly", String(p.start || ""), num(p.monthly), p.invested == null ? "" : num(p.invested), p.value == null ? "" : num(p.value)].join("|");
}
function purchaseDuplicateKey(item) {
  return [normalizeOwner(item.owner), String(item.date || ""), item.kind === "growth" ? "growth" : "tsumitate", normalizeCheckText(item.name), normalizeCheckText(item.broker), num(item.amount)].join("|");
}
function duplicateConfirmationKey(kind, group) {
  const ids = group.map(item => String(item.id || "")).filter(Boolean).sort();
  return `${kind}:${ids.join(",")}`;
}
function isDuplicateGroupConfirmed(kind, group) {
  return state.confirmedDuplicateGroups.includes(duplicateConfirmationKey(kind, group));
}
function duplicateConfirmButton(label, kind, group) {
  return checkActionButton(label, "data-confirm-duplicate", duplicateConfirmationKey(kind, group));
}
function checkActionButton(label, dataName, value) {
  return `<button class="data-check-action" ${dataName}="${escapeHtml(value)}">${escapeHtml(label)}</button>`;
}
function investmentDataChecks() {
  const assets = visibleAssets();
  const plans = visiblePlans();
  const purchases = nisaPurchasesFor(currentOwner, currentNisaYear());
  const issues = [];

  const assetDuplicates = duplicateGroups(assets, assetDuplicateKey).filter(group => !isDuplicateGroupConfirmed("asset", group));
  for (const group of assetDuplicates) {
    const item = group[0];
    const actions = [
      checkActionButton(`${item.name}を一覧で確認`, "data-find-asset", item.name),
      duplicateConfirmButton("別々の買付で正しい", "asset", group)
    ].join("");
    issues.push({
      tone: "warn", icon: "確", title: "同じ内容の保有資産があります",
      text: `${item.name}が${group.length}件あります。100株ずつ2回買った場合など、別々の買付なら問題ありません。誤登録の場合だけ、保有一覧から不要な登録を削除してください。`, actions
    });
  }

  const planDuplicates = duplicateGroups(plans, planDuplicateKey).filter(group => !isDuplicateGroupConfirmed("plan", group));
  for (const group of planDuplicates) {
    const item = group[0];
    const actions = [
      checkActionButton(`${item.name}を一覧で確認`, "data-find-plan", item.name),
      duplicateConfirmButton("別々の積立で正しい", "plan", group)
    ].join("");
    issues.push({
      tone: "warn", icon: "確", title: "同じ内容の積立登録があります",
      text: `${item.name}が${group.length}件あります。別口座や別契約の積立なら問題ありません。同じ評価額を誤って2回入れた場合だけ修正してください。`, actions
    });
  }

  const purchaseDuplicates = duplicateGroups(purchases, purchaseDuplicateKey).filter(group => !isDuplicateGroupConfirmed("purchase", group));
  for (const group of purchaseDuplicates) {
    const item = group[0];
    const actions = duplicateConfirmButton("別々の買付記録で正しい", "purchase", group);
    issues.push({
      tone: "warn", icon: "確", title: "同じ内容のNISA買付記録があります",
      text: `${item.name || "商品名なし"}が${group.length}件あります。同じ日に同額を複数回買った記録なら問題ありません。誤登録の場合だけ買付履歴から不要な記録を削除してください。`, actions
    });
  }

  const adjustments = assets.filter(a => /暫定調整|仮調整|調整額|調整分/.test(String(a.name || "")));
  if (adjustments.length) {
    const total = adjustments.reduce((sum, a) => sum + assetMetrics(a).market, 0);
    const labels = adjustments.map(a => `${a.owner} ${a.name} ${yen(assetMetrics(a).market)}`).join("・");
    issues.push({
      tone: "warn", icon: "△", title: "暫定調整の資産が残っています",
      text: `${labels}。合計 ${yen(total)}。まだ個別登録していない資産を表すなら残し、すでに個別入力済みなら二重計上になります。`,
      actions: checkActionButton("暫定調整を確認", "data-find-asset", "暫定調整")
    });
  }

  const suspiciousPrices = assets.filter(a => {
    const q = num(a.quantity), cost = num(a.cost), price = num(a.price);
    if (!q || !cost || !price) return false;
    const ratio = price / cost;
    return ratio < 0.02 || ratio > 50;
  });
  if (suspiciousPrices.length) {
    const details = suspiciousPrices.map(a => `${a.name}：取得 ${yen(a.cost)}／現在 ${yen(a.price)}`).join("・");
    const actions = suspiciousPrices.map(a => checkActionButton(`${a.name}を編集`, "data-edit-asset", a.id)).join("");
    issues.push({ tone: "warn", icon: "桁", title: "価格の桁を確認したい商品があります", text: `${details}。小数点やカンマの入力位置を証券会社の表示と照らしてください。`, actions });
  }

  const estimatedPlans = plans.filter(p => planMetrics(p).contributionSource === "estimated");
  if (estimatedPlans.length) {
    const labels = estimatedPlans.map(p => p.name).join("・");
    const actions = estimatedPlans.map(p => checkActionButton(`${p.name}を編集`, "data-edit-plan", p.id)).join("");
    issues.push({ tone: "warn", icon: "概", title: "積立元本が推定計算のままです", text: `${estimatedPlans.length}件（${labels}）。開始日×現在の月額で計算しているため、途中で金額変更した場合は評価損益がずれます。`, actions });
  }

  const assetPlanOverlaps = [];
  const assetKeys = new Set(assets.map(a => [normalizeOwner(a.owner), normalizeCheckText(a.name), normalizeCheckText(a.broker), normalizeCheckText(a.account)].join("|")));
  for (const p of plans) {
    const key = [normalizeOwner(p.owner), normalizeCheckText(p.name), normalizeCheckText(p.broker), normalizeCheckText(p.account)].join("|");
    if (assetKeys.has(key)) assetPlanOverlaps.push(p);
  }
  if (assetPlanOverlaps.length) {
    const labels = assetPlanOverlaps.map(p => p.name).join("・");
    issues.push({ tone: "warn", icon: "重", title: "保有資産と積立の両方に同じ商品があります", text: `${labels}。別口座・別保有分なら問題ありませんが、同じ評価額を両方へ入れている場合は二重計上です。`, actions: assetPlanOverlaps.map(p => checkActionButton(`${p.name}を確認`, "data-find-plan", p.name)).join("") });
  }

  return { issues, assets, plans };
}
function renderInvestmentDataCheck() {
  const result = investmentDataChecks();
  const issues = result.issues;
  const dangerous = issues.some(issue => issue.tone === "danger");
  const count = issues.length;
  const countEl = $("dataCheckCount");
  const card = $("investmentDataCheckCard");
  countEl.textContent = count ? `要確認 ${count}件` : "点検OK";
  countEl.className = `data-check-count ${count ? (dangerous ? "danger" : "warn") : "good"}`;
  card.classList.toggle("has-danger", dangerous);
  card.classList.toggle("has-warning", count > 0 && !dangerous);
  $("investmentDataCheckSummary").innerHTML = count
    ? `<strong>${dangerous ? "優先して確認したい項目があります" : "入力内容を確認したい項目があります"}</strong><span>${currentOwner}の保有資産・積立・NISA買付履歴を端末内で点検しました。</span>`
    : `<strong>現在のデータに大きな入力ズレは見つかりません</strong><span>${currentOwner}の本人・夫・家族合計の集計も自動計算されています。</span>`;
  $("investmentDataCheckList").innerHTML = count ? issues.map(issue => `<article class="data-check-item ${issue.tone}"><span class="data-check-icon">${escapeHtml(issue.icon)}</span><div><strong>${escapeHtml(issue.title)}</strong><p>${escapeHtml(issue.text)}</p>${issue.actions ? `<div class="data-check-actions">${issue.actions}</div>` : ""}</div></article>`).join("") : `<div class="data-check-ok"><span>✓</span><p>未確認の同一登録・暫定調整・極端な価格差・推定元本は見つかりませんでした。</p></div>`;
  const resetButton = $("resetDuplicateConfirmations");
  resetButton.classList.toggle("hidden", state.confirmedDuplicateGroups.length === 0);
  resetButton.textContent = `同一登録の確認済みをリセット（${state.confirmedDuplicateGroups.length}件）`;
}

function investmentAnalysis() {
  const assets = visibleAssets(), plans = visiblePlans();
  const totals = assets.reduce((acc, a) => {
    const m = assetMetrics(a);
    acc.market += m.market; acc.invested += m.invested; acc.profit += m.profit; acc.dividend += num(a.dividend);
    return acc;
  }, { market: 0, invested: 0, profit: 0, dividend: 0 });
  for (const p of plans) {
    const m = planMetrics(p);
    totals.market += m.value; totals.invested += m.contributed; totals.profit += m.profit;
  }
  totals.profitRate = totals.invested ? totals.profit / totals.invested * 100 : 0;
  totals.yieldRate = totals.invested ? totals.dividend / totals.invested * 100 : 0;
  totals.assetCount = assets.length;
  totals.planCount = plans.length;
  totals.count = assets.length + plans.length;
  totals.monthlyPlan = plans.reduce((sum, p) => sum + num(p.monthly), 0);
  totals.missingPrices = assets.filter(a => num(a.quantity) > 0 && num(a.price) <= 0).length;
  return totals;
}
function renderInvestmentAnalysis() {
  const t = investmentAnalysis();
  $("analysisInvested").textContent = yen(t.invested);
  $("analysisProfitRate").textContent = `${t.profitRate >= 0 ? "+" : ""}${t.profitRate.toFixed(1)}%`;
  $("analysisProfitRate").className = t.profitRate < 0 ? "negative" : "positive";
  $("analysisYield").textContent = `利回り ${t.yieldRate.toFixed(2)}%`;
  $("analysisCount").textContent = `${t.count}商品`;
  $("assetPlanCountSub").textContent = `資産${t.assetCount}・積立${t.planCount}`;
  $("investMonthlyPlanSummary").textContent = yen(t.monthlyPlan);
  $("investAnnualPlanSummary").textContent = `年間 ${yen(t.monthlyPlan * 12)}`;
  $("missingPriceCount").textContent = `${t.missingPrices}件`;
  $("missingPriceCount").className = t.missingPrices ? "negative" : "positive";
  drawInvestmentAllocation();
  renderInvestmentAccountBreakdown();
  renderInvestmentInsights();
  renderInvestmentDataCheck();
}
function drawInvestmentAllocation() {
  const canvas = $("investmentAllocationChart"), ctx = canvas.getContext("2d"), dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 640, h = 230;
  canvas.width = w * dpr; canvas.height = h * dpr; ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
  const colors = ["#8957e5", "#d946a2", "#2f8f71", "#f59e0b", "#64748b", "#0ea5e9"];
  const grouped = {};
  for (const a of visibleAssets()) grouped[a.type || "その他"] = (grouped[a.type || "その他"] || 0) + assetMetrics(a).market;
  for (const p of visiblePlans()) grouped["積立・NISA"] = (grouped["積立・NISA"] || 0) + planMetrics(p).value;
  const parts = Object.entries(grouped).map(([name, value], i) => ({ name, value, color: colors[i % colors.length] })).filter(x => x.value > 0).sort((a,b)=>b.value-a.value);
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) {
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--muted"); ctx.textAlign = "center"; ctx.font = "13px sans-serif";
    ctx.fillText("保有資産を登録すると表示されます", w / 2, h / 2); $("investmentAllocationLegend").innerHTML = ""; return;
  }
  const left = 18, right = 18, top = 26, barH = 32, usable = w - left - right;
  let x = left;
  for (const p of parts) {
    const bw = usable * p.value / total; ctx.fillStyle = p.color; ctx.fillRect(x, top, Math.max(1,bw), barH); x += bw;
  }
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--text"); ctx.font = "800 24px sans-serif"; ctx.textAlign = "center";
  ctx.fillText(yen(total), w / 2, 111);
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--muted"); ctx.font = "12px sans-serif"; ctx.fillText("投資評価額", w / 2, 133);
  $("investmentAllocationLegend").innerHTML = parts.map(p => `<span><i style="background:${p.color}"></i>${escapeHtml(p.name)} ${Math.round(p.value / total * 100)}%</span>`).join("");
}
function investmentAccountParts() {
  const grouped = {};
  for (const a of visibleAssets()) grouped[a.account || "未設定"] = (grouped[a.account || "未設定"] || 0) + assetMetrics(a).market;
  for (const p of visiblePlans()) grouped[p.account || "未設定"] = (grouped[p.account || "未設定"] || 0) + planMetrics(p).value;
  return Object.entries(grouped).map(([name,value])=>({name,value})).filter(x=>x.value>0).sort((a,b)=>b.value-a.value);
}
function renderInvestmentAccountBreakdown() {
  const parts = investmentAccountParts();
  const total = parts.reduce((s,p)=>s+p.value,0);
  $("accountBreakdown").innerHTML = parts.length ? parts.map((p,i)=>{
    const rate = total ? p.value/total*100 : 0;
    return `<div class="account-row"><div class="account-row-head"><span>${escapeHtml(p.name)}</span><strong>${yen(p.value)}</strong></div><div class="account-track"><div style="width:${rate}%"></div></div><small>${rate.toFixed(1)}%</small></div>`;
  }).join("") : '<div class="empty compact-empty">口座情報がありません。</div>';
}
function renderInvestmentInsights() {
  const assets = visibleAssets(), plans = visiblePlans(), totals = investmentAnalysis();
  const items = [];
  const valued = assets.map(a=>({name:a.name,market:assetMetrics(a).market})).filter(x=>x.market>0).sort((a,b)=>b.market-a.market);
  if (valued.length && totals.market) {
    const topRate = valued[0].market / totals.market * 100;
    if (topRate >= 45) items.push({tone:"warn", icon:"!", text:`${valued[0].name}が投資全体の${topRate.toFixed(0)}%。1商品への偏りが大きめです。`});
    else items.push({tone:"good", icon:"✓", text:`最大の商品比率は${topRate.toFixed(0)}%。極端な集中は見られません。`});
  }
  if (totals.missingPrices) items.push({tone:"warn", icon:"¥", text:`現在価格が未入力の商品が${totals.missingPrices}件あります。入力すると損益が正確になります。`});
  if (totals.monthlyPlan) items.push({tone:"good", icon:"↻", text:`毎月${yen(totals.monthlyPlan)}、年間では${yen(totals.monthlyPlan*12)}を積み立てる設定です。`});
  const noDividendMonth = assets.filter(a => num(a.dividend) > 0 && !parseDividendMonths(a.dividendMonths).length).length;
  if (noDividendMonth) items.push({tone:"warn", icon:"月", text:`配当月が未入力の商品が${noDividendMonth}件あります。配当カレンダーに反映するには月を入力してください。`});
  if (!items.length) items.push({tone:"neutral", icon:"i", text:"保有資産や積立を登録すると、投資バランスを自動で確認します。"});
  $("investmentInsightList").innerHTML = items.slice(0,4).map(x=>`<div class="investment-insight ${x.tone}"><span>${x.icon}</span><p>${escapeHtml(x.text)}</p></div>`).join("");
}
function renderRanking() {
  const assets = visibleAssets().map(a => ({ a, m: assetMetrics(a), yieldRate: assetDividendYield(a) }));
  const sorted = [...assets].sort((x, y) => currentRanking === "market" ? y.m.market - x.m.market : currentRanking === "profit" ? y.m.profit - x.m.profit : y.yieldRate - x.yieldRate).slice(0, 8);
  const totalMarket = assets.reduce((s,x)=>s+x.m.market,0);
  $("rankingList").innerHTML = sorted.length ? sorted.map((x, i) => {
    const value = currentRanking === "market" ? yen(x.m.market) : currentRanking === "profit" ? signedYen(x.m.profit) : `${x.yieldRate.toFixed(2)}%`;
    const cls = currentRanking === "profit" ? (x.m.profit < 0 ? "negative" : "positive") : "";
    const share = totalMarket ? x.m.market/totalMarket*100 : 0;
    return `<article class="ranking-item"><span class="rank-badge">${i + 1}</span><div class="ranking-main"><strong>${escapeHtml(x.a.name)}</strong><small>${escapeHtml(x.a.type)}・${escapeHtml(x.a.owner)}・構成比${share.toFixed(1)}%</small><div class="ranking-track"><div style="width:${Math.min(100,share)}%"></div></div></div><b class="${cls}">${value}</b></article>`;
  }).join("") : `<div class="empty">ランキングを表示する保有資産がありません。</div>`;
}
function renderOwnerSummary() {
  const t = currentOwner === "家族合計" ? investmentTotals() : investmentTotals(currentOwner);
  $("ownerMarket").textContent = yen(t.market); $("ownerProfit").textContent = signedYen(t.profit);
  $("ownerProfit").className = t.profit < 0 ? "negative" : "positive"; $("ownerDividend").textContent = yen(t.dividend);
  $("investOwnerLabel").textContent = currentOwner === "家族合計" ? "家族の投資資産" : `${currentOwner}の投資資産`;
  const editable = currentOwner !== "家族合計";
  $("assetFormWrap").classList.toggle("hidden", !editable); $("planFormWrap").classList.toggle("hidden", !editable);
}
function renderAssets() {
  const q = $("assetSearch").value.trim().toLowerCase(), filter = $("assetFilter").value, sort = $("assetSort").value;
  const allVisible = visibleAssets();
  const totalMarket = allVisible.reduce((s,a)=>s+assetMetrics(a).market,0);
  const list = allVisible.filter(a => (filter === "all" || a.type === filter) && `${a.name} ${a.broker || ""}`.toLowerCase().includes(q)).sort((a, b) => {
    const am = assetMetrics(a), bm = assetMetrics(b);
    if (sort === "profitDesc") return bm.profit - am.profit;
    if (sort === "profitAsc") return am.profit - bm.profit;
    if (sort === "yieldDesc") return assetDividendYield(b) - assetDividendYield(a);
    if (sort === "nameAsc") return String(a.name).localeCompare(String(b.name), "ja");
    return bm.market - am.market;
  });
  $("assetCountLabel").textContent = `${list.length}件`;
  $("assetList").innerHTML = list.length ? list.map(a => {
    const m = assetMetrics(a), share = totalMarket ? m.market/totalMarket*100 : 0;
    const priceMissing = num(a.quantity)>0 && num(a.price)<=0;
    const nisaButton = currentOwner !== "家族合計" && nisaPlanKind(a.account) ? `<button class="record-button" data-record-asset="${a.id}">買付を記録</button>` : "";
    return `<article class="item-card investment-item-card"><div class="item-head"><div><div class="investment-chip-row"><span class="asset-type-chip">${escapeHtml(a.type)}</span><span class="account-chip">${escapeHtml(a.account)}</span>${priceMissing?'<span class="missing-chip">価格未入力</span>':''}</div><div class="item-title">${escapeHtml(a.name)}</div><div class="item-sub">${escapeHtml(a.owner)}${a.broker ? `・${escapeHtml(a.broker)}` : ""}・構成比 ${share.toFixed(1)}%</div></div><div class="item-value">${yen(m.market)}<small class="${m.profit < 0 ? 'negative' : 'positive'}">${signedYen(m.profit)}（${m.rate.toFixed(1)}%）</small></div></div><div class="holding-progress"><div style="width:${Math.min(100,share)}%"></div></div><div class="item-grid"><div><span>保有数</span><strong>${num(a.quantity).toLocaleString("ja-JP")}</strong></div><div><span>取得単価</span><strong>${yen(a.cost)}</strong></div><div><span>現在価格</span><strong>${yen(a.price)}</strong></div><div><span>取得総額</span><strong>${yen(m.invested)}</strong></div><div><span>年間配当</span><strong>${yen(a.dividend)}</strong></div><div><span>入力日</span><strong>${escapeHtml(a.date || "—")}</strong></div></div><div class="item-actions">${nisaButton}<button class="edit-button" data-edit-asset="${a.id}">編集</button><button class="delete-button" data-delete-asset="${a.id}">削除</button></div></article>`;
  }).join("") : `<div class="empty">条件に合う保有資産はありません。</div>`;
}
function renderPlans() {
  const list = visiblePlans();
  const totals = list.reduce((acc, p) => {
    const m = planMetrics(p);
    if (m.method === "monthly") acc.monthly += num(p.monthly);
    acc.value += m.value;
    acc.contributed += m.contributed;
    acc.profit += m.profit;
    return acc;
  }, { monthly: 0, value: 0, contributed: 0, profit: 0 });
  $("planCountLabel").textContent = `${list.length}件`;
  $("planMonthlyTotalView").textContent = yen(totals.monthly);
  $("planAnnualTotalView").textContent = yen(totals.monthly * 12);
  $("planInvestedTotalView").textContent = yen(totals.contributed);
  $("planValueTotalView").textContent = yen(totals.value);
  $("planProfitTotalView").textContent = signedYen(totals.profit);
  $("planProfitTotalView").className = totals.profit < 0 ? "negative" : "positive";
  $("planList").innerHTML = list.length ? list.map(p => {
    const m = planMetrics(p);
    const methodLabel = m.method === "monthly" ? "毎月積立" : "一括購入";
    const mainAmount = m.method === "monthly" ? `月 ${yen(p.monthly)}` : "一括購入";
    const periodLabel = m.method === "monthly" ? "積立月数" : "買付方法";
    const periodValue = m.method === "monthly" ? `${m.months}か月` : "一括";
    const sourceChip = m.contributionSource === "estimated" ? '<span class="estimate-chip">元本は推定</span>' : '';
    const profitLabel = m.contributionSource === "estimated" ? "推定評価損益" : "評価損益";
    const nisaButton = currentOwner !== "家族合計" && nisaPlanKind(p.account) ? `<button class="record-button" data-record-plan="${p.id}">買付を記録</button>` : "";
    return `<article class="item-card investment-item-card"><div class="item-head"><div><div class="investment-chip-row"><span class="asset-type-chip">${methodLabel}</span><span class="account-chip">${escapeHtml(p.account)}</span>${sourceChip}</div><div class="item-title">${escapeHtml(p.name)}</div><div class="item-sub">${escapeHtml(p.owner)}${p.broker ? `・${escapeHtml(p.broker)}` : ""}</div></div><div class="item-value">${mainAmount}<small class="${m.profit < 0 ? 'negative' : 'positive'}">評価 ${yen(m.value)}</small></div></div><div class="item-grid"><div><span>${m.method === "monthly" ? "積立開始日" : "購入日"}</span><strong>${escapeHtml(p.start || "—")}</strong></div><div><span>${periodLabel}</span><strong>${periodValue}</strong></div><div><span>累計買付額</span><strong>${yen(m.contributed)}</strong></div><div><span>${profitLabel}</span><strong class="${m.profit < 0 ? 'negative' : 'positive'}">${signedYen(m.profit)}</strong></div></div><div class="item-actions">${nisaButton}<button class="edit-button" data-edit-plan="${p.id}">編集</button><button class="delete-button" data-delete-plan="${p.id}">削除</button></div></article>`;
  }).join("") : `<div class="empty">積立・NISA商品はまだありません。</div>`;
}
function currentDividendYear() { return new Date().getFullYear(); }
function visibleDividendReceipts(year = currentDividendYear()) {
  return state.dividendReceipts.filter(item => {
    const itemYear = Number(String(item.date || "").slice(0, 4));
    return itemYear === year && (currentOwner === "家族合計" || normalizeOwner(item.owner) === currentOwner);
  });
}
function dividendSchedule() {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amount: 0, names: [], items: [] }));
  for (const a of visibleAssets()) {
    const dividend = num(a.dividend), ms = parseDividendMonths(a.dividendMonths);
    if (!dividend || !ms.length) continue;
    const perMonth = dividend / ms.length;
    for (const m of ms) {
      months[m - 1].amount += perMonth;
      months[m - 1].names.push(a.name);
      months[m - 1].items.push({ name: a.name, amount: perMonth });
    }
  }
  return months;
}
function renderDividendAssetOptions() {
  const select = $("dividendReceiptAsset");
  if (!select) return;
  const current = select.value;
  const list = visibleAssets().filter(a => num(a.dividend) > 0).sort((a,b)=>String(a.name).localeCompare(String(b.name),"ja"));
  select.innerHTML = '<option value="">銘柄を選択</option>' + list.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}${currentOwner === "家族合計" ? `（${escapeHtml(a.owner)}）` : ""}</option>`).join("");
  if ([...select.options].some(o => o.value === current)) select.value = current;
}
function clearDividendReceiptForm() {
  if (!$("dividendReceiptId")) return;
  $("dividendReceiptId").value = "";
  $("dividendReceiptDate").value = today();
  $("dividendReceiptAsset").value = "";
  $("dividendReceiptAmount").value = "";
  $("dividendReceiptMemo").value = "";
  $("saveDividendReceiptButton").textContent = "受取を記録";
  $("cancelDividendReceiptEdit").classList.add("hidden");
}
function renderDividendCalendar() {
  if (!$("dividendAnnualView")) return;
  const months = dividendSchedule();
  const year = currentDividendYear();
  const receipts = visibleDividendReceipts(year);
  const annual = months.reduce((s,m)=>s+m.amount,0);
  const received = receipts.reduce((s,item)=>s+num(item.amount),0);
  const remaining = Math.max(0, annual - received);
  const currentMonth = new Date().getMonth()+1;
  const upcoming = [...months.slice(currentMonth-1), ...months.slice(0,currentMonth-1)].find(m=>m.amount>0);
  const maxMonth = Math.max(1, ...months.map(m=>m.amount));

  $("dividendAnnualView").textContent = yen(annual);
  $("dividendReceivedView").textContent = yen(received);
  $("dividendRemainingView").textContent = yen(remaining);
  $("dividendReceiptCountView").textContent = `${receipts.length}件を記録`;
  $("dividendNextView").textContent = upcoming ? `${upcoming.month}月 ${yen(upcoming.amount)}` : "未設定";
  $("dividendNextNamesView").textContent = upcoming ? [...new Set(upcoming.names)].join("・") : "配当月を登録してください";
  $("dividendReceiptYearLabel").textContent = `${year}年`;

  const notice = $("dividendNoticeCard");
  if (!annual) {
    notice.className = "card dividend-notice-card neutral";
    notice.innerHTML = '<strong>配当予定はまだありません</strong><p>保有資産の編集から、年間配当と配当月を登録すると表示されます。</p>';
  } else if (upcoming && upcoming.month === currentMonth) {
    notice.className = "card dividend-notice-card now";
    notice.innerHTML = `<strong>今月は配当予定があります</strong><p>${escapeHtml([...new Set(upcoming.names)].join("・"))}　予定 ${yen(upcoming.amount)}</p>`;
  } else if (upcoming) {
    notice.className = "card dividend-notice-card upcoming";
    notice.innerHTML = `<strong>次は${upcoming.month}月の配当予定</strong><p>${escapeHtml([...new Set(upcoming.names)].join("・"))}　予定 ${yen(upcoming.amount)}</p>`;
  } else {
    notice.className = "card dividend-notice-card neutral";
    notice.innerHTML = '<strong>配当月を確認してください</strong><p>年間配当が登録されていても、配当月がない商品はカレンダーに入りません。</p>';
  }

  $("dividendCalendar").innerHTML = months.map(m => `<div class="month-cell ${m.amount ? 'has-dividend' : ''}"><span>${m.month}月</span><strong>${yen(m.amount)}</strong><small>${escapeHtml([...new Set(m.names)].join("・"))}</small></div>`).join("");
  $("dividendMonthlyBars").innerHTML = months.map(m => `<div class="dividend-bar-row"><span>${m.month}月</span><div class="dividend-bar-track"><div style="width:${m.amount/maxMonth*100}%"></div></div><strong>${yen(m.amount)}</strong></div>`).join("");

  renderDividendAssetOptions();
  $("dividendReceiptList").innerHTML = receipts.length ? [...receipts].sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(item => `<article class="item-card dividend-receipt-card"><div class="item-head"><div><div class="item-title">${escapeHtml(item.name || "配当金")}</div><div class="item-sub">${escapeHtml(item.owner)}・${escapeHtml(item.date || "—")}${item.memo ? `・${escapeHtml(item.memo)}` : ""}</div></div><div class="item-value positive">${yen(item.amount)}</div></div><div class="item-actions"><button class="edit-button" data-edit-dividend-receipt="${item.id}">編集</button><button class="delete-button" data-delete-dividend-receipt="${item.id}">削除</button></div></article>`).join("") : '<div class="empty">今年受け取った配当金を記録すると、受取済みと残り予定が分かります。</div>';
}
function setInvestmentView(view) {
  currentInvestmentView = view;
  const map = { assets:"investmentAssetsView", plans:"investmentPlansView", ranking:"investmentRankingView", dividend:"investmentDividendView" };
  document.querySelectorAll(".investment-view-tab").forEach(b=>b.classList.toggle("active",b.dataset.investView===view));
  document.querySelectorAll(".investment-view").forEach(v=>v.classList.toggle("active",v.id===map[view]));
  if (view === "ranking") renderRanking();
  if (view === "dividend") renderDividendCalendar();
}
function renderLifeEvents() {
  const list = [...state.lifeEvents].sort((a,b) => Number(a.year)-Number(b.year) || String(a.title).localeCompare(String(b.title), "ja"));
  $("lifeEventList").innerHTML = list.length ? list.map(e => `<article class="timeline-item"><div class="timeline-year">${escapeHtml(e.year)}</div><div class="timeline-dot"></div><div class="timeline-card"><div><strong>${escapeHtml(e.person)}｜${escapeHtml(e.title)}</strong><small>${num(e.cost) ? `予定費用 ${yen(e.cost)}` : "費用未設定"}</small></div><div class="item-actions"><button class="edit-button" data-edit-event="${e.id}">編集</button><button class="delete-button" data-delete-event="${e.id}">削除</button></div></div></article>`).join("") : `<div class="empty">予定はまだありません。</div>`;
}
function clearEventForm() {
  $("eventId").value = ""; $("eventYear").value = ""; $("eventTitle").value = ""; $("eventCost").value = ""; $("eventPerson").value = "家族";
  $("saveEventButton").textContent = "予定を追加"; $("cancelEventEdit").classList.add("hidden");
}
function mortgageFormValues() {
  const balance = num($("mortgageBalance")?.value);
  const originalInput = num($("mortgageOriginalBalance")?.value);
  return {
    originalBalance: Math.max(originalInput, balance),
    balance,
    rate: num($("mortgageRate")?.value),
    monthly: num($("mortgageMonthly")?.value),
    bonusAnnual: num($("mortgageBonus")?.value),
    endYear: Number($("mortgageEndYear")?.value) || 0,
    extra: num($("mortgageExtra")?.value)
  };
}
function previewMortgageProgressFromForm() {
  if (!$("mortgageOriginalBalance") || !$("mortgageBalance")) return;
  const original = num($("mortgageOriginalBalance").value);
  const balance = num($("mortgageBalance").value);
  const paid = original > 0 ? Math.max(0, original - balance) : 0;
  const progress = original > 0 ? Math.min(100, paid / original * 100) : 0;
  $("mortgagePaidSummary").textContent = `${yen(paid)}返済済み`;
  $("mortgageProgressRate").textContent = `${progress.toFixed(1)}%`;
  $("mortgageProgressBar").style.width = `${progress}%`;
  $("mortgageProgressCaption").textContent = original > 0
    ? `借入時 ${yen(original)} → 現在 ${yen(balance)}。あと ${yen(balance)}です。`
    : "借入時の金額を入力すると進捗が分かります。";
}

function renderMortgage() {
  const m = state.mortgage, x = mortgageMetrics();
  $("mortgageOriginalBalance").value = m.originalBalance || ""; $("mortgageBalance").value = m.balance || ""; $("mortgageRate").value = m.rate ?? ""; $("mortgageMonthly").value = m.monthly || "";
  $("mortgageBonus").value = m.bonusAnnual || ""; $("mortgageEndYear").value = m.endYear || ""; $("mortgageExtra").value = m.extra || "";
  $("mortgageAnnualSummary").textContent = yen(x.annual);
  $("mortgageYearsSummary").textContent = x.years ? `約${x.years}年` : "—";
  $("mortgageInterestSummary").textContent = yen(x.roughInterest);
  $("mortgageAfterExtraSummary").textContent = yen(x.afterExtra);
  $("mortgagePaidSummary").textContent = `${yen(x.paid)}返済済み`; $("mortgageProgressRate").textContent = `${x.progress.toFixed(1)}%`; $("mortgageProgressBar").style.width = `${x.progress}%`;
  $("mortgageProgressCaption").textContent = x.original ? `借入時 ${yen(x.original)} → 現在 ${yen(x.balance)}。あと ${yen(x.balance)}です。` : "借入時の金額を入力すると進捗が分かります。";
}
function educationProgressCard(name, current, target) {
  const rate = target ? Math.min(100, current / target * 100) : 0;
  return `<article class="card progress-card"><div class="progress-title"><div><span>${name}</span><strong>${yen(current)} / ${yen(target)}</strong></div><b>${rate.toFixed(1)}%</b></div><div class="progress-track"><div class="progress-bar" style="width:${rate}%"></div></div><small>あと ${yen(Math.max(0,target-current))}</small></article>`;
}
function renderEducation() {
  const e = state.education;
  $("edu1").value = e.child1 || ""; $("edu2").value = e.child2 || ""; $("edu3").value = e.child3 || ""; $("eduMonthly").value = e.monthly || "";
  $("edu1Target").value = e.target1 || ""; $("edu2Target").value = e.target2 || ""; $("edu3Target").value = e.target3 || "";
  $("educationProgressList").innerHTML = [
    educationProgressCard("長女", num(e.child1), num(e.target1)),
    educationProgressCard("次女", num(e.child2), num(e.target2)),
    educationProgressCard("三女", num(e.child3), num(e.target3))
  ].join("");
}
function renderSavingsGoals() {
  const list = [...state.savingsGoals].sort((a,b)=>String(a.deadline||"9999").localeCompare(String(b.deadline||"9999")));
  $("savingsGoalList").innerHTML = list.length ? list.map(g => {
    const m = goalMetrics(g), status = m.months && m.monthly < m.neededMonthly ? `月あと ${yen(m.neededMonthly-m.monthly)}必要` : m.remaining ? "目標ペース内" : "達成済み";
    return `<article class="card savings-card"><div class="progress-title"><div><span class="goal-chip">${escapeHtml(g.category)}</span><strong>${escapeHtml(g.name)}</strong></div><b>${m.rate.toFixed(1)}%</b></div><div class="progress-track"><div class="progress-bar" style="width:${m.rate}%"></div></div><div class="goal-stats"><span>現在 ${yen(m.current)}</span><span>目標 ${yen(m.target)}</span><span>毎月 ${yen(m.monthly)}</span><span>${g.deadline ? escapeHtml(g.deadline) : "期限なし"}</span></div><p class="goal-status ${status.includes("必要") ? "negative" : "positive"}">${status}</p><div class="item-actions"><button class="edit-button" data-edit-goal="${g.id}">編集</button><button class="delete-button" data-delete-goal="${g.id}">削除</button></div></article>`;
  }).join("") : '<div class="empty">車・旅行・修繕などの積立目標を追加できます。</div>';
  const totals = state.savingsGoals.reduce((a,g)=>{a.current+=num(g.current);a.target+=num(g.target);a.monthly+=num(g.monthly);return a;},{current:0,target:0,monthly:0});
  $("goalsTargetTotal").textContent = yen(totals.target); $("goalsCurrentTotal").textContent = yen(totals.current); $("goalsMonthlyTotal").textContent = yen(totals.monthly);
  $("goalsRateTotal").textContent = `${(totals.target ? Math.min(100,totals.current/totals.target*100) : 0).toFixed(1)}%`;
}
function clearGoalForm() {
  $("goalId").value = ""; ["goalName","goalCurrent","goalTarget","goalMonthly","goalDeadline"].forEach(id => $(id).value = "");
  $("goalCategory").value = "車"; $("saveGoalButton").textContent = "積立目標を追加"; $("cancelGoalEdit").classList.add("hidden");
}
function renderTheme() { document.body.classList.toggle("dark", state.dark); $("themeButton").textContent = state.dark ? "☀️" : "🌙"; }
function renderAll() {
  if ($("todayLabel")) $("todayLabel").textContent = formatTodayLabel();
  renderGreeting(); renderTheme(); renderHome(); renderHistoryDashboard(); renderTransactions(); renderOwnerSummary(); renderInvestmentAnalysis(); renderNisaUsage(); renderAssets(); renderPlans(); renderRanking(); renderDividendCalendar(); renderMortgage(); renderEducation(); renderSavingsGoals(); renderLifeEvents();
  $("cashInput").value = state.cash || ""; $("loanInput").value = state.loan || ""; $("assetGoalInput").value = state.assetGoal || "";
}
function clearTxForm() {
  $("txId").value = "";
  $("txDate").value = today();
  $("txKind").value = "expense";
  ["txCategory", "txAmount", "txMemo"].forEach(id => $(id).value = "");
  $("addTxButton").textContent = "家計を追加";
  $("cancelTxEdit").classList.add("hidden");
  document.querySelectorAll(".quick-category").forEach(button => button.classList.remove("selected"));
}
function clearAssetForm() {
  $("assetId").value = ""; ["assetName", "assetBroker", "assetQuantity", "assetCost", "assetPrice", "assetDividend", "assetDividendMonths"].forEach(id => $(id).value = "");
  $("assetDate").value = today(); $("saveAssetButton").textContent = "保有資産を追加"; $("cancelAssetEdit").classList.add("hidden");
}
function syncPlanMethodUI() {
  const method = $("planMethod").value;
  $("planMonthlyField").classList.toggle("hidden", method === "lump");
  $("planStartLabel").textContent = method === "lump" ? "購入日" : "積立開始日";
  if (method === "lump") $("planMonthly").value = "";
}
function clearPlanForm() {
  $("planId").value = "";
  ["planName", "planMonthly", "planBroker", "planInvested", "planValue"].forEach(id => $(id).value = "");
  $("planMethod").value = "monthly";
  $("planAccount").value = "NISAつみたて投資枠";
  $("planStart").value = today();
  syncPlanMethodUI();
  $("savePlanButton").textContent = "積立を追加";
  $("cancelPlanEdit").classList.add("hidden");
}
function clearNisaPurchaseForm() {
  $("nisaPurchaseId").value = "";
  $("nisaPurchaseDate").value = today();
  $("nisaPurchaseKind").value = "";
  ["nisaPurchaseName", "nisaPurchaseAmount", "nisaPurchaseBroker", "nisaPurchaseMemo"].forEach(id => $(id).value = "");
  $("saveNisaPurchaseButton").textContent = "買付を記録";
  $("cancelNisaPurchaseEdit").classList.add("hidden");
}
function openNisaPurchaseForm(prefill = {}) {
  if (currentOwner === "家族合計") return;
  clearNisaPurchaseForm();
  $("nisaPurchaseDate").value = prefill.date || today();
  $("nisaPurchaseName").value = prefill.name || "";
  $("nisaPurchaseBroker").value = prefill.broker || "";
  $("nisaPurchaseKind").value = ["tsumitate", "growth"].includes(prefill.kind) ? prefill.kind : "";
  $("nisaPurchaseEditor").open = true;
  $("nisaPurchaseFormWrap").scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => $("nisaPurchaseAmount").focus(), 350);
}

$("addTxButton").addEventListener("click", () => {
  const amount = num($("txAmount").value); if (!amount) return alert("金額を入力してください");
  const id = $("txId").value;
  const item = { id: id || uid(), date: $("txDate").value || today(), kind: $("txKind").value, category: $("txCategory").value.trim() || "未分類", amount, memo: $("txMemo").value.trim() };
  if (id) state.transactions = state.transactions.map(t => t.id === id ? item : t); else state.transactions.push(item);
  saveState(); clearTxForm(); renderAll();
});
$("saveAssetButton").addEventListener("click", () => {
  const name = $("assetName").value.trim(); if (!name) return alert("銘柄・商品名を入力してください");
  const id = $("assetId").value, data = { id: id || uid(), owner: normalizeOwner(currentOwner), name, type: $("assetType").value, broker: $("assetBroker").value.trim(), account: $("assetAccount").value, date: $("assetDate").value, quantity: num($("assetQuantity").value), cost: num($("assetCost").value), price: num($("assetPrice").value), dividend: num($("assetDividend").value), dividendMonths: $("assetDividendMonths").value.trim() };
  if (id) state.assets = state.assets.map(a => a.id === id ? data : a); else state.assets.push(data);
  saveState(); clearAssetForm(); renderAll();
});
$("savePlanButton").addEventListener("click", () => {
  const name = $("planName").value.trim();
  if (!name) return alert("商品名を入力してください");
  const method = $("planMethod").value === "lump" ? "lump" : "monthly";
  const monthly = method === "monthly" ? num($("planMonthly").value) : 0;
  if (method === "monthly" && !monthly) return alert("毎月の積立額を入力してください");
  const id = $("planId").value;
  const data = {
    id: id || uid(),
    owner: normalizeOwner(currentOwner),
    name,
    method,
    monthly,
    start: $("planStart").value,
    broker: $("planBroker").value.trim(),
    account: $("planAccount").value,
    invested: $("planInvested").value === "" ? null : num($("planInvested").value),
    value: $("planValue").value === "" ? null : num($("planValue").value)
  };
  if (id) state.plans = state.plans.map(p => p.id === id ? data : p); else state.plans.push(data);
  saveState(); clearPlanForm(); renderAll();
});
$("saveNisaPurchaseButton").addEventListener("click", () => {
  if (currentOwner === "家族合計") return;
  const amount = num($("nisaPurchaseAmount").value);
  const name = $("nisaPurchaseName").value.trim();
  const kind = $("nisaPurchaseKind").value;
  if (!name) return alert("商品名を入力してください");
  if (!["tsumitate", "growth"].includes(kind)) return alert("NISAの枠を選んでください");
  if (!amount) return alert("今回の買付額を入力してください");
  const id = $("nisaPurchaseId").value;
  const data = {
    id: id || uid(),
    owner: normalizeOwner(currentOwner),
    date: $("nisaPurchaseDate").value || today(),
    kind,
    amount,
    name,
    broker: $("nisaPurchaseBroker").value.trim(),
    memo: $("nisaPurchaseMemo").value.trim()
  };
  if (id) state.nisaPurchases = state.nisaPurchases.map(item => item.id === id ? data : item); else state.nisaPurchases.push(data);
  saveState(); clearNisaPurchaseForm(); renderAll();
});
$("saveDividendReceiptButton").addEventListener("click", () => {
  const amount = num($("dividendReceiptAmount").value);
  const assetId = $("dividendReceiptAsset").value;
  const asset = state.assets.find(a => a.id === assetId);
  if (!asset) return alert("銘柄を選んでください");
  if (!amount) return alert("受取額を入力してください");
  const id = $("dividendReceiptId").value;
  const data = {
    id: id || uid(),
    owner: normalizeOwner(asset.owner),
    assetId: asset.id,
    name: asset.name,
    date: $("dividendReceiptDate").value || today(),
    amount,
    memo: $("dividendReceiptMemo").value.trim()
  };
  if (id) state.dividendReceipts = state.dividendReceipts.map(item => item.id === id ? data : item); else state.dividendReceipts.push(data);
  saveState(); clearDividendReceiptForm(); renderDividendCalendar();
});
$("cancelDividendReceiptEdit").addEventListener("click", clearDividendReceiptForm);
$("showYieldRankingButton").addEventListener("click", () => {
  currentRanking = "yield";
  document.querySelectorAll(".ranking-tab").forEach(x => x.classList.toggle("active", x.dataset.ranking === "yield"));
  setInvestmentView("ranking");
  renderRanking();
});
$("cancelNisaPurchaseEdit").addEventListener("click", clearNisaPurchaseForm);
document.addEventListener("click", e => {
  const d = e.target.dataset;
  if (d.deleteDividendReceipt && confirm("この配当受取記録を削除しますか？")) {
    state.dividendReceipts = state.dividendReceipts.filter(item => item.id !== d.deleteDividendReceipt);
    saveState(); clearDividendReceiptForm(); renderDividendCalendar();
  }
  if (d.editDividendReceipt) {
    const item = state.dividendReceipts.find(x => x.id === d.editDividendReceipt);
    if (item) {
      $("dividendReceiptId").value = item.id;
      renderDividendAssetOptions();
      $("dividendReceiptAsset").value = item.assetId || "";
      $("dividendReceiptDate").value = item.date || today();
      $("dividendReceiptAmount").value = item.amount || "";
      $("dividendReceiptMemo").value = item.memo || "";
      $("saveDividendReceiptButton").textContent = "変更を保存";
      $("cancelDividendReceiptEdit").classList.remove("hidden");
      $("dividendReceiptEditor").open = true;
      $("dividendReceiptFormWrap").scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
  if (d.confirmDuplicate) {
    const message = "この登録は別々の買付・契約として正しいですか？\n確認後は、同じ組み合わせを今後の点検で警告しません。";
    if (confirm(message) && !state.confirmedDuplicateGroups.includes(d.confirmDuplicate)) {
      state.confirmedDuplicateGroups.push(d.confirmDuplicate);
      saveState();
      renderAll();
    }
  }
  if (d.deleteAsset && confirm("この保有資産を削除しますか？")) { state.assets = state.assets.filter(a => a.id !== d.deleteAsset); saveState(); renderAll(); }
  if (d.findAsset) {
    setInvestmentView("assets");
    $("assetSearch").value = d.findAsset;
    $("assetFilter").value = "all";
    renderAssets();
    $("assetList").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (d.findPlan) {
    setInvestmentView("plans");
    const match = state.plans.find(p => String(p.name || "") === d.findPlan && (currentOwner === "家族合計" || normalizeOwner(p.owner) === currentOwner));
    if (match) {
      const cardButtons = [...document.querySelectorAll(`[data-edit-plan="${match.id}"]`)];
      $("planList").scrollIntoView({ behavior: "smooth", block: "start" });
      if (!cardButtons.length) renderPlans();
    }
  }
  if (d.deletePlan && confirm("この積立を削除しますか？")) { state.plans = state.plans.filter(p => p.id !== d.deletePlan); saveState(); renderAll(); }
  if (d.deleteNisaPurchase && confirm("このNISA買付記録を削除しますか？")) { state.nisaPurchases = state.nisaPurchases.filter(item => item.id !== d.deleteNisaPurchase); saveState(); clearNisaPurchaseForm(); renderAll(); }
  if (d.editNisaPurchase) {
    const item = state.nisaPurchases.find(x => x.id === d.editNisaPurchase); if (item) {
      $("nisaPurchaseId").value = item.id;
      $("nisaPurchaseDate").value = item.date || today();
      $("nisaPurchaseKind").value = item.kind || "";
      $("nisaPurchaseName").value = item.name || "";
      $("nisaPurchaseAmount").value = item.amount || "";
      $("nisaPurchaseBroker").value = item.broker || "";
      $("nisaPurchaseMemo").value = item.memo || "";
      $("saveNisaPurchaseButton").textContent = "変更を保存";
      $("cancelNisaPurchaseEdit").classList.remove("hidden");
      $("nisaPurchaseEditor").open = true;
      $("nisaPurchaseFormWrap").scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
  if (d.recordPlan) {
    const plan = state.plans.find(x => x.id === d.recordPlan); if (plan) openNisaPurchaseForm({ name: plan.name, broker: plan.broker, kind: nisaPlanKind(plan.account) });
  }
  if (d.recordAsset) {
    const asset = state.assets.find(x => x.id === d.recordAsset); if (asset) openNisaPurchaseForm({ name: asset.name, broker: asset.broker, kind: nisaPlanKind(asset.account) });
  }
  if (d.editTx) {
    const t = state.transactions.find(x => x.id === d.editTx); if (t) {
      $("txId").value = t.id; $("txDate").value = t.date || today(); $("txKind").value = t.kind; $("txCategory").value = t.category || ""; $("txAmount").value = t.amount; $("txMemo").value = t.memo || "";
      $("addTxButton").textContent = "変更を保存"; $("cancelTxEdit").classList.remove("hidden"); $("txDate").scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
  if (d.deleteTx && confirm("この家計記録を削除しますか？")) { state.transactions = state.transactions.filter(t => t.id !== d.deleteTx); saveState(); renderAll(); }
  if (d.editAsset) {
    const a = state.assets.find(x => x.id === d.editAsset); if (a) {
      if (currentOwner === "家族合計") {
        currentOwner = normalizeOwner(a.owner);
        document.querySelectorAll(".owner-tab").forEach(x => x.classList.toggle("active", x.dataset.owner === currentOwner));
        renderOwnerSummary(); renderInvestmentAnalysis(); renderNisaUsage(); renderAssets(); renderPlans();
      }
      setInvestmentView("assets");
      $("assetId").value = a.id; $("assetName").value = a.name; $("assetType").value = a.type; $("assetBroker").value = a.broker || ""; $("assetAccount").value = a.account; $("assetDate").value = a.date || today(); $("assetQuantity").value = a.quantity; $("assetCost").value = a.cost; $("assetPrice").value = a.price; $("assetDividend").value = a.dividend; $("assetDividendMonths").value = a.dividendMonths || "";
      $("saveAssetButton").textContent = "変更を保存"; $("cancelAssetEdit").classList.remove("hidden"); const details = $("assetFormWrap").querySelector("details"); if (details) details.open = true; $("assetFormWrap").scrollIntoView({ behavior: "smooth" });
    }
  }
  if (d.editPlan) {
    const p = state.plans.find(x => x.id === d.editPlan); if (p) {
      if (currentOwner === "家族合計") {
        currentOwner = normalizeOwner(p.owner);
        document.querySelectorAll(".owner-tab").forEach(x => x.classList.toggle("active", x.dataset.owner === currentOwner));
        renderOwnerSummary(); renderInvestmentAnalysis(); renderNisaUsage(); renderAssets(); renderPlans();
      }
      setInvestmentView("plans");
      $("planId").value = p.id;
      $("planName").value = p.name;
      $("planMethod").value = p.method === "lump" ? "lump" : "monthly";
      $("planMonthly").value = p.monthly || "";
      $("planStart").value = p.start || today();
      $("planBroker").value = p.broker || "";
      $("planAccount").value = p.account;
      $("planInvested").value = p.invested ?? "";
      $("planValue").value = p.value ?? "";
      syncPlanMethodUI();
      $("savePlanButton").textContent = "変更を保存"; $("cancelPlanEdit").classList.remove("hidden"); const details = $("planFormWrap").querySelector("details"); if (details) details.open = true; $("planFormWrap").scrollIntoView({ behavior: "smooth" });
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
  if (d.editGoal) {
    const g = state.savingsGoals.find(x => x.id === d.editGoal); if (g) {
      $("goalId").value = g.id; $("goalCategory").value = g.category; $("goalName").value = g.name; $("goalCurrent").value = g.current; $("goalTarget").value = g.target; $("goalMonthly").value = g.monthly; $("goalDeadline").value = g.deadline || "";
      $("saveGoalButton").textContent = "変更を保存"; $("cancelGoalEdit").classList.remove("hidden"); $("goalName").scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
  if (d.deleteGoal && confirm("この積立目標を削除しますか？")) { state.savingsGoals = state.savingsGoals.filter(x => x.id !== d.deleteGoal); saveState(); renderAll(); }
});
$("cancelTxEdit").addEventListener("click", clearTxForm);
$("resetDuplicateConfirmations").addEventListener("click", () => {
  if (!state.confirmedDuplicateGroups.length) return;
  if (!confirm("同一登録の「確認済み」をすべて解除しますか？")) return;
  state.confirmedDuplicateGroups = [];
  saveState();
  renderAll();
});
document.querySelectorAll(".quick-category").forEach(button => button.addEventListener("click", () => {
  $("txKind").value = button.dataset.quickKind;
  $("txCategory").value = button.dataset.quickCategory;
  document.querySelectorAll(".quick-category").forEach(x => x.classList.toggle("selected", x === button));
  $("txAmount").focus();
}));
$("saveBudgetLimitButton").addEventListener("click", () => {
  const month = selectedBudgetMonth(), limit = num($("budgetLimitInput").value);
  if (limit) state.budgetSettings.monthlyLimits[month] = limit; else delete state.budgetSettings.monthlyLimits[month];
  saveState(); renderTransactions();
  alert(limit ? `${month.replace("-", "年")}月の予算を保存しました` : "予算設定を解除しました");
});
$("cancelAssetEdit").addEventListener("click", clearAssetForm);
$("cancelPlanEdit").addEventListener("click", clearPlanForm);
$("saveNisaUsageButton").addEventListener("click", () => {
  if (currentOwner === "家族合計") return;
  const year = currentNisaYear();
  const tsumitate = num($("nisaTsumitateUsed").value);
  const growth = num($("nisaGrowthUsed").value);
  if (!state.nisaUsage[year] || typeof state.nisaUsage[year] !== "object") state.nisaUsage[year] = {};
  state.nisaUsage[year][currentOwner] = { tsumitate, growth };
  saveState(); renderNisaUsage(); alert(`${currentOwner}の${year}年・開始時点利用額を保存しました`);
});
document.querySelectorAll(".owner-tab").forEach(b => b.addEventListener("click", () => {
  currentOwner = b.dataset.owner; document.querySelectorAll(".owner-tab").forEach(x => x.classList.toggle("active", x === b));
  clearAssetForm(); clearPlanForm(); clearNisaPurchaseForm(); clearDividendReceiptForm(); renderOwnerSummary(); renderInvestmentAnalysis(); renderNisaUsage(); renderAssets(); renderPlans(); renderRanking(); renderDividendCalendar(); setInvestmentView(currentInvestmentView);
}));
document.querySelectorAll(".investment-view-tab").forEach(b => b.addEventListener("click", () => setInvestmentView(b.dataset.investView)));
document.querySelectorAll(".ranking-tab").forEach(b => b.addEventListener("click", () => {
  currentRanking = b.dataset.ranking; document.querySelectorAll(".ranking-tab").forEach(x => x.classList.toggle("active", x === b)); renderRanking();
}));
document.querySelectorAll(".future-jump").forEach(button => button.addEventListener("click", () => {
  const target=button.dataset.targetScreen;
  const navButton=document.querySelector(`.nav-button[data-screen="${target}"]`);
  if(navButton) navButton.click();
}));
document.querySelectorAll(".nav-button").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === b.dataset.screen));
  document.querySelectorAll(".nav-button").forEach(x => x.classList.toggle("active", x === b)); window.scrollTo({ top: 0, behavior: "smooth" });
  if (b.dataset.screen === "homeScreen") setTimeout(() => { drawAllocation(); drawTrend(); renderHistoryDashboard(); }, 50);
  if (b.dataset.screen === "investScreen") setTimeout(drawInvestmentAllocation, 50);
  if (b.dataset.screen === "budgetScreen") setTimeout(() => drawBudgetTrend(selectedBudgetMonth()), 50);
}));
["assetSearch", "assetFilter", "assetSort"].forEach(id => $(id).addEventListener("input", renderAssets));
$("txSearch").addEventListener("input", renderTransactions);
$("txMonth").addEventListener("change", renderTransactions);
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
$("saveMortgageButton").addEventListener("click", () => {
  const values = mortgageFormValues();
  if (!values.originalBalance) return alert("借入時の金額を入力してください");
  if (!values.balance) return alert("現在のローン残高を入力してください");
  state.mortgage = { ...state.mortgage, ...values };
  state.loan = values.balance;
  // まず通常保存へ同期的に書き込み、その後に予備保存・画面更新を行う。
  state._savedAt = new Date().toISOString();
  try { writeLocalCopies(state); } catch (error) { console.warn("住宅ローンの通常保存に失敗しました", error); }
  saveState();
  renderMortgage();
  renderHome();
  $("loanInput").value = state.loan || "";
  alert(`住宅ローンを保存しました
返済済み ${yen(Math.max(0, values.originalBalance - values.balance))}`);
});
["mortgageOriginalBalance", "mortgageBalance"].forEach(id => {
  $(id)?.addEventListener("input", previewMortgageProgressFromForm);
  $(id)?.addEventListener("change", previewMortgageProgressFromForm);
});
$("saveGoalButton").addEventListener("click", () => {
  const name = $("goalName").value.trim(), target = num($("goalTarget").value);
  if (!name || !target) return alert("名称と目標額を入力してください");
  const id = $("goalId").value || uid(), item = { id, category: $("goalCategory").value, name, current: num($("goalCurrent").value), target, monthly: num($("goalMonthly").value), deadline: $("goalDeadline").value };
  const index = state.savingsGoals.findIndex(g => g.id === id); if (index >= 0) state.savingsGoals[index] = item; else state.savingsGoals.push(item);
  saveState(); clearGoalForm(); renderAll();
});
$("cancelGoalEdit").addEventListener("click", clearGoalForm);
$("saveEducation").addEventListener("click", () => {
  state.education = { child1: num($("edu1").value), child2: num($("edu2").value), child3: num($("edu3").value), monthly: num($("eduMonthly").value), target1: num($("edu1Target").value), target2: num($("edu2Target").value), target3: num($("edu3Target").value) };
  saveState(); renderAll(); alert("教育資金を保存しました");
});
$("saveBaseButton").addEventListener("click", () => {
  state.cash = num($("cashInput").value); state.loan = num($("loanInput").value); state.mortgage.balance = state.loan; state.mortgage.originalBalance = Math.max(num(state.mortgage.originalBalance), state.loan); state.assetGoal = num($("assetGoalInput").value) || defaultState.assetGoal;
  saveState(); renderAll(); alert("基本情報と資産目標を保存しました");
});
$("saveHistorySnapshot").addEventListener("click", () => { recordSnapshot(); saveState(); renderHistoryDashboard(); $("saveHistorySnapshot").textContent = "記録済み"; setTimeout(()=>$("saveHistorySnapshot").textContent="今月を記録",900); });
$("themeButton").addEventListener("click", () => { state.dark = !state.dark; saveState(); renderTheme(); drawAllocation(); drawTrend(); renderHistoryDashboard(); drawMortgageBalanceChart(); drawInvestmentAllocation(); drawBudgetTrend(selectedBudgetMonth()); });
$("exportButton").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ version: "8.0-beta15-life-plan-timeline", exportedAt: new Date().toISOString(), data: state }, null, 2)], { type: "application/json" }), a = document.createElement("a");
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
window.addEventListener("resize", () => { if ($("homeScreen").classList.contains("active")) { drawAllocation(); drawTrend(); renderHistoryDashboard(); } if ($("investScreen").classList.contains("active")) drawInvestmentAllocation(); if ($("budgetScreen").classList.contains("active")) drawBudgetTrend(selectedBudgetMonth()); });

$("txDate").value = today(); $("assetDate").value = today(); $("planStart").value = today(); $("nisaPurchaseDate").value = today();
$("planMethod").addEventListener("change", syncPlanMethodUI);
syncPlanMethodUI();
recordSnapshot(); saveState(); renderAll();
initializePersistentStorage();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveBeforeClosing();
});
window.addEventListener("pagehide", saveBeforeClosing);
window.addEventListener("beforeunload", saveBeforeClosing);
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(console.error));
