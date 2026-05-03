'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let allLogData  = [];
let selectedMag = 'High Mag (M11)';
let chartX      = null;
let chartY      = null;
const limits    = JSON.parse(JSON.stringify(DEFAULT_LIMITS));

// ── Apple Dark chart palette ──────────────────────────────────────────────────
const D = {
    line:      '#0a84ff',
    fill:      'rgba(10,132,255,0.07)',
    point:     '#0a84ff',
    pointBdr:  'rgba(255,255,255,0.12)',
    grid:      'rgba(255,255,255,0.065)',
    tick:      '#636366',
    uslColor:  'rgba(255,69,58,0.85)',
    meanColor: 'rgba(48,209,88,0.9)',
    annText:   '#fff',
    annPad:    { x: 7, y: 4 },
    annRad:    5
};

// ── Events ────────────────────────────────────────────────────────────────────
document.getElementById('mag-select').addEventListener('change', e => {
    selectedMag = e.target.value;
    render();
});

document.getElementById('folder-input').addEventListener('change', async e => {
    const files = e.target.files;
    if (!files || !files.length) return;
    showLoading('Cargando logs…');
    allLogData = await parseLogs(files);
    e.target.value = '';
    render();
    hideLoading();
});

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
    const cur     = allLogData.filter(d => d.magType === selectedMag);
    const hasData = cur.length > 0;

    document.getElementById('empty-state').style.display  = hasData ? 'none' : 'flex';
    document.getElementById('main-content').style.display = hasData ? 'flex' : 'none';
    document.getElementById('pdf-btn').disabled            = !hasData;

    const dot = document.querySelector('.panel-header-dot');
    if (dot) dot.classList.toggle('active', hasData);

    if (!hasData) return;

    renderTable(cur);
    renderStatsCards(cur);
    renderLegend();
    renderCharts(cur);
}

// ── Table ─────────────────────────────────────────────────────────────────────
function renderTable(data) {
    document.getElementById('log-count').textContent = `LOGS (${data.length})`;
    document.getElementById('log-tbody').innerHTML = data.map(d => `
        <tr>
            <td title="${d.filename}">${d.filename}</td>
            <td>${d.x.toFixed(0)}</td>
            <td>${d.y.toFixed(0)}</td>
        </tr>`).join('');
}

// ── Stats Cards ───────────────────────────────────────────────────────────────
function renderStatsCards(data) {
    const lim = limits[selectedMag];
    buildStatsCard('stats-x', 'X-Ray Spot (X)', data.map(d => d.x), lim.xLSL, lim.xUSL, 'badge-x');
    buildStatsCard('stats-y', 'X-Ray Spot (Y)', data.map(d => d.y), lim.yLSL, lim.yUSL, 'badge-y');
}

function buildStatsCard(elId, title, values, lsl, usl, badgeId) {
    const { mean, stdDev } = calcStats(values);
    const { cpk }          = calcCPK(mean, stdDev, lsl, usl);
    const s                = getStatus(cpk);

    document.getElementById(elId).innerHTML = `
        <h3>${title}</h3>
        <div class="stats-divider"></div>
        <div class="stat-row">
            <span class="stat-label">Std Deviation</span>
            <span class="stat-value">${stdDev.toFixed(4)}</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Mean</span>
            <span class="stat-value">${mean.toFixed(0)}</span>
        </div>
        <div class="stats-divider"></div>
        <div class="stat-row">
            <span class="stat-label">LSL</span>
            <span class="stat-value">${lsl.toFixed(0)}</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">USL</span>
            <span class="stat-value">${usl.toFixed(0)}</span>
        </div>
        <div class="stats-divider"></div>
        <div class="cpk-row">
            <span class="cpk-label">Cpk</span>
            <span class="cpk-value">${cpk.toFixed(12)}</span>
        </div>
        <div class="status-badge" style="background:${s.bg};color:${s.color};box-shadow:0 4px 14px ${s.bg}55">
            ${s.text}
        </div>`;

    // Also update the chart badge
    if (badgeId) {
        const badge = document.getElementById(badgeId);
        if (badge) {
            badge.textContent = s.text;
            badge.style.background = s.bg + '22';
            badge.style.color      = s.bg;
            badge.style.border     = `1px solid ${s.bg}44`;
        }
    }
}

