"use strict";
/* =====================================================================
   dashboard.js — the view layer: world rendering, the reworked metrics,
   phase readout, tabs, the config drawer, the event list, the inspector,
   the controls, and the animation loop. Loaded last.
   Depends on config.js, agents.js, simulation.js, charts.js.
   ===================================================================== */

var sim, running=true, speed=2, selected=null;
var infiniteRes=true, riverOn=true, fishOn=false, birdsOn=false;
var predActivated=false, predGone=false, lastPhase=-1, bannerTimer=null;
var activeTab="overview", lastEventCount=-1;

var grid=$("grid"), gctx=grid.getContext("2d");

// ---- build / rebuild the world ----
function newSim(){
  const pop=+$("popSlider").value;
  const size=+document.querySelector("#resSeg button.on").dataset.size;
  const pred=+$("predSlider").value;
  const sites=+$("siteSlider").value;
  sim=new Simulation(size,size,pop,pred,sites,infiniteRes,riverOn,fishOn,birdsOn);
  selected=null; lastPhase=-1; predActivated=false; predGone=false;
  highlightState=null; lastEventCount=-1;
  hidePopup();
  $("inspect").innerHTML='<div class="hint">Click any creature on the grid — a mouse to follow its life, or a predator to see its hunt.</div>';
  if(typeof updateDistHighlight==="function") updateDistHighlight();
  updateSetupSummary();
  fitGrid();
}
function fitGrid(){
  const stage=$("stage");
  if(document.fullscreenElement===stage){
    grid.width=window.innerWidth; grid.height=window.innerHeight;
  } else {
    const target=Math.min(1000, grid.parentElement.clientWidth);
    grid.width=target; grid.height=Math.round(target*0.66);
  }
}

