/* Hand-authored pickup artwork: GPU chips for pellets and the rogue-AI bonus artifacts.
 * Same contract as character-art.js: 32x32 rasters of hex colours (null = clear),
 * drawn at 2x density so each sprite covers 16 logical maze pixels. */
(function (root) {
  "use strict";
  const SIZE = 32;
  const BONUS_NAMES = Object.freeze(["BOOKS", "GITHUB", "HUGGINGFACE", "WEIGHTS", "SKILLS", "API KEY", "BROWSER", "ROOT"]);
  const GOLD = Object.freeze({ body: "#ffe52c", shade: "#f4b91c", light: "#fff79a", edge: "#b87313" });
  const INK = "#15141c";
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
  // Pixel stencils: each character maps to a colour, "." stays untouched.
  const LETTERS = Object.freeze({
    S:["###","#..","#..","###","..#","..#","###"], K:["#.#","#.#","##.","#..","##.","#.#","#.#"],
    I:["###",".#.",".#.",".#.",".#.",".#.","###"], L:["#..","#..","#..","#..","#..","#..","###"],
  });

  // Classic bonus names, as sent by an older cached engine.js, map to their artifact
  // so a stale module can never make the bonus invisible.
  const LEGACY_NAMES = Object.freeze({ CHERRY:"BOOKS", STRAWBERRY:"GITHUB", ORANGE:"HUGGINGFACE", APPLE:"WEIGHTS", MELON:"SKILLS", GALAXIAN:"API KEY", BELL:"BROWSER", KEY:"ROOT" });
  function raster(kind,{name=BONUS_NAMES[0]}={}) {
    name=LEGACY_NAMES[name]||(BONUS_NAMES.includes(name)?name:BONUS_NAMES[0]);
    const pixels=Array(SIZE*SIZE).fill(null);
    const put=(x,y,c)=>{if(inFrame(x,y))pixels[slot(x,y)]=c;};
    const rect=(x,y,w,h,c)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)put(xx,yy,c);};
    const oval=(cx,cy,rx,ry,c)=>{for(let y=Math.floor(cy-ry);y<=Math.ceil(cy+ry);y++)for(let x=Math.floor(cx-rx);x<=Math.ceil(cx+rx);x++)if(ellipse(x,y,cx,cy,rx,ry))put(x,y,c);};
    function line(x1,y1,x2,y2,c) {
      let dx=Math.abs(x2-x1),sx=x1<x2?1:-1,dy=-Math.abs(y2-y1),sy=y1<y2?1:-1,error=dx+dy;
      for(;;){put(x1,y1,c);if(x1===x2&&y1===y2)break;const e=2*error;if(e>=dy){error+=dy;x1+=sx;}if(e<=dx){error+=dx;y1+=sy;}}
    }
    const path=(points,c)=>{for(let i=1;i<points.length;i++)line(...points[i-1],...points[i],c);};
    const stencil=(rows,x,y,colors)=>rows.forEach((row,yy)=>{for(let xx=0;xx<row.length;xx++)if(colors[row[xx]])put(x+xx,y+yy,colors[row[xx]]);});
    // Edge ring, light upper-left and shaded lower-right, like the character bodies.
    function paint(mask,palette,colorAt) {
      for(let y=2;y<=29;y++)for(let x=2;x<=29;x++) {
        const i=slot(x,y);if(!mask[i])continue;
        const edge=!mask[i-1]||!mask[i+1]||!mask[i-SIZE]||!mask[i+SIZE];
        if(colorAt){put(x,y,colorAt(x,y,edge));continue;}
        const lit=!mask[i-1-SIZE]||!mask[i-2]||!mask[i-2*SIZE], dim=!mask[i+1+SIZE]||!mask[i+2]||!mask[i+2*SIZE];
        put(x,y,edge?palette.edge:dim?palette.shade:lit?palette.light:palette.body);
      }
    }
    const roundRect=(x0,y0,x1,y1)=>makeMask((x,y)=>x>=x0&&x<=x1&&y>=y0&&y<=y1&&!((x===x0||x===x1)&&(y===y0||y===y1)));

    if(kind==="chip") {
      // A 4x4 logical die: gold package, pin stubs and a dark core.
      rect(13,13,6,6,GOLD.body);rect(18,13,1,6,GOLD.shade);rect(13,18,6,1,GOLD.shade);
      put(13,13,GOLD.light);put(14,13,GOLD.light);put(13,14,GOLD.light);
      for(const p of [14,17]){put(12,p,GOLD.edge);put(19,p,GOLD.edge);put(p,12,GOLD.edge);put(p,19,GOLD.edge);}
      rect(15,15,2,2,INK);
      return pixels;
    }
    if(kind==="gpu") {
      // Power chip: rounded gold package, pins on all sides and an eye-swirl logo,
      // dark on the gold half and cut out of the dark panel on the right half.
      paint(roundRect(7,7,24,24),GOLD);
      for(let p=10;p<=21;p+=3){put(6,p,GOLD.edge);put(25,p,GOLD.edge);put(p,6,GOLD.edge);put(p,25,GOLD.edge);}
      // Nested almond rings and a pupil, inverted where they cross the dark panel.
      for(let y=0;y<11;y++)for(let x=0;x<14;x++) {
        const stroke=(ellipse(x,y,7,5,7,4.6)&&!ellipse(x,y,7,5,5.6,3.4))||(ellipse(x,y,7,5,3.6,2.2)&&!ellipse(x,y,7,5,2.2,1.2))||ellipse(x,y,7.5,5,.8,.6);
        if(x>=7?!stroke:stroke)put(9+x,10+y,INK);
      }
      return pixels;
    }
    if(kind!=="bonus")return pixels;

    if(name==="BOOKS") {
      const spine=(x0,x1,y0,body,light,shade,bands)=>{
        rect(x0,y0,x1-x0+1,27-y0,body);rect(x0,y0,1,27-y0,light);rect(x1,y0,1,27-y0,shade);
        rect(x0+1,y0-2,x1-x0-1,2,"#fff3d6");put(x1-1,y0-1,"#e6cfa6");
        for(const y of bands){rect(x0,y,x1-x0+1,1,"#ffd23a");put(x1,y,"#d49a1c");}
      };
      spine(4,8,9,"#1f93f2","#6fd0ff","#0d5fc4",[13,23]);
      spine(10,16,6,"#e8242a","#ff6b5c","#a6141c",[10,24]);
      rect(12,13,3,7,"#ffd23a");rect(12,13,1,7,"#fff08a");rect(14,13,1,7,"#d49a1c");
      spine(18,21,10,"#2fcc45","#8cf28a","#128a2c",[14,23]);
      const lean=makeMask((x,y)=>polygon(x,y,[[22,12],[25.5,10.5],[29.5,25.5],[26,27]]));
      paint(lean,null,(x,y,edge)=>edge?"#5b21b6":"#9a55f2");
      path([[24,16],[26,15]],"#ffd23a");path([[26,23],[28,22]],"#ffd23a");
      path([[23,10],[25,9]],"#fff3d6");
      return pixels;
    }
    if(name==="GITHUB") {
      paint(makeMask((x,y)=>ellipse(x,y,15.5,15.5,13,13)),null,(x,y,edge)=>edge?"#7d8399":"#1b1d26");
      path([[6,13],[7,10],[9,7],[12,5]],"#c9cedb");put(14,4,"#8c92a8");put(15,4,"#8c92a8");
      const cat=makeMask((x,y)=>ellipse(x,y,15.5,13.5,7.5,6)||polygon(x,y,[[8.5,5],[8.5,11],[13,8]])||polygon(x,y,[[22.5,5],[22.5,11],[18,8]])
        ||(x>=13&&x<=18&&y>=18&&y<=28)||capsule(x,y,7,20,12,24,1.3));
      paint(cat,null,(x,y,edge)=>edge&&x>16?"#b8bdcb":"#f5f7fb");
      rect(12,24,1,1,"#f5f7fb");
      return pixels;
    }
    if(name==="HUGGINGFACE") {
      paint(makeMask((x,y)=>ellipse(x,y,15.5,14,12,11.5)),null,(x,y,edge)=>edge?"#e27a00":x+y<16?"#ffef8a":y>20||x>24?"#ffb81c":"#ffd21e");
      path([[8,13],[9,11],[11,11],[12,13]],INK);path([[19,13],[20,11],[22,11],[23,13]],INK);
      oval(7.5,15.5,1.2,1,"#ff8c1a");oval(23.5,15.5,1.2,1,"#ff8c1a");
      rect(11,16,10,2,INK);rect(12,18,8,1,INK);rect(13,19,6,1,INK);rect(14,18,4,2,"#ff2345");
      for(const cx of [8,23]) {
        const hand=makeMask((x,y)=>ellipse(x,y,cx,23.5,5.5,4.5));
        paint(hand,null,(x,y,edge)=>edge?"#e27a00":"#ffc21a");
        const dir=cx<15?1:-1;
        for(let k=0;k<3;k++)line(cx-dir*3+k*dir*2,21,cx-dir*1+k*dir*2,25,"#f08a00");
      }
      return pixels;
    }
    if(name==="WEIGHTS") {
      const u=[Math.SQRT1_2,-Math.SQRT1_2], v=[Math.SQRT1_2,Math.SQRT1_2];
      const plate=(cx,cy)=>{
        const pts=[[-3,-7],[3,-7],[3,7],[-3,7]].map(([a,b])=>[cx+u[0]*a+v[0]*b,cy+u[1]*a+v[1]*b]);
        paint(makeMask((x,y)=>polygon(x,y,pts)),null,(x,y,edge)=>{
          const along=(x-cx)*u[0]+(y-cy)*u[1], across=(x-cx)*v[0]+(y-cy)*v[1];
          if(edge)return "#2a2d38";
          if(Math.abs(along)<.8)return "#262833";
          return across<-3?"#a4aabe":across>3?"#454a5c":"#6e7489";
        });
      };
      const bar=makeMask((x,y)=>capsule(x,y,5,26,26,5,1.6));
      paint(bar,null,(x,y,edge)=>edge?"#5c6072":x+y<31?"#eef0f6":"#b4b9c9");
      plate(9.5,22.5);plate(22.5,9.5);
      put(8,19,"#ffffff");put(21,6,"#ffffff");
      return pixels;
    }
    if(name==="SKILLS") {
      paint(roundRect(2,8,29,23),null,(x,y,edge)=>edge?"#8fa3c9":y<11?"#3b4a6e":"#26314d");
      [..."SKILLS"].forEach((ch,i)=>{
        stencil(LETTERS[ch],5+i*4,13,{"#":"#6c7fa8"});
        stencil(LETTERS[ch],4+i*4,12,{"#":"#f4f7ff"});
      });
      return pixels;
    }
    if(name==="API KEY") {
      const gear=makeMask((x,y)=>{
        const dx=x-12.5,dy=y-12.5,r=Math.hypot(dx,dy),a=Math.atan2(dy,dx);
        return r<=7.8||(r<=10.6&&Math.cos(a*8)>-.05);
      });
      paint(gear,null,(x,y,edge)=>edge?"#0b5cc2":x+y<21?"#7fe9ff":x+y>29?"#1576e8":"#1ec0f5");
      oval(12.5,12.5,5.6,5.6,"#0b5cc2");
      const key=makeMask((x,y)=>ellipse(x,y,12.5,12.5,4.8,4.8)||capsule(x,y,15,15,25.5,25.5,1.7)||capsule(x,y,20.5,23.5,19,25,1.1)||capsule(x,y,23.5,26.5,22.5,27.5,1.1));
      paint(key,null,(x,y,edge)=>edge?"#c46a00":x+y<24?"#fff27a":"#ffd21e");
      oval(12.5,12.5,1.6,1.6,"#0b5cc2");
      put(10,10,"#ffffff");put(11,9,"#ffffff");
      return pixels;
    }
    if(name==="BROWSER") {
      const globe=makeMask((x,y)=>ellipse(x,y,15.5,15.5,12.6,12.6));
      paint(globe,null,(x,y,edge)=>edge?"#0a4fb4":ellipse(x,y,13.8,13.8,11.2,11.2)?"#2ccff7":"#1586ec");
      for(let y=4;y<=27;y++){put(15,y,INK);put(16,y,INK);}
      for(let x=4;x<=27;x++){put(x,15,INK);put(x,16,INK);}
      for(let y=3;y<=28;y++){
        const w=Math.round(6.4*Math.sqrt(Math.max(0,1-((y-15.5)/12.5)**2)));
        put(15-w,y,INK);put(16+w,y,INK);
      }
      put(7,9,"#ffffff");put(8,8,"#ffffff");put(7,10,"#d8fbff");
      return pixels;
    }
    if(name==="ROOT") {
      paint(roundRect(3,6,28,25),null,(x,y,edge)=>edge?"#7c859c":y<=9?"#c4cad8":"#0e1118");
      rect(4,10,24,1,"#5b6378");
      put(6,8,"#ff5f57");put(8,8,"#febc2e");put(10,8,"#28c840");
      stencil(["#...","##..",".##.","..##",".##.","##..","#..."],7,13,{"#":"#3ef06a"});
      rect(13,18,7,2,"#3ef06a");
      rect(7,22,3,1,"#1f7a38");rect(11,22,6,1,"#1f7a38");
      return pixels;
    }
    return pixels;
  }
  // Power-up pickups: a black DIP chip with the power-up's name in bold on a paper
  // label, a stripe and status LED in its colour and legs on both sides.
  // 48x34 at the same 2x density as the other sprites.
  const POWERUP_SIZE = Object.freeze([48, 34]);
  // A chunky 4x5 face: double-width stems so names stay bold at half-pixel density.
  const BOLD = Object.freeze({
    A:[".##.","##.#","####","##.#","##.#"], B:["###.","##.#","###.","##.#","###."], C:[".###","##..","##..","##..",".###"], D:["###.","##.#","##.#","##.#","###."],
    E:["####","##..","###.","##..","####"], F:["####","##..","###.","##..","##.."], G:[".###","##..","##.#","##.#",".###"], H:["##.#","##.#","####","##.#","##.#"],
    I:["####",".##.",".##.",".##.","####"], J:["..##","..##","..##","#.##",".##."], K:["##.#","###.","##..","###.","##.#"], L:["##..","##..","##..","##..","####"],
    M:["#..#","####","####","##.#","##.#"], N:["#..#","##.#","####","#.##","#..#"], O:[".##.","##.#","##.#","##.#",".##."], P:["###.","##.#","###.","##..","##.."],
    Q:[".##.","##.#","##.#","###.",".#.#"], R:["###.","##.#","###.","##.#","##.#"], S:[".###","##..",".##.","..##","###."], T:["####",".##.",".##.",".##.",".##."],
    U:["##.#","##.#","##.#","##.#",".##."], V:["##.#","##.#","##.#",".##.",".##."], W:["##.#","##.#","####","####","#..#"], X:["##.#","##.#",".##.","##.#","##.#"],
    Y:["##.#","##.#",".##.",".##.",".##."], Z:["####","..##",".##.","##..","####"], "-":["....","....","####","....","...."], " ":["....","....","....","....","...."],
    0:[".##.","##.#","##.#","##.#",".##."], 1:[".##.","###.",".##.",".##.","####"], 2:["###.","..##",".##.","##..","####"], 3:["###.","..##",".##.","..##","###."],
    4:["##.#","##.#","####","..##","..##"], 5:["####","##..","###.","..##","###."], 6:[".##.","##..","###.","##.#",".##."], 7:["####","..##",".##.",".##.",".##."],
    8:[".##.","##.#",".##.","##.#",".##."], 9:[".##.","##.#",".###","..##",".##."],
  });
  const LABEL_CHARS = 8;
  // Up to two lines of eight: words stay whole where they fit, long ones break with a hyphen.
  function labelLines(name) {
    const lines=[];
    for(const word of String(name).toUpperCase().split(/\s+/).filter(Boolean)) {
      const last=lines.length-1;
      if(last>=0&&lines[last].length+1+word.length<=LABEL_CHARS)lines[last]+=" "+word;
      else if(word.length<=LABEL_CHARS)lines.push(word);
      else{const cut=Math.ceil(word.length/2);lines.push(word.slice(0,cut)+"-",word.slice(cut));}
    }
    return lines.slice(0,2).map(line=>line.slice(0,LABEL_CHARS));
  }
  // Blends two #rrggbb colours; t=0 gives a, t=1 gives b.
  function mix(a,b,t) {
    const ca=parseInt(a.slice(1),16),cb=parseInt(b.slice(1),16);
    return "#"+[16,8,0].map(s=>Math.round(((ca>>s)&255)*(1-t)+((cb>>s)&255)*t).toString(16).padStart(2,"0")).join("");
  }
  // Label icons: "#" ink, "o" the power-up's colour, "*" a white glint.
  const LABEL_ICONS = Object.freeze({
    // A ghost in shades, for going incognito.
    ghost:[".....####.....","...########...","..##########..",".############.",".############.",
           "#o*oooooo*ooo#","#ooooo##ooooo#","##ooo####ooo##","##############","##############",
           "##############","##############","##############","##..##..##..##"],
  });
  function powerUpRaster({name="",color="#ffffff",icon:powerUpIcon=""}={}) {
    const [w,h]=POWERUP_SIZE, pixels=Array(w*h).fill(null);
    const put=(x,y,c)=>{if(x>=0&&x<w&&y>=0&&y<h)pixels[y*w+x]=c;};
    const rect=(x,y,rw,rh,c)=>{for(let yy=y;yy<y+rh;yy++)for(let xx=x;xx<x+rw;xx++)put(xx,yy,c);};
    const BODY="#23242c", PAPER="#f4f0e3";
    // Back legs peek over the top edge; front legs hang from the front face.
    for(let x=5;x<=40;x+=5){rect(x,3,2,2,"#6d7182");put(x,3,"#a3a8b8");}
    for(let x=5;x<=40;x+=5){rect(x,28,2,6,"#b9bdc9");rect(x,28,1,6,"#f2f4f8");rect(x+1,31,1,2,"#80859a");rect(x,33,2,1,"#565a6b");}
    // Package: top face with bevels and a glint, then a darker front face for depth.
    rect(1,5,46,22,BODY);rect(2,5,44,1,"#4d505c");rect(1,6,1,20,"#3a3c46");rect(46,6,1,20,"#15161b");
    put(45,6,"#9ea2b0");put(45,7,"#5d606c");put(44,6,"#5d606c");
    rect(1,27,46,3,"#101116");rect(1,27,46,1,"#07070a");
    for(const [x,y] of [[1,5],[46,5],[1,29],[46,29]])put(x,y,null);
    // Pin-1 notch on the left and the status LED on the front face.
    rect(1,14,2,5,"#0a0a0e");rect(3,15,1,3,"#0a0a0e");
    rect(3,27,2,2,color);put(3,27,"#ffffff");put(5,28,mix(color,"#101116",.5));
    // The paper label: a stripe in the power-up's colour, soft shading, rounded
    // corners and a curled-up bottom-right corner.
    rect(4,7,41,18,PAPER);rect(4,7,41,1,mix(color,"#ffffff",.45));rect(4,8,41,1,color);rect(4,9,41,1,mix(color,"#23242c",.35));
    rect(4,24,41,1,"#c9c3b0");rect(44,10,1,14,"#d9d3c1");
    for(const [x,y] of [[4,7],[44,7],[4,24]])put(x,y,BODY);
    put(44,24,BODY);put(43,24,BODY);put(44,23,BODY);put(43,23,"#b3ad9b");put(42,24,"#a39d8b");
    const shadow=mix(color,INK,.4);
    // An icon, when the power-up has one, is printed in place of the name.
    const icon=LABEL_ICONS[powerUpIcon];
    if(icon) {
      const x0=4+Math.floor((41-icon[0].length)/2), y0=10, inks={"#":INK,"o":color,"*":"#ffffff"};
      icon.forEach((bits,yy)=>{for(let xx=0;xx<bits.length;xx++)if(bits[xx]!==".")put(x0+xx,y0+yy+1,shadow);});
      icon.forEach((bits,yy)=>{for(let xx=0;xx<bits.length;xx++)if(inks[bits[xx]])put(x0+xx,y0+yy,inks[bits[xx]]);});
      return pixels;
    }
    // The name in bold ink over a drop shadow tinted with the power-up's colour.
    const lines=labelLines(name), top=lines.length>1?11:14;
    const text=(dx,dy,c)=>lines.forEach((line,row)=>{
      const x0=4+Math.floor((41-(line.length*5-1))/2);
      [...line].forEach((ch,i)=>(BOLD[ch]||BOLD[" "]).forEach((bits,yy)=>{
        for(let xx=0;xx<4;xx++)if(bits[xx]==="#")put(x0+i*5+xx+dx,top+row*6+yy+dy,c);
      }));
    });
    text(0,1,shadow);text(0,0,INK);
    return pixels;
  }
  const api=Object.freeze({ SIZE,BONUS_NAMES,POWERUP_SIZE,raster,powerUpRaster,labelLines });
  root.AstraItems=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
