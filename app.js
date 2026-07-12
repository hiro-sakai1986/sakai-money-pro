(() => {
"use strict";

const KEY = "sakaiMoneyPro32Loan";
let currentOwner = "本人";

const defaults = {
  cash: 900,
  months: {},
  stocks: [
    {owner:"本人",name:"ゆうちょ銀行",shares:700,value:0,pl:0},
    {owner:"本人",name:"イオン",shares:300,value:0,pl:0},
    {owner:"本人",name:"ソフトバンク",shares:1000,value:20.47,pl:8.43},
    {owner:"本人",name:"任天堂",shares:400,value:0,pl:-127.8},
    {owner:"本人",name:"カプコン",shares:200,value:0,pl:0},
    {owner:"本人",name:"シチズン",shares:100,value:0,pl:0}
  ],
  funds: [
    {owner:"本人",name:"MSプレH無",value:160,monthly:.5},
    {owner:"本人",name:"eMAXIS Slim",value:1.6,monthly:2.5},
    {owner:"本人",name:"S&P500",value:0,monthly:1.5},
    {owner:"本人",name:"オルカン",value:0,monthly:2.5},
    {owner:"本人",name:"半導体革命",value:2,monthly:.1},
    {owner:"本人",name:"FANG+",value:1.85,monthly:0},
    {owner:"本人",name:"SBI米国高配当",value:9.92,monthly:0}
  ],
  insurance: [
    {name:"学資保険",type:"学資保険",monthly:0,current:0,benefit:0,year:2035},
    {name:"個人年金",type:"個人年金",monthly:0,current:0,benefit:0,year:2051}
  ],
  children: [
    {name:"長女",grade:"小4",saved:0,target:500,monthly:1,nextEvent:"中学校入学",nextYear:2029},
    {name:"次女",grade:"小2",saved:0,target:500,monthly:1,nextEvent:"中学校入学",nextYear:2031},
    {name:"三女",grade:"4歳",saved:0,target:500,monthly:1,nextEvent:"小学校入学",nextYear:2028}
  ],
  lifeEvents: [
    {name:"車買い替え",year:2027,amount:300},
    {name:"旅行",year:2027,amount:100},
    {name:"住宅修繕",year:2032,amount:200}
  ],
  loan: {balance:4400,rate:1.05,payment:10.8,bonus:0,age:40,endYear:2064,autoReflect:"yes",deductionEnd:2032},
  future: {saving:2,invest:7,rate:4,retireAge:65,retireSpend:300,pension:220,inflation:1.5,includeEvents:"yes"}
};

const $ = id => document.getElementById(id);
const yen = v => `${Number(v || 0).toLocaleString("ja-JP",{maximumFractionDigits:1})}万円`;
const yen0 = v => `${Math.round(Number(v || 0)).toLocaleString("ja-JP")}円`;

function clone(obj){ return JSON.parse(JSON.stringify(obj)); }
function loadState(){
  try{
    const current = JSON.parse(localStorage.getItem(KEY) || "null");
    if(current) return {...clone(defaults), ...current};

    const oldKeys = [
      "sakaiMoneyPro34EducationInsurance",
      "sakaiMoneyPro33InvestComplete",
      "sakaiMoneyPro32Loan",
      "sakaiMoneyPro31Household",
      "sakaiMoneyPro3Stable",
      "sakaiMoneyCompleteV1",
      "sakaiMoneyUltimateV1",
      "sakaiMoneyProV3",
      "sakaiMoneyProIOSV1",
      "sakaiMoneyProV1",
      "sakaiMoneyFullV1"
    ];

    for(const key of oldKeys){
      const old = JSON.parse(localStorage.getItem(key) || "null");
      if(old){
        const migrated={...clone(defaults),...old};
        localStorage.setItem(KEY,JSON.stringify(migrated));
        return migrated;
      }
    }
    return clone(defaults);
  }catch(e){
    return clone(defaults);
  }
}
function saveState(s){ localStorage.setItem(KEY, JSON.stringify(s)); }
let state = loadState();

function ensureInvestmentFields(){
  state.stocks.forEach(x=>{
    if(x.dividend===undefined) x.dividend=0;
    if(x.months===undefined) x.months="6・12";
    if(x.pl===undefined) x.pl=0;
  });
  state.funds.forEach(x=>{
    if(x.pl===undefined) x.pl=0;
    if(x.monthly===undefined) x.monthly=0;
  });
}

ensureInvestmentFields();

function ensureEducationFields(){
  state.insurance=state.insurance||[];
  state.insurance.forEach((x,i)=>{
    if(x.name===undefined) x.name=x.type||`保険${i+1}`;
    if(x.type===undefined) x.type="その他";
    if(x.monthly===undefined) x.monthly=0;
    if(x.current===undefined) x.current=0;
    if(x.benefit===undefined) x.benefit=0;
    if(x.year===undefined) x.year=new Date().getFullYear()+10;
  });
  state.children=state.children||[];
  const defaultsMap={
    "長女":{grade:"小4",nextEvent:"中学校入学",nextYear:2029},
    "次女":{grade:"小2",nextEvent:"中学校入学",nextYear:2031},
    "三女":{grade:"4歳",nextEvent:"小学校入学",nextYear:2028}
  };
  state.children.forEach(x=>{
    const d=defaultsMap[x.name]||{};
    if(x.grade===undefined) x.grade=d.grade||"";
    if(x.nextEvent===undefined) x.nextEvent=d.nextEvent||"進学";
    if(x.nextYear===undefined) x.nextYear=d.nextYear||new Date().getFullYear()+1;
    if(x.saved===undefined) x.saved=0;
    if(x.target===undefined) x.target=500;
    if(x.monthly===undefined) x.monthly=1;
  });
  state.lifeEvents=state.lifeEvents||[];
}

ensureEducationFields();

function ensureFutureFields(){
  state.future=state.future||{};
  if(state.future.saving===undefined) state.future.saving=2;
  if(state.future.invest===undefined) state.future.invest=7;
  if(state.future.rate===undefined) state.future.rate=4;
  if(state.future.retireAge===undefined) state.future.retireAge=65;
  if(state.future.retireSpend===undefined) state.future.retireSpend=300;
  if(state.future.pension===undefined) state.future.pension=220;
  if(state.future.inflation===undefined) state.future.inflation=1.5;
  if(state.future.includeEvents===undefined) state.future.includeEvents="yes";
}

ensureFutureFields();

function restoreKnownBaselineIfEmpty(){
  const stockValue=state.stocks.reduce((a,x)=>a+(+x.value||0),0);
  const fundValue=state.funds.reduce((a,x)=>a+(+x.value||0),0);
  if((+state.cash||0)===0 && (+state.loan?.balance||0)===0 && stockValue+fundValue===0){
    const d=clone(defaults);
    state.cash=d.cash;
    state.stocks=d.stocks;
    state.funds=d.funds;
    state.loan=d.loan;
    saveState(state);
  }
}
restoreKnownBaselineIfEmpty();


function showScreen(id){
  document.querySelectorAll(".screen").forEach(x => x.classList.remove("active"));
  document.querySelectorAll("nav button").forEach(x => x.classList.remove("active"));
  $(id).classList.add("active");
  document.querySelector(`nav button[data-screen="${id}"]`)?.classList.add("active");
}
document.querySelectorAll("nav button").forEach(btn => btn.addEventListener("click", () => showScreen(btn.dataset.screen)));

function monthTotals(m){
  const x = state.months[m] || {};
  const receipt = (x.receipts || []).reduce((a,r)=>a+(+r.amount||0),0)/10000;
  const income = (+x.husband||0)+(+x.wife||0)+(+x.other||0);
  const expense = receipt+(+x.living||0)+(+x.mortgage||0)+(+x.insurance||0);
  const investment = +x.investment||0;
  const saving = +x.saving||0;
  return {income,expense,investment,saving,net:income-expense-investment-saving,receipt};
}

function drawGroupedBars(canvas, rows){
  const ctx=canvas.getContext("2d"),w=canvas.width,h=canvas.height;
  ctx.clearRect(0,0,w,h);
  const colors=["#5b7fa3","#c96b6b","#956775","#c9ab6d"],keys=["income","expense","investment","saving"];
  const max=Math.max(1,...rows.flatMap(r=>keys.map(k=>+r[k]||0)));
  const left=42,top=20,bottom=42,right=10,plotW=w-left-right,plotH=h-top-bottom,groupW=plotW/12,barW=Math.max(4,groupW*.15);
  ctx.strokeStyle="#e5e5ea";
  for(let i=0;i<5;i++){let y=top+i*plotH/4;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-right,y);ctx.stroke();}
  rows.forEach((r,i)=>{
    keys.forEach((k,j)=>{
      const v=+r[k]||0,bh=v/max*plotH,x=left+i*groupW+groupW*.12+j*(barW+2),y=top+plotH-bh;
      ctx.fillStyle=colors[j];ctx.fillRect(x,y,barW,bh);
    });
    ctx.fillStyle="#6e6e73";ctx.font="12px sans-serif";ctx.textAlign="center";ctx.fillText(`${i+1}月`,left+i*groupW+groupW/2,h-15);
  });
}
function drawDonut(canvas,items,legend){
  const ctx=canvas.getContext("2d"),w=canvas.width,h=canvas.height,clean=items.filter(x=>+x.value>0),colors=["#956775","#5e8c6a","#c9ab6d","#5b7fa3","#b47b4f","#8a6fa8","#4f8f8f"];
  ctx.clearRect(0,0,w,h);legend.innerHTML="";
  if(!clean.length){ctx.fillStyle="#6e6e73";ctx.font="16px sans-serif";ctx.textAlign="center";ctx.fillText("評価額を入力すると表示されます",w/2,h/2);return;}
  const total=clean.reduce((a,x)=>a+x.value,0);let start=-Math.PI/2;
  clean.forEach((x,i)=>{const ang=x.value/total*Math.PI*2;ctx.beginPath();ctx.moveTo(w/2,h/2);ctx.arc(w/2,h/2,Math.min(w,h)*.35,start,start+ang);ctx.fillStyle=colors[i%colors.length];ctx.fill();start+=ang;});
  ctx.beginPath();ctx.arc(w/2,h/2,Math.min(w,h)*.18,0,Math.PI*2);ctx.fillStyle="#fff";ctx.fill();
  ctx.fillStyle="#1d1d1f";ctx.font="bold 24px sans-serif";ctx.textAlign="center";ctx.fillText(total.toFixed(1)+"万",w/2,h/2+8);
  legend.innerHTML=clean.map((x,i)=>`<div class="legend-row"><span class="dot" style="background:${colors[i%colors.length]}"></span><span>${x.name}<br><small>${(x.value/total*100).toFixed(1)}%</small></span><strong>${yen(x.value)}</strong></div>`).join("");
}
function drawLine(canvas,vals){
  const ctx=canvas.getContext("2d"),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);
  const min=Math.min(...vals),max=Math.max(...vals,1),pad=40;
  ctx.strokeStyle="#e5e5ea";for(let i=0;i<5;i++){let y=20+i*(h-50)/4;ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(w-10,y);ctx.stroke();}
  ctx.strokeStyle="#956775";ctx.lineWidth=4;ctx.beginPath();
  vals.forEach((v,i)=>{let x=pad+(w-pad-15)*(i/(vals.length-1||1)),y=h-25-(v-min)/(max-min||1)*(h-55);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
  ctx.stroke();
}

function renderHome(){
  const m=new Date().getMonth()+1,t=monthTotals(m);
  const invest=state.stocks.reduce((a,x)=>a+(+x.value||0),0)+state.funds.reduce((a,x)=>a+(+x.value||0),0);
  const ins=state.insurance.reduce((a,x)=>a+(+x.current||0),0);
  $("homeCash").textContent=yen(state.cash);$("homeInvest").textContent=yen(invest);$("homeInsurance").textContent=yen(ins);$("homeLoan").textContent=yen(state.loan.balance);
  $("homeIncome").textContent=yen(t.income);$("homeExpense").textContent=yen(t.expense);$("homeMonthlyInvest").textContent=yen(t.investment);$("homeSaving").textContent=yen(t.saving);$("homeNet").textContent=(t.net>=0?"+":"")+yen(t.net);
  $("homeNet").className=t.net>=0?"positive":"negative";
  $("homeNotice").innerHTML=state.months[m]?`<div class="notice good">${m}月は入力済みです。</div>`:`<div class="notice warn">${m}月はまだ入力されていません。</div>`;
  drawGroupedBars($("cashflowChart"),Array.from({length:12},(_,i)=>monthTotals(i+1)));
}

function applyLoanToMonth(m){
  if(state.loan?.autoReflect==="yes"){
    state.months[m]=state.months[m]||{};
    if(state.months[m].mortgage===undefined || state.months[m].mortgage==="") state.months[m].mortgage=state.loan.payment;
  }
}

function loadMonthForm(){
  const m=+$("monthSelect").value;applyLoanToMonth(m);const x=state.months[m]||{};
  $("husbandIncome").value=x.husband??"";$("wifeIncome").value=x.wife??"";$("otherIncome").value=x.other??"";
  $("livingExpense").value=x.living??"";$("mortgageExpense").value=x.mortgage??10.8;$("insuranceExpense").value=x.insurance??"";
  $("monthlyInvestment").value=x.investment??"";$("monthlySaving").value=x.saving??2;$("monthEndCash").value=x.monthCash??"";
  $("monthStatus").textContent=Object.keys(x).length?`${m}月は保存済みです。追加・修正できます。`:`${m}月は未保存です。`;
  $("monthStatus").className=Object.keys(x).length?"notice good":"notice";
  renderReceipts();renderYearSummary();renderCategorySummary();
}
function saveMonth(){
  const m=+$("monthSelect").value,old=state.months[m]||{};
  state.months[m]={...old,husband:$("husbandIncome").value,wife:$("wifeIncome").value,other:$("otherIncome").value,living:$("livingExpense").value,mortgage:$("mortgageExpense").value,insurance:$("insuranceExpense").value,investment:$("monthlyInvestment").value,saving:$("monthlySaving").value,monthCash:$("monthEndCash").value,receipts:old.receipts||[]};
  if($("monthEndCash").value)state.cash=+$("monthEndCash").value;
  saveState(state);$("exportBackupBtn").addEventListener("click",exportBackup);
$("importBackupBtn").addEventListener("click",()=>$("backupFileInput").click());
$("backupFileInput").addEventListener("change",e=>importBackup(e.target.files[0]));

loadMonthForm();renderAll();alert(`${m}月を保存しました`);
}
function addReceipt(){
  const m=+$("monthSelect").value,a=+$("receiptAmount").value||0;if(a<=0)return alert("金額を入力してください");
  state.months[m]=state.months[m]||{};state.months[m].receipts=state.months[m].receipts||[];
  state.months[m].receipts.push({id:Date.now(),category:$("receiptCategory").value,amount:a});saveState(state);$("receiptAmount").value="";renderReceipts();renderYearSummary();renderAll();
}
function deleteReceipt(id){
  const m=+$("monthSelect").value;state.months[m].receipts=(state.months[m].receipts||[]).filter(x=>x.id!==id);saveState(state);renderReceipts();renderYearSummary();renderAll();
}
function renderReceipts(){
  const m=+$("monthSelect").value,list=state.months[m]?.receipts||[];let total=0;
  $("receiptList").innerHTML=list.map(x=>{total+=x.amount;return `<div class="receipt-item"><span>${x.category}</span><strong>${yen0(x.amount)}</strong><button class="mini" data-delete="${x.id}">削除</button></div>`}).join("");
  $("receiptTotal").textContent=yen0(total);
  document.querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",()=>deleteReceipt(+b.dataset.delete)));
}

function renderCategorySummary(){
  const m=+$("monthSelect").value,x=state.months[m]||{},cats={};
  (x.receipts||[]).forEach(r=>cats[r.category]=(cats[r.category]||0)+(+r.amount||0));
  if(+x.living) cats["生活費"]=+x.living*10000;
  if(+x.mortgage) cats["住宅ローン"]=+x.mortgage*10000;
  if(+x.insurance) cats["保険料"]=+x.insurance*10000;
  const items=Object.entries(cats).sort((a,b)=>b[1]-a[1]);
  $("categorySummary").innerHTML=items.length
    ? items.map(([name,value])=>`<div class="category-box"><div class="label">${name}</div><strong>${yen0(value)}</strong></div>`).join("")
    : '<div class="notice">この月の支出はまだありません。</div>';
}
function renderMonthlyHistory(){
  let rows="";
  for(let m=1;m<=12;m++){
    const t=monthTotals(m),saved=Object.keys(state.months[m]||{}).length>0;
    rows+=`<tr>
      <td>${m}月${saved?'<span class="month-chip">保存済</span>':''}</td>
      <td>${yen(t.income)}</td>
      <td>${yen(t.expense)}</td>
      <td>${yen(t.investment)}</td>
      <td>${yen(t.saving)}</td>
      <td class="${t.net>=0?'positive':'negative'}">${t.net>=0?'+':''}${yen(t.net)}</td>
    </tr>`;
  }
  $("monthlyHistory").innerHTML=rows;
}

function renderYearSummary(){
  let inc=0,exp=0,inv=0,sav=0;
  for(let m=1;m<=12;m++){
    const t=monthTotals(m);inc+=t.income;exp+=t.expense;inv+=t.investment;sav+=t.saving;
  }
  const net=inc-exp-inv-sav;
  $("yearIncome").textContent=yen(inc);
  $("yearExpense").textContent=yen(exp);
  $("yearInvest").textContent=yen(inv);
  $("yearSave").textContent=yen(sav);
  $("yearNet").textContent=(net>=0?"+":"")+yen(net);
  $("yearNet").className=net>=0?"positive":"negative";
  renderMonthlyHistory();
  renderCategorySummary();
}

function ownerInvestTotal(owner){
  return state.stocks.filter(x=>x.owner===owner).reduce((a,x)=>a+(+x.value||0),0)
    + state.funds.filter(x=>x.owner===owner).reduce((a,x)=>a+(+x.value||0),0);
}
function ownerPLTotal(owner){
  return state.stocks.filter(x=>x.owner===owner).reduce((a,x)=>a+(+x.pl||0),0)
    + state.funds.filter(x=>x.owner===owner).reduce((a,x)=>a+(+x.pl||0),0);
}
function ownerAnnualDividend(owner){
  return state.stocks.filter(x=>x.owner===owner)
    .reduce((a,x)=>a+(+x.shares||0)*(+x.dividend||0),0);
}
function parseDividendMonths(text){
  return String(text||"").split(/[・,、\s]+/).map(Number).filter(x=>x>=1&&x<=12);
}
function renderInvest(){
  document.querySelectorAll(".tabs button").forEach(b=>b.classList.toggle("active",b.dataset.owner===currentOwner));
  const stocks=state.stocks.filter(x=>x.owner===currentOwner);
  const funds=state.funds.filter(x=>x.owner===currentOwner);
  const selfTotal=ownerInvestTotal("本人"),husbandTotal=ownerInvestTotal("夫");
  const value=ownerInvestTotal(currentOwner),pl=ownerPLTotal(currentOwner),annualDiv=ownerAnnualDividend(currentOwner);

  $("selfInvestTotal").textContent=yen(selfTotal);
  $("husbandInvestTotal").textContent=yen(husbandTotal);
  $("familyInvestTotal").textContent=yen(selfTotal+husbandTotal);
  $("selectedOwnerValue").textContent=yen(value);
  $("selectedOwnerPL").textContent=(pl>=0?"+":"")+yen(pl);
  $("selectedOwnerPL").className=pl>=0?"positive":"negative";
  $("selectedOwnerDividend").textContent=yen0(annualDiv);
  $("selectedOwnerMonthlyDividend").textContent=yen0(annualDiv/12);

  $("ownerEmptyNotice").innerHTML=(!stocks.length&&!funds.length)
    ? `<div class="empty-owner">${currentOwner}の投資はまだ登録されていません。下から追加してください。</div>` : "";

  $("stockTable").innerHTML=stocks.length
    ? stocks.map(x=>{
        const i=state.stocks.indexOf(x);
        return `<tr>
          <td><input data-stock="${i}" data-field="name" value="${x.name}"></td>
          <td><input data-stock="${i}" data-field="shares" value="${x.shares}"></td>
          <td><input data-stock="${i}" data-field="value" value="${x.value}"></td>
          <td><input data-stock="${i}" data-field="pl" value="${x.pl}"></td>
          <td><input data-stock="${i}" data-field="dividend" value="${x.dividend}"></td>
          <td><input data-stock="${i}" data-field="months" value="${x.months}"></td>
          <td><button class="mini" data-delete-stock="${i}">削除</button></td>
        </tr>`;
      }).join("")
    : '<tr><td colspan="7">未登録</td></tr>';

  $("fundList").innerHTML=funds.length
    ? funds.map(x=>{
        const i=state.funds.indexOf(x);
        return `<div class="fund-edit-row">
          <input data-fund="${i}" data-field="name" value="${x.name}">
          <input data-fund="${i}" data-field="value" type="number" step=".1" value="${x.value}" placeholder="評価額">
          <input data-fund="${i}" data-field="pl" type="number" step=".1" value="${x.pl}" placeholder="損益">
          <input data-fund="${i}" data-field="monthly" type="number" step=".1" value="${x.monthly}" placeholder="月積立">
          <button class="mini" data-delete-fund="${i}">削除</button>
        </div>`;
      }).join("")
    : '<div class="notice">投資信託は未登録です。</div>';

  drawDonut(
    $("investPie"),
    stocks.map(x=>({name:x.name,value:+x.value||0}))
      .concat(funds.map(x=>({name:x.name,value:+x.value||0}))),
    $("investLegend")
  );

  renderPLRanking(stocks,funds);
  renderDividendCalendar(stocks);

  const monthly=funds.reduce((a,x)=>a+(+x.monthly||0),0);
  if(!$("investFutureMonthly").value) $("investFutureMonthly").value=monthly.toFixed(1);

  document.querySelectorAll("[data-delete-stock]").forEach(btn=>
    btn.addEventListener("click",()=>deleteStock(+btn.dataset.deleteStock))
  );
  document.querySelectorAll("[data-delete-fund]").forEach(btn=>
    btn.addEventListener("click",()=>deleteFund(+btn.dataset.deleteFund))
  );
}
function renderPLRanking(stocks,funds){
  const items=stocks.map(x=>({name:x.name,pl:+x.pl||0,type:"株"}))
    .concat(funds.map(x=>({name:x.name,pl:+x.pl||0,type:"投信"})))
    .sort((a,b)=>b.pl-a.pl);
  $("plRanking").innerHTML=items.length
    ? items.map((x,i)=>`<div class="pl-row"><div class="pl-rank">${i+1}</div><div>${x.name}<br><small>${x.type}</small></div><strong class="${x.pl>=0?'positive':'negative'}">${x.pl>=0?'+':''}${yen(x.pl)}</strong></div>`).join("")
    : '<div class="notice">評価損益を入力すると表示されます。</div>';
}
function renderDividendCalendar(stocks){
  const months=Array.from({length:12},(_,i)=>({month:i+1,value:0}));
  stocks.forEach(x=>{
    const ms=parseDividendMonths(x.months);
    const annual=(+x.shares||0)*(+x.dividend||0);
    if(ms.length) ms.forEach(m=>months[m-1].value+=annual/ms.length);
  });
  $("dividendCalendar").innerHTML=months.map(x=>`<div class="dividend-month"><span>${x.month}月</span><strong>${yen0(x.value)}</strong></div>`).join("");
  $("annualDividendTotal").textContent=yen0(months.reduce((a,x)=>a+x.value,0));
}
function addStock(){
  const name=$("newStockName").value.trim();
  if(!name) return alert("銘柄名を入力してください");
  state.stocks.push({owner:currentOwner,name,shares:0,value:+$("newStockValue").value||0,pl:0,dividend:0,months:"6・12"});
  saveState(state);
  $("newStockName").value="";$("newStockValue").value="";
  renderAll();
}
function addFund(){
  const name=$("newFundName").value.trim();
  if(!name) return alert("商品名を入力してください");
  state.funds.push({owner:currentOwner,name,value:+$("newFundValue").value||0,pl:0,monthly:0});
  saveState(state);
  $("newFundName").value="";$("newFundValue").value="";
  renderAll();
}
function deleteStock(index){
  if(!confirm("この個別株を削除しますか？")) return;
  state.stocks.splice(index,1);saveState(state);renderAll();
}
function deleteFund(index){
  if(!confirm("この投資信託を削除しますか？")) return;
  state.funds.splice(index,1);saveState(state);renderAll();
}
function saveStocks(){
  document.querySelectorAll("[data-stock]").forEach(el=>{
    const i=+el.dataset.stock,field=el.dataset.field;
    state.stocks[i][field]=(field==="name"||field==="months")?el.value:(+el.value||0);
  });
  saveState(state);renderAll();alert(`${currentOwner}の個別株を保存しました`);
}
function saveFunds(){
  document.querySelectorAll("[data-fund]").forEach(el=>{
    const i=+el.dataset.fund,field=el.dataset.field;
    state.funds[i][field]=field==="name"?el.value:(+el.value||0);
  });
  saveState(state);renderAll();alert(`${currentOwner}の投資信託を保存しました`);
}
function calculateInvestFuture(){
  const monthly=(+$("investFutureMonthly").value||0);
  const rate=(+$("investFutureRate").value||0)/100;
  const reinvest=$("reinvestDividend").value==="yes";
  const initial=ownerInvestTotal(currentOwner);
  const annualDiv=ownerAnnualDividend(currentOwner)/10000;
  const values=[];
  let asset=initial;
  for(let year=0;year<=20;year++){
    values.push(asset);
    if(year<20){
      asset=asset*(1+rate)+monthly*12+(reinvest?annualDiv:0);
    }
  }
  $("future5").textContent=yen(values[5]);
  $("future10").textContent=yen(values[10]);
  $("future20").textContent=yen(values[20]);
  drawLine($("investFutureChart"),values);
}

function educationEvents(){
  return [
    {year:2028,name:"三女 小学校入学",amount:0},
    {year:2029,name:"長女 中学校入学",amount:30},
    {year:2031,name:"次女 中学校入学",amount:30},
    {year:2032,name:"長女 高校入学",amount:50},
    {year:2034,name:"次女 高校・三女 中学校",amount:80},
    {year:2035,name:"長女 大学準備",amount:270},
    {year:2037,name:"次女 大学・三女 高校",amount:320},
    {year:2040,name:"三女 大学準備",amount:270}
  ];
}
function renderEducation(){
  const monthly=state.insurance.reduce((a,x)=>a+(+x.monthly||0),0);
  const current=state.insurance.reduce((a,x)=>a+(+x.current||0),0);
  const benefit=state.insurance.reduce((a,x)=>a+(+x.benefit||0),0);
  $("insuranceMonthlyTotal").textContent=yen(monthly);
  $("insuranceAnnualTotal").textContent=yen(monthly*12);
  $("insuranceCurrentTotal").textContent=yen(current);
  $("insuranceBenefitTotal").textContent=yen(benefit);

  $("insuranceCards").innerHTML=state.insurance.length
    ? state.insurance.map((x,i)=>`<div class="insurance-card">
        <div class="insurance-head">
          <div><div class="insurance-title">${x.name}</div><div class="insurance-sub">${x.type}・${x.year}年受取予定</div></div>
          <button class="mini" data-delete-insurance="${i}">削除</button>
        </div>
        <div class="insurance-grid">
          <div class="insurance-box"><label>保険名</label><input data-insurance="${i}" data-field="name" value="${x.name}"></div>
          <div class="insurance-box"><label>種類</label><input data-insurance="${i}" data-field="type" value="${x.type}"></div>
          <div class="insurance-box"><label>月額（万円）</label><input data-insurance="${i}" data-field="monthly" type="number" step=".01" value="${x.monthly}"></div>
          <div class="insurance-box"><label>現在価値（万円）</label><input data-insurance="${i}" data-field="current" type="number" step=".1" value="${x.current}"></div>
          <div class="insurance-box"><label>受取予定（万円）</label><input data-insurance="${i}" data-field="benefit" type="number" step=".1" value="${x.benefit}"></div>
          <div class="insurance-box"><label>受取年</label><input data-insurance="${i}" data-field="year" type="number" value="${x.year}"></div>
        </div>
      </div>`).join("")
    : '<div class="notice">保険はまだ登録されていません。</div>';

  $("childrenCards").innerHTML=state.children.map((x,i)=>{
    const pct=Math.min(100,(+x.saved||0)/(+x.target||1)*100);
    const years=Math.max(0,(+x.nextYear||0)-new Date().getFullYear());
    return `<div class="edu-card">
      <div class="edu-head">
        <div><div class="edu-name">${x.name}</div><div class="edu-sub">${x.grade}・${x.nextEvent}まであと${years}年</div></div>
        <strong>${pct.toFixed(1)}%</strong>
      </div>
      <div class="form" style="margin-top:10px">
        <div><label>学年・年齢</label><input data-child="${i}" data-field="grade" value="${x.grade}"></div>
        <div><label>次のイベント</label><input data-child="${i}" data-field="nextEvent" value="${x.nextEvent}"></div>
        <div><label>イベント年</label><input data-child="${i}" data-field="nextYear" type="number" value="${x.nextYear}"></div>
        <div><label>準備額（万円）</label><input data-child="${i}" data-field="saved" type="number" step=".1" value="${x.saved}"></div>
        <div><label>目標額（万円）</label><input data-child="${i}" data-field="target" type="number" step=".1" value="${x.target}"></div>
        <div><label>月積立（万円）</label><input data-child="${i}" data-field="monthly" type="number" step=".1" value="${x.monthly}"></div>
      </div>
      <div class="progress-label"><span>達成率</span><span>${pct.toFixed(1)}%</span></div>
      <div class="progress"><i style="width:${pct}%"></i></div>
      <div class="row"><span>不足額</span><strong>${yen(Math.max(0,(+x.target||0)-(+x.saved||0)))}</strong></div>
    </div>`;
  }).join("")+'<button class="primary" id="saveEducationBtn">保険・教育費を保存</button>';

  const events=educationEvents();
  $("educationTimeline").innerHTML=events.map(x=>`<div class="timeline-row"><div class="timeline-year">${x.year}</div><div>${x.name}</div><div class="timeline-amount">${yen(x.amount)}</div></div>`).join("");
  $("educationForecastTotal").textContent=yen(events.reduce((a,x)=>a+x.amount,0));
  drawEducationBars($("educationChart"),events);

  renderEducationAdvice();
  renderLifeEvents();

  document.querySelectorAll("[data-delete-insurance]").forEach(btn=>
    btn.addEventListener("click",()=>deleteInsurance(+btn.dataset.deleteInsurance))
  );
  $("saveEducationBtn").addEventListener("click",saveEducation);
}
function drawEducationBars(canvas,events){
  const ctx=canvas.getContext("2d"),w=canvas.width,h=canvas.height;
  ctx.clearRect(0,0,w,h);
  const max=Math.max(...events.map(x=>x.amount),1),left=45,right=12,top=22,bottom=48,plotW=w-left-right,plotH=h-top-bottom;
  ctx.strokeStyle="#e5e5ea";
  for(let i=0;i<5;i++){let y=top+i*plotH/4;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-right,y);ctx.stroke();}
  const bw=Math.max(12,plotW/events.length*.55);
  events.forEach((e,i)=>{
    const x=left+i*(plotW/events.length)+(plotW/events.length-bw)/2;
    const bh=(e.amount/max)*plotH,y=top+plotH-bh;
    ctx.fillStyle="#956775";ctx.fillRect(x,y,bw,bh);
    ctx.fillStyle="#6e6e73";ctx.font="12px sans-serif";ctx.textAlign="center";ctx.fillText(String(e.year),x+bw/2,h-18);
  });
}
function renderEducationAdvice(){
  const advice=[];
  state.children.forEach(x=>{
    const years=Math.max(0,(+x.nextYear||0)-new Date().getFullYear());
    const future=(+x.saved||0)+(+x.monthly||0)*12*years;
    const shortage=Math.max(0,(+x.target||0)-future);
    if(shortage>0){
      advice.push({type:"warn",title:`${x.name}はあと${years}年`,body:`現在の積立ペースでは、目標まで約${yen(shortage)}不足する見込みです。`});
    }else{
      advice.push({type:"good",title:`${x.name}の準備は順調`,body:`現在の積立ペースなら、次の進学時点で目標額に届く見込みです。`});
    }
  });
  $("educationAdvice").innerHTML=advice.map(x=>`<div class="advice-box ${x.type}"><strong>${x.title}</strong><br>${x.body}</div>`).join("");
}
function renderLifeEvents(){
  $("lifeEventList").innerHTML=state.lifeEvents.length
    ? state.lifeEvents.sort((a,b)=>a.year-b.year).map((x,i)=>`<div class="row"><span>${x.year}年　${x.name}</span><span><strong>${yen(x.amount)}</strong> <button class="mini" data-delete-life="${i}">削除</button></span></div>`).join("")
    : '<div class="notice">その他のイベントは未登録です。</div>';
  document.querySelectorAll("[data-delete-life]").forEach(btn=>
    btn.addEventListener("click",()=>deleteLifeEvent(+btn.dataset.deleteLife))
  );
}
function addInsurance(){
  const name=$("newInsuranceName").value.trim();
  if(!name) return alert("保険名を入力してください");
  state.insurance.push({
    name,
    type:$("newInsuranceType").value,
    monthly:+$("newInsuranceMonthly").value||0,
    current:+$("newInsuranceCurrent").value||0,
    benefit:+$("newInsuranceBenefit").value||0,
    year:+$("newInsuranceYear").value||new Date().getFullYear()+10
  });
  saveState(state);
  ["newInsuranceName","newInsuranceMonthly","newInsuranceCurrent","newInsuranceBenefit","newInsuranceYear"].forEach(id=>$(id).value="");
  renderAll();
}
function deleteInsurance(index){
  if(!confirm("この保険を削除しますか？")) return;
  state.insurance.splice(index,1);saveState(state);renderAll();
}
function saveEducation(){
  document.querySelectorAll("[data-insurance]").forEach(el=>{
    const i=+el.dataset.insurance,field=el.dataset.field;
    state.insurance[i][field]=(field==="name"||field==="type")?el.value:(+el.value||0);
  });
  document.querySelectorAll("[data-child]").forEach(el=>{
    const i=+el.dataset.child,field=el.dataset.field;
    state.children[i][field]=(field==="name"||field==="grade"||field==="nextEvent")?el.value:(+el.value||0);
  });
  saveState(state);renderAll();alert("保険・教育費を保存しました");
}
function addLifeEvent(){
  const name=$("lifeEventName").value.trim(),year=+$("lifeEventYear").value||0,amount=+$("lifeEventAmount").value||0;
  if(!name||!year) return alert("イベント名と年を入力してください");
  state.lifeEvents.push({name,year,amount});
  saveState(state);
  $("lifeEventName").value="";$("lifeEventYear").value="";$("lifeEventAmount").value="";
  renderAll();
}
function deleteLifeEvent(index){
  if(!confirm("このイベントを削除しますか？")) return;
  state.lifeEvents.splice(index,1);saveState(state);renderAll();
}

function loanAmortization(balance,rate,payment,bonus=0,prepay=0){
  let b=Math.max(0,(+balance||0)-(+prepay||0));
  const monthlyRate=(+rate||0)/100/12;
  const monthlyPayment=+payment||0;
  const annualBonus=+bonus||0;
  let months=0,totalInterest=0,points=[];
  if(monthlyPayment<=b*monthlyRate) return {months:Infinity,totalInterest:Infinity,points:[]};
  while(b>0 && months<1200){
    const interest=b*monthlyRate;
    let principal=Math.max(0,monthlyPayment-interest);
    if((months+1)%12===0 && annualBonus>0) principal+=annualBonus;
    totalInterest+=interest;
    b=Math.max(0,b-principal);
    months++;
    if(months%12===0 || b===0) points.push({year:months/12,balance:b});
  }
  return {months,totalInterest,points};
}
function currentLoanBreakdown(){
  const l=state.loan;
  const interest=(+l.balance||0)*(+l.rate||0)/100/12;
  const principal=Math.max(0,(+l.payment||0)-interest);
  return {payment:+l.payment||0,interest,principal,next:Math.max(0,(+l.balance||0)-principal)};
}
function drawLoanLine(canvas,points){
  const ctx=canvas.getContext("2d"),w=canvas.width,h=canvas.height;
  ctx.clearRect(0,0,w,h);
  const vals=points.map(x=>x.balance);
  if(!vals.length){ctx.fillStyle="#6e6e73";ctx.font="16px sans-serif";ctx.textAlign="center";ctx.fillText("ローン設定を保存すると表示されます",w/2,h/2);return;}
  const max=Math.max(...vals,1),left=45,right=12,top=22,bottom=35,plotW=w-left-right,plotH=h-top-bottom;
  ctx.strokeStyle="#e5e5ea";
  for(let i=0;i<5;i++){let y=top+i*plotH/4;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-right,y);ctx.stroke();}
  ctx.strokeStyle="#956775";ctx.lineWidth=4;ctx.beginPath();
  points.forEach((p,i)=>{let x=left+plotW*(i/(points.length-1||1)),y=top+plotH-(p.balance/max)*plotH;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
  ctx.stroke();
}
function renderLoan(){
  $("loanBalance").value=state.loan.balance;
  $("loanRate").value=state.loan.rate;
  $("loanPayment").value=state.loan.payment;
  $("loanBonus").value=state.loan.bonus??0;
  $("currentAge").value=state.loan.age;
  $("loanEndYear").value=state.loan.endYear??2064;
  $("loanAutoReflect").value=state.loan.autoReflect??"yes";
  $("loanDeductionEnd").value=state.loan.deductionEnd??2032;

  const b=currentLoanBreakdown();
  $("currentPayment").textContent=yen(b.payment);
  $("currentPrincipal").textContent=yen(b.principal);
  $("currentInterest").textContent=yen(b.interest);
  $("nextBalance").textContent=yen(b.next);

  const base=loanAmortization(state.loan.balance,state.loan.rate,state.loan.payment,state.loan.bonus,0);
  drawLoanLine($("loanBalanceChart"),base.points);
  updateLoan();
}
function saveLoan(){
  state.loan={
    balance:+$("loanBalance").value||0,
    rate:+$("loanRate").value||0,
    payment:+$("loanPayment").value||0,
    bonus:+$("loanBonus").value||0,
    age:+$("currentAge").value||0,
    endYear:+$("loanEndYear").value||0,
    autoReflect:$("loanAutoReflect").value,
    deductionEnd:+$("loanDeductionEnd").value||0
  };
  if(state.loan.autoReflect==="yes"){
    for(let m=1;m<=12;m++){
      state.months[m]=state.months[m]||{};
      state.months[m].mortgage=state.loan.payment;
    }
  }
  saveState(state);
  renderAll();
  loadMonthForm();
  alert("住宅ローン設定を保存しました");
}
function updateLoan(){
  const v=+$("prepayRange").value||0;
  const base=loanAmortization(state.loan.balance,state.loan.rate,state.loan.payment,state.loan.bonus,0);
  const after=loanAmortization(state.loan.balance,state.loan.rate,state.loan.payment,state.loan.bonus,v);
  $("prepayLabel").textContent=yen(v);
  $("payoffAge").textContent=Number.isFinite(after.months)?`${state.loan.age+Math.ceil(after.months/12)}歳`:"返済額不足";
  $("yearsSaved").textContent=Number.isFinite(after.months)?`${((base.months-after.months)/12).toFixed(1)}年`:"--";
  $("interestSaved").textContent=Number.isFinite(after.totalInterest)?yen(base.totalInterest-after.totalInterest):"--";
  $("cashAfterPrepay").textContent=yen(state.cash-v);
  const left=state.cash-v;
  $("loanAdvice").className="loan-advice "+(left>=800?"good":left>=500?"warn":"bad");
  $("loanAdvice").textContent=left>=800?"手元資金を800万円以上残せるため、検討しやすい範囲です。":left>=500?"教育費を考えると慎重に検討したい水準です。":"手元資金が少なくなるため、返済額を下げた方が安心です。";
}
function simulateRate(rate){
  const sim=loanAmortization(state.loan.balance,rate,state.loan.payment,state.loan.bonus,0);
  $("simRate").textContent=`${rate.toFixed(1)}%`;
  $("simPayoffAge").textContent=Number.isFinite(sim.months)?`${state.loan.age+Math.ceil(sim.months/12)}歳`:"返済額不足";
  $("simTotalInterest").textContent=Number.isFinite(sim.totalInterest)?yen(sim.totalInterest):"--";
}

function currentFinancialAssets(){
  const invest=state.stocks.reduce((a,x)=>a+(+x.value||0),0)+state.funds.reduce((a,x)=>a+(+x.value||0),0);
  const insurance=state.insurance.reduce((a,x)=>a+(+x.current||0),0);
  return {cash:+state.cash||0,invest,insurance,total:(+state.cash||0)+invest+insurance};
}
function buildEventMap(){
  const map={};
  educationEvents().forEach(x=>{
    if(!map[x.year]) map[x.year]=[];
    map[x.year].push({name:x.name,amount:+x.amount||0});
  });
  (state.lifeEvents||[]).forEach(x=>{
    if(!map[x.year]) map[x.year]=[];
    map[x.year].push({name:x.name,amount:+x.amount||0});
  });
  (state.insurance||[]).forEach(x=>{
    if((+x.year||0)>0 && (+x.benefit||0)>0){
      if(!map[x.year]) map[x.year]=[];
      map[x.year].push({name:`${x.name} 受取`,amount:-(+x.benefit||0)});
    }
  });
  return map;
}
function simulateFuture(retireAgeOverride=null){
  const f=state.future;
  const startAge=+state.loan.age||40;
  const currentYear=new Date().getFullYear();
  const retire=retireAgeOverride??(+f.retireAge||65);
  const events=f.includeEvents==="yes"?buildEventMap():{};
  const assets=currentFinancialAssets();
  let cash=assets.cash,invest=assets.invest+assets.insurance;
  const rows=[];
  for(let age=startAge;age<=90;age++){
    const year=currentYear+(age-startAge);
    let eventTotal=0,eventNames=[];
    (events[year]||[]).forEach(ev=>{eventTotal+=(+ev.amount||0);eventNames.push(ev.name);});
    if(age<retire){
      cash+=(+f.saving||0)*12;
      invest=invest*(1+(+f.rate||0)/100)+(+f.invest||0)*12;
    }else{
      const yearsAfter=Math.max(0,age-retire);
      const spend=(+f.retireSpend||0)*Math.pow(1+(+f.inflation||0)/100,yearsAfter);
      const pension=age>=65?(+f.pension||0):0;
      cash-=Math.max(0,spend-pension);
      invest*=1+(+f.rate||0)/100;
    }
    if(eventTotal>0) cash-=eventTotal;
    if(eventTotal<0) cash+=Math.abs(eventTotal);
    rows.push({age,year,total:cash+invest,eventTotal,eventNames});
  }
  return rows;
}
function renderFuture(){
  const f=state.future;
  $("futureSaving").value=f.saving;
  $("futureInvest").value=f.invest;
  $("futureRate").value=f.rate;
  $("retireAge").value=f.retireAge;
  $("retireSpend").value=f.retireSpend;
  $("pensionIncome").value=f.pension;
  $("inflationRate").value=f.inflation;
  $("includeEvents").value=f.includeEvents;

  const rows=simulateFuture();
  drawLine($("futureChart"),rows.map(x=>x.total));
  const valueAt=age=>rows.find(x=>x.age===age)?.total||0;
  $("asset65").textContent=yen(valueAt(65));
  $("asset70").textContent=yen(valueAt(70));
  $("asset80").textContent=yen(valueAt(80));
  $("asset90").textContent=yen(valueAt(90));

  $("retire55").textContent=yen(simulateFuture(55).at(-1)?.total||0);
  $("retire60").textContent=yen(simulateFuture(60).at(-1)?.total||0);
  $("retire65").textContent=yen(simulateFuture(65).at(-1)?.total||0);

  const eventRows=rows.filter(x=>x.eventNames.length);
  $("futureEventTable").innerHTML=eventRows.length
    ? eventRows.map(x=>`<tr>
        <td>${x.year}</td>
        <td>${x.age}歳</td>
        <td>${x.eventNames.join("・")}</td>
        <td>${x.eventTotal>=0?"▲":"＋"}${yen(Math.abs(x.eventTotal))}</td>
        <td class="${x.total>=0?'positive':'negative'}">${yen(x.total)}</td>
      </tr>`).join("")
    : '<tr><td colspan="5">登録イベントはありません。</td></tr>';

  renderFutureAdvice(rows);
}
function renderFutureAdvice(rows){
  const advice=[];
  const at65=rows.find(x=>x.age===65)?.total||0;
  const at90=rows.find(x=>x.age===90)?.total||0;
  const min=Math.min(...rows.map(x=>x.total));
  if(at65>=3000) advice.push({type:"good",title:"65歳時点の資産は比較的余裕あり",body:`現在の設定では約${yen(at65)}の見込みです。`});
  else advice.push({type:"warn",title:"老後資金をもう少し厚く",body:`65歳時点は約${yen(at65)}の見込みです。積立額や退職年齢を調整して比較してみて。`});
  if(at90<0) advice.push({type:"bad",title:"90歳までに資産が不足する見込み",body:"退職後支出、年金、積立額の見直しが必要です。"});
  else advice.push({type:"good",title:"90歳時点でも資産が残る見込み",body:`約${yen(at90)}残る試算です。`});
  if(min<500) advice.push({type:"warn",title:"途中で手元資金が薄くなる時期あり",body:"教育費や車・修繕が重なる年は、現金を厚めに残しておくと安心です。"});
  const r55=simulateFuture(55).at(-1)?.total||0;
  const r60=simulateFuture(60).at(-1)?.total||0;
  if(r55>=0) advice.push({type:"good",title:"55歳退職も試算上は可能",body:`90歳時点で約${yen(r55)}残る見込みです。`});
  else if(r60>=0) advice.push({type:"warn",title:"60歳退職なら現実的",body:`55歳では不足しますが、60歳なら約${yen(r60)}残る見込みです。`});
  else advice.push({type:"warn",title:"退職は65歳前後が安心",body:"現在の条件では早期退職すると資産不足の可能性があります。"});
  $("futureAdvice").innerHTML=advice.map(x=>`<div class="future-advice ${x.type}"><strong>${x.title}</strong><br>${x.body}</div>`).join("");
}
function saveFuture(){
  state.future={
    saving:+$("futureSaving").value||0,
    invest:+$("futureInvest").value||0,
    rate:+$("futureRate").value||0,
    retireAge:+$("retireAge").value||65,
    retireSpend:+$("retireSpend").value||0,
    pension:+$("pensionIncome").value||0,
    inflation:+$("inflationRate").value||0,
    includeEvents:$("includeEvents").value
  };
  saveState(state);
  renderAll();
  alert("未来予測の設定を保存しました");
}
})();