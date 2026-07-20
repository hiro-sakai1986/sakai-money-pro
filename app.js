"use strict";

const STORAGE_KEY="sakaiMoneyPro6SecondRelease";
const LEGACY_KEY="sakaiMoneyPro6FirstRelease";
const ENCRYPTED_KEY="sakaiMoneyPro6EncryptedState";
const AUTH_KEY="sakaiMoneyPro6Auth";
const AUTO_LOCK_MS=10*60*1000;
const defaultState={cash:0,dark:false,assets:[],plans:[]};
let state=structuredClone(defaultState);
let currentOwner="本人";
let activeKey=null;
let autoLockTimer=null;
let passwordMode="set";

const $=id=>document.getElementById(id);
const yen=value=>new Intl.NumberFormat("ja-JP",{style:"currency",currency:"JPY",maximumFractionDigits:0}).format(Number(value)||0);
const escapeHtml=value=>String(value??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const today=()=>new Date().toISOString().slice(0,10);
const hasPassword=()=>Boolean(localStorage.getItem(AUTH_KEY)&&localStorage.getItem(ENCRYPTED_KEY));
const bytesToBase64=bytes=>btoa(String.fromCharCode(...bytes));
const base64ToBytes=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));

function normalizeState(value){
  const next={...structuredClone(defaultState),...(value||{})};
  next.cash=Math.max(0,Number(next.cash)||0);
  next.dark=Boolean(next.dark);
  next.assets=Array.isArray(next.assets)?next.assets.map(a=>({
    id:a.id||crypto.randomUUID(),owner:a.owner==="夫"?"夫":"本人",name:String(a.name||""),type:String(a.type||"その他"),account:String(a.account||"特定口座"),date:a.date||today(),quantity:Number(a.quantity)||0,cost:Number(a.cost)||0,price:Number(a.price)||0,dividend:Number(a.dividend)||0
  })):[];
  next.plans=Array.isArray(next.plans)?next.plans.map(p=>({
    id:p.id||crypto.randomUUID(),owner:p.owner==="夫"?"夫":"本人",name:String(p.name||""),monthly:Number(p.monthly)||0,start:p.start||today(),account:String(p.account||"NISAつみたて投資枠")
  })):[];
  return next;
}

function loadPlainState(){
  try{
    const current=localStorage.getItem(STORAGE_KEY);
    if(current)return normalizeState(JSON.parse(current));
    const legacy=localStorage.getItem(LEGACY_KEY);
    if(legacy){const migrated=normalizeState(JSON.parse(legacy));localStorage.setItem(STORAGE_KEY,JSON.stringify(migrated));return migrated;}
  }catch(error){console.warn("保存データを読み込めませんでした",error);}
  return structuredClone(defaultState);
}

async function deriveKey(password,salt){
  const material=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:180000,hash:"SHA-256"},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}

async function encryptState(data,key){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(JSON.stringify(data)));
  return {iv:bytesToBase64(iv),cipher:bytesToBase64(new Uint8Array(cipher))};
}

async function decryptState(payload,key){
  const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:base64ToBytes(payload.iv)},key,base64ToBytes(payload.cipher));
  return normalizeState(JSON.parse(new TextDecoder().decode(plain)));
}

async function saveState(){
  if(activeKey){localStorage.setItem(ENCRYPTED_KEY,JSON.stringify(await encryptState(state,activeKey)));localStorage.removeItem(STORAGE_KEY);}else{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}
}

function resetAutoLock(){
  if(!activeKey)return;
  clearTimeout(autoLockTimer);
  autoLockTimer=setTimeout(lockApp,AUTO_LOCK_MS);
}

function lockApp(){
  if(!hasPassword())return;
  activeKey=null;
  clearTimeout(autoLockTimer);
  $("unlockPassword").value="";
  $("unlockError").textContent="";
  $("lockScreen").classList.remove("hidden");
  $("appShell").setAttribute("aria-hidden","true");
  setTimeout(()=>$("unlockPassword").focus(),80);
}

function unlockApp(){
  $("lockScreen").classList.add("hidden");
  $("appShell").removeAttribute("aria-hidden");
  resetAutoLock();
  renderAll();
}

function monthsSince(dateString){
  if(!dateString)return 0;
  const start=new Date(`${dateString}T00:00:00`),now=new Date();
  if(Number.isNaN(start.getTime())||start>now)return 0;
  return (now.getFullYear()-start.getFullYear())*12+(now.getMonth()-start.getMonth())+1;
}

