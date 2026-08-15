"use strict";
/* =====================================================================
   simulation.js — the world: terrain, spatial index, the step loop,
   the reworked six-stage phase classifier, and the event log.
   Depends on config.js + agents.js.
   ===================================================================== */

var PHASE_DOT = ["#3fb96b","#6ea8fe","#e8c447","#e5484d","#c96bd8","#8b95a7"];

class Simulation {
  constructor(w,h,initPop,initPred=0,nSites=3,infinite=true,hasRiver=true,hasFish=false,hasBirds=false){
    this.w=w; this.h=h; this.infinite=infinite; this.hasRiver=hasRiver;
    this.hasFish=hasFish; this.hasBirds=hasBirds;
    this.startPop=initPop;
    this.mice=[]; this.predators=[]; this.fish=[]; this.birds=[]; this.deadCount=0;
    this.fishCaughtThisTick=0; this.birdKillsThisTick=0;
    this.tick=0; this.phase=0; this.peak=0; this.peakDay=0; this.predPeak=0;
    this.birthsThisTick=0; this.deathsThisTick=0;
    this.eatenThisTick=0; this.predBirthsThisTick=0; this.totalEaten=0;
    this.extinctLogged=false;
    this.history=[];       // mouse population
    this.predHistory=[];   // predator population
    this.fishHistory=[];   // fish population
    this.birdHistory=[];   // bird population
    this.stateHistory=[];  // {0..4 counts}
    this.birthsHistory=[]; // births per tick (for rolling averages)
    this.deathsHistory=[]; // deaths per tick (for rolling averages)
    this.phaseHistory=[];  // phase index per tick (for graph background bands)
    this.events=[];        // {day,label,color,type}
    this.maxCapacity=Math.floor(w*h*CFG.MAX_DENSITY);
    this.predCap=Math.max(24,Math.floor(w*h*PRED.CAP_FACTOR));
    this.cells=new Array(w*h);  // spatial index: cell -> array of mice
    this.pcells=new Array(w*h); // spatial index: cell -> array of predators
    this.fcells=new Array(w*h); // spatial index: cell -> array of fish
    this.bcells=new Array(w*h); // spatial index: cell -> array of birds
    this.fishCount=new Int16Array(w*h); // live per-cell fish count

    // ---- terrain ----
    this.water=new Uint8Array(w*h);      // 1 = water (impassable)
    this.river=new Uint8Array(w*h);      // 1 = part of the flowing river bed
    this.veg=new Float32Array(w*h);      // vegetation amount (0..VEG_MAX)
    this.riverBed=[]; this.riverLevel=1; this.riverUse=0;
    this.waterCells=[]; this.vegCells=[];
    this.waterDist=new Int32Array(w*h);  // land distance to nearest drink spot
    this.vegDist=new Int32Array(w*h);    // land distance to nearest vegetation
    this.terrainDirty=true;
    const cx=Math.floor(w/2), cy=Math.floor(h/2), spread=Math.max(2,Math.floor(w*0.06));
    this.spawnClear=spread+4;
    this.generateTerrain(nSites, cx, cy);
    this.waterSeed=this.water.slice();
    this.vegSeed=this.veg.slice();
    this.recomputeFields();

    // Release founders as a central cluster (on walkable ground).
    for(let i=0;i<initPop;i++){
      let x,y,t=0;
      do{ x=clamp(cx+rndi(-spread,spread),0,w-1); y=clamp(cy+rndi(-spread,spread),0,h-1); t++; }
      while(t<30 && !this.walkable(x,y));
      this.addMouse(new Mouse(x,y,this));
    }
    for(let i=0;i<initPred;i++){
      let x,y,t=0;
      do{ x=rndi(0,w-1); y=rndi(0,h-1); t++; } while(t<40 && !this.canEnter(x,y,true));
      this.predators.push(new Predator(x,y,this));
    }
    this.fishCap=Math.max(8,Math.floor(this.waterCells.length*FISH.CAP_FACTOR));
    this.birdCap=Math.max(8,Math.floor(w*h*BIRD.CAP_FACTOR));
    if(this.hasFish){
      const n=Math.min(this.fishCap, Math.max(6,Math.floor(this.waterCells.length*0.3)));
      for(let i=0;i<n && this.waterCells.length;i++){
        const idx=this.waterCells[rndi(0,this.waterCells.length-1)];
        this.fish.push(new Fish(idx%w,(idx/w)|0,this));
      }
    }
    if(this.hasBirds){
      const n=Math.max(3,Math.floor(this.birdCap*0.15));
      for(let i=0;i<n;i++){
        let bx,by;
        if(this.vegCells.length){ const idx=this.vegCells[rndi(0,this.vegCells.length-1)]; bx=idx%w; by=(idx/w)|0; }
        else { bx=rndi(0,w-1); by=rndi(0,h-1); }
        this.birds.push(new Bird(bx,by,this));
      }
    }
  }

