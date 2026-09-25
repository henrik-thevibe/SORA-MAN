"use strict";

// The listening survey page shared by the Astra audio generators: players per
// sound, a verdict per sound (saved in the browser), and "Copy my verdicts" to
// paste the picks back into the chat.

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// Pitch per frame: the original as a wide pale band, the new sound as a line.
function contourSvg(contour) {
  if (!contour) return "";
  const { ref, test, lag } = contour, w = 320, h = 90, n = Math.max(ref.length, 1);
  const lo = Math.log2(60), hi = Math.log2(3200);
  const pts = (arr, shift = 0) => arr.map((f, i) => (f > 0 ? `${((i - shift) / n * w).toFixed(1)},${(h - (Math.log2(f) - lo) / (hi - lo) * h).toFixed(1)}` : null))
    .reduce((acc, p) => { if (p) acc[acc.length - 1].push(p); else if (acc[acc.length - 1].length) acc.push([]); return acc; }, [[]])
    .filter((seg) => seg.length).map((seg) => `<polyline points="${seg.join(" ")}"/>`).join("");
  return `<svg class="contour" viewBox="0 0 ${w} ${h}" role="img" aria-label="Pitch per frame, original versus v2"><g class="ref">${pts(ref)}</g><g class="new">${pts(test.slice(0, ref.length + Math.max(0, lag)), lag)}</g></svg>`;
}

function player({ label, file, loop }) {
  return file ? `<div class="p"><span>${esc(label)}</span><audio controls preload="none" ${loop ? "loop" : ""} src="${file}"></audio></div>`
    : `<div class="p none"><span>${esc(label)}</span><em>none</em></div>`;
}

function row(r) {
  const options = r.options.map(([value, label]) => `<label><input type="radio" name="v-${r.id}" value="${value}">${esc(label)}</label>`).join("");
  return `
<article data-id="${r.id}">
  <header><h3>${r.id}</h3>${r.badge ? `<b class="match"${r.badgeTitle ? ` title="${esc(r.badgeTitle)}"` : ""}>${esc(r.badge)}</b>` : ""}</header>
  <p>${esc(r.intent)}</p>
  <div class="players">${r.players.map(player).join("")}</div>
  ${r.extra || ""}
  <div class="verdict">${options}<input type="text" placeholder="Notes (optional)" aria-label="Notes for ${r.id}"></div>
</article>`;
}

// sections: [{ heading, lede?, players?: [player], rows?: [row] }]
function auditionPage({ title = "Astra Sound Audition", heading, lede, legend = "", sections, storageKey, verdictTitle }) {
  const body = sections.map((s) => `<h2>${esc(s.heading)}</h2>${s.lede ? `\n<p class="lede">${esc(s.lede)}</p>` : ""}${s.players ? `\n<div class="players">${s.players.map(player).join("")}</div>` : ""}${(s.rows || []).map(row).join("")}`).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
:root{--bg:#0a0d1a;--panel:#12162a;--line:#262c4a;--text:#e8edff;--muted:#9aa4c7;--accent:#75e7ff;--gold:#ffd84a;--pink:#ff9fd8;--ref:#8a93b8}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--bg:#f6f7fb;--panel:#fff;--line:#dde1ee;--text:#151a2e;--muted:#5a6384;--accent:#0a7fa0;--gold:#9a6b00;--pink:#b0307a;--ref:#9aa0b8}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,sans-serif}
main{max-width:980px;margin:0 auto;padding:28px 16px 80px}h1{margin:0 0 4px;color:var(--gold);font-size:26px}h2{margin:36px 0 10px;color:var(--pink);font-size:19px}
.lede{color:var(--muted);max-width:70ch}article{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:12px 0}
article header{display:flex;gap:12px;align-items:baseline;justify-content:space-between}h3{margin:0;color:var(--accent);font:600 17px ui-monospace,monospace}
.match{font:12px ui-monospace,monospace;color:var(--muted)}article p{margin:6px 0 10px;color:var(--text)}
.players{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.p{display:flex;flex-direction:column;gap:2px;min-width:0}.p span{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.p audio{width:100%;height:36px}.p.none em{color:var(--muted);font-size:13px;padding:8px 0}
.contour{display:block;width:100%;max-width:420px;height:70px;margin-top:10px}.contour polyline{fill:none;stroke-width:2;vector-effect:non-scaling-stroke}.ref polyline{stroke:var(--ref);stroke-width:7;stroke-linecap:round;stroke-linejoin:round;opacity:.45}.new polyline{stroke:var(--accent)}
.legend{font-size:12px;color:var(--muted)}.legend i{display:inline-block;width:18px;height:0;border-top:6px solid var(--ref);opacity:.6;vertical-align:middle;margin:0 4px}.legend i.n{border-top:2px solid var(--accent)}
.verdict{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:10px;font-size:14px}.verdict input[type=text]{flex:1;min-width:180px;background:transparent;border:1px solid var(--line);border-radius:6px;color:var(--text);padding:5px 8px}
.bar{position:sticky;bottom:0;background:var(--panel);border-top:1px solid var(--line);padding:10px 16px;display:flex;gap:12px;align-items:center;justify-content:center}
button{background:var(--accent);color:#061018;border:0;border-radius:6px;padding:8px 14px;font-weight:600;cursor:pointer}#copied{color:var(--muted);font-size:13px}
@media (max-width:640px){.players{grid-template-columns:1fr}}
</style></head><body><main>
<h1>${esc(heading)}</h1>
<p class="lede">${esc(lede)}</p>
${legend}
${body}
</main>
<div class="bar"><button id="copy">Copy my verdicts</button><span id="copied"></span></div>
<script>
const KEY=${JSON.stringify(storageKey)};let saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||"{}")}catch(e){}
document.querySelectorAll("article[data-id]").forEach(a=>{const id=a.dataset.id,s=saved[id]||{},note=a.querySelector("input[type=text]");
 if(s.v){const r=a.querySelector('input[value="'+s.v+'"]');if(r)r.checked=true}note.value=s.note||"";
 const store=()=>{saved[id]={v:(a.querySelector("input[type=radio]:checked")||{}).value||"",note:note.value};try{localStorage.setItem(KEY,JSON.stringify(saved))}catch(e){}};
 a.addEventListener("change",store);note.addEventListener("input",store)});
document.addEventListener("play",e=>{document.querySelectorAll("audio").forEach(x=>{if(x!==e.target)x.pause()})},true);
document.getElementById("copy").onclick=async()=>{const lines=[...document.querySelectorAll("article[data-id]")].map(a=>{const v=(a.querySelector("input[type=radio]:checked")||{}).value||"—",n=a.querySelector("input[type=text]").value.trim();return a.dataset.id+": "+v+(n?" — "+n:"")});
 const text=${JSON.stringify(verdictTitle)}+"\\n"+lines.join("\\n");try{await navigator.clipboard.writeText(text);document.getElementById("copied").textContent="Copied. Paste it into the chat."}catch(e){document.getElementById("copied").textContent="Copy failed; select the text below.";const pre=document.createElement("pre");pre.textContent=text;document.querySelector("main").append(pre)}};
</script></body></html>`;
}

module.exports = { auditionPage, contourSvg };
