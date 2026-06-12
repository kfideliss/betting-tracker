import { useState, useEffect, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar, ScatterChart, Scatter, ZAxis, Legend } from "recharts";
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

const IMPORT_BETS=[
  {match:"Spain or Argentina — Winner Double Chance",odds:3.40,stake:25,isBonus:true},
  {match:"Spain — Winner",odds:5.50,stake:10,isBonus:true},
  {match:"Argentina or France — Winner Double Chance",odds:3.60,stake:25},
  {match:"France/Kylian Mbappe — Winner/Golden Ball Double",odds:26.00,stake:5},
  {match:"Spain/Rodri — Winner/Golden Ball Double",odds:51.00,stake:5},
  {match:"England/Declan Rice — Winner/Golden Ball Double",odds:67.00,stake:5},
  {match:"Brazil/Raphinha — Winner/Golden Ball Double",odds:67.00,stake:5},
  {match:"Spain/Mikel Oyarzabal — Winner/Top Goalscorer Double",odds:26.00,stake:5},
  {match:"Argentina/Julian Alvarez — Winner/Top Goalscorer Double",odds:101.00,stake:10},
  {match:"France/Senegal — Group Quinella (Group I)",odds:3.25,stake:25},
  {match:"Switzerland/Bosnia — Group Quinella (Group B)",odds:3.75,stake:25},
  {match:"Turkiye/Australia — Group Quinella (Group D)",odds:11.00,stake:10},
  {match:"Morocco — Group Winner (Group C)",odds:4.50,stake:25},
  {match:"Paraguay — Finish Bottom of Group (Group D)",odds:4.25,stake:25},
  {match:"Canada — Finish Bottom of Group (Group B)",odds:9.00,stake:15},
  {match:"Sweden — Finish Bottom of Group (Group F)",odds:4.00,stake:25},
  {match:"Quadcast Group A: 1.CZE/2.KOR/3.MEX/4.RSA",odds:26.00,stake:5},
  {match:"Quadcast Group A: 1.KOR/2.CZE/3.MEX/4.RSA",odds:21.00,stake:5},
  {match:"Quadcast Group B: 1.SUI/2.BIH/3.QAT/4.CAN",odds:21.00,stake:5},
  {match:"Multi 2-Leg: ARG Reach QF (1.95) + ESP Reach QF (1.60)",odds:3.12,stake:25,betType:"Multi"},
  {match:"Multi 4-Leg: NZL (1.45) + JOR (1.20) + IRQ (1.20) + PAN (1.55) Finish Bottom",odds:3.23,stake:25,betType:"Multi"},
].map((b,i)=>({
  id:`import-${i}`,date:"2026-06-10",sport:"Soccer",
  market:b.betType==="Multi"?"Same Game Multi":"Futures Market",
  bookmaker:"TAB",match:b.match,stake:b.stake,odds:b.odds,myProb:null,
  outcome:"Pending",notes:"Imported from TAB screenshots",
  betType:b.betType||"Future",isBonus:!!b.isBonus,deducted:!b.isBonus,
}));

function StatCard({label,value,sub,color}){
  return(
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 16px"}}>
      <div style={{color:C.muted,fontSize:10,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4}}>{label}</div>
      <div style={{color:color||C.text,fontSize:20,fontWeight:700,fontFamily:"monospace"}}>{value}</div>
      {sub&&<div style={{color:C.muted,fontSize:10,marginTop:2}}>{sub}</div>}
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
  const [imported,setImported]=useState(false);
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
    setImported(lsGet("imported_v1",false));
    const ss=lsGet("sports_v1",null); if(ss) setCustomSports(ss);
    const ms=lsGet("markets_v1",null); if(ms) setCustomMarkets(ms);
    setLoaded(true);
  },[authed]);

  function showToast(msg){setToast(msg);setTimeout(()=>setToast(""),3000);}
  const persistBets=useCallback(async(next)=>{setBets(next);lsSet("bets_v1",next);},[]);
  const persistBooks=useCallback(async(next)=>{setBooks(next);lsSet("books_v1",next);},[]);
  const persistTxns=useCallback(async(next)=>{setTxns(next);lsSet("txns_v1",next);},[]);

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

  function runImport(){
    const freshBets=lsGet("bets_v1",[]);
    const existing=new Set(freshBets.map(b=>b.id));
    const toAdd=IMPORT_BETS.filter(b=>!existing.has(b.id));
    const next=[...freshBets,...toAdd];
    setBets(next); lsSet("bets_v1",next);
    setImported(true); lsSet("imported_v1",true);
    showToast(`${toAdd.length} bets imported.`);
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
  const pendingRegular=pendingAll.filter(b=>b.betType==="Regular");
  const pendingFutures=pendingAll.filter(b=>b.betType==="Future"||b.betType==="Multi");
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

  const bankrollSeries=(()=>{
    const events=[];
    settledAll.forEach(b=>events.push({date:settleDate(b),book:b.bookmaker,delta:balanceEffect(b,b.outcome),kind:"bet"}));
    txns.forEach(t=>events.push({date:t.date,book:t.book,delta:t.type==="deposit"?parseFloat(t.amount):-parseFloat(t.amount),kind:t.type}));
    const filtered=events.filter(e=>inTimeFilter(e.date,timeFilter)).sort((a,b)=>new Date(a.date)-new Date(b.date));
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
    const bet={...form,id:editId||Date.now().toString(),stake:parseFloat(form.stake),odds:parseFloat(form.odds),myProb:form.myProb?parseFloat(form.myProb):null,deducted:editId?(bets.find(b=>b.id===editId)?.deducted??false):(isFT&&!form.isBonus)};
    const next=editId?bets.map(b=>b.id===editId?bet:b):[...bets,bet];
    const wasEdit=!!editId;
    if(editId) setEditId(null);
    persistBets(next);
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

  function PendingRow({b}){
    return(
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderTop:`1px solid ${C.border}`,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:150}}>
          <div style={{fontSize:13,fontWeight:600}}>{b.match} {b.isBonus&&<Pill label="BB" color={C.bonus}/>}</div>
          <div style={{color:C.muted,fontSize:11}}>{b.bookmaker} · ${parseFloat(b.stake).toFixed(2)} @ {b.odds?parseFloat(b.odds).toFixed(2):"—"}{b.odds?` · returns $${(parseFloat(b.stake)*parseFloat(b.odds)).toFixed(2)}`:""}</div>
        </div>
        <SettleButtons b={b}/>
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
          <span style={{fontWeight:800,fontSize:18,letterSpacing:"-0.02em"}}>EDGE</span>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {[["dashboard","Home"],["add",editId?"Edit":"+"],["log","Bets"],["calendar","Calendar"],["accounts","Settings"],["analysis","Analysis"]].map(([k,label])=>(
              <button key={k} onClick={()=>setTab(k)} style={{background:tab===k?C.accent:"transparent",color:tab===k?"#fff":C.muted,border:`1px solid ${tab===k?C.accent:C.border}`,borderRadius:6,padding:isMobile?"7px 10px":"6px 13px",fontSize:12,fontWeight:600,cursor:"pointer"}}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{padding:isMobile?"16px 14px":"24px",maxWidth:1100,margin:"0 auto"}}>

        {tab==="dashboard"&&(
          <div>
            {!imported&&(
              <div style={{background:C.card,border:`1px solid ${C.accent}66`,borderRadius:10,padding:"14px 16px",marginBottom:18,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
                <div>
                  <div style={{fontWeight:700,fontSize:13}}>21 TAB World Cup bets ready to import</div>
                  <div style={{color:C.muted,fontSize:11}}>$370 staked ($335 cash + $35 bonus). No balance change.</div>
                </div>
                <button onClick={runImport} style={{background:C.accent,color:"#fff",border:"none",borderRadius:7,padding:"10px 18px",fontSize:13,fontWeight:700,cursor:"pointer"}}>Import All</button>
              </div>
            )}

            <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
              {TIME_FILTERS.map(f=>(
                <button key={f} onClick={()=>setTimeFilter(f)} style={{background:timeFilter===f?C.combined+"33":"transparent",color:timeFilter===f?C.combined:C.muted,border:`1px solid ${timeFilter===f?C.combined:C.border}`,borderRadius:20,padding:"5px 14px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{f}</button>
              ))}
            </div>

            {pendingRegular.length>0&&(
              <div style={{background:C.card,border:`1px solid ${C.pending}44`,borderRadius:10,padding:"14px 16px",marginBottom:14}}>
                <div style={{color:C.pending,fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:6}}>Pending — Quick Settle</div>
                {pendingRegular.map(b=><PendingRow key={b.id} b={b}/>)}
              </div>
            )}

            {pendingFutures.length>0&&(
              <div style={{background:C.card,border:`1px solid ${C.future}44`,borderRadius:10,marginBottom:14,overflow:"hidden"}}>
                <button onClick={()=>setFuturesOpen(!futuresOpen)} style={{width:"100%",background:"transparent",border:"none",padding:"14px 16px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",color:C.text}}>
                  <div style={{textAlign:"left"}}>
                    <div style={{color:C.future,fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",fontWeight:700}}>Futures & Multis ({pendingFutures.length})</div>
                    <div style={{color:C.muted,fontSize:11,marginTop:2}}>${futuresExposure.toFixed(2)} cash at risk · ${futuresPotential.toFixed(2)} max collect</div>
                  </div>
                  <span style={{color:C.future,fontSize:18,transform:futuresOpen?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▾</span>
                </button>
                {futuresOpen&&<div style={{padding:"0 16px 14px"}}>{pendingFutures.map(b=><PendingRow key={b.id} b={b}/>)}</div>}
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
              <StatCard label="Bonus Held" value={fmtAbs(bonusHeld)} color={C.bonus} sub="unplaced credits"/>
            </div>

            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px",marginBottom:16}}>
              <div style={{color:C.muted,fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:12}}>Bankroll History — {timeFilter}</div>
              {bankrollSeries.points.length>1?(
                <ResponsiveContainer width="100%" height={210}>
                  <LineChart data={bankrollSeries.points}>
                    <XAxis dataKey="date" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false} domain={["auto","auto"]} width={50}/>
                    <Tooltip contentStyle={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12}} formatter={(v,name)=>[`$${v.toFixed(2)}`,name]}/>
                    <Legend wrapperStyle={{fontSize:11}}/>
                    <Line type="monotone" dataKey="Combined" stroke={C.combined} strokeWidth={2.5} dot={false}/>
                    {books.map(bk=>(<Line key={bk.name} type="monotone" dataKey={bk.name} stroke={bk.color} strokeWidth={1.5} dot={false}/>))}
                  </LineChart>
                </ResponsiveContainer>
              ):<div style={{color:C.muted,fontSize:13,textAlign:"center",padding:"30px 0"}}>Settle bets or log transactions to see your curve.</div>}
              {bankrollSeries.txnMarkers.length>0&&(
                <div style={{color:C.muted,fontSize:10,marginTop:6}}>
                  {bankrollSeries.txnMarkers.map((m,i)=><span key={i} style={{marginRight:10}}>{m.kind==="deposit"?"▲":"▼"} {m.date} {m.kind}</span>)}
                </div>
              )}
            </div>

            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14}}>
              {marketBreakdown.length>0&&(
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px"}}>
                  <div style={{color:C.muted,fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:12}}>By Market</div>
                  {marketBreakdown.map(m=>(
                    <div key={m.market} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderTop:`1px solid ${C.border}`}}>
                      <div style={{fontSize:13,fontWeight:600}}>{m.market} <span style={{color:C.muted,fontSize:10}}>({m.count})</span></div>
                      <div style={{display:"flex",gap:14,fontFamily:"monospace",fontSize:12}}>
                        <span style={{color:m.roi>=0?C.win:C.loss}}>{m.roi.toFixed(0)}% ROI</span>
                        <span style={{color:m.pl>=0?C.win:C.loss}}>{fmt(m.pl)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {sportBreakdown.length>0&&(
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px"}}>
                  <div style={{color:C.muted,fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:12}}>By Sport</div>
                  {sportBreakdown.map(s=>(
                    <div key={s.sport} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderTop:`1px solid ${C.border}`}}>
                      <div style={{fontSize:13,fontWeight:600}}>{s.sport} <span style={{color:C.muted,fontSize:10}}>({s.count})</span></div>
                      <div style={{display:"flex",gap:14,fontFamily:"monospace",fontSize:12}}>
                        <span style={{color:C.muted}}>{s.strike.toFixed(0)}% SR</span>
                        <span style={{color:s.roi>=0?C.win:C.loss}}>{s.roi.toFixed(0)}% ROI</span>
                        <span style={{color:s.pl>=0?C.win:C.loss}}>{fmt(s.pl)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

        {tab==="analysis"&&(
          <div>
            <div style={{fontSize:16,fontWeight:700,marginBottom:16}}>Performance Analysis</div>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:12,marginBottom:20}}>
              {bookStats.map(bs=>(
                <div key={bs.name} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 18px"}}>
                  <div style={{color:bs.color,fontSize:11,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:10}}>{bs.name}</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <div><div style={{color:C.muted,fontSize:10}}>Balance</div><div style={{fontFamily:"monospace",fontSize:15,fontWeight:700}}>${bs.balance.toFixed(2)}</div></div>
                    <div><div style={{color:C.muted,fontSize:10}}>P&L</div><div style={{fontFamily:"monospace",fontSize:15,fontWeight:700,color:bs.pl>=0?C.win:C.loss}}>{fmt(bs.pl)}</div></div>
                    <div><div style={{color:C.muted,fontSize:10}}>ROI</div><div style={{fontFamily:"monospace",fontSize:13,color:bs.roi>=0?C.win:C.loss}}>{bs.roi.toFixed(1)}%</div></div>
                    <div><div style={{color:C.muted,fontSize:10}}>Settled</div><div style={{fontFamily:"monospace",fontSize:13}}>{bs.count}</div></div>
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
