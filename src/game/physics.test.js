import { test } from 'node:test'
import * as physicsCurve from './physics.js'
import assert from 'node:assert/strict'
import { galasNear, nitrosNear, nitroKey, NOS_MAX, vehicleWidth, newWorld, resolveContact, stepWorld, beginPursuit, updateArrest, startRace, racePosition, updateGearbox, raiseWanted, policeUnits, jamAt, potholeAt, vehicleInfo, TIER_VALUE, vehicleLength, CAR_LENGTH, ROAD_SCALE, RACE_DISTANCE, newRace, rushResults, RIVALS, RECKLESS_LIMIT, COUNTDOWN, START_LINE, LAPS, LAP_LENGTH, CHECKPOINT_SPEED, hitDamage } from './physics.js'
const settings={maxSpeed:190,acceleration:30,handling:1}
test('solid impact, separation, reverse and second hit start the pursuit',()=>{
  const g=newWorld();g.traffic=[{id:'npc0',x:0,z:40,speed:0,cruise:0,hold:1e6}];g.z=35;g.speed=40
  stepWorld(g,{w:true},.05,settings)
  assert.ok(g.z<=40-CAR_LENGTH);assert.ok(g.speed<=0,'player bounces back off the car');assert.equal(g.contacts.npc0.count,1);assert.equal(g.heat,0);assert.equal(g.race,null)
  for(let i=0;i<80;i++)stepWorld(g,{w:true},.05,settings)
  assert.equal(g.contacts.npc0.count,1);assert.equal(g.race,null)
  for(let i=0;i<40;i++)stepWorld(g,{s:true},.05,settings)
  assert.ok(g.speed<0);assert.ok(g.z<33);assert.equal(g.contacts.npc0.armed,true)
  for(let i=0;i<140&&!g.race;i++)stepWorld(g,{w:true},.05,settings)
  assert.equal(g.contacts.npc0.count,2);assert.ok(g.race);assert.ok(g.heat>0)
})
test('swept impact cannot tunnel through a car at maximum speed',()=>{
  const g=newWorld(),v={id:'npc9',z:40,x:0,speed:0};g.z=49;g.speed=355
  assert.equal(resolveContact(g,v,30),true);assert.ok(g.z<40-CAR_LENGTH);assert.ok(g.speed<=0)
})
test('adjacent lanes do not collide and brakes do not engage reverse',()=>{
  const g=newWorld();g.z=40;g.x=.7;g.speed=100
  assert.equal(resolveContact(g,{id:'npc9',z:40,x:0,speed:0},38),false)
  g.traffic=[];for(let i=0;i<100;i++)stepWorld(g,{' ':true},.05,settings)
  assert.equal(g.speed,0)
})
test('danfo requires a second separated impact',()=>{
  const g=newWorld(),v={id:'npc1',x:0,z:40,speed:0,cruise:0,hold:1e6,danfo:true};g.traffic=[v];g.z=34.6;g.speed=30
  stepWorld(g,{w:true},.05,settings);assert.equal(g.race,null)
  g.z=30;g.speed=0;stepWorld(g,{},.05,settings)
  g.z=34.6;g.speed=30;stepWorld(g,{w:true},.05,settings)
  assert.equal(g.race.label,'DANFO ROAD RAGE');assert.ok(g.heat>0)
})

