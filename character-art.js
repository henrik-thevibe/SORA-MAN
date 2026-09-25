/* Hand-authored, palette-limited Astra-Man artwork. Every coordinate is a pixel.
 * The supplied master renders are visual references, never runtime dependencies.
 * Pure raster data also lets the tests inspect every frame without a browser. */
(function (root) {
  "use strict";
  const SIZE = 32, LOGICAL_SIZE = 16, RENDER_SCALE = 2;
  const CAST = Object.freeze({
    blinky: Object.freeze({ name: "CLAUDE", character: "claude", description: "DIRECT PURSUIT", color: "#ff9a66" }),
    pinky: Object.freeze({ name: "MUSE", character: "muse", description: "THE AMBUSHER", color: "#ffe9c5" }),
    inky: Object.freeze({ name: "GROK", character: "grok", description: "THE FLANKER", color: "#c4c9e0" }),
    clyde: Object.freeze({ name: "GEMINI", character: "gemini", description: "CHASE AND RETREAT", color: "#65e2ef" }),
  });
  const PALETTES = Object.freeze({
    blinky: Object.freeze({ body: "#f5824d", shade: "#d25b35", light: "#ffb879", edge: "#b4482b" }),
    pinky: Object.freeze({ body: "#fff0d7", shade: "#ecd4b4", light: "#fffaf0", edge: "#d4b998" }),
    inky: Object.freeze({ body: "#171820", shade: "#0b0c12", light: "#b9c0d9", edge: "#707586" }),
    clyde: Object.freeze({ body: "#35bfe9", shade: "#147bc6", light: "#a4ffff", edge: "#214aae" }),
  });
  const BLUE = Object.freeze({ body: "#305bea", shade: "#2039ac", light: "#739bff", edge: "#152979" });
  const WARNING = Object.freeze({ body: "#fff2dc", shade: "#d9ced8", light: "#ffffff", edge: "#aa94b1" });
  const GOLD = Object.freeze({ body: "#ffe52c", shade: "#f4b91c", light: "#fff79a", edge: "#b87313" });
  const ROSE = Object.freeze({ body: "#ff5fa2", shade: "#d63f80", light: "#ffb3d3", edge: "#9c2359" });
  const CYAN = Object.freeze({ body: "#4fe3ff", shade: "#23b3dc", light: "#c2f7ff", edge: "#1774a0" });
  const GREEN = Object.freeze({ body: "#6fe06a", shade: "#43b04a", light: "#c9ffb8", edge: "#237a32" });
  // Player skins share Astra's star silhouette. Nova adds the Ms. Pac-Man cues;
  // every skin has a default accessory that the profile can swap.
  const SKINS = Object.freeze({
    astra: Object.freeze({ name: "SORA", palette: GOLD, accessory: null }),
    nova: Object.freeze({ name: "NOVA", palette: ROSE, accessory: "bow", lashes: true, mole: true, lips: "#e8124f" }),
    vega: Object.freeze({ name: "VEGA", palette: CYAN, accessory: "visor" }),
    lyra: Object.freeze({ name: "LYRA", palette: GREEN, accessory: "leaf" }),
  });
  // Accessories are worn on the right-facing star and then turn with it, like
  // Ms. Pac-Man's bow: mirrored facing left, rotated facing up or down.
  // - `rows` is a hat, centred on HEAD_X and sunk `sink` pixels into the top of the head,
  //   or placed at `at` (the crown and halo are tilted 45 degrees back along the head);
  // - `eye` ops are centred on the eye;
  // - `side` ops use the sprite's own coordinates.
  // `hidesEye` leaves the star eye out under the piece; `clip` keeps a piece
  // inside the body; `tint` swaps colours for a skin whose body would hide the piece.
  const HEAD_X = 7, EYE = [17, 8.5];
  const ACCESSORIES = Object.freeze({
    bow: Object.freeze({ sink: 3, colors: { e: GOLD.edge, b: GOLD.body, l: GOLD.light, k: GOLD.shade },
      tint: { astra: { e: ROSE.edge, b: ROSE.body, l: ROSE.light, k: ROSE.shade } },
      rows: ["ee.......ee","ebee...eebe","elbbeeebbbe","ellbekebbbe","elbbeeebbbe","ebee...eebe","ee.......ee"] }),
    visor: Object.freeze({ hidesEye: true, colors: { k: "#07070b", s: "#2c2f3f", h: "#8a90a8", w: "#ffffff" },
      // Oversized, angular 😎 shades seen from the side: a three-row brow that juts
      // far past the face, and a glossy black lens cut to a straight 45° wedge.
      side: [["line",[[7,3],[4,6]],"k"],["line",[[7,4],[4,7]],"k"],
        ["rows",7,1,["kkkkkkkkkkkkkkkkkkkkk","kkkkkkkkkkkkkkkkkkkkk","kkkkkkkkkkkkkkkkkkkk.","ksssssssssssssssskk..","ksswwhkkkkkkkkkkkk...","kswwhkkkkkkkkkkkk....","kwwhkkkkkkkkkkkk.....","kkhkkkkkkkkkkkh......",".kkkkkkkkkkkkk.......","..kkkkkkkkkkk........","...kkkkkkkkk........."]]] }),
    leaf: Object.freeze({ sink: 3, colors: { o: "#0f3a1a", l: "#2f9a48", g: "#b8ff9a", s: "#1f5c2a" },
      rows: [".ooo.......","ogllo...oo.","olgllo.oglo","ollglloollo",".olllglllo.","..ollslllo.","...oosooo..",".....s.....",".....s....."] }),
    crown: Object.freeze({ at: [0, 0], colors: { e: "#7a4a08", b: "#ffd84a", l: "#fff3a6", j: "#ff4f6d", w: "#ffffff" },
      tint: { astra: { e: "#5a2a88", b: "#c98bff", l: "#efd9ff" } },
      rows: [".....ww.....",".....wbe....","..ww..ebe...","..wwe..ebe..","...ebeebjbe.","ww..ebbbjlle","wbe.ebjblle.",".ebebbblle..","..ebjjlle...","...eblle....","....ele.....",".....e......"] }),
    halo: Object.freeze({ at: [1, 0], colors: { e: "#e0a51c", l: "#fff7b0" },
      rows: ["......ll.",".....llle","...ll..ee","..ll...e.","..l...e..",".l...ee..","ll..ee...","leee.....",".ee......"] }),
    headphones: Object.freeze({ colors: { c: "#15141c", m: "#3a3f5c", h: "#8a90ad", b: "#3fc6ff" },
      side: [["line",[[8,10],[8,6],[9,4],[11,2],[14,0],[18,0],[20,1]],"c"],["line",[[9,10],[9,6],[10,4],[12,2],[14,1],[18,1]],"h"],
        ["rows",6,9,[".cccc.","cmmmmc","cmbbmc","cmbbmc","cmbbmc","cmmmmc",".cccc."]],
        ["line",[[11,15],[13,17],[15,18]],"c"],["rows",15,17,["bb","bb"]]] }),
    antenna: Object.freeze({ sink: 2, colors: { e: "#7a1d24", b: "#ff5a4e", l: "#ffd0c8", s: "#4b4f63", h: "#9aa0b8" },
      rows: [".eee.","eblbe","ebbbe",".eee.","..s..","..h..","..s..",".sss."] }),
  });
  const DIRECTIONS = [[0,-1],[-1,0],[0,1],[1,0]];
  const slot = (x,y) => y * SIZE + x;
  const inFrame = (x,y) => x >= 2 && x <= 29 && y >= 2 && y <= 29;
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
  function makeMask(test) {
    const mask=new Uint8Array(SIZE*SIZE);
    for(let y=2;y<=29;y++)for(let x=2;x<=29;x++)if(test(x,y))mask[slot(x,y)]=1;
    return mask;
  }
  const ASTRA = [[13,2],[18,2],[21,5],[21,6],[25,6],[28,9],[29,13],[27,16],[29,19],[28,23],[25,26],[21,26],[18,29],[13,29],[10,26],[6,26],[3,23],[2,19],[4,16],[2,13],[3,9],[7,6],[10,6]];
  const ARM_ANGLES = [-94,-58,-25,13,49,83,113,150,185,221,252];
  const ARM_LENGTHS = [13.1,11.1,13.8,12.1,13,10.8,13.6,11.5,13.3,10.6,9.1];
  function ghostMask(frame) {
    return makeMask((x,y)=>{
      if(y<16)return ellipse(x,y,15.5,15.5,12.8,12.5);
      const bottom=26+Math.round(1.5*Math.cos((x-5)*Math.PI*2/9+frame*Math.PI/2));
      return x>=3&&x<=28&&y<=bottom;
    });
  }
  function claudeMask(frame) {
    const arms=ARM_ANGLES.map((degrees,i)=>{
      const a=degrees*Math.PI/180;
      const pulse=[0,.6,0,-.6][(frame+i)%4], r=ARM_LENGTHS[i]-1.5+pulse;
      return [15.5+Math.cos(a)*5,16+Math.sin(a)*5,15.5+Math.cos(a)*r,16+Math.sin(a)*r];
    });
    return makeMask((x,y)=>ellipse(x,y,15.5,16,7.3,7.5)||arms.some(a=>capsule(x,y,...a,1.7)));
  }
  function geminiMask(frame) {
    const [verticalRadius,horizontalRadius]=[[13.5,13.5],[13,13.5],[13,13],[13.5,13]][frame], cx=15.5,cy=15.5;
    return makeMask((x,y)=>{
      const dx=Math.abs(x-cx),dy=Math.abs(y-cy),vertical=dy>dx;
      const radius=vertical?verticalRadius:horizontalRadius;
      // Concave sides and four tapered points, all connected to the eye's center.
      return dx<=radius&&dy<=radius&&Math.sqrt(dx/radius)+Math.sqrt(dy/radius)<=1.22;
    });
  }
  // The top edge of the closed right-facing star, for seating hats.
  let crownTop=null;
  function crownLine() {
    if(crownTop)return crownTop;
    crownTop=Array(SIZE).fill(SIZE);
    for(let y=2;y<=29;y++)for(let x=2;x<=29;x++)if(polygon(x,y,ASTRA))crownTop[x]=Math.min(crownTop[x],y);
    return crownTop;
  }
  function raster(kind,{id="blinky",direction=3,frame=0,state="CHASE",blink=false,skin="astra",accessory="default"}={}) {
    direction=Number.isInteger(direction)&&direction>=0&&direction<4?direction:3;
    frame=Number.isFinite(frame)?Math.max(0,Math.floor(frame)):0;
    const pixels=Array(SIZE*SIZE).fill(null);
    let bodyMask=null;
    const put=(x,y,c)=>{if(inFrame(x,y))pixels[slot(x,y)]=c;};
    const rect=(x,y,w,h,c)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)put(xx,yy,c);};
    const oval=(cx,cy,rx,ry,c)=>{for(let y=Math.floor(cy-ry);y<=Math.ceil(cy+ry);y++)for(let x=Math.floor(cx-rx);x<=Math.ceil(cx+rx);x++)if(ellipse(x,y,cx,cy,rx,ry))put(x,y,c);};
    function line(x1,y1,x2,y2,c) {
      let dx=Math.abs(x2-x1),sx=x1<x2?1:-1,dy=-Math.abs(y2-y1),sy=y1<y2?1:-1,error=dx+dy;
      for(;;){put(x1,y1,c);if(x1===x2&&y1===y2)break;const e=2*error;if(e>=dy){error+=dy;x1+=sx;}if(e<=dx){error+=dx;y1+=sy;}}
    }
    const path=(points,c)=>{for(let i=1;i<points.length;i++)line(...points[i-1],...points[i],c);};
    function paint(mask,palette,colorAt) {
      bodyMask=mask;
      for(let y=2;y<=29;y++)for(let x=2;x<=29;x++) {
        const i=slot(x,y);if(!mask[i])continue;
        const edge=!mask[i-1]||!mask[i+1]||!mask[i-SIZE]||!mask[i+SIZE];
        put(x,y,colorAt?colorAt(x,y,edge):edge?palette.edge:y>=24||!mask[slot(x+2,y)]?palette.shade:y<8&&x<20?palette.light:palette.body);
      }
    }
    function clipFace() {
      if(bodyMask)for(let i=0;i<pixels.length;i++)if(!bodyMask[i])pixels[i]=null;
    }
    // Accessories may use the whole 32-pixel frame, beyond the body's 28.
    function wear(piece) {
      const colors=Object.assign({},piece.colors,piece.tint&&piece.tint[skin]);
      const dot=(x,y,key)=>{if(x>=0&&x<SIZE&&y>=0&&y<SIZE&&colors[key]&&(!piece.clip||pixels[slot(x,y)]))pixels[slot(x,y)]=colors[key];};
      const rows=(ax,ay,list)=>list.forEach((row,y)=>{for(let x=0;x<row.length;x++)dot(ax+x,ay+y,row[x]);});
      function draw(ops,ox=0,oy=0) {
        for(const [op,...a] of ops) {
          if(op==="rows")rows(a[0]+ox,a[1]+oy,a[2]);
          else if(op==="rect"){for(let y=a[1];y<a[1]+a[3];y++)for(let x=a[0];x<a[0]+a[2];x++)dot(x+ox,y+oy,a[4]);}
          else if(op==="oval"){for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(ellipse(x,y,a[0]+ox,a[1]+oy,a[2],a[3]))dot(x,y,a[4]);}
          else if(op==="line"){for(let i=1;i<a[0].length;i++){
            let [x1,y1]=a[0][i-1].map((v,k)=>Math.round(v+(k?oy:ox)));const [x2,y2]=a[0][i].map((v,k)=>Math.round(v+(k?oy:ox)));
            let dx=Math.abs(x2-x1),sx=x1<x2?1:-1,dy=-Math.abs(y2-y1),sy=y1<y2?1:-1,error=dx+dy;
            for(;;){dot(x1,y1,a[1]);if(x1===x2&&y1===y2)break;const e=2*error;if(e>=dy){error+=dy;x1+=sx;}if(e<=dx){error+=dx;y1+=sy;}}}}
        }
      }
      if(piece.side)draw(piece.side);
      if(piece.eye)draw(piece.eye,...EYE);
      if(piece.rows&&piece.at)rows(piece.at[0],piece.at[1],piece.rows);
      else if(piece.rows) {
        const w=piece.rows[0].length,cx=HEAD_X,top=crownLine();
        rows(cx-Math.floor(w/2),Math.min(top[cx-1],top[cx],top[cx+1])+piece.sink-piece.rows.length,piece.rows);
      }
    }
    function star(cx,cy,r,palette) {
      const m=makeMask((x,y)=>Math.sqrt(Math.abs(x-cx)/r)+Math.sqrt(Math.abs(y-cy)/r)<=1.22);
      paint(m,palette);
    }
    if(kind==="pacman"||kind==="death") {
      const look=Object.hasOwn(SKINS,skin)?SKINS[skin]:SKINS.astra;
      const worn=accessory==="none"?null:ACCESSORIES[accessory==="default"?look.accessory:accessory]||null;
      const dying=kind==="death", f=dying?Math.min(frame,9):frame%4;
      if(dying&&f===9)return pixels;
      if(dying&&f>=7){star(15.5,15.5,f===7?6:3,look.palette);return pixels;}
      const squash=dying?[1,1,.96,.86,.72,.5,.3][f]:1;
      const opening=dying?[0,.12,.32,.55,.86,1.15,1.38][f]:[0,.16,.4,.69][f];
      const mask=makeMask((x,y)=>{
        const yy=(y-15.5)/squash+15.5;
        if(!polygon(x,yy,ASTRA))return false;
        if(!opening)return true;
        const angle=dying?Math.atan2(x-15.5,15.5-yy):Math.atan2(yy-15.5,x-17.5);
        return Math.abs(angle)>=opening;
      });
      paint(mask,look.palette);
      if(look.lips&&opening) {
        // Colour only the rim the mouth cuts, not the star's outer outline.
        for(let y=2;y<=29;y++)for(let x=2;x<=29;x++) {
          if(!mask[slot(x,y)])continue;
          const cut=[[1,0],[-1,0],[0,1],[0,-1]].some(([ox,oy])=>!mask[slot(x+ox,y+oy)]&&polygon(x+ox,(y+oy-15.5)/squash+15.5,ASTRA));
          if(cut)put(x,y,look.lips);
        }
      }
      if(!dying||f===0) {
        // Keep the entire black eye above and behind the widest mouth cut.
        // The four-point sparkle uses the original white, with tapered sides.
        if(!worn||!worn.hidesEye)oval(17,8.5,4.5,4.5,"#15141c");
        const glint=worn&&worn.hidesEye?[]:["....#..","...##..","#####..",".#####.","..#####","..##...","..#...."];
        glint.forEach((row,y)=>{for(let x=0;x<row.length;x++)if(row[x]==="#")put(14+x,5+y,"#ffffff");});
        if(look.mole)put(21,20,"#6b1238");
      }
      clipFace();
      if(!dying||f===0) {
        // Lashes and accessories sit on the silhouette, so they are added after clipping.
        if(look.lashes)for(const [x,y] of [[18,3],[20,3],[21,4],[22,5]])put(x,y,"#15141c");
        // Dressed facing right; the mirror or rotation below carries the piece with the head.
        if(worn)wear(worn);
      }
      if(!dying&&direction===1) {
        // Mirror rather than rotate so Astra keeps the eye on top when facing left.
        const copy=pixels.slice();
        for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)pixels[slot(x,y)]=copy[slot(SIZE-1-x,y)];
      } else if(!dying) {
        const turns=[3,2,1,0][direction];
        for(let n=0;n<turns;n++) {
          const copy=pixels.slice();
          for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)pixels[slot(x,y)]=copy[slot(y,SIZE-1-x)];
        }
      }
      return pixels;
    }
    if(kind==="spirit") {
      // A player caught in Versus: a ghost in their own colours, with their star eye.
      const look=Object.hasOwn(SKINS,skin)?SKINS[skin]:SKINS.astra;
      paint(ghostMask(frame%4),look.palette);
      const [dx,dy]=DIRECTIONS[direction];
      oval(15.5+dx*2,13+dy,4.3,4.3,"#15141c");
      put(14+dx*2,11+dy,"#ffffff");put(15+dx*2,11+dy,"#ffffff");put(14+dx*2,12+dy,"#ffffff");
      clipFace();
      return pixels;
    }
    id=Object.hasOwn(CAST,id)?id:"blinky";
    frame%=4;
    const scared=state==="FRIGHTENED"||state==="WARNING", warning=state==="WARNING", eaten=state==="EATEN";
    const palette=scared?(warning?WARNING:BLUE):PALETTES[id];
    const [dx,dy]=DIRECTIONS[direction], face=warning?"#bb275a":"#fff8e9";
    blink=blink&&!scared&&!eaten;
    if(!eaten) {
      const mask=id==="blinky"?claudeMask(frame):id==="clyde"?geminiMask(frame):ghostMask(frame);
      if(id==="clyde"&&!scared) {
        const colors=["#ee465d","#9d49e9","#3964ee","#198cde","#18c9c9","#32cf96","#91d75c","#f9d03c","#f99a35"];
        paint(mask,palette,(x,y,edge)=>{
          const angle=(Math.atan2(y-15.5,x-15.5)+Math.PI/2+Math.PI*2)%(Math.PI*2);
          const color=colors[Math.min(colors.length-1,Math.floor(angle/(Math.PI*2)*colors.length))];
          if(edge)return color;
          if(x+y<22&&x>9)return "#ffd57c";
          return color;
        });
        path([[15,4],[15,6],[13,8]],"#fff1ad");
        path([[5,15],[7,15]],"#fff6b9");
        put(25,16,"#9beeff");put(16,25,"#b1ffe3");
      } else paint(mask,palette);
      if(id==="pinky") {
        const panel=scared?(warning?"#ffe0da":"#889cf5"):"#ffbe91";
        const rim=scared?(warning?"#df8caa":"#5474cf"):"#f69568";
        rect(8,10,16,14,rim);rect(6,12,20,10,rim);
        rect(8,11,16,12,panel);rect(7,13,18,8,panel);
        if(!scared)rect(9,11,13,1,"#ffdfb9");
      }
      if(id==="inky") {
        path([[6,13],[6,10],[8,7],[11,5],[14,5]],scared?palette.light:"#909bb7");
        path([[7,10],[8,8],[10,7]],scared?"#bfcdff":"#e0e6f6");
        if(!scared)path([[5,22],[5,24],[7,26]],"#424b66");
      }
    }
    if(id==="blinky") {
      for(const cx of [12+dx,20+dx]) {
        const cy=16+dy;
        if(blink){path([[cx-2,cy],[cx,cy+1],[cx+2,cy]],"#25202c");continue;}
        if(eaten)oval(cx,cy,3.4,4.6,"#605866");
        oval(cx,cy,2.7,3.8,"#211923");rect(cx-1,cy-2,2,2,"#fffaf0");
      }
      if(scared)path([[10,23],[12,21],[14,23],[16,21],[18,23],[20,21],[22,23]],face);
    } else if(id==="pinky") {
      for(const x of [9,18]) {
        if(blink){path([[x,17],[x+2,18],[x+4,17]],"#392a30");continue;}
        // Identical eyes in the face panel and in the returning-eyes state.
        rect(x+1,13,4,7,"#fffdf4");rect(x,14,6,5,"#fffdf4");
        rect(x+2+dx,15+dy,3,4,"#22202b");
      }
      if(scared)path([[9,22],[11,20],[13,22],[15,20],[17,22],[19,20],[22,22]],warning?"#be315c":"#253775");
    } else if(id==="inky") {
      for(const cx of [11+dx,21+dx]) {
        const cy=16+dy;
        if(blink){rect(cx-2,cy,5,2,"#ffffff");continue;}
        oval(cx,cy,3.5,5.3,"#131625");
        oval(cx,cy,2.5,4.3,"#ffffff");
      }
      if(scared) {
        path([[8,24],[10,22],[12,24],[14,22],[16,24],[18,22],[20,24],[22,22],[24,24]],warning?"#aa2750":"#ffffff");
        put(6,19,palette.light);put(25,19,palette.light);
      }
    } else {
      const outline=scared?(warning?"#bd4467":"#9ed8ff"):"#efcc68";
      if(blink) {
        // A tapered almond lid, with the iris fully occluded, not a flat bar.
        path([[6,15],[9,17],[12,18],[19,18],[22,17],[25,15]],"#122759");
        path([[9,16],[12,17],[19,17],[22,16]],"#fff1b5");
      } else {
        for(let x=5;x<=26;x++) {
          const half=Math.max(0,Math.round(5.5*(1-Math.abs(x-15.5)/10.5)));
          for(let y=16-half;y<=16+half;y++)put(x,y,y===16-half||y===16+half?outline:"#fffbea");
        }
        const cx=16+dx*2,cy=16+dy;
        oval(cx,cy,4.7,4.8,warning?"#f19c36":scared?"#4ec9f0":"#28bfc3");
        oval(cx,cy,3.5,3.8,warning?"#bc3153":scared?"#2475c0":"#d9b842");
        oval(cx,cy,scared?2.7:2.5,scared?3.6:3,"#122342");
        rect(cx-1,cy-2,2,2,"#ffffff");
      }
    }
    if(!eaten)clipFace();
    return pixels;
  }
  const api=Object.freeze({ SIZE,LOGICAL_SIZE,RENDER_SCALE,CAST,PALETTES,SKINS,ACCESSORIES,raster });
  root.AstraCharacters=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
