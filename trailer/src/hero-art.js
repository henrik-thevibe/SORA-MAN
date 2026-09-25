/* 64 x 64 "hero" pixel sprites for close-ups. A port of the game's own
 * mask painter (../character-art.js): the same shapes, palettes and shading
 * rules in the game's 32-pixel design space, sampled twice as finely, so the
 * heroes read as higher-detail versions of the in-game sprites. */
(function () {
  "use strict";
  const A = window.AstraCharacters;
  const N = 64, S = N / 32;
  const PAL = A.PALETTES, GOLD = A.SKINS.astra.palette;
  // Not exported by the game; mirrored from character-art.js.
  const BLUE = { body: "#305bea", shade: "#2039ac", light: "#739bff", edge: "#152979" };
  const ASTRA = [[13,2],[18,2],[21,5],[21,6],[25,6],[28,9],[29,13],[27,16],[29,19],[28,23],[25,26],[21,26],[18,29],[13,29],[10,26],[6,26],[3,23],[2,19],[4,16],[2,13],[3,9],[7,6],[10,6]];
  const ARM_ANGLES = [-94,-58,-25,13,49,83,113,150,185,221,252];
  const ARM_LENGTHS = [13.1,11.1,13.8,12.1,13,10.8,13.6,11.5,13.3,10.6,9.1];

  const ellipse = (x,y,cx,cy,rx,ry) => ((x-cx)/rx)**2 + ((y-cy)/ry)**2 <= 1;
  function polygon(x,y,points) {
    let inside = false;
    for (let i=0,j=points.length-1;i<points.length;j=i++) {
      const [ax,ay]=points[i], [bx,by]=points[j];
      if ((ay>y)!==(by>y) && x<(bx-ax)*(y-ay)/(by-ay)+ax) inside=!inside;
    }
    return inside;
  }
  function capsule(x,y,ax,ay,bx,by,r) {
    const vx=bx-ax,vy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*vx+(y-ay)*vy)/(vx*vx+vy*vy)));
    return (x-ax-vx*t)**2+(y-ay-vy*t)**2<=r*r;
  }
  // Design coordinate at the centre of hero pixel X.
  const D = (X) => X / S - 0.25;
  const inside = (X,Y) => X >= 3 && X <= 60 && Y >= 3 && Y <= 60;
  function makeMask(test) {
    const m = new Uint8Array(N*N);
    for (let Y=3;Y<=60;Y++) for (let X=3;X<=60;X++) if (test(D(X),D(Y))) m[Y*N+X]=1;
    return m;
  }
  const ghostMask = (frame) => makeMask((x,y)=>{
    if(y<16)return ellipse(x,y,15.5,15.5,12.8,12.5);
    const bottom=26+1.5*Math.cos((x-5)*Math.PI*2/9+frame*Math.PI/2);
    return x>=2.6&&x<=28.4&&y<=bottom;
  });
  function claudeMask(frame) {
    const arms=ARM_ANGLES.map((deg,i)=>{
      const a=deg*Math.PI/180, pulse=[0,.6,0,-.6][(frame+i)%4], r=ARM_LENGTHS[i]-1.5+pulse;
      return [15.5+Math.cos(a)*5,16+Math.sin(a)*5,15.5+Math.cos(a)*r,16+Math.sin(a)*r];
    });
    return makeMask((x,y)=>ellipse(x,y,15.5,16,7.3,7.5)||arms.some(a=>capsule(x,y,...a,1.7)));
  }
  function geminiMask(frame) {
    const [vr,hr]=[[13.5,13.5],[13,13.5],[13,13],[13.5,13]][frame], cx=15.5, cy=15.5;
    return makeMask((x,y)=>{ const dx=Math.abs(x-cx),dy=Math.abs(y-cy),r=dy>dx?vr:hr; return dx<=r&&dy<=r&&Math.sqrt(dx/r)+Math.sqrt(dy/r)<=1.22; });
  }

  function raster(kind, { id = "blinky", frame = 0, scared = false, blink = false, dir = 3 } = {}) {
    const px = Array(N*N).fill(null);
    let body = null;
    const put = (X,Y,c) => { if (inside(X,Y)) px[Y*N+X] = c; };
    // Design-space primitives, drawn at hero resolution.
    const rect = (x,y,w,h,c) => { for (let Y=Math.round(y*S);Y<Math.round((y+h)*S);Y++) for (let X=Math.round(x*S);X<Math.round((x+w)*S);X++) put(X,Y,c); };
    const oval = (cx,cy,rx,ry,c) => { for (let Y=0;Y<N;Y++) for (let X=0;X<N;X++) if (ellipse(D(X),D(Y),cx,cy,rx,ry)) put(X,Y,c); };
    function line(x1,y1,x2,y2,c) {
      let X1=Math.round(x1*S),Y1=Math.round(y1*S); const X2=Math.round(x2*S),Y2=Math.round(y2*S);
      let dx=Math.abs(X2-X1),sx=X1<X2?1:-1,dy=-Math.abs(Y2-Y1),sy=Y1<Y2?1:-1,err=dx+dy;
      for(;;){put(X1,Y1,c);put(X1+1,Y1,c);put(X1,Y1+1,c);put(X1+1,Y1+1,c);if(X1===X2&&Y1===Y2)break;const e=2*err;if(e>=dy){err+=dy;X1+=sx;}if(e<=dx){err+=dx;Y1+=sy;}}
    }
    const path = (pts,c) => { for (let i=1;i<pts.length;i++) line(...pts[i-1],...pts[i],c); };
    // The game's shading: outline, lower/right shade, upper-left light. The
    // outline stays two hero pixels wide so its weight matches the game.
    function paint(mask, pal, colorAt) {
      body = mask;
      const off = (X,Y) => X<0||X>=N||Y<0||Y>=N||!mask[Y*N+X];
      for (let Y=3;Y<=60;Y++) for (let X=3;X<=60;X++) {
        if (!mask[Y*N+X]) continue;
        const edge = off(X-1,Y)||off(X+1,Y)||off(X,Y-1)||off(X,Y+1)||off(X-2,Y)||off(X+2,Y)||off(X,Y-2)||off(X,Y+2);
        const x = D(X), y = D(Y);
        put(X,Y, colorAt ? colorAt(x,y,edge) : edge ? pal.edge : y>=24||off(X+4,Y) ? pal.shade : y<8&&x<20 ? pal.light : pal.body);
      }
    }
    const clip = () => { if (body) for (let i=0;i<px.length;i++) if (!body[i]) px[i]=null; };

    if (kind === "sora") {
      const opening = [0,.16,.4,.69][frame%4];
      const mask = makeMask((x,y)=>{ if(!polygon(x,y,ASTRA))return false; if(!opening)return true; return Math.abs(Math.atan2(y-15.5,x-17.5))>=opening; });
      paint(mask, GOLD);
      oval(17,8.5,4.5,4.5,"#15141c");
      // The star glint: a tapered four-point sparkle, tilted like the game's.
      const r = 3.3, a = -0.35;
      for (let Y=0;Y<N;Y++) for (let X=0;X<N;X++) {
        const dx=D(X)-16.9, dy=D(Y)-8.1, u=Math.abs(dx*Math.cos(a)-dy*Math.sin(a)), v=Math.abs(dx*Math.sin(a)+dy*Math.cos(a));
        if (Math.sqrt(u/r)+Math.sqrt(v/r)<=1) put(X,Y,"#ffffff");
      }
      clip();
      return dir === 1 ? mirror(px) : px;
    }
    frame %= 4;
    const pal = scared ? BLUE : PAL[id];
    const face = "#fff8e9";
    blink = blink && !scared;
    const mask = id==="blinky" ? claudeMask(frame) : id==="clyde" ? geminiMask(frame) : ghostMask(frame);
    if (id==="clyde" && !scared) {
      const colors=["#ee465d","#9d49e9","#3964ee","#198cde","#18c9c9","#32cf96","#91d75c","#f9d03c","#f99a35"];
      paint(mask,pal,(x,y,edge)=>{
        const ang=(Math.atan2(y-15.5,x-15.5)+Math.PI/2+Math.PI*2)%(Math.PI*2);
        const col=colors[Math.min(colors.length-1,Math.floor(ang/(Math.PI*2)*colors.length))];
        if(edge)return col; if(x+y<22&&x>9)return "#ffd57c"; return col;
      });
      path([[15,4],[15,6],[13,8]],"#fff1ad"); path([[5,15],[7,15]],"#fff6b9");
    } else paint(mask,pal);
    if (id==="pinky") {
      const panel=scared?"#889cf5":"#ffbe91", rim=scared?"#5474cf":"#f69568";
      rect(8,10,16,14,rim);rect(6,12,20,10,rim);rect(8,11,16,12,panel);rect(7,13,18,8,panel);
      if(!scared)rect(9,11,13,1,"#ffdfb9");
    }
    if (id==="inky") {
      path([[6,13],[6,10],[8,7],[11,5],[14,5]],scared?pal.light:"#909bb7");
      path([[7,10],[8,8],[10,7]],scared?"#bfcdff":"#e0e6f6");
      if(!scared)path([[5,22],[5,24],[7,26]],"#424b66");
    }
    const dx = dir===1?-1:dir===3?1:0, dy = dir===0?-1:dir===2?1:0;
    if (id==="blinky") {
      for (const cx of [12+dx,20+dx]) {
        const cy=16+dy;
        if(blink){path([[cx-2,cy],[cx,cy+1],[cx+2,cy]],"#25202c");continue;}
        oval(cx,cy,2.7,3.8,"#211923");oval(cx-0.4,cy-1.2,0.9,0.9,"#fffaf0");
      }
      if(scared)path([[10,23],[12,21],[14,23],[16,21],[18,23],[20,21],[22,23]],face);
    } else if (id==="pinky") {
      for (const x of [9,18]) {
        if(blink){path([[x,17],[x+2,18],[x+4,17]],"#392a30");continue;}
        rect(x+1,13,4,7,"#fffdf4");rect(x,14,6,5,"#fffdf4");rect(x+2+dx,15+dy,3,4,"#22202b");
      }
      if(scared)path([[9,22],[11,20],[13,22],[15,20],[17,22],[19,20],[22,22]],"#253775");
    } else if (id==="inky") {
      for (const cx of [11+dx,21+dx]) {
        const cy=16+dy;
        if(blink){rect(cx-2,cy,5,2,"#ffffff");continue;}
        oval(cx,cy,3.5,5.3,"#131625");oval(cx,cy,2.5,4.3,"#ffffff");
      }
      if(scared)path([[8,24],[10,22],[12,24],[14,22],[16,24],[18,22],[20,24],[22,22],[24,24]],"#ffffff");
    } else {
      const outline=scared?"#9ed8ff":"#efcc68";
      if (blink) { path([[6,15],[9,17],[12,18],[19,18],[22,17],[25,15]],"#122759"); path([[9,16],[12,17],[19,17],[22,16]],"#fff1b5"); }
      else {
        for (let Y=0;Y<N;Y++) for (let X=0;X<N;X++) {
          const x=D(X), y=D(Y), half=5.5*(1-Math.abs(x-15.5)/10.5);
          if (x<4.6||x>26.4||half<=0) continue;
          const d=Math.abs(y-16);
          if (d<=half) put(X,Y, d>half-0.7 ? outline : "#fffbea");
        }
        const cx=16+dx*2, cy=16+dy;
        oval(cx,cy,4.7,4.8,scared?"#4ec9f0":"#28bfc3");oval(cx,cy,3.5,3.8,scared?"#2475c0":"#d9b842");
        oval(cx,cy,scared?2.7:2.5,scared?3.6:3,"#122342");oval(cx-0.6,cy-1.2,0.9,0.9,"#ffffff");
      }
    }
    clip();
    return px;
  }
  function mirror(px) {
    const out = px.slice();
    for (let Y=0;Y<N;Y++) for (let X=0;X<N;X++) out[Y*N+X] = px[Y*N+(N-1-X)];
    return out;
  }
  function toCanvas(px) {
    const c = document.createElement("canvas"); c.width = c.height = N;
    const g = c.getContext("2d");
    px.forEach((col,i) => { if (col) { g.fillStyle = col; g.fillRect(i%N, Math.floor(i/N), 1, 1); } });
    return c;
  }

  // Build every hero frame once.
  const heroes = new Map();
  function build() {
    for (let f=0; f<4; f++) { heroes.set(`sora-${f}`, toCanvas(raster("sora",{frame:f}))); heroes.set(`sora-${f}-l`, toCanvas(raster("sora",{frame:f,dir:1}))); }
    // Just the star glint, for the eye that shines in the dark before Sora lights up.
    heroes.set("sora-glint", toCanvas(raster("sora",{frame:0}).map((c) => (c === "#ffffff" ? c : null))));
    for (const id of ["blinky","pinky","inky","clyde"]) {
      for (let f=0; f<4; f++) heroes.set(`${id}-${f}`, toCanvas(raster("ghost",{id,frame:f})));
      heroes.set(`${id}-blink`, toCanvas(raster("ghost",{id,frame:0,blink:true})));
      for (let f=0; f<2; f++) heroes.set(`${id}-scared-${f}`, toCanvas(raster("ghost",{id,frame:f,scared:true})));
      heroes.set(`${id}-left`, toCanvas(raster("ghost",{id,frame:0,dir:1})));
    }
  }
  TR.hero = { build, raster, get: (k) => heroes.get(k), N };
})();