const overlapping=(a,b)=>Math.abs(a.x-b.x)*ROAD_SCALE<1.7&&Math.abs(a.z-b.z)<(vehicleLength(a)+vehicleLength(b))/2-.05
test('police steers independently of the player',()=>{
  const g=newWorld();g.traffic=[];g.speed=80;beginPursuit(g);g.heat=35
  const startX=g.police.x
  for(let i=0;i<10;i++)stepWorld(g,{w:true,a:true},.05,settings)
  assert.ok(g.x<0);assert.ok(g.police.x>=startX-.25,'police should not copy the player steering left')
})
test('police reaching a slow driver is an arrest; driving off drains the meter',()=>{
  const g=newWorld();g.traffic=[];g.speed=0;beginPursuit(g);g.heat=35
  let meter=0
  for(let i=0;i<20*30&&!g.arrested;i++){stepWorld(g,{},1/30,settings);meter=Math.max(meter,g.arrestMeter||0)}
  assert.ok(meter>0);assert.equal(g.arrested,true);assert.ok(g.police.officer,'officer at the door')
  const h=newWorld();h.traffic=[];h.speed=20;beginPursuit(h);h.heat=35;h.police.z=h.z-6;h.police.x=h.x+.4;h.police.speed=20;h.police.decision=1e9
  for(let i=0;i<20;i++)stepWorld(h,{},1/30,settings)
  assert.ok(h.arrestMeter>0);for(let i=0;i<120;i++)stepWorld(h,{w:true},1/30,{...settings,acceleration:80})
  assert.equal(h.arrested,false);assert.ok(h.arrestMeter<.5,'speeding away drains the meter')
})
test('police ram bleeds the player speed',()=>{
  const g=newWorld();g.traffic=[];g.speed=100;beginPursuit(g);g.heat=35;g.police.x=g.x;g.police.targetX=g.x;g.police.z=g.z-5.2;g.police.speed=160;g.police.decision=99
  stepWorld(g,{w:true},.05,settings);assert.ok(g.speed<90)
})
test('traffic never drives through the police van or a stopped player',()=>{
  const g=newWorld();g.speed=0;g.x=0
  g.traffic=[{id:'npc1',kind:'car',x:0,tx:0,z:-20,speed:70,cruise:70,hold:0},{id:'npc2',kind:'danfo',danfo:true,x:.55,tx:.55,z:-30,speed:80,cruise:80,hold:0}]
  beginPursuit(g);g.heat=35;g.police.x=.55;g.police.z=g.z-8;g.police.speed=0;g.police.decision=1e9
  for(let i=0;i<200;i++){stepWorld(g,{},.05,settings);for(const v of g.traffic){assert.ok(!overlapping(v,g),'traffic overlapped player');if(g.police)assert.ok(!overlapping(v,g.police),'traffic overlapped police')}}
})
test('a crash shoves the other vehicle, damages both and reports the impact',()=>{
  const g=newWorld();g.traffic=[{id:'npc3',kind:'danfo',danfo:true,x:0,tx:0,z:40,speed:0,cruise:50,hold:0}];g.z=34;g.speed=90
  stepWorld(g,{w:true},.05,settings)
  const crash=g.events.find(e=>e.type==='crash');assert.ok(crash);assert.equal(crash.kind,'danfo');assert.ok(crash.impact>50)
  assert.ok(g.traffic[0].speed>0,'danfo is shoved forward');assert.ok(g.damage>0);assert.ok(g.dmg.front>0);assert.ok(g.traffic[0].dmg.rear>0)
})
test('side-swiping a car scrapes paint off both',()=>{
  const g=newWorld();g.traffic=[{id:'npc4',kind:'car',x:.3,tx:.3,z:30,speed:40,cruise:40,hold:0}];g.z=30;g.speed=90;g.x=0
  for(let i=0;i<4;i++)stepWorld(g,{w:true,d:true},.05,settings)
  assert.ok(g.events.some(e=>e.type==='scrape'));assert.ok(g.dmg.right>0)
})
test('races finish at the line: overtaking the rival wins',()=>{
  const g=newWorld(),v={id:'npc5',kind:'car',x:.55,tx:.55,z:60,speed:100,cruise:100,hold:0};g.traffic=[v];g.speed=200
  startRace(g,v,settings,'STREET RACE');assert.equal(g.race.finish,g.z+RACE_DISTANCE);v.z=g.z-300
  for(let i=0;i<800&&g.race;i++){stepWorld(g,{w:true},.05,{...settings,maxSpeed:400});if(g.police)g.police.z=g.z-150}
  const end=g.events.find(e=>e.type==='raceEnd');assert.ok(end);assert.equal(end.won,true)
})
test('nearby drivers join the race and finishing places are scored',()=>{
  const g=newWorld(),main={id:'npc1',kind:'danfo',danfo:true,x:0,tx:0,z:45,speed:60,cruise:60,hold:0}
  g.traffic=[main,{id:'npc2',kind:'car',x:.55,tx:.55,z:80,speed:60,cruise:60,hold:0},{id:'npc3',kind:'taxi',x:-.55,tx:-.55,z:20,speed:60,cruise:60,hold:0},{id:'npc4',kind:'okada',x:.86,tx:.86,z:50,speed:60,cruise:60,hold:0}]
  startRace(g,main,settings,'DANFO ROAD RAGE')
  assert.deepEqual(g.race.rivals.sort(),['npc1','npc2','npc3']);assert.equal(racePosition(g).of,4)
  // Rivals all cross the line first: you finish 4th.
  for(const v of g.traffic)v.z=g.race.finish+1
  stepWorld(g,{},.05,settings);const end=g.events.find(e=>e.type==='raceEnd');assert.equal(end.place,4);assert.equal(end.won,false)
})
test('a racer just ahead slams the door in your lane',()=>{
  const g=newWorld(),v={id:'npc1',kind:'car',x:.55,tx:.55,z:45,speed:140,cruise:140,hold:0};g.traffic=[v];g.z=30;g.speed=150;g.x=0
  startRace(g,v,settings,'STREET RACE');g.police=null;g.heat=0
  for(let i=0;i<20;i++){stepWorld(g,{w:true},.05,settings);g.police=null;g.heat=0}
  assert.ok(Math.abs(v.x-g.x)<.25,`racer should block, x=${v.x}`)
})
test('gearbox shifts up through the gears and limits revs',()=>{
  const g={speed:0,time:0};let top=0,shifts=0
  for(let i=0;i<400;i++){g.time+=.05;g.speed=Math.min(250,g.speed+3);updateGearbox(g,true,.05,{idle:800,redline:6200});top=Math.max(top,g.rpm);if(g.shifted>0)shifts++}
  assert.ok(shifts>=4);assert.ok(top<=6200);assert.ok(g.gear>=5)
})
test('one police car per star: two stars bring backup, three stars bring two',()=>{
  const g=newWorld();g.traffic=[];g.speed=120;beginPursuit(g);g.heat=35
  assert.equal(policeUnits(g).length,1)
  raiseWanted(g,2);assert.equal(policeUnits(g).length,2)
  raiseWanted(g,3);assert.equal(policeUnits(g).length,3);assert.equal(new Set(policeUnits(g).map(u=>u.id)).size,3)
  raiseWanted(g,5);assert.equal(policeUnits(g).length,3,'never more than three')
  // Stars also rise over time on their own.
  const h=newWorld();h.traffic=[];h.speed=150;beginPursuit(h);h.heat=35
  for(let i=0;i<25*20;i++){stepWorld(h,{w:true},.05,{...settings,maxSpeed:400});if(!h.police)break}
  assert.ok(!h.police||policeUnits(h).length===h.wanted)
})
test('escaping means losing every unit, and clears the backup',()=>{
  const g=newWorld();g.traffic=[];g.speed=0;beginPursuit(g);g.heat=35;raiseWanted(g,3)
  for(const u of policeUnits(g))u.z=g.z-400
  g.police.z=g.z-400;g.backup[0].z=g.z-60
  for(let i=0;i<10;i++){updateArrest(g,1);g.backup[0]&&(g.backup[0].z=g.z-60)}
  assert.ok(g.police,'one unit is still close, no escape')
  g.backup[0].z=g.z-400;for(let i=0;i<8;i++)updateArrest(g,1)
  assert.equal(g.police,null);assert.deepEqual(g.backup,[])
})
test('hitting a danfo starts road rage: it chases you down and honks',()=>{
  const g=newWorld(),v={id:'npc1',kind:'danfo',danfo:true,x:0,tx:0,z:40,speed:30,cruise:50,hold:0};g.traffic=[v];g.z=34.9;g.speed=80
  stepWorld(g,{w:true},.05,settings)
  assert.ok(g.events.some(e=>e.type==='rage'&&e.id==='npc1'));assert.ok(v.rage)
  // You get away; the danfo comes after you.
  g.x=.55;g.z=v.z+30;g.speed=60;for(let i=0;i<200;i++)stepWorld(g,{},.05,settings)
  assert.ok(g.z-v.z<15,`raging danfo closes the gap and tailgates, gap=${(g.z-v.z).toFixed(1)}`);assert.ok(g.events.some(e=>e.type==='rageHonk'))
})
test('traffic that crashes into traffic stops and reports it',()=>{
  const g=newWorld();g.z=-500;g.speed=0
  g.traffic=[{id:'npc1',kind:'car',x:0,tx:0,z:100,speed:0,cruise:0,hold:1e6},{id:'npc2',kind:'danfo',danfo:true,x:0,tx:0,z:94.5,speed:60,cruise:60,hold:0,laneTimer:1e9}]
  stepWorld(g,{},.05,settings)
  const e=g.events.find(e=>e.type==='npcCrash');assert.ok(e);assert.ok(g.traffic[1].hold>g.time)
})
test('go-slow zones exist and traffic crawls through them',()=>{
  let z=0;while(!jamAt(z)&&z<20000)z+=50
  assert.ok(z<20000,'there is a jam somewhere');assert.ok(!jamAt(z-600))
  const g=newWorld();g.z=z-800;g.traffic=[{id:'npc1',kind:'car',x:0,tx:0,z:z+100,speed:60,cruise:60,hold:0,laneTimer:1e9}]
  for(let i=0;i<120;i++)stepWorld(g,{},.05,settings)
  assert.ok(g.traffic[0].speed<25,`jammed car crawls, speed=${g.traffic[0].speed}`)
})
test('winning a road rage pays the car class; newer cars pay more',()=>{
  const g=newWorld();g.speed=150;g.x=.55
  const benz={id:'npc1',kind:'car',model:1,x:0,tx:0,z:g.z-320,speed:40,cruise:50,hold:0,rage:{until:99,honkAt:99,checkAt:99}}
  g.traffic=[benz];const before=g.score
  stepWorld(g,{w:true},.05,settings)
  const e=g.events.find(e=>e.type==='rageWon');assert.ok(e);assert.equal(e.value,TIER_VALUE[2]);assert.ok(g.score-before>=TIER_VALUE[2]-1)
  assert.ok(vehicleInfo({kind:'car',model:3}).value>vehicleInfo({kind:'car',model:0}).value)
})
test('an angry driver rams you again and again, never counts as your bump, and brings olokpa',()=>{
  const g=newWorld(),fast={...settings,maxSpeed:70},v={id:'npc1',kind:'danfo',danfo:true,x:0,tx:0,z:70,speed:70,cruise:60,hold:0,rage:{until:1e9,honkAt:0,checkAt:1e9}}
  g.traffic=[v];g.z=100;g.speed=70
  const hits=[];for(let i=0;i<60*20;i++){stepWorld(g,{w:true},1/60,fast);for(const e of g.events)if(e.rammed)hits.push(e);g.events=[];if(!g.police)g.x=v.x}
  assert.ok(hits.length>=2,`rammed ${hits.length} times`);assert.ok(g.dmg.rear>0)
  assert.equal(g.contacts.npc1?.count||0,0,'their rams are not your bumps');assert.ok(g.police,'the commotion brings the police')
})
test('with olokpa on you, a rival gets in front and blocks your lane',()=>{
  const g=newWorld(),v={id:'npc1',kind:'car',model:1,x:.55,tx:.55,z:130,speed:60,cruise:60,hold:0,rage:{until:1e9,honkAt:0,checkAt:1e9}}
  g.traffic=[v];g.z=100;g.x=0;g.speed=60;beginPursuit(g);g.police.z=-400
  let blocked=false;for(let i=0;i<60*4;i++){stepWorld(g,{},1/60,settings);if(g.events.some(e=>e.type==='blocking'))blocked=true;g.events=[]}
  assert.ok(blocked);assert.ok(v.z>g.z,'still in front');assert.ok(Math.abs(v.x-g.x)<.3,'sitting in your lane');assert.ok(v.rage,'rage lasts while the police come')
})
test('driving through a flooded pothole jolts the car; missing it does not',()=>{
  let k=1;while(!potholeAt(k))k++
  const h=potholeAt(k),g=newWorld();g.traffic=[];g.z=h.z-4;g.x=h.x;g.speed=90
  for(let i=0;i<20;i++)stepWorld(g,{},1/60,settings)
  assert.ok(g.events.some(e=>e.type==='splash'));assert.ok(g.speed<90*.95)
  const m=newWorld();m.traffic=[];m.z=h.z-4;m.x=h.x+(h.x>0?-.55:.55);m.speed=90
  for(let i=0;i<20;i++)stepWorld(m,{},1/60,settings)
  assert.ok(!m.events.some(e=>e.type==='splash'))
})
test('clipping the edge of a pothole with one wheel still counts, even slowly',()=>{
  let k=1;while(!potholeAt(k))k++
  const h=potholeAt(k),g=newWorld();g.traffic=[];g.z=h.z-8;g.x=h.x+(h.r*1.1+.6)/ROAD_SCALE;g.speed=20
  let hit=false;for(let i=0;i<120;i++){stepWorld(g,{w:true},1/60,settings);if(g.events.some(e=>e.type==='splash'))hit=true;g.events=[]}
  assert.ok(hit,'edge hit counts')
})
test('wet roads lengthen braking',()=>{
  const dry=newWorld(),wet=newWorld();wet.rain=1
  for(const g of [dry,wet]){g.traffic=[];g.z=-5000;g.speed=120;for(let i=0;i<60;i++)stepWorld(g,{' ':true},1/60,settings)}
  assert.ok(wet.speed>dry.speed+10,`wet ${wet.speed.toFixed(0)} vs dry ${dry.speed.toFixed(0)}`)
})
// [ROAD NETWORK DISABLED] one straight road for now; uncomment to bring back junctions and turning.
// const toJunction=(g,j,speed)=>{g.z=j.z-25;g.x=.55;g.speed=speed;g.steer=1}
// test('turning off at a junction shakes off an angry driver far behind, and changes the street',()=>{
  // const j=junctionAt(2),g=newWorld(),v={id:'npc1',kind:'danfo',danfo:true,x:.55,tx:.55,z:j.z-150,speed:60,cruise:60,hold:0,rage:{until:1e9,honkAt:0,checkAt:1e9}}
  // g.traffic=[v,{id:'npc2',kind:'car',x:0,tx:0,z:j.z+300,speed:50,cruise:50,hold:0}];toJunction(g,j,70)
  // for(let i=0;i<240&&!g.turn;i++)stepWorld(g,{d:true},1/60,settings)
  // assert.ok(g.turn,'turned');assert.equal(g.turn.side,'right');assert.notEqual(g.street,0)
  // assert.equal(v.rage,null,'they lost you');assert.ok(g.events.some(e=>e.type==='rageWon'))