// ---- world render ----
function drawGrid(){
  const W=grid.width, H=grid.height;
  gctx.fillStyle="#080a0e"; gctx.fillRect(0,0,W,H);
  const cw=W/sim.w, ch=H/sim.h, r=Math.max(1.4,Math.min(cw,ch)*0.42);
  drawTerrain(cw,ch);
  // fish
  if(sim.fish.length){
    const fr=Math.max(1.2,Math.min(cw,ch)*0.32);
    for(const f of sim.fish){
      f.px += (f.x-f.px)*0.4; f.py += (f.y-f.py)*0.4;
      const cx=(f.px+0.5)*cw, cy=(f.py+0.5)*ch;
      gctx.beginPath(); gctx.ellipse(cx,cy,fr*1.5,fr,0,0,Math.PI*2);
      gctx.fillStyle=FISH_COLOR; gctx.globalAlpha=f===selected?1:0.9; gctx.fill();
      if(f===selected){ gctx.globalAlpha=1; gctx.lineWidth=2; gctx.strokeStyle="#fff"; gctx.beginPath(); gctx.arc(cx,cy,fr*2+2,0,Math.PI*2); gctx.stroke(); }
    }
    gctx.globalAlpha=1;
  }
  // mice (with optional state spotlight)
  const spot = highlightState;
  for(const m of sim.mice){
    m.px += (m.x-m.px)*0.35; m.py += (m.y-m.py)*0.35;
    const cx=(m.px+0.5)*cw, cy=(m.py+0.5)*ch;
    const dim = spot!==null && m.state!==spot;
    gctx.beginPath(); gctx.arc(cx,cy,r,0,Math.PI*2);
    gctx.fillStyle=STATE_COLOR[m.state];
    gctx.globalAlpha = dim?0.15 : (m===selected?1:0.9);
    gctx.fill();
    if(spot!==null && m.state===spot){
      gctx.globalAlpha=1; gctx.lineWidth=1.5; gctx.strokeStyle="#fff";
      gctx.beginPath(); gctx.arc(cx,cy,r+2,0,Math.PI*2); gctx.stroke();
    }
    if(m===selected){
      gctx.globalAlpha=1; gctx.lineWidth=2; gctx.strokeStyle="#fff";
      gctx.beginPath(); gctx.arc(cx,cy,r+3.5,0,Math.PI*2); gctx.stroke();
    }
  }
  gctx.globalAlpha=1;
  // predators
  const pr=Math.max(2.6,Math.min(cw,ch)*0.9);
  for(const p of sim.predators){
    p.px += (p.x-p.px)*0.4; p.py += (p.y-p.py)*0.4;
    const cx=(p.px+0.5)*cw, cy=(p.py+0.5)*ch;
    const dormant = sim.mice.length < PRED.ACTIVATE;
    gctx.beginPath(); gctx.arc(cx,cy,pr,0,Math.PI*2);
    gctx.fillStyle=PRED_COLOR; gctx.globalAlpha=dormant?0.5:1; gctx.fill();
    gctx.lineWidth=1.4; gctx.strokeStyle="#3a1e0a"; gctx.stroke();
    if(p===selected){ gctx.lineWidth=2.2; gctx.strokeStyle="#fff"; gctx.beginPath(); gctx.arc(cx,cy,pr+3.5,0,Math.PI*2); gctx.stroke(); }
  }
  gctx.globalAlpha=1;
  // birds
  if(sim.birds.length){
    const bw=Math.max(3,Math.min(cw,ch)*1.1);
    for(const b of sim.birds){
      b.px += (b.x-b.px)*0.5; b.py += (b.y-b.py)*0.5;
      const cx=(b.px+0.5)*cw, cy=(b.py+0.5)*ch;
      gctx.strokeStyle="rgba(0,0,0,0.35)"; gctx.lineWidth=Math.max(1.4,bw*0.22);
      gctx.beginPath(); gctx.moveTo(cx-bw, cy+bw*0.5); gctx.lineTo(cx, cy); gctx.lineTo(cx+bw, cy+bw*0.5); gctx.stroke();
      gctx.strokeStyle=b===selected?"#fff":BIRD_COLOR; gctx.lineWidth=Math.max(1.2,bw*0.2);
      gctx.beginPath(); gctx.moveTo(cx-bw, cy+bw*0.42); gctx.lineTo(cx, cy-bw*0.08); gctx.lineTo(cx+bw, cy+bw*0.42); gctx.stroke();
      if(b===selected){ gctx.strokeStyle="#fff"; gctx.lineWidth=1.5; gctx.beginPath(); gctx.arc(cx,cy,bw+3,0,Math.PI*2); gctx.stroke(); }
    }
  }
  gctx.globalAlpha=1;
}
function drawTerrain(cw,ch){
  const w=sim.w, drawPlants=cw>=6;
  for(const idx of sim.vegCells){
    const amt=sim.veg[idx]; if(amt<=0) continue;
    const x=idx%w, y=(idx/w)|0, cx=x*cw, cy=y*ch;
    const f=Math.min(1,amt/TERR.VEG_MAX);
    gctx.fillStyle="rgba(70,130,60,"+(0.16+0.24*f)+")";
    gctx.fillRect(cx,cy,cw+0.5,ch+0.5);
    if(drawPlants){
      gctx.strokeStyle=FOOD_COLOR; gctx.lineWidth=Math.max(0.8,cw*0.09);
      const bx=cx+cw*0.5, by=cy+ch*0.86, hgt=ch*(0.3+0.45*f);
      gctx.beginPath();
      gctx.moveTo(bx,by); gctx.lineTo(bx,by-hgt);
      gctx.moveTo(bx,by-hgt*0.55); gctx.lineTo(bx-cw*0.24,by-hgt*0.8);
      gctx.moveTo(bx,by-hgt*0.55); gctx.lineTo(bx+cw*0.24,by-hgt*0.8);
      gctx.stroke();
    }
  }
  for(const idx of sim.waterCells){
    const x=idx%w, y=(idx/w)|0;
    gctx.fillStyle = sim.river[idx] ? "#3aa9ea" : WATER_COLOR;
    gctx.fillRect(x*cw-0.5,y*ch-0.5,cw+1,ch+1);
  }
  gctx.fillStyle="rgba(255,255,255,0.07)";
  for(const idx of sim.waterCells){
    const x=idx%w, y=(idx/w)|0;
    if(y>0 && !sim.water[(y-1)*w+x]) gctx.fillRect(x*cw,y*ch,cw,Math.max(1,ch*0.28));
  }
}

