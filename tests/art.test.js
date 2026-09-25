"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const C=require("../character-art.js"),Art=require("../art.js"),E=require("../engine.js");
const ids=Object.keys(C.CAST),states=["CHASE","SCATTER","HOUSE","FRIGHTENED","WARNING","EATEN"];
const signature=p=>p.join(",");
const opaque=p=>p.reduce((sum,c)=>sum+Boolean(c),0);
function bounds(p) {
  const xs=[],ys=[];
  p.forEach((c,i)=>{if(c){xs.push(i%32);ys.push(Math.floor(i/32));}});
  return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
}
test("AI cast preserves the engine's four ordered behavior IDs",()=>{
  assert.deepEqual(ids,E.GHOSTS.map(g=>g.id));
  assert.deepEqual(ids.map(id=>C.CAST[id].name),["CLAUDE","MUSE","GROK","GEMINI"]);
  assert.equal(Art.RENDER_SCALE,2);assert.equal(Art.SPRITE_SIZE,32);assert.equal(Art.SPRITE_LOGICAL_SIZE,16);
  assert.deepEqual([Art.WIDTH,Art.HEIGHT,Art.TILE],[224,288,8]);
});
test("all opponent direction, motion, blink and gameplay state combinations have transparent margins",()=>{
  for(const id of ids)for(const state of states)for(let direction=0;direction<4;direction++)for(let frame=0;frame<4;frame++)for(const blink of [false,true]) {
    const p=C.raster("ghost",{id,state,direction,frame,blink}),label=[id,state,direction,frame,blink].join(":");
    assert.equal(p.length,1024,label);assert.ok(opaque(p)>20,label);
    const [x1,y1,x2,y2]=bounds(p);assert.ok(x1>=2&&y1>=2&&x2<=29&&y2<=29,label);
    assert.ok(p.every(c=>c===null||/^#[0-9a-f]{6}$/i.test(c)),label);
  }
});
test("all four normal motion frames are authored, with stable centers and solid connected bodies",()=>{
  for(const id of ids) {
    assert.equal(new Set([0,1,2,3].map(frame=>signature(C.raster("ghost",{id,frame})))).size,4,id);
    for(let frame=0;frame<4;frame++) {
      const p=C.raster("ghost",{id,frame}),seen=new Set(),queue=[p.findIndex(Boolean)];seen.add(queue[0]);
      for(let i=0;i<queue.length;i++){
        const at=queue[i],x=at%32,y=Math.floor(at/32);
        for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++){
          const n=yy*32+xx;if(xx<0||xx>31||yy<0||yy>31||!p[n]||seen.has(n))continue;seen.add(n);queue.push(n);
        }
      }
      assert.equal(seen.size,opaque(p),id+": no detached flecks");
      const [x1,y1,x2,y2]=bounds(p);assert.ok(Math.abs((x1+x2)/2-15.5)<=1.5&&Math.abs((y1+y2)/2-15.5)<=1.5,id);
    }
  }
});
test("house and scatter reuse chase frames, while blinking cannot override fear or returning eyes",()=>{
  for(const id of ids)for(let direction=0;direction<4;direction++) {
    const opts={id,direction,frame:2};
    for(const state of ["HOUSE","SCATTER"])assert.deepEqual(C.raster("ghost",{...opts,state}),C.raster("ghost",opts));
    for(const state of ["FRIGHTENED","WARNING","EATEN"])assert.deepEqual(C.raster("ghost",{...opts,state,blink:true}),C.raster("ghost",{...opts,state}));
    assert.notDeepEqual(C.raster("ghost",{...opts,blink:true}),C.raster("ghost",opts),id);
  }
});
test("frightened and warning states preserve every opponent's animated silhouette",()=>{
  for(const id of ids)for(let frame=0;frame<4;frame++){
    const normal=C.raster("ghost",{id,frame}).map(Boolean);
    for(const state of ["FRIGHTENED","WARNING"])assert.deepEqual(C.raster("ghost",{id,frame,state}).map(Boolean),normal,id);
  }
});
test("Muse returning eyes exactly match the eyes in her normal face",()=>{
  for(let direction=0;direction<4;direction++){
    const returning=C.raster("ghost",{id:"pinky",state:"EATEN",direction}),normal=C.raster("ghost",{id:"pinky",direction});
    returning.forEach((c,i)=>{if(c)assert.equal(c,normal[i]);});
    assert.deepEqual([...new Set(returning.filter(Boolean))].sort(),["#22202b","#fffdf4"]);
  }
});
test("Grok keeps the same pure white eyes in normal, fear, warning and returning states",()=>{
  for(let direction=0;direction<4;direction++) {
    const eyes=C.raster("ghost",{id:"inky",state:"EATEN",direction});
    for(const state of ["CHASE","FRIGHTENED","WARNING"]) {
      const p=C.raster("ghost",{id:"inky",state,direction});
      eyes.forEach((c,i)=>{if(c==="#ffffff")assert.equal(p[i],"#ffffff");});
    }
    assert.deepEqual([...new Set(eyes.filter(Boolean))].sort(),["#131625","#ffffff"]);
  }
});
test("Astra has distinct mouth openings in all directions and a complete ten-frame death",()=>{
  for(let direction=0;direction<4;direction++){
    const frames=[0,1,2,3].map(frame=>C.raster("pacman",{direction,frame}));
    assert.equal(new Set(frames.map(signature)).size,4);
    assert.equal(new Set(frames.map(p=>p.filter(c=>c==="#ffffff").length)).size,1,"the complete eye star survives every mouth opening");
    const eye=p=>p.map(c=>c==="#15141c"||c==="#ffffff"?c:null);
    frames.forEach(p=>assert.deepEqual(eye(p),eye(frames[0]),"the whole eye stays in the head through every chomp"));
    frames.forEach(p=>{const [x1,y1,x2,y2]=bounds(p);assert.ok(x1>=2&&y1>=2&&x2<=29&&y2<=29);assert.ok(p.includes("#ffffff"));});
  }
  const death=Array.from({length:10},(_,frame)=>C.raster("death",{frame}));
  assert.equal(new Set(death.map(signature)).size,10);
  assert.ok(opaque(death[7])>opaque(death[8]));assert.equal(opaque(death[9]),0);
});
test("world positions snap to the backing pixel grid without moving maze centers",()=>{
  assert.deepEqual(Art.worldPoint(6.5,23.5),[52,212]);
  for(let x=0;x<28;x+=.071){const [px,py]=Art.worldPoint(x,14.5);assert.equal(px*2,Math.round(px*2));assert.equal(py,140);assert.ok(Math.abs(px-x*8)<=.25);}
});

const I=require("../item-art.js");
test("pickups: chip dots, GPU power chips and eight distinct bonus artifacts",()=>{
  assert.deepEqual(I.BONUS_NAMES,E.BONUS.map(b=>b.name));
  const rasters=I.BONUS_NAMES.map(name=>I.raster("bonus",{name}));
  rasters.forEach((p,i)=>{
    assert.ok(opaque(p)>150,I.BONUS_NAMES[i]);
    const [x0,y0,x1,y1]=bounds(p);assert.ok(x0>=2&&y0>=2&&x1<=29&&y1<=29,I.BONUS_NAMES[i]);
  });
  assert.equal(new Set(rasters.map(signature)).size,8);
  const [cx0,cy0,cx1,cy1]=bounds(I.raster("chip"));assert.ok(cx1-cx0<8&&cy1-cy0<8);
  const gpu=I.raster("gpu");assert.ok(gpu.filter(c=>c==="#15141c").length>30);assert.ok(gpu.includes("#ffe52c"));
});

test("power-up chips print their name on the label and light an LED in their colour",()=>{
  assert.deepEqual(I.labelLines("CONTEXT OVERFLOW"),["CONTEXT","OVERFLOW"]);
  assert.deepEqual(I.labelLines("SCALE UP"),["SCALE UP"]);
  assert.deepEqual(I.labelLines("INCOGNITO"),["INCOG-","NITO"]);
  const [w,h]=I.POWERUP_SIZE,a=I.powerUpRaster({name:"TOKEN BEAM",color:"#3fc6ff"}),b=I.powerUpRaster({name:"RAG",color:"#3fc6ff"});
  assert.equal(a.length,w*h);assert.ok(a.includes("#3fc6ff"));assert.ok(a.filter(c=>c==="#15141c").length>40);
  assert.notDeepEqual(a,b);
  // An icon replaces the name: Incognito prints a ghost in shades of its colour.
  const ghost=I.powerUpRaster({name:"INCOGNITO",color:"#c9a6ff",icon:"ghost"});
  assert.notDeepEqual(ghost,I.powerUpRaster({name:"INCOGNITO",color:"#c9a6ff"}));
  assert.ok(ghost.filter(c=>c==="#c9a6ff").length>=20);assert.ok(ghost.filter(c=>c==="#15141c").length>100);
});

test("Nova has every Astra frame in rose, with a gold bow kept on top when facing left",()=>{
  assert.deepEqual(Object.keys(C.SKINS),["astra","nova","vega","lyra"]);
  for(let direction=0;direction<4;direction++)for(let frame=0;frame<4;frame++){
    const nova=C.raster("pacman",{skin:"nova",direction,frame}),astra=C.raster("pacman",{direction,frame}),label=direction+":"+frame;
    const [x1,y1,x2,y2]=bounds(nova);assert.ok(x1>=0&&y1>=0&&x2<=31&&y2<=31,label);
    assert.ok(nova.includes("#ff5fa2"),label);
    assert.ok(nova.includes("#ffe52c"),label+": gold bow");
    assert.notDeepEqual(nova,astra,label);
    assert.deepEqual(C.raster("pacman",{direction,frame}),C.raster("pacman",{skin:"astra",direction,frame}),"Astra is unchanged");
  }
  for(const direction of [1,3]){
    const p=C.raster("pacman",{skin:"nova",direction,frame:2});
    const bowRows=p.map((c,i)=>c==="#ffe52c"?Math.floor(i/32):null).filter(y=>y!==null);
    assert.ok(Math.max(...bowRows)<=8,"bow stays at the top for direction "+direction);
  }
  for(let frame=0;frame<10;frame++){
    const p=C.raster("death",{skin:"nova",frame});
    if(frame<9)assert.ok(opaque(p)>0,"death "+frame);
    if(frame>=7&&frame<9)assert.ok(p.includes("#ff5fa2"),"Nova ends as a rose star");
  }
});

test("Vega and Lyra wear their own colours and accessories, and every accessory fits every skin",()=>{
  const body={astra:"#ffe52c",nova:"#ff5fa2",vega:"#4fe3ff",lyra:"#6fe06a"};
  for(const skin of Object.keys(C.SKINS))for(const accessory of ["default","none",...Object.keys(C.ACCESSORIES)])for(let direction=0;direction<4;direction++)for(let frame=0;frame<4;frame++){
    const p=C.raster("pacman",{skin,accessory,direction,frame}),label=[skin,accessory,direction,frame].join(":");
    const [x1,y1,x2,y2]=bounds(p);assert.ok(x1>=0&&y1>=0&&x2<=31&&y2<=31,label);
    assert.ok(p.includes(body[skin]),label);
    assert.ok(p.every(c=>c===null||/^#[0-9a-f]{6}$/i.test(c)),label);
  }
  // Defaults: Nova's bow, Vega's visor, Lyra's leaf; Astra wears nothing.
  const same=(a,b)=>signature(C.raster("pacman",a))===signature(C.raster("pacman",b));
  assert.ok(same({skin:"nova"},{skin:"nova",accessory:"bow"}));
  assert.ok(same({skin:"vega"},{skin:"vega",accessory:"visor"}));
  assert.ok(same({skin:"lyra"},{skin:"lyra",accessory:"leaf"}));
  assert.ok(same({skin:"astra"},{skin:"astra",accessory:"none"}));
  for(const id of Object.keys(C.ACCESSORIES))assert.ok(!same({skin:"astra",accessory:id},{skin:"astra"}),id+" is visible");
  // Accessories are worn by the head: facing left mirrors the right-facing sprite and
  // up or down rotates it, so every piece turns with the body.
  const turn=(p,n)=>{for(let k=0;k<n;k++){const c=p.slice();for(let y=0;y<32;y++)for(let x=0;x<32;x++)p[y*32+x]=c[(31-x)*32+y];}return p;};
  for(const accessory of Object.keys(C.ACCESSORIES))for(let frame=0;frame<4;frame++){
    const right=C.raster("pacman",{skin:"vega",accessory,direction:3,frame});
    const mirror=right.map((_,i)=>right[Math.floor(i/32)*32+31-i%32]);
    assert.deepEqual(C.raster("pacman",{skin:"vega",accessory,direction:1,frame}),mirror,accessory+" mirrors facing left");
    assert.deepEqual(C.raster("pacman",{skin:"vega",accessory,direction:0,frame}),turn(right.slice(),3),accessory+" turns facing up");
    assert.deepEqual(C.raster("pacman",{skin:"vega",accessory,direction:2,frame}),turn(right.slice(),1),accessory+" turns facing down");
  }
});
// A canvas stand-in that records the calls the maze drawing makes.
function recorderDoc(){
  const made=[];
  const context=log=>new Proxy({},{get:(t,k)=>k in t?t[k]:(...a)=>{log.push([k,...a]);return k==="createLinearGradient"?{addColorStop(){}}:undefined;},set:(t,k,v)=>{log.push(["="+k,v]);return true;}});
  return {made,createElement(){const c={width:0,height:0,log:[]};c.getContext=()=>c.ctx||(c.ctx=context(c.log));made.push(c);return c;}};
}
function withDoc(run){const doc=recorderDoc();globalThis.document=doc;try{return run(doc);}finally{delete globalThis.document;}}
const widths=layer=>layer.log.filter(([k])=>k==="=lineWidth").map(([,v])=>v);
test("mazes keep the arcade line by default and draw neon tubes at backing resolution in JUICY",()=>withDoc(()=>{
  const map=E.findMap("neural");
  const plain=Art.mazeLayer(false,"#123456",map);
  assert.deepEqual([plain.width,plain.height],[224,248]);assert.equal(Art.mazeLayer(false,"#123456",map),plain,"cached");
  assert.deepEqual(widths(plain),[1]);assert.ok(!plain.log.some(([k])=>k==="scale"));
  const neon=Art.mazeLayer(false,"#123456",map,{style:"neon"});
  assert.notEqual(neon,plain);assert.deepEqual([neon.width,neon.height],[448,496]);
  assert.ok(neon.log.some(([k,x,y])=>k==="scale"&&x===2&&y===2));assert.deepEqual(widths(neon),[2.5,1,0.5]);
  const flash=Art.mazeLayer(true,"#123456",map,{style:"neon"});
  assert.notEqual(flash,neon);assert.equal(flash.width,448);
}));
test("neon layers keep only a maze's six latest colours; arcade layers are never evicted",()=>withDoc(()=>{
  const map=E.findMap("server"),neon={style:"neon"};
  const plain=Art.mazeLayer(false,"#000001",map),first=Art.mazeLayer(false,"#000001",map,neon);
  for(let i=2;i<=7;i++)Art.mazeLayer(false,"#00000"+i,map,neon);
  assert.notEqual(Art.mazeLayer(false,"#000001",map,neon),first,"the oldest neon colour was rebuilt");
  assert.equal(Art.mazeLayer(false,"#000001",map),plain);
}));
test("mixHex blends colours exactly",()=>{
  assert.equal(Art.mixHex("#000000","#ffffff",0.5),"#808080");
  assert.equal(Art.mixHex("#284bff","#ffffff",0),"#284bff");assert.equal(Art.mixHex("#284bff","#ffffff",1),"#ffffff");
});