// })
// test('an angry driver right on your bumper follows you round the corner',()=>{
  // const j=junctionAt(2),g=newWorld(),v={id:'npc1',kind:'danfo',danfo:true,x:.55,tx:.55,z:j.z-30,speed:70,cruise:60,hold:0,rage:{until:1e9,honkAt:0,checkAt:1e9}}
  // g.traffic=[v];toJunction(g,j,70)
  // for(let i=0;i<240&&!g.turn;i++)stepWorld(g,{d:true},1/60,settings)
  // assert.ok(g.turn);assert.ok(v.rage,'still raging');assert.ok(g.z-v.z<45)
// })
// test('too fast to make the turn: you carry straight on',()=>{
  // const j=junctionAt(3),g=newWorld();g.traffic=[];toJunction(g,j,150)
  // for(let i=0;i<30;i++)stepWorld(g,{d:true,w:true},1/60,{...settings,maxSpeed:150})
  // assert.ok(!g.turn);assert.equal(g.street||0,0);assert.ok(g.tooFast,'warned too fast')
// })
// test('left turns work at every junction',()=>{
  // const g=newWorld();g.traffic=[];const j=junctionAt(3);g.z=j.z-18;g.x=-.55;g.speed=60;g.steer=-1
  // for(let i=0;i<480&&!g.turn;i++)stepWorld(g,{a:true,w:true},1/60,settings)
  // assert.equal(g.turn?.side,'left');assert.equal(g.road.de,-1,'now heading west')
