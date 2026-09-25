/* Inspect the exact cached game sprites at integer scales, with live animation. */
"use strict";
(() => {
  const art=window.PacmanArt,canvas=document.getElementById("gallery"),gc=canvas.getContext("2d");
  gc.imageSmoothingEnabled=false;
  function text(value,x,y,color="#cdd8ff"){gc.font="12px monospace";gc.fillStyle=color;gc.fillText(value,x,y);}
  function tile(image,x,y,size=64){gc.drawImage(image,x,y,size,size);}
  const headers=["UP","LEFT","DOWN","RIGHT","SCARED","WARNING","EYES","BLINK","MOTION 1","MOTION 2","MOTION 3","MOTION 4"];
  headers.forEach((h,i)=>text(h,100+i*71,22));
  Object.keys(art.CAST).forEach((id,row)=>{
    const y=40+row*82;text(art.CAST[id].name,8,y+32,art.CAST[id].color);
    for(let dir=0;dir<4;dir++)tile(art.sprite("ghost",{id,direction:dir}),100+dir*71,y);
    ["FRIGHTENED","WARNING","EATEN"].forEach((state,i)=>tile(art.sprite("ghost",{id,state,direction:3}),384+i*71,y));
    tile(art.sprite("ghost",{id,blink:true}),597,y);
    for(let f=0;f<4;f++)tile(art.sprite("ghost",{id,frame:f}),668+f*71,y);
  });
  text("ASTRA",8,411,"#ffe940");
  for(let dir=0;dir<4;dir++)tile(art.sprite("pacman",{direction:dir,frame:2}),100+dir*71,380);
  for(let f=0;f<4;f++)tile(art.sprite("pacman",{direction:3,frame:f}),384+f*71,380);
  text("DEATH",8,505,"#ffe940");
  for(let f=0;f<10;f++)tile(art.sprite("death",{frame:f}),100+f*71,474);
  text("NATIVE 32PX",8,592,"#8796bc");
  tile(art.sprite("pacman",{frame:2}),116,569,32);
  Object.keys(art.CAST).forEach((id,i)=>tile(art.sprite("ghost",{id}),187+i*71,569,32));
  text("28-pixel silhouettes / 32-pixel frames / upper rows displayed at exactly 2x",100,632);
  text("Returning eyes retain each character's identity. Blank last death frame is intentional.",100,653);
  text("PICKUPS",8,712,"#ffe940");
  [["chip",{}],["gpu",{}],...window.AstraItems.BONUS_NAMES.map(name=>["bonus",{name}])].forEach(([kind,opts],i)=>{
    tile(art.sprite(kind,opts),100+i*71,680);
    text(kind==="bonus"?opts.name:kind.toUpperCase(),100+i*71,758,"#8796bc");
  });

  const live=document.getElementById("animatedGallery"),lc=live.getContext("2d");lc.imageSmoothingEnabled=false;
  const motion=matchMedia("(prefers-reduced-motion: reduce)");
  let playing=true,clock=0,last=null;
  const toggle=document.getElementById("animateSprites");
  toggle.onclick=()=>{playing=!playing;toggle.textContent=playing?"Pause animation":"Play animation";toggle.setAttribute("aria-pressed",String(!playing));};
  function animate(now){
    if(last!==null&&playing&&!document.hidden&&!motion.matches)clock+=Math.min(.1,(now-last)/1000);
    last=now;
    lc.fillStyle="#000";lc.fillRect(0,0,live.width,live.height);
    const selected=document.getElementById("spriteState").value,direction=Number(document.getElementById("spriteDirection").value);
    const frame=Math.floor(clock*10)%4,blink=selected==="BLINK";
    [null,...Object.keys(art.CAST)].forEach((id,i)=>{
      const x=8+i*190;
      lc.fillStyle=id?art.CAST[id].color:"#ffe52c";lc.font="14px monospace";lc.fillText(id?art.CAST[id].name:"ASTRA",x+10,22);
      const image=art.sprite(id?"ghost":"pacman",{id:id||"blinky",direction,frame,state:blink?"CHASE":selected,blink});
      for(const [size,y] of [[32,38],[64,91],[128,178]])lc.drawImage(image,x+10,y,size,size);
    });
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
})();