// ── Legend ────────────────────────────────────────────────────────────────────
function renderLegend() {
    const rows = [
        { t:'≥ 2.0',  l:'Excellent',  bg:'#30d158', c:'#000' },
        { t:'≥ 1.67', l:'Optimal',    bg:'#32ade6', c:'#000' },
        { t:'≥ 1.33', l:'Good',       bg:'#34c759', c:'#000' },
        { t:'≥ 1.0',  l:'Acceptable', bg:'#3a3a3c', c:'#fff' },
        { t:'≥ 0.67', l:'Bad',        bg:'#ff9f0a', c:'#000' },
        { t:'< 0.67', l:'Terrible',   bg:'#ff453a', c:'#fff' },
    ];
    document.getElementById('legend-card').innerHTML = `
        <h3>Criterios</h3>
        ${rows.map(r => `
            <div class="legend-item">
                <span class="legend-threshold">${r.t}</span>
                <span class="legend-badge" style="background:${r.bg}22;color:${r.bg};border:1px solid ${r.bg}44">${r.l}</span>
            </div>`).join('')}`;
}

// ── Charts ────────────────────────────────────────────────────────────────────
function renderCharts(data) {
    const lim = limits[selectedMag];
    buildChart('chart-x', data.map(d => d.x), lim.xLSL, lim.xUSL, 'X');
    buildChart('chart-y', data.map(d => d.y), lim.yLSL, lim.yUSL, 'Y');
}

function buildChart(id, values, lsl, usl, axis) {
    if (axis === 'X' && chartX) { chartX.destroy(); chartX = null; }
    if (axis === 'Y' && chartY) { chartY.destroy(); chartY = null; }

    const mean    = values.reduce((a,b) => a+b, 0) / Math.max(1, values.length);
    const minV    = Math.min(...values, lsl);
    const maxV    = Math.max(...values, usl);
    const pad     = (maxV - minV) * 0.2;
    const ctx     = document.getElementById(id).getContext('2d');

    const inst = new Chart(ctx, {
        type: 'line',
        data: {
            labels: values.map((_, i) => i + 1),
            datasets: [{
                data: values,
                borderColor: D.line,
                backgroundColor: D.fill,
                pointBackgroundColor: D.point,
                pointBorderColor: D.pointBdr,
                pointBorderWidth: 1,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: D.line,
                pointHoverBorderWidth: 2,
                tension: 0.42,
                fill: true,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            animation: { duration: 500, easing: 'easeInOutQuart' },
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: {
                    min: minV - pad, max: maxV + pad,
                    grid:   { color: D.grid, drawBorder: false },
                    border: { dash: [3,5], color: 'transparent' },
                    ticks:  { color: D.tick, font: { size: 11 },
                              callback: v => Number(v).toFixed(0) }
                },
                x: {
                    grid:   { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                    border: { color: 'transparent' },
                    title:  { display: true, text: 'Sample Index',
                              font: { size: 10.5 }, color: D.tick },
                    ticks:  { color: D.tick, font: { size: 11 } }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(22,22,24,0.96)',
                    titleColor: '#fff',
                    bodyColor:  'rgba(235,235,245,0.8)',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 11,
                    cornerRadius: 10,
                    displayColors: false,
                    callbacks: {
                        title: items => `Sample #${items[0].label}`,
                        label: item  => ` ${Number(item.raw).toFixed(0)}`
                    }
                },
                annotation: {
                    annotations: {
                        usl: {
                            type: 'line', yMin: usl, yMax: usl,
                            borderColor: D.uslColor, borderWidth: 1.5, borderDash: [5,5],
                            label: { display: true, content: `USL: ${usl.toFixed(0)}`,
                                position: 'start', backgroundColor: 'rgba(255,69,58,0.88)',
                                color: D.annText, font: { size: 11, weight: 'bold' },
                                padding: D.annPad, borderRadius: D.annRad }
                        },
                        lsl: {
                            type: 'line', yMin: lsl, yMax: lsl,
                            borderColor: D.uslColor, borderWidth: 1.5, borderDash: [5,5],
                            label: { display: true, content: `LSL: ${lsl.toFixed(0)}`,
                                position: 'start', backgroundColor: 'rgba(255,69,58,0.88)',
                                color: D.annText, font: { size: 11, weight: 'bold' },
                                padding: D.annPad, borderRadius: D.annRad }
                        },
                        mean: {
                            type: 'line', yMin: mean, yMax: mean,
                            borderColor: '#30d158', borderWidth: 2,
                            label: { display: true, content: `Mean: ${mean.toFixed(0)}`,
                                position: 'end', backgroundColor: 'rgba(48,209,88,0.92)',
                                color: '#000', font: { size: 11, weight: 'bold' },
                                padding: D.annPad, borderRadius: D.annRad }
                        }
                    }
                }
            }
        }
    });

    if (axis === 'X') chartX = inst;
    else              chartY = inst;
}

// ══════════════════════════════════════════════════════════════════════════════
//  MODAL HELPERS
// ══════════════════════════════════════════════════════════════════════════════
function openPDFModal() {
    // Pre-fill date with today
    const dateInput = document.getElementById('fi-date');
    if (!dateInput.value) {
        const today = new Date();
        dateInput.value = today.toISOString().slice(0, 10);
    }
    document.getElementById('pdf-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('fi-customer').focus(), 60);
}

function closePDFModal() {
    document.getElementById('pdf-modal').style.display = 'none';
}

function handleOverlayClick(e) {
    if (e.target.id === 'pdf-modal') closePDFModal();
}

function exportPDF() { openPDFModal(); }

// ══════════════════════════════════════════════════════════════════════════════
//  LOADING
// ══════════════════════════════════════════════════════════════════════════════
function showLoading(msg = 'Cargando…') {
    document.getElementById('loading-text').textContent = msg;
    document.getElementById('loading-overlay').style.display = 'flex';
}
function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
}

// ══════════════════════════════════════════════════════════════════════════════
//  PDF GENERATION — renders a report in a new window and triggers print
// ══════════════════════════════════════════════════════════════════════════════

/** Render a Chart.js chart off-screen (light theme) and return PNG data-URL */
function buildLightChartPNG(values, lsl, usl, axisLabel) {
    return new Promise(resolve => {
        const canvas = document.createElement('canvas');
        canvas.width  = 900;
        canvas.height = 300;
        Object.assign(canvas.style, { position:'fixed', top:'-9999px', left:'-9999px' });
        document.body.appendChild(canvas);

        const mean = values.reduce((a,b) => a+b,0) / Math.max(1, values.length);
        const minV = Math.min(...values, lsl);
        const maxV = Math.max(...values, usl);
        const pad  = (maxV - minV) * 0.2;

        const chart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: values.map((_,i) => i+1),
                datasets: [{
                    data: values,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37,99,235,0.07)',
                    pointBackgroundColor: '#2563eb',
                    pointRadius: 3,
                    tension: 0.42,
                    fill: true,
                    borderWidth: 2
                }]
            },
            options: {
                animation: { duration: 0 },
                responsive: false,
                scales: {
                    y: {
                        min: minV - pad, max: maxV + pad,
                        grid:  { color: '#f0f0f0' },
                        ticks: { color: '#555', font: { size: 10 },
                                 callback: v => Number(v).toFixed(0) }
                    },
                    x: {
                        grid:  { color: '#f5f5f5' },
                        ticks: { color: '#555', font: { size: 10 } },
                        title: { display: true, text: axisLabel, font: { size: 11 }, color: '#666' }
                    }
                },
                plugins: {
                    legend: { display: false },
                    annotation: {
                        annotations: {
                            uslL: { type:'line', yMin:usl, yMax:usl,
                                borderColor:'rgba(220,38,38,.75)', borderWidth:1.5, borderDash:[5,5],
                                label:{ display:true, content:`USL: ${usl.toFixed(0)}`, position:'start',
                                    backgroundColor:'rgba(220,38,38,.85)', color:'#fff',
                                    font:{size:10,weight:'bold'}, padding:{x:5,y:3}, borderRadius:4 } },
                            lslL: { type:'line', yMin:lsl, yMax:lsl,
                                borderColor:'rgba(220,38,38,.75)', borderWidth:1.5, borderDash:[5,5],
                                label:{ display:true, content:`LSL: ${lsl.toFixed(0)}`, position:'start',
                                    backgroundColor:'rgba(220,38,38,.85)', color:'#fff',
                                    font:{size:10,weight:'bold'}, padding:{x:5,y:3}, borderRadius:4 } },
                            meanL: { type:'line', yMin:mean, yMax:mean,
                                borderColor:'rgba(22,163,74,.9)', borderWidth:2,
                                label:{ display:true, content:`Mean: ${mean.toFixed(0)}`, position:'end',
                                    backgroundColor:'rgba(22,163,74,.9)', color:'#fff',
                                    font:{size:10,weight:'bold'}, padding:{x:5,y:3}, borderRadius:4 } }
                        }
                    }
                }
            }
        });

        // Wait 3 frames for Chart.js to finish drawing
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => {
            const off = document.createElement('canvas');
            off.width  = canvas.width;
            off.height = canvas.height;
            const ctx  = off.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, off.width, off.height);
            ctx.drawImage(canvas, 0, 0);
            const url = off.toDataURL('image/png');
            chart.destroy();
            canvas.remove();
            resolve(url);
        })));
    });
}

/** Escape HTML entities for safe embedding */
function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
                          .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/** Convert a hex color to CSS rgba with given alpha for the PDF table */
function hexAlpha(hex, a) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${a})`;
}

/** Human-readable names matching the report image */
function magName(mag) {
    return { 'High Mag (M11)': 'High Magnification (M11)',
             'Low Mag (M15)' : 'Low Magnification (M15)',
             'Low Mag (M19)' : 'Low Magnification (M19)' }[mag] || mag;
}

/** Build the complete report HTML document */
function buildReportHTML(info, charts, logoDataURL) {
    const magList = ['High Mag (M11)', 'Low Mag (M15)', 'Low Mag (M19)'];

    // ── Status colors matching the PDF reference image (light palette)
    const STATUS_LIGHT = {
        Excellent:  { bg:'#16a34a', text:'#fff' },
        Optimal:    { bg:'#0284c7', text:'#fff' },
        Good:       { bg:'#22c55e', text:'#000' },
        Acceptable: { bg:'#eab308', text:'#000' },
        Bad:        { bg:'#dc2626', text:'#fff' },
        Terrible:   { bg:'#7f1d1d', text:'#fff' },
    };

    // ── Build stats for a mag type (returns {xSt, ySt, xCpk, yCpk})
    function magStats(mag) {
        const data  = allLogData.filter(d => d.magType === mag);
        const lim   = limits[mag];
        const xVals = data.map(d => d.x);
        const yVals = data.map(d => d.y);
        const xSt   = calcStats(xVals);
        const ySt   = calcStats(yVals);
        const xCpk  = calcCPK(xSt.mean, xSt.stdDev, lim.xLSL, lim.xUSL);
        const yCpk  = calcCPK(ySt.mean, ySt.stdDev, lim.yLSL, lim.yUSL);
        const nd    = data.length === 0;
        const fmt   = (v, d=0) => nd ? 'N/A' : Number(v).toFixed(d);
        const stBadge = (cpkVal) => {
            if (nd) return '<td colspan="1">—</td>';
            const s   = getStatus(cpkVal);
            const sc  = STATUS_LIGHT[s.text] || { bg: s.bg, text: s.color };
            return `<td class="badge-cell" style="background:${sc.bg};color:${sc.text}">${s.text}</td>`;
        };
        return { xSt, ySt, xCpk, yCpk, lim, nd, fmt, stBadge };
    }

    // ── Mag section rows HTML
    const magSections = magList.map(mag => {
        const { xSt, ySt, xCpk, yCpk, lim, nd, fmt, stBadge } = magStats(mag);
        return `
        <div class="mag-section">
          <div class="mag-title">${magName(mag)}</div>
          <table class="stats-table">
            <thead>
              <tr>
                <th class="lbl-col"></th>
                <th colspan="2" class="axis-head">X-ray Spot (X)</th>
                <th colspan="2" class="axis-head">X-ray Spot (Y)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="row-lbl">Standard Deviation</td>
                <td colspan="2" class="val">${fmt(xSt.stdDev, 4)}</td>
                <td colspan="2" class="val">${fmt(ySt.stdDev, 4)}</td>
              </tr>
              <tr>
                <td class="row-lbl">Mean</td>
                <td colspan="2" class="val">${fmt(xSt.mean)}</td>
                <td colspan="2" class="val">${fmt(ySt.mean)}</td>
              </tr>
              <tr>
                <td class="row-lbl">USL</td>
                <td colspan="2" class="val">${nd ? 'N/A' : lim.xUSL.toFixed(0)}</td>
                <td colspan="2" class="val">${nd ? 'N/A' : lim.yUSL.toFixed(0)}</td>
              </tr>
              <tr>
                <td class="row-lbl">LSL</td>
                <td colspan="2" class="val">${nd ? 'N/A' : lim.xLSL.toFixed(0)}</td>
                <td colspan="2" class="val">${nd ? 'N/A' : lim.yLSL.toFixed(0)}</td>
              </tr>
              <tr>
                <td class="row-lbl">Cp</td>
                <td class="val mono">${fmt(xCpk.cp, 12)}</td>
                ${stBadge(xCpk.cp)}
                <td class="val mono">${fmt(yCpk.cp, 12)}</td>
                ${stBadge(yCpk.cp)}
              </tr>
              <tr>
                <td class="row-lbl">Cpk</td>
                <td class="val mono">${fmt(xCpk.cpk, 12)}</td>
                ${stBadge(xCpk.cpk)}
                <td class="val mono">${fmt(yCpk.cpk, 12)}</td>
                ${stBadge(yCpk.cpk)}
              </tr>
            </tbody>
          </table>
        </div>`;
    }).join('');

    // ── Charts HTML
    const chartsHTML = magList.map(mag => {
        const c = charts[mag];
        if (!c) return '';
        return `
        <div class="chart-block">
          <div class="chart-block-title">${magName(mag)}</div>
          <div class="chart-row">
            <div class="chart-col">
              <p class="chart-lbl">X-ray Spot (X)</p>
              <img src="${c.x}" class="chart-img" alt="Chart X">
            </div>
            <div class="chart-col">
              <p class="chart-lbl">X-ray Spot (Y)</p>
              <img src="${c.y}" class="chart-img" alt="Chart Y">
            </div>
          </div>
        </div>`;
    }).join('');

    const logoTag = logoDataURL
        ? `<img src="${logoDataURL}" class="rep-logo" alt="Logo">`
        : `<div class="rep-logo-text">SMT</div>`;

    // Format date
    const dateObj = info.date ? new Date(info.date + 'T12:00:00') : new Date();
    const dateStr = dateObj.toLocaleDateString('es-MX',
        { day:'2-digit', month:'2-digit', year:'numeric' });

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>CPK VITROX Report — ${esc(info.customer)}</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:Arial,Helvetica,sans-serif;font-size:9.5pt;color:#111;background:#fff;}
  @page{margin:14mm 16mm;size:A4;}

  /* ── HEADER ── */
  .rep-header{display:flex;justify-content:space-between;align-items:flex-start;
    padding-bottom:10px;border-bottom:2.5px solid #111;margin-bottom:12px;}
  .rep-logo{height:44px;object-fit:contain;}
  .rep-logo-text{font-size:20px;font-weight:900;color:#1e40af;
    border:2.5px solid #1e40af;padding:3px 10px;border-radius:4px;}
  .rep-header-right{text-align:right;}
  .rep-title{font-size:20pt;font-weight:900;letter-spacing:-.02em;color:#111;}
  .rep-meta{margin-top:6px;display:flex;flex-direction:column;gap:2px;align-items:flex-end;}
  .rep-meta-row{font-size:9pt;color:#444;}
  .rep-meta-row strong{color:#111;}

  /* ── CUSTOMER TABLE ── */
  .info-table{border-collapse:collapse;margin-bottom:14px;}
  .info-table td{padding:4px 10px;border:1px solid #ccc;font-size:9.5pt;}
  .info-table td:first-child{background:#f5f5f5;font-weight:700;width:115px;color:#222;}

  /* ── MAG SECTIONS ── */
  .mag-section{margin-bottom:12px;page-break-inside:avoid;}
  .mag-title{text-align:center;font-size:13pt;font-weight:800;
    border:1.5px solid #222;padding:5px;background:#f8f8f8;letter-spacing:-.01em;}
  .stats-table{width:100%;border-collapse:collapse;font-size:8.5pt;}
  .stats-table th{background:#efefef;border:1px solid #ccc;padding:4px 8px;
    text-align:center;font-size:9pt;font-weight:700;}
  .axis-head{background:#e8e8e8;}
  .lbl-col{width:105px;}
  .stats-table td{border:1px solid #d4d4d4;padding:3.5px 8px;}
  .row-lbl{text-align:right;background:#fafafa;font-size:8.5pt;color:#333;}
  .val{text-align:right;font-variant-numeric:tabular-nums;}
  .mono{font-family:'Courier New',monospace;font-size:8pt;}
  .badge-cell{text-align:center;font-weight:700;font-size:8pt;letter-spacing:.03em;width:68px;}

  /* ── CRITERIA TABLE ── */
  .criteria-wrap{margin-top:12px;page-break-inside:avoid;}
  .criteria-title{font-size:9pt;font-weight:700;margin-bottom:4px;color:#444;text-transform:uppercase;letter-spacing:.05em;}
  .criteria-table{border-collapse:collapse;}
  .criteria-table td{border:1px solid #ccc;padding:3px 10px;font-size:9pt;}
  .criteria-table td:first-child{background:#fafafa;width:140px;}
  .criteria-table td:last-child{font-weight:700;text-align:center;width:80px;}

  /* ── CHARTS PAGE ── */
  .charts-page{page-break-before:always;}
  .charts-page-title{text-align:center;font-size:16pt;font-weight:800;
    padding:8px;border-bottom:2px solid #111;margin-bottom:16px;}
  .chart-block{margin-bottom:20px;page-break-inside:avoid;}
  .chart-block-title{font-size:11pt;font-weight:700;background:#f0f0f0;
    border:1px solid #ddd;padding:5px 10px;text-align:center;margin-bottom:8px;}
  .chart-row{display:flex;gap:12px;}
  .chart-col{flex:1;}
  .chart-lbl{font-size:8.5pt;color:#666;margin-bottom:4px;font-style:italic;}
  .chart-img{width:100%;height:auto;border:1px solid #e5e5e5;border-radius:3px;}

  /* ── FOOTER ── */
  .rep-footer{position:fixed;bottom:8mm;left:0;right:0;text-align:center;
    font-size:8pt;color:#999;border-top:1px solid #ddd;padding-top:4px;}
</style>
</head>
<body>

<!-- HEADER -->
<div class="rep-header">
  <div>${logoTag}</div>
  <div class="rep-header-right">
    <div class="rep-title">CPK VITROX Report</div>
    <div class="rep-meta">
      <div class="rep-meta-row"><strong>Date:</strong> ${dateStr}</div>
      <div class="rep-meta-row"><strong>Customer:</strong> ${esc(info.customer) || '—'}</div>
      <div class="rep-meta-row"><strong>S/N:</strong> ${esc(info.serial) || '—'}</div>
    </div>
  </div>
</div>

<!-- CUSTOMER INFO -->
<table class="info-table">
  <tr><td>Customer Info.</td><td>${esc(info.customer)}</td></tr>
  <tr><td>Machine Model</td><td>${esc(info.model)}</td></tr>
  <tr><td>System S/N</td><td>${esc(info.serial)}</td></tr>
  <tr><td>SMTo Engineer</td><td>${esc(info.engineer)}</td></tr>
</table>

<!-- MAG SECTIONS -->
${magSections}

<!-- CPK CRITERIA -->
<div class="criteria-wrap">
  <div class="criteria-title">CPK Reference</div>
  <table class="criteria-table">
    <tr><td>CPK &gt;= 2.0</td>          <td style="background:#16a34a;color:#fff">Excellent</td></tr>
    <tr><td>2.0 &gt; CPK &gt;= 1.67</td><td style="background:#0284c7;color:#fff">Optimal</td></tr>
    <tr><td>1.67 &gt; CPK &gt;= 1.33</td><td style="background:#22c55e;color:#000">Good</td></tr>
    <tr><td>1.33 &gt; CPK &gt;= 1.0</td><td style="background:#eab308;color:#000">Acceptable</td></tr>
    <tr><td>1.0 &gt; CPK &gt;= 0.67</td><td style="background:#dc2626;color:#fff">Bad</td></tr>
    <tr><td>0.67 &gt; CPK</td>           <td style="background:#7f1d1d;color:#fff">Terrible</td></tr>
  </table>
</div>

<!-- CHARTS PAGE -->
<div class="charts-page">
  <div class="charts-page-title">Process Charts</div>
  ${chartsHTML}
</div>

<div class="rep-footer">CPK VITROX — ${esc(info.customer) || 'Report'} — ${dateStr}</div>

</body>
</html>`;
}

// ── Main PDF entry point ──────────────────────────────────────────────────────
async function generatePDF() {
    closePDFModal();

    const info = {
        date:     document.getElementById('fi-date').value,
        customer: document.getElementById('fi-customer').value.trim(),
        model:    document.getElementById('fi-model').value.trim(),
        serial:   document.getElementById('fi-serial').value.trim(),
        engineer: document.getElementById('fi-engineer').value.trim(),
    };

    showLoading('Renderizando gráficas…');

    // Build light-theme chart PNGs for all mag types that have data
    const charts   = {};
    const magList  = ['High Mag (M11)', 'Low Mag (M15)', 'Low Mag (M19)'];
    for (const mag of magList) {
        const data = allLogData.filter(d => d.magType === mag);
        if (data.length === 0) continue;
        const lim = limits[mag];
        charts[mag] = {
            x: await buildLightChartPNG(data.map(d => d.x), lim.xLSL, lim.xUSL, 'X-ray Spot (X)'),
            y: await buildLightChartPNG(data.map(d => d.y), lim.yLSL, lim.yUSL, 'X-ray Spot (Y)')
        };
    }

    // Get logo as data URL
    let logoDataURL = null;
    const logoEl = document.getElementById('smt-logo');
    if (logoEl && logoEl.complete && logoEl.naturalWidth > 0) {
        try {
            const lc = document.createElement('canvas');
            lc.width  = logoEl.naturalWidth;
            lc.height = logoEl.naturalHeight;
            lc.getContext('2d').drawImage(logoEl, 0, 0);
            logoDataURL = lc.toDataURL('image/png');
        } catch(_) {}
    }

    showLoading('Abriendo reporte…');

    const html    = buildReportHTML(info, charts, logoDataURL);
    const repWin  = window.open('', '_blank', 'width=900,height=750,menubar=no,toolbar=no');

    if (!repWin) {
        hideLoading();
        alert('Por favor permite las ventanas emergentes para descargar el PDF.');
        return;
    }

    repWin.document.open();
    repWin.document.write(html);
    repWin.document.close();

    hideLoading();

    // Wait for images to load then trigger print
    repWin.onload = () => {
        setTimeout(() => {
            repWin.focus();
            repWin.print();
        }, 400);
    };

    // Fallback if onload doesn't fire
    setTimeout(() => {
        if (repWin && !repWin.closed) {
            repWin.focus();
            repWin.print();
        }
    }, 1500);
}