// })
// test('police far behind lose you at the corner',()=>{
  // const j=junctionAt(4),g=newWorld();g.traffic=[];toJunction(g,j,80);beginPursuit(g);g.police.z=g.z-150;g.police.speed=80
  // for(let i=0;i<240&&!g.turn;i++)stepWorld(g,{d:true},1/60,settings)
  // assert.ok(g.turn);assert.equal(g.police,null);assert.equal(g.wanted,0)
// })
// test('the street you turn into is the real cross street, and you can keep turning',()=>{
  // const g=newWorld();g.traffic=[];const j=junctionAt(2);toJunction(g,j,60)
  // for(let i=0;i<300&&!g.turn;i++)stepWorld(g,{d:true,w:true},1/60,settings)
  // assert.equal(g.road.de,1,'heading east');assert.equal(g.street,5,'on the east-west road through n=400')
  // const p=worldAt(g.road,g.z,g.x);assert.ok(Math.abs(p.n-(400-14.85))<1,`in the near lane, n=${p.n}`);assert.ok(p.e>20&&p.e<70,`just past the corner, e=${p.e}`)
  // assert.ok(Math.abs(g.x-.55)<.05)
  // // Drive on to the next junction on this street and turn left: back to heading north on the next road.
  // g.turn=null;const j2=nextJunction(g);g.z=j2.z-18;g.x=-.55;g.steer=-1;g.speed=60
  // for(let i=0;i<480&&!g.turn;i++)stepWorld(g,{a:true,w:true},1/60,settings)
  // assert.equal(g.turn?.side,'left');assert.equal(g.road.dn,1,'heading north again');assert.equal(g.street%2,0,'on a north-south road')
  // const q=worldAt(g.road,g.z,g.x);assert.ok(Math.abs(q.e-(200+14.85))<1,`on the road through e=200, e=${q.e}`)