// ---- metrics + phase ----
function fmtPct(p){ return p<1?p.toFixed(2):p<10?p.toFixed(1):Math.round(p).toString(); }
function updateUI(){
  const s=sim.stats();
  // toolbar
  $("tickLbl").textContent=s.tick;
  const tp=$("tbPhase"); tp.textContent=PHASES[s.phase].short; tp.style.color=PHASE_DOT[s.phase];

  // population (dominant card) with today's net + delta from peak
  $("mPop").textContent=s.pop;
  const net=s.births-s.deaths, fromPeak=s.pop-s.peak;
  const netStr = net>0?`<span class="up">+${net} today</span>`:net<0?`<span class="down">${net} today</span>`:`0 today`;
  const peakStr = fromPeak<0?` · <span class="down">${fromPeak} from peak</span>`:` · at peak`;
  $("mPopDelta").innerHTML=netStr+peakStr;

  // occupancy (interpretable density)
  const occ=sim.occupancy();
  $("mDens").innerHTML=fmtPct(occ.pct*100)+'<small>% occupied</small>';
  $("mDensSub").textContent=`${s.pop} mice · ${occ.habitable.toLocaleString()} habitable cells`;

  // births / deaths — today + 30-day rolling average
  $("mBirth").textContent=s.births;
  $("mBirthSub").textContent="30-day avg "+sim.avgRate(sim.birthsHistory).toFixed(1);
  $("mDeath").textContent=s.deaths;
  $("mDeathSub").textContent="30-day avg "+sim.avgRate(sim.deathsHistory).toFixed(1);

  $("mBeauty").textContent=s.beautiful;
  $("mPeak").textContent=s.peak;
  $("mPred").textContent=s.predators;
  $("mEaten").textContent=s.eaten;
  $("tileFish").style.display = sim.hasFish?"":"none";
  $("tileBirds").style.display = sim.hasBirds?"":"none";
  if(sim.hasFish) $("mFish").textContent=s.fish;
  if(sim.hasBirds) $("mBirds").textContent=s.birds;

  const rl=$("riverLvl");
  if(sim.hasRiver && !sim.infinite){ rl.textContent="· "+Math.round(sim.riverLevel*100)+"% full"; rl.style.color=sim.riverLevel<0.3?"#e5484d":"var(--muted)"; }
  else rl.textContent="";

  // phase bar (6 stages) + description
  document.querySelectorAll("#phasebar .p").forEach((p,i)=>p.classList.toggle("on", i<=s.phase));
  $("phaseName").textContent=PHASES[s.phase].name;
  $("phaseDesc").textContent=PHASES[s.phase].desc;

  if(s.phase!==lastPhase){ lastPhase=s.phase; showBanner(PHASES[s.phase]); }
  if(selected) renderInspect();
  renderEvents();

  // predator narrative -> banner + event log
  const predsActive = s.predators>0 && s.pop>=PRED.ACTIVATE;
  if(predsActive && !predActivated){
    predActivated=true;
    sim.logEvent("Predators move in — the cats begin to hunt", PRED_COLOR, "predator");
    showBanner({short:"The predators move in", desc:"With a colony to hunt, the cats begin to stalk. Watch the mice scatter."});
  }
  if(predActivated && s.predators===0 && !predGone){
    predGone=true;
    sim.logEvent("Predators starved out — no hunters remain", PRED_COLOR, "predator");
    showBanner({short:"Predators starved out", desc:"The hunters ran out of prey and died off. Will the mouse colony now overcrowd?"});
  }
  if(s.predators>0) predGone=false;

  if(s.pop===0 && running){
    running=false; $("playBtn").textContent="⏵ Play";
    const why = s.predators>0
      ? "The predators ate the last of them. Without prey, the hunters will starve too."
      : "Just like Universe 25, abundance without space led to a society that could not survive itself.";
    showBanner({short:"Extinction", name:"The colony is gone", desc:why},true);
  }
}