function assetMetrics(asset){
  const quantity=Number(asset.quantity)||0,cost=Number(asset.cost)||0,price=Number(asset.price)||0;
  const market=quantity*price,invested=quantity*cost,profit=market-invested,rate=invested?profit/invested*100:0;
  return{market,invested,profit,rate};
}

function totals(owner=null){
  const assets=owner?state.assets.filter(a=>a.owner===owner):state.assets;
  return assets.reduce((sum,a)=>{const m=assetMetrics(a);sum.market+=m.market;sum.profit+=m.profit;sum.dividend+=Number(a.dividend)||0;return sum;},{market:0,profit:0,dividend:0});
}

function renderGreeting(){const hour=new Date().getHours();$("greeting").textContent=`${hour<11?"おはよう":hour<18?"こんにちは":"こんばんは"}、ヒロ`;}

function renderHome(){
  const all=totals(),hiro=totals("本人"),husband=totals("夫"),monthly=state.plans.reduce((s,p)=>s+(Number(p.monthly)||0),0);
  $("totalFinancial").textContent=yen(state.cash+all.market);
  $("totalProfit").textContent=`評価損益 ${all.profit>=0?"+":""}${yen(all.profit)}`;
  $("totalProfit").className=all.profit<0?"negative":"positive";
  $("cashSummary").textContent=yen(state.cash);
  $("investmentSummary").textContent=yen(all.market);
  $("dividendSummary").textContent=yen(all.dividend);
  $("monthlySummary").textContent=yen(monthly);
  $("hiroSummary").textContent=yen(hiro.market);
  $("husbandSummary").textContent=yen(husband.market);
  $("hiroProfitSummary").textContent=`損益 ${hiro.profit>=0?"+":""}${yen(hiro.profit)}`;
  $("husbandProfitSummary").textContent=`損益 ${husband.profit>=0?"+":""}${yen(husband.profit)}`;
  $("hiroProfitSummary").className=hiro.profit<0?"negative":"positive";
  $("husbandProfitSummary").className=husband.profit<0?"negative":"positive";
  $("cashInput").value=state.cash||"";
  drawAllocationChart();
}

function drawAllocationChart(){
  const canvas=$("allocationChart"),ctx=canvas.getContext("2d");
  const dpr=Math.max(1,window.devicePixelRatio||1),cssWidth=Math.max(280,canvas.clientWidth||320),cssHeight=220;
  canvas.width=Math.round(cssWidth*dpr);canvas.height=Math.round(cssHeight*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,cssWidth,cssHeight);
  const hiro=totals("本人").market,husband=totals("夫").market;
  const items=[{label:"預金",value:state.cash,color:"#7f5b69"},{label:"本人の投資",value:hiro,color:"#b58b9a"},{label:"夫の投資",value:husband,color:"#6e8796"}];
  const total=items.reduce((s,i)=>s+i.value,0),cx=cssWidth/2,cy=105,r=76,inner=46;
  if(total<=0){ctx.strokeStyle=getComputedStyle(document.body).getPropertyValue("--line");ctx.lineWidth=28;ctx.beginPath();ctx.arc(cx,cy,61,0,Math.PI*2);ctx.stroke();ctx.fillStyle=getComputedStyle(document.body).getPropertyValue("--muted");ctx.textAlign="center";ctx.font="13px -apple-system";ctx.fillText("データを入力すると表示されます",cx,cy+5);}else{
    let angle=-Math.PI/2;
    for(const item of items){if(item.value<=0)continue;const next=angle+(item.value/total)*Math.PI*2;ctx.beginPath();ctx.arc(cx,cy,r,angle,next);ctx.arc(cx,cy,inner,next,angle,true);ctx.closePath();ctx.fillStyle=item.color;ctx.fill();angle=next;}
    ctx.fillStyle=getComputedStyle(document.body).getPropertyValue("--text");ctx.textAlign="center";ctx.font="700 14px -apple-system";ctx.fillText("合計",cx,cy-5);ctx.font="800 17px -apple-system";ctx.fillText(yen(total),cx,cy+18);
  }
  $("allocationLegend").innerHTML=items.map(i=>`<div class="legend-item"><span class="legend-dot" style="background:${i.color}"></span><span>${i.label} ${yen(i.value)}</span></div>`).join("");
}

function sortedFilteredAssets(){
  const query=$("assetSearch").value.trim().toLowerCase();
  const sort=$("assetSort").value;
  const list=state.assets.filter(a=>a.owner===currentOwner&&(!query||a.name.toLowerCase().includes(query)));
  return list.sort((a,b)=>{
    if(sort==="market-desc")return assetMetrics(b).market-assetMetrics(a).market;
    if(sort==="profit-desc")return assetMetrics(b).profit-assetMetrics(a).profit;
    if(sort==="name-asc")return a.name.localeCompare(b.name,"ja");
    return String(b.date||"").localeCompare(String(a.date||""));
  });
}

function renderOwnerKpi(){const t=totals(currentOwner);$("ownerMarket").textContent=yen(t.market);$("ownerProfit").textContent=`${t.profit>=0?"+":""}${yen(t.profit)}`;$("ownerProfit").className=t.profit<0?"negative":"positive";$("ownerDividend").textContent=yen(t.dividend);}

function renderAssets(){
  const list=sortedFilteredAssets();
  $("assetList").innerHTML=list.length?list.map(a=>{const m=assetMetrics(a);return `<article class="item-card"><div class="item-head"><div><div class="item-title">${escapeHtml(a.name)}</div><div class="item-sub">${escapeHtml(a.type)}・${escapeHtml(a.account)}・${escapeHtml(a.date||"")}</div></div><div class="item-value">${yen(m.market)}<small class="${m.profit<0?"negative":"positive"}">${m.profit>=0?"+":""}${yen(m.profit)}（${m.rate.toFixed(1)}%）</small></div></div><div class="item-grid"><div><span>保有数</span><strong>${Number(a.quantity).toLocaleString("ja-JP")}</strong></div><div><span>取得単価</span><strong>${yen(a.cost)}</strong></div><div><span>現在価格</span><strong>${yen(a.price)}</strong></div><div><span>取得総額</span><strong>${yen(m.invested)}</strong></div><div><span>年間配当</span><strong>${yen(a.dividend)}</strong></div><div><span>配当利回り</span><strong>${m.market?((Number(a.dividend)||0)/m.market*100).toFixed(2):"0.00"}%</strong></div></div><div class="item-actions"><button class="edit-button" data-edit-asset="${a.id}">編集</button><button class="delete-button" data-delete-asset="${a.id}">削除</button></div></article>`;}).join(""):`<div class="empty">${currentOwner}の保有資産はまだありません。</div>`;
  renderOwnerKpi();
}

function renderPlans(){
  const list=state.plans.filter(p=>p.owner===currentOwner).sort((a,b)=>String(b.start||"").localeCompare(String(a.start||"")));
  $("planList").innerHTML=list.length?list.map(p=>{const months=monthsSince(p.start),contributed=months*(Number(p.monthly)||0);return `<article class="item-card"><div class="item-head"><div><div class="item-title">${escapeHtml(p.name)}</div><div class="item-sub">${escapeHtml(p.account)}・${escapeHtml(p.start||"")}</div></div><div class="item-value">月 ${yen(p.monthly)}</div></div><div class="item-grid"><div><span>積立月数</span><strong>${months}か月</strong></div><div><span>累計入金額</span><strong>${yen(contributed)}</strong></div></div><div class="item-actions"><button class="edit-button" data-edit-plan="${p.id}">編集</button><button class="delete-button" data-delete-plan="${p.id}">削除</button></div></article>`;}).join(""):`<div class="empty">${currentOwner}の積立はまだありません。</div>`;
}

function renderTheme(){document.body.classList.toggle("dark",state.dark);$("themeButton").textContent=state.dark?"☀️":"🌙";}
function renderSecurity(){const enabled=hasPassword();$("securityStatus").innerHTML=enabled?"<strong>パスワードロック：オン</strong><br>保存データは暗号化されています。":"<strong>パスワードロック：オフ</strong><br>保存データはこの端末内に通常保存されています。";$("setPasswordButton").classList.toggle("hidden",enabled);$("changePasswordButton").classList.toggle("hidden",!enabled);$("removePasswordButton").classList.toggle("hidden",!enabled);$("lockNowButton").classList.toggle("hidden",!enabled);}
function renderAll(){renderGreeting();renderTheme();renderHome();renderAssets();renderPlans();renderSecurity();}

function clearAssetForm(){$("assetEditId").value="";["assetName","assetQuantity","assetCost","assetPrice","assetDividend"].forEach(id=>$(id).value="");$("assetDate").value=today();$("addAssetButton").textContent="保有資産を追加";$("cancelAssetEditButton").classList.add("hidden");}
function clearPlanForm(){$("planEditId").value="";["planName","planMonthly"].forEach(id=>$(id).value="");$("planStart").value=today();$("addPlanButton").textContent="積立を追加";$("cancelPlanEditButton").classList.add("hidden");}
function toast(message){const el=document.createElement("div");el.className="toast";el.textContent=message;document.body.appendChild(el);setTimeout(()=>el.remove(),2200);}

