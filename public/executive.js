/* ================================================================
   NADAKI — DASHBOARD EJECUTIVO v2 (Premium)
   ================================================================ */

let D = null; // current dataset
let sortField = 'income', sortDir = 'desc';

// ── UTILS ─────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const esc = s => String(s||'').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
const f$  = (n, d=0) => isNaN(n)||n===null ? '$0' : '$'+parseFloat(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const fN  = (n, d=1) => isNaN(n)||n===null ? '0' : parseFloat(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const fPct= n => isNaN(n)||n===null ? '—' : parseFloat(n).toFixed(1)+'%';
const fDate= d => d ? new Date(d+'T00:00:00').toLocaleDateString('es',{month:'short',day:'numeric'}) : '—';

const chgTag = (v, suffix='') => {
  if (v===null||v===undefined||isNaN(v)) return '';
  const n = parseFloat(v), cls = n>0?'up':n<0?'down':'flat', arr = n>0?'↑':n<0?'↓':'→';
  return `<span class="kpi-chg ${cls}">${arr} ${Math.abs(n).toFixed(1)}%${suffix}</span>`;
};

const compTag = (cur,prev) => {
  if (!prev||prev===0) return `<span class="comp-tag flat">—</span>`;
  const p = (cur-prev)/Math.abs(prev)*100;
  const cls=p>0?'up':p<0?'down':'flat', arr=p>0?'↑':p<0?'↓':'→';
  return `<span class="comp-tag ${cls}">${arr} ${Math.abs(p).toFixed(1)}%</span>`;
};

const marginClass = m => { const v=parseFloat(m); return isNaN(v)?'':v>=30?'m-good':v>=0?'m-warn':'m-bad'; };

const statusBadge = s => {
  const m={pending:['st-pending','Pendiente'],confirmed:['st-confirmed','Confirmado'],completed:['bg-green','Completado'],cancelled:['bg-gray','Cancelado']};
  const [cls,lbl]=m[s]||['bg-gray',s||'—'];
  return `<span class="badge ${cls}">${lbl}</span>`;
};

// ── HEALTH SCORE ──────────────────────────────────────────────────
function healthScore(b, allBoats) {
  let score = 50; // base
  // Income contribution
  if (b.income > 0) score += 10;
  // Margin
  const m = parseFloat(b.margin);
  if (m >= 40) score += 25; else if (m >= 25) score += 15; else if (m >= 10) score += 5; else if (m < 0) score -= 30;
  // Occupancy (via bookings)
  if (b.bookings >= 10) score += 10; else if (b.bookings >= 5) score += 5;
  // Expense ratio
  const expRatio = b.income > 0 ? b.expenses / b.income : 0;
  if (expRatio < 0.2) score += 10; else if (expRatio < 0.4) score += 5; else if (expRatio > 0.7) score -= 15;
  // Crew ratio
  const crewRatio = b.income > 0 ? b.crew / b.income : 0;
  if (crewRatio < 0.25) score += 5; else if (crewRatio > 0.5) score -= 10;
  // Trend
  if (b.incomeTrend > 10) score += 10; else if (b.incomeTrend < -20) score -= 15;
  score = Math.max(0, Math.min(100, Math.round(score)));
  let label, cls, fillCls;
  if (score >= 75) { label='Excelente'; cls='hs-excellent'; fillCls='hs-fill-excellent'; }
  else if (score >= 55) { label='Saludable'; cls='hs-healthy'; fillCls='hs-fill-healthy'; }
  else if (score >= 35) { label='Atención'; cls='hs-warning'; fillCls='hs-fill-warning'; }
  else { label='Riesgo'; cls='hs-risk'; fillCls='hs-fill-risk'; }
  return { score, label, cls, fillCls };
}

// ── DATE PRESETS ──────────────────────────────────────────────────
function setPreset(p) {
  const now = new Date(); let s, e;
  if (p==='month')     { s=new Date(now.getFullYear(),now.getMonth(),1); e=now; }
  else if (p==='lastmonth') { s=new Date(now.getFullYear(),now.getMonth()-1,1); e=new Date(now.getFullYear(),now.getMonth(),0); }
  else if (p==='quarter')  { s=new Date(now.getFullYear(),Math.floor(now.getMonth()/3)*3,1); e=now; }
  else if (p==='year')     { s=new Date(now.getFullYear(),0,1); e=now; }
  else if (p==='week')     { s=new Date(now-6*86400000); e=now; }
  $('filter-start').value = s.toISOString().split('T')[0];
  $('filter-end').value   = e.toISOString().split('T')[0];
  document.querySelectorAll('.pill').forEach(el=>el.classList.remove('active'));
  document.querySelector(`[onclick="setPreset('${p}')"]`)?.classList.add('active');
  loadData();
}

// ── TABS ──────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
  document.querySelector(`[data-testid="tab-${name}"]`)?.classList.add('active');
  $(`tab-${name}`)?.classList.add('active');
  // Lazy render charts that need layout
  if (D) {
    if (name==='ingresos') { renderIncomeDayChart(D.incomePerDay); renderIncomeDayTable(D.incomePerDay); renderIncomeByBoat(D.profitByBoat); }
    if (name==='gastos')   { renderDonut(D.expensesByCategory); renderCrewBars(D.profitByBoat); renderExpenseDetail(D.expensesByBoat); }
    if (name==='barcos')   { renderProfitBars(D.profitByBoat); renderIncomeBars(D.profitByBoat); }
  }
}

// ── INIT ─────────────────────────────────────────────────────────
(async () => {
  const now = new Date();
  $('filter-start').value = new Date(now.getFullYear(),now.getMonth(),1).toISOString().split('T')[0];
  $('filter-end').value   = now.toISOString().split('T')[0];
  try {
    const r = await fetch('/api/boats');
    if (r.ok) {
      const boats = await r.json();
      boats.forEach(b => {
        const o=document.createElement('option'); o.value=b.id; o.textContent=b.name;
        $('filter-boat').appendChild(o);
      });
    }
  } catch(_) {}
  $('filter-boat').addEventListener('change', loadData);
  await loadData();
})();

// ── MAIN LOAD ─────────────────────────────────────────────────────
async function loadData() {
  const start=$('filter-start').value, end=$('filter-end').value, boat=$('filter-boat').value;
  const params = new URLSearchParams({start,end}); if(boat) params.set('boat_id',boat);

  // Spinners for key elements
  ['owner-snap','kpi-grid','trend-chart-wrap','forecast-wrap','ranking-wrap','alerts-summary-wrap',
   'comparison-wrap','profit-table-wrap','ar-wrap','dep-wrap','upcoming-wrap'].forEach(id=>{
    const el=$(id); if(el) el.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  });
  $('kpi-grid').innerHTML='';

  try {
    const r = await fetch('/api/executive-dashboard?'+params);
    if (!r.ok) throw new Error('HTTP '+r.status);
    D = await r.json();
    renderAll(D);
    $('last-updated').textContent='Actualizado: '+new Date().toLocaleTimeString('es');
  } catch(err) {
    $('owner-snap').innerHTML=`<div class="loading" style="color:#ef4444">Error: ${esc(err.message)}</div>`;
    console.error(err);
  }
}

// ── RENDER ALL ────────────────────────────────────────────────────
function renderAll(d) {
  renderOwnerSnap(d);
  renderKPIs(d);
  renderTrendChart(d.trendPerDay, d.incomePerDay);
  renderForecast(d);
  renderRanking(d.profitByBoat);
  renderAlertsSummary(d.alerts);
  renderComparison(d.kpis, d.comparison);
  renderProfitTable(d.profitByBoat);
  renderAR(d.arList);
  renderDeposits(d.pendingDeposits);
  renderUpcoming(d.upcomingBookings);
  renderFullAlerts(d.alerts);
  // Alert badge
  const alta = d.alerts.filter(a=>a.priority==='alta').length;
  const badge=$('alert-badge');
  if (alta>0) { badge.style.display='inline-block'; badge.textContent=alta; } else badge.style.display='none';
  // Active tab chart re-render
  const activeTab = document.querySelector('.tab-content.active')?.id?.replace('tab-','');
  if (activeTab==='barcos')   { renderProfitBars(d.profitByBoat); renderIncomeBars(d.profitByBoat); }
  if (activeTab==='ingresos') { renderIncomeDayChart(d.incomePerDay); renderIncomeDayTable(d.incomePerDay); renderIncomeByBoat(d.profitByBoat); }
  if (activeTab==='gastos')   { renderDonut(d.expensesByCategory); renderCrewBars(d.profitByBoat); renderExpenseDetail(d.expensesByBoat); }
}

// ── OWNER SNAPSHOT ────────────────────────────────────────────────
function renderOwnerSnap(d) {
  const k=d.kpis, cmp=d.comparison;
  const boatsLoss = d.profitByBoat.filter(b=>b.profit<0);
  const topBoat   = d.profitByBoat.length ? d.profitByBoat[0] : null;

  $('owner-snap').innerHTML = `
    <div class="owner-snap" data-testid="snap-cards">
      <div class="snap-card ${k.netProfit>=0?'green':''}">
        <div class="snap-label">Ingresos del período</div>
        <div class="snap-value">${f$(k.income)}</div>
        <div class="snap-sub">${k.totalBookings} bookings · ${fN(k.totalHours,1)}h vendidas</div>
        ${chgTag(cmp.incomeChange)}
      </div>
      <div class="snap-card ${k.netProfit>=0?'green':''}">
        <div class="snap-label">Utilidad Neta</div>
        <div class="snap-value" style="color:${k.netProfit>=0?'#10b981':'#ef4444'}">${f$(k.netProfit)}</div>
        <div class="snap-sub">Margen ${k.income>0?((k.netProfit/k.income)*100).toFixed(1):'0'}%</div>
        ${chgTag(cmp.profitChange)}
      </div>
      <div class="snap-card blue">
        <div class="snap-label">Cash Esperado 7 días</div>
        <div class="snap-value" style="color:#60a5fa">${f$(k.cashExpected7d)}</div>
        <div class="snap-sub">De bookings + AR próximas</div>
      </div>
      <div class="snap-card ${boatsLoss.length>0?'':'green'}">
        <div class="snap-label">Salud de Flotilla</div>
        <div class="snap-value" style="color:${boatsLoss.length>0?'#f59e0b':'#10b981'}">${boatsLoss.length===0?'OK':'⚠ '+boatsLoss.length+' bote(s)'}</div>
        <div class="snap-sub">${boatsLoss.length>0?boatsLoss.map(b=>b.name).join(', '):'Todos generando margen positivo'}</div>
      </div>
      <div class="snap-card amber">
        <div class="snap-label">Por Cobrar Pendiente</div>
        <div class="snap-value" style="color:#fbbf24">${f$(k.arPending)}</div>
        <div class="snap-sub">${k.arCount} cuentas · ${k.depositsCount} depósito(s) sin aplicar</div>
      </div>
    </div>`;
}

// ── KPI GRID ─────────────────────────────────────────────────────
function renderKPIs(d) {
  const k=d.kpis, cmp=d.comparison;
  const kpis = [
    { l:'Ingresos',          v:f$(k.income,2),               s:'período', c:'c-blue',   ch:cmp.incomeChange },
    { l:'Utilidad Neta',     v:f$(k.netProfit,2),            s:`gastos+crew descontados`, c:k.netProfit>=0?'c-green':'c-red', ch:cmp.profitChange },
    { l:'Gastos Operativos', v:f$(k.expenses,2),             s:'boat expenses', c:'c-orange', ch:cmp.expensesChange },
    { l:'Crew Cost',         v:f$(k.crewCost,2),             s:'capitán + stew', c:'c-purple' },
    { l:'Ingreso/Booking',   v:f$(k.incomePerBooking,0),     s:`${k.totalBookings} bookings`, c:'c-teal' },
    { l:'Ingreso/Hora',      v:f$(k.incomePerHour,0),        s:`${fN(k.totalHours,1)}h vendidas`, c:'c-blue' },
    { l:'Costo/Hora',        v:f$(k.costPerHour,0),          s:'gastos+crew por hora', c:'c-orange' },
    { l:'Utilidad/Hora',     v:f$(k.profitPerHour,0),        s:'', c:k.profitPerHour>=0?'c-green':'c-red' },
    { l:'AR Pendiente',      v:f$(k.arPending,0),            s:`${k.arCount} cuentas`, c:'c-red' },
    { l:'Depósitos Pend.',   v:f$(k.depositsPending,0),      s:`${k.depositsCount} sin aplicar`, c:k.depositsCount>0?'c-orange':'c-green' },
    { l:'Ocupación Estimada',v:fPct(k.occupancy),            s:'bookings/barco×días', c:'c-teal' },
    { l:'Barcos en Pérdida', v:k.boatsWithLoss,              s:'utilidad negativa', c:k.boatsWithLoss>0?'c-red':'c-green' },
  ];
  $('kpi-grid').innerHTML = kpis.map(k=>`
    <div class="kpi-card ${k.c}" data-testid="kpi-${k.l.replace(/\s+/g,'-').toLowerCase()}">
      <div class="kpi-label">${esc(k.l)}</div>
      <div class="kpi-val">${k.v}</div>
      <div class="kpi-sub">${k.s}</div>
      ${k.ch!=null?chgTag(k.ch):''}
    </div>`).join('');
}

// ── TREND CHART (SVG Area) ────────────────────────────────────────
function renderTrendChart(trendPerDay, incomePerDay) {
  if (!trendPerDay || trendPerDay.length === 0) {
    if (!incomePerDay || incomePerDay.length === 0) {
      $('trend-chart-wrap').innerHTML='<div class="loading" style="color:#94a3b8">Sin datos de tendencia en el período</div>';
      $('trend-meta').textContent='';
      return;
    }
    trendPerDay = incomePerDay.map(r => ({ date:r.date, income:parseFloat(r.income), expense:0 }));
  }

  const W=760, H=180, PL=50, PR=16, PT=16, PB=30;
  const cW=W-PL-PR, cH=H-PT-PB;
  const maxVal = Math.max(...trendPerDay.map(d=>Math.max(d.income||0, d.expense||0)), 1);
  const n=trendPerDay.length;
  const xOf = i => PL + (n>1 ? i/(n-1)*cW : cW/2);
  const yOf = v => PT + cH - (v/maxVal)*cH;

  const mkPath = (key, close=false) => {
    const pts = trendPerDay.map((d,i)=>`${xOf(i).toFixed(1)},${yOf(d[key]||0).toFixed(1)}`).join(' ');
    if (!close) return `M ${pts.replace(/ /g,' L ')}`;
    const base = `${xOf(n-1).toFixed(1)},${(PT+cH).toFixed(1)} ${PL.toFixed(1)},${(PT+cH).toFixed(1)}`;
    return `M ${pts.replace(/ /g,' L ')} L ${base} Z`;
  };

  // Y axis ticks
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const v = maxVal*f, y = yOf(v);
    return `<line x1="${PL}" y1="${y.toFixed(1)}" x2="${W-PR}" y2="${y.toFixed(1)}" stroke="#f1f5f9" stroke-width="1"/>
            <text x="${(PL-6).toFixed(1)}" y="${(y+4).toFixed(1)}" text-anchor="end" fill="#94a3b8" font-size="9">${v>=1000?'$'+(v/1000).toFixed(0)+'k':'$'+v.toFixed(0)}</text>`;
  }).join('');

  // X axis labels (show ~6 labels)
  const step = Math.max(1, Math.floor(n/6));
  const xLabels = trendPerDay.map((d,i)=>i%step===0||i===n-1?`<text x="${xOf(i).toFixed(1)}" y="${(PT+cH+18).toFixed(1)}" text-anchor="middle" fill="#94a3b8" font-size="9">${fDate(d.date)}</text>`:'').join('');

  // Compute profit (income - expense) for profit line
  const profitPts = trendPerDay.map((d,i)=>`${xOf(i).toFixed(1)},${yOf(Math.max(0,(d.income||0)-(d.expense||0))).toFixed(1)}`).join(' L ');

  $('trend-chart-wrap').innerHTML = `
    <div class="chart-wrap">
      <svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="height:180px">
        ${ticks}${xLabels}
        <path d="${mkPath('income',true)}" fill="rgba(0,102,204,.08)" stroke="none"/>
        <path d="${mkPath('expense',true)}" fill="rgba(245,158,11,.08)" stroke="none"/>
        <path d="${mkPath('income')}" fill="none" stroke="#0066cc" stroke-width="2" stroke-linejoin="round"/>
        <path d="${mkPath('expense')}" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4,3" stroke-linejoin="round"/>
        <path d="M ${profitPts}" fill="none" stroke="#10b981" stroke-width="1.5" stroke-linejoin="round"/>
      </svg>
    </div>
    <div class="chart-legend">
      <div class="legend-item"><div class="legend-dot" style="background:#0066cc"></div>Ingresos</div>
      <div class="legend-item"><div class="legend-dot" style="background:#f59e0b"></div>Gastos</div>
      <div class="legend-item"><div class="legend-dot" style="background:#10b981"></div>Utilidad</div>
    </div>`;
  $('trend-meta').textContent = n+' días';
}

// ── FORECAST ─────────────────────────────────────────────────────
function renderForecast(d) {
  const k = d.kpis;
  const upcoming7 = d.upcomingBookings.filter(b=>{
    const bd=new Date(b.booking_date); const now=new Date();
    return bd>=now && bd<=new Date(now.getTime()+7*86400000);
  });
  const upcoming30 = d.upcomingBookings;
  const bal30 = upcoming30.reduce((s,b)=>s+Math.max(0,parseFloat(b.total_amount||0)-parseFloat(b.deposit_amount||0)),0);

  $('forecast-wrap').innerHTML = `
    <div class="forecast-row"><span class="forecast-label">Cash esperado — próximos 7 días</span><span class="forecast-val">${f$(k.cashExpected7d)}</span></div>
    <div class="forecast-row"><span class="forecast-label">Saldo de ${upcoming30.length} bookings próximos</span><span class="forecast-val">${f$(bal30)}</span></div>
    <div class="forecast-row"><span class="forecast-label">AR pendiente total</span><span class="forecast-val">${f$(k.arPending)}</span></div>
    <div class="forecast-row"><span class="forecast-label">Depósitos aplicados en período</span><span class="forecast-val">${f$(k.depositsApplied.total)} <span style="font-size:11px;color:#94a3b8">(${k.depositsApplied.count} dep.)</span></span></div>
    <div class="forecast-row"><span class="forecast-label">Bookings próximos (7 días)</span><span class="forecast-val" style="color:#374151;font-size:14px">${upcoming7.length} reservas</span></div>`;
}

// ── RANKING ───────────────────────────────────────────────────────
function renderRanking(rows) {
  if (!rows||!rows.length) { $('ranking-wrap').innerHTML='<div class="loading" style="color:#94a3b8">Sin datos</div>'; return; }
  const sorted=[...rows].sort((a,b)=>b.income-a.income).slice(0,7);
  $('ranking-wrap').innerHTML = sorted.map((b,i)=>{
    const hs = healthScore(b);
    const rCls = i===0?'r1':i===1?'r2':i===2?'r3':'rn';
    return `<div class="rank-item">
      <div class="rank-num ${rCls}">${i+1}</div>
      <div style="flex:1">
        <div class="rank-name">${esc(b.name)}</div>
        <div style="margin-top:3px"><span class="health-label ${hs.cls}">${hs.label} ${hs.score}</span></div>
      </div>
      <div style="text-align:right">
        <div class="rank-val">${f$(b.income)}</div>
        <div style="font-size:10px;color:${b.profit>=0?'#10b981':'#ef4444'};font-weight:600">${f$(b.profit)} util.</div>
      </div>
    </div>`;
  }).join('');
}

// ── ALERTS SUMMARY ────────────────────────────────────────────────
function renderAlertsSummary(alerts) {
  const el=$('alerts-summary-wrap'), metaEl=$('alerts-count-meta');
  if (!alerts||!alerts.length) {
    el.innerHTML='<div class="loading" style="color:#94a3b8;padding:24px">Sin alertas activas. Excelente.</div>';
    metaEl.textContent='0 alertas';
    return;
  }
  metaEl.textContent=alerts.length+' activas';
  const sorted=[...alerts].sort((a,b)=>({alta:0,media:1,baja:2}[a.priority]||2)-({alta:0,media:1,baja:2}[b.priority]||2));
  el.innerHTML=`<div class="alert-list">${sorted.slice(0,8).map(a=>`
    <div class="alert-row ${a.priority}"><div class="alert-dot"></div>
    <div><span class="alert-pri">${a.priority}</span>${esc(a.msg)}</div></div>`).join('')}
  </div>`;
}

// ── COMPARISON ────────────────────────────────────────────────────
function renderComparison(k, cmp) {
  const rows=[
    { l:'Ingresos',          cur:f$(k.income),      prev:f$(cmp.prevIncome),   chg:cmp.incomeChange },
    { l:'Gastos',            cur:f$(k.expenses),    prev:f$(cmp.prevExpenses), chg:cmp.expensesChange },
    { l:'Crew Cost',         cur:f$(k.crewCost),    prev:f$(cmp.prevCrew),     chg:null },
    { l:'Utilidad Neta',     cur:f$(k.netProfit),   prev:f$(cmp.prevProfit),   chg:cmp.profitChange },
    { l:'Horas Vendidas',    cur:fN(k.totalHours,1)+'h', prev:'—', chg:null },
    { l:'Ocupación',         cur:fPct(k.occupancy), prev:'—', chg:null },
    { l:'Cash Esperado 7d',  cur:f$(k.cashExpected7d), prev:'—', chg:null },
  ];
  $('comparison-wrap').innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">`+rows.map(r=>`
    <div class="comp-row">
      <span class="comp-label">${r.l}</span>
      <div class="comp-right">
        <span class="comp-prev">${r.prev}</span>
        <span class="comp-cur">${r.cur}</span>
        ${r.chg!=null?compTag(parseFloat(r.cur.replace(/[$,]/g,'')), parseFloat(r.prev.replace(/[$,]/g,''))):'<span class="comp-tag flat">—</span>'}
      </div>
    </div>`).join('')+'</div>';
}

// ── PROFIT TABLE (sortable + health score + drill-down) ───────────
function renderProfitTable(rows) {
  if (!rows||!rows.length) {
    $('profit-table-wrap').innerHTML='<div class="empty-st">Sin datos de rentabilidad en el período</div>';
    $('profit-meta').textContent=''; return;
  }
  const sorted=[...rows].sort((a,b)=>{ const av=parseFloat(a[sortField]||0),bv=parseFloat(b[sortField]||0); return sortDir==='asc'?av-bv:bv-av; });
  $('profit-meta').textContent=sorted.length+' barcos';
  const th=(f,l)=>`<th class="${sortField===f?(sortDir==='asc'?'sort-asc':'sort-desc'):''}" onclick="toggleSort('${f}')">${l}</th>`;

  $('profit-table-wrap').innerHTML=`<div class="tbl-wrap"><table>
    <thead><tr>
      <th>Barco</th><th>Health</th>
      ${th('bookings','Bkg')}${th('hours','Horas')}
      ${th('income','Ingresos')}${th('incomePerBooking','$/Bkg')}${th('incomePerHour','$/h')}
      ${th('expenses','Gastos')}${th('crew','Crew')}
      ${th('profit','Utilidad')}${th('margin','Margen')}
      <th>Tendencia</th>
    </tr></thead>
    <tbody>
    ${sorted.map(b=>{
      const hs=healthScore(b);
      const trendArrow = b.incomeTrend===null?'—':b.incomeTrend>5?`<span style="color:#10b981;font-weight:700">↑ ${b.incomeTrend.toFixed(0)}%</span>`:b.incomeTrend<-5?`<span style="color:#ef4444;font-weight:700">↓ ${Math.abs(b.incomeTrend).toFixed(0)}%</span>`:`<span style="color:#94a3b8">→</span>`;
      return `<tr onclick="toggleDrill('${esc(b.id)}')" style="cursor:pointer" data-testid="row-boat-${esc(b.id)}">
        <td class="td-bold">${esc(b.name)}</td>
        <td><div class="health-bar-wrap" style="min-width:120px">
          <div class="health-bar"><div class="health-fill ${hs.fillCls}" style="width:${hs.score}%"></div></div>
          <span class="health-label ${hs.cls}">${hs.label}</span>
        </div></td>
        <td class="td-right">${b.bookings}</td>
        <td class="td-right">${fN(b.hours,1)}h</td>
        <td class="td-right td-mono">${f$(b.income,2)}</td>
        <td class="td-right td-mono">${f$(b.incomePerBooking,0)}</td>
        <td class="td-right td-mono">${f$(b.incomePerHour,0)}</td>
        <td class="td-right td-mono">${f$(b.expenses,2)}</td>
        <td class="td-right td-mono">${f$(b.crew,2)}</td>
        <td class="td-right td-mono" style="font-weight:700;color:${b.profit>=0?'#10b981':'#ef4444'}">${f$(b.profit,2)}</td>
        <td class="td-right"><span class="${marginClass(b.margin)}">${fPct(b.margin)}</span></td>
        <td class="td-center">${trendArrow}</td>
      </tr>
      <tr id="drill-${esc(b.id)}" style="display:none">
        <td colspan="12" style="padding:0">
          <div class="drill-panel open">
            <div class="drill-title">Detalle — ${esc(b.name)}</div>
            <div class="drill-grid">
              <div class="drill-cell"><div class="drill-cell-label">Ingreso/Booking</div><div class="drill-cell-val">${f$(b.incomePerBooking,0)}</div></div>
              <div class="drill-cell"><div class="drill-cell-label">Ingreso/Hora</div><div class="drill-cell-val">${f$(b.incomePerHour,0)}</div></div>
              <div class="drill-cell"><div class="drill-cell-label">Costo/Hora</div><div class="drill-cell-val">${f$(b.costPerHour,0)}</div></div>
              <div class="drill-cell"><div class="drill-cell-label">Utilidad/Hora</div><div class="drill-cell-val" style="color:${b.profitPerHour>=0?'#10b981':'#ef4444'}">${f$(b.profitPerHour,0)}</div></div>
              <div class="drill-cell"><div class="drill-cell-label">Capitán</div><div class="drill-cell-val">${f$(b.captain,0)}</div></div>
              <div class="drill-cell"><div class="drill-cell-label">Stew</div><div class="drill-cell-val">${f$(b.stew,0)}</div></div>
              <div class="drill-cell"><div class="drill-cell-label">Crew % de Ingresos</div><div class="drill-cell-val">${b.income>0?((b.crew/b.income)*100).toFixed(1)+'%':'—'}</div></div>
              <div class="drill-cell"><div class="drill-cell-label">Gastos % de Ingresos</div><div class="drill-cell-val">${b.income>0?((b.expenses/b.income)*100).toFixed(1)+'%':'—'}</div></div>
            </div>
          </div>
        </td>
      </tr>`;
    }).join('')}
    </tbody></table></div>`;
}

function toggleDrill(id) {
  const row=$(`drill-${id}`);
  if (row) row.style.display=row.style.display==='none'?'table-row':'none';
}

function toggleSort(f) {
  if (sortField===f) sortDir=sortDir==='asc'?'desc':'asc'; else { sortField=f; sortDir='desc'; }
  if (D) renderProfitTable(D.profitByBoat);
}

// ── PROFIT BARS ───────────────────────────────────────────────────
function renderProfitBars(rows) {
  if (!rows||!rows.length) { $('profit-bars-wrap').innerHTML='<div class="empty-st">Sin datos</div>'; return; }
  const sorted=[...rows].sort((a,b)=>b.profit-a.profit);
  const maxAbs=Math.max(...sorted.map(b=>Math.abs(b.profit)),1);
  $('profit-bars-wrap').innerHTML=`<div class="hbar-wrap">${sorted.map(b=>{
    const pct=Math.abs(b.profit)/maxAbs*100, col=b.profit>=0?'#10b981':'#ef4444';
    return `<div class="hbar-row">
      <div class="hbar-label" title="${esc(b.name)}">${esc(b.name)}</div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${pct.toFixed(1)}%;background:${col}"></div></div>
      <div class="hbar-val" style="color:${col}">${f$(b.profit,0)}</div>
    </div>`;}).join('')}</div>`;
}

function renderIncomeBars(rows) {
  if (!rows||!rows.length) { $('income-bars-wrap').innerHTML='<div class="empty-st">Sin datos</div>'; return; }
  const sorted=[...rows].sort((a,b)=>b.income-a.income);
  const maxInc=Math.max(...sorted.map(b=>b.income),1);
  $('income-bars-wrap').innerHTML=`<div class="hbar-wrap">${sorted.map(b=>{
    const pct=b.income/maxInc*100;
    return `<div class="hbar-row">
      <div class="hbar-label" title="${esc(b.name)}">${esc(b.name)}</div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${pct.toFixed(1)}%;background:#0066cc"></div></div>
      <div class="hbar-val">${f$(b.income,0)}</div>
    </div>`;}).join('')}</div>`;
}

// ── INCOME DAY CHART (SVG area) ───────────────────────────────────
function renderIncomeDayChart(rows) {
  if (!rows||!rows.length) { $('income-day-chart').innerHTML='<div class="empty-st">Sin ingresos en el período</div>'; $('income-day-meta').textContent=''; return; }
  $('income-day-meta').textContent=rows.length+' días';
  const W=680, H=160, PL=48, PR=12, PT=12, PB=28;
  const cW=W-PL-PR, cH=H-PT-PB;
  const maxVal=Math.max(...rows.map(r=>parseFloat(r.income)),1);
  const n=rows.length;
  const xOf=i=>PL+(n>1?i/(n-1)*cW:cW/2);
  const yOf=v=>PT+cH-(v/maxVal)*cH;
  const pts=rows.map((r,i)=>`${xOf(i).toFixed(1)},${yOf(parseFloat(r.income)).toFixed(1)}`).join(' L ');
  const areaClose=`L ${xOf(n-1).toFixed(1)},${(PT+cH).toFixed(1)} L ${PL},${(PT+cH).toFixed(1)} Z`;
  const step=Math.max(1,Math.floor(n/5));
  const xLabels=rows.map((r,i)=>i%step===0||i===n-1?`<text x="${xOf(i).toFixed(1)}" y="${(PT+cH+18).toFixed(1)}" text-anchor="middle" fill="#94a3b8" font-size="9">${fDate(r.date)}</text>`:'').join('');
  const yTicks=[0,.5,1].map(f=>{const v=maxVal*f,y=yOf(v);return `<line x1="${PL}" y1="${y.toFixed(1)}" x2="${W-PR}" y2="${y.toFixed(1)}" stroke="#f1f5f9" stroke-width="1"/><text x="${(PL-4).toFixed(1)}" y="${(y+4).toFixed(1)}" text-anchor="end" fill="#94a3b8" font-size="9">${v>=1000?'$'+(v/1000).toFixed(0)+'k':'$'+v.toFixed(0)}</text>`;}).join('');
  $('income-day-chart').innerHTML=`<div class="chart-wrap"><svg class="chart-svg" viewBox="0 0 ${W} ${H}" style="height:160px">
    ${yTicks}${xLabels}
    <path d="M ${pts} ${areaClose}" fill="rgba(0,102,204,.1)" stroke="none"/>
    <path d="M ${pts}" fill="none" stroke="#0066cc" stroke-width="2"/>
  </svg></div>`;
}

function renderIncomeDayTable(rows) {
  if (!rows||!rows.length) { $('income-table-wrap').innerHTML='<div class="empty-st">Sin ingresos en el período</div>'; return; }
  const maxInc=Math.max(...rows.map(r=>parseFloat(r.income)),1);
  $('income-table-wrap').innerHTML=`<div class="tbl-wrap"><table>
    <thead><tr><th>Fecha</th><th>Ingresos</th><th style="min-width:120px">Volumen</th><th class="td-right">Transacciones</th></tr></thead>
    <tbody>${rows.map(r=>{
      const inc=parseFloat(r.income), pct=inc/maxInc*100;
      return `<tr><td class="td-bold">${fDate(r.date)}</td><td class="td-mono">${f$(inc,2)}</td>
        <td><div class="income-bar-wrap"><div class="income-bar-bg"><div class="income-bar-fill" style="width:${pct.toFixed(1)}%"></div></div></div></td>
        <td class="td-right" style="color:#94a3b8">${r.tx_count}</td></tr>`;}).join('')}
    </tbody></table></div>`;
}

function renderIncomeByBoat(rows) {
  if (!rows||!rows.length) { $('income-by-boat-wrap').innerHTML='<div class="empty-st">Sin datos</div>'; return; }
  const sorted=[...rows].sort((a,b)=>b.income-a.income);
  const maxInc=Math.max(...sorted.map(b=>b.income),1);
  $('income-by-boat-wrap').innerHTML=`<div class="hbar-wrap">${sorted.map(b=>{
    const pct=b.income/maxInc*100;
    return `<div class="hbar-row">
      <div class="hbar-label" title="${esc(b.name)}">${esc(b.name)}</div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${pct.toFixed(1)}%;background:#0891b2"></div></div>
      <div class="hbar-val">${f$(b.income,0)}</div>
    </div>`;}).join('')}</div>`;
}

// ── DONUT CHART ───────────────────────────────────────────────────
const CAT_LABELS={ fuel:'Combustible', maintenance_parts:'Mantenimiento', labor:'Mano de Obra', cleaning:'Limpieza', marina_fees:'Marina', insurance:'Seguro', emergency_repairs:'Reparaciones', operational:'Operacional' };
const CAT_COLORS=['#0066cc','#f59e0b','#10b981','#7c3aed','#ef4444','#0891b2','#d97706','#64748b'];

function renderDonut(cats) {
  if (!cats||!cats.length) { $('donut-wrap').innerHTML='<div class="empty-st">Sin gastos en el período</div>'; return; }
  const total=cats.reduce((s,c)=>s+c.total,0)||1;
  const R=60, CX=70, CY=70, GAP=2;
  let cumAngle=0;
  const slices=cats.map((c,i)=>{ const pct=c.total/total; return { ...c, pct, angle:pct*360, color:CAT_COLORS[i%CAT_COLORS.length] }; });
  const paths=slices.map(s=>{
    const start=cumAngle, end=cumAngle+=s.angle;
    const a1=start*Math.PI/180, a2=end*Math.PI/180;
    const x1=CX+R*Math.sin(a1), y1=CY-R*Math.cos(a1);
    const x2=CX+R*Math.sin(a2), y2=CY-R*Math.cos(a2);
    const large=s.angle>180?1:0;
    return `<path d="M ${CX},${CY} L ${x1.toFixed(2)},${y1.toFixed(2)} A ${R},${R} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${s.color}" stroke="#fff" stroke-width="2"/>`;
  }).join('');

  $('donut-wrap').innerHTML=`<div class="donut-wrap">
    <svg class="donut-svg" viewBox="0 0 140 140" width="140" height="140" style="flex-shrink:0">
      ${paths}
      <circle cx="${CX}" cy="${CY}" r="30" fill="#fff"/>
      <text x="${CX}" y="${CY+4}" text-anchor="middle" font-size="10" fill="#374151" font-weight="700">Gastos</text>
    </svg>
    <div class="donut-legend">
      ${slices.slice(0,6).map(s=>`<div class="donut-item">
        <div class="donut-dot" style="background:${s.color}"></div>
        <span class="donut-name">${esc(CAT_LABELS[s.category]||s.category)}</span>
        <span class="donut-pct">${(s.pct*100).toFixed(1)}% · ${f$(s.total)}</span>
      </div>`).join('')}
    </div>
  </div>`;
}

function renderCrewBars(rows) {
  const withCrew=rows.filter(b=>b.captain>0||b.stew>0).sort((a,b)=>b.crew-a.crew);
  if (!withCrew.length) { $('crew-bars-wrap').innerHTML='<div class="empty-st">Sin pagos de crew en el período</div>'; return; }
  const maxCrew=Math.max(...withCrew.map(b=>b.crew),1);
  $('crew-bars-wrap').innerHTML=`<div class="hbar-wrap">${withCrew.map(b=>{
    const pctCap=b.captain/maxCrew*100, pctStew=b.stew/maxCrew*100;
    return `<div class="hbar-row">
      <div class="hbar-label" title="${esc(b.name)}">${esc(b.name)}</div>
      <div style="flex:1;display:flex;flex-direction:column;gap:3px">
        <div class="hbar-track"><div class="hbar-fill" style="width:${pctCap.toFixed(1)}%;background:#7c3aed"></div></div>
        <div class="hbar-track"><div class="hbar-fill" style="width:${pctStew.toFixed(1)}%;background:#a78bfa"></div></div>
      </div>
      <div class="hbar-val" style="color:#7c3aed">${f$(b.crew,0)}</div>
    </div>`;}).join('')}
    <div style="padding:4px 16px;font-size:10px;color:#94a3b8;display:flex;gap:12px">
      <span style="color:#7c3aed;font-weight:600">■</span> Capitán&nbsp;&nbsp;<span style="color:#a78bfa;font-weight:600">■</span> Stew
    </div></div>`;
}

function renderExpenseDetail(boats) {
  if (!boats||!boats.length) { $('expense-detail-wrap').innerHTML='<div class="empty-st">Sin gastos en el período</div>'; return; }
  const sorted=[...boats].sort((a,b)=>b.total-a.total);
  $('expense-detail-wrap').innerHTML=`<div class="tbl-wrap"><table>
    <thead><tr><th>Barco</th><th class="td-right">Total</th>${Object.keys(CAT_LABELS).map(k=>`<th class="td-right">${CAT_LABELS[k]}</th>`).join('')}</tr></thead>
    <tbody>${sorted.map(b=>`<tr>
      <td class="td-bold">${esc(b.boatName)}</td>
      <td class="td-right td-mono" style="font-weight:700;color:#d97706">${f$(b.total,2)}</td>
      ${Object.keys(CAT_LABELS).map(k=>`<td class="td-right td-mono">${b.categories[k]?f$(b.categories[k],0):'—'}</td>`).join('')}
    </tr>`).join('')}
    </tbody></table></div>`;
}

// ── AR ────────────────────────────────────────────────────────────
function renderAR(rows) {
  $('ar-meta').textContent=(rows||[]).length+' cuentas';
  if (!rows||!rows.length) { $('ar-wrap').innerHTML='<div class="empty-st">Sin AR pendiente</div>'; return; }
  const now=new Date();
  $('ar-wrap').innerHTML=`<div class="tbl-wrap"><table>
    <thead><tr><th>Cliente / Parte</th><th>Barco</th><th class="td-right">Monto</th><th>Vence</th><th>Estado</th></tr></thead>
    <tbody>${rows.map(r=>{
      const overdue=r.due_date&&new Date(r.due_date)<now;
      return `<tr>
        <td class="td-bold">${esc(r.party_name||r.client_name||'—')}</td>
        <td>${esc(r.boat_name_ref||r.boat_id||'—')}</td>
        <td class="td-right td-mono">${f$(r.amount,2)}</td>
        <td style="${overdue?'color:#ef4444;font-weight:700':''}">${fDate(r.due_date)}</td>
        <td>${overdue?'<span class="badge bg-red">Vencida</span>':'<span class="badge bg-yellow">Pendiente</span>'}</td>
      </tr>`;}).join('')}
    </tbody></table></div>`;
}

// ── DEPOSITS ──────────────────────────────────────────────────────
function renderDeposits(rows) {
  $('dep-meta').textContent=(rows||[]).length+' depósitos';
  if (!rows||!rows.length) { $('dep-wrap').innerHTML='<div class="empty-st">Sin depósitos pendientes</div>'; return; }
  $('dep-wrap').innerHTML=`<div class="tbl-wrap"><table>
    <thead><tr><th>Cliente</th><th>Barco</th><th>Fecha Bkg.</th><th class="td-right">Depósito</th><th class="td-right">Total</th></tr></thead>
    <tbody>${rows.map(r=>`<tr>
      <td class="td-bold">${esc(r.client_name)}</td>
      <td>${esc(r.boat_name_ref||r.boat_id||'—')}</td>
      <td>${fDate(r.booking_date)}</td>
      <td class="td-right td-mono">${f$(r.amount,2)}</td>
      <td class="td-right td-mono">${f$(r.booking_total_amount,2)}</td>
    </tr>`).join('')}
    </tbody></table></div>`;
}

// ── UPCOMING ──────────────────────────────────────────────────────
function renderUpcoming(rows) {
  $('upcoming-meta').textContent=(rows||[]).length+' próximos';
  if (!rows||!rows.length) { $('upcoming-wrap').innerHTML='<div class="empty-st">Sin próximos bookings</div>'; return; }
  $('upcoming-wrap').innerHTML=`<div class="tbl-wrap"><table>
    <thead><tr><th>Fecha</th><th>Cliente / Broker</th><th>Barco</th><th class="td-right">Total</th><th class="td-right">Dep.</th><th class="td-right">Saldo</th><th>Estado</th></tr></thead>
    <tbody>${rows.map(b=>{
      const client=b.customer_name||b.broker_name||b.final_customer_name||'—';
      const dep=parseFloat(b.deposit_amount||0), total=parseFloat(b.total_amount||0), bal=total-dep;
      return `<tr>
        <td style="white-space:nowrap">${fDate(b.booking_date)}</td>
        <td class="td-bold">${esc(client)}</td>
        <td>${esc(b.boat_name_ref||b.boat_id||'—')}</td>
        <td class="td-right td-mono">${f$(total,2)}</td>
        <td class="td-right td-mono" style="color:#10b981">${f$(dep,2)}</td>
        <td class="td-right td-mono" style="color:${bal>0?'#f59e0b':'#94a3b8'};font-weight:${bal>0?700:400}">${f$(bal,2)}</td>
        <td>${statusBadge(b.status)}</td>
      </tr>`;}).join('')}
    </tbody></table></div>`;
}

// ── FULL ALERTS ───────────────────────────────────────────────────
function renderFullAlerts(alerts) {
  $('full-alerts-meta').textContent=(alerts||[]).length+' alertas';
  if (!alerts||!alerts.length) {
    $('full-alerts-wrap').innerHTML='<div class="empty-st" style="padding:40px">Sin alertas. Todo en orden.</div>';
    return;
  }
  const sorted=[...alerts].sort((a,b)=>({alta:0,media:1,baja:2}[a.priority]||2)-({alta:0,media:1,baja:2}[b.priority]||2));
  $('full-alerts-wrap').innerHTML=`<div class="alert-list" style="max-height:none;padding:16px">${sorted.map(a=>`
    <div class="alert-row ${a.priority}">
      <div class="alert-dot"></div>
      <div style="flex:1">
        <span class="alert-pri">${a.priority.toUpperCase()}</span>
        ${esc(a.msg)}
        ${a.boat?`<span class="badge bg-gray" style="margin-left:6px">${esc(a.boat)}</span>`:''}
      </div>
    </div>`).join('')}</div>`;
}
