/* ============ Porto Bybit — Pelacak Portofolio ============
   Local-first single-page app. All data stored in localStorage on this device.
   Update manual lewat form, tempel teks cepat, atau (opsional) upload screenshot
   yang dibaca otomatis lewat Gemini API (free tier) — hanya dipanggil kalau user isi API key sendiri. */

const STORAGE_KEY = 'porto_bybit_tracker_data_v1';
const MM_WARN = 7;   // >= ini warna kuning
const MM_DANGER = 10; // >= ini warna merah + banner alert

/* ---------------- Data layer ---------------- */
function uid(){ return 'id' + Math.random().toString(36).slice(2,10) + performance.now().toString(36).replace('.',''); }

function defaultData(){
  return {
    capital:{
      deposits:[],    // {id,date,amount,note}
      withdrawals:[]  // {id,date,amount,note}
    },
    snapshots:[], // {id,date,note,totalAssetIDR,availableIDR,inUseIDR,coins:[{coin,qty,valueIDR,changePct}],futures:[{symbol,side,leverage,qty,entry,mark,pnlUsdt,pnlPct,mm,liq}]}
    settings:{ mmWarn: MM_WARN, mmDanger: MM_DANGER, usdtIdr: null, geminiApiKey: '' },
    meta:{ createdAt:null, updatedAt:null, homeScreenReminderDismissedAt:null, bannerDismissedAt:null }
  };
}

let DATA = null;

function loadData(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw){ DATA = defaultData(); DATA.meta.createdAt = new Date().toISOString(); saveData(); return; }
    const parsed = JSON.parse(raw);
    DATA = Object.assign(defaultData(), parsed);
    DATA.capital = Object.assign(defaultData().capital, parsed.capital||{});
    DATA.settings = Object.assign(defaultData().settings, parsed.settings||{});
    DATA.meta = Object.assign(defaultData().meta, parsed.meta||{});
  }catch(e){
    console.error('Gagal memuat data, reset.', e);
    DATA = defaultData();
    DATA.meta.createdAt = new Date().toISOString();
  }
}
function saveData(){
  DATA.meta.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
}

/* ---------------- Format utils ---------------- */
function todayStr(){
  const d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function parseDate(s){ if(!s) return null; const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
function fmtDate(s){
  if(!s) return '—';
  const d = parseDate(s);
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return d.getDate()+' '+months[d.getMonth()]+' '+d.getFullYear();
}
function n(v){ const f = parseFloat(v); return isNaN(f) ? 0 : f; }
function fmtIDR(v){
  v = n(v);
  const sign = v < 0 ? '-' : '';
  return sign + 'Rp' + Math.abs(Math.round(v)).toLocaleString('id-ID');
}
function fmtIDRCompact(v){
  v = n(v);
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if(abs >= 1e9) return sign+'Rp'+(abs/1e9).toLocaleString('id-ID',{maximumFractionDigits:2})+'M';
  if(abs >= 1e6) return sign+'Rp'+(abs/1e6).toLocaleString('id-ID',{maximumFractionDigits:1})+'jt';
  return fmtIDR(v);
}
function fmtNum(v, dec){
  v = n(v);
  return v.toLocaleString('id-ID', {minimumFractionDigits:dec||0, maximumFractionDigits:dec!=null?dec:8});
}
function fmtPct(v, dec){
  v = n(v);
  const sign = v > 0 ? '+' : '';
  return sign + v.toFixed(dec!=null?dec:2) + '%';
}
function pnlClass(v){ return n(v) >= 0 ? 'pos' : 'neg'; }
function escapeHtml(s){ if(s==null) return ''; return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s){ return escapeHtml(s); }

/* ---------------- Derived calculations ---------------- */
function sortedSnapshots(){ return [...DATA.snapshots].sort((a,b)=>parseDate(a.date)-parseDate(b.date) || (a.id<b.id?-1:1)); }
function latestSnapshot(){ const s = sortedSnapshots(); return s.length ? s[s.length-1] : null; }
function prevSnapshot(){ const s = sortedSnapshots(); return s.length>1 ? s[s.length-2] : null; }

function totalDeposit(){ return DATA.capital.deposits.reduce((a,d)=>a+n(d.amount),0); }
function totalWithdraw(){ return DATA.capital.withdrawals.reduce((a,d)=>a+n(d.amount),0); }
function netCapital(){ return totalDeposit() - totalWithdraw(); }

function currentEquity(){ const s = latestSnapshot(); return s ? n(s.totalAssetIDR) : 0; }
function allTimePnL(){ const dep = totalDeposit(); if(dep<=0) return 0; return (currentEquity() + totalWithdraw()) - dep; }
function allTimePnLPct(){ const dep = totalDeposit(); if(dep<=0) return 0; return allTimePnL()/dep*100; }
function changeSincePrev(){
  const cur = latestSnapshot(), prev = prevSnapshot();
  if(!cur || !prev) return null;
  const diff = n(cur.totalAssetIDR) - n(prev.totalAssetIDR);
  const pct = n(prev.totalAssetIDR) !== 0 ? diff/n(prev.totalAssetIDR)*100 : 0;
  return {diff, pct};
}
function riskLevel(mm){
  mm = n(mm);
  if(mm >= (DATA.settings.mmDanger||MM_DANGER)) return 'danger';
  if(mm >= (DATA.settings.mmWarn||MM_WARN)) return 'warn';
  return 'ok';
}
function riskLabel(level){
  return level==='danger' ? 'Bahaya' : level==='warn' ? 'Waspada' : 'Aman';
}
function currentFutures(){ const s = latestSnapshot(); return s && s.futures ? s.futures : []; }
function dangerPositions(){ return currentFutures().filter(p=>riskLevel(p.mm)==='danger'); }
function highestMM(){
  const f = currentFutures();
  if(!f.length) return null;
  return f.reduce((max,p)=> n(p.mm) > n(max.mm) ? p : max, f[0]);
}
function liqDistance(p){
  const liq = n(p.liq), mark = n(p.mark);
  if(!liq || !mark) return null;
  return Math.abs(mark-liq)/mark*100;
}
function bepStatus(){
  const dep = totalDeposit();
  if(dep<=0) return null;
  const recovered = currentEquity() + totalWithdraw();
  const surplus = recovered - dep;
  const pct = Math.max(0, Math.min(100, recovered/dep*100));
  return { dep, recovered, surplus, pct, reached: surplus >= 0 };
}

/* ---------------- Router ---------------- */
let currentScreen = 'home';
let screenStack = [];
const NAV_SCREENS = ['home','futures','assets','history','more'];

function navTo(screen){
  screenStack = [];
  currentScreen = screen;
  renderScreen(screen);
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.nav===screen));
  document.getElementById('backBtn').style.display = 'none';
  window.scrollTo(0,0);
}
function openSub(screen){
  screenStack.push(currentScreen);
  currentScreen = screen;
  renderScreen(screen);
  document.getElementById('backBtn').style.display='flex';
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  window.scrollTo(0,0);
}
function goBack(){
  const prev = screenStack.pop() || 'home';
  currentScreen = prev;
  renderScreen(prev);
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.nav===prev));
  document.getElementById('backBtn').style.display = screenStack.length===0 ? 'none':'flex';
  window.scrollTo(0,0);
}
function setTitle(t){ document.getElementById('screenTitle').textContent = t; }
function setTopAction(label, fn){
  const btn = document.getElementById('topAction');
  if(!label){ btn.style.display='none'; return; }
  btn.style.display='block'; btn.textContent = label; btn.onclick = fn;
}
function renderScreen(name){
  const root = document.getElementById('screens');
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const fnMap = {
    home: renderHome, futures: renderFutures, assets: renderAssets, history: renderHistory, more: renderMore,
    capital: renderCapital, settingsScreen: renderSettingsScreen, backup: renderBackup
  };
  (fnMap[name] || renderHome)(root);
}
function ensureSection(root, id){
  let el = document.getElementById(id);
  if(!el){ el = document.createElement('div'); el.id = id; el.className='screen'; root.appendChild(el); }
  el.classList.add('active');
  return el;
}

/* ---------------- Home screen install reminder ---------------- */
function isStandaloneApp(){
  return (window.navigator.standalone === true) || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
}
function shouldShowHomeScreenReminder(){
  if(isStandaloneApp()) return false;
  const dismissedAt = DATA.meta.homeScreenReminderDismissedAt;
  if(!dismissedAt) return true;
  const daysSince = (Date.now() - new Date(dismissedAt).getTime()) / 86400000;
  return daysSince >= 14;
}
function dismissHomeScreenReminder(){
  DATA.meta.homeScreenReminderDismissedAt = new Date().toISOString();
  saveData(); renderScreen(currentScreen);
}
function renderHomeScreenReminder(){
  if(!shouldShowHomeScreenReminder()) return '';
  return `<div class="card" style="border-color:var(--warn);background:var(--warn-soft);">
    <div style="display:flex;gap:10px;align-items:flex-start;">
      <div style="font-size:20px;">📲</div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:13.5px;">Amankan data Porto</div>
        <div class="small" style="margin-top:4px;">Data hanya tersimpan di penyimpanan browser HP ini. Agar lebih aman: tap tombol <b>Share</b> di Safari → <b>"Add to Home Screen"</b> → buka Porto dari ikon tersebut.</div>
        <button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="dismissHomeScreenReminder()">Mengerti, sembunyikan</button>
      </div>
    </div>
  </div>`;
}

/* ================= HOME ================= */
function renderHome(root){
  setTitle('Porto Bybit'); setTopAction(null);
  const el = ensureSection(root,'screen-home');
  const eq = currentEquity();
  const pnl = allTimePnL();
  const pnlPct = allTimePnLPct();
  const chg = changeSincePrev();
  const hi = highestMM();
  const dangers = dangerPositions();
  const last = latestSnapshot();

  let alertHtml = '';
  if(dangers.length){
    alertHtml = `<div class="card" style="border-color:var(--danger);background:var(--danger-soft);">
      <div style="display:flex;gap:10px;align-items:flex-start;">
        <div style="font-size:20px;">🚨</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:800;font-size:14px;color:#B23F2E;">MM di atas ambang batas ${DATA.settings.mmDanger}%</div>
          <div class="small" style="margin-top:4px;color:#B23F2E;">${dangers.map(p=>`${escapeHtml(p.symbol)} — MM ${fmtNum(p.mm,2)}%`).join(', ')}. Pertimbangkan tambah margin atau kurangi ukuran posisi.</div>
        </div>
      </div>
    </div>`;
  }

  el.innerHTML = `
    ${renderHomeScreenReminder()}
    ${alertHtml}
    <div class="hero">
      <div class="lbl">Total Ekuitas Sekarang</div>
      <div class="amount">${last ? fmtIDR(eq) : '—'}</div>
      <div class="sub-row">
        <div class="sub-box"><div class="num ${pnlClass(pnl)}" style="color:#fff;">${totalDeposit()>0 ? fmtIDRCompact(pnl) : '—'}</div><div class="lbl2">P&amp;L All-Time</div></div>
        <div class="sub-box"><div class="num" style="color:#fff;">${totalDeposit()>0 ? fmtPct(pnlPct) : '—'}</div><div class="lbl2">Return</div></div>
        <div class="sub-box"><div class="num" style="color:#fff;">${chg ? fmtPct(chg.pct) : '—'}</div><div class="lbl2">Vs Update Lalu</div></div>
      </div>
      <div class="updated">${last ? 'Update terakhir: '+fmtDate(last.date) : 'Belum ada data — tambah update pertama'}</div>
    </div>

    ${renderBepCard()}

    <div class="grid3">
      <div class="stat-card">
        <div class="stat-label">Modal Bersih</div>
        <div class="stat-value">${fmtIDRCompact(netCapital())}</div>
        <div class="stat-sub">Setor ${fmtIDRCompact(totalDeposit())} · Tarik ${fmtIDRCompact(totalWithdraw())}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">MM Tertinggi</div>
        <div class="stat-value ${hi?'':'empty'}" style="color:${hi?(riskLevel(hi.mm)==='danger'?'#B23F2E':riskLevel(hi.mm)==='warn'?'#95660E':'#2E7D5B'):'inherit'}">${hi ? fmtNum(hi.mm,2)+'%' : 'Tidak ada'}</div>
        <div class="stat-sub">${hi ? escapeHtml(hi.symbol) : 'posisi futures'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Dipakai</div>
        <div class="stat-value">${last ? fmtIDRCompact(last.inUseIDR) : '—'}</div>
        <div class="stat-sub">Tersedia ${last ? fmtIDRCompact(last.availableIDR) : '—'}</div>
      </div>
    </div>

    <div class="section-title">Aksi Cepat</div>
    <div class="qa-scroll">
      <button class="qa-btn" onclick="openUpdateModal()"><span class="qa-icon">➕</span><span class="qa-label">Tambah Update</span></button>
      <button class="qa-btn" onclick="openSub('capital')"><span class="qa-icon">💰</span><span class="qa-label">Modal In/Out</span></button>
      <button class="qa-btn" onclick="navTo('history')"><span class="qa-icon">🕒</span><span class="qa-label">Riwayat</span></button>
    </div>

    <div class="section-title">Posisi Futures <span class="link" onclick="navTo('futures')">Lihat semua ›</span></div>
    ${currentFutures().length ? currentFutures().slice(0,3).map(p=>renderPositionCard(p)).join('') : renderEmptyMini('Belum ada posisi futures tercatat')}

    <div class="section-title">Aset <span class="link" onclick="navTo('assets')">Lihat semua ›</span></div>
    ${last && last.coins && last.coins.length ? `<div class="card">${last.coins.slice(0,4).map(c=>renderCoinRow(c)).join('')}</div>` : renderEmptyMini('Belum ada data aset')}
  `;
}
function renderBepCard(){
  const b = bepStatus();
  if(!b) return '';
  const barColor = b.reached ? 'var(--accent)' : 'var(--primary)';
  const pctOfCapital = b.surplus/b.dep*100;
  return `<div class="card">
    <div class="card-title">Status Balik Modal (BEP)</div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
      <span class="badge ${b.reached?'badge-ok':'badge-grey'}">${b.reached?'✅ Sudah BEP':'⏳ Belum BEP'}</span>
      <span class="small muted">${b.reached?'Surplus':'Progres'} ${fmtPct(pctOfCapital)} dari modal</span>
    </div>
    <div class="mm-bar" style="margin:0 0 12px;width:100%;">
      <div class="fill" style="width:${b.pct}%;background:${barColor};"></div>
    </div>
    <div class="row-grid">
      <div><div class="k small">Modal masuk</div><b>${fmtIDR(b.dep)}</b></div>
      <div><div class="k small">Sudah ditarik</div><b>${fmtIDR(totalWithdraw())}</b></div>
      <div><div class="k small">Saldo sekarang</div><b>${fmtIDR(currentEquity())}</b></div>
      <div><div class="k small">${b.reached?'Untung riil':'Kurang dari modal'}</div><b class="${b.reached?'pos':'neg'}">${fmtIDR(Math.abs(b.surplus))}</b></div>
    </div>
    <div class="small muted" style="margin-top:10px;">${b.reached
      ? `Total nilai kamu (saldo sekarang + yang sudah ditarik) sudah melewati modal awal. Sisa ${fmtIDR(b.surplus)} itu keuntungan riil.`
      : `Butuh saldo naik ${fmtIDR(-b.surplus)} lagi supaya total nilai (saldo + yang sudah ditarik) menyamai modal awal.`}</div>
  </div>`;
}
function renderEmptyMini(text){
  return `<div class="card"><div class="empty-state" style="padding:16px 8px;"><div class="desc">${escapeHtml(text)}</div></div></div>`;
}
function renderCoinRow(c){
  return `<div class="list-item">
    <div class="body">
      <div class="title">${escapeHtml(c.coin)}</div>
      <div class="sub">${fmtNum(c.qty,4)}</div>
    </div>
    <div class="meta">
      <div style="font-weight:700;">${fmtIDR(c.valueIDR)}</div>
      <div class="${pnlClass(c.changePct)}">${c.changePct!=null && c.changePct!=='' ? fmtPct(c.changePct) : ''}</div>
    </div>
  </div>`;
}

/* ================= FUTURES ================= */
function renderPositionCard(p){
  const level = riskLevel(p.mm);
  const dist = liqDistance(p);
  const pct = Math.min(100, n(p.mm));
  const barColor = level==='danger' ? 'var(--danger)' : level==='warn' ? 'var(--warn)' : 'var(--accent)';
  const badgeClass = level==='danger' ? 'badge-danger' : level==='warn' ? 'badge-warn' : 'badge-ok';
  return `<div class="pos-card ${level==='danger'?'risk-danger':''}">
    <div class="pc-top">
      <div><span class="pc-sym">${escapeHtml(p.symbol)}</span><span class="pc-side ${p.side==='short'?'short':'long'}">${p.side==='short'?'SHORT':'LONG'} ${p.leverage?p.leverage+'x':''}</span></div>
      <div class="pc-pnl ${pnlClass(p.pnlUsdt)}">${fmtNum(p.pnlUsdt,2)} USDT</div>
    </div>
    <div class="pc-grid">
      <div><div class="g-lbl">Entry</div><div class="g-val">${fmtNum(p.entry,6)}</div></div>
      <div><div class="g-lbl">Mark</div><div class="g-val">${fmtNum(p.mark,6)}</div></div>
      <div><div class="g-lbl">PnL %</div><div class="g-val ${pnlClass(p.pnlPct)}">${fmtPct(p.pnlPct)}</div></div>
      <div><div class="g-lbl">Ukuran</div><div class="g-val">${fmtNum(p.qty,2)}</div></div>
      <div><div class="g-lbl">Likuidasi</div><div class="g-val">${p.liq ? fmtNum(p.liq,6) : '—'}</div></div>
      <div><div class="g-lbl">Jarak Likuidasi</div><div class="g-val">${dist!=null ? dist.toFixed(2)+'%' : '—'}</div></div>
    </div>
    <div class="mm-row">
      <span class="badge ${badgeClass}">${riskLabel(level)}</span>
      <div class="mm-bar"><div class="fill" style="width:${pct}%;background:${barColor};"></div><div class="threshold" style="left:${DATA.settings.mmDanger}%;"></div></div>
      <span style="font-weight:800;font-size:13px;">${fmtNum(p.mm,2)}%</span>
    </div>
  </div>`;
}
function renderFutures(root){
  setTitle('Futures'); setTopAction('+ Update', openUpdateModal);
  const el = ensureSection(root,'screen-futures');
  const f = currentFutures();
  const last = latestSnapshot();
  el.innerHTML = `
    <div class="card card-tight" style="display:flex;justify-content:space-between;align-items:center;">
      <div class="small muted">Ambang MM: waspada ≥${DATA.settings.mmWarn}%, bahaya ≥${DATA.settings.mmDanger}%</div>
      <div class="small muted">${last ? fmtDate(last.date) : ''}</div>
    </div>
    ${f.length ? f.map(p=>renderPositionCard(p)).join('') : `<div class="empty-state"><div class="icon">📊</div><div class="title">Belum ada posisi</div><div class="desc">Tambah update untuk mencatat posisi futures kamu.</div><button class="btn btn-primary" style="margin-top:14px;" onclick="openUpdateModal()">Tambah Update</button></div>`}
  `;
}

/* ================= ASSETS ================= */
function renderAssets(root){
  setTitle('Aset'); setTopAction('+ Update', openUpdateModal);
  const el = ensureSection(root,'screen-assets');
  const last = latestSnapshot();
  if(!last){
    el.innerHTML = `<div class="empty-state"><div class="icon">🪙</div><div class="title">Belum ada data aset</div><div class="desc">Tambah update untuk mencatat saldo & holding kamu.</div><button class="btn btn-primary" style="margin-top:14px;" onclick="openUpdateModal()">Tambah Update</button></div>`;
    return;
  }
  el.innerHTML = `
    <div class="card">
      <div class="card-title">Ringkasan Saldo</div>
      <div class="grid2">
        <div class="stat-card"><div class="stat-label">Total Aset</div><div class="stat-value">${fmtIDR(last.totalAssetIDR)}</div></div>
        <div class="stat-card"><div class="stat-label">Tersedia</div><div class="stat-value">${fmtIDR(last.availableIDR)}</div></div>
      </div>
      <div class="grid2" style="margin-top:10px;">
        <div class="stat-card"><div class="stat-label">Digunakan</div><div class="stat-value">${fmtIDR(last.inUseIDR)}</div></div>
        <div class="stat-card"><div class="stat-label">Update</div><div class="stat-value" style="font-size:13px;">${fmtDate(last.date)}</div></div>
      </div>
    </div>
    <div class="section-title">Holding Coin</div>
    <div class="card">
      ${last.coins && last.coins.length ? last.coins.map(c=>renderCoinRow(c)).join('') : '<div class="empty-state" style="padding:16px 8px;"><div class="desc">Belum ada coin tercatat</div></div>'}
    </div>
  `;
}

/* ================= HISTORY ================= */
function drawEquityChart(){
  const wrap = document.getElementById('equityChart');
  if(!wrap) return;
  const snaps = sortedSnapshots();
  const w = wrap.clientWidth || 320, h = 140, pad = 8;
  if(snaps.length < 2){ wrap.innerHTML = `<div class="small muted" style="padding:20px 0;text-align:center;">Butuh minimal 2 update untuk menampilkan grafik.</div>`; return; }
  const values = snaps.map(s=>n(s.totalAssetIDR));
  const min = Math.min(...values), max = Math.max(...values);
  const range = (max-min) || 1;
  const stepX = (w-pad*2)/(snaps.length-1);
  const pts = values.map((v,i)=>{
    const x = pad + i*stepX;
    const y = h - pad - ((v-min)/range)*(h-pad*2);
    return [x,y];
  });
  const path = pts.map((p,i)=>(i===0?'M':'L')+p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
  const last = pts[pts.length-1];
  const areaPath = path + ` L${last[0].toFixed(1)},${h} L${pts[0][0].toFixed(1)},${h} Z`;
  wrap.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none">
    <path d="${areaPath}" fill="rgba(91,110,245,0.12)" stroke="none"/>
    <path d="${path}" fill="none" stroke="#5B6EF5" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="4" fill="#5B6EF5"/>
  </svg>`;
}
function timelineEvents(){
  const evs = [];
  DATA.snapshots.forEach(s=>evs.push({type:'snapshot', date:s.date, ref:s}));
  DATA.capital.deposits.forEach(d=>evs.push({type:'deposit', date:d.date, ref:d}));
  DATA.capital.withdrawals.forEach(d=>evs.push({type:'withdraw', date:d.date, ref:d}));
  return evs.sort((a,b)=>parseDate(b.date)-parseDate(a.date));
}
function renderHistory(root){
  setTitle('Riwayat'); setTopAction('+ Update', openUpdateModal);
  const el = ensureSection(root,'screen-history');
  const evs = timelineEvents();
  el.innerHTML = `
    <div class="card">
      <div class="card-title">Grafik Ekuitas</div>
      <div class="chart-wrap" id="equityChart"></div>
    </div>
    <div class="section-title">Semua Catatan</div>
    ${evs.length ? evs.map(e=>renderTimelineRow(e)).join('') : renderEmptyMini('Belum ada riwayat')}
  `;
  drawEquityChart();
}
function renderTimelineRow(e){
  if(e.type==='snapshot'){
    const s = e.ref;
    return `<div class="record-row">
      <div class="row-top">
        <div><div class="row-title">📸 Update Portofolio</div><div class="row-date">${fmtDate(s.date)}</div></div>
        <div style="font-weight:800;">${fmtIDR(s.totalAssetIDR)}</div>
      </div>
      ${s.note ? `<div class="row-detail small muted">${escapeHtml(s.note)}</div>` : ''}
      <div class="row-detail small muted">${(s.futures||[]).length} posisi futures · ${(s.coins||[]).length} coin</div>
      <div class="row-actions">
        <button class="btn btn-outline btn-sm" onclick="openUpdateModal('${s.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDelete('snapshots','${s.id}','update ${fmtDate(s.date)}')">Hapus</button>
      </div>
    </div>`;
  }
  const isDep = e.type==='deposit';
  return `<div class="record-row">
    <div class="row-top">
      <div><div class="row-title">${isDep?'💵 Setoran Modal':'🏧 Penarikan'}</div><div class="row-date">${fmtDate(e.ref.date)}</div></div>
      <div style="font-weight:800;" class="${isDep?'pos':'neg'}">${isDep?'+':'-'}${fmtIDR(e.ref.amount)}</div>
    </div>
    ${e.ref.note ? `<div class="row-detail small muted">${escapeHtml(e.ref.note)}</div>` : ''}
    <div class="row-actions">
      <button class="btn btn-danger btn-sm" onclick="confirmDelete('${isDep?'deposits':'withdrawals'}','${e.ref.id}','catatan ini', true)">Hapus</button>
    </div>
  </div>`;
}

/* ================= CAPITAL (Modal In/Out) ================= */
function renderCapital(root){
  setTitle('Modal In/Out'); setTopAction(null);
  const el = ensureSection(root,'screen-capital');
  el.innerHTML = `
    <div class="grid2">
      <div class="stat-card"><div class="stat-label">Total Setor</div><div class="stat-value pos">${fmtIDR(totalDeposit())}</div></div>
      <div class="stat-card"><div class="stat-label">Total Tarik</div><div class="stat-value neg">${fmtIDR(totalWithdraw())}</div></div>
    </div>
    <div class="qa-scroll" style="margin-top:12px;grid-template-columns:1fr 1fr;">
      <button class="qa-btn" onclick="openCapitalModal('deposit')"><span class="qa-icon">💵</span><span class="qa-label">Catat Setoran</span></button>
      <button class="qa-btn" onclick="openCapitalModal('withdraw')"><span class="qa-icon">🏧</span><span class="qa-label">Catat Penarikan</span></button>
    </div>
    <div class="section-title">Riwayat Modal</div>
    ${[...DATA.capital.deposits.map(d=>({...d,_t:'deposit'})),...DATA.capital.withdrawals.map(d=>({...d,_t:'withdraw'}))]
      .sort((a,b)=>parseDate(b.date)-parseDate(a.date))
      .map(e=>renderTimelineRow({type:e._t, date:e.date, ref:e})).join('') || renderEmptyMini('Belum ada catatan modal')}
  `;
}
function openCapitalModal(kind){
  const isDep = kind==='deposit';
  const sheet = document.getElementById('modalSheet');
  sheet.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">${isDep?'Catat Setoran Modal':'Catat Penarikan'}</div>
    <div class="field"><label>Tanggal</label><input type="date" id="cap-date" value="${todayStr()}"></div>
    <div class="field"><label>Jumlah (IDR)</label><input type="number" id="cap-amount" placeholder="cth. 100000000"></div>
    <div class="field"><label>Catatan (opsional)</label><input type="text" id="cap-note" placeholder="cth. modal awal"></div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">Batal</button>
      <button class="btn btn-primary" onclick="saveCapital('${kind}')">Simpan</button>
    </div>
  `;
  document.getElementById('modalBackdrop').classList.add('active');
}
function saveCapital(kind){
  const date = document.getElementById('cap-date').value || todayStr();
  const amount = n(document.getElementById('cap-amount').value);
  const note = document.getElementById('cap-note').value.trim();
  if(amount<=0){ alert('Jumlah harus lebih dari 0'); return; }
  const rec = {id:uid(), date, amount, note};
  if(kind==='deposit') DATA.capital.deposits.push(rec); else DATA.capital.withdrawals.push(rec);
  saveData(); closeModal(); renderScreen(currentScreen);
}

/* ================= MORE ================= */
function renderMore(root){
  setTitle('Lainnya'); setTopAction(null);
  const el = ensureSection(root,'screen-more');
  el.innerHTML = `
    <div class="card more-list">
      <div class="more-item" onclick="openSub('capital')"><div class="ic">💰</div><div class="txt"><div class="t">Modal In/Out</div><div class="d">Catat setoran & penarikan</div></div><div class="muted">›</div></div>
      <div class="more-item" onclick="openSub('settingsScreen')"><div class="ic">⚙️</div><div class="txt"><div class="t">Pengaturan Risiko</div><div class="d">Ambang batas MM%</div></div><div class="muted">›</div></div>
      <div class="more-item" onclick="openSub('backup')"><div class="ic">🗂️</div><div class="txt"><div class="t">Backup &amp; Restore</div><div class="d">Ekspor / impor data JSON</div></div><div class="muted">›</div></div>
    </div>
    <div class="disclaimer">Semua data disimpan lokal di penyimpanan browser HP ini. Tidak ada koneksi ke akun Bybit — semua update dicatat manual atau dibaca dari screenshot. Fitur baca screenshot otomatis (opsional) mengirim gambar ke Gemini API milik Google saat dipakai; kalau kunci API tidak diisi, fitur ini tidak aktif dan semua tetap 100% lokal.</div>
  `;
}
function renderSettingsScreen(root){
  setTitle('Pengaturan Risiko'); setTopAction(null);
  const el = ensureSection(root,'screen-settingsScreen');
  el.innerHTML = `
    <div class="card">
      <div class="field"><label>Ambang Waspada MM (%)</label><input type="number" id="set-warn" value="${DATA.settings.mmWarn}"></div>
      <div class="field"><label>Ambang Bahaya MM (%)</label><input type="number" id="set-danger" value="${DATA.settings.mmDanger}"></div>
      <button class="btn btn-primary btn-block" onclick="saveSettings()">Simpan Pengaturan</button>
    </div>
    <div class="card">
      <div class="card-title">Baca Screenshot Otomatis (AI)</div>
      <div class="field"><label>Kunci API Gemini (gratis)</label><input type="password" id="set-geminikey" value="${escapeAttr(DATA.settings.geminiApiKey||'')}" placeholder="AIza..."></div>
      <div class="field"><label>Kurs USDT → IDR</label><input type="number" id="set-usdtidr" value="${DATA.settings.usdtIdr!=null?DATA.settings.usdtIdr:''}" placeholder="cth. 15800"></div>
      <div class="hint">Bikin kunci API gratis di <b>aistudio.google.com/apikey</b> (login akun Google, tanpa kartu kredit). Kunci disimpan hanya di HP ini. Dipakai saat kamu upload screenshot Bybit di tab "Tempel Cepat" — gambar dikirim ke Gemini untuk dibaca, hasilnya balik ke HP kamu. Kurs dipakai kalau screenshot menampilkan nilai dalam USDT, biar otomatis dikonversi ke IDR.</div>
      <button class="btn btn-primary btn-block" style="margin-top:10px;" onclick="saveSettings()">Simpan Pengaturan</button>
    </div>
  `;
}
function saveSettings(){
  DATA.settings.mmWarn = n(document.getElementById('set-warn').value) || MM_WARN;
  DATA.settings.mmDanger = n(document.getElementById('set-danger').value) || MM_DANGER;
  const keyEl = document.getElementById('set-geminikey');
  const rateEl = document.getElementById('set-usdtidr');
  if(keyEl) DATA.settings.geminiApiKey = keyEl.value.trim();
  if(rateEl){ const rate = n(rateEl.value); DATA.settings.usdtIdr = rate>0 ? rate : null; }
  saveData();
  alert('Pengaturan disimpan');
  renderScreen(currentScreen);
}
function renderBackup(root){
  setTitle('Backup & Restore'); setTopAction(null);
  const el = ensureSection(root,'screen-backup');
  el.innerHTML = `
    <div class="card">
      <div class="card-title">Ekspor</div>
      <div class="small muted">Salin semua data sebagai JSON untuk disimpan sebagai cadangan.</div>
      <button class="btn btn-secondary btn-block" style="margin-top:10px;" onclick="exportData()">Salin ke Clipboard</button>
      <textarea id="exportBox" readonly style="width:100%;min-height:100px;margin-top:10px;font-family:ui-monospace,monospace;font-size:11px;border:1px solid var(--border);border-radius:10px;padding:8px;background:var(--grey-soft);"></textarea>
    </div>
    <div class="card">
      <div class="card-title">Impor</div>
      <div class="small muted">Tempel JSON hasil ekspor untuk memulihkan data. Ini akan menimpa data saat ini.</div>
      <textarea id="importBox" placeholder="Tempel JSON di sini" style="width:100%;min-height:100px;margin-top:10px;"></textarea>
      <button class="btn btn-danger btn-block" style="margin-top:10px;" onclick="importData()">Impor &amp; Timpa Data</button>
    </div>
  `;
}
function exportData(){
  const box = document.getElementById('exportBox');
  box.value = JSON.stringify(DATA, null, 2);
  box.select();
  try{ document.execCommand('copy'); alert('Tersalin ke clipboard'); }catch(e){}
}
function importData(){
  const raw = document.getElementById('importBox').value.trim();
  if(!raw) return;
  try{
    const parsed = JSON.parse(raw);
    if(!confirm('Ini akan menimpa semua data saat ini. Lanjutkan?')) return;
    DATA = Object.assign(defaultData(), parsed);
    saveData();
    alert('Data berhasil dipulihkan');
    navTo('home');
  }catch(e){ alert('JSON tidak valid'); }
}

/* ================= DELETE ================= */
function confirmDelete(collectionName, id, label, isCapital){
  const sheet = document.getElementById('modalSheet');
  sheet.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">Hapus ${escapeHtml(label)}?</div>
    <p class="small muted">Tindakan ini tidak dapat dibatalkan.</p>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">Batal</button>
      <button class="btn btn-danger" onclick="performDelete('${collectionName}','${id}',${!!isCapital})">Hapus</button>
    </div>
  `;
  document.getElementById('modalBackdrop').classList.add('active');
}
function performDelete(collectionName, id, isCapital){
  if(isCapital){ DATA.capital[collectionName] = DATA.capital[collectionName].filter(r=>r.id!==id); }
  else{ DATA[collectionName] = DATA[collectionName].filter(r=>r.id!==id); }
  saveData(); closeModal(); renderScreen(currentScreen);
}
function closeModal(){ document.getElementById('modalBackdrop').classList.remove('active'); }

/* ================= UPDATE PORTFOLIO MODAL ================= */
let updateState = { editId:null, coins:[], futures:[] };
let updateTab = 'form';

function openUpdateModal(editId){
  updateTab = 'form';
  if(editId){
    const s = DATA.snapshots.find(x=>x.id===editId);
    updateState = { editId, coins: (s.coins||[]).map(c=>({...c})), futures: (s.futures||[]).map(f=>({...f})),
      date: s.date, note: s.note||'', totalAssetIDR: s.totalAssetIDR, availableIDR: s.availableIDR, inUseIDR: s.inUseIDR };
  } else {
    updateState = { editId:null, coins:[], futures:[], date: todayStr(), note:'', totalAssetIDR:'', availableIDR:'', inUseIDR:'' };
  }
  renderUpdateModal();
  document.getElementById('modalBackdrop').classList.add('active');
}
function renderUpdateModal(){
  const sheet = document.getElementById('modalSheet');
  const st = updateState;
  sheet.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">${st.editId?'Edit Update':'Tambah Update Portofolio'}</div>
    <div class="tab-row">
      <button class="tab-btn ${updateTab==='form'?'active':''}" onclick="switchUpdateTab('form')">Form</button>
      <button class="tab-btn ${updateTab==='paste'?'active':''}" onclick="switchUpdateTab('paste')">Tempel Cepat</button>
    </div>
    <div id="updateTabBody"></div>
  `;
  renderUpdateTabBody();
}
function switchUpdateTab(t){ updateTab = t; renderUpdateModal(); }
function renderUpdateTabBody(){
  const body = document.getElementById('updateTabBody');
  const st = updateState;
  if(updateTab==='paste'){
    body.innerHTML = `
      <div class="field">
        <label>📷 Upload Screenshot Bybit</label>
        <input type="file" id="shotInput" accept="image/*" multiple onchange="handleScreenshotUpload(event)">
        <div class="hint">Upload 1-2 screenshot (halaman Aset/Wallet dan/atau Posisi Futures). Dibaca otomatis lewat AI (Gemini) dan langsung mengisi form — cek dulu di tab Form sebelum simpan. Perlu kunci API gratis di Lainnya → Pengaturan Risiko.</div>
        <div id="shotStatus" class="small" style="margin-top:6px;"></div>
      </div>
      <div class="small muted" style="text-align:center;margin:14px 0;">— atau tempel teks manual —</div>
      <div class="field">
        <label>Tempel data dari Bybit</label>
        <textarea id="pasteBox" placeholder="tanggal: 2026-01-01
total: 10000000
tersedia: 8000000
dipakai: 2000000
coin: BTC | 0.05 | 8000000 | 1.23
coin: USDT | 500 | 7900000 | 0
futures: BTCUSDT | long | 10 | 0.1 | 60000 | 61000 | 100 | 12.5 | 5 | "></textarea>
        <div class="hint">Format: tanggal / total / tersedia / dipakai, lalu baris "coin: SIMBOL | qty | nilaiIDR | perubahan%" dan "futures: SIMBOL | long/short | leverage | qty | entry | mark | pnlUSDT | pnl% | mm% | likuidasi(opsional)"</div>
      </div>
      <button class="btn btn-secondary btn-block" onclick="parsePaste()">Urai ke Form</button>
    `;
    return;
  }
  body.innerHTML = `
    <div class="field-row">
      <div class="field"><label>Tanggal</label><input type="date" id="u-date" value="${st.date||todayStr()}"></div>
      <div class="field"><label>Catatan</label><input type="text" id="u-note" value="${escapeAttr(st.note||'')}" placeholder="opsional"></div>
    </div>
    <div class="field"><label>Total Aset (IDR)</label><input type="number" id="u-total" value="${st.totalAssetIDR!=null?st.totalAssetIDR:''}"></div>
    <div class="field-row">
      <div class="field"><label>Tersedia (IDR)</label><input type="number" id="u-avail" value="${st.availableIDR!=null?st.availableIDR:''}"></div>
      <div class="field"><label>Digunakan (IDR)</label><input type="number" id="u-inuse" value="${st.inUseIDR!=null?st.inUseIDR:''}"></div>
    </div>

    <div class="section-title" style="margin-top:16px;">Holding Coin <span class="link" onclick="addCoinRow()">+ Tambah</span></div>
    <div id="coinRows">${st.coins.map((c,i)=>renderCoinFormRow(c,i)).join('') || '<div class="small muted">Belum ada coin ditambahkan</div>'}</div>

    <div class="section-title" style="margin-top:16px;">Posisi Futures <span class="link" onclick="addFuturesRow()">+ Tambah</span></div>
    <div id="futuresRows">${st.futures.map((f,i)=>renderFuturesFormRow(f,i)).join('') || '<div class="small muted">Belum ada posisi ditambahkan</div>'}</div>

    <div class="modal-actions" style="margin-top:16px;">
      <button class="btn btn-outline" onclick="closeModal()">Batal</button>
      <button class="btn btn-primary" onclick="saveUpdate()">Simpan</button>
    </div>
  `;
}
function renderCoinFormRow(c,i){
  return `<div class="card card-tight" style="margin-bottom:8px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <div class="small" style="font-weight:700;">Coin ${i+1}</div>
      <button class="icon-btn" onclick="removeCoinRow(${i})">✕</button>
    </div>
    <div class="field-row">
      <div class="field" style="margin-bottom:6px;"><label>Simbol</label><input type="text" value="${escapeAttr(c.coin||'')}" oninput="updateCoinField(${i},'coin',this.value)"></div>
      <div class="field" style="margin-bottom:6px;"><label>Qty</label><input type="number" value="${c.qty!=null?c.qty:''}" oninput="updateCoinField(${i},'qty',this.value)"></div>
    </div>
    <div class="field-row">
      <div class="field" style="margin-bottom:0;"><label>Nilai (IDR)</label><input type="number" value="${c.valueIDR!=null?c.valueIDR:''}" oninput="updateCoinField(${i},'valueIDR',this.value)"></div>
      <div class="field" style="margin-bottom:0;"><label>Perubahan %</label><input type="number" value="${c.changePct!=null?c.changePct:''}" oninput="updateCoinField(${i},'changePct',this.value)"></div>
    </div>
  </div>`;
}
function renderFuturesFormRow(f,i){
  return `<div class="card card-tight" style="margin-bottom:8px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <div class="small" style="font-weight:700;">Posisi ${i+1}</div>
      <button class="icon-btn" onclick="removeFuturesRow(${i})">✕</button>
    </div>
    <div class="field-row">
      <div class="field" style="margin-bottom:6px;"><label>Simbol</label><input type="text" value="${escapeAttr(f.symbol||'')}" oninput="updateFuturesField(${i},'symbol',this.value)"></div>
      <div class="field" style="margin-bottom:6px;"><label>Sisi</label>
        <select onchange="updateFuturesField(${i},'side',this.value)">
          <option value="long" ${f.side!=='short'?'selected':''}>Long</option>
          <option value="short" ${f.side==='short'?'selected':''}>Short</option>
        </select>
      </div>
    </div>
    <div class="field-row3">
      <div class="field" style="margin-bottom:6px;"><label>Leverage</label><input type="number" value="${f.leverage!=null?f.leverage:''}" oninput="updateFuturesField(${i},'leverage',this.value)"></div>
      <div class="field" style="margin-bottom:6px;"><label>Ukuran</label><input type="number" value="${f.qty!=null?f.qty:''}" oninput="updateFuturesField(${i},'qty',this.value)"></div>
      <div class="field" style="margin-bottom:6px;"><label>MM %</label><input type="number" value="${f.mm!=null?f.mm:''}" oninput="updateFuturesField(${i},'mm',this.value)"></div>
    </div>
    <div class="field-row">
      <div class="field" style="margin-bottom:6px;"><label>Harga Entry</label><input type="number" value="${f.entry!=null?f.entry:''}" oninput="updateFuturesField(${i},'entry',this.value)"></div>
      <div class="field" style="margin-bottom:6px;"><label>Harga Mark</label><input type="number" value="${f.mark!=null?f.mark:''}" oninput="updateFuturesField(${i},'mark',this.value)"></div>
    </div>
    <div class="field-row">
      <div class="field" style="margin-bottom:6px;"><label>PnL (USDT)</label><input type="number" value="${f.pnlUsdt!=null?f.pnlUsdt:''}" oninput="updateFuturesField(${i},'pnlUsdt',this.value)"></div>
      <div class="field" style="margin-bottom:6px;"><label>PnL %</label><input type="number" value="${f.pnlPct!=null?f.pnlPct:''}" oninput="updateFuturesField(${i},'pnlPct',this.value)"></div>
    </div>
    <div class="field" style="margin-bottom:0;"><label>Harga Likuidasi (opsional)</label><input type="number" value="${f.liq!=null?f.liq:''}" oninput="updateFuturesField(${i},'liq',this.value)"></div>
  </div>`;
}
function addCoinRow(){ updateState.coins.push({coin:'',qty:'',valueIDR:'',changePct:''}); renderUpdateTabBody(); }
function removeCoinRow(i){ updateState.coins.splice(i,1); renderUpdateTabBody(); }
function updateCoinField(i,key,val){ updateState.coins[i][key] = val; }
function addFuturesRow(){ updateState.futures.push({symbol:'',side:'long',leverage:'',qty:'',entry:'',mark:'',pnlUsdt:'',pnlPct:'',mm:'',liq:''}); renderUpdateTabBody(); }
function removeFuturesRow(i){ updateState.futures.splice(i,1); renderUpdateTabBody(); }
function updateFuturesField(i,key,val){ updateState.futures[i][key] = val; }

function parsePaste(){
  const raw = document.getElementById('pasteBox').value;
  const lines = raw.split('\n').map(l=>l.trim()).filter(Boolean);
  const st = updateState;
  st.coins = []; st.futures = [];
  lines.forEach(line=>{
    let m;
    if((m = line.match(/^tanggal\s*:\s*(.+)$/i))){ st.date = m[1].trim(); return; }
    if((m = line.match(/^total\s*:\s*([\d.\-]+)/i))){ st.totalAssetIDR = n(m[1]); return; }
    if((m = line.match(/^tersedia\s*:\s*([\d.\-]+)/i))){ st.availableIDR = n(m[1]); return; }
    if((m = line.match(/^dipakai\s*:\s*([\d.\-]+)/i))){ st.inUseIDR = n(m[1]); return; }
    if((m = line.match(/^coin\s*:\s*(.+)$/i))){
      const parts = m[1].split('|').map(p=>p.trim());
      st.coins.push({coin:parts[0]||'', qty:n(parts[1]), valueIDR:n(parts[2]), changePct:parts[3]!=null?n(parts[3]):''});
      return;
    }
    if((m = line.match(/^futures\s*:\s*(.+)$/i))){
      const parts = m[1].split('|').map(p=>p.trim());
      st.futures.push({
        symbol:parts[0]||'', side:(parts[1]||'long').toLowerCase()==='short'?'short':'long',
        leverage:n(parts[2]), qty:n(parts[3]), entry:n(parts[4]), mark:n(parts[5]),
        pnlUsdt:n(parts[6]), pnlPct:n(parts[7]), mm:n(parts[8]), liq: parts[9]?n(parts[9]):''
      });
      return;
    }
  });
  updateTab = 'form';
  renderUpdateModal();
}

/* ---------------- Baca screenshot otomatis (Gemini API) ---------------- */
const SHOT_PROMPT = `Kamu menerima 1 atau lebih screenshot dari aplikasi Bybit (halaman Aset/Wallet dan/atau halaman Posisi Futures). Baca semua angka yang terlihat dan ekstrak ke dalam SATU objek JSON dengan skema persis berikut. Balas HANYA objek JSON, tanpa teks lain, tanpa markdown code fence:

{
  "totalAssetIDR": number atau null,
  "availableIDR": number atau null,
  "inUseIDR": number atau null,
  "assetCurrency": "IDR" atau "USDT" atau null,
  "coins": [ { "coin": string, "qty": number, "valueIDR": number, "valueCurrency": "IDR" atau "USDT", "changePct": number atau null } ],
  "futures": [ { "symbol": string, "side": "long" atau "short", "leverage": number atau null, "qty": number atau null, "entry": number atau null, "mark": number atau null, "pnlUsdt": number atau null, "pnlPct": number atau null, "mm": number atau null, "liq": number atau null } ]
}

Aturan:
- Semua angka harus number JSON polos, tanpa simbol "Rp"/"$", tanpa titik/koma ribuan, tanpa simbol %.
- "assetCurrency"/"valueCurrency" isi "IDR" kalau nilai tampil dengan simbol Rp/IDR, isi "USDT" kalau tampil sebagai $ atau USDT.
- Kalau suatu field tidak terlihat di screenshot manapun, isi null — jangan mengarang angka.
- Gabungkan semua posisi futures dan semua coin holding dari seluruh screenshot yang diberikan ke dalam satu list masing-masing, jangan duplikat.
- Tentukan "side" dari label/warna Long atau Short pada tiap posisi.`;

function fileToImagePart(file){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>{
      const base64 = String(reader.result).split(',')[1];
      resolve({ mimeType: file.type||'image/png', data: base64 });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function callGeminiVision(apiKey, images){
  const parts = [{text: SHOT_PROMPT}, ...images.map(img=>({inline_data:{mime_type:img.mimeType, data:img.data}}))];
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.0-flash:generateContent?key='+encodeURIComponent(apiKey);
  const res = await fetch(url, {
    method:'POST',
    headers:{'content-type':'application/json'},
    body: JSON.stringify({ contents:[{ parts }], generationConfig:{ responseMimeType:'application/json' } })
  });
  if(!res.ok){
    let msg = 'HTTP '+res.status;
    try{ const j = await res.json(); msg = (j.error && j.error.message) || msg; }catch(e){}
    throw new Error(msg);
  }
  const data = await res.json();
  const cand = data.candidates && data.candidates[0];
  const text = cand && cand.content && cand.content.parts ? cand.content.parts.map(p=>p.text||'').join('') : '';
  if(!text) throw new Error('Respon AI kosong (kemungkinan gambar diblok filter keamanan)');
  let parsed;
  try{ parsed = JSON.parse(text); }catch(e){ throw new Error('Respon AI tidak berbentuk JSON valid'); }
  return parsed;
}

function applyExtractedResult(r){
  const rate = n(DATA.settings.usdtIdr);
  let usedUsdtWithoutRate = false;
  function conv(val, cur){
    if(val==null || val==='') return '';
    if(cur==='USDT'){
      if(rate>0) return Math.round(n(val)*rate);
      usedUsdtWithoutRate = true;
      return n(val);
    }
    return n(val);
  }
  const st = updateState;
  if(r.totalAssetIDR!=null) st.totalAssetIDR = conv(r.totalAssetIDR, r.assetCurrency);
  if(r.availableIDR!=null) st.availableIDR = conv(r.availableIDR, r.assetCurrency);
  if(r.inUseIDR!=null) st.inUseIDR = conv(r.inUseIDR, r.assetCurrency);
  if(Array.isArray(r.coins) && r.coins.length){
    st.coins = r.coins.map(c=>({
      coin: c.coin||'', qty: n(c.qty), valueIDR: conv(c.valueIDR, c.valueCurrency), changePct: c.changePct!=null?n(c.changePct):''
    }));
  }
  if(Array.isArray(r.futures) && r.futures.length){
    st.futures = r.futures.map(f=>({
      symbol:f.symbol||'', side: f.side==='short'?'short':'long', leverage: f.leverage!=null?n(f.leverage):'',
      qty: f.qty!=null?n(f.qty):'', entry: f.entry!=null?n(f.entry):'', mark: f.mark!=null?n(f.mark):'',
      pnlUsdt: f.pnlUsdt!=null?n(f.pnlUsdt):'', pnlPct: f.pnlPct!=null?n(f.pnlPct):'', mm: f.mm!=null?n(f.mm):'',
      liq: f.liq!=null?n(f.liq):''
    }));
  }
  if(!st.date) st.date = todayStr();
  if(usedUsdtWithoutRate){
    alert('Beberapa nilai terbaca dalam USDT tapi kurs USDT→IDR belum diset di Pengaturan. Nilai dipakai apa adanya (belum dikonversi) — set kurs lalu ulangi, atau edit manual di form.');
  }
}

async function handleScreenshotUpload(ev){
  const files = Array.from(ev.target.files||[]);
  const statusEl = document.getElementById('shotStatus');
  if(!files.length) return;
  const apiKey = (DATA.settings.geminiApiKey||'').trim();
  if(!apiKey){
    if(statusEl) statusEl.innerHTML = '<span class="neg">Kunci API Gemini belum diisi. Buka Lainnya → Pengaturan Risiko untuk menambahkannya (gratis).</span>';
    ev.target.value='';
    return;
  }
  if(statusEl) statusEl.innerHTML = '<span class="muted">Membaca '+files.length+' screenshot...</span>';
  try{
    const images = await Promise.all(files.map(fileToImagePart));
    const result = await callGeminiVision(apiKey, images);
    applyExtractedResult(result);
    if(statusEl) statusEl.innerHTML = '<span class="pos">Berhasil dibaca. Cek & lengkapi di tab Form sebelum simpan.</span>';
    updateTab = 'form';
    renderUpdateModal();
  }catch(e){
    console.error(e);
    if(statusEl) statusEl.innerHTML = '<span class="neg">Gagal membaca: '+escapeHtml(e.message||String(e))+'</span>';
  }
  ev.target.value='';
}

function saveUpdate(){
  const date = (document.getElementById('u-date') && document.getElementById('u-date').value) || updateState.date || todayStr();
  const note = (document.getElementById('u-note') && document.getElementById('u-note').value.trim()) || '';
  const totalAssetIDR = n(document.getElementById('u-total').value);
  const availableIDR = n(document.getElementById('u-avail').value);
  const inUseIDR = n(document.getElementById('u-inuse').value);
  const coins = updateState.coins.filter(c=>c.coin).map(c=>({coin:c.coin, qty:n(c.qty), valueIDR:n(c.valueIDR), changePct:c.changePct===''?'':n(c.changePct)}));
  const futures = updateState.futures.filter(f=>f.symbol).map(f=>({
    symbol:f.symbol, side:f.side==='short'?'short':'long', leverage:n(f.leverage), qty:n(f.qty),
    entry:n(f.entry), mark:n(f.mark), pnlUsdt:n(f.pnlUsdt), pnlPct:n(f.pnlPct), mm:n(f.mm), liq:f.liq===''?'':n(f.liq)
  }));
  if(totalAssetIDR<=0){ alert('Isi Total Aset terlebih dahulu'); return; }
  if(updateState.editId){
    const s = DATA.snapshots.find(x=>x.id===updateState.editId);
    Object.assign(s, {date, note, totalAssetIDR, availableIDR, inUseIDR, coins, futures});
  } else {
    DATA.snapshots.push({id:uid(), date, note, totalAssetIDR, availableIDR, inUseIDR, coins, futures});
  }
  saveData();
  closeModal();
  checkReminderBanner();
  renderScreen(currentScreen);
}

/* ================= Alert banner on load ================= */
function checkReminderBanner(){
  const banner = document.getElementById('reminderBanner');
  const text = document.getElementById('reminderBannerText');
  const dangers = dangerPositions();
  if(dangers.length){
    banner.classList.add('danger');
    text.textContent = `MM ${dangers.map(p=>p.symbol+' '+fmtNum(p.mm,1)+'%').join(', ')} sudah di ambang bahaya (≥${DATA.settings.mmDanger}%)`;
    banner.classList.add('active');
  } else {
    banner.classList.remove('active');
    banner.classList.remove('danger');
  }
}
function closeBanner(){ document.getElementById('reminderBanner').classList.remove('active'); }

/* ================= Init ================= */
window.addEventListener('resize', ()=>{ if(currentScreen==='history') drawEquityChart(); });
document.addEventListener('DOMContentLoaded', ()=>{
  loadData();
  navTo('home');
  checkReminderBanner();
});

if('serviceWorker' in navigator && location.protocol.startsWith('http')){
  window.addEventListener('load', ()=>{ navigator.serviceWorker.register('sw.js').catch(()=>{}); });
}
