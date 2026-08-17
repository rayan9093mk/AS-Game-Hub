let state = { games: [], settings: {} };
let currentFilter = 'all';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function fmt(sec){
  sec = Math.max(0, Math.floor(sec||0));
  const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60);
  return h ? `${h}س ${m}د` : `${m}د`;
}
function toast(msg){
  const t=$('#toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(window._toast); window._toast=setTimeout(()=>t.classList.remove('show'),2400);
}
function gameCover(g){
  const colors=['#0d2a46','#1b203d','#122c31','#28213c','#172e4b','#30251e'];
  const c=colors[(g.name||'').length%colors.length];
  const initials=(g.name||'GAME').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  return `<div class="cover" style="background:radial-gradient(circle at 70% 20%,${c},#08101d 70%)">
    <img src="assets/banner.webp" style="opacity:.16;filter:hue-rotate(${(g.name||'').length*13}deg);">
    <span style="position:absolute;inset:0;display:grid;place-items:center;font-size:31px;font-weight:900;color:#dcecff;opacity:.88">${initials}</span>
    <span class="platform">${g.platform||'PC'}</span>
  </div>`;
}
function updateQuickStats(){
  const total=state.games.reduce((a,g)=>a+(g.totalSeconds||0),0);
  $('#quickGames').textContent=state.games.length;
  $('#quickTime').textContent=fmt(total);
  $('#quickFavs').textContent=state.games.filter(g=>g.favorite).length;
  const last=[...state.games].filter(g=>g.lastPlayed).sort((a,b)=>new Date(b.lastPlayed)-new Date(a.lastPlayed))[0];
  $('#quickLast').textContent=last?.name||'—';
}
function renderGames(){
  let games=[...state.games];
  const q=($('#search').value||'').toLowerCase().trim();
  if(q) games=games.filter(g=>g.name.toLowerCase().includes(q));
  if(currentFilter==='favorite') games=games.filter(g=>g.favorite);
  if(currentFilter==='recent') games.sort((a,b)=>(b.lastPlayed||'').localeCompare(a.lastPlayed||''));
  $('#gameCount').textContent=`${state.games.length} لعبة`; updateQuickStats();
  if(!games.length){
    $('#gamesGrid').innerHTML=`<div class="empty"><b>مكتبتك فارغة</b><span>اضغط «فحص الألعاب» لاكتشاف ألعاب Steam و Epic و Xbox/Microsoft Store وباقي المنصات المثبتة على جهازك، أو استخدم «إضافة لعبة» لأي لعبة أخرى.</span></div>`;
    return;
  }
  $('#gamesGrid').innerHTML=games.map(g=>`
    <article class="game-card">
      ${gameCover(g)}
      <div class="card-body">
        <div class="game-name" title="${esc(g.name)}">${esc(g.name)}</div>
        <div class="game-meta"><span>${esc(g.platform||'PC')}</span><span>${fmt(g.totalSeconds||0)}</span></div>
        <div class="card-actions">
          <button class="play" data-play="${esc(g.id)}">تشغيل</button>
          <button class="fav ${g.favorite?'active':''}" data-fav="${esc(g.id)}">${g.favorite?'★':'☆'}</button>
        </div>
      </div>
    </article>`).join('');
  $$('[data-play]').forEach(b=>b.onclick=()=>launch(b.dataset.play));
  $$('[data-fav]').forEach(b=>b.onclick=()=>toggleFav(b.dataset.fav));
}
function esc(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
async function launch(id){
  const g=state.games.find(x=>x.id===id); if(!g) return;
  const r=await window.asHub.launchGame(g);
  if(!r.ok){toast(r.error||'تعذر تشغيل اللعبة');return;}
  g.lastPlayed=new Date().toISOString(); g.playCount=(g.playCount||0)+1;
  await window.asHub.saveData(state);
  renderGames(); renderStats(); updateQuickStats();
  toast(`تم تشغيل ${g.name}`);
}
async function toggleFav(id){
  const g=state.games.find(x=>x.id===id); if(!g)return;
  g.favorite=!g.favorite; await window.asHub.saveData(state); renderGames();
}
function renderStats(){
  const total=state.games.reduce((a,g)=>a+(g.totalSeconds||0),0);
  const sessions=state.games.reduce((a,g)=>a+(g.playCount||0),0);
  const top=[...state.games].sort((a,b)=>(b.totalSeconds||0)-(a.totalSeconds||0))[0];
  $('#totalTime').textContent=fmt(total);
  $('#statGames').textContent=state.games.length;
  $('#sessionCount').textContent=sessions;
  $('#topGame').textContent=top?.name||'—';
  $('#topGameTime').textContent=top?fmt(top.totalSeconds):'0 دقيقة';
  const sorted=[...state.games].sort((a,b)=>(b.totalSeconds||0)-(a.totalSeconds||0));
  const max=sorted[0]?.totalSeconds||1;
  $('#leaderboard').innerHTML=sorted.length?sorted.map((g,i)=>`
    <div class="leader"><div class="rank">#${i+1}</div><div><div class="leader-name">${esc(g.name)}</div><div class="bar-wrap"><div class="bar" style="width:${Math.max(2,(g.totalSeconds||0)/max*100)}%"></div></div></div><div class="leader-time">${fmt(g.totalSeconds||0)}</div><div style="color:#56677e;font-size:9px">${g.platform||'PC'}</div></div>`).join(''):`<div class="empty">لا توجد بيانات لعب بعد.</div>`;
}
function showView(name){
  $$('.view').forEach(v=>v.classList.remove('active'));
  $(`#${name}View`).classList.add('active');
  $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  if(name==='stats')renderStats();
}
async function init(){
  state=await window.asHub.getData();
  renderGames();renderStats();
  $('#search').oninput=renderGames;
  $('#addBtn').onclick=async()=>{
    const r=await window.asHub.pickGame();
    if(r.ok){ state.games=r.games; renderGames(); renderStats(); toast(`تمت إضافة ${r.game.name}`); }
  };
  $$('.nav-item').forEach(b=>b.onclick=()=>showView(b.dataset.view));
  $$('.filter').forEach(b=>b.onclick=()=>{$$('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');currentFilter=b.dataset.filter;renderGames()});
  $('#heroStats').onclick=()=>showView('stats');
  $('#heroScan').onclick=()=>$('#scanBtn').click();
  $('#scanBtn').onclick=async()=>{toast('جاري فحص جميع منصات الألعاب...');state.games=await window.asHub.scanGames();renderGames();renderStats();toast(`تم العثور على ${state.games.length} لعبة`);};
  $('#captureBtn').onclick=async()=>{const r=await window.asHub.captureScreen();$('#captureResult').textContent=r.ok?'✓ تم حفظ الصورة في مجلد اللقطات':`✕ ${r.error}`;};
  $('#captureFolderBtn').onclick=async()=>window.asHub.openFolder(await window.asHub.getCaptureFolder());
  $('#compactToggle').onclick=async()=>{state.settings.compact=!state.settings.compact;$('#compactToggle').classList.toggle('on',state.settings.compact);document.body.style.setProperty('--radius',state.settings.compact?'11px':'18px');await window.asHub.saveData(state)};
  $('#autoScanToggle').onclick=async()=>{state.settings.autoScan=!(state.settings.autoScan!==false);$('#autoScanToggle').classList.toggle('on',state.settings.autoScan);await window.asHub.saveData(state)};
  if(state.settings.autoScan!==false){state.games=await window.asHub.scanGames();renderGames();renderStats();}
}
init();
