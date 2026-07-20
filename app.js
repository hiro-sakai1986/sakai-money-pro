"use strict";

const APP_VERSION = "6.1";
const STORAGE_KEY = "sakaiMoneyPro61";
const MIGRATION_MARKER = "sakaiMoneyPro61MigrationDone";
const LEGACY_STORAGE_KEYS = [
  "sakaiMoneyPro6FirstRelease",
  "sakaiMoneyPro6SecondRelease",
  "sakaiMoneyPro50",
  "sakaiMoneyPro51Auth",
  "sakaiMoneyPro52EncryptedState",
  "sakaiMoneyPro6EncryptedState",
  "sakaiMoneyPro6Auth",
  "sakaiMoneyPro6EncryptedStateReset20260720",
  "sakaiMoneyPro6AuthReset20260720",
  "sakaiMoneyPro6PasswordReset20260720"
];

const defaultState = {
  cash: 0,
  dark: false,
  assets: [],
  plans: []
};

const $ = id => document.getElementById(id);
const yen = value => new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0
}).format(Number(value) || 0);
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  '"': "&quot;"
})[char]);

let state = loadState();
let currentOwner = "本人";
let editingAssetId = null;
let editingPlanId = null;

function runRecoveryMigration() {
  if (localStorage.getItem(MIGRATION_MARKER)) return;

  const firstRelease = safeParse(localStorage.getItem("sakaiMoneyPro6FirstRelease"));
  const secondRelease = safeParse(localStorage.getItem("sakaiMoneyPro6SecondRelease"));
  const migrated = secondRelease || firstRelease;

  if (migrated && Array.isArray(migrated.assets) && Array.isArray(migrated.plans)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...structuredClone(defaultState),
      ...migrated
    }));
  }

  LEGACY_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
  sessionStorage.clear();
  localStorage.setItem(MIGRATION_MARKER, new Date().toISOString());
}