// ---- event list (Events tab) ----
function renderEvents(){
  if(sim.events.length===lastEventCount) return;
  lastEventCount=sim.events.length;
  const host=$("eventsList"); if(!host) return;
  if(!sim.events.length){ host.innerHTML='<div class="empty">No events yet. Phase changes, predator activity, and your interventions will appear here.</div>'; return; }
  let html="";
  for(let i=sim.events.length-1;i>=0;i--){
    const e=sim.events[i];
    html+=`<div class="ev" data-day="${e.day}"><span class="d">day ${e.day}</span>`
      +`<span class="l"><span class="tag" style="background:${e.color}"></span>${e.label}</span></div>`;
  }
  host.innerHTML=html;
  host.querySelectorAll(".ev").forEach(el=>el.onclick=()=>setTab("pops"));
}

// ---- banner ----
function showBanner(p, sticky){
  $("bannerPh").textContent=p.short||p.name;
  $("bannerDesc").textContent=p.desc||"";
  const b=$("banner"); b.classList.add("show");
  clearTimeout(bannerTimer);
  if(!sticky) bannerTimer=setTimeout(()=>b.classList.remove("show"),4200);
}

// ---- inspector ----
function bar(v){ return `<div class="bar"><i style="width:${v}%"></i></div>`; }
function hidePopup(){ $("popup").classList.remove("show"); }
function inspectHTML(){
  if(selected instanceof Fish){
    const f=selected;
    return {title:`<span style="color:${FISH_COLOR}">🐟 Fish</span>`, body:`
      <div class="row"><span>Age</span><span>${f.age}</span></div>
      <div class="row"><span>Home</span><span>water only</span></div>
      <div class="hint" style="margin-top:8px">Lives and breeds in the water. Cats snatch fish from the water's edge; strands and dies if its water dries up.</div>`};
  }
  if(selected instanceof Bird){
    const b=selected;
    return {title:`<span style="color:#cfd6e6">🐦 Bird</span>`, body:`
      <div class="row"><span>Age / Sex</span><span>${b.age} · ${b.gender}</span></div>
      <div class="row"><span>Kills</span><span>${b.kills}</span></div>
      <div style="margin-top:8px"><span class="hint">Food reserve</span>${bar(clamp(b.reserve,0,100))}</div>
      <div class="hint" style="margin-top:8px">Nests in the grass and only leaves it to chase a nearby mouse. Eats mice and fish (never cats). Starves without prey.</div>`};
  }
  if(selected instanceof Predator){
    const p=selected, dormant=sim.mice.length<PRED.ACTIVATE;
    return {title:`<span style="color:${PRED_COLOR}">🐈 Predator (cat)</span>`, body:`
      <div class="row"><span>Status</span><span>${dormant?"prowling (dormant)":"hunting"}</span></div>
      <div class="row"><span>Age / Sex</span><span>${p.age} · ${p.gender}</span></div>
      <div class="row"><span>Mice eaten</span><span>${p.kills}</span></div>
      <div style="margin-top:8px">
        <span class="hint">Food reserve</span>${bar(clamp(p.reserve,0,100))}
        <span class="hint">Thirst</span>${bar(clamp(p.thirst,0,100))}
      </div>
      <div class="hint" style="margin-top:8px">Starves if food reserve hits zero, or dies of thirst if it can't reach water. Breeds when well-fed.</div>`};
  }
  const m=selected, stateName=STATE_NAME[m.state];
  const beautyNote = m.state===STATE.BEAUTIFUL
    ? `<div class="hint" style="margin-top:8px">A "Beautiful One": socially withdrawn and endlessly self-grooming — eats and sleeps but never mates or fights.</div>`:"";
  return {title:`<span style="color:${STATE_COLOR[m.state]}">🐁 Mouse — ${stateName}</span>`, body:`
    <div class="row"><span>Age / Sex</span><span>${m.age} · ${m.gender}</span></div>
    <div class="row"><span>Health</span><span>${Math.round(m.health)}</span></div>
    <div class="row"><span>Offspring</span><span>${m.childrenCount}${m.pregnant?" · pregnant":""}</span></div>
    <div style="margin-top:8px">
      <span class="hint">Hunger</span>${bar(m.hunger)}
      <span class="hint">Thirst</span>${bar(m.thirst)}
    </div>
    <div style="margin-top:8px">
      <span class="hint">Aggression</span>${bar(m.aggression)}
      <span class="hint">Sociability</span>${bar(m.sociability)}
      <span class="hint">Parenting</span>${bar(m.parenting)}
      <span class="hint">Grooming</span>${bar(m.grooming)}
    </div>${beautyNote}`};
}
function renderInspect(){
  if(!selected||!selected.alive){
    selected=null; hidePopup();
    $("inspect").innerHTML='<div class="hint">That creature is gone. Click another to keep watching.</div>';
    return;
  }
  const {title,body}=inspectHTML();
  $("inspect").innerHTML=body;
  $("popupBody").innerHTML=`<div class="ttl">${title}</div>`+body;
  $("popup").classList.add("show");
}