  // ---- terrain generation ----
  generateTerrain(nBodies, cx, cy){
    const w=this.w, h=this.h, area=w*h;
    const nearCenter=(x,y)=>Math.abs(x-cx)+Math.abs(y-cy) < this.spawnClear;
    const growBlob=(sx,sy,size,canPlace,place)=>{
      const frontier=[[sx,sy]], seen=new Set();
      let n=0;
      while(frontier.length && n<size){
        const [x,y]=frontier.splice(rndi(0,frontier.length-1),1)[0];
        const key=y*w+x;
        if(seen.has(key)) continue; seen.add(key);
        if(x<0||x>=w||y<0||y>=h||!canPlace(x,y)) continue;
        place(x,y); n++;
        for(const [dx,dy] of DIRS4) frontier.push([x+dx,y+dy]);
      }
    };
    const pickSize=(sm,md,lg)=>{ const r=Math.random(); return r<0.5?rndi(sm[0],sm[1]):r<0.85?rndi(md[0],md[1]):rndi(lg[0],lg[1]); };
    const bigLake=Math.max(24,Math.floor(area*0.02));
    for(let i=0;i<nBodies;i++){
      let sx,sy,t=0;
      do{ sx=rndi(2,w-3); sy=rndi(2,h-3); t++; } while(t<40 && nearCenter(sx,sy));
      const size=pickSize([1,4],[8,20],[bigLake-15,bigLake]);
      growBlob(sx,sy,size,(x,y)=>!nearCenter(x,y)&&this.water[y*w+x]===0,(x,y)=>{this.water[y*w+x]=1;});
    }
    if(this.hasRiver) this.carveRiver(cx,cy);
    const vegPatches=nBodies*2+2;
    for(let i=0;i<vegPatches;i++){
      let sx,sy,t=0;
      do{ sx=rndi(1,w-2); sy=rndi(1,h-2); t++; } while(t<40 && this.water[sy*w+sx]===1);
      const size=pickSize([8,18],[24,50],[60,130]);
      growBlob(sx,sy,size,(x,y)=>this.water[y*w+x]===0,(x,y)=>{this.veg[y*w+x]=TERR.VEG_MAX;});
    }
  }
  buildIndex(){
    const c=this.cells; c.fill(undefined);
    for(const m of this.mice){ if(!m.alive) continue; const k=m.y*this.w+m.x; (c[k]||(c[k]=[])).push(m); }
    const pc=this.pcells; pc.fill(undefined);
    for(const p of this.predators){ if(!p.alive) continue; const k=p.y*this.w+p.x; (pc[k]||(pc[k]=[])).push(p); }
    const fc=this.fcells; fc.fill(undefined); this.fishCount.fill(0);
    for(const f of this.fish){ if(!f.alive) continue; const k=f.y*this.w+f.x; (fc[k]||(fc[k]=[])).push(f); this.fishCount[k]++; }
    const bc=this.bcells; bc.fill(undefined);
    for(const b of this.birds){ if(!b.alive) continue; const k=b.y*this.w+b.x; (bc[k]||(bc[k]=[])).push(b); }
  }
  isWater(x,y){ return x>=0&&x<this.w&&y>=0&&y<this.h && this.water[y*this.w+x]===1; }
  fishAt(x,y){ return this.fishCount[y*this.w+x]; }
  leastCrowdedWater(x,y){
    let best=null,bestC=Infinity;
    const consider=(cx,cy)=>{ if(!this.isWater(cx,cy))return; const c=this.fishAt(cx,cy); if(c<bestC){bestC=c;best=[cx,cy];} };
    for(const [dx,dy] of DIRS8) consider(x+dx,y+dy);
    consider(x,y);
    return best;
  }
  openWaterCell(x,y){
    const opts=[];
    for(const [dx,dy] of DIRS8){ const nx=x+dx,ny=y+dy; if(this.isWater(nx,ny) && this.fishAt(nx,ny)<FISH.MAX_PER_CELL) opts.push([nx,ny]); }
    if(this.isWater(x,y) && this.fishAt(x,y)<FISH.MAX_PER_CELL) opts.push([x,y]);
    return opts.length?opts[rndi(0,opts.length-1)]:null;
  }
  nearestBird(x,y,r){
    let best=null,bd=Infinity;
    for(let yy=Math.max(0,y-r); yy<=Math.min(this.h-1,y+r); yy++){
      for(let xx=Math.max(0,x-r); xx<=Math.min(this.w-1,x+r); xx++){
        const b=this.bcells[yy*this.w+xx];
        if(!b) continue;
        for(const bird of b){ if(!bird.alive) continue; const d=(bird.x-x)**2+(bird.y-y)**2; if(d<bd){bd=d;best=bird;} }
      }
    }
    return best;
  }
  at(x,y){ return this.cells[y*this.w+x]; }
  addMouse(m){ if(this.mice.length>=this.maxCapacity) return false; this.mice.push(m); return true; }
  addPredator(p){ if(this.predators.length>=this.predCap) return false; this.predators.push(p); return true; }
  nearestMouse(x,y,r,skipVeg=false){
    let best=null,bd=Infinity;
    for(let yy=Math.max(0,y-r); yy<=Math.min(this.h-1,y+r); yy++){
      for(let xx=Math.max(0,x-r); xx<=Math.min(this.w-1,x+r); xx++){
        if(skipVeg && this.veg[yy*this.w+xx]>0) continue;
        const b=this.cells[yy*this.w+xx];
        if(!b) continue;
        for(const m of b){ if(!m.alive) continue; const d=(m.x-x)**2+(m.y-y)**2; if(d<bd){bd=d;best=m;} }
      }
    }
    return best;
  }
  carveRiver(cx,cy){
    const w=this.w,h=this.h, horizontal=Math.random()<0.5;
    const bed=[];
    let x,y;
    if(horizontal){ x=0; y=rndi(Math.floor(h*0.25),Math.floor(h*0.75)); }
    else { x=rndi(Math.floor(w*0.25),Math.floor(w*0.75)); y=0; }
    const carve=(px,py)=>{
      for(let k=0;k<2;k++){
        const nx=px+(horizontal?0:k), ny=py+(horizontal?k:0);
        if(nx<0||nx>=w||ny<0||ny>=h) continue;
        if(Math.abs(nx-cx)+Math.abs(ny-cy) < this.spawnClear) continue; // ford at centre
        const idx=ny*w+nx;
        if(this.water[idx]===0){ this.water[idx]=1; this.river[idx]=1; bed.push(idx); }
      }
    };
    let steps=0, cap=(horizontal?w:h)*3;
    while(steps++<cap){
      carve(x,y);
      if(horizontal){ x++; y=clamp(y+rndi(-1,1),1,h-2); if(x>=w) break; }
      else { y++; x=clamp(x+rndi(-1,1),1,w-2); if(y>=h) break; }
    }
    this.riverBed=bed;
  }

