(()=>{
"use strict";
const $=id=>document.getElementById(id);
const KEY="sakaiMoneyPro41";
const nowY=new Date().getFullYear();
const money=v=>`${Number(v||0).toLocaleString("ja-JP",{maximumFractionDigits:1})}万円`;
const defaults={
 selectedYear:nowY,cash:900,yearData:{},
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
 future:{saving:2,invest:7,rate:4,retireAge:65}
};
const clone=x=>JSON.parse(JSON.stringify(x));
function load(){
 try{
  const s=JSON.parse(localStorage.getItem(KEY)||"null");
  if(s)return {...clone(defaults),...s};
  for(const k of ["sakaiMoneyPro4","sakaiMoneyPro32Loan","sakaiMoneyPro31Household","sakaiMoneyPro3Stable"]){
   const old=JSON.parse(localStorage.getItem(k)||"null");
   if(old){
    const n={...clone(defaults),...old};
    if(old.months)n.yearData={[nowY]:old.months};
    return n;
   }
  }
 }catch(e){}
 return clone(defaults);
}
let state=load(),owner="本人";
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
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
function renderHome(){
 fillYears();
 const inv=totalInvest("本人")+totalInvest("夫"),ins=state.insurance.reduce((a,x)=>a+(+x.value||0),0);
 $("homeCash").textContent=money(state.cash);$("homeInvest").textContent=money(inv);$("homeInsurance").textContent=money(ins);$("homeLoan").textContent=money(state.loan.balance);$("homeNet").textContent=money(state.cash+inv+ins-state.loan.balance);
 $("baseCash").value=state.cash;$("baseLoan").value=state.loan.balance;drawBars();
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
 const rows=state.assets.filter(x=>x.owner===owner);$("assetRows").innerHTML=rows.length?rows.map(x=>{const i=state.assets.indexOf(x);return `<tr><td><input data-asset="${i}" data-field="name" value="${x.name}"></td><td><input data-asset="${i}" data-field="value" type="number" value="${x.value}"></td><td><input data-asset="${i}" data-field="pl" type="number" value="${x.pl||0}"></td></tr>`}).join(""):'<tr><td colspan="3">未登録</td></tr>';
 document.querySelectorAll("[data-owner]").forEach(b=>b.classList.toggle("active",b.dataset.owner===owner));
}
function saveInvest(){document.querySelectorAll("[data-asset]").forEach(el=>{const x=state.assets[+el.dataset.asset],f=el.dataset.field;x[f]=f==="name"?el.value:(+el.value||0)});save();renderAll();alert("保存しました")}
function renderEducation(){
 $("insuranceList").innerHTML=state.insurance.map((x,i)=>`<div class="card"><div class="form"><div><label>保険名</label><input data-ins="${i}" data-field="name" value="${x.name}"></div><div><label>現在価値（万円）</label><input data-ins="${i}" data-field="value" type="number" value="${x.value}"></div></div></div>`).join("");
 $("childrenList").innerHTML=state.children.map((x,i)=>{const p=Math.min(100,(+x.saved||0)/(+x.target||1)*100);return `<div class="card"><strong>${x.name}</strong><div class="form"><div><label>準備額（万円）</label><input data-child="${i}" data-field="saved" type="number" value="${x.saved}"></div><div><label>目標額（万円）</label><input data-child="${i}" data-field="target" type="number" value="${x.target}"></div><div><label>月積立（万円）</label><input data-child="${i}" data-field="monthly" type="number" value="${x.monthly}"></div></div><div class="row"><span>達成率</span><strong>${p.toFixed(1)}%</strong></div><div class="progress"><i style="width:${p}%"></i></div></div>`}).join("");
}
function saveEducation(){document.querySelectorAll("[data-ins]").forEach(el=>{const x=state.insurance[+el.dataset.ins],f=el.dataset.field;x[f]=f==="name"?el.value:(+el.value||0)});document.querySelectorAll("[data-child]").forEach(el=>{state.children[+el.dataset.child][el.dataset.field]=+el.value||0});save();renderAll();alert("保存しました")}
function renderLoan(){const l=state.loan;$("loanBalance").value=l.balance;$("loanRate").value=l.rate;$("loanPayment").value=l.payment;$("loanAge").value=l.age;const interest=l.balance*l.rate/100/12,principal=Math.max(0,l.payment-interest);$("loanInterest").textContent=money(interest);$("loanPrincipal").textContent=money(principal);$("loanNext").textContent=money(Math.max(0,l.balance-principal))}
function project(age){let a=state.cash+totalInvest("本人")+totalInvest("夫")+state.insurance.reduce((s,x)=>s+(+x.value||0),0),cur=state.loan.age;for(let y=cur;y<age;y++)a=a*(1+state.future.rate/100)+(state.future.saving+state.future.invest)*12;return a}
function renderFuture(){const f=state.future;$("futureSaving").value=f.saving;$("futureInvest").value=f.invest;$("futureRate").value=f.rate;$("retireAge").value=f.retireAge;$("future65").textContent=money(project(65));$("future90").textContent=money(project(90))}
function renderAll(){renderHome();loadBook();renderInvest();renderEducation();renderLoan();renderFuture()}
$("bookMonth").innerHTML=Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i===new Date().getMonth()?"selected":""}>${i+1}月</option>`).join("");
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{document.querySelectorAll(".screen").forEach(x=>x.classList.remove("active"));document.querySelectorAll("nav button").forEach(x=>x.classList.remove("active"));$(b.dataset.screen).classList.add("active");b.classList.add("active")});
document.querySelectorAll("[data-owner]").forEach(b=>b.onclick=()=>{owner=b.dataset.owner;renderInvest()});
$("globalYear").onchange=e=>{state.selectedYear=+e.target.value;save();renderAll()};$("bookYear").onchange=e=>{state.selectedYear=+e.target.value;save();renderAll()};
$("addYear").onclick=()=>{state.selectedYear=Math.max(...years())+1;ensureYear(state.selectedYear);save();renderAll()};
$("saveBase").onclick=()=>{state.cash=+$("baseCash").value||0;state.loan.balance=+$("baseLoan").value||0;save();renderAll();alert("保存しました")};
$("bookMonth").onchange=loadBook;$("saveMonth").onclick=saveMonth;$("addReceipt").onclick=addReceipt;
$("addAsset").onclick=()=>{const n=$("newAssetName").value.trim();if(!n)return;state.assets.push({owner,name:n,value:+$("newAssetValue").value||0,pl:0});$("newAssetName").value="";$("newAssetValue").value="";save();renderAll()};$("saveInvest").onclick=saveInvest;
$("addInsurance").onclick=()=>{const n=$("newInsName").value.trim();if(!n)return;state.insurance.push({name:n,value:+$("newInsValue").value||0});$("newInsName").value="";$("newInsValue").value="";save();renderAll()};$("saveEducation").onclick=saveEducation;
$("saveLoan").onclick=()=>{state.loan={balance:+$("loanBalance").value||0,rate:+$("loanRate").value||0,payment:+$("loanPayment").value||0,age:+$("loanAge").value||40};save();renderAll();alert("保存しました")};
$("saveFuture").onclick=()=>{state.future={saving:+$("futureSaving").value||0,invest:+$("futureInvest").value||0,rate:+$("futureRate").value||0,retireAge:+$("retireAge").value||65};save();renderAll()};
$("exportData").onclick=()=>{const blob=new Blob([JSON.stringify({version:"4.1",state},null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`サカイ家MONEY_${new Date().toISOString().slice(0,10)}.json`;a.click()};
$("importData").onclick=()=>$("importFile").click();$("importFile").onchange=e=>{const r=new FileReader();r.onload=()=>{try{const p=JSON.parse(r.result);state={...clone(defaults),...(p.state||p)};save();renderAll();alert("復元しました")}catch{alert("読み込めませんでした")}};r.readAsText(e.target.files[0])};
renderAll();
if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js");
})();