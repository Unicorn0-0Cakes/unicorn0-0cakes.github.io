"use strict";
/* =====================================================================
   agents.js — the four creatures: Mouse, Predator (cat), Fish, Bird.
   Depends on config.js. Consumed by simulation.js.
   ===================================================================== */

function inherit(t1,t2){
  return clamp((t1+t2)/2 + rnd(-10,10), 0, 100);
}

class Mouse {
  constructor(x,y,sim,p1,p2){
    this.x=x; this.y=y; this.sim=sim;
    this.age=0; this.alive=true;
    this.gender=Math.random()<0.5?"male":"female";
    this.hunger=0; this.thirst=0; this.energy=100; this.drive=0;
    if(p1&&p2){
      this.aggression=inherit(p1.aggression,p2.aggression);
      this.sociability=inherit(p1.sociability,p2.sociability);
      this.parenting=inherit(p1.parenting,p2.parenting);
      this.grooming=inherit(p1.grooming,p2.grooming);
    } else {
      this.aggression=rndi(20,40);
      this.sociability=rndi(60,80);
      this.parenting=rndi(60,80);
      this.grooming=rndi(40,60);
    }
    this.state=STATE.NORMAL;
    this.health=100;
    this.pregTimer=0; this.pregnant=false; this.mate=null;
    this.childrenCount=0;
    // render interpolation
    this.px=x; this.py=y;
  }

  update(){
    if(!this.alive) return false;
    this.age++;
    this.hunger=Math.min(100,this.hunger+CFG.HUNGER_RATE);
    this.thirst=Math.min(100,this.thirst+CFG.THIRST_RATE);
    this.energy=Math.max(0,this.energy-CFG.ENERGY_RATE);

    // Weaken-then-die: sustained hunger or thirst drains health; recover when
    // fed and watered. Death comes from health hitting zero, not instantly.
    if(this.hunger>=CFG.DEPRIVE || this.thirst>=CFG.DEPRIVE){
      this.health-=CFG.DEPRIVE_DMG;
    } else if(this.hunger<60 && this.thirst<60 && this.health<100){
      this.health=Math.min(100,this.health+CFG.RECOVER);
    }

    // Sink-born mice (raised amid the breakdown) barely reproduce — the
    // "Beautiful Ones" that doomed Universe 25. A trickle of fertility keeps
    // the decline gradual rather than instant.
    const fert = this.sinkBorn?0.12:1;
    if(this.age>=CFG.ADULT_AGE){
      if(this.gender==="female"&&!this.pregnant) this.drive=Math.min(100,this.drive+1.4*fert);
      else if(this.gender==="male") this.drive=Math.min(100,this.drive+1.8*fert);
    }
    if(this.age>=CFG.MAX_AGE || this.health<=0){
      this.alive=false; return false;
    }
    if(this.pregnant){
      this.pregTimer++;
      if(this.pregTimer>=CFG.PREG_DURATION) this.giveBirth();
    }
    this.updateMental();
    this.act();
    return true;
  }

  updateMental(){
    const d=this.sim.densityFactor();
    let target;
    if(d<0.3){ target=STATE.NORMAL; }
    else if(d<0.6){ target=Math.random()<0.3?STATE.STRESSED:STATE.NORMAL; }
    else if(d<0.8){
      if(this.sociability>70) target=STATE.STRESSED;
      else if(this.grooming>70) target=STATE.WITHDRAWN;
      else if(this.aggression>70) target=STATE.AGGRESSIVE;
      else target=STATE.STRESSED;
    } else {
      if(this.grooming>60) target=Math.random()<0.4?STATE.BEAUTIFUL:STATE.WITHDRAWN;
      else if(this.aggression>50) target=STATE.AGGRESSIVE;
      else target=STATE.WITHDRAWN;
    }
    // Hunger/thirst show as visible stress.
    if(this.hunger>80 || this.thirst>80) target=STATE.STRESSED;
    if(this.state!==target && Math.random()<0.1){
      this.state=target;
      if(target===STATE.BEAUTIFUL) this.grooming=Math.min(100,this.grooming+10);
    }
  }