  walkable(x,y){ return x>=0&&x<this.w&&y>=0&&y<this.h && this.water[y*this.w+x]===0; }
  canEnter(x,y,isPred){
    if(x<0||x>=this.w||y<0||y>=this.h) return false;
    const idx=y*this.w+x;
    if(this.water[idx]) return false;
    if(isPred && this.veg[idx]>0) return false;
    return true;
  }

  recomputeFields(){
    const w=this.w,h=this.h,N=w*h,water=this.water,veg=this.veg;
    const wd=this.waterDist.fill(-1), vd=this.vegDist.fill(-1);
    const wq=[], vq=[];
    this.waterCells.length=0; this.vegCells.length=0;
    for(let idx=0;idx<N;idx++){
      if(water[idx]){ this.waterCells.push(idx); continue; }
      if(veg[idx]>0){ this.vegCells.push(idx); vd[idx]=0; vq.push(idx); }
      const x=idx%w, y=(idx/w)|0;
      let touchesWater=false;
      for(const [dx,dy] of DIRS4){ const nx=x+dx,ny=y+dy; if(nx>=0&&nx<w&&ny>=0&&ny<h&&water[ny*w+nx]){touchesWater=true;break;} }
      if(touchesWater){ wd[idx]=0; wq.push(idx); }
    }
    const bfs=(q,dist)=>{
      let head=0;
      while(head<q.length){
        const idx=q[head++], x=idx%w, y=(idx/w)|0, d=dist[idx];
        for(const [dx,dy] of DIRS4){
          const nx=x+dx,ny=y+dy;
          if(nx<0||nx>=w||ny<0||ny>=h) continue;
          const ni=ny*w+nx;
          if(water[ni] || dist[ni]!==-1) continue;
          dist[ni]=d+1; q.push(ni);
        }
      }
    };
    bfs(wq,wd); bfs(vq,vd);
    this.terrainDirty=false;
  }

