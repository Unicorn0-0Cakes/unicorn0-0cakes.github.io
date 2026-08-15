"use strict";
/* =====================================================================
   charts.js — the redesigned population graph (axes, hover readout,
   phase bands, event markers, species toggles, view modes) and the
   behaviour distribution that replaces the old solid rectangle.
   Depends on config.js + simulation.js. Called from dashboard.js.
   ===================================================================== */

// ---- shared, cross-file UI state ----
var chartSpecies = { mice:true, cats:true, fish:true, birds:true };
var chartView   = "counts";  // "counts" | "percent"
var chartSmooth = false;
var chartLog    = false;
var hoverX      = -1;        // cursor x within the canvas (CSS px), -1 = off
var highlightState = null;   // STATE index highlighted in the world (from distribution)

var popChart = $("popChart"), pctx = popChart.getContext("2d");
var chartTip = $("chartTip");
var _geom = null;            // last-draw geometry, for hover mapping

// series colours
var SERIES = {
  mice:  { key:"history",     color:"#6ea8fe", label:"Mice",  axis:"primary"   },
  cats:  { key:"predHistory", color:PRED_COLOR, label:"Cats",  axis:"secondary" },
  fish:  { key:"fishHistory", color:FISH_COLOR, label:"Fish",  axis:"secondary" },
  birds: { key:"birdHistory", color:BIRD_COLOR, label:"Birds", axis:"secondary" },
};

function sizeCanvas(cv, cssH){
  const dpr=window.devicePixelRatio||1;
  const cssW=cv.parentElement.clientWidth || 320;
  if(cv._cssW!==cssW || cv._cssH!==cssH){
    cv.width=Math.round(cssW*dpr); cv.height=Math.round(cssH*dpr);
    cv.style.width=cssW+"px"; cv.style.height=cssH+"px";
    cv._cssW=cssW; cv._cssH=cssH;
  }
  const ctx=cv.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0);
  return {W:cssW, H:cssH};
}

function smoothSeries(arr, win){
  if(!chartSmooth || win<2) return arr;
  const out=new Array(arr.length);
  let sum=0;
  for(let i=0;i<arr.length;i++){
    sum+=arr[i];
    if(i>=win) sum-=arr[i-win];
    out[i]=sum/Math.min(i+1,win);
  }
  return out;
}