  act(){
    // Survival first: flee the nearest threat (cat on the ground or bird from above).
    let threat=null;
    if(this.sim.predators.length) threat=this.sim.nearestPredator(this.x,this.y,PRED.FLEE);
    if(!threat && this.sim.birds.length) threat=this.sim.nearestBird(this.x,this.y,BIRD.FLEE);
    if(threat){ this.fleeFrom(threat); return; }
    // Thirst and hunger send the mouse to water / vegetation (survival need).
    if(this.thirst>CFG.SEEK_THIRST){ this.seekWater(); return; }
    if(this.hunger>CFG.SEEK_HUNGER){ this.seekFood(); return; }
    if(this.energy<30){ this.energy=Math.min(100,this.energy+20); return; }
    if(this.drive>70 && this.age>=CFG.ADULT_AGE &&
       this.state!==STATE.WITHDRAWN && this.state!==STATE.BEAUTIFUL){
      this.seekMate(); return;
    }
    switch(this.state){
      case STATE.NORMAL: Math.random()<0.3?this.socialize():this.moveRandom(); break;
      case STATE.STRESSED: Math.random()<0.5?this.moveRandom():this.hide(); break;
      case STATE.AGGRESSIVE: this.attack(); break;
      case STATE.WITHDRAWN: this.hide(); break;
      case STATE.BEAUTIFUL:
        this.health=Math.min(100,this.health+0.2);
        if(Math.random()<0.2) this.moveRandom();
        break;
    }
  }

  seekMate(){
    const d=this.sim.densityFactor();
    if(d>0.7 && Math.random()<0.7){ this.moveRandom(); return; }
    const mates=this.sim.potentialMates(this);
    if(mates.length){
      const m=mates[rndi(0,mates.length-1)];
      this.drive=0; m.drive=0;
      const f=this.gender==="female"?this:(m.gender==="female"?m:null);
      const mm=f===this?m:this;
      if(f){ f.pregnant=true; f.pregTimer=0; f.mate=mm; }
    } else this.moveRandom();
  }

  giveBirth(){
    this.pregnant=false; this.pregTimer=0;
    const d=this.sim.densityFactor();
    let litter = d<0.3?4 : d<0.6?3 : 2;
    if(this.parenting<30) litter=Math.max(1,litter-1);
    for(let i=0;i<litter;i++){
      if(this.sim.densityFactor()>0.9 && Math.random()<0.7) continue;
      const baby=new Mouse(this.x,this.y,this.sim,this,this.mate||this);
      // "Born into the behavioral sink": pups raised amid the breakdown never
      // develop normal social/parenting behavior. This is the ratchet that
      // drives Universe 25 to extinction even after crowding eases. Tied to the
      // Social-fracture phase (index 3) in the reworked phase model.
      if(this.sim.phase>=3){
        baby.sociability=clamp(baby.sociability*0.35,0,100);
        baby.parenting  =clamp(baby.parenting*0.35,0,100);
        baby.grooming   =clamp(baby.grooming+35,0,100);
        baby.aggression =clamp(baby.aggression*0.6,0,100);
        baby.sinkBorn=true;
      }
      if(this.sim.addMouse(baby)){
        this.childrenCount++;
        this.sim.birthsThisTick++;
        if(this.parenting<30 && Math.random()<0.5) baby.health-=20;
      }
    }
  }