  stepToward(a, field, isPred=false){
    const w=this.w, cur=field[a.y*w+a.x];
    if(cur===0) return true;
    let bx=a.x, by=a.y, best=cur<0?Infinity:cur;
    for(const [dx,dy] of DIRS8){
      const nx=a.x+dx, ny=a.y+dy;
      if(!this.canEnter(nx,ny,isPred)) continue;
      const f=field[ny*w+nx];
      if(f>=0 && f<best){ best=f; bx=nx; by=ny; }
    }
    if(bx!==a.x||by!==a.y){ a.x=bx; a.y=by; return true; }
    return false;
  }

  evolveTerrain(){
    const w=this.w,h=this.h,veg=this.veg,water=this.water;
    const seeds=[];
    for(const idx of this.vegCells){
      if(veg[idx]<=0) continue;
      veg[idx]=Math.min(TERR.VEG_MAX, veg[idx]+TERR.VEG_GROW);
      if(veg[idx]>TERR.VEG_MAX*0.6 && Math.random()<TERR.VEG_SPREAD) seeds.push(idx);
    }
    for(const idx of seeds){
      const x=idx%w, y=(idx/w)|0;
      const [dx,dy]=DIRS4[rndi(0,3)];
      const nx=x+dx, ny=y+dy;
      if(nx>=0&&nx<w&&ny>=0&&ny<h){
        const ni=ny*w+nx;
        const predThere=this.pcells[ni]&&this.pcells[ni].length;
        if(!water[ni] && veg[ni]<=0 && !predThere){ veg[ni]=TERR.VEG_MAX*0.3; this.terrainDirty=true; }
      }
    }
    const shore=[];
    for(const idx of this.waterCells){
      if(this.river[idx]) continue;
      const x=idx%w, y=(idx/w)|0;
      for(const [dx,dy] of DIRS4){ const nx=x+dx,ny=y+dy; if(nx>=0&&nx<w&&ny>=0&&ny<h&&!water[ny*w+nx]){ shore.push(idx); break; } }
    }
    let dry=Math.floor(shore.length*TERR.RECEDE_RATE);
    for(let i=0;i<dry;i++){
      const idx=shore[rndi(0,shore.length-1)];
      if(water[idx]){ water[idx]=0; this.terrainDirty=true; }
    }
    if(this.hasRiver && this.riverBed.length){
      this.riverLevel=clamp(this.riverLevel + TERR.RIVER_FLOW - this.riverUse*TERR.RIVER_USE, 0, 1);
      this.riverUse=0;
      const wet=Math.floor(this.riverLevel*this.riverBed.length);
      for(let i=0;i<this.riverBed.length;i++){ water[this.riverBed[i]] = i<wet ? 1 : 0; }
      this.terrainDirty=true;
    }
    this.resolveStuck();
  }

  setInfinite(v){
    this.infinite=v;
    if(v){ this.water.set(this.waterSeed); this.veg.set(this.vegSeed); this.riverLevel=1; this.riverUse=0; }
    this.terrainDirty=true; this.recomputeFields(); this.resolveStuck();
  }
  resolveStuck(){
    const relocate=(a,isPred)=>{
      if(this.canEnter(a.x,a.y,isPred)) return;
      for(const [dx,dy] of DIRS8){ if(this.canEnter(a.x+dx,a.y+dy,isPred)){ a.x+=dx; a.y+=dy; a.px=a.x; a.py=a.y; return; } }
    };
    for(const m of this.mice) relocate(m,false);
    for(const p of this.predators) relocate(p,true);
  }
  nearestPredator(x,y,r){
    let best=null,bd=Infinity;
    for(let yy=Math.max(0,y-r); yy<=Math.min(this.h-1,y+r); yy++){
      for(let xx=Math.max(0,x-r); xx<=Math.min(this.w-1,x+r); xx++){
        const b=this.pcells[yy*this.w+xx];
        if(!b) continue;
        for(const p of b){ if(!p.alive) continue; const d=(p.x-x)**2+(p.y-y)**2; if(d<bd){bd=d;best=p;} }
      }
    }
    return best;
  }
  densityFactor(){ return this.maxCapacity>0?this.mice.length/this.maxCapacity:0; }
  valid(x,y){ return x>=0&&x<this.w&&y>=0&&y<this.h; }

