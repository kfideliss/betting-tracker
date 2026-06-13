import { useState, useEffect, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar, ScatterChart, Scatter, ZAxis, Legend, ComposedChart, Area } from "recharts";
import { lsGet, lsSet, exportAllData, importAllData } from "./storage";
import { useAuth, LoginScreen } from "./auth";

const C = {
  bg: "#0d0f14", surface: "#13161d", card: "#1a1e28", border: "#252a38",
  combined: "#a78bfa", win: "#22c55e", loss: "#ef4444", push: "#f59e0b",
  pending: "#60a5fa", bonus: "#fbbf24", future: "#c084fc", cashout: "#2dd4bf",
  text: "#e8eaf0", muted: "#6b7280", accent: "#1e6fff",
};
const BOOK_COLORS = ["#1e6fff","#00a651","#f97316","#ec4899","#14b8a6","#eab308","#8b5cf6","#ef4444"];
const SPORTS = ["AFL","Soccer","NRL","NBA","Other"];
const MARKETS = ["Head-to-Head","Line/Handicap","Player Stats","Same Game Multi","Over/Under","Futures Market","Other"];
const BET_TYPES = ["Regular","Future","Multi"];
const OUTCOMES = ["Pending","Win","Loss","Push","Bonus Refund","Cashed Out"];
const STAKE_PRESETS = [5,10,20,25,50];
const TIME_FILTERS = ["All Time","YTD","This Month","This Week"];
const DEFAULT_BOOKS = [
  { name:"TAB", balance:845.95, color:"#1e6fff" },
  { name:"Bet365", balance:54.50, color:"#00a651" },
];

function daysUntil(dateStr){ if(!dateStr) return null; const d=new Date(dateStr+"T00:00:00"); const n=new Date(); n.setHours(0,0,0,0); return Math.round((d-n)/86400000); }
function fmt(n){ return n>=0?`+$${n.toFixed(2)}`:`-$${Math.abs(n).toFixed(2)}`; }
function fmtAbs(n){ return `$${Math.abs(n).toFixed(2)}`; }
function evColor(ev){ return ev===null?C.muted:ev>=0?C.win:C.loss; }

function betPL(b){
  const stake=parseFloat(b.stake),odds=parseFloat(b.odds||0),cost=b.isBonus?0:stake;
  if(b.outcome==="Win") return stake*(odds-1);
  if(b.outcome==="Loss"||b.outcome==="Bonus Refund") return -cost;
  if(b.outcome==="Cashed Out") return parseFloat(b.collectAmount||0)-cost;
  return 0;
}
function betCost(b){ return b.isBonus?0:parseFloat(b.stake||0); }

function balanceEffect(b,outcome){
  const stake=parseFloat(b.stake),odds=parseFloat(b.odds||0);
  if(outcome==="Win"){ if(b.isBonus) return stake*(odds-1); return b.deducted?stake*odds:stake*(odds-1); }
  if(outcome==="Loss"||outcome==="Bonus Refund"){ if(b.isBonus) return 0; return b.deducted?0:-stake; }
  if(outcome==="Push"){ if(b.isBonus) return 0; return b.deducted?stake:0; }
  if(outcome==="Cashed Out"){ const c=parseFloat(b.collectAmount||0); if(b.isBonus) return c; return b.deducted?c:c-stake; }
  return 0;
}

function inTimeFilter(dateStr,filter){
  if(filter==="All Time"||!dateStr) return true;
  const d=new Date(dateStr),now=new Date();
  if(filter==="YTD") return d.getFullYear()===now.getFullYear();
  if(filter==="This Month") return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();
  if(filter==="This Week"){ const day=now.getDay(),monday=new Date(now); monday.setDate(now.getDate()-((day+6)%7)); monday.setHours(0,0,0,0); return d>=monday; }
  return true;
}
function settleDate(b){ return b.settledDate||b.date; }


function StatCard({label,value,sub,color}){
  return(
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderLeft:`3px solid ${color||C.border}`,borderRadius:10,padding:"14px 18px",marginBottom:2}}>
      <div style={{color:C.muted,fontSize:10,letterSpacing:"0.12em",fontWeight:600,textTransform:"uppercase",marginBottom:5}}>{label}</div>
      <div style={{color:color||C.text,fontSize:22,fontWeight:800,fontFamily:"monospace"}}>{value}</div>
      {sub&&<div style={{color:C.muted,fontSize:10,marginTop:3}}>{sub}</div>}
    </div>
  );
}
function Pill({label,color}){
  return <span style={{background:color+"22",color,border:`1px solid ${color}44`,borderRadius:20,padding:"2px 9px",fontSize:10,fontWeight:600,whiteSpace:"nowrap"}}>{label}</span>;
}
const iStyle={width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,padding:"9px 12px",color:C.text,fontSize:14,boxSizing:"border-box"};
const sBtn=(col)=>({background:col+"22",color:col,border:`1px solid ${col}55`,borderRadius:6,padding:"7px 12px",fontSize:11,fontWeight:700,cursor:"pointer"});

