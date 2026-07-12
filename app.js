(()=>{
"use strict";
const $=id=>document.getElementById(id);
const KEY="sakaiMoneyPro50";
const ENCRYPTED_KEY="sakaiMoneyPro52EncryptedState";

const AUTH_KEY="sakaiMoneyPro51Auth";
const SESSION_KEY="sakaiMoneyPro51Unlocked";
const AUTO_LOCK_MS=10*60*1000;
let autoLockTimer=null;
let setupMode=false;
let activeEncryptionKey=null;
let saveQueue=Promise.resolve();

function bytesToBase64(bytes){
  let s="";bytes.forEach(b=>s+=String.fromCharCode(b));
  return btoa(s);
}
function base64ToBytes(s){
  return Uint8Array.from(atob(s),c=>c.charCodeAt(0));
}
async function hashPassword(password,salt){
  const data=new TextEncoder().encode(password);
  const key=await crypto.subtle.importKey("raw",data,{name:"PBKDF2"},false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits(
    {name:"PBKDF2",salt,iterations:150000,hash:"SHA-256"},
    key,256
  );
  return bytesToBase64(new Uint8Array(bits));
}

async function deriveEncryptionKey(password,salt){
  const material=await crypto.subtle.importKey(
    "raw",new TextEncoder().encode(password),
    {name:"PBKDF2"},false,["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {name:"PBKDF2",salt,iterations:200000,hash:"SHA-256"},
    material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]
  );
}
async function encryptObject(value,key){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const plain=new TextEncoder().encode(JSON.stringify(value));
  const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,plain);
  return {iv:bytesToBase64(iv),ciphertext:bytesToBase64(new Uint8Array(encrypted))};
}
async function decryptObject(payload,key){
  const plain=await crypto.subtle.decrypt(
    {name:"AES-GCM",iv:base64ToBytes(payload.iv)},
    key,base64ToBytes(payload.ciphertext)
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
function loadPlaintextForMigration(){
  try{
    const current=JSON.parse(localStorage.getItem(KEY)||"null");
    if(current)return {...clone(defaults),...current};
    for(const k of ["sakaiMoneyPro41","sakaiMoneyPro4","sakaiMoneyPro32Loan","sakaiMoneyPro31Household","sakaiMoneyPro3Stable"]){
      const old=JSON.parse(localStorage.getItem(k)||"null");
      if(old){
        const migrated={...clone(defaults),...old};
        if(old.months)migrated.yearData={[nowY]:old.months};
        return migrated;
      }
    }
  }catch(e){}
  return clone(defaults);
}
async function loadEncryptedState(key){
  const raw=localStorage.getItem(ENCRYPTED_KEY);
  if(!raw)return null;
  return decryptObject(JSON.parse(raw),key);
}
async function saveEncryptedState(){
  if(!activeEncryptionKey)return;
  const payload=await encryptObject(state,activeEncryptionKey);
  localStorage.setItem(ENCRYPTED_KEY,JSON.stringify(payload));
}
function queueEncryptedSave(){
  if(!activeEncryptionKey)return Promise.resolve();
  saveQueue=saveQueue.then(saveEncryptedState).catch(err=>{
    console.error(err);
    alert("暗号化保存に失敗しました。");
  });
  return saveQueue;
}
function removePlaintextCopies(){
  [KEY,"sakaiMoneyPro41","sakaiMoneyPro4","sakaiMoneyPro32Loan","sakaiMoneyPro31Household","sakaiMoneyPro3Stable"]
    .forEach(k=>localStorage.removeItem(k));
}

function getAuth(){
  try{return JSON.parse(localStorage.getItem(AUTH_KEY)||"null")}catch(e){return null}
}
function showLock(isSetup=false){
  setupMode=isSetup;
  $("lockScreen").classList.remove("hidden");
  $("lockPassword").value="";
  $("lockPasswordConfirm").value="";
  $("lockError").textContent="";
  $("lockPasswordConfirm").style.display=isSetup?"block":"none";
  $("lockDescription").textContent=isSetup
    ?"最初に、この端末で使うパスワードを設定してください。"
    :"パスワードを入力してください。";
  $("unlockButton").textContent=isSetup?"パスワードを設定":"開く";
  setTimeout(()=>$("lockPassword").focus(),100);
}
function hideLock(){
  $("lockScreen").classList.add("hidden");
  sessionStorage.setItem(SESSION_KEY,"1");
  resetAutoLock();
}
async function handleUnlock(){
  const pass=$("lockPassword").value;
  try{
    if(setupMode){
      const confirmPass=$("lockPasswordConfirm").value;
      if(pass.length<8){
        $("lockError").textContent="8文字以上で設定してください。";
        return;
      }
      if(pass!==confirmPass){
        $("lockError").textContent="確認用パスワードと一致しません。";
        return;
      }
      const authSalt=crypto.getRandomValues(new Uint8Array(16));
      const encSalt=crypto.getRandomValues(new Uint8Array(16));
      const hash=await hashPassword(pass,authSalt);
      activeEncryptionKey=await deriveEncryptionKey(pass,encSalt);
      state=loadPlaintextForMigration();
      await saveEncryptedState();
      removePlaintextCopies();
      localStorage.setItem(AUTH_KEY,JSON.stringify({
        salt:bytesToBase64(authSalt),
        encSalt:bytesToBase64(encSalt),
        hash
      }));
      renderAll();
      hideLock();
      return;
    }

    const auth=getAuth();
    if(!auth){showLock(true);return}
    const hash=await hashPassword(pass,base64ToBytes(auth.salt));
    if(hash!==auth.hash){
      $("lockError").textContent="パスワードが違います。";
      return;
    }

    let encSalt=auth.encSalt?base64ToBytes(auth.encSalt):crypto.getRandomValues(new Uint8Array(16));
    activeEncryptionKey=await deriveEncryptionKey(pass,encSalt);

    let decrypted=null;
    try{decrypted=await loadEncryptedState(activeEncryptionKey)}catch(e){
      $("lockError").textContent="暗号化データを開けません。パスワードまたはデータが違います。";
      activeEncryptionKey=null;
      return;
    }
    state=decrypted?{...clone(defaults),...decrypted}:loadPlaintextForMigration();

    if(!auth.encSalt){
      auth.encSalt=bytesToBase64(encSalt);
      localStorage.setItem(AUTH_KEY,JSON.stringify(auth));
    }
    await saveEncryptedState();
    removePlaintextCopies();
    renderAll();
    hideLock();
  }catch(e){
    console.error(e);
    $("lockError").textContent="処理に失敗しました。もう一度試してください。";
  }
}
async function lockApp(){
  await queueEncryptedSave();
  sessionStorage.removeItem(SESSION_KEY);
  activeEncryptionKey=null;
  state=clone(defaults);
  if(autoLockTimer)clearTimeout(autoLockTimer);
  showLock(false);
}
function resetAutoLock(){
  if($("lockScreen") && !$("lockScreen").classList.contains("hidden"))return;
  if(autoLockTimer)clearTimeout(autoLockTimer);
  autoLockTimer=setTimeout(lockApp,AUTO_LOCK_MS);
}
async function changePassword(){
  const current=prompt("現在のパスワードを入力してください");
  if(current===null)return;
  const auth=getAuth();
  if(!auth)return showLock(true);
  const currentHash=await hashPassword(current,base64ToBytes(auth.salt));
  if(currentHash!==auth.hash)return alert("現在のパスワードが違います");

  const next=prompt("新しいパスワードを8文字以上で入力してください");
  if(next===null)return;
  if(next.length<8)return alert("8文字以上で入力してください");
  const confirmNext=prompt("確認のため、もう一度入力してください");
  if(next!==confirmNext)return alert("パスワードが一致しません");

  try{
    const authSalt=crypto.getRandomValues(new Uint8Array(16));
    const encSalt=crypto.getRandomValues(new Uint8Array(16));
    const nextHash=await hashPassword(next,authSalt);
    const nextKey=await deriveEncryptionKey(next,encSalt);
    const payload=await encryptObject(state,nextKey);
    localStorage.setItem(ENCRYPTED_KEY,JSON.stringify(payload));
    localStorage.setItem(AUTH_KEY,JSON.stringify({
      salt:bytesToBase64(authSalt),
      encSalt:bytesToBase64(encSalt),
      hash:nextHash
    }));
    activeEncryptionKey=nextKey;
    alert("パスワードを変更し、データを新しい鍵で再暗号化しました");
  }catch(e){
    console.error(e);
    alert("パスワード変更に失敗しました");
  }
}

const nowY=new Date().getFullYear();
const money=v=>`${Number(v||0).toLocaleString("ja-JP",{maximumFractionDigits:1})}万円`;
const defaults={
 selectedYear:nowY,cash:900,homeValue:4600,vehicleValue:250,otherDebt:0,lastNetWorth:0,dark:false,yearData:{},
 assets:[
  {owner:"本人",name:"ソフトバンク",value:20.47,pl:8.43},
  {owner:"本人",name:"MSプレH無",value:160,pl:0},
  {owner:"本人",name:"eMAXIS Slim",value:1.6,pl:0},
  {owner:"本人",name:"半導体革命",value:2,pl:0},
  {owner:"本人",name:"FANG+",value:1.85,pl:0},
  {owner:"本人",name:"SBI米国高配当",value:9.92,pl:0}
 ],
 insurance:[{name:"学資保険",value:0},{name:"個人年金",value:0}],
 children:[{name:"長女",saved:0,target:500,monthly:1},{name:"次女",saved:0,target:500,monthly:1},{name:"三女",saved:0,target:500,monthly:1}],
 loan:{balance:4400,rate:1.05,payment:10.8,age:40},
 future:{saving:2,invest:7,rate:4,retireAge:65,annualSpend:300},nisa:[{name:"オルカン",monthly:2.5},{name:"S&P500",monthly:1.5}],dividends:{}
};
const clone=x=>JSON.parse(JSON.stringify(x));
function load(){return clone(defaults)}
let state=clone(defaults),owner="本人";
function save(){queueEncryptedSave()}
function ensureYear(y){state.yearData=state.yearData||{};state.yearData[y]=state.yearData[y]||{};return state.yearData[y]}
function years(){const a=Object.keys(state.yearData||{}).map(Number);if(!a.includes(nowY))a.push(nowY);if(!a.includes(+state.selectedYear))a.push(+state.selectedYear);return a.sort((a,b)=>a-b)}
function fillYears(){["globalYear","bookYear"].forEach(id=>{$(id).innerHTML=years().map(y=>`<option value="${y}" ${y===+state.selectedYear?"selected":""}>${y}年</option>`).join("")})}
function monthTotal(m,y=state.selectedYear){
 const x=ensureYear(y)[m]||{},receipts=(x.receipts||[]).reduce((a,r)=>a+(+r.amount||0),0)/10000;
 const income=(+x.husband||0)+(+x.wife||0)+(+x.other||0);
 const expense=(+x.living||0)+(+x.mortgage||0)+(+x.insurance||0)+receipts;
 const investment=+x.investment||0,saving=+x.saving||0;
 return {income,expense,investment,saving,net:income-expense-investment-saving};
}
function totalInvest(o){return state.assets.filter(x=>x.owner===o).reduce((a,x)=>a+(+x.value||0),0)}
function drawBars(){
 const c=$("homeChart"),ctx=c.getContext("2d"),w=c.width,h=c.height,rows=Array.from({length:12},(_,i)=>monthTotal(i+1));
 ctx.clearRect(0,0,w,h);const keys=["income","expense","investment","saving"],colors=["#5b7fa3","#c96b6b","#956775","#c9ab6d"];
 const max=Math.max(1,...rows.flatMap(r=>keys.map(k=>r[k]))),left=42,top=20,bottom=40,pw=w-left-10,ph=h-top-bottom,g=pw/12,bw=Math.max(5,g*.14);
 ctx.strokeStyle="#e5e5ea";for(let i=0;i<5;i++){const y=top+i*ph/4;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-10,y);ctx.stroke()}
 rows.forEach((r,i)=>{keys.forEach((k,j)=>{const bh=r[k]/max*ph,x=left+i*g+g*.08+j*(bw+2);ctx.fillStyle=colors[j];ctx.fillRect(x,top+ph-bh,bw,bh)});ctx.fillStyle="#777";ctx.font="12px sans-serif";ctx.textAlign="center";ctx.fillText(`${i+1}月`,left+i*g+g/2,h-12)});
}

function ensureV50(){
 if(state.homeValue===undefined)state.homeValue=4600;
 if(state.vehicleValue===undefined)state.vehicleValue=250;
 if(state.otherDebt===undefined)state.otherDebt=0;
 if(state.lastNetWorth===undefined)state.lastNetWorth=0;
 if(state.dark===undefined)state.dark=false;
 if(!Array.isArray(state.nisa))state.nisa=[];
 state.assets.forEach(x=>{if(x.dividend===undefined)x.dividend=0;if(x.dividendMonths===undefined)x.dividendMonths="6・12"});
 if(!state.future.annualSpend)state.future.annualSpend=300;
}
ensureV50();
function financialAssets(){
 return (+state.cash||0)+totalInvest("本人")+totalInvest("夫")+state.insurance.reduce((a,x)=>a+(+x.value||0),0);
}
function realAssets(){return (+state.homeValue||0)+(+state.vehicleValue||0)}
function debts(){return (+state.loan.balance||0)+(+state.otherDebt||0)}
function netWorth(){return financialAssets()+realAssets()-debts()}
function drawDonut(canvas,items,legend){
 const ctx=canvas.getContext("2d"),w=canvas.width,h=canvas.height;
 ctx.clearRect(0,0,w,h);
 const vals=items.filter(x=>x.value>0),total=vals.reduce((a,x)=>a+x.value,0);
 if(!total){ctx.fillStyle="#777";ctx.font="18px sans-serif";ctx.textAlign="center";ctx.fillText("データを入力すると表示されます",w/2,h/2);legend.innerHTML="";return}
 const colors=["#956775","#5b7fa3","#c9ab6d","#6f9f7d","#b9807a","#8d78a8"];
 let a=-Math.PI/2,cx=w/2,cy=h/2,r=Math.min(w,h)*.34;
 vals.forEach((x,i)=>{const b=a+x.value/total*Math.PI*2;ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,a,b);ctx.closePath();ctx.fillStyle=colors[i%colors.length];ctx.fill();a=b});
 ctx.beginPath();ctx.arc(cx,cy,r*.56,0,Math.PI*2);ctx.fillStyle=getComputedStyle(document.body).getPropertyValue("--card").trim()||"#fff";ctx.fill();
 ctx.fillStyle=getComputedStyle(document.body).getPropertyValue("--text").trim()||"#111";ctx.font="bold 22px sans-serif";ctx.textAlign="center";ctx.fillText(money(total),cx,cy+7);
 legend.innerHTML=vals.map((x,i)=>`<div class="legend-item"><span class="dot" style="background:${colors[i%colors.length]}"></span><span>${x.name} ${((x.value/total)*100).toFixed(1)}%</span></div>`).join("");
}
function dividendMonths(text){return String(text||"").split(/[・,、\s]+/).map(Number).filter(x=>x>=1&&x<=12)}
function annualDividendTotal(ownerFilter=null){
 return state.assets.filter(x=>!ownerFilter||x.owner===ownerFilter).reduce((sum,x)=>sum+(+x.dividend||0),0);
}
function renderDividends(){
 const months=Array.from({length:12},(_,i)=>({m:i+1,v:0}));
 state.assets.forEach(x=>{const annual=+x.dividend||0,ms=dividendMonths(x.dividendMonths);if(ms.length)ms.forEach(m=>months[m-1].v+=annual/ms.length)});
 $("dividendCalendar").innerHTML=months.map(x=>`<div class="div-month"><span>${x.m}月</span><strong>${Math.round(x.v).toLocaleString()}円</strong></div>`).join("");
 $("annualDividend").textContent=`${Math.round(months.reduce((a,x)=>a+x.v,0)).toLocaleString()}円`;
}
function renderNisa(){
 $("nisaList").innerHTML=state.nisa.length?state.nisa.map((x,i)=>`<div class="nisa-row"><input data-nisa="${i}" data-field="name" value="${x.name}"><input data-nisa="${i}" data-field="monthly" type="number" step=".1" value="${x.monthly}"><span>万円/月</span><button class="mini" data-del-nisa="${i}">削除</button></div>`).join(""):'<div class="notice">NISA積立は未登録です。</div>';
 document.querySelectorAll("[data-del-nisa]").forEach(b=>b.onclick=()=>{state.nisa.splice(+b.dataset.delNisa,1);save();renderNisa()});
}
function fireProjection(retireAge){
 const current=state.loan.age||40;
 let asset=financialAssets();
 for(let age=current;age<90;age++){
   if(age<retireAge) asset=asset*(1+state.future.rate/100)+(state.future.saving+state.future.invest)*12;
   else asset=asset*(1+state.future.rate/100)-state.future.annualSpend;
 }
 return asset;
}
function renderFire(){
 const target=(state.future.annualSpend||300)*25,gap=Math.max(0,target-financialAssets());
 $("fireTarget").textContent=money(target);$("fireGap").textContent=money(gap);
 [55,60,65].forEach(a=>{$(`fire${a}`).textContent=fireProjection(a)>=0?"○ 可能":"△ 要調整"});
}

function renderHome(){
 fillYears();
 const inv=totalInvest("本人")+totalInvest("夫"),ins=state.insurance.reduce((a,x)=>a+(+x.value||0),0),net=netWorth(),delta=net-(+state.lastNetWorth||0);
 $("homeCash").textContent=money(state.cash);$("homeInvest").textContent=money(inv);$("homeInsurance").textContent=money(ins);$("homeRealAssets").textContent=money(realAssets());
 $("homeFinancial").textContent=money(financialAssets());$("homeDebt").textContent=money(debts());$("homeNet").textContent=money(net);
 $("netDelta").textContent=`前月比 ${delta>=0?"+":""}${money(delta)}`;$("netDelta").className=`kpi-delta ${delta>=0?"positive":"negative"}`;
 $("baseCash").value=state.cash;$("baseLoan").value=state.loan.balance;$("homeValue").value=state.homeValue;$("vehicleValue").value=state.vehicleValue;$("otherDebt").value=state.otherDebt;$("lastNetWorth").value=state.lastNetWorth;
 drawDonut($("allocationChart"),[
  {name:"現金",value:+state.cash||0},{name:"投資",value:inv},{name:"保険",value:ins},{name:"自宅",value:+state.homeValue||0},{name:"車・バイク",value:+state.vehicleValue||0}
 ],$("allocationLegend"));
 drawBars();
}
function loadBook(){
 fillYears();const m=+$("bookMonth").value,x=ensureYear(state.selectedYear)[m]||{};
 const map={mHusband:"husband",mWife:"wife",mOther:"other",mLiving:"living",mMortgage:"mortgage",mInsurance:"insurance",mInvest:"investment",mSaving:"saving"};
 Object.entries(map).forEach(([id,k])=>$(id).value=x[k]??(k==="mortgage"?state.loan.payment:""));
 renderReceipts();renderYear();
}
function saveMonth(){
 const m=+$("bookMonth").value,x=ensureYear(state.selectedYear)[m]||{};
 Object.assign(x,{husband:+$("mHusband").value||0,wife:+$("mWife").value||0,other:+$("mOther").value||0,living:+$("mLiving").value||0,mortgage:+$("mMortgage").value||0,insurance:+$("mInsurance").value||0,investment:+$("mInvest").value||0,saving:+$("mSaving").value||0,receipts:x.receipts||[]});
 ensureYear(state.selectedYear)[m]=x;save();renderAll();alert("保存しました");
}
function addReceipt(){const a=+$("receiptAmount").value;if(!a)return;const m=+$("bookMonth").value,x=ensureYear(state.selectedYear)[m]||{};x.receipts=x.receipts||[];x.receipts.push({id:Date.now(),category:$("receiptCategory").value,amount:a});ensureYear(state.selectedYear)[m]=x;$("receiptAmount").value="";save();loadBook();renderHome()}
function renderReceipts(){const x=ensureYear(state.selectedYear)[+$("bookMonth").value]||{},list=x.receipts||[];$("receiptList").innerHTML=list.map(r=>`<div class="receipt"><span>${r.category}</span><strong>${Number(r.amount).toLocaleString()}円</strong><button class="mini" data-delreceipt="${r.id}">削除</button></div>`).join("");document.querySelectorAll("[data-delreceipt]").forEach(b=>b.onclick=()=>{x.receipts=x.receipts.filter(r=>r.id!==+b.dataset.delreceipt);save();loadBook();renderHome()})}
function renderYear(){let a={income:0,expense:0,investment:0,saving:0};for(let m=1;m<=12;m++){const t=monthTotal(m);Object.keys(a).forEach(k=>a[k]+=t[k])}$("yearIncome").textContent=money(a.income);$("yearExpense").textContent=money(a.expense);$("yearInvest").textContent=money(a.investment);$("yearSaving").textContent=money(a.saving)}
function renderInvest(){
 const self=totalInvest("本人"),hus=totalInvest("夫");$("selfTotal").textContent=money(self);$("husbandTotal").textContent=money(hus);$("familyTotal").textContent=money(self+hus);
 const rows=state.assets.filter(x=>x.owner===owner);$("assetRows").innerHTML=rows.length?rows.map(x=>{const i=state.assets.indexOf(x);return `<tr><td><input data-asset="${i}" data-field="name" value="${x.name}"></td><td><input data-asset="${i}" data-field="value" type="number" value="${x.value}"></td><td><input data-asset="${i}" data-field="pl" type="number" value="${x.pl||0}"></td><td><input data-asset="${i}" data-field="dividend" type="number" value="${x.dividend||0}" title="年間配当円"></td><td><input data-asset="${i}" data-field="dividendMonths" value="${x.dividendMonths||'6・12'}" title="受取月"></td></tr>`}).join(""):'<tr><td colspan="5">未登録</td></tr>';
 document.querySelectorAll("[data-owner]").forEach(b=>b.classList.toggle("active",b.dataset.owner===owner));
}
function saveInvest(){document.querySelectorAll("[data-asset]").forEach(el=>{const x=state.assets[+el.dataset.asset],f=el.dataset.field;x[f]=(f==="name"||f==="dividendMonths")?el.value:(+el.value||0)});save();renderAll();alert("保存しました")}
function renderEducation(){
 $("insuranceList").innerHTML=state.insurance.map((x,i)=>`<div class="card"><div class="form"><div><label>保険名</label><input data-ins="${i}" data-field="name" value="${x.name}"></div><div><label>現在価値（万円）</label><input data-ins="${i}" data-field="value" type="number" value="${x.value}"></div></div></div>`).join("");
 $("childrenList").innerHTML=state.children.map((x,i)=>{const p=Math.min(100,(+x.saved||0)/(+x.target||1)*100);return `<div class="card"><strong>${x.name}</strong><div class="form"><div><label>準備額（万円）</label><input data-child="${i}" data-field="saved" type="number" value="${x.saved}"></div><div><label>目標額（万円）</label><input data-child="${i}" data-field="target" type="number" value="${x.target}"></div><div><label>月積立（万円）</label><input data-child="${i}" data-field="monthly" type="number" value="${x.monthly}"></div></div><div class="row"><span>達成率</span><strong>${p.toFixed(1)}%</strong></div><div class="progress"><i style="width:${p}%"></i></div></div>`}).join("");
}
function saveEducation(){document.querySelectorAll("[data-ins]").forEach(el=>{const x=state.insurance[+el.dataset.ins],f=el.dataset.field;x[f]=(f==="name"||f==="dividendMonths")?el.value:(+el.value||0)});document.querySelectorAll("[data-child]").forEach(el=>{state.children[+el.dataset.child][el.dataset.field]=+el.value||0});save();renderAll();alert("保存しました")}
function renderLoan(){const l=state.loan;$("loanBalance").value=l.balance;$("loanRate").value=l.rate;$("loanPayment").value=l.payment;$("loanAge").value=l.age;const interest=l.balance*l.rate/100/12,principal=Math.max(0,l.payment-interest);$("loanInterest").textContent=money(interest);$("loanPrincipal").textContent=money(principal);$("loanNext").textContent=money(Math.max(0,l.balance-principal))}
function project(age){let a=state.cash+totalInvest("本人")+totalInvest("夫")+state.insurance.reduce((s,x)=>s+(+x.value||0),0),cur=state.loan.age;for(let y=cur;y<age;y++)a=a*(1+state.future.rate/100)+(state.future.saving+state.future.invest)*12;return a}
function renderFuture(){const f=state.future;$("futureSaving").value=f.saving;$("futureInvest").value=f.invest;$("futureRate").value=f.rate;$("retireAge").value=f.retireAge;$("annualSpend").value=f.annualSpend;$("future65").textContent=money(project(65));$("future90").textContent=money(project(90))}
function renderAll(){renderHome();loadBook();renderInvest();renderDividends();renderNisa();renderEducation();renderLoan();renderFuture();renderFire();document.body.classList.toggle("dark",!!state.dark);$("themeToggle").textContent=state.dark?"☀️":"🌙"}
$("bookMonth").innerHTML=Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i===new Date().getMonth()?"selected":""}>${i+1}月</option>`).join("");
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{document.querySelectorAll(".screen").forEach(x=>x.classList.remove("active"));document.querySelectorAll("nav button").forEach(x=>x.classList.remove("active"));$(b.dataset.screen).classList.add("active");b.classList.add("active")});
document.querySelectorAll("[data-owner]").forEach(b=>b.onclick=()=>{owner=b.dataset.owner;renderInvest()});
$("globalYear").onchange=e=>{state.selectedYear=+e.target.value;save();renderAll()};$("bookYear").onchange=e=>{state.selectedYear=+e.target.value;save();renderAll()};
$("addYear").onclick=()=>{state.selectedYear=Math.max(...years())+1;ensureYear(state.selectedYear);save();renderAll()};
$("saveBase").onclick=()=>{state.cash=+$("baseCash").value||0;state.loan.balance=+$("baseLoan").value||0;state.homeValue=+$("homeValue").value||0;state.vehicleValue=+$("vehicleValue").value||0;state.otherDebt=+$("otherDebt").value||0;state.lastNetWorth=+$("lastNetWorth").value||0;save();renderAll();alert("保存しました")};
$("bookMonth").onchange=loadBook;$("saveMonth").onclick=saveMonth;$("addReceipt").onclick=addReceipt;
$("addAsset").onclick=()=>{const n=$("newAssetName").value.trim();if(!n)return;state.assets.push({owner,name:n,value:+$("newAssetValue").value||0,pl:0,dividend:0,dividendMonths:"6・12"});$("newAssetName").value="";$("newAssetValue").value="";save();renderAll()};$("saveInvest").onclick=saveInvest;
$("addInsurance").onclick=()=>{const n=$("newInsName").value.trim();if(!n)return;state.insurance.push({name:n,value:+$("newInsValue").value||0});$("newInsName").value="";$("newInsValue").value="";save();renderAll()};$("saveEducation").onclick=saveEducation;
$("saveLoan").onclick=()=>{state.loan={balance:+$("loanBalance").value||0,rate:+$("loanRate").value||0,payment:+$("loanPayment").value||0,age:+$("loanAge").value||40};save();renderAll();alert("保存しました")};
$("saveFuture").onclick=()=>{state.future={saving:+$("futureSaving").value||0,invest:+$("futureInvest").value||0,rate:+$("futureRate").value||0,retireAge:+$("retireAge").value||65,annualSpend:+$("annualSpend").value||300};save();renderAll()};
$("exportData").onclick=async()=>{
  if(!activeEncryptionKey)return alert("ロックを解除してください");
  await queueEncryptedSave();
  const auth=getAuth();
  const encrypted=JSON.parse(localStorage.getItem(ENCRYPTED_KEY)||"null");
  const backup={
    version:"5.2",
    encrypted:true,
    exportedAt:new Date().toISOString(),
    encSalt:auth.encSalt,
    data:encrypted
  };
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`サカイ家MONEY_暗号化バックアップ_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};
$("importData").onclick=()=>$("importFile").click();
$("importFile").onchange=e=>{
  const file=e.target.files[0];
  if(!file)return;
  const r=new FileReader();
  r.onload=async()=>{
    try{
      const backup=JSON.parse(r.result);
      if(!backup.encrypted||!backup.encSalt||!backup.data)throw new Error("not encrypted");
      const password=prompt("バックアップ作成時のパスワードを入力してください");
      if(password===null)return;
      const backupKey=await deriveEncryptionKey(password,base64ToBytes(backup.encSalt));
      const restored=await decryptObject(backup.data,backupKey);
      state={...clone(defaults),...restored};
      await saveEncryptedState();
      renderAll();
      alert("暗号化バックアップを復元しました");
    }catch(err){
      console.error(err);
      alert("復元できませんでした。パスワードまたはバックアップファイルを確認してください。");
    }finally{
      e.target.value="";
    }
  };
  r.readAsText(file);
};