function safeParse(value) {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

function loadState() {
  runRecoveryMigration();
  const saved = safeParse(localStorage.getItem(STORAGE_KEY));
  return saved ? { ...structuredClone(defaultState), ...saved } : structuredClone(defaultState);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthsSince(dateString) {
  if (!dateString) return 0;
  const start = new Date(`${dateString}T00:00:00`);
  const now = new Date();
  if (start > now) return 0;
  return (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1;
}

function assetMetrics(asset) {
  const quantity = Number(asset.quantity) || 0;
  const cost = Number(asset.cost) || 0;
  const price = Number(asset.price) || 0;
  const market = quantity * price;
  const invested = quantity * cost;
  const profit = market - invested;
  const rate = invested ? (profit / invested) * 100 : 0;
  return { market, invested, profit, rate };
}

function totals(owner = null) {
  const assets = owner ? state.assets.filter(asset => asset.owner === owner) : state.assets;
  return assets.reduce((sum, asset) => {
    const metrics = assetMetrics(asset);
    sum.market += metrics.market;
    sum.invested += metrics.invested;
    sum.profit += metrics.profit;
    sum.dividend += Number(asset.dividend) || 0;
    return sum;
  }, { market: 0, invested: 0, profit: 0, dividend: 0 });
}

function renderGreeting() {
  const hour = new Date().getHours();
  $("greeting").textContent = `${hour < 11 ? "おはよう" : hour < 18 ? "こんにちは" : "こんばんは"}、ヒロ`;
}

function renderHome() {
  const all = totals();
  const hiro = totals("本人");
  const husband = totals("夫");
  const monthly = state.plans.reduce((sum, plan) => sum + (Number(plan.monthly) || 0), 0);

  $("totalFinancial").textContent = yen(state.cash + all.market);
  $("totalProfit").textContent = `評価損益 ${all.profit >= 0 ? "+" : ""}${yen(all.profit)}`;
  $("totalProfit").className = all.profit < 0 ? "negative" : "positive";
  $("cashSummary").textContent = yen(state.cash);
  $("investmentSummary").textContent = yen(all.market);
  $("hiroSummary").textContent = yen(hiro.market);
  $("husbandSummary").textContent = yen(husband.market);
  $("hiroBreakdown").textContent = yen(hiro.market);
  $("husbandBreakdown").textContent = yen(husband.market);
  $("monthlyTotal").textContent = yen(monthly);
  $("dividendTotal").textContent = yen(all.dividend);
  $("cashInput").value = state.cash || "";
}

function renderAssets() {
  const query = $("assetSearch").value.trim().toLowerCase();
  const list = state.assets
    .filter(asset => asset.owner === currentOwner)
    .filter(asset => !query || asset.name.toLowerCase().includes(query) || asset.type.toLowerCase().includes(query))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  $("assetList").innerHTML = list.length ? list.map(asset => {
    const metrics = assetMetrics(asset);
    return `<article class="item-card">
      <div class="item-head">
        <div>
          <div class="item-title">${escapeHtml(asset.name)}</div>
          <div class="item-sub">${escapeHtml(asset.type)}・${escapeHtml(asset.account)}・入力日 ${escapeHtml(asset.date || "未設定")}</div>
        </div>
        <div class="item-value">${yen(metrics.market)}
          <small class="${metrics.profit < 0 ? "negative" : "positive"}">${metrics.profit >= 0 ? "+" : ""}${yen(metrics.profit)}（${metrics.rate.toFixed(1)}%）</small>
        </div>
      </div>
      <div class="item-grid">
        <div><span>保有数</span><strong>${Number(asset.quantity).toLocaleString("ja-JP")}</strong></div>
        <div><span>取得単価</span><strong>${yen(asset.cost)}</strong></div>
        <div><span>現在価格</span><strong>${yen(asset.price)}</strong></div>
        <div><span>取得総額</span><strong>${yen(metrics.invested)}</strong></div>
        <div><span>年間配当</span><strong>${yen(asset.dividend)}</strong></div>
      </div>
      <div class="item-actions">
        <button class="edit-button" data-edit-asset="${asset.id}">編集</button>
        <button class="delete-button" data-delete-asset="${asset.id}">削除</button>
      </div>
    </article>`;
  }).join("") : `<div class="empty">${currentOwner}の保有資産はまだありません。</div>`;
}

function renderPlans() {
  const list = state.plans
    .filter(plan => plan.owner === currentOwner)
    .sort((a, b) => (b.start || "").localeCompare(a.start || ""));

  $("planList").innerHTML = list.length ? list.map(plan => {
    const months = monthsSince(plan.start);
    const contributed = months * (Number(plan.monthly) || 0);
    return `<article class="item-card">
      <div class="item-head">
        <div>
          <div class="item-title">${escapeHtml(plan.name)}</div>
          <div class="item-sub">${escapeHtml(plan.account)}・開始日 ${escapeHtml(plan.start || "未設定")}</div>
        </div>
        <div class="item-value">月 ${yen(plan.monthly)}</div>
      </div>
      <div class="item-grid">
        <div><span>積立月数</span><strong>${months}か月</strong></div>
        <div><span>累計入金額</span><strong>${yen(contributed)}</strong></div>
      </div>
      <div class="item-actions">
        <button class="edit-button" data-edit-plan="${plan.id}">編集</button>
        <button class="delete-button" data-delete-plan="${plan.id}">削除</button>
      </div>
    </article>`;
  }).join("") : `<div class="empty">${currentOwner}の積立はまだありません。</div>`;
}

function renderTheme() {
  document.body.classList.toggle("dark", state.dark);
  $("themeButton").textContent = state.dark ? "☀️" : "🌙";
}

function renderAll() {
  renderGreeting();
  renderTheme();
  renderHome();
  renderAssets();
  renderPlans();
}

function clearAssetForm() {
  editingAssetId = null;
  ["assetName", "assetQuantity", "assetCost", "assetPrice", "assetDividend"].forEach(id => $(id).value = "");
  $("assetDate").value = today();
  $("addAssetButton").textContent = "保有資産を追加";
  $("cancelAssetEdit").hidden = true;
}

function clearPlanForm() {
  editingPlanId = null;
  ["planName", "planMonthly"].forEach(id => $(id).value = "");
  $("planStart").value = today();
  $("addPlanButton").textContent = "積立を追加";
  $("cancelPlanEdit").hidden = true;
}

function fillAssetForm(asset) {
  editingAssetId = asset.id;
  $("assetName").value = asset.name;
  $("assetType").value = asset.type;
  $("assetAccount").value = asset.account;
  $("assetDate").value = asset.date || today();
  $("assetQuantity").value = asset.quantity;
  $("assetCost").value = asset.cost;
  $("assetPrice").value = asset.price;
  $("assetDividend").value = asset.dividend;
  $("addAssetButton").textContent = "変更を保存";
  $("cancelAssetEdit").hidden = false;
  window.scrollTo({ top: $("assetFormCard").offsetTop - 90, behavior: "smooth" });
}

function fillPlanForm(plan) {
  editingPlanId = plan.id;
  $("planName").value = plan.name;
  $("planMonthly").value = plan.monthly;
  $("planStart").value = plan.start || today();
  $("planAccount").value = plan.account;
  $("addPlanButton").textContent = "変更を保存";
  $("cancelPlanEdit").hidden = false;
  window.scrollTo({ top: $("planFormCard").offsetTop - 90, behavior: "smooth" });
}

$("saveCashButton").addEventListener("click", () => {
  state.cash = Math.max(0, Number($("cashInput").value) || 0);
  saveState();
  renderHome();
  alert("預金残高を保存しました");
});

$("addAssetButton").addEventListener("click", () => {
  const name = $("assetName").value.trim();
  if (!name) return alert("銘柄・商品名を入力してください");

  const asset = {
    id: editingAssetId || crypto.randomUUID(),
    owner: currentOwner,
    name,
    type: $("assetType").value,
    account: $("assetAccount").value,
    date: $("assetDate").value,
    quantity: Number($("assetQuantity").value) || 0,
    cost: Number($("assetCost").value) || 0,
    price: Number($("assetPrice").value) || 0,
    dividend: Number($("assetDividend").value) || 0
  };

  if (editingAssetId) {
    state.assets = state.assets.map(item => item.id === editingAssetId ? asset : item);
  } else {
    state.assets.push(asset);
  }

  saveState();
  clearAssetForm();
  renderAll();
});

$("addPlanButton").addEventListener("click", () => {
  const name = $("planName").value.trim();
  if (!name) return alert("商品名を入力してください");

  const plan = {
    id: editingPlanId || crypto.randomUUID(),
    owner: currentOwner,
    name,
    monthly: Number($("planMonthly").value) || 0,
    start: $("planStart").value,
    account: $("planAccount").value
  };

  if (editingPlanId) {
    state.plans = state.plans.map(item => item.id === editingPlanId ? plan : item);
  } else {
    state.plans.push(plan);
  }

  saveState();
  clearPlanForm();
  renderAll();
});

$("cancelAssetEdit").addEventListener("click", clearAssetForm);
$("cancelPlanEdit").addEventListener("click", clearPlanForm);
$("assetSearch").addEventListener("input", renderAssets);

document.addEventListener("click", event => {
  const assetId = event.target.dataset.deleteAsset;
  const planId = event.target.dataset.deletePlan;
  const editAssetId = event.target.dataset.editAsset;
  const editPlanId = event.target.dataset.editPlan;

  if (assetId && confirm("この保有資産を削除しますか？")) {
    state.assets = state.assets.filter(asset => asset.id !== assetId);
    saveState();
    renderAll();
  }
  if (planId && confirm("この積立を削除しますか？")) {
    state.plans = state.plans.filter(plan => plan.id !== planId);
    saveState();
    renderAll();
  }
  if (editAssetId) {
    const asset = state.assets.find(item => item.id === editAssetId);
    if (asset) fillAssetForm(asset);
  }
  if (editPlanId) {
    const plan = state.plans.find(item => item.id === editPlanId);
    if (plan) fillPlanForm(plan);
  }
});

document.querySelectorAll(".owner-tab").forEach(button => button.addEventListener("click", () => {
  currentOwner = button.dataset.owner;
  document.querySelectorAll(".owner-tab").forEach(item => item.classList.toggle("active", item === button));
  clearAssetForm();
  clearPlanForm();
  renderAssets();
  renderPlans();
}));

document.querySelectorAll(".nav-button").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".screen").forEach(screen => screen.classList.toggle("active", screen.id === button.dataset.screen));
  document.querySelectorAll(".nav-button").forEach(item => item.classList.toggle("active", item === button));
  window.scrollTo({ top: 0, behavior: "smooth" });
}));