// })
test('new cars carry their own tags, and the G-Wagon is worth the most',()=>{
  assert.equal(vehicleInfo({kind:'car',model:4}).name,'COROLLA');assert.equal(vehicleInfo({kind:'car',model:5}).make,'HONDA')
  assert.equal(vehicleInfo({kind:'car',model:6}).name,'RX 350');const g=vehicleInfo({kind:'car',model:7});assert.equal(g.tier,5);assert.equal(g.value,TIER_VALUE[5])
  assert.ok(Math.max(...[0,1,2,3,4,5,6].map(m=>vehicleInfo({kind:'car',model:m}).value))<g.value)
})
test('driving through a NOS bottle picks it up once; the tank holds three',()=>{
  const g=newWorld();g.traffic=[];const p=nitrosNear(400,0,3000,nitroKey(g))[0];assert.ok(p,'there are bottles on the road')
  g.z=p.z-6;g.x=p.x;g.speed=60;for(let i=0;i<30;i++)stepWorld(g,{},1/60,settings)
  assert.equal(g.nitro,1);assert.ok(g.events.some(e=>e.type==='nitroPickup'))
  g.z=p.z-6;g.speed=60;for(let i=0;i<30;i++)stepWorld(g,{},1/60,settings)
  assert.equal(g.nitro,1,'the same bottle is gone');g.nitro=NOS_MAX
  const q=nitrosNear(p.z+20,0,3000,nitroKey(g))[0];g.z=q.z-6;g.x=q.x;for(let i=0;i<30;i++)stepWorld(g,{},1/60,settings)
  assert.equal(g.nitro,NOS_MAX,'full tank: no more')
})
test('nitro blasts you out of a police box-in and the arrest never lands',()=>{
  const g=newWorld();g.traffic=[];g.z=300;g.x=0;g.speed=0;g.nitro=1;beginPursuit(g);raiseWanted(g,3)
  const [lead,left,right]=policeUnits(g);Object.assign(lead,{z:g.z+5.6,x:0,speed:0});Object.assign(left,{z:g.z,x:-.55,speed:0});Object.assign(right,{z:g.z-5.6,x:0,speed:0})
  for(let i=0;i<40;i++)stepWorld(g,{},1/60,settings)
  assert.ok(g.arrestMeter>0,'the arrest bar was filling')
  stepWorld(g,{n:true},1/60,settings)
  assert.equal(g.nitro,0);assert.equal(g.arrestMeter,0);assert.ok(Math.abs(lead.x-g.x)>.5,'the van in front was shoved aside')
  for(let i=0;i<120;i++)stepWorld(g,{n:true},1/60,settings)
  assert.ok(!g.arrested,'not arrested');assert.ok(g.speed>100,`blasting away at ${g.speed.toFixed(0)} km/h`);assert.ok(g.z-lead.z>20)
})
test('while boosting you shove cars aside instead of stopping dead',()=>{
  const g=newWorld();g.z=300;g.x=0;g.speed=150;g.boostUntil=g.time+3
  const v={id:'npc1',kind:'car',model:0,x:0,tx:0,z:g.z+5.2,speed:40,cruise:40,hold:0,laneTimer:1e9};g.traffic=[v]
  for(let i=0;i<10;i++)stepWorld(g,{},1/60,settings)
  assert.ok(g.speed>130,`kept speed ${g.speed.toFixed(0)}`);assert.ok(Math.abs(v.x)>.4,'car pushed out of the lane')
})
test('no two vehicles ever end a step inside each other',()=>{
  for(const chase of [false,true]){
    const g=newWorld();if(chase)g.heat=35
    for(let i=0;i<60*40&&!g.arrested;i++){
      stepWorld(g,{w:i%600<400,d:i%240<20,a:i%300>280},1/60,settings);g.events=[]
      const b=[...g.traffic,...policeUnits(g),g]
      for(let p=0;p<b.length;p++)for(let q=p+1;q<b.length;q++){
        const side=(vehicleWidth(b[p])+vehicleWidth(b[q]))/2-Math.abs(b[p].x-b[q].x)*ROAD_SCALE,end=(vehicleLength(b[p])+vehicleLength(b[q]))/2-Math.abs(b[p].z-b[q].z)
        assert.ok(side<=.1||end<=.1,`${b[p].id||'player'} inside ${b[q].id||'player'} at step ${i}`)
      }
    }
  }
})
test('there is traffic in every lane around you, from the start and as you drive',()=>{
  const g=newWorld(),count=()=>[-.55,0,.55].map(x=>g.traffic.filter(v=>Math.abs(v.x-x)<.2&&Math.abs(v.z-g.z)<500).length)
  assert.ok(count().every(n=>n>=4),`at the start: ${count()}`)
  for(let i=0;i<60*60;i++){stepWorld(g,{w:true},1/60,settings);g.events=[];if(g.police){g.police=null;g.backup=[];g.heat=0;g.wanted=0}}
  assert.ok(count().every(n=>n>=3),`after a minute of driving: ${count()}`)
})
test('reckless drivers drive badly but never come for you unless you hit them',()=>{
  const g=newWorld(),v={id:'npc1',kind:'danfo',danfo:true,reckless:true,x:0,tx:0,z:g.z-25,speed:60,cruise:70,hold:0}
  g.traffic=[v];g.speed=60;g.nextFight=0
  const seen=[];for(let i=0;i<60*25;i++){stepWorld(g,{w:true},1/60,{...settings,maxSpeed:60});for(const e of g.events)seen.push(e.rammed?'rammed':e.type);g.events=[]}
  assert.ok(!seen.includes('fight')&&!seen.includes('rammed')&&!v.rage,seen.join())
})
test('most danfos drive recklessly; BRT buses and kekes never do',()=>{
  const g=newWorld(),by=k=>g.traffic.filter(v=>v.kind===k)
  assert.ok(by('danfo').some(v=>v.reckless));assert.ok(by('brt').every(v=>!v.reckless));assert.ok(by('keke').every(v=>!v.reckless))
})