  nearby(x,y,r){
    const out=[];
    for(let yy=Math.max(0,y-r); yy<=Math.min(this.h-1,y+r); yy++){
      for(let xx=Math.max(0,x-r); xx<=Math.min(this.w-1,x+r); xx++){
        const bucket=this.cells[yy*this.w+xx];
        if(!bucket) continue;
        for(const m of bucket) if(m.alive && (m.x!==x||m.y!==y)) out.push(m);
      }
    }
    return out;
  }
  potentialMates(me){
    const out=[];
    for(let yy=Math.max(0,me.y-1); yy<=Math.min(this.h-1,me.y+1); yy++){
      for(let xx=Math.max(0,me.x-1); xx<=Math.min(this.w-1,me.x+1); xx++){
        const bucket=this.cells[yy*this.w+xx];
        if(!bucket) continue;
        for(const o of bucket){
          if(o===me||!o.alive) continue;
          if(o.gender===me.gender) continue;
          if(o.age<CFG.ADULT_AGE) continue;
          if(o.state===STATE.WITHDRAWN||o.state===STATE.BEAUTIFUL) continue;
          out.push(o);
        }
      }
    }
    return out;
  }
  leastCrowdedDir(x,y){
    let min=Infinity,best=null;
    for(const [dx,dy] of DIRS8){
      const nx=x+dx,ny=y+dy;
      if(!this.valid(nx,ny)) continue;
      const bucket=this.cells[ny*this.w+nx];
      const c=bucket?bucket.length:0;
      if(c<min){ min=c; best=[dx,dy]; }
    }
    return best;
  }

  step(){
    this.tick++;
    this.birthsThisTick=0; this.eatenThisTick=0; this.predBirthsThisTick=0;
    this.fishCaughtThisTick=0; this.birdKillsThisTick=0;
    this.buildIndex();
    if(!this.infinite && this.tick % TERR.GROW_INTERVAL===0) this.evolveTerrain();
    if(this.terrainDirty) this.recomputeFields();

    const startCount=this.mice.length;
    const current=this.mice.slice();
    for(const m of current){ if(!(m.alive ? m.update() : false)){ this.deadCount++; } }
    const curP=this.predators.slice();
    for(const p of curP){ if(p.alive) p.update(); }
    if(this.fish.length){ const cf=this.fish.slice(); for(const f of cf){ if(f.alive) f.update(); } }
    if(this.birds.length){ const cb=this.birds.slice(); for(const b of cb){ if(b.alive) b.update(); } }

    this.mice = this.mice.filter(m=>m.alive);
    this.predators = this.predators.filter(p=>p.alive);
    this.fish = this.fish.filter(f=>f.alive);
    this.birds = this.birds.filter(b=>b.alive);
    // Accurate total deaths this tick = starting mice + births − survivors.
    // This counts predation/bird kills, which the per-agent loop misses because
    // hunters run after the prey have already moved.
    this.deathsThisTick=Math.max(0, startCount + this.birthsThisTick - this.mice.length);
    this.totalEaten+=this.eatenThisTick;

    if(this.mice.length>this.peak){ this.peak=this.mice.length; this.peakDay=this.tick; }
    this.predPeak=Math.max(this.predPeak,this.predators.length);

    // record history
    this.history.push(this.mice.length);
    this.predHistory.push(this.predators.length);
    this.fishHistory.push(this.fish.length);
    this.birdHistory.push(this.birds.length);
    this.birthsHistory.push(this.birthsThisTick);
    this.deathsHistory.push(this.deathsThisTick);
    const sc={0:0,1:0,2:0,3:0,4:0};
    for(const m of this.mice) sc[m.state]++;
    this.stateHistory.push(sc);

    this.classifyPhase();
    this.phaseHistory.push(this.phase);

    if(this.mice.length===0 && !this.extinctLogged){
      this.extinctLogged=true;
      this.logEvent("Extinction — the colony is gone", "#e5484d", "extinction");
    }
    if(this.history.length>4000){
      this.history.shift(); this.predHistory.shift(); this.fishHistory.shift();
      this.birdHistory.shift(); this.stateHistory.shift();
      this.birthsHistory.shift(); this.deathsHistory.shift(); this.phaseHistory.shift();
    }
  }