  socialize(){
    const near=this.sim.nearby(this.x,this.y,1);
    if(near.length){
      const o=near[rndi(0,near.length-1)];
      this.sociability=Math.min(100,this.sociability+0.1);
      this.moveToward(o.x,o.y);
    } else this.moveRandom();
  }
  hide(){
    const dir=this.sim.leastCrowdedDir(this.x,this.y);
    if(dir) this.moveTo(this.x+dir[0],this.y+dir[1]);
  }
  attack(){
    const near=this.sim.nearby(this.x,this.y,1);
    if(near.length){
      const t=near[rndi(0,near.length-1)];
      t.health=Math.max(0,t.health-this.aggression*0.2);
      this.moveToward(t.x,t.y);
    } else this.moveRandom();
  }
  fleeFrom(pred){
    // In a crush, escape often fails — overcrowding makes prey easy targets,
    // linking predation to the density-collapse theme.
    if(Math.random() < this.sim.densityFactor()*0.5) return; // panic freeze
    const dx=this.x<pred.x?-1:this.x>pred.x?1:0;
    const dy=this.y<pred.y?-1:this.y>pred.y?1:0;
    if(!this.tryStep(dx,dy)) this.moveRandom();
  }
  seekWater(){
    const sim=this.sim, idx=this.y*sim.w+this.x;
    if(sim.waterDist[idx]===0){ this.thirst=Math.max(0,this.thirst-TERR.DRINK_GAIN); sim.riverUse++; return; }
    if(!sim.stepToward(this,sim.waterDist)) this.moveRandom();
  }
  seekFood(){
    const sim=this.sim, idx=this.y*sim.w+this.x;
    if(sim.veg[idx]>0){
      this.hunger=Math.max(0,this.hunger-TERR.EAT_GAIN);
      if(!sim.infinite){ sim.veg[idx]-=TERR.VEG_EAT; if(sim.veg[idx]<=0){ sim.veg[idx]=0; sim.terrainDirty=true; } }
      return;
    }
    if(!sim.stepToward(this,sim.vegDist)) this.moveRandom();
  }
  tryStep(dx,dy){
    if(!dx&&!dy) return false;
    const nx=this.x+dx, ny=this.y+dy;
    if(this.sim.walkable(nx,ny)){ this.x=nx; this.y=ny; return true; }
    return false;
  }
  moveRandom(){ for(let i=0;i<4;i++){ if(this.tryStep(rndi(-1,1),rndi(-1,1))) return; } }
  moveToward(tx,ty){
    const dx=this.x<tx?1:this.x>tx?-1:0, dy=this.y<ty?1:this.y>ty?-1:0;
    if(this.tryStep(dx,dy)) return;
    if(dx&&this.tryStep(dx,0)) return;
    if(dy&&this.tryStep(0,dy)) return;
    this.moveRandom();
  }
  moveTo(nx,ny){
    if(this.sim.walkable(nx,ny)){ this.x=nx; this.y=ny; }
  }
}

// ===================== PREDATOR (cat) =====================
class Predator {
  constructor(x,y,sim){
    this.x=x; this.y=y; this.sim=sim;
    this.age=0; this.alive=true;
    this.gender=Math.random()<0.5?"male":"female"; // flavor / inspector
    this.reserve=PRED.START_RESERVE;               // food energy (from eating mice)
    this.thirst=0;                                  // must drink at water stations
    this.kills=0; this.breedCool=0;
    this.px=x; this.py=y;                            // render interpolation
  }
  update(){
    if(!this.alive) return false;
    this.age++;
    // Dormant until the colony is established — predators "arrive" once there
    // is a real population to hunt, so the founding cluster isn't wiped out.
    if(this.sim.mice.length < PRED.ACTIVATE){ this.moveRandom(); return true; }
    this.reserve-=PRED.METAB;
    this.thirst=Math.min(100,this.thirst+PRED.THIRST);
    if(this.thirst>=PRED.DEPRIVE) this.reserve-=PRED.DEHYDRATE; // dehydration weakens
    if(this.breedCool>0) this.breedCool--;
    // Death by starvation, dehydration, or old age.
    if(this.age>=PRED.MAX_AGE || this.reserve<=0 || this.thirst>=100){ this.alive=false; return false; }

    // Thirst takes priority — break off the hunt to drink at the water's edge.
    if(this.thirst>PRED.SEEK_THIRST){
      const idx=this.y*this.sim.w+this.x;
      if(this.sim.waterDist[idx]===0){ this.thirst=Math.max(0,this.thirst-60); this.sim.riverUse++; this.tryFish(); }
      else { if(!this.sim.stepToward(this,this.sim.waterDist,true)) this.moveRandom(); return true; }
    }

    // Hunt: target the nearest mouse in the OPEN (grass hides prey), pounce if
    // adjacent, else chase. A mouse that slips into vegetation is safe.
    const prey=this.sim.nearestMouse(this.x,this.y,PRED.VISION,true);
    if(prey){
      const preyInGrass=this.sim.veg[prey.y*this.sim.w+prey.x]>0;
      if(!preyInGrass && Math.abs(prey.x-this.x)<=1 && Math.abs(prey.y-this.y)<=1){
        prey.alive=false;
        this.reserve=Math.min(130,this.reserve+PRED.FOOD);
        this.kills++; this.sim.eatenThisTick++;
        this.moveTo(prey.x,prey.y);
      } else {
        this.moveToward(prey.x,prey.y);
      }
    } else if(this.sim.hasFish && this.reserve<75){
      // no mice in the open — go fishing at the water's edge
      const idx=this.y*this.sim.w+this.x;
      if(this.sim.waterDist[idx]===0) this.tryFish();
      else if(!this.sim.stepToward(this,this.sim.waterDist,true)) this.moveRandom();
    } else {
      this.moveRandom();
    }

    // Breed when well-fed (predator growth tracks food supply).
    if(this.reserve>=PRED.BREED_RESERVE && this.age>=PRED.ADULT_AGE && this.breedCool===0){
      const pup=new Predator(this.x,this.y,this.sim);
      if(this.sim.addPredator(pup)){
        this.reserve-=PRED.BREED_COST;
        this.breedCool=PRED.BREED_COOL;
        this.sim.predBirthsThisTick++;
      }
    }
    return true;
  }
  tryStep(dx,dy){
    if(!dx&&!dy) return false;
    const nx=this.x+dx, ny=this.y+dy;
    if(this.sim.canEnter(nx,ny,true)){ this.x=nx; this.y=ny; return true; } // predators avoid grass
    return false;
  }
  moveRandom(){ for(let i=0;i<4;i++){ if(this.tryStep(rndi(-1,1),rndi(-1,1))) return; } }
  moveToward(tx,ty){
    const dx=this.x<tx?1:this.x>tx?-1:0, dy=this.y<ty?1:this.y>ty?-1:0;
    if(this.tryStep(dx,dy)) return;
    if(dx&&this.tryStep(dx,0)) return;
    if(dy&&this.tryStep(0,dy)) return;
    this.moveRandom();
  }
  moveTo(nx,ny){ if(this.sim.canEnter(nx,ny,true)){ this.x=nx; this.y=ny; } }
  // opportunistically snatch a fish from an adjacent water cell
  tryFish(){
    if(!this.sim.hasFish) return false;
    for(const [dx,dy] of DIRS8){
      const nx=this.x+dx, ny=this.y+dy;
      if(!this.sim.isWater(nx,ny)) continue;
      const b=this.sim.fcells[ny*this.sim.w+nx];
      if(b && b.length && Math.random()<FISH.CATCH_CHANCE){ const f=b.pop(); f.alive=false; this.sim.fishCount[ny*this.sim.w+nx]--; this.reserve=Math.min(130,this.reserve+FISH.CAT_GAIN); this.sim.fishCaughtThisTick++; return true; }
    }
    return false;
  }
}