grid.addEventListener("click",e=>{
  const rect=grid.getBoundingClientRect();
  const mx=(e.clientX-rect.left)/rect.width*grid.width;
  const my=(e.clientY-rect.top)/rect.height*grid.height;
  const cw=grid.width/sim.w, ch=grid.height/sim.h;
  let best=null,bd=Infinity;
  for(const m of [...sim.mice, ...sim.predators, ...sim.fish, ...sim.birds]){
    const cx=(m.px+0.5)*cw, cy=(m.py+0.5)*ch;
    const d=(cx-mx)**2+(cy-my)**2;
    const bias=(m instanceof Predator||m instanceof Bird)?0.5:1;
    if(d*bias<bd){ bd=d*bias; best=m; }
  }
  const hit=Math.max(16, Math.min(cw,ch)*1.6);
  if(best && bd < hit*hit){ selected=best; renderInspect(); setTab("inspector"); }
  else { selected=null; hidePopup(); }
});
$("popupClose").onclick=()=>{ selected=null; hidePopup(); };

// ---- tabs ----
function setTab(name){
  activeTab=name;
  document.querySelectorAll("#tabbar button").forEach(b=>b.classList.toggle("on", b.dataset.tab===name));
  document.querySelectorAll(".tabpane").forEach(p=>p.hidden = p.id!=="tab-"+name);
}
document.querySelectorAll("#tabbar button").forEach(b=>b.onclick=()=>setTab(b.dataset.tab));

// ---- config drawer ----
function updateSetupSummary(){
  const pop=$("popSlider").value;
  const resBtn=document.querySelector("#resSeg button.on");
  const size=resBtn.dataset.size;
  const pred=$("predSlider").value, sites=$("siteSlider").value;
  const bits=[`${pop} mice`, `${resBtn.textContent} (${size}×${size})`,
    infiniteRes?"∞ vegetation":"finite resources",
    (+pred>0?`${pred} cats`:"no cats"),
    `${sites} food/water sites`];
  if(riverOn) bits.push("river");
  if(fishOn) bits.push("fish");
  if(birdsOn) bits.push("birds");
  $("setupSummary").textContent=bits.join(" · ");
}
$("setupToggle").onclick=()=>$("setupDrawer").classList.toggle("collapsed");
$("setupClose").onclick=()=>$("setupDrawer").classList.add("collapsed");

// ---- loop ----
var acc=0, lastT=0;
function loop(t){
  const dt=t-lastT; lastT=t;
  if(running){
    acc+=dt;
    const stepMs = 1000/(6*speed);
    let guard=0;
    while(acc>=stepMs && guard<speed*4){ sim.step(); acc-=stepMs; guard++; }
  }
  drawGrid();
  if(activeTab==="pops") drawPopChart();
  if(activeTab==="behavior") drawDistribution();
  updateUI();
  requestAnimationFrame(loop);
}