// ---- population chart ----
function drawPopChart(){
  const {W,H}=sizeCanvas(popChart, 210);
  pctx.clearRect(0,0,W,H);
  const hist=sim.history, n=hist.length;
  const padL=34, padR=30, padT=10, padB=20;
  const x0=padL, y0=H-padB, plotW=W-padL-padR, plotH=H-padT-padB;
  if(n<2){
    pctx.fillStyle="var(--muted)"; pctx.fillStyle="#8b95a7"; pctx.font="12px sans-serif";
    pctx.fillText("Collecting data…", x0, padT+plotH/2);
    return;
  }
  const stepX=plotW/(n-1);
  const win=Math.max(3, Math.round(n/60));
  const percent=chartView==="percent";
  const useLog=chartLog && !percent;
  const tf=v=> useLog ? Math.log10(v+1) : v;

  // which secondary species are visible
  const secVisible=[];
  if(chartSpecies.cats)                 secVisible.push("cats");
  if(sim.hasFish && chartSpecies.fish)  secVisible.push("fish");
  if(sim.hasBirds && chartSpecies.birds)secVisible.push("birds");

  // ----- background phase bands -----
  const ph=sim.phaseHistory;
  if(ph && ph.length===n){
    let s=0;
    for(let i=1;i<=n;i++){
      if(i===n || ph[i]!==ph[s]){
        const tint=PHASE_TINT[ph[s]];
        if(tint && tint.slice(-4)!=="0.00"){
          pctx.fillStyle=tint;
          pctx.fillRect(x0+s*stepX, padT, (i-s)*stepX, plotH);
        }
        s=i;
      }
    }
  }

  // ----- scales -----
  let priMax;
  if(percent){ priMax=1; }
  else {
    priMax=1; for(const v of hist) if(v>priMax) priMax=v;
    priMax=tf(priMax*1.1);
  }
  let secMax=6;
  for(const sp of secVisible){ const a=sim[SERIES[sp].key]; for(const v of a) if(v>secMax) secMax=v; }
  secMax=tf(secMax*1.2);

  // helper: value -> y for an axis
  const yPri=(v,peak)=>{ const t = percent? (peak>0?v/peak:0) : tf(v)/priMax; return y0 - clamp(t,0,1)*plotH; };
  const ySec=(v,peak)=>{ const t = percent? (peak>0?v/peak:0) : tf(v)/secMax; return y0 - clamp(t,0,1)*plotH; };

  // ----- gridlines + axis labels -----
  pctx.strokeStyle="rgba(255,255,255,0.06)"; pctx.lineWidth=1;
  pctx.fillStyle="#8b95a7"; pctx.font="10px sans-serif"; pctx.textBaseline="middle";
  const ticks=percent?[0,0.5,1]:[0,0.5,1];
  for(const t of ticks){
    const y=y0-t*plotH;
    pctx.beginPath(); pctx.moveTo(x0,y); pctx.lineTo(x0+plotW,y); pctx.stroke();
    let lbl;
    if(percent) lbl=Math.round(t*100)+"%";
    else { const v = useLog ? Math.round(Math.pow(10,t*priMax)-1) : Math.round(t*priMax); lbl=String(v); }
    pctx.textAlign="right"; pctx.fillText(lbl, x0-4, y);
  }
  // secondary axis labels (right) when relevant
  if(!percent && secVisible.length){
    pctx.fillStyle="#8b95a7"; pctx.textAlign="left";
    for(const t of [0,1]){
      const y=y0-t*plotH;
      const v = useLog ? Math.round(Math.pow(10,t*secMax)-1) : Math.round(t*secMax);
      pctx.fillText(String(v), x0+plotW+4, y);
    }
  }
  // x-axis day labels
  pctx.fillStyle="#8b95a7"; pctx.textBaseline="alphabetic";
  pctx.textAlign="left";  pctx.fillText("day "+sim.dayAt(0), x0, H-6);
  pctx.textAlign="right"; pctx.fillText("day "+sim.dayAt(n-1), x0+plotW, H-6);
  // axis titles
  pctx.save(); pctx.translate(9,padT+plotH/2); pctx.rotate(-Math.PI/2);
  pctx.textAlign="center"; pctx.fillStyle="#6b7383"; pctx.fillText(percent?"% of own peak":"mice", 0,0);
  pctx.restore();

  // ----- event markers -----
  const firstDay=sim.dayAt(0), lastDay=sim.dayAt(n-1);
  for(const ev of sim.events){
    if(ev.day<firstDay || ev.day>lastDay) continue;
    const x=x0+(ev.day-firstDay)/Math.max(1,(lastDay-firstDay))*plotW;
    pctx.strokeStyle=ev.color; pctx.globalAlpha=.5; pctx.setLineDash([3,3]);
    pctx.beginPath(); pctx.moveTo(x,padT); pctx.lineTo(x,y0); pctx.stroke();
    pctx.setLineDash([]); pctx.globalAlpha=1;
    pctx.fillStyle=ev.color; pctx.beginPath();
    pctx.moveTo(x-3,padT); pctx.lineTo(x+3,padT); pctx.lineTo(x,padT+5); pctx.closePath(); pctx.fill();
  }

  // ----- series lines -----
  const drawSeries=(arr,color,axis,filled)=>{
    const data=smoothSeries(arr,win);
    let peak=1; if(percent){ for(const v of data) if(v>peak) peak=v; }
    const yFn = axis==="primary"?yPri:ySec;
    if(filled){
      pctx.beginPath(); pctx.moveTo(x0,y0);
      for(let i=0;i<n;i++) pctx.lineTo(x0+i*stepX, yFn(data[i],peak));
      pctx.lineTo(x0+(n-1)*stepX,y0); pctx.closePath();
      const g=pctx.createLinearGradient(0,padT,0,y0);
      g.addColorStop(0,"rgba(110,168,254,.28)"); g.addColorStop(1,"rgba(110,168,254,0)");
      pctx.fillStyle=g; pctx.fill();
    }
    pctx.beginPath();
    for(let i=0;i<n;i++){ const x=x0+i*stepX, y=yFn(data[i],peak); i?pctx.lineTo(x,y):pctx.moveTo(x,y); }
    pctx.strokeStyle=color; pctx.lineWidth=filled?2:1.6; pctx.stroke();
  };
  if(chartSpecies.mice) drawSeries(sim.history, SERIES.mice.color, "primary", !percent);
  for(const sp of secVisible) drawSeries(sim[SERIES[sp].key], SERIES[sp].color, "secondary", false);

  _geom={x0,y0,plotW,plotH,stepX,n,padT};

  // ----- hover readout -----
  chartTip.style.display="none";
  if(hoverX>=x0-4 && hoverX<=x0+plotW+4 && n>1){
    let i=Math.round((hoverX-x0)/stepX); i=clamp(i,0,n-1);
    const x=x0+i*stepX;
    pctx.strokeStyle="rgba(255,255,255,0.25)"; pctx.setLineDash([2,3]);
    pctx.beginPath(); pctx.moveTo(x,padT); pctx.lineTo(x,y0); pctx.stroke(); pctx.setLineDash([]);
    // build tooltip
    let rows=`<div class="r"><span class="k">Day</span><span>${sim.dayAt(i)}</span></div>`;
    const add=(sp)=>{ const s=SERIES[sp]; rows+=`<div class="r"><span class="k" style="color:${s.color}">${s.label}</span><span>${sim[s.key][i]}</span></div>`; };
    if(chartSpecies.mice) add("mice");
    for(const sp of secVisible) add(sp);
    // nearest event on this day, if any
    const ev=sim.events.find(e=>e.day===sim.dayAt(i));
    if(ev) rows+=`<div class="r" style="margin-top:3px"><span style="color:${ev.color}">${ev.label}</span></div>`;
    chartTip.innerHTML=rows;
    chartTip.style.display="block";
    const wrapW=popChart.parentElement.clientWidth;
    let left=x+10; if(left> wrapW-140) left=x-140;
    chartTip.style.left=Math.max(2,left)+"px";
    chartTip.style.top=(padT+4)+"px";
  }
}