// ===================== FISH (live only in water) =====================
class Fish {
  constructor(x,y,sim){ this.x=x; this.y=y; this.sim=sim; this.age=0; this.alive=true; this.breedCool=0; this.px=x; this.py=y; }
  update(){
    if(!this.alive) return false;
    this.age++;
    if(this.breedCool>0) this.breedCool--;
    const w=this.sim.w;
    // stranded, old age, or steady natural mortality (keeps births/deaths in flux)
    if(!this.sim.isWater(this.x,this.y) || this.age>=FISH.MAX_AGE || (this.age>=FISH.ADULT && Math.random()<FISH.DEATH)){
      this.sim.fishCount[this.y*w+this.x]--; this.alive=false; return false;
    }
    // swim toward the least-crowded neighbouring water so schools spread out
    const spot=this.sim.leastCrowdedWater(this.x,this.y);
    if(spot && (spot[0]!==this.x || spot[1]!==this.y)){
      this.sim.fishCount[this.y*w+this.x]--;
      this.x=spot[0]; this.y=spot[1];
      this.sim.fishCount[this.y*w+this.x]++;
    }
    // Logistic breeding: the closer to carrying capacity, the less likely to
    // breed — so the population eases toward an equilibrium and oscillates
    // around it instead of pinning flat at a hard cap.
    const room=1-this.sim.fish.length/this.sim.fishCap;
    if(this.age>=FISH.ADULT && this.breedCool===0 && room>0 && Math.random()<FISH.BREED_CHANCE*room){
      const s2=this.sim.openWaterCell(this.x,this.y);
      if(s2){ this.sim.fish.push(new Fish(s2[0],s2[1],this.sim)); this.sim.fishCount[s2[1]*w+s2[0]]++; this.breedCool=FISH.BREED_COOL; }
    }
    return true;
  }
}

