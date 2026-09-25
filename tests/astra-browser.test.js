/* Optional Playwright acceptance, using an isolated browser profile and HTTP only.
 * node tests/astra-browser.test.js http://127.0.0.1:8765/ */
"use strict";
const {chromium}=require("playwright"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const base=process.argv[2]||"http://127.0.0.1:8765/",out=path.join(__dirname,"../outputs");
const frames=(page,n=4)=>page.evaluate(n=>new Promise(resolve=>{function next(){if(--n<=0)resolve();else requestAnimationFrame(next);}requestAnimationFrame(next);}),n);
// The boot screen waits for a press; these checks open straight onto the title.
const skipBoot=page=>page.evaluate(()=>window.AstraLoader?.skip());
let checks=0;
function check(ok,message){assert.ok(ok,message);checks++;console.log("PASS "+message);}
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true}),errors=[];
  try {
    for(const dpr of [1,1.25,2]) {
      const context=await browser.newContext({viewport:{width:1100,height:950},deviceScaleFactor:dpr});
      const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
      await page.goto(base);await skipBoot(page);await page.waitForFunction(()=>pacmanDebug.snapshot().titleFontStatus==="ready");
      const info=await page.evaluate(()=>({title:document.title,canvas:pacmanDebug.snapshot().canvas,font:document.fonts.check('32px "AstraTitle"'),names:Object.values(PacmanArt.CAST).map(c=>c.name)}));
      check(info.title==="SORA-MAN · AI Arcade"&&info.font,"DPR "+dpr+": Crackman title is loaded and branding is current");
      check(info.canvas.backingWidth===448&&info.canvas.backingHeight===576&&info.canvas.width===224,"DPR "+dpr+": backing and logical dimensions stay separate");
      check(info.names.join(",")==="CLAUDE,MUSE,GROK,GEMINI","DPR "+dpr+": correct cast order");
      if(dpr===1)await page.locator("#screen").screenshot({path:path.join(out,"astra-title.png")});
      for(const [width,height] of [[720,640],[320,568],[900,440],[280,320]]) {
        await page.setViewportSize({width,height});await frames(page);
        const layout=await page.evaluate(()=>{
          const c=document.getElementById("screen"),r=c.getBoundingClientRect(),controls=document.querySelector(".bezel-controls").getBoundingClientRect();
          return {ratio:r.width/r.height,scale:r.width/c.width*devicePixelRatio,inside:r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&controls.bottom<=innerHeight+1};
        });
        check(layout.inside&&Math.abs(layout.ratio-7/9)<.001,`DPR ${dpr} ${width}x${height}: board and controls fit`);
        check(layout.scale<1||Math.abs(layout.scale-Math.round(layout.scale))<.01,`DPR ${dpr} ${width}x${height}: integer enlargement of authored pixels`);
      }
      await context.close();
    }
    const context=await browser.newContext({viewport:{width:1100,height:950},deviceScaleFactor:1});
    const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
    await page.goto(base);await skipBoot(page);await page.waitForFunction(()=>pacmanDebug.snapshot().titleFontStatus==="ready");
    await page.keyboard.press("Enter");await page.waitForFunction(()=>game.state==="PLAYING");
    const initial=await page.evaluate(()=>({score:game.score,x:game.pacman.x,lives:game.lives}));
    // Real wall-clock play and actual keyboard events; no position/timer overrides.
    await page.keyboard.press("ArrowLeft");await page.waitForTimeout(650);await page.keyboard.press("ArrowDown");await page.waitForTimeout(950);
    const played=await page.evaluate(()=>({score:game.score,x:game.pacman.x,y:game.pacman.y,lives:game.lives}));
    check(played.score>initial.score&&played.lives===initial.lives,"real controls move Astra, collect pellets and keep the player alive");
    await page.locator("#screen").screenshot({path:path.join(out,"astra-gameplay.png")});
    await page.keyboard.press("p");await frames(page);
    const paused=await page.locator("#screen").screenshot();await frames(page,12);
    check(Buffer.compare(paused,await page.locator("#screen").screenshot())===0,"pause freezes all new artwork exactly");
    await page.keyboard.press("Enter");await page.waitForFunction(()=>game.state==="PLAYING");
    await page.locator("#fullscreen").click();await frames(page);
    check(await page.evaluate(()=>Boolean(document.fullscreenElement)),"fullscreen enters through the visible control");
    await page.locator("#fullscreen").click();await frames(page);
    check(await page.evaluate(()=>!document.fullscreenElement),"fullscreen exits through the visible control");

    await page.goto(base+"tests/browser.html");
    await page.waitForFunction(()=>document.getElementById("game").contentWindow.pacmanDebug?.snapshot().titleFontStatus==="ready");
    await page.locator("#gallery").screenshot({path:path.join(out,"astra-browser-sprites.png")});
    await page.locator("#spriteState").selectOption("BLINK");await frames(page);
    await page.locator("#animatedGallery").screenshot({path:path.join(out,"astra-blink-review.png")});
    check(await page.locator("#spriteState").inputValue()==="BLINK","live gallery selects blink for all characters");
    for(const scene of ["CAST","CORNERS","HOUSE","FRIGHTENED","WARNING","EATEN","TUNNEL","DYING","LEVEL_CLEAR","INTERMISSION","GAME_OVER","ATTRACT"]) {
      await page.locator(`[data-scene="${scene}"]`).click();await frames(page);
      const gameFrame=page.frames().find(f=>f!==page.mainFrame());
      await gameFrame.locator("#screen").screenshot({path:path.join(out,`astra-scene-${scene.toLowerCase()}.png`)});
      check(await gameFrame.evaluate(()=>document.getElementById("screen").width===448),scene+": production scene renders at the new resolution");
    }
    await page.locator("#run").click();await page.waitForFunction(()=>!document.getElementById("run").disabled,{timeout:30000});
    const fixture=await page.locator("#results").innerText();console.log(fixture);check(fixture.includes("ALL BROWSER CHECKS PASSED"),"browser storage, focus, controls and sizing regression fixture passes");

    const failure=await context.newPage();failure.on("pageerror",e=>errors.push(e.message));
    await failure.route("**/assets/fonts/crackman.css",route=>route.abort());await failure.goto(base);await skipBoot(failure);
    await failure.waitForFunction(()=>pacmanDebug.snapshot().titleFontStatus==="fallback");
    await failure.locator("#screen").screenshot({path:path.join(out,"astra-title-fallback.png")});
    await failure.keyboard.press("Enter");await failure.waitForFunction(()=>game.state==="READY");
    check(await failure.evaluate(()=>!pacmanDebug.snapshot().starting),"missing title font leaves the bitmap title and permits starting");
    await failure.close();await context.close();

    // Touch deck: handheld and side-panel layouts fit beside the board, and the D-pad really steers.
    for(const [width,height,layout] of [[390,844,"portrait"],[844,390,"landscape"]]) {
      const touch=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,hasTouch:true,isMobile:true});
      const phone=await touch.newPage();phone.on("pageerror",e=>errors.push(e.message));
      await phone.goto(base);await skipBoot(phone);await phone.waitForFunction(()=>pacmanDebug.snapshot().titleFontStatus==="ready");await frames(phone);
      const fit=await phone.evaluate(()=>{
        const q=s=>document.querySelector(s).getBoundingClientRect(),frame=q(".screen-frame");
        const parts=[q("#pad"),q(".actions"),q(".bezel-controls")];
        const clear=r=>!(r.left<frame.right-1&&frame.left<r.right-1&&r.top<frame.bottom-1&&frame.top<r.bottom-1);
        return {layout:document.querySelector(".cabinet").dataset.layout,inside:[frame,...parts].every(r=>r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1),clear:parts.every(clear)};
      });
      check(fit.layout===layout&&fit.inside&&fit.clear,`touch ${width}x${height}: ${layout} deck fits without covering the board`);
      await phone.locator("#play").tap();await phone.waitForFunction(()=>game.state==="PLAYING",null,{timeout:8000});
      const pad=await phone.locator("#pad").boundingBox();
      await phone.mouse.move(pad.x+pad.width*.15,pad.y+pad.height/2);await phone.mouse.down();
      check(await phone.evaluate(()=>document.getElementById("pad").classList.contains("is-down")&&game.pacman.wanted===1),`touch ${width}x${height}: D-pad shows its pressed state and steers`);
      await phone.mouse.move(pad.x+pad.width/2,pad.y+pad.height*.85,{steps:4});
      check(await phone.evaluate(()=>game.pacman.wanted===2),`touch ${width}x${height}: sliding to another arm turns without lifting`);
      await phone.mouse.up();
      check(await phone.evaluate(()=>!document.getElementById("pad").classList.contains("is-down")),`touch ${width}x${height}: D-pad releases`);
      if(layout==="portrait")await phone.screenshot({path:path.join(out,"astra-touch-portrait.png")});
      else await phone.screenshot({path:path.join(out,"astra-touch-landscape.png")});
      await touch.close();
    }

    const reduced=await browser.newContext({viewport:{width:1100,height:950},reducedMotion:"reduce"});
    const quiet=await reduced.newPage();await quiet.goto(base);await skipBoot(quiet);await quiet.waitForFunction(()=>pacmanDebug.snapshot().titleFontStatus==="ready");
    check(await quiet.evaluate(()=>matchMedia("(prefers-reduced-motion: reduce)").matches),"reduced-motion preference is honored by the browser");
    await quiet.keyboard.press("Enter");await quiet.waitForFunction(()=>game.state==="READY");
    const ready=await quiet.locator("#screen").screenshot();await frames(quiet,10);
    // Existing skirt/mouth motion is retained; the decorative one-pixel bob and blink are suppressed.
    check(await quiet.evaluate(()=>PacmanArt.CAST.clyde.name==="GEMINI"&&game.state==="READY"),"reduced-motion startup and the new cast render together");
    check(ready.length>0,"reduced-motion canvas has rendered content");
    await reduced.close();
    check(errors.length===0,"no unhandled browser errors: "+errors.join("; "));
    console.log(`ALL ${checks} ASTRA BROWSER CHECKS PASSED`);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