$("themeButton").addEventListener("click", () => {
  state.dark = !state.dark;
  saveState();
  renderTheme();
});

$("exportButton").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    data: state
  }, null, 2)], { type: "application/json" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `sakai-money-pro-backup-${today()}.json`;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
});

$("importInput").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const data = parsed.data || parsed;
    if (!data || !Array.isArray(data.assets) || !Array.isArray(data.plans)) throw new Error();
    state = { ...structuredClone(defaultState), ...data };
    saveState();
    renderAll();
    alert("バックアップを読み込みました");
  } catch {
    alert("このバックアップファイルは読み込めませんでした");
  } finally {
    event.target.value = "";
  }
});

$("resetButton").addEventListener("click", () => {
  if (!confirm("すべての入力データを削除します。よろしいですか？")) return;
  state = structuredClone(defaultState);
  saveState();
  renderAll();
});

$("clearOldLockButton").addEventListener("click", async () => {
  LEGACY_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
  sessionStorage.clear();
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
  }
  alert("古いパスワード情報とキャッシュを削除しました。ページを再読み込みします。");
  location.reload(true);
});

$("assetDate").value = today();
$("planStart").value = today();
renderAll();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.unregister()));
      await navigator.serviceWorker.register("./sw.js?v=61");
    } catch (error) {
      console.error(error);
    }
  });
}
