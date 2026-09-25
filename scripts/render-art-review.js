/* Optional development renderer: requires @napi-rs/canvas, never shipped to the game. */
"use strict";
const { createCanvas } = require("@napi-rs/canvas");
const fs = require("node:fs"), path = require("node:path");
global.document = { createElement: () => createCanvas(32,32) };
const Art = require("../art.js");
const canvas=createCanvas(1104,732), ctx=canvas.getContext("2d");
ctx.imageSmoothingEnabled=false;ctx.fillStyle="#090d19";ctx.fillRect(0,0,canvas.width,canvas.height);
function text(s,x,y,color="#cdd3e4",size=12){ctx.fillStyle=color;ctx.font=`${size}px monospace`;ctx.fillText(s,x,y);}
function tile(kind,opts,x,y,scale=2){ctx.drawImage(Art.sprite(kind,opts),x,y,32*scale,32*scale);}
text("ASTRA-MAN / PRODUCTION SPRITE REVIEW",20,28,"#ffe52c",18);
const headings=["UP","LEFT","DOWN","RIGHT","FRIGHTENED","WARNING","RETURNING","BLINK","MOTION 1","MOTION 2","MOTION 3","MOTION 4"];
headings.forEach((h,i)=>text(h,140+i*79,57));
Object.keys(Art.CAST).forEach((id,row)=>{
  const y=70+row*93;text(Art.CAST[id].name,20,y+30,Art.CAST[id].color,16);
  for(let dir=0;dir<4;dir++)tile("ghost",{id,direction:dir},140+dir*79,y);
  ["FRIGHTENED","WARNING","EATEN"].forEach((state,i)=>tile("ghost",{id,state},456+i*79,y));
  tile("ghost",{id,blink:true},693,y);
  for(let f=0;f<4;f++)tile("ghost",{id,frame:f},772+f*79,y);
});
text("ASTRA",20,472,"#ffe52c",16);
for(let d=0;d<4;d++)tile("pacman",{direction:d,frame:2},140+d*79,447);
for(let f=0;f<4;f++)tile("pacman",{frame:f},456+f*79,447);
text("DEATH",20,562,"#ffe52c",16);
for(let f=0;f<10;f++)tile("death",{frame:f},140+f*79,537);
text("NATIVE 32PX",20,649,"#8794bb");
["pacman",...Object.keys(Art.CAST)].forEach((id,i)=>tile(id==="pacman"?id:"ghost",{id,frame:2},145+i*63,626,1));
text("32px frames / 28px maximum silhouettes / 16 logical pixels in the maze",20,704,"#8794bb");
const out=path.join(__dirname,"../outputs/astra-sprite-review.png");
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,canvas.toBuffer("image/png"));console.log(out);
const detail=createCanvas(512,160),dc=detail.getContext("2d");
dc.fillStyle="#000";dc.fillRect(0,0,512,160);dc.imageSmoothingEnabled=false;
for(let frame=0;frame<4;frame++)dc.drawImage(Art.sprite("pacman",{direction:3,frame}),frame*128,16,128,128);
fs.writeFileSync(path.join(__dirname,"../outputs/astra-eye-detail.png"),detail.toBuffer("image/png"));
// Pickups: GPU chips and bonus artifacts at 4x and at the in-maze 16 logical pixels.
const Items=require("../item-art.js"),pickups=[["chip",{}],["gpu",{}],...Items.BONUS_NAMES.map(name=>["bonus",{name}])];
const sheet=createCanvas(20+pickups.length*140,236),sc=sheet.getContext("2d");
sc.imageSmoothingEnabled=false;sc.fillStyle="#000";sc.fillRect(0,0,sheet.width,sheet.height);
pickups.forEach(([kind,opts],i)=>{
  sc.drawImage(Art.sprite(kind,opts),20+i*140,20,128,128);sc.drawImage(Art.sprite(kind,opts),68+i*140,168,16,16);
  sc.fillStyle="#8794bb";sc.font="12px monospace";sc.fillText(kind==="bonus"?opts.name:kind.toUpperCase(),20+i*140,216);
});
fs.writeFileSync(path.join(__dirname,"../outputs/items-review.png"),sheet.toBuffer("image/png"));