// ---- controls ----
$("playBtn").onclick=()=>{ running=!running; $("playBtn").textContent=running?"⏸ Pause":"⏵ Play"; };
$("stepBtn").onclick=()=>{ sim.step(); };
$("resetBtn").onclick=()=>{ newSim(); running=true; $("playBtn").textContent="⏸ Pause"; };
document.querySelectorAll("#speedSeg button").forEach(b=>{
  b.onclick=()=>{ document.querySelectorAll("#speedSeg button").forEach(x=>x.classList.remove("on")); b.classList.add("on"); speed=+b.dataset.s; };
});
$("popSlider").oninput=e=>{ $("popVal").textContent=e.target.value; updateSetupSummary(); };
$("predSlider").oninput=e=>{ $("predVal").textContent=e.target.value; updateSetupSummary(); };
$("siteSlider").oninput=e=>{ $("siteVal").textContent=e.target.value; updateSetupSummary(); };
function setRes(size){ document.querySelectorAll("#resSeg button").forEach(x=>x.classList.toggle("on", x.dataset.size===String(size))); }
document.querySelectorAll("#resSeg button").forEach(b=>{
  b.onclick=()=>{ setRes(b.dataset.size); newSim(); running=true; $("playBtn").textContent="⏸ Pause"; };
});
function toggleFullscreen(){
  const stage=$("stage");
  if(document.fullscreenElement===stage) document.exitFullscreen();
  else if(stage.requestFullscreen) stage.requestFullscreen();
}
$("fsBtn").onclick=toggleFullscreen;
$("fsBtn2").onclick=toggleFullscreen;
document.addEventListener("fullscreenchange",fitGrid);
document.querySelectorAll("#infSeg button").forEach(b=>{
  b.onclick=()=>{
    document.querySelectorAll("#infSeg button").forEach(x=>x.classList.remove("on"));
    b.classList.add("on"); infiniteRes = b.dataset.inf==="1";
    if(sim){ sim.setInfinite(infiniteRes); sim.logEvent("Resources → "+(infiniteRes?"infinite":"finite"), "#e8c447", "intervention"); }
    updateSetupSummary();
  };
});
function structuralToggle(sel, apply){
  document.querySelectorAll(sel+" button").forEach(b=>{
    b.onclick=()=>{ document.querySelectorAll(sel+" button").forEach(x=>x.classList.remove("on")); b.classList.add("on"); apply(b); newSim(); running=true; $("playBtn").textContent="⏸ Pause"; };
  });
}
structuralToggle("#riverSeg", b=>riverOn=b.dataset.river==="1");
structuralToggle("#fishSeg",  b=>fishOn=b.dataset.fish==="1");
structuralToggle("#birdSeg",  b=>birdsOn=b.dataset.bird==="1");
document.querySelectorAll("[data-preset]").forEach(b=>{
  b.onclick=()=>{
    const p=b.dataset.preset;
    if(p==="predator"){ $("popSlider").value=14; setRes(58); $("predSlider").value=8; $("siteSlider").value=3; }
    if(p==="classic"){ $("popSlider").value=12; setRes(58); $("predSlider").value=0; $("siteSlider").value=3; }
    if(p==="crowded"){ $("popSlider").value=40; setRes(40); $("predSlider").value=5; $("siteSlider").value=2; }
    if(p==="roomy"){ $("popSlider").value=12; setRes(98); $("predSlider").value=6; $("siteSlider").value=5; }
    $("popVal").textContent=$("popSlider").value;
    $("predVal").textContent=$("predSlider").value;
    $("siteVal").textContent=$("siteSlider").value;
    newSim(); running=true; $("playBtn").textContent="⏸ Pause";
  };
});
window.addEventListener("resize",fitGrid);

// ---- boot ----
initCharts();
setTab("overview");
newSim();
requestAnimationFrame(loop);