$("saveCashButton").addEventListener("click",async()=>{state.cash=Math.max(0,Number($("cashInput").value)||0);await saveState();renderHome();toast("預金残高を保存しました");});

$("addAssetButton").addEventListener("click",async()=>{
  const name=$("assetName").value.trim();if(!name)return alert("銘柄・商品名を入力してください");
  const payload={owner:currentOwner,name,type:$("assetType").value,account:$("assetAccount").value,date:$("assetDate").value||today(),quantity:Number($("assetQuantity").value)||0,cost:Number($("assetCost").value)||0,price:Number($("assetPrice").value)||0,dividend:Number($("assetDividend").value)||0};
  const editId=$("assetEditId").value;
  if(editId){state.assets=state.assets.map(a=>a.id===editId?{...a,...payload}:a);toast("保有資産を更新しました");}else{state.assets.push({id:crypto.randomUUID(),...payload});toast("保有資産を追加しました");}
  await saveState();clearAssetForm();renderAll();
});

$("addPlanButton").addEventListener("click",async()=>{
  const name=$("planName").value.trim();if(!name)return alert("商品名を入力してください");
  const payload={owner:currentOwner,name,monthly:Number($("planMonthly").value)||0,start:$("planStart").value||today(),account:$("planAccount").value};
  const editId=$("planEditId").value;
  if(editId){state.plans=state.plans.map(p=>p.id===editId?{...p,...payload}:p);toast("積立を更新しました");}else{state.plans.push({id:crypto.randomUUID(),...payload});toast("積立を追加しました");}
  await saveState();clearPlanForm();renderAll();
});

$("cancelAssetEditButton").addEventListener("click",clearAssetForm);
$("cancelPlanEditButton").addEventListener("click",clearPlanForm);
$("assetSearch").addEventListener("input",renderAssets);
$("assetSort").addEventListener("change",renderAssets);

document.addEventListener("click",async e=>{
  const assetId=e.target.dataset.deleteAsset,planId=e.target.dataset.deletePlan,editAssetId=e.target.dataset.editAsset,editPlanId=e.target.dataset.editPlan;
  if(assetId&&confirm("この保有資産を削除しますか？")){state.assets=state.assets.filter(a=>a.id!==assetId);await saveState();renderAll();}
  if(planId&&confirm("この積立を削除しますか？")){state.plans=state.plans.filter(p=>p.id!==planId);await saveState();renderAll();}
  if(editAssetId){const a=state.assets.find(x=>x.id===editAssetId);if(a){$("assetEditId").value=a.id;$("assetName").value=a.name;$("assetType").value=a.type;$("assetAccount").value=a.account;$("assetDate").value=a.date;$("assetQuantity").value=a.quantity;$("assetCost").value=a.cost;$("assetPrice").value=a.price;$("assetDividend").value=a.dividend;$("addAssetButton").textContent="変更を保存";$("cancelAssetEditButton").classList.remove("hidden");window.scrollTo({top:120,behavior:"smooth"});}}
  if(editPlanId){const p=state.plans.find(x=>x.id===editPlanId);if(p){$("planEditId").value=p.id;$("planName").value=p.name;$("planMonthly").value=p.monthly;$("planStart").value=p.start;$("planAccount").value=p.account;$("addPlanButton").textContent="変更を保存";$("cancelPlanEditButton").classList.remove("hidden");}}
  resetAutoLock();
});

document.querySelectorAll(".owner-tab").forEach(button=>button.addEventListener("click",()=>{currentOwner=button.dataset.owner;document.querySelectorAll(".owner-tab").forEach(b=>b.classList.toggle("active",b===button));clearAssetForm();clearPlanForm();renderAssets();renderPlans();}));
document.querySelectorAll(".nav-button").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll(".screen").forEach(s=>s.classList.toggle("active",s.id===button.dataset.screen));document.querySelectorAll(".nav-button").forEach(b=>b.classList.toggle("active",b===button));window.scrollTo({top:0,behavior:"smooth"});}));
$("themeButton").addEventListener("click",async()=>{state.dark=!state.dark;await saveState();renderTheme();drawAllocationChart();});

$("exportButton").addEventListener("click",()=>{const blob=new Blob([JSON.stringify({version:"6.0-second-release",exportedAt:new Date().toISOString(),encryptedAtRest:hasPassword(),data:state},null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`sakai-money-pro-backup-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});

$("importInput").addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;try{const parsed=JSON.parse(await file.text()),data=normalizeState(parsed.data||parsed);if(!Array.isArray(data.assets)||!Array.isArray(data.plans))throw new Error();if(!confirm("現在のデータをバックアップ内容で置き換えますか？"))return;state=data;await saveState();renderAll();toast("バックアップを読み込みました");}catch{alert("このバックアップファイルは読み込めませんでした");}finally{e.target.value="";}});

$("resetButton").addEventListener("click",async()=>{if(!confirm("すべての入力データを削除します。よろしいですか？"))return;state=structuredClone(defaultState);await saveState();clearAssetForm();clearPlanForm();renderAll();toast("データを初期化しました");});

function openPasswordDialog(mode){passwordMode=mode;$("passwordForm").reset();$("passwordFormError").textContent="";$("currentPasswordLabel").classList.toggle("hidden",mode!=="change");$("passwordDialogTitle").textContent=mode==="change"?"パスワードを変更":"パスワードロックを設定";$("passwordDialogCopy").textContent="8文字以上のパスワードを設定してください。忘れると復旧できません。";$("passwordDialog").showModal();}
$("setPasswordButton").addEventListener("click",()=>openPasswordDialog("set"));
$("changePasswordButton").addEventListener("click",()=>openPasswordDialog("change"));

$("passwordForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const current=$("currentPassword").value,newPassword=$("newPassword").value,confirmPassword=$("confirmPassword").value;
  if(newPassword.length<8)return $("passwordFormError").textContent="パスワードは8文字以上にしてください。";
  if(newPassword!==confirmPassword)return $("passwordFormError").textContent="確認用パスワードが一致しません。";
  try{
    if(passwordMode==="change"){
      const auth=JSON.parse(localStorage.getItem(AUTH_KEY)),oldKey=await deriveKey(current,base64ToBytes(auth.salt));
      await decryptState(JSON.parse(localStorage.getItem(ENCRYPTED_KEY)),oldKey);
    }
    const salt=crypto.getRandomValues(new Uint8Array(16)),key=await deriveKey(newPassword,salt);
    localStorage.setItem(AUTH_KEY,JSON.stringify({salt:bytesToBase64(salt),iterations:180000,createdAt:new Date().toISOString()}));
    activeKey=key;await saveState();localStorage.removeItem(STORAGE_KEY);$("passwordDialog").close();renderSecurity();resetAutoLock();toast(passwordMode==="change"?"パスワードを変更しました":"パスワードロックを設定しました");
  }catch{$("passwordFormError").textContent="現在のパスワードが違います。";}
});

$("removePasswordButton").addEventListener("click",async()=>{const password=prompt("現在のパスワードを入力してください");if(password===null)return;try{const auth=JSON.parse(localStorage.getItem(AUTH_KEY)),key=await deriveKey(password,base64ToBytes(auth.salt));state=await decryptState(JSON.parse(localStorage.getItem(ENCRYPTED_KEY)),key);activeKey=null;localStorage.setItem(STORAGE_KEY,JSON.stringify(state));localStorage.removeItem(AUTH_KEY);localStorage.removeItem(ENCRYPTED_KEY);renderSecurity();toast("パスワードロックを解除しました");}catch{alert("パスワードが違います");}});
$("lockNowButton").addEventListener("click",lockApp);
$("unlockButton").addEventListener("click",async()=>{const password=$("unlockPassword").value;try{const auth=JSON.parse(localStorage.getItem(AUTH_KEY)),key=await deriveKey(password,base64ToBytes(auth.salt));state=await decryptState(JSON.parse(localStorage.getItem(ENCRYPTED_KEY)),key);activeKey=key;unlockApp();}catch{$("unlockError").textContent="パスワードが違います。";}});
$("unlockPassword").addEventListener("keydown",e=>{if(e.key==="Enter")$("unlockButton").click();});
["pointerdown","keydown","touchstart"].forEach(name=>document.addEventListener(name,resetAutoLock,{passive:true}));
window.addEventListener("resize",()=>{if(!$("homeScreen").classList.contains("active"))return;drawAllocationChart();});

async function init(){
  $("assetDate").value=today();$("planStart").value=today();
  if(hasPassword()){lockApp();return;}
  state=loadPlainState();renderAll();
}
init();
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(console.error));