  // Reworked phase classifier — reacts to the actual trajectory rather than a
  // single density threshold, so the label is analytical instead of ornamental.
  classifyPhase(){
    const pop=this.mice.length;
    const d=this.densityFactor();
    const h=this.history, n=h.length;
    const past = n>=31 ? h[n-31] : (n? h[0] : pop);
    let ph=this.phase;

    // share of the colony in a stressed/dysfunctional state
    let dys=0;
    for(const m of this.mice){ const s=m.state; if(s===STATE.WITHDRAWN||s===STATE.BEAUTIFUL||s===STATE.AGGRESSIVE) dys++; }
    const dysFrac = pop? dys/pop : 0;
    const established = this.peak >= Math.max(2*this.startPop, 16);

    // --- decline / aftermath, once a real peak has formed ---
    if(established && ph>=2){
      if(pop <= Math.max(2, this.startPop*0.5)) ph=5;
      else if(pop < this.peak*0.7 && pop<past)  ph=Math.max(ph,4);
    }
    if(ph>=4){
      if(pop <= Math.max(2, this.startPop*0.5)) ph=5;
      this.setPhase(ph); return;
    }

    // --- growth side latches upward through Social fracture ---
    let target=0;
    if(d>=0.5 || dysFrac>=0.30)      target=3; // social fracture
    else if(d>=0.28 || dysFrac>=0.12) target=2; // saturation
    else if(d>=0.10 || pop>past*1.05) target=1; // expansion
    else                              target=0; // exploration
    if(target>ph) ph=target;
    this.setPhase(ph);
  }

  setPhase(ph){
    if(ph===this.phase) return;
    this.phase=ph;
    const p=PHASES[ph];
    let label = "Phase → "+p.name;
    if(ph===4) label = "Decline began — peak was "+this.peak+" mice (day "+this.peakDay+")";
    if(ph===5) label = "Aftermath — the colony is spent";
    this.logEvent(label, PHASE_DOT[ph], "phase");
  }

  // Add an event to the log (used for phase changes and player interventions).
  logEvent(label, color, type){
    const last=this.events[this.events.length-1];
    if(last && last.day===this.tick && last.label===label) return; // de-dupe
    this.events.push({day:this.tick, label, color:color||"#8b95a7", type:type||"info"});
    if(this.events.length>250) this.events.shift();
  }

  // Occupancy = mice per habitable (non-water) cell — the interpretable density.
  occupancy(){
    const hab=this.w*this.h - this.waterCells.length;
    return { habitable:hab, pct: hab>0 ? this.mice.length/hab : 0 };
  }
  // Trailing average of a per-tick series (e.g. births) over the last `n` ticks.
  avgRate(arr,n=30){
    if(!arr.length) return 0;
    const k=Math.min(n,arr.length);
    let s=0; for(let i=arr.length-k;i<arr.length;i++) s+=arr[i];
    return s/k;
  }
  // Absolute day for a given index into the (trimmed) history arrays.
  dayAt(i){ return this.tick - (this.history.length-1) + i; }

  stats(){
    const sc={0:0,1:0,2:0,3:0,4:0};
    for(const m of this.mice) sc[m.state]++;
    return {pop:this.mice.length, density:this.densityFactor(), states:sc,
      beautiful:sc[4], peak:this.peak, tick:this.tick, phase:this.phase,
      births:this.birthsThisTick, deaths:this.deathsThisTick,
      predators:this.predators.length, eaten:this.eatenThisTick,
      predPeak:this.predPeak, predBirths:this.predBirthsThisTick,
      fish:this.fish.length, birds:this.birds.length,
      fishCaught:this.fishCaughtThisTick, birdKills:this.birdKillsThisTick};
  }
}