export default function App(){
  const {authed,login}=useAuth();
  const [bets,setBets]=useState([]);
  const [books,setBooks]=useState(DEFAULT_BOOKS);
  const [txns,setTxns]=useState([]);
  const [tab,setTab]=useState("dashboard");
  const [timeFilter,setTimeFilter]=useState("All Time");
  const [chartFilter,setChartFilter]=useState("All Time");
  const [aiSummary,setAiSummary]=useState("");
  const [aiLoading,setAiLoading]=useState(false);
  const emptyForm={date:new Date().toISOString().slice(0,10),sport:"AFL",market:"Head-to-Head",bookmaker:"TAB",match:"",stake:"",odds:"",myProb:"",outcome:"Pending",notes:"",betType:"Regular",isBonus:false};
  const [form,setForm]=useState(emptyForm);
  const [quickMode,setQuickMode]=useState(true);
  const [editId,setEditId]=useState(null);
  const [filterSport,setFilterSport]=useState("All");
  const [filterBook,setFilterBook]=useState("All");
  const [filterOutcome,setFilterOutcome]=useState("All");
  const [loaded,setLoaded]=useState(false);
  const [toast,setToast]=useState("");
  const [isMobile,setIsMobile]=useState(false);
  const [futuresOpen,setFuturesOpen]=useState(false);
  const [selectedSport,setSelectedSport]=useState(null);
  const [visibleBooks,setVisibleBooks]=useState([]);
  const [visibleSports,setVisibleSports]=useState([]);
  const [sportMetric,setSportMetric]=useState("pl");
  const [refundFor,setRefundFor]=useState(null);
  const [refundAmt,setRefundAmt]=useState("");
  const [cashoutFor,setCashoutFor]=useState(null);
  const [cashoutAmt,setCashoutAmt]=useState("");
  const [newBookName,setNewBookName]=useState("");
  const [newBookBal,setNewBookBal]=useState("");
  const [txnForm,setTxnForm]=useState({book:"TAB",type:"deposit",amount:"",date:new Date().toISOString().slice(0,10),notes:""});
  const [balEdit,setBalEdit]=useState(null);
  const [balEditVal,setBalEditVal]=useState("");
  const [calMonth,setCalMonth]=useState(()=>{const n=new Date();return{y:n.getFullYear(),m:n.getMonth()};});
  const [calDay,setCalDay]=useState(null);
  const [customSports,setCustomSports]=useState(SPORTS);
  const [customMarkets,setCustomMarkets]=useState(MARKETS);
  const [newSportName,setNewSportName]=useState("");
  const [newMarketName,setNewMarketName]=useState("");
  const [credits,setCredits]=useState([]);
  const [creditForm,setCreditForm]=useState({book:"",amount:"",source:"",expiry:""});

  useEffect(()=>{
    const check=()=>setIsMobile(window.innerWidth<640);
    check(); window.addEventListener("resize",check);
    return()=>window.removeEventListener("resize",check);
  },[]);

  useEffect(()=>{
    if(!authed) return;
    setBets(lsGet("bets_v1",[]));
    const sb=lsGet("books_v1",null);
    if(sb) setBooks(sb);
    setTxns(lsGet("txns_v1",[]));
    const ss=lsGet("sports_v1",null); if(ss) setCustomSports(ss);
    const ms=lsGet("markets_v1",null); if(ms) setCustomMarkets(ms);
    setCredits(lsGet("credits_v1",[]));
    setLoaded(true);
  },[authed]);

  function showToast(msg){setToast(msg);setTimeout(()=>setToast(""),3000);}
  const persistBets=useCallback(async(next)=>{setBets(next);lsSet("bets_v1",next);},[]);
  const persistBooks=useCallback(async(next)=>{setBooks(next);lsSet("books_v1",next);},[]);
  const persistTxns=useCallback(async(next)=>{setTxns(next);lsSet("txns_v1",next);},[]);
  const persistCredits=useCallback(async(next)=>{setCredits(next);lsSet("credits_v1",next);},[]);

  function bookColor(name){return books.find(b=>b.name===name)?.color||C.muted;}
  const bookNames=books.map(b=>b.name);

  function adjustBalance(bookName,delta){
    const current=lsGet("books_v1",books);
    const next=current.map(b=>b.name===bookName?{...b,balance:parseFloat((b.balance+delta).toFixed(2))}:b);
    setBooks(next); lsSet("books_v1",next);
    return next.find(b=>b.name===bookName)?.balance;
  }

  function settleBet(bet,outcome,extra=null){
    const freshBets=lsGet("bets_v1",[]);
    const current=freshBets.find(b=>b.id===bet.id);
    if(!current) return;
    const updated={...current,outcome,settledDate:new Date().toISOString().slice(0,10)};
    if(outcome==="Bonus Refund") updated.refundAmount=extra;
    if(outcome==="Cashed Out") updated.collectAmount=extra;
    if(outcome==="Pending") delete updated.settledDate;
    const delta=-balanceEffect(current,current.outcome)+balanceEffect(updated,outcome);
    let nextBets=freshBets.map(b=>b.id===bet.id?updated:b);
    if(outcome==="Bonus Refund"&&extra>0){
      nextBets=[...nextBets,{
        id:`${Date.now()}-refund`,date:new Date().toISOString().slice(0,10),
        sport:current.sport,market:"Other",bookmaker:current.bookmaker,
        match:`Bonus bet credit (refund from: ${current.match.slice(0,40)})`,
        stake:extra,odds:"",myProb:null,outcome:"Pending",
        notes:"Auto-created from Bonus Refund.",betType:"Regular",isBonus:true,deducted:false,isCredit:true,
      }];
    }
    setBets(nextBets); lsSet("bets_v1",nextBets);
    if(delta!==0){
      const newBal=adjustBalance(current.bookmaker,delta);
      showToast(`${current.bookmaker} ${delta>=0?"+":""}$${delta.toFixed(2)} → $${newBal.toFixed(2)}`);
    } else { showToast(`Marked as ${outcome}`); }
    setRefundFor(null);setRefundAmt("");setCashoutFor(null);setCashoutAmt("");
  }

  // Data export/import for carry-over
  function handleDataExport(){
    const data=exportAllData();
    const blob=new Blob([data],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url; a.download=`edge-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
    URL.revokeObjectURL(url);
    showToast("Backup downloaded");
  }
  function handleDataImport(e){
    const file=e.target.files[0];
    if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        importAllData(ev.target.result);
        setBets(lsGet("bets_v1",[]));
        const sb=lsGet("books_v1",null); if(sb) setBooks(sb);
        setTxns(lsGet("txns_v1",[]));
        setImported(lsGet("imported_v1",false));
        showToast("Data imported successfully");
      } catch { showToast("Import failed — invalid file"); }
    };
    reader.readAsText(file);
  }

  const settledAll=bets.filter(b=>b.outcome!=="Pending");
  const settled=settledAll.filter(b=>inTimeFilter(settleDate(b),timeFilter));
  const wins=settled.filter(b=>b.outcome==="Win");
  const losses=settled.filter(b=>b.outcome==="Loss"||b.outcome==="Bonus Refund");
  const pendingAll=bets.filter(b=>b.outcome==="Pending");
  const pendingRegular=pendingAll.filter(b=>(b.betType==="Regular"||b.betType==="Multi")&&!b.deferred);
  const pendingFutures=pendingAll.filter(b=>b.betType==="Future"||b.deferred);
  const totalPL=settled.reduce((acc,b)=>acc+betPL(b),0);
  const totalCost=settled.reduce((acc,b)=>acc+betCost(b),0);
  const roi=totalCost>0?(totalPL/totalCost)*100:0;
  const winRate=settled.length>0?(wins.length/settled.length)*100:0;
  const totalBankroll=books.reduce((a,b)=>a+b.balance,0);
  const evBets=bets.filter(b=>b.myProb&&b.odds);
  const avgEV=evBets.length>0?evBets.reduce((acc,b)=>acc+((parseFloat(b.myProb)/100)*parseFloat(b.odds)-1),0)/evBets.length:null;
  const cashAtRisk=pendingAll.reduce((a,b)=>a+(b.isBonus?0:parseFloat(b.stake||0)),0);
  const bonusHeld=pendingAll.filter(b=>b.isBonus).reduce((a,b)=>a+parseFloat(b.stake||0),0);
  const futuresExposure=pendingFutures.reduce((a,b)=>a+(b.isBonus?0:parseFloat(b.stake||0)),0);
  const futuresPotential=pendingFutures.reduce((a,b)=>a+(b.odds?parseFloat(b.stake)*parseFloat(b.odds):0),0);

  const todayStr=new Date().toISOString().slice(0,10);
  const creditsAvailable=credits.filter(c=>c.status!=="used"&&(!c.expiry||c.expiry>=todayStr)).sort((a,b)=>(a.expiry||"9999").localeCompare(b.expiry||"9999"));
  const creditsExpired=credits.filter(c=>c.status!=="used"&&c.expiry&&c.expiry<todayStr);
  const creditAvailValue=creditsAvailable.reduce((a,c)=>a+parseFloat(c.amount||0),0);
  const creditsExpiringSoon=creditsAvailable.filter(c=>{const d=daysUntil(c.expiry);return d!==null&&d<=7;});
  const bonusBetsAll=bets.filter(b=>b.isBonus);
  const bonusPending=bonusBetsAll.filter(b=>b.outcome==="Pending");
  const bonusSettled=bonusBetsAll.filter(b=>b.outcome!=="Pending");
  const bonusWins=bonusSettled.filter(b=>b.outcome==="Win"||b.outcome==="Cashed Out").length;
  const bonusCashWon=bonusSettled.reduce((a,b)=>a+betPL(b),0);
  const bonusFaceStaked=bonusSettled.reduce((a,b)=>a+parseFloat(b.stake||0),0);
  const bonusConversion=bonusFaceStaked>0?(bonusCashWon/bonusFaceStaked)*100:0;
  const bonusWinRate=bonusSettled.length>0?(bonusWins/bonusSettled.length)*100:0;

  const bankrollSeries=(()=>{
    const events=[];
    settledAll.forEach(b=>events.push({date:settleDate(b),book:b.bookmaker,delta:balanceEffect(b,b.outcome),kind:"bet"}));
    txns.forEach(t=>events.push({date:t.date,book:t.book,delta:t.type==="deposit"?parseFloat(t.amount):-parseFloat(t.amount),kind:t.type}));
    const filtered=events.filter(e=>inTimeFilter(e.date,chartFilter)).sort((a,b)=>new Date(a.date)-new Date(b.date));
    const start={};
    books.forEach(bk=>{const s=filtered.filter(e=>e.book===bk.name).reduce((a,e)=>a+e.delta,0);start[bk.name]=bk.balance-s;});
    const running={...start};
    const points=[{date:"Start",...Object.fromEntries(books.map(bk=>[bk.name,parseFloat(running[bk.name].toFixed(2))])),Combined:parseFloat(Object.values(running).reduce((a,v)=>a+v,0).toFixed(2))}];
    const txnMarkers=[];
    filtered.forEach(e=>{
      running[e.book]=(running[e.book]||0)+e.delta;
      const pt={date:e.date.slice(5),...Object.fromEntries(books.map(bk=>[bk.name,parseFloat((running[bk.name]||0).toFixed(2))])),Combined:parseFloat(Object.values(running).reduce((a,v)=>a+v,0).toFixed(2))};
      points.push(pt);
      if(e.kind==="deposit"||e.kind==="withdrawal") txnMarkers.push({kind:e.kind,date:e.date.slice(5)});
    });
    return{points,txnMarkers};
  })();

  const bookStats=books.map(bk=>{
    const bb=settled.filter(b=>b.bookmaker===bk.name);
    const pl=bb.reduce((acc,b)=>acc+betPL(b),0);
    const cost=bb.reduce((acc,b)=>acc+betCost(b),0);
    return{...bk,pl,roi:cost>0?(pl/cost)*100:0,count:bb.length};
  });

  const marketBreakdown=MARKETS.map(m=>{
    const mb=settled.filter(b=>b.market===m);
    const pl=parseFloat(mb.reduce((a,b)=>a+betPL(b),0).toFixed(2));
    const cost=mb.reduce((a,b)=>a+betCost(b),0);
    return{market:m==="Same Game Multi"?"SGM":m==="Head-to-Head"?"H2H":m.split("/")[0].split(" ")[0],pl,roi:cost>0?(pl/cost)*100:0,count:mb.length};
  }).filter(m=>m.count>0);

  const sportBreakdown=SPORTS.map(s=>{
    const sb=settled.filter(b=>b.sport===s);
    if(sb.length===0) return null;
    const pl=sb.reduce((a,b)=>a+betPL(b),0);
    const cost=sb.reduce((a,b)=>a+betCost(b),0);
    const w=sb.filter(b=>b.outcome==="Win").length;
    return{sport:s,pl:parseFloat(pl.toFixed(2)),roi:cost>0?(pl/cost)*100:0,strike:(w/sb.length)*100,count:sb.length};
  }).filter(Boolean);

  function marketBreakdownForSport(sport){
    return MARKETS.map(m=>{
      const mb=settled.filter(b=>b.sport===sport&&b.market===m);
      const pl=parseFloat(mb.reduce((a,b)=>a+betPL(b),0).toFixed(2));
      const cost=mb.reduce((a,b)=>a+betCost(b),0);
      return{market:m==="Same Game Multi"?"SGM":m==="Head-to-Head"?"H2H":m.split("/")[0].split(" ")[0],pl,roi:cost>0?(pl/cost)*100:0,count:mb.length};
    }).filter(m=>m.count>0);
  }

  const sportPLSeries=(()=>{
    const events=settledAll
      .filter(b=>inTimeFilter(settleDate(b),chartFilter))
      .map(b=>({date:settleDate(b),sport:b.sport,pl:betPL(b)}))
      .sort((a,b)=>new Date(a.date)-new Date(b.date));
    const running=Object.fromEntries(SPORTS.map(s=>[s,0]));
    const points=[{date:"Start",...Object.fromEntries(SPORTS.map(s=>[s,0]))}];
    events.forEach(e=>{
      running[e.sport]=(running[e.sport]||0)+e.pl;
      points.push({date:e.date.slice(5),...Object.fromEntries(SPORTS.map(s=>[s,parseFloat(running[s].toFixed(2))]))});
    });
    return points;
  })();
  const activeSports=SPORTS.filter(s=>settledAll.some(b=>b.sport===s&&inTimeFilter(settleDate(b),chartFilter)));
  const sportStartBankroll=bankrollSeries.points.length?bankrollSeries.points[0].Combined:totalBankroll;
  const sportChartData=sportMetric==="bankroll"
    ? sportPLSeries.map(pt=>{const o={date:pt.date};SPORTS.forEach(s=>{o[s]=parseFloat((sportStartBankroll+(pt[s]||0)).toFixed(2));});return o;})
    : sportPLSeries;

  const calibration=(()=>{
    const withProb=settled.filter(b=>b.myProb&&b.outcome!=="Push");
    if(withProb.length<3) return[];
    const buckets=[[0,40],[40,50],[50,60],[60,70],[70,100]];
    return buckets.map(([lo,hi])=>{
      const inB=withProb.filter(b=>parseFloat(b.myProb)>=lo&&parseFloat(b.myProb)<hi);
      if(inB.length===0) return null;
      const actual=(inB.filter(b=>b.outcome==="Win").length/inB.length)*100;
      const avgEst=inB.reduce((a,b)=>a+parseFloat(b.myProb),0)/inB.length;
      return{est:parseFloat(avgEst.toFixed(1)),actual:parseFloat(actual.toFixed(1)),n:inB.length};
    }).filter(Boolean);
  })();

  const filteredBets=bets.filter(b=>
    (filterSport==="All"||b.sport===filterSport)&&
    (filterBook==="All"||b.bookmaker===filterBook)&&
    (filterOutcome==="All"||b.outcome===filterOutcome)
  ).sort((a,b)=>new Date(b.date)-new Date(a.date));

  const calData=(()=>{
    const map={};
    settledAll.forEach(b=>{
      const d=settleDate(b); if(!d) return;
      if(!map[d]) map[d]={pl:0,bets:[]};
      map[d].pl+=betPL(b); map[d].bets.push(b);
    });
    return map;
  })();

  function calCells(){
    const{y,m}=calMonth;
    const first=new Date(y,m,1);
    const startDow=(first.getDay()+6)%7;
    const daysInMonth=new Date(y,m+1,0).getDate();
    const cells=[];
    for(let i=0;i<startDow;i++) cells.push(null);
    for(let d=1;d<=daysInMonth;d++){
      const key=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      cells.push({day:d,key,data:calData[key]});
    }
    return cells;
  }

  function exportCSV(){
    const headers=["date","settledDate","sport","market","betType","bookmaker","match","stake","odds","isBonus","myProb","outcome","collectAmount","refundAmount","notes"];
    const rows=bets.map(b=>headers.map(h=>{const v=b[h]??"";return typeof v==="string"&&(v.includes(",")||v.includes('"'))?`"${v.replace(/"/g,'""')}"`:v;}).join(","));
    const csv=[headers.join(","),...rows].join("\n");
    const blob=new Blob([csv],{type:"text/csv"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=`betting-log-${new Date().toISOString().slice(0,10)}.csv`;a.click();
    URL.revokeObjectURL(url);
    showToast("CSV downloaded");
  }

  function hfc(k,v){setForm(f=>({...f,[k]:v}));}

  function submitBet(){
    if(!form.match||!form.stake||!form.odds){showToast("Match, stake, and odds are required");return;}
    const isFT=form.betType==="Future"||form.betType==="Multi";
    const creditId=form._creditId;
    const bet={...form,id:editId||Date.now().toString(),stake:parseFloat(form.stake),odds:parseFloat(form.odds),myProb:form.myProb?parseFloat(form.myProb):null,deducted:editId?(bets.find(b=>b.id===editId)?.deducted??false):(isFT&&!form.isBonus)};
    delete bet._creditId;
    const next=editId?bets.map(b=>b.id===editId?bet:b):[...bets,bet];
    const wasEdit=!!editId;
    if(editId) setEditId(null);
    persistBets(next);
    if(!wasEdit&&creditId&&bet.isBonus){
      const nc=lsGet("credits_v1",credits).map(c=>c.id===creditId?{...c,status:"used",usedBetId:bet.id,usedDate:new Date().toISOString().slice(0,10)}:c);
      persistCredits(nc);
    }
    if(!wasEdit&&isFT&&!bet.isBonus){
      const newBal=adjustBalance(bet.bookmaker,-bet.stake);
      showToast(`${bet.betType} logged. ${bet.bookmaker} -$${bet.stake.toFixed(2)} → $${newBal.toFixed(2)}`);
    } else { showToast(wasEdit?"Bet updated":"Bet logged"); }
    setForm(emptyForm); setTab("log");
  }

  function editBet(b){
    setForm({...b,stake:b.stake.toString(),odds:b.odds?b.odds.toString():"",myProb:b.myProb?b.myProb.toString():"",notes:b.notes||"",betType:b.betType||"Regular",isBonus:!!b.isBonus});
    setEditId(b.id);setQuickMode(false);setTab("add");
  }
  function deleteBet(id){persistBets(bets.filter(b=>b.id!==id));showToast("Bet deleted");}

  function addBook(){
    const name=newBookName.trim();
    if(!name||books.some(b=>b.name.toLowerCase()===name.toLowerCase())){showToast("Enter a unique bookie name");return;}
    const next=[...books,{name,balance:parseFloat(newBookBal)||0,color:BOOK_COLORS[books.length%BOOK_COLORS.length]}];
    persistBooks(next);setNewBookName("");setNewBookBal("");showToast(`${name} added`);
  }
  function removeBook(name){
    if(bets.some(b=>b.bookmaker===name)){showToast("Cannot remove: bets exist for this bookie");return;}
    persistBooks(books.filter(b=>b.name!==name));showToast(`${name} removed`);
  }
  function saveBalEdit(name){
    const next=books.map(b=>b.name===name?{...b,balance:parseFloat(balEditVal)||b.balance}:b);
    persistBooks(next);setBalEdit(null);setBalEditVal("");showToast("Balance updated");
  }
  function addTxn(){
    if(!txnForm.amount||parseFloat(txnForm.amount)<=0){showToast("Enter an amount");return;}
    const t={...txnForm,id:Date.now().toString(),amount:parseFloat(txnForm.amount)};
    persistTxns([...txns,t]);
    const delta=t.type==="deposit"?t.amount:-t.amount;
    const newBal=adjustBalance(t.book,delta);
    showToast(`${t.type==="deposit"?"Deposit":"Withdrawal"} logged. ${t.book} → $${newBal.toFixed(2)}`);
    setTxnForm({...txnForm,amount:"",notes:""});
  }
  function deleteTxn(t){
    persistTxns(txns.filter(x=>x.id!==t.id));
    adjustBalance(t.book,t.type==="deposit"?-t.amount:t.amount);
    showToast("Transaction removed");
  }

  function addCredit(){
    if(!creditForm.amount||parseFloat(creditForm.amount)<=0){showToast("Enter a credit amount");return;}
    const c={id:Date.now().toString(),book:creditForm.book||bookNames[0],amount:parseFloat(creditForm.amount),source:creditForm.source.trim(),expiry:creditForm.expiry||"",dateReceived:new Date().toISOString().slice(0,10),status:"available"};
    persistCredits([...credits,c]);
    setCreditForm({book:creditForm.book,amount:"",source:"",expiry:""});
    showToast("Bonus credit added");
  }
  function deleteCredit(id){ persistCredits(credits.filter(c=>c.id!==id)); showToast("Credit removed"); }
  function placeCredit(c){
    setEditId(null);
    setForm({...emptyForm,isBonus:true,bookmaker:c.book,stake:parseFloat(c.amount).toString(),betType:"Regular",_creditId:c.id});
    setQuickMode(false);
    setTab("add");
    showToast(`Placing $${parseFloat(c.amount).toFixed(2)} ${c.book} bonus — fill in the bet`);
  }

  async function generateAISummary(){
    if(bets.length===0) return;
    setAiLoading(true);setAiSummary("");
    try{
      const payload=bets.map(b=>`${b.date}|${b.sport}|${b.market}|${b.betType}${b.isBonus?" (BB)":""}|${b.match}|${b.bookmaker}|$${b.stake}@${b.odds}|${b.outcome}${b.collectAmount?` collect$${b.collectAmount}`:""}`).join("\n");
      const res=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",headers:{"Content-Type":"application/json","x-api-key":import.meta.env.VITE_ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:`You are a sports betting performance analyst. Analyse this log: ROI and win rate (bonus bets $0 cost basis), strongest/weakest markets and sports, futures exposure, and one actionable recommendation. Direct and honest, use numbers.\n\n${payload}\n\nBalances: ${books.map(b=>`${b.name} $${b.balance}`).join(" | ")}`}]})
      });
      const data=await res.json();
      setAiSummary(data.content?.filter(c=>c.type==="text").map(c=>c.text).join("")||"No response.");
    } catch{setAiSummary("Analysis failed. Try again.");}
    setAiLoading(false);
  }

  function ocColor(o){return{Win:C.win,Loss:C.loss,Push:C.push,Pending:C.pending,"Bonus Refund":C.bonus,"Cashed Out":C.cashout}[o]||C.muted;}

  function SettleButtons({b}){
    if(refundFor===b.id) return(
      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{color:C.bonus,fontSize:11}}>Refund $</span>
        <input type="number" inputMode="decimal" value={refundAmt} onChange={e=>setRefundAmt(e.target.value)} style={{...iStyle,width:85,padding:"6px 10px",fontSize:12}} autoFocus/>
        <button onClick={()=>settleBet(b,"Bonus Refund",parseFloat(refundAmt)||parseFloat(b.stake))} style={sBtn(C.bonus)}>Confirm</button>
        <button onClick={()=>{setRefundFor(null);setRefundAmt("");}} style={{background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:6,padding:"7px 10px",fontSize:11,cursor:"pointer"}}>✕</button>
      </div>
    );
    if(cashoutFor===b.id) return(
      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{color:C.cashout,fontSize:11}}>Collect $</span>
        <input type="number" inputMode="decimal" value={cashoutAmt} onChange={e=>setCashoutAmt(e.target.value)} style={{...iStyle,width:85,padding:"6px 10px",fontSize:12}} autoFocus/>
        <button onClick={()=>settleBet(b,"Cashed Out",parseFloat(cashoutAmt)||0)} style={sBtn(C.cashout)}>Confirm</button>
        <button onClick={()=>{setCashoutFor(null);setCashoutAmt("");}} style={{background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:6,padding:"7px 10px",fontSize:11,cursor:"pointer"}}>✕</button>
      </div>
    );
    return(
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        <button onClick={()=>settleBet(b,"Win")} style={sBtn(C.win)}>Won</button>
        <button onClick={()=>settleBet(b,"Loss")} style={sBtn(C.loss)}>Lost</button>
        <button onClick={()=>settleBet(b,"Push")} style={sBtn(C.push)}>Push</button>
        <button onClick={()=>{setCashoutFor(b.id);setCashoutAmt("");}} style={sBtn(C.cashout)}>Cash Out</button>
        <button onClick={()=>{setRefundFor(b.id);setRefundAmt(parseFloat(b.stake).toString());}} style={sBtn(C.bonus)}>Refund</button>
      </div>
    );
  }

  function setDeferred(bet,val){
    const fresh=lsGet("bets_v1",[]);
    const next=fresh.map(b=>b.id===bet.id?{...b,deferred:val}:b);
    setBets(next);lsSet("bets_v1",next);
    showToast(val?"Moved to Futures":"Moved to Quick Settle");
  }

  function PendingRow({b,section}){
    return(
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderTop:`1px solid ${C.border}`,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:150}}>
          <div style={{fontSize:13,fontWeight:600}}>{b.match} {b.isBonus&&<Pill label="BB" color={C.bonus}/>}</div>
          <div style={{color:C.muted,fontSize:11}}>{b.bookmaker} · ${parseFloat(b.stake).toFixed(2)} @ {b.odds?parseFloat(b.odds).toFixed(2):"—"}{b.odds?` · returns $${(parseFloat(b.stake)*parseFloat(b.odds)).toFixed(2)}`:""}</div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          <SettleButtons b={b}/>
          {section==="quick"&&<button onClick={()=>setDeferred(b,true)} style={{background:"transparent",color:C.future,border:`1px solid ${C.future}55`,borderRadius:6,padding:"7px 10px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>→ Futures</button>}
          {section==="futures"&&b.deferred&&<button onClick={()=>setDeferred(b,false)} style={{background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:6,padding:"7px 10px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>↩ Quick Settle</button>}
        </div>
      </div>
    );
  }

  if(!authed) return <LoginScreen login={login}/>;
  if(!loaded) return <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontFamily:"system-ui"}}>Loading...</div>;

  const liveEV=form.myProb&&form.odds?(parseFloat(form.myProb)/100)*parseFloat(form.odds)-1:null;
  const monthName=new Date(calMonth.y,calMonth.m).toLocaleString("en-AU",{month:"long",year:"numeric"});

  return(
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"'Inter',system-ui,sans-serif",color:C.text,paddingTop:"env(safe-area-inset-top)"}}>
      {toast&&<div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",background:C.card,border:`1px solid ${C.accent}66`,borderRadius:8,padding:"10px 20px",fontSize:13,zIndex:100,boxShadow:"0 4px 20px rgba(0,0,0,0.5)",maxWidth:"90vw"}}>{toast}</div>}

      <div style={{borderBottom:`1px solid ${C.border}`,padding:isMobile?"12px 14px":"16px 24px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
          <span style={{fontWeight:800,fontSize:18,letterSpacing:"-0.02em",background:"linear-gradient(135deg, #1e6fff, #a78bfa)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>EDGE</span>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {[["dashboard","Home"],["log","Bets"],["bonuses","Bonuses"],["calendar","Calendar"],["accounts","Settings"],["analysis","Analysis"]].map(([k,label])=>(
              <button key={k} onClick={()=>setTab(k)} style={{background:tab===k?C.accent:"transparent",color:tab===k?"#fff":C.muted,border:`1px solid ${tab===k?C.accent:C.border}`,borderRadius:6,padding:isMobile?"7px 10px":"6px 13px",fontSize:12,fontWeight:600,cursor:"pointer"}}>{label}</button>
            ))}
            <button onClick={()=>setTab("add")} style={{background:tab==="add"?C.accent:C.accent,color:"#fff",border:"none",borderRadius:6,width:32,height:32,fontSize:20,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,flexShrink:0}}>+</button>
          </div>
        </div>
      </div>

      <div style={{padding:isMobile?"16px 14px":"24px",maxWidth:1100,margin:"0 auto"}}>

        {tab==="dashboard"&&(
          <div>

            <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
              {TIME_FILTERS.map(f=>(
                <button key={f} onClick={()=>setTimeFilter(f)} style={{background:timeFilter===f?C.combined+"33":C.surface,color:timeFilter===f?C.combined:C.text,border:`1px solid ${timeFilter===f?C.combined:C.border}`,borderRadius:20,padding:"5px 14px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{f}</button>
              ))}
            </div>

            {pendingRegular.length>0&&(
              <div style={{background:C.card,border:`1px solid ${C.pending}44`,borderRadius:10,padding:"14px 16px",marginBottom:14}}>
                <div style={{color:C.pending,fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:6}}>Pending — Quick Settle</div>
                {pendingRegular.map(b=><PendingRow key={b.id} b={b} section="quick"/>)}
              </div>
            )}

            {pendingFutures.length>0&&(
              <div style={{background:C.card,border:`1px solid ${C.future}44`,borderRadius:10,marginBottom:14,overflow:"hidden"}}>
                <button onClick={()=>setFuturesOpen(!futuresOpen)} style={{width:"100%",background:"transparent",border:"none",padding:"14px 16px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",color:C.text}}>
                  <div style={{textAlign:"left"}}>
                    <div style={{color:C.future,fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",fontWeight:700}}>Futures ({pendingFutures.length})</div>
                    <div style={{color:C.muted,fontSize:11,marginTop:2}}>${futuresExposure.toFixed(2)} cash at risk · ${futuresPotential.toFixed(2)} max collect</div>
                  </div>
                  <span style={{color:C.future,fontSize:18,transform:futuresOpen?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▾</span>
                </button>
                {futuresOpen&&<div style={{padding:"0 16px 14px"}}>{pendingFutures.map(b=><PendingRow key={b.id} b={b} section="futures"/>)}</div>}
              </div>
            )}

            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":`repeat(${Math.min(books.length+1,4)},1fr)`,gap:10,marginBottom:18}}>
              {bookStats.map(bk=>(
                <div key={bk.name} style={{background:C.card,border:`2px solid ${bk.color}44`,borderRadius:10,padding:"12px 14px"}}>
                  <div style={{color:bk.color,fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:3}}>{bk.name}</div>
                  <div style={{fontSize:20,fontWeight:700,fontFamily:"monospace"}}>${bk.balance.toFixed(2)}</div>
                  <div style={{color:bk.pl>=0?C.win:C.loss,fontSize:11,fontFamily:"monospace"}}>{fmt(bk.pl)}</div>
                </div>
              ))}
              <div style={{background:C.card,border:`2px solid ${C.combined}44`,borderRadius:10,padding:"12px 14px"}}>
                <div style={{color:C.combined,fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:3}}>Combined</div>
                <div style={{fontSize:20,fontWeight:700,fontFamily:"monospace"}}>${totalBankroll.toFixed(2)}</div>
                <div style={{color:totalPL>=0?C.win:C.loss,fontSize:11,fontFamily:"monospace"}}>{fmt(totalPL)}</div>
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(5,1fr)",gap:8,marginBottom:20}}>
              <StatCard label="ROI" value={`${roi.toFixed(1)}%`} color={roi>=0?C.win:C.loss} sub={`${settled.length} settled · ${timeFilter}`}/>
              <StatCard label="Win Rate" value={`${winRate.toFixed(1)}%`} sub={`${wins.length}W ${losses.length}L`}/>
              <StatCard label="Net P&L" value={fmt(totalPL)} color={totalPL>=0?C.win:C.loss} sub={timeFilter}/>
              <StatCard label="Cash at Risk" value={fmtAbs(cashAtRisk)} color={C.pending} sub={`${pendingAll.length} pending`}/>
              <StatCard label="Bonus In Play" value={fmtAbs(bonusHeld)} color={C.bonus} sub="on pending bets"/>
            </div>

            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px",marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <div style={{color:C.muted,fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",fontWeight:600}}>Bankroll History</div>
                <select value={chartFilter} onChange={e=>setChartFilter(e.target.value)} style={{background:C.surface,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 8px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{TIME_FILTERS.map(f=><option key={f} value={f}>{f}</option>)}</select>
              </div>
              {books.length>0&&(
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                  {books.map(bk=>{const on=visibleBooks.includes(bk.name);return(
                    <button key={bk.name} onClick={()=>setVisibleBooks(v=>v.includes(bk.name)?v.filter(x=>x!==bk.name):[...v,bk.name])} style={{background:on?bk.color+"22":C.surface,color:on?bk.color:C.text,border:`1px solid ${on?bk.color:C.border}`,borderRadius:20,padding:"3px 11px",fontSize:10,fontWeight:700,cursor:"pointer"}}>{bk.name}</button>
                  );})}
                </div>
              )}
              {bankrollSeries.points.length>1?(
                <ResponsiveContainer width="100%" height={210}>
                  <ComposedChart data={bankrollSeries.points}>
                    <defs>
                      <linearGradient id="combinedGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.combined} stopOpacity={0.25}/>
                        <stop offset="95%" stopColor={C.combined} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false} domain={["auto","auto"]} width={55} tickFormatter={v=>`$${v}`}/>
                    <Tooltip contentStyle={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12,boxShadow:"0 8px 24px rgba(0,0,0,0.4)"}} formatter={(v,name)=>[`$${v.toFixed(2)}`,name]}/>
                    <Legend wrapperStyle={{fontSize:11}}/>
                    <Area type="monotone" dataKey="Combined" stroke={C.combined} strokeWidth={3} fill="url(#combinedGrad)" dot={false}/>
                    {books.filter(bk=>visibleBooks.includes(bk.name)).map(bk=>(<Line key={bk.name} type="monotone" dataKey={bk.name} stroke={bk.color} strokeWidth={1.5} strokeDasharray="4 2" dot={false}/>))}
                  </ComposedChart>
                </ResponsiveContainer>
              ):<div style={{color:C.muted,fontSize:13,textAlign:"center",padding:"30px 0"}}>Settle bets or log transactions to see your curve.</div>}
              {bankrollSeries.txnMarkers.length>0&&(
                <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:8}}>
                  {bankrollSeries.txnMarkers.map((m,i)=><span key={i} style={{color:m.kind==="deposit"?C.win:C.loss,fontSize:11}}>{m.kind==="deposit"?"▲":"▼"} {m.date}</span>)}
                </div>
              )}
            </div>

            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px",marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,gap:8,flexWrap:"wrap"}}>
                <div style={{color:C.muted,fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",fontWeight:600}}>{sportMetric==="bankroll"?"Bankroll by Sport":"P&L by Sport"}</div>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <div style={{display:"flex",gap:4}}>
                    {[["pl","P&L"],["bankroll","Bankroll"]].map(([k,lbl])=>(
                      <button key={k} onClick={()=>setSportMetric(k)} style={{background:sportMetric===k?C.combined+"33":C.surface,color:sportMetric===k?C.combined:C.text,border:`1px solid ${sportMetric===k?C.combined:C.border}`,borderRadius:20,padding:"3px 11px",fontSize:10,fontWeight:700,cursor:"pointer"}}>{lbl}</button>
                    ))}
                  </div>
                  <select value={chartFilter} onChange={e=>setChartFilter(e.target.value)} style={{background:C.surface,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 8px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{TIME_FILTERS.map(f=><option key={f} value={f}>{f}</option>)}</select>
                </div>
              </div>
              {activeSports.length>0&&(
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                  {activeSports.map(s=>{const col=BOOK_COLORS[SPORTS.indexOf(s)%BOOK_COLORS.length];const on=visibleSports.includes(s);return(
                    <button key={s} onClick={()=>setVisibleSports(v=>v.includes(s)?v.filter(x=>x!==s):[...v,s])} style={{background:on?col+"22":C.surface,color:on?col:C.text,border:`1px solid ${on?col:C.border}`,borderRadius:20,padding:"3px 11px",fontSize:10,fontWeight:700,cursor:"pointer"}}>{s}</button>
                  );})}
                </div>
              )}
              {sportPLSeries.length>1&&activeSports.length>0?(
                visibleSports.length>0?(
                  <ResponsiveContainer width="100%" height={210}>
                    <ComposedChart data={sportChartData}>
                      <XAxis dataKey="date" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false} domain={["auto","auto"]} width={55} tickFormatter={v=>`$${v}`}/>
                      <Tooltip contentStyle={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12,boxShadow:"0 8px 24px rgba(0,0,0,0.4)"}} formatter={(v,name)=>[`$${v.toFixed(2)}`,name]}/>
                      <Legend wrapperStyle={{fontSize:11}}/>
                      {sportMetric==="pl"&&<ReferenceLine y={0} stroke={C.border}/>}
                      {activeSports.filter(s=>visibleSports.includes(s)).map(s=>(<Line key={s} type="monotone" dataKey={s} stroke={BOOK_COLORS[SPORTS.indexOf(s)%BOOK_COLORS.length]} strokeWidth={2} strokeDasharray="4 2" dot={false}/>))}
                    </ComposedChart>
                  </ResponsiveContainer>
                ):<div style={{color:C.muted,fontSize:13,textAlign:"center",padding:"30px 0"}}>Toggle a sport above to plot its cumulative P&L.</div>
              ):<div style={{color:C.muted,fontSize:13,textAlign:"center",padding:"30px 0"}}>Settle bets to see cumulative P&L by sport.</div>}
            </div>

            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14}}>
              {marketBreakdown.length>0&&(()=>{const maxAbs=Math.max(...marketBreakdown.map(m=>Math.abs(m.pl)),1);return(
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px"}}>
                  <div style={{color:C.muted,fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:12}}>By Market</div>
                  {marketBreakdown.map(m=>(
                    <div key={m.market} style={{borderTop:`1px solid ${C.border}`,paddingTop:8,paddingBottom:4}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                        <div style={{fontSize:13,fontWeight:600}}>{m.market} <span style={{color:C.muted,fontSize:10}}>({m.count})</span></div>
                        <div style={{display:"flex",gap:14,fontFamily:"monospace",fontSize:12}}>
                          <span style={{color:m.roi>=0?C.win:C.loss}}>{m.roi.toFixed(0)}% ROI</span>
                          <span style={{color:m.pl>=0?C.win:C.loss}}>{fmt(m.pl)}</span>
                        </div>
                      </div>
                      <div style={{height:3,borderRadius:2,background:C.border,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${(Math.abs(m.pl)/maxAbs)*100}%`,background:m.pl>=0?C.win:C.loss,borderRadius:2}}/>
                      </div>
                    </div>
                  ))}
                </div>
              );})()}
              {sportBreakdown.length>0&&(()=>{const maxAbs=Math.max(...sportBreakdown.map(s=>Math.abs(s.pl)),1);return(
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px"}}>
                  <div style={{color:C.muted,fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:12}}>By Sport</div>
                  {sportBreakdown.map(s=>{
                    const open=selectedSport===s.sport;
                    const subRows=open?marketBreakdownForSport(s.sport):[];
                    const subMax=Math.max(...subRows.map(m=>Math.abs(m.pl)),1);
                    return(
                    <div key={s.sport} style={{borderTop:`1px solid ${C.border}`,paddingTop:8,paddingBottom:4}}>
                      <div onClick={()=>setSelectedSport(open?null:s.sport)} style={{cursor:"pointer"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                          <div style={{fontSize:13,fontWeight:600}}>
                            <span style={{color:C.muted,fontSize:9,marginRight:5,display:"inline-block",transform:open?"rotate(90deg)":"none",transition:"transform 0.2s"}}>▸</span>
                            {s.sport} <span style={{color:C.muted,fontSize:10}}>({s.count})</span>
                          </div>
                          <div style={{display:"flex",gap:14,fontFamily:"monospace",fontSize:12}}>
                            <span style={{color:C.muted}}>{s.strike.toFixed(0)}% SR</span>
                            <span style={{color:s.roi>=0?C.win:C.loss}}>{s.roi.toFixed(0)}% ROI</span>
                            <span style={{color:s.pl>=0?C.win:C.loss}}>{fmt(s.pl)}</span>
                          </div>
                        </div>
                        <div style={{height:3,borderRadius:2,background:C.border,overflow:"hidden"}}>
                          <div style={{height:"100%",width:`${(Math.abs(s.pl)/maxAbs)*100}%`,background:s.pl>=0?C.win:C.loss,borderRadius:2}}/>
                        </div>
                      </div>
                      {open&&(
                        <div style={{marginTop:8,marginLeft:14,paddingLeft:10,borderLeft:`1px solid ${C.border}`}}>
                          {subRows.length>0?subRows.map(m=>(
                            <div key={m.market} style={{paddingTop:6,paddingBottom:2}}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                                <div style={{fontSize:12,color:C.text}}>{m.market} <span style={{color:C.muted,fontSize:10}}>({m.count})</span></div>
                                <div style={{display:"flex",gap:12,fontFamily:"monospace",fontSize:11}}>
                                  <span style={{color:m.roi>=0?C.win:C.loss}}>{m.roi.toFixed(0)}% ROI</span>
                                  <span style={{color:m.pl>=0?C.win:C.loss}}>{fmt(m.pl)}</span>
                                </div>
                              </div>
                              <div style={{height:3,borderRadius:2,background:C.border,overflow:"hidden"}}>
                                <div style={{height:"100%",width:`${(Math.abs(m.pl)/subMax)*100}%`,background:m.pl>=0?C.win:C.loss,borderRadius:2}}/>
                              </div>
                            </div>
                          )):<div style={{color:C.muted,fontSize:11,padding:"6px 0"}}>No settled bets by market for {s.sport}.</div>}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              );})()}
            </div>
          </div>
        )}

        {tab==="calendar"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <button onClick={()=>setCalMonth(({y,m})=>m===0?{y:y-1,m:11}:{y,m:m-1})} style={{background:C.surface,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 14px",fontSize:14,cursor:"pointer"}}>‹</button>
              <div style={{fontWeight:700,fontSize:15}}>{monthName}</div>
              <button onClick={()=>setCalMonth(({y,m})=>m===11?{y:y+1,m:0}:{y,m:m+1})} style={{background:C.surface,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 14px",fontSize:14,cursor:"pointer"}}>›</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:4}}>
              {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d=><div key={d} style={{color:C.muted,fontSize:10,textAlign:"center",textTransform:"uppercase",letterSpacing:"0.05em"}}>{d}</div>)}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
              {calCells().map((c,i)=>{
                if(!c) return <div key={i}/>;
                const pl=c.data?.pl;
                const bg=pl===undefined?C.surface:pl>0?C.win+"26":pl<0?C.loss+"26":C.push+"26";
                const bd=pl===undefined?C.border:pl>0?C.win+"66":pl<0?C.loss+"66":C.push+"66";
                return(
                  <button key={c.key} onClick={()=>c.data&&setCalDay(calDay===c.key?null:c.key)} style={{background:bg,border:`1px solid ${bd}`,borderRadius:7,padding:isMobile?"6px 2px":"8px 4px",minHeight:isMobile?48:58,cursor:c.data?"pointer":"default",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                    <span style={{color:C.muted,fontSize:10}}>{c.day}</span>
                    {pl!==undefined&&<span style={{color:pl>0?C.win:pl<0?C.loss:C.push,fontSize:isMobile?9:11,fontWeight:700,fontFamily:"monospace"}}>{pl>=0?"+":"−"}${Math.abs(pl).toFixed(0)}</span>}
                  </button>
                );
              })}
            </div>
            {calDay&&calData[calDay]&&(
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px",marginTop:16}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                  <div style={{fontWeight:700,fontSize:14}}>{calDay}</div>
                  <div style={{fontFamily:"monospace",fontWeight:700,color:calData[calDay].pl>=0?C.win:C.loss}}>{fmt(calData[calDay].pl)}</div>
                </div>
                {calData[calDay].bets.map(b=>(
                  <div key={b.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderTop:`1px solid ${C.border}`,gap:8}}>
                    <div style={{fontSize:12,flex:1}}>{b.match} <Pill label={b.outcome} color={ocColor(b.outcome)}/></div>
                    <div style={{fontFamily:"monospace",fontSize:12,color:betPL(b)>=0?C.win:C.loss}}>{fmt(betPL(b))}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{color:C.muted,fontSize:11,marginTop:12}}>Tap a coloured day to see settled bets.</div>
          </div>
        )}

        {tab==="accounts"&&(
          <div>
            <div style={{fontSize:16,fontWeight:700,marginBottom:16}}>Accounts & Transactions</div>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px",marginBottom:16}}>
              <div style={{color:C.muted,fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:12}}>Bookmakers</div>
              {books.map(bk=>(
                <div key={bk.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderTop:`1px solid ${C.border}`,gap:8,flexWrap:"wrap"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{width:10,height:10,borderRadius:"50%",background:bk.color,display:"inline-block"}}/>
                    <span style={{fontWeight:600,fontSize:14}}>{bk.name}</span>
                  </div>
                  {balEdit===bk.name?(
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <input value={balEditVal} onChange={e=>setBalEditVal(e.target.value)} type="number" inputMode="decimal" style={{...iStyle,width:100,padding:"6px 10px",fontSize:13}} autoFocus/>
                      <button onClick={()=>saveBalEdit(bk.name)} style={sBtn(C.win)}>Save</button>
                      <button onClick={()=>setBalEdit(null)} style={{background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:6,padding:"7px 10px",fontSize:11,cursor:"pointer"}}>✕</button>
                    </div>
                  ):(
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <span style={{fontFamily:"monospace",fontWeight:700,fontSize:15}}>${bk.balance.toFixed(2)}</span>
                      <button onClick={()=>{setBalEdit(bk.name);setBalEditVal(bk.balance.toString());}} style={{background:"transparent",color:C.accent,border:`1px solid ${C.accent}44`,borderRadius:5,padding:"4px 9px",fontSize:10,cursor:"pointer"}}>Edit</button>
                      <button onClick={()=>removeBook(bk.name)} style={{background:"transparent",color:C.loss,border:`1px solid ${C.loss}44`,borderRadius:5,padding:"4px 9px",fontSize:10,cursor:"pointer"}}>Remove</button>
                    </div>
                  )}
                </div>
              ))}
              <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap",alignItems:"flex-end"}}>
                <div style={{flex:1,minWidth:130}}>
                  <div style={{color:C.muted,fontSize:11,marginBottom:4}}>New bookie name</div>
                  <input value={newBookName} onChange={e=>setNewBookName(e.target.value)} placeholder="e.g. Sportsbet" style={iStyle}/>
                </div>
                <div style={{width:120}}>
                  <div style={{color:C.muted,fontSize:11,marginBottom:4}}>Starting balance</div>
                  <input value={newBookBal} onChange={e=>setNewBookBal(e.target.value)} type="number" inputMode="decimal" placeholder="0.00" style={iStyle}/>
                </div>
                <button onClick={addBook} style={{background:C.accent,color:"#fff",border:"none",borderRadius:7,padding:"10px 18px",fontSize:13,fontWeight:600,cursor:"pointer"}}>Add</button>
              </div>
            </div>

            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px",marginBottom:16}}>
              <div style={{color:C.muted,fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:12}}>Sports</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
                {customSports.map(s=>(
                  <div key={s} style={{display:"flex",alignItems:"center",gap:4,background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:"3px 10px"}}>
                    <span style={{fontSize:12}}>{s}</span>
                    {customSports.length>1&&<button onClick={()=>{const next=customSports.filter(x=>x!==s);setCustomSports(next);lsSet("sports_v1",next);}} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:11,padding:"0 2px",lineHeight:1}}>✕</button>}
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
                <div style={{flex:1}}>
                  <div style={{color:C.muted,fontSize:11,marginBottom:4}}>New sport</div>
                  <input value={newSportName} onChange={e=>setNewSportName(e.target.value)} placeholder="e.g. Tennis" style={iStyle}/>
                </div>
                <button onClick={()=>{const t=newSportName.trim();if(!t||customSports.includes(t))return;const next=[...customSports,t];setCustomSports(next);lsSet("sports_v1",next);setNewSportName("");}} style={{background:C.accent,color:"#fff",border:"none",borderRadius:7,padding:"10px 18px",fontSize:13,fontWeight:600,cursor:"pointer"}}>Add</button>
              </div>
            </div>

            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px",marginBottom:16}}>
              <div style={{color:C.muted,fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:12}}>Markets</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
                {customMarkets.map(m=>(
                  <div key={m} style={{display:"flex",alignItems:"center",gap:4,background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:"3px 10px"}}>
                    <span style={{fontSize:12}}>{m}</span>
                    {customMarkets.length>1&&<button onClick={()=>{const next=customMarkets.filter(x=>x!==m);setCustomMarkets(next);lsSet("markets_v1",next);}} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:11,padding:"0 2px",lineHeight:1}}>✕</button>}
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
                <div style={{flex:1}}>
                  <div style={{color:C.muted,fontSize:11,marginBottom:4}}>New market</div>
                  <input value={newMarketName} onChange={e=>setNewMarketName(e.target.value)} placeholder="e.g. First Goalscorer" style={iStyle}/>
                </div>
                <button onClick={()=>{const t=newMarketName.trim();if(!t||customMarkets.includes(t))return;const next=[...customMarkets,t];setCustomMarkets(next);lsSet("markets_v1",next);setNewMarketName("");}} style={{background:C.accent,color:"#fff",border:"none",borderRadius:7,padding:"10px 18px",fontSize:13,fontWeight:600,cursor:"pointer"}}>Add</button>
              </div>
            </div>

            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px",marginBottom:16}}>
              <div style={{color:C.muted,fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:12}}>Log Deposit / Withdrawal</div>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:10}}>
                <div><div style={{color:C.muted,fontSize:11,marginBottom:4}}>Bookie</div><select value={txnForm.book} onChange={e=>setTxnForm(f=>({...f,book:e.target.value}))} style={iStyle}>{bookNames.map(b=><option key={b} value={b}>{b}</option>)}</select></div>
                <div><div style={{color:C.muted,fontSize:11,marginBottom:4}}>Type</div><select value={txnForm.type} onChange={e=>setTxnForm(f=>({...f,type:e.target.value}))} style={iStyle}><option value="deposit">Deposit</option><option value="withdrawal">Withdrawal</option></select></div>
                <div><div style={{color:C.muted,fontSize:11,marginBottom:4}}>Amount ($)</div><input value={txnForm.amount} onChange={e=>setTxnForm(f=>({...f,amount:e.target.value}))} type="number" inputMode="decimal" style={iStyle}/></div>
                <div><div style={{color:C.muted,fontSize:11,marginBottom:4}}>Date</div><input value={txnForm.date} onChange={e=>setTxnForm(f=>({...f,date:e.target.value}))} type="date" style={iStyle}/></div>
                <div style={{gridColumn:"1/-1"}}><div style={{color:C.muted,fontSize:11,marginBottom:4}}>Notes</div><input value={txnForm.notes} onChange={e=>setTxnForm(f=>({...f,notes:e.target.value}))} placeholder="optional" style={iStyle}/></div>
              </div>
              <button onClick={addTxn} style={{background:C.accent,color:"#fff",border:"none",borderRadius:7,padding:"10px 20px",fontSize:13,fontWeight:600,cursor:"pointer",marginTop:12}}>Log Transaction</button>
            </div>

            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px",marginBottom:16}}>
              <div style={{color:C.muted,fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>Transaction History</div>
              {txns.length===0
                ?<div style={{color:C.muted,fontSize:13,padding:"16px 0",textAlign:"center"}}>No transactions logged yet.</div>
                :[...txns].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(t=>(
                  <div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderTop:`1px solid ${C.border}`,gap:8}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:600}}><span style={{color:t.type==="deposit"?C.win:C.loss}}>{t.type==="deposit"?"▲":"▼"}</span> {t.book} {t.type}{t.notes&&<span style={{color:C.muted,fontWeight:400}}> — {t.notes}</span>}</div>
                      <div style={{color:C.muted,fontSize:11}}>{t.date}</div>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <span style={{fontFamily:"monospace",fontWeight:700,color:t.type==="deposit"?C.win:C.loss}}>{t.type==="deposit"?"+":"-"}${t.amount.toFixed(2)}</span>
                      <button onClick={()=>deleteTxn(t)} style={{background:"transparent",color:C.loss,border:`1px solid ${C.loss}44`,borderRadius:5,padding:"3px 8px",fontSize:10,cursor:"pointer"}}>✕</button>
                    </div>
                  </div>
                ))}
              {txns.length>0&&<div style={{borderTop:`1px solid ${C.border}`,marginTop:8,paddingTop:10,display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:C.muted}}>Net deposits</span><span style={{fontFamily:"monospace",fontWeight:700}}>{fmt(txns.reduce((a,t)=>a+(t.type==="deposit"?t.amount:-t.amount),0))}</span></div>}
            </div>

            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px"}}>
              <div style={{color:C.muted,fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:12}}>Data Backup</div>
              <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                <button onClick={handleDataExport} style={{background:C.accent,color:"#fff",border:"none",borderRadius:7,padding:"10px 18px",fontSize:13,fontWeight:600,cursor:"pointer"}}>Download Backup</button>
                <label style={{background:C.surface,color:C.text,border:`1px solid ${C.border}`,borderRadius:7,padding:"10px 18px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                  Restore from Backup
                  <input type="file" accept=".json" onChange={handleDataImport} style={{display:"none"}}/>
                </label>
              </div>
              <div style={{color:C.muted,fontSize:11,marginTop:8}}>Download a backup before switching devices. Restore imports all bets, balances, and transactions.</div>
            </div>
          </div>
        )}

        {tab==="add"&&(
          <div style={{maxWidth:560}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
              <div style={{fontSize:16,fontWeight:700}}>{editId?"Edit Bet":"Log a Bet"}</div>
              {!editId&&<button onClick={()=>setQuickMode(!quickMode)} style={{background:"transparent",color:C.accent,border:`1px solid ${C.accent}44`,borderRadius:6,padding:"5px 12px",fontSize:11,cursor:"pointer",fontWeight:600}}>{quickMode?"Full form":"Quick mode"}</button>}
            </div>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:13}}>
              <div style={{gridColumn:"1/-1"}}>
                <div style={{color:C.muted,fontSize:11,marginBottom:5}}>Match / Event</div>
                <input value={form.match} onChange={e=>hfc("match",e.target.value)} placeholder="e.g. Hawthorn v Richmond" style={iStyle}/>
              </div>
              <div>
                <div style={{color:C.muted,fontSize:11,marginBottom:5}}>Stake ($)</div>
                <input type="number" inputMode="decimal" value={form.stake} onChange={e=>hfc("stake",e.target.value)} min="0" step="0.01" style={iStyle}/>
                <div style={{display:"flex",gap:5,marginTop:6,flexWrap:"wrap"}}>
                  {STAKE_PRESETS.map(s=><button key={s} onClick={()=>hfc("stake",s.toString())} style={{background:form.stake===s.toString()?C.accent:C.surface,color:form.stake===s.toString()?"#fff":C.muted,border:`1px solid ${C.border}`,borderRadius:5,padding:"4px 10px",fontSize:11,cursor:"pointer"}}>${s}</button>)}
                </div>
              </div>
              <div>
                <div style={{color:C.muted,fontSize:11,marginBottom:5}}>Odds (Decimal)</div>
                <input type="number" inputMode="decimal" value={form.odds} onChange={e=>hfc("odds",e.target.value)} min="1" step="0.01" placeholder="e.g. 1.91" style={iStyle}/>
              </div>
              <div>
                <div style={{color:C.muted,fontSize:11,marginBottom:5}}>Bookmaker</div>
                <select value={form.bookmaker} onChange={e=>hfc("bookmaker",e.target.value)} style={iStyle}>{bookNames.map(o=><option key={o} value={o}>{o}</option>)}</select>
              </div>
              <div>
                <div style={{color:C.muted,fontSize:11,marginBottom:5}}>Sport</div>
                <select value={form.sport} onChange={e=>hfc("sport",e.target.value)} style={iStyle}>{customSports.map(o=><option key={o} value={o}>{o}</option>)}</select>
              </div>
              <div>
                <div style={{color:C.muted,fontSize:11,marginBottom:5}}>Bet Type</div>
                <select value={form.betType} onChange={e=>hfc("betType",e.target.value)} style={iStyle}>{BET_TYPES.map(o=><option key={o} value={o}>{o}</option>)}</select>
                {(form.betType==="Future"||form.betType==="Multi")&&!form.isBonus&&<div style={{color:C.future,fontSize:10,marginTop:4}}>Stake deducts from balance immediately</div>}
              </div>
              <div style={{display:"flex",alignItems:"center",paddingTop:isMobile?0:20}}>
                <button onClick={()=>hfc("isBonus",!form.isBonus)} style={{background:form.isBonus?C.bonus+"33":C.surface,color:form.isBonus?C.bonus:C.muted,border:`1px solid ${form.isBonus?C.bonus:C.border}`,borderRadius:7,padding:"9px 14px",fontSize:12,fontWeight:700,cursor:"pointer",width:"100%"}}>{form.isBonus?"✓ Bonus Bet":"Bonus Bet / Credit"}</button>
              </div>
              {form.isBonus&&<div style={{gridColumn:"1/-1",color:C.bonus,fontSize:11,background:C.bonus+"11",border:`1px solid ${C.bonus}33`,borderRadius:7,padding:"8px 12px"}}>Bonus bet: $0 cost basis, no balance deduction, win pays winnings only.</div>}
              <div><div style={{color:C.muted,fontSize:11,marginBottom:5}}>Market</div><select value={form.market} onChange={e=>hfc("market",e.target.value)} style={iStyle}>{customMarkets.map(o=><option key={o} value={o}>{o}</option>)}</select></div>
{!quickMode&&(
  <>
    <div><div style={{color:C.muted,fontSize:11,marginBottom:5}}>Date</div><input type="date" value={form.date} onChange={e=>hfc("date",e.target.value)} style={iStyle}/></div>
    <div><div style={{color:C.muted,fontSize:11,marginBottom:5}}>Outcome</div><select value={form.outcome} onChange={e=>hfc("outcome",e.target.value)} style={iStyle}>{["Pending","Win","Loss","Push"].map(o=><option key={o} value={o}>{o}</option>)}</select></div>
    <div><div style={{color:C.muted,fontSize:11,marginBottom:5}}>My Probability (%)</div><input type="number" inputMode="decimal" value={form.myProb} onChange={e=>hfc("myProb",e.target.value)} min="0" max="100" step="0.1" placeholder="e.g. 58" style={iStyle}/></div>
    <div style={{gridColumn:"1/-1"}}><div style={{color:C.muted,fontSize:11,marginBottom:5}}>Notes</div><textarea value={form.notes} onChange={e=>hfc("notes",e.target.value)} rows={2} style={{...iStyle,resize:"vertical"}}/></div>
  </>
)}
              {liveEV!==null&&<div style={{gridColumn:"1/-1",fontSize:13}}>EV: <span style={{color:evColor(liveEV),fontWeight:700,fontFamily:"monospace"}}>{(liveEV*100).toFixed(2)}%</span></div>}
            </div>
            <div style={{display:"flex",gap:10,marginTop:18}}>
              <button onClick={submitBet} style={{background:C.accent,color:"#fff",border:"none",borderRadius:7,padding:"12px 26px",fontSize:14,fontWeight:600,cursor:"pointer",flex:isMobile?1:"none"}}>{editId?"Save Changes":"Save Bet"}</button>
              {editId&&<button onClick={()=>{setEditId(null);setForm(emptyForm);}} style={{background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:7,padding:"12px 16px",fontSize:13,cursor:"pointer"}}>Cancel</button>}
            </div>
          </div>
        )}

        {tab==="log"&&(
          <div>
            <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
              {[["Sport",filterSport,setFilterSport,["All",...customSports]],["Book",filterBook,setFilterBook,["All",...bookNames]],["Status",filterOutcome,setFilterOutcome,["All",...OUTCOMES]]].map(([label,val,setter,opts])=>(
                <select key={label} value={val} onChange={e=>setter(e.target.value)} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",color:C.text,fontSize:12}}>
                  {opts.map(o=><option key={o} value={o}>{o==="All"?`${label}: All`:o}</option>)}
                </select>
              ))}
              <div style={{marginLeft:"auto",display:"flex",gap:8}}>
                <button onClick={exportCSV} disabled={bets.length===0} style={{background:"transparent",color:bets.length===0?C.muted:C.accent,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 12px",fontSize:12,cursor:bets.length===0?"not-allowed":"pointer"}}>Export CSV</button>
                <button onClick={()=>setTab("add")} style={{background:C.accent,color:"#fff",border:"none",borderRadius:6,padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer"}}>+ Log Bet</button>
              </div>
            </div>
            {filteredBets.length===0
              ?<div style={{color:C.muted,textAlign:"center",padding:"50px 0",fontSize:14}}>No bets match. <span style={{color:C.accent,cursor:"pointer"}} onClick={()=>setTab("add")}>Log one now.</span></div>
              :filteredBets.map(b=>{
                const ev=b.myProb&&b.odds?((parseFloat(b.myProb)/100)*parseFloat(b.odds)-1):null;
                const showPL=b.outcome!=="Pending"&&b.outcome!=="Push";
                const pl=showPL?betPL(b):null;
                return(
                  <div key={b.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:9,padding:"12px 14px",marginBottom:8}}>
                    <div style={{display:"flex",gap:10,alignItems:"flex-start",flexWrap:"wrap"}}>
                      <div style={{flex:1,minWidth:170}}>
                        <div style={{fontWeight:600,fontSize:13,marginBottom:5}}>{b.match}</div>
                        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                          <Pill label={b.sport} color={C.accent}/>
                          <Pill label={b.bookmaker} color={bookColor(b.bookmaker)}/>
                          {(b.betType==="Future"||b.betType==="Multi")&&<Pill label={b.betType} color={C.future}/>}
                          {b.isBonus&&<Pill label="BB" color={C.bonus}/>}
                          <Pill label={b.outcome} color={ocColor(b.outcome)}/>
                        </div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontFamily:"monospace",fontSize:13}}>${parseFloat(b.stake).toFixed(2)} @ {b.odds?parseFloat(b.odds).toFixed(2):"—"}</div>
                        {ev!==null&&<div style={{color:evColor(ev),fontSize:10}}>EV {(ev*100).toFixed(1)}%</div>}
                        {pl!==null&&<div style={{color:pl>=0?C.win:C.loss,fontSize:12,fontWeight:700,fontFamily:"monospace"}}>{fmt(pl)}</div>}
                        {b.outcome==="Cashed Out"&&b.collectAmount!==undefined&&<div style={{color:C.cashout,fontSize:10}}>collected ${parseFloat(b.collectAmount).toFixed(2)}</div>}
                        {b.outcome==="Bonus Refund"&&b.refundAmount&&<div style={{color:C.bonus,fontSize:10}}>+${parseFloat(b.refundAmount).toFixed(2)} BB credit</div>}
                        <div style={{color:C.muted,fontSize:10,marginTop:2}}>{b.date}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6,marginTop:8,justifyContent:"flex-end",flexWrap:"wrap",alignItems:"center"}}>
                      {b.outcome==="Pending"&&<SettleButtons b={b}/>}
                      <button onClick={()=>editBet(b)} style={{background:"transparent",color:C.accent,border:`1px solid ${C.accent}44`,borderRadius:5,padding:"5px 10px",fontSize:11,cursor:"pointer"}}>Edit</button>
                      <button onClick={()=>deleteBet(b.id)} style={{background:"transparent",color:C.loss,border:`1px solid ${C.loss}44`,borderRadius:5,padding:"5px 10px",fontSize:11,cursor:"pointer"}}>Delete</button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {tab==="bonuses"&&(
          <div>
            <div style={{fontSize:16,fontWeight:700,marginBottom:16}}>Bonus Bets</div>

            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:8,marginBottom:18}}>
              <StatCard label="Credits Available" value={fmtAbs(creditAvailValue)} color={C.bonus} sub={`${creditsAvailable.length} credit${creditsAvailable.length===1?"":"s"}`}/>
              <StatCard label="Expiring ≤7d" value={creditsExpiringSoon.length.toString()} color={creditsExpiringSoon.length>0?C.loss:C.muted} sub="use them soon"/>
              <StatCard label="Cash Extracted" value={fmt(bonusCashWon)} color={bonusCashWon>=0?C.win:C.loss} sub={`${bonusSettled.length} settled`}/>
              <StatCard label="Conversion" value={`${bonusConversion.toFixed(0)}%`} color={C.cashout} sub={`${bonusWinRate.toFixed(0)}% win rate`}/>
            </div>

            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px",marginBottom:16}}>
              <div style={{color:C.muted,fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:12}}>Add Bonus Credit</div>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:10}}>
                <div><div style={{color:C.muted,fontSize:11,marginBottom:4}}>Bookie</div><select value={creditForm.book||bookNames[0]} onChange={e=>setCreditForm(f=>({...f,book:e.target.value}))} style={iStyle}>{bookNames.map(b=><option key={b} value={b}>{b}</option>)}</select></div>
                <div><div style={{color:C.muted,fontSize:11,marginBottom:4}}>Amount ($)</div><input value={creditForm.amount} onChange={e=>setCreditForm(f=>({...f,amount:e.target.value}))} type="number" inputMode="decimal" placeholder="e.g. 50" style={iStyle}/></div>
                <div><div style={{color:C.muted,fontSize:11,marginBottom:4}}>Source / Promo</div><input value={creditForm.source} onChange={e=>setCreditForm(f=>({...f,source:e.target.value}))} placeholder="e.g. Sign-up offer" style={iStyle}/></div>
                <div><div style={{color:C.muted,fontSize:11,marginBottom:4}}>Expiry</div><input value={creditForm.expiry} onChange={e=>setCreditForm(f=>({...f,expiry:e.target.value}))} type="date" style={iStyle}/></div>
              </div>
              <button onClick={addCredit} style={{background:C.accent,color:"#fff",border:"none",borderRadius:7,padding:"10px 20px",fontSize:13,fontWeight:600,cursor:"pointer",marginTop:12}}>Add Credit</button>
            </div>

            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px",marginBottom:16}}>
              <div style={{color:C.muted,fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>Available Credits ({creditsAvailable.length})</div>
              {creditsAvailable.length===0
                ?<div style={{color:C.muted,fontSize:13,padding:"16px 0",textAlign:"center"}}>No bonus credits on hand. Add one above when a bookie gives you a bonus.</div>
                :creditsAvailable.map(c=>{
                  const d=daysUntil(c.expiry);
                  const expCol=d===null?C.muted:d<=3?C.loss:d<=7?C.push:C.muted;
                  return(
                  <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderTop:`1px solid ${C.border}`,flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:160}}>
                      <div style={{fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <Pill label={c.book} color={bookColor(c.book)}/>
                        <span style={{fontFamily:"monospace"}}>${parseFloat(c.amount).toFixed(2)}</span>
                        {c.source&&<span style={{color:C.muted,fontSize:11,fontWeight:400}}>{c.source}</span>}
                      </div>
                      <div style={{fontSize:11,marginTop:3,color:expCol}}>{c.expiry?(d<0?`Expired`:d===0?`Expires today`:`Expires ${c.expiry} · ${d}d left`):"No expiry"}</div>
                    </div>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <button onClick={()=>placeCredit(c)} style={sBtn(C.bonus)}>Place</button>
                      <button onClick={()=>deleteCredit(c.id)} style={{background:"transparent",color:C.loss,border:`1px solid ${C.loss}44`,borderRadius:5,padding:"6px 10px",fontSize:11,cursor:"pointer"}}>Delete</button>
                    </div>
                  </div>
                  );
                })}
              {creditsExpired.length>0&&(
                <div style={{marginTop:12,borderTop:`1px solid ${C.border}`,paddingTop:10}}>
                  <div style={{color:C.muted,fontSize:11,marginBottom:6}}>Expired ({creditsExpired.length})</div>
                  {creditsExpired.map(c=>(
                    <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",opacity:0.55,gap:8}}>
                      <div style={{fontSize:12}}>{c.book} · ${parseFloat(c.amount).toFixed(2)} {c.source&&<span style={{color:C.muted}}>· {c.source}</span>} <span style={{color:C.loss,fontSize:10}}>expired {c.expiry}</span></div>
                      <button onClick={()=>deleteCredit(c.id)} style={{background:"transparent",color:C.loss,border:`1px solid ${C.loss}44`,borderRadius:5,padding:"4px 9px",fontSize:10,cursor:"pointer"}}>Delete</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px"}}>
              <div style={{color:C.muted,fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>Bonus Bets ({bonusBetsAll.length})</div>
              {bonusBetsAll.length===0
                ?<div style={{color:C.muted,fontSize:13,padding:"16px 0",textAlign:"center"}}>No bonus bets placed yet. Use "Place" on a credit, or tick "Bonus Bet" when logging a bet.</div>
                :[...bonusPending,...bonusSettled].map(b=>{
                  const showPL=b.outcome!=="Pending"&&b.outcome!=="Push";
                  const pl=showPL?betPL(b):null;
                  return(
                  <div key={b.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderTop:`1px solid ${C.border}`,gap:8,flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:150}}>
                      <div style={{fontSize:13,fontWeight:600}}>{b.match}</div>
                      <div style={{color:C.muted,fontSize:11}}>{b.bookmaker} · ${parseFloat(b.stake).toFixed(2)} @ {b.odds?parseFloat(b.odds).toFixed(2):"—"} · {b.date}</div>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <Pill label={b.outcome} color={ocColor(b.outcome)}/>
                      {pl!==null&&<span style={{fontFamily:"monospace",fontSize:12,fontWeight:700,color:pl>=0?C.win:C.loss}}>{fmt(pl)}</span>}
                    </div>
                  </div>
                  );
                })}
            </div>
          </div>
        )}

        {tab==="analysis"&&(
          <div>
            <div style={{fontSize:16,fontWeight:700,marginBottom:16}}>Performance Analysis</div>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:12,marginBottom:20}}>
              {bookStats.map(bs=>(
                <div key={bs.name} style={{background:C.card,border:`1px solid ${C.border}`,borderTop:`3px solid ${bs.color}`,borderRadius:10,padding:"14px 18px"}}>
                  <div style={{color:bs.color,fontSize:11,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:10}}>{bs.name}</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>Balance</div><div style={{fontFamily:"monospace",fontSize:16,fontWeight:800}}>${bs.balance.toFixed(2)}</div></div>
                    <div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>P&L</div><div style={{fontFamily:"monospace",fontSize:16,fontWeight:800,color:bs.pl>=0?C.win:C.loss}}>{fmt(bs.pl)}</div></div>
                    <div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>ROI</div><div style={{fontFamily:"monospace",fontSize:13,color:bs.roi>=0?C.win:C.loss}}>{bs.roi.toFixed(1)}%</div></div>
                    <div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>Settled</div><div style={{fontFamily:"monospace",fontSize:13}}>{bs.count}</div></div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px",marginBottom:20}}>
              <div style={{color:C.muted,fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4}}>Calibration — Estimated vs Actual Win Rate</div>
              <div style={{color:C.muted,fontSize:11,marginBottom:12}}>Points on the diagonal mean your estimates are accurate.</div>
              {calibration.length>0?(
                <ResponsiveContainer width="100%" height={220}>
                  <ScatterChart margin={{top:10,right:10,bottom:10,left:0}}>
                    <XAxis type="number" dataKey="est" name="Estimated %" domain={[0,100]} tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis type="number" dataKey="actual" name="Actual %" domain={[0,100]} tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false} width={40}/>
                    <ZAxis type="number" dataKey="n" range={[60,300]} name="Bets"/>
                    <Tooltip contentStyle={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12}} formatter={(v,name)=>name==="Bets"?[v,"bets in bucket"]:[`${v}%`,name]}/>
                    <ReferenceLine segment={[{x:0,y:0},{x:100,y:100}]} stroke={C.muted} strokeDasharray="4 4"/>
                    <Scatter data={calibration} fill={C.combined}/>
                  </ScatterChart>
                </ResponsiveContainer>
              ):<div style={{color:C.muted,fontSize:13,textAlign:"center",padding:"30px 0"}}>Needs 3+ settled bets with probability estimates.</div>}
            </div>
            <button onClick={generateAISummary} disabled={aiLoading||bets.length===0} style={{background:bets.length===0?C.border:C.accent,color:"#fff",border:"none",borderRadius:8,padding:"12px 24px",fontSize:14,fontWeight:600,cursor:bets.length===0?"not-allowed":"pointer",marginBottom:18,width:isMobile?"100%":"auto"}}>
              {aiLoading?"Analysing...":bets.length===0?"Log bets first":"Generate AI Summary"}
            </button>
            {aiSummary&&(
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"18px 20px"}}>
                <div style={{color:C.muted,fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:10}}>Claude Analysis</div>
                <div style={{fontSize:13,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{aiSummary}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