$("themeToggle").onclick=()=>{state.dark=!state.dark;save();renderAll()};
$("addNisa").onclick=()=>{const n=$("newNisaName").value.trim();if(!n)return;state.nisa.push({name:n,monthly:+$("newNisaMonthly").value||0});$("newNisaName").value="";$("newNisaMonthly").value="";save();renderNisa()};
$("saveNisa").onclick=()=>{document.querySelectorAll("[data-nisa]").forEach(el=>{const x=state.nisa[+el.dataset.nisa],f=el.dataset.field;x[f]=f==="name"?el.value:(+el.value||0)});save();renderAll();alert("NISA積立を保存しました")};


$("unlockButton").onclick=handleUnlock;
$("lockPassword").addEventListener("keydown",e=>{if(e.key==="Enter")handleUnlock()});
$("lockPasswordConfirm").addEventListener("keydown",e=>{if(e.key==="Enter")handleUnlock()});
$("lockNowButton").onclick=lockApp;
$("manualLockButton").onclick=lockApp;
$("changePasswordButton").onclick=changePassword;
["click","touchstart","keydown","scroll"].forEach(evt=>document.addEventListener(evt,resetAutoLock,{passive:true}));
document.addEventListener("visibilitychange",()=>{if(document.hidden)queueEncryptedSave()});
window.addEventListener("pagehide",()=>queueEncryptedSave());

const initialAuth=getAuth();
if(!initialAuth){
  showLock(true);
}else{
  showLock(false);
}

if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js");
})();