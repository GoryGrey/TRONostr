/**
 * Static assets for the public TRONostr live dashboard served by ApiServer at "/".
 * Plain HTML/CSS/JS, no build step, no third-party scripts, fonts, or trackers. All charts are
 * inline SVG drawn from the JSON API. Every string from the API is inserted with textContent.
 */

export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TRONostr · Live TRON network monitor</title>
<meta name="description" content="Independent, open-source live monitor of TRON whale transfers, USDT flows and the energy rental market, served by a TRONostr instance.">
<link rel="stylesheet" href="/assets/dashboard.css">
</head>
<body>
<header>
  <div class="brand">
    <h1>TRONostr</h1>
    <p class="sub">Live TRON network monitor &middot; open-source engine anyone can run (<a href="https://github.com/GoryGrey/TRONostr" rel="noopener">source</a>)</p>
  </div>
  <div class="status" id="status">connecting&hellip;</div>
</header>
<main>
  <section class="cards" id="cards"></section>

  <section class="panel">
    <h2>Whale USDT volume per hour <span class="muted" id="trend-range"></span></h2>
    <div class="chart" id="chart-usdt"></div>
  </section>
  <section class="grid2">
    <div class="panel">
      <h2>Energy rental market: delegations per hour</h2>
      <p class="muted small">All successful Stake 2.0 DelegateResource calls seen, not only large ones.</p>
      <div class="chart" id="chart-deleg"></div>
    </div>
    <div class="panel">
      <h2>Network transactions per hour</h2>
      <div class="chart" id="chart-tx"></div>
    </div>
  </section>

  <section class="grid2">
    <div class="panel">
      <h2>Latest whale transfers</h2>
      <table><thead><tr><th>Time (UTC)</th><th>Asset</th><th class="r">Amount</th><th>From &rarr; To</th><th>Tx</th></tr></thead>
      <tbody id="whales"><tr><td colspan="5" class="muted">waiting for data&hellip;</td></tr></tbody></table>
    </div>
    <div class="panel">
      <h2>Large energy / bandwidth delegations</h2>
      <table><thead><tr><th>Time (UTC)</th><th>Action</th><th>Resource</th><th class="r">Staked TRX</th><th>Tx</th></tr></thead>
      <tbody id="delegs"><tr><td colspan="5" class="muted">waiting for data&hellip;</td></tr></tbody></table>
    </div>
  </section>

  <section class="panel" id="flows-panel">
    <h2>Labeled exchange flows (last hour)</h2>
    <p class="muted small">Labels come only from cited public sources (see <a href="/api/v1/labels">/api/v1/labels</a>). Exchanges use many more wallets than are labeled here.</p>
    <table><thead><tr><th>Entity</th><th>Asset</th><th class="r">Inflow</th><th class="r">Outflow</th><th class="r">Net</th></tr></thead>
    <tbody id="flows"><tr><td colspan="5" class="muted">no labeled flows in window</td></tr></tbody></table>
  </section>
</main>
<footer>
  <p>TRONostr is an independent, open-source project. It is not affiliated with, endorsed by, or speaking for TRON DAO, the TRON Foundation, Tether, or any exchange.
  Data is read from public TRON mainnet APIs (TronGrid) and may be delayed or incomplete. Nothing here is financial advice.</p>
  <p>Open JSON API: <a href="/api/v1/summary">/api/v1/summary</a> &middot; <a href="/api/v1/trends?hours=24">/api/v1/trends</a> &middot; <a href="/api/v1/history?limit=20">/api/v1/history</a> &middot; <a href="/api/v1/status">/api/v1/status</a></p>
</footer>
<script src="/assets/dashboard.js" defer></script>
</body>
</html>
`;

export const DASHBOARD_CSS = `:root{--bg:#0d0f14;--panel:#161a22;--line:#262c38;--text:#e7e9ee;--muted:#8a93a6;--accent:#ff3b47;--accent2:#3bb3ff;--ok:#3ccf8e}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
a{color:var(--accent2)}header{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px 24px;border-bottom:1px solid var(--line)}
h1{margin:0;font-size:22px;letter-spacing:.3px}h1::before{content:"";display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--accent);margin-right:8px;vertical-align:middle}
h2{font-size:15px;margin:0 0 10px}.sub{margin:2px 0 0;color:var(--muted)}.status{color:var(--muted);font-size:13px;text-align:right}
main{padding:18px 24px;display:flex;flex-direction:column;gap:16px;max-width:1280px;margin:0 auto}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px}.card .v{font-size:22px;font-weight:600}.card .k{color:var(--muted);font-size:12px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 16px;overflow-x:auto}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:16px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);white-space:nowrap}th{color:var(--muted);font-weight:500}
.r{text-align:right}.muted{color:var(--muted)}.small{font-size:12px;margin:-4px 0 8px}.mono{font-family:ui-monospace,Menlo,monospace;font-size:12px}
.chart svg{width:100%;height:160px;display:block}.chart-label{color:var(--muted);font-size:12px;margin:0 0 4px}.chart .empty{color:var(--muted);padding:40px 0;text-align:center}
.sev-high{color:var(--accent);font-weight:600}footer{padding:16px 24px 32px;color:var(--muted);font-size:12px;max-width:1280px;margin:0 auto}
@media (max-width:520px){.grid2{grid-template-columns:1fr}header{flex-direction:column;align-items:flex-start}}
`;

export const DASHBOARD_JS = `(function(){
'use strict';
var REFRESH_MS = 15000;
function $(id){return document.getElementById(id);}
function el(tag, text, cls){var e=document.createElement(tag); if(text!==undefined&&text!==null) e.textContent=String(text); if(cls) e.className=cls; return e;}
function fmt(n, d){if(n===null||n===undefined||isNaN(n)) return '-'; return Number(n).toLocaleString('en-US',{maximumFractionDigits:d===undefined?0:d});}
function short(a){a=String(a||''); return a.length>12? a.slice(0,5)+'…'+a.slice(-4) : a;}
function time(ts){if(!ts) return '-'; return new Date(ts*1000).toISOString().slice(11,19);}
function txLink(hash){var a=el('a', short(hash), 'mono'); a.href='https://tronscan.org/#/transaction/'+encodeURIComponent(hash); a.rel='noopener'; a.target='_blank'; return a;}
function getJSON(path){return fetch(path,{cache:'no-store'}).then(function(r){ if(!r.ok) throw new Error(path+' '+r.status); return r.json(); });}

function card(k, v){var c=el('div',null,'card'); c.appendChild(el('div',v,'v')); c.appendChild(el('div',k,'k')); return c;}

function barChart(container, buckets, key, color, unit){
  container.textContent='';
  var vals=buckets.map(function(b){return Number(b[key])||0;});
  var max=Math.max.apply(null, vals.concat([0]));
  if(max<=0){container.appendChild(el('div','no data in this window yet','empty')); return;}
  var NS='http://www.w3.org/2000/svg', W=600, H=160, pad=18, n=vals.length, bw=(W-pad*2)/n;
  var svg=document.createElementNS(NS,'svg'); svg.setAttribute('viewBox','0 0 '+W+' '+H); svg.setAttribute('preserveAspectRatio','none');
  vals.forEach(function(v,i){
    var h=(H-pad*2)*(v/max); var r=document.createElementNS(NS,'rect');
    r.setAttribute('x', String(pad+i*bw+1)); r.setAttribute('y', String(H-pad-h)); r.setAttribute('width', String(Math.max(bw-2,1))); r.setAttribute('height', String(h)); r.setAttribute('fill', color);
    var t=document.createElementNS(NS,'title'); t.textContent=buckets[i].hourIso.slice(0,13).replace('T',' ')+':00 UTC  '+fmt(v, 2)+(unit?' '+unit:''); r.appendChild(t); svg.appendChild(r);
  });
  // The SVG stretches to the panel width (preserveAspectRatio none), which would distort text, so
  // the label is plain HTML above the chart and keeps the page's normal font size.
  container.appendChild(el('div', 'max '+fmt(max)+(unit?' '+unit:'')+' / hour', 'chart-label'));
  container.appendChild(svg);
}

function fillTable(tbody, rows, emptyText, cols){
  tbody.textContent='';
  if(!rows.length){var tr=el('tr'); var td=el('td', emptyText, 'muted'); td.colSpan=cols; tr.appendChild(td); tbody.appendChild(tr); return;}
  rows.forEach(function(cells){var tr=el('tr'); cells.forEach(function(c){ tr.appendChild(c); }); tbody.appendChild(tr);});
}
function td(text, cls){return el('td', text, cls);}
function tdNode(node){var t=el('td'); t.appendChild(node); return t;}

function refresh(){
  Promise.all([
    getJSON('/api/v1/summary?since=3600&top=5'),
    getJSON('/api/v1/events?type=usdt_transfer&limit=8'),
    getJSON('/api/v1/events?type=trx_transfer&limit=4'),
    getJSON('/api/v1/events?type=resource_delegation&limit=10'),
    getJSON('/api/v1/trends?hours=24').catch(function(){return null;}),
    getJSON('/api/v1/status')
  ]).then(function(r){
    var s=r[0].summary, usdt=r[1].events, trx=r[2].events, del=r[3].events, trends=r[4], st=r[5];
    var latest = st.status && st.status.latestBlockSeen;
    $('status').textContent = 'latest block '+(latest?fmt(latest):'-')+' · updated '+new Date().toISOString().slice(11,19)+' UTC';

    var cards=$('cards'); cards.textContent='';
    var u=s.transferVolume.USDT||{count:0,total:0,largest:0};
    var e=s.resourceDelegation.ENERGY||{count:0,delegatedTrx:0};
    var hours = trends && trends.buckets ? trends.buckets : [];
    var cur = hours.length ? hours[hours.length-1] : null;
    cards.appendChild(card('Whale USDT transfers (1h)', fmt(u.count)));
    cards.appendChild(card('Whale USDT volume (1h)', '$'+fmt(u.total)));
    cards.appendChild(card('Largest USDT transfer (1h)', '$'+fmt(u.largest)));
    cards.appendChild(card('Large energy delegations (1h)', fmt(e.count)));
    cards.appendChild(card('All delegations, this hour so far (UTC)', cur? fmt(cur.delegations) : '-'));
    cards.appendChild(card('Avg tx per block (1h)', fmt(s.blocks.avgTxPerBlock, 1)));

    var whales = usdt.concat(trx).sort(function(a,b){return b.created_at-a.created_at;}).slice(0,10);
    fillTable($('whales'), whales.map(function(x){var d=x.event.data; var sev=x.event.severity==='high'||x.event.severity==='critical';
      return [td(time(x.created_at)), td(x.event.asset), td(fmt(d.amount), 'r'+(sev?' sev-high':'')), td(short(d.from)+' → '+short(d.to), 'mono'), tdNode(txLink(x.event.transaction&&x.event.transaction.hash))];}), 'no whale transfers stored yet', 5);
    fillTable($('delegs'), del.map(function(x){var d=x.event.data;
      return [td(time(x.created_at)), td(d.action), td(d.resource), td(fmt(d.stakedTrx), 'r'), tdNode(txLink(x.event.transaction&&x.event.transaction.hash))];}), 'no large delegations stored yet', 5);

    var flows=Object.keys(s.exchangeFlows||{}).map(function(k){var f=s.exchangeFlows[k]; return [td(f.entity || k.slice(0, k.lastIndexOf(':'))), td(f.asset), td(fmt(f.inflow),'r'), td(fmt(f.outflow),'r'), td(fmt(f.net),'r')];});
    fillTable($('flows'), flows, 'no labeled flows in window', 5);

    if(hours.length){
      $('trend-range').textContent='(last '+hours.length+'h, UTC)';
      barChart($('chart-usdt'), hours, 'whaleUsdtVolume', '#ff3b47', 'USDT');
      barChart($('chart-deleg'), hours, 'delegations', '#3bb3ff');
      barChart($('chart-tx'), hours, 'txCount', '#3ccf8e');
    } else {
      ['chart-usdt','chart-deleg','chart-tx'].forEach(function(id){var c=$(id); c.textContent=''; c.appendChild(el('div','history storage is disabled on this instance','empty'));});
    }
  }).catch(function(err){ $('status').textContent='API unavailable: '+err.message; });
}
refresh(); setInterval(refresh, REFRESH_MS);
})();
`;