// ---- behaviour distribution (replaces the solid stacked rectangle) ----
var _distBuilt=false;
function buildDistribution(){
  const host=$("distRows"); if(!host) return;
  host.innerHTML="";
  for(const s of STATE_ORDER){
    const row=document.createElement("div");
    row.className="drow"; row.dataset.state=s;
    row.innerHTML=`<span class="nm"><span class="dot" style="background:${STATE_COLOR[s]}"></span>${STATE_NAME[s]}</span>`
      +`<span class="track"><i id="distBar${s}" style="background:${STATE_COLOR[s]}"></i></span>`
      +`<span class="amt" id="distAmt${s}"></span>`;
    row.onclick=()=>{
      highlightState = (highlightState===s) ? null : s;
      updateDistHighlight();
    };
    host.appendChild(row);
  }
  _distBuilt=true;
  updateDistHighlight();
}
function updateDistHighlight(){
  document.querySelectorAll("#distRows .drow").forEach(r=>{
    const s=+r.dataset.state;
    r.classList.toggle("off", highlightState!==null && highlightState!==s);
  });
  const hint=$("distHint");
  if(hint) hint.textContent = highlightState===null
    ? "Click a state to spotlight those mice on the map."
    : "Spotlighting "+STATE_NAME[highlightState]+" — click again to clear.";
}
function drawDistribution(){
  if(!_distBuilt) buildDistribution();
  const sc=sim.stats().states;
  const total=Math.max(1, sc[0]+sc[1]+sc[2]+sc[3]+sc[4]);
  for(const s of STATE_ORDER){
    const pct=sc[s]/total*100;
    const bar=$("distBar"+s), amt=$("distAmt"+s);
    if(bar) bar.style.width=pct.toFixed(1)+"%";
    if(amt) amt.textContent=sc[s]+" · "+Math.round(pct)+"%";
  }
}

// ---- wiring (called from dashboard init) ----
function initCharts(){
  buildDistribution();
  // hover
  const move=e=>{ const r=popChart.getBoundingClientRect(); hoverX=e.clientX-r.left; };
  popChart.addEventListener("mousemove",move);
  popChart.addEventListener("mouseleave",()=>{ hoverX=-1; });
  // legend species toggles
  document.querySelectorAll("#popLegend .tog").forEach(el=>{
    el.onclick=()=>{ const k=el.dataset.series; chartSpecies[k]=!chartSpecies[k]; el.classList.toggle("off",!chartSpecies[k]); };
  });
  // view-mode segmented controls
  const seg=(id,fn)=>document.querySelectorAll(id+" button").forEach(b=>b.onclick=()=>{
    b.parentElement.querySelectorAll("button").forEach(x=>x.classList.remove("on"));
    b.classList.add("on"); fn(b.dataset.v);
  });
  seg("#viewSeg",  v=>chartView=v);
  seg("#smoothSeg",v=>chartSmooth=(v==="1"));
  seg("#scaleSeg", v=>chartLog=(v==="log"));
}