test('enough heavy hits wreck the car: it burns, stops and the run is over',()=>{
  const g=newWorld();g.traffic=[];g.z=300;g.speed=80;g.damage=99
  g.traffic=[{id:'npc1',kind:'brt',x:0,tx:0,z:g.z+7.5,speed:0,cruise:0,hold:1e6}]
  for(let i=0;i<120;i++)stepWorld(g,{w:true},1/60,settings)
  assert.ok(g.wrecked,'wrecked');assert.ok(g.speed<5,'rolled to a stop');assert.equal(g.damage,100)
})

test('a Beef Gala on the road repairs the car',()=>{
  const g=newWorld();g.traffic=[];g.damage=60;const p=galasNear(400,0,4000,nitroKey(g))[0];assert.ok(p)
  g.z=p.z-6;g.x=p.x;g.speed=60;for(let i=0;i<30;i++)stepWorld(g,{},1/60,settings)
  assert.ok(g.damage<=30.5,`healed to ${g.damage}`);assert.ok(g.galaTaken[p.id])
})

// Naija Rush
test('naija rush: grid of four rivals, held through the 3-2-1, then everyone launches',()=>{
  const g=newRace(),racers=g.traffic.filter(v=>v.rival!==undefined),seen=[]
  assert.equal(racers.length,4);assert.equal(g.race.finish,START_LINE+LAPS*LAP_LENGTH);assert.equal(LAPS*LAP_LENGTH,9000);assert.equal(racePosition(g).of,5)
  assert.ok(g.traffic.every(v=>v.kind!=='brt'),'no BRT buses in a race')
  for(let i=0;i<60;i++){stepWorld(g,{w:true},.05,settings);seen.push(...g.events.map(e=>e.type==='countdown'?e.n:e.type));g.events=[]}
  assert.equal(g.speed,0,'gas does nothing before GO');assert.ok(racers.every(v=>v.speed===0))
  for(let i=0;i<40;i++){stepWorld(g,{w:true},.05,settings);seen.push(...g.events.map(e=>e.type==='countdown'?e.n:e.type));g.events=[]}
  assert.deepEqual(seen.filter(e=>[3,2,1,'raceGo'].includes(e)),[3,2,1,'raceGo']);assert.ok(g.time>COUNTDOWN)
  assert.ok(g.speed>0);assert.ok(racers.every(v=>v.speed>0),'rivals launch')
})
test('naija rush: the race runs to the chequered flag and ranks all five drivers',()=>{
  const g=newRace();g.traffic=g.traffic.filter(v=>v.rival!==undefined)
  const laps=[];for(let i=0;i<20000&&!g.race.done;i++){stepWorld(g,{w:true,a:g.x>.08,d:g.x<-.08},.05,settings);laps.push(...g.events.filter(e=>e.type==='lap').map(e=>e.lap));g.events=[];if(g.police){g.police=null;g.backup=[];g.heat=0}g.reckless=0;g.damage=0;g.wrecked=false}
  const done=g.race.done;assert.ok(done,'race finished');assert.deepEqual(laps,[2,3]);assert.equal(g.race.lapTimes.length,2)
assert.ok(done.place>=1&&done.place<=5)
  for(let i=0;i<8000&&g.race.finished.length<4;i++)stepWorld(g,{},.05,settings)
  const res=rushResults(g);assert.equal(res.order.length,5);assert.deepEqual(res.order.map(e=>e.pos),[1,2,3,4,5])
  assert.equal(res.order.find(e=>e.me).pos,done.place);assert.ok(res.order.filter(e=>!e.me).every(e=>RIVALS.some(r=>r.name===e.name)))
  for(let i=1;i<5;i++)if(res.order[i].time!==null&&res.order[i-1].time!==null)assert.ok(res.order[i].time>=res.order[i-1].time,'ordered by time')
})
test('naija rush: crashing into traffic fills the reckless meter and brings olokpa',()=>{
  const g=newRace();g.race.go=0;g.race.launched=true;g.traffic=[{id:'npc0',kind:'car',x:0,tx:0,z:g.z+6,speed:0,cruise:0,hold:1e6}];g.speed=90
  for(let i=0;i<3;i++)stepWorld(g,{w:true},.05,settings)
  assert.ok(g.reckless>=30&&!g.police,'one crash is not enough')
  Object.assign(g.traffic[0],{z:g.z+6,speed:0});g.speed=90;g.contacts={}
  for(let i=0;i<3;i++)stepWorld(g,{w:true},.05,settings)
  assert.ok(g.police,'two crashes: police');assert.ok(g.reckless<RECKLESS_LIMIT)
})
test('naija rush: finishing ends the chase and pays the prize',()=>{
  const g=newRace();g.race.go=0;g.race.launched=true;g.traffic=g.traffic.filter(v=>v.rival!==undefined);for(const v of g.traffic)v.z=0
  beginPursuit(g);g.heat=35;g.z=g.race.finish-1;g.speed=150;g.score=0
  stepWorld(g,{w:true},.05,settings);assert.equal(g.race.done.place,1);assert.equal(g.police,null);assert.ok(g.score>=600)
})