// ===================== BIRD (nests in grass, hunts mice & cats) =====================
class Bird {
  constructor(x,y,sim){
    this.x=x; this.y=y; this.sim=sim; this.age=0; this.alive=true;
    this.gender=Math.random()<0.5?"male":"female";
    this.reserve=BIRD.START_RESERVE; this.breedCool=0; this.kills=0; this.px=x; this.py=y;
  }
  update(){
    if(!this.alive) return false;
    this.age++;
    // Circle in the grass until the colony has established, so a handful of
    // founders isn't wiped out before it can grow.
    if(this.sim.mice.length < BIRD.ACTIVATE){ this.stayInVeg(); return true; }
    this.reserve-=BIRD.METAB;
    if(this.breedCool>0) this.breedCool--;
    if(this.age>=BIRD.MAX_AGE || this.reserve<=0){ this.alive=false; return false; }
    // snatch a fish if one is in the water right beside the bird
    if(this.sim.hasFish) this.tryFishBird();
    // hunt only mice — and only leave the vegetation to chase one that's close.
    const mouse=this.sim.nearestMouse(this.x,this.y,BIRD.VISION,false);
    if(mouse){
      if(Math.abs(mouse.x-this.x)<=1 && Math.abs(mouse.y-this.y)<=1){
        mouse.alive=false; this.reserve=Math.min(120,this.reserve+BIRD.FOOD_MOUSE);
        this.kills++; this.sim.birdKillsThisTick++;
        this.flyTo(mouse.x,mouse.y);
      } else {
        // swoop: birds are fast in the air, moving two cells to run down fleeing prey
        this.flyToward(mouse.x,mouse.y);
        if(!(Math.abs(mouse.x-this.x)<=1 && Math.abs(mouse.y-this.y)<=1)) this.flyToward(mouse.x,mouse.y);
      }
    } else {
      this.stayInVeg(); // no prey in range → remain in the vegetation
    }
    // nest & breed in the vegetation (logistic: tapers off near the ceiling)
    if(this.reserve>=BIRD.BREED_RESERVE && this.age>=BIRD.ADULT && this.breedCool===0
       && Math.random()<(1-this.sim.birds.length/this.sim.birdCap)){
      this.sim.birds.push(new Bird(this.x,this.y,this.sim));
      this.reserve-=BIRD.BREED_COST; this.breedCool=BIRD.BREED_COOL;
    }
    return true;
  }
  tryFishBird(){
    for(const [dx,dy] of DIRS8){
      const nx=this.x+dx, ny=this.y+dy;
      if(!this.sim.isWater(nx,ny)) continue;
      const b=this.sim.fcells[ny*this.sim.w+nx];
      if(b && b.length && Math.random()<FISH.CATCH_CHANCE){
        const f=b.pop(); f.alive=false; this.sim.fishCount[ny*this.sim.w+nx]--;
        this.reserve=Math.min(120,this.reserve+BIRD.FISH_GAIN);
        this.sim.fishCaughtThisTick++; return;
      }
    }
  }
  // birds fly — ignore water/grass, only bounded by the world edge
  flyTo(x,y){ if(this.sim.valid(x,y)){ this.x=x; this.y=y; } }
  flyToward(tx,ty){ const dx=this.x<tx?1:this.x>tx?-1:0, dy=this.y<ty?1:this.y>ty?-1:0; this.flyTo(this.x+dx,this.y+dy); }
  // stay within vegetation; if outside it, head back. Birds only leave the
  // grass while actively chasing a mouse (handled above).
  stayInVeg(){
    const w=this.sim.w;
    if(this.sim.veg[this.y*w+this.x]>0){
      const opts=[];
      for(const [dx,dy] of DIRS8){ const nx=this.x+dx,ny=this.y+dy; if(this.sim.valid(nx,ny)&&this.sim.veg[ny*w+nx]>0) opts.push([nx,ny]); }
      if(opts.length && Math.random()<0.6){ const [nx,ny]=opts[rndi(0,opts.length-1)]; this.x=nx; this.y=ny; }
      return;
    }
    // return toward the nearest vegetation via the veg distance field
    const cur=this.sim.vegDist[this.y*w+this.x];
    if(cur>0){
      let bx=this.x,by=this.y,best=cur;
      for(const [dx,dy] of DIRS8){ const nx=this.x+dx,ny=this.y+dy; if(!this.sim.valid(nx,ny))continue; const f=this.sim.vegDist[ny*w+nx]; if(f>=0&&f<best){best=f;bx=nx;by=ny;} }
      this.x=bx; this.y=by;
    }
  }
}