test('naija rush: revving on the grid, and a perfect start at GO',()=>{
  const g=newRace(),eng={idle:750,redline:6200}
  for(let i=0;i<30;i++)stepWorld(g,{w:true},.05,{...settings,engine:eng})
  assert.equal(g.speed,0,'still held on the grid');assert.ok(g.rpm>5000,'free revs climb fast with the gas held')
  for(let i=0;i<30;i++)stepWorld(g,{},.05,{...settings,engine:eng})
  assert.ok(g.rpm<2000,'and drop back to idle off the gas')
  // Hold around 70% of the redline at GO for the perfect start.
  let perfect=false;for(let i=0;i<60&&!g.race.launched;i++){stepWorld(g,{w:g.rpm<4300},.05,{...settings,engine:eng});perfect||=g.events.some(e=>e.type==='perfectStart');g.events=[]}
  assert.ok(perfect,'perfect start');assert.ok(g.speed>=25)
})
test('naija rush: a long police chase gives up on its own',()=>{
  const g=newRace();g.race.go=0;g.race.launched=true;g.traffic=[];g.speed=100;beginPursuit(g);g.heat=35;g.police.z=g.z-150
  for(let i=0;i<1100&&g.police;i++){stepWorld(g,{w:true},.05,settings);if(g.police)g.police.z=Math.min(g.police.z,g.z-150)}
  assert.equal(g.police,null)
})

test('naija rush: a police checkpoint in every lap, two vans blocking the outer lanes',()=>{
  const g=newRace(),vans=g.traffic.filter(v=>v.fixed)
  assert.equal(g.race.checkpoints.length,LAPS);assert.equal(vans.length,LAPS*2)
  assert.deepEqual(vans.slice(0,2).map(v=>v.x).sort(),[-.55,.55]);assert.ok(vans.every(v=>v.kind==='police'))
})
const atCheckpoint=(speed)=>{const g=newRace();g.race.go=0;g.race.launched=true;const cp=g.race.checkpoints[0];g.traffic=g.traffic.filter(v=>v.fixed);g.z=cp.z-3;g.x=0;g.speed=speed;g.score=0;return {g,cp}}
test('naija rush: through a checkpoint slowly you are waved on',()=>{
  const {g,cp}=atCheckpoint(CHECKPOINT_SPEED-15)
  for(let i=0;i<20;i++)stepWorld(g,{},.05,settings)
  assert.ok(cp.passed);assert.equal(g.police,null);assert.ok(g.score>=75)
})
test('naija rush: blast through a checkpoint and the police come with two stars',()=>{
  const {g,cp}=atCheckpoint(120)
  for(let i=0;i<5;i++)stepWorld(g,{w:true},.05,settings)
  assert.ok(cp.passed);assert.ok(g.police,'chase on');assert.equal(g.wanted,2)
})
test('naija rush: checkpoint vans stay put when you hit them, and it starts a chase',()=>{
  const g=newRace();g.race.go=0;g.race.launched=true;const van=g.traffic.find(v=>v.fixed);g.traffic=[van];g.z=van.z-8;g.x=van.x;g.speed=90
  for(let i=0;i<10;i++)stepWorld(g,{w:true},.05,settings)
  assert.equal(van.z,van.az);assert.equal(van.x,van.ax);assert.ok(g.police);assert.ok(g.wanted>=2)
})
test('naija rush: stars climb quickly in a race chase',()=>{
  const g=newRace();g.race.go=0;g.race.launched=true;g.traffic=[];g.speed=100;beginPursuit(g);g.heat=35
  for(let i=0;i<560;i++){stepWorld(g,{w:true},.05,settings);if(g.police){g.police.z=Math.min(g.police.z,g.z-60);for(const u of g.backup)u.z=Math.min(u.z,g.z-60)}}
  assert.equal(g.wanted,3)
})
test('naija rush: road chaos keeps kicking off ahead (swerves, brake-checks, blowouts, road rage)',()=>{
  const g=newRace();g.race.go=0;const seen={};let fights=0,crashes=0
  for(let i=0;i<2400;i++){stepWorld(g,{w:true,a:g.x>.08,d:g.x<-.08},.05,settings);for(const e of g.events){if(e.type==='chaos')seen[e.what]=(seen[e.what]||0)+1;if(e.type==='fight')fights++;if(e.type==='npcCrash')crashes++}g.events=[];g.damage=0;g.wrecked=false;if(g.police){g.police=null;g.backup=[];g.heat=0}g.reckless=0;g.arrested=false}
  const total=Object.values(seen).reduce((a,b)=>a+b,0)
  assert.ok(total>=8,`chaos events in 2 minutes: ${total}`);assert.ok(Object.keys(seen).length>=2,'more than one kind');assert.ok(fights>=1,'someone picked a fight');assert.ok(crashes>=1,'pile-ups in the traffic')
})

test('wrecking your car takes 75% more hits than before',()=>{
  for(const a of [.05,.2,.5]){const before=100/Math.min(7,a*14+1.5),now=100/hitDamage(a);assert.ok(Math.abs(now/before-1.75)<1e-9,'hit '+a+': '+before.toFixed(1)+' hits before, '+now.toFixed(1)+' now')}
})

test('naija rush: in a bend the car drifts to the outside unless you steer into it',()=>{
  const {roadCurvature}=physicsCurve;let s=0;while(Math.abs(roadCurvature(s))<1/700)s+=10
  const g=newRace();g.race.go=0;g.race.launched=true;g.traffic=[];g.z=s;g.x=0;g.speed=150
  for(let i=0;i<10;i++)stepWorld(g,{w:true},.05,settings)
  assert.ok(Math.sign(g.x)===-Math.sign(roadCurvature(s))&&Math.abs(g.x)>.05,'drifted to the outside')
  const h=newRace();h.race.go=0;h.race.launched=true;h.traffic=[];h.z=s;h.x=0;h.speed=150
  for(let i=0;i<10;i++)stepWorld(h,{w:true,a:h.x>.02,d:h.x<-.02},.05,settings)
  assert.ok(Math.abs(h.x)<.06,'steering holds the line')
})
