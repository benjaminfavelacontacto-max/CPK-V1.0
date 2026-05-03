/**
 * app.js — UI controller
 * Dark mode (Apple HIG) + jsPDF report generation
 * Mirrors: ContentView.swift · CPKChartView.swift
 */

'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let allLogData  = [];
let selectedMag = 'High Mag (M11)';
let chartX      = null;
let chartY      = null;
const limits    = JSON.parse(JSON.stringify(DEFAULT_LIMITS));

// ── Dark mode chart palette (Apple dark system colors) ────────────────────────
const DARK = {
    line:       '#0a84ff',
    lineFill:   'rgba(10,132,255,0.08)',
    usl:        'rgba(255,69,58,0.9)',
    lsl:        'rgba(255,69,58,0.9)',
    mean:       'rgba(48,209,88,0.9)',
    grid:       'rgba(255,255,255,0.07)',
    gridBorder: 'rgba(255,255,255,0.12)',
    tick:       '#636366',
    annotation: { text: '#fff', padding: { x: 7, y: 4 }, radius: 5 }
};

// ── Event Listeners ───────────────────────────────────────────────────────────
document.getElementById('mag-select').addEventListener('change', e => {
    selectedMag = e.target.value;
    render();
});

document.getElementById('folder-input').addEventListener('change', async e => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    allLogData = await parseLogs(files);
    e.target.value = '';
    render();
});

// ── Main Render ───────────────────────────────────────────────────────────────
function render() {
    const current = allLogData.filter(d => d.magType === selectedMag);
    const hasData = current.length > 0;

    document.getElementById('empty-state').style.display  = hasData ? 'none' : 'flex';
    document.getElementById('main-content').style.display = hasData ? 'flex' : 'none';
    document.getElementById('pdf-btn').disabled            = !hasData;

    if (!hasData) return;

    renderTable(current);
    renderStatsCards(current);
    renderLegend();
    renderCharts(current);
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
    renderStatsCard('stats-x', 'X-Ray Spot (X)', data.map(d => d.x), lim.xLSL, lim.xUSL);
    renderStatsCard('stats-y', 'X-Ray Spot (Y)', data.map(d => d.y), lim.yLSL, lim.yUSL);
}

function renderStatsCard(elId, title, values, lsl, usl) {
    const { mean, stdDev } = calcStats(values);
    const { cpk }          = calcCPK(mean, stdDev, lsl, usl);
    const status           = getStatus(cpk);

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
        <span class="status-badge" style="background:${status.bg};color:${status.color}">
            ${status.text}
        </span>`;
}

// ── Legend ────────────────────────────────────────────────────────────────────
function renderLegend() {
    const criteria = [
        { t: '≥ 2.0',  label: 'Excellent',  bg: '#30d158', color: '#000' },
        { t: '≥ 1.67', label: 'Optimal',    bg: '#32ade6', color: '#000' },
        { t: '≥ 1.33', label: 'Good',       bg: '#34c759', color: '#000' },
        { t: '≥ 1.0',  label: 'Acceptable', bg: '#3a3a3c', color: '#fff' },
        { t: '≥ 0.67', label: 'Bad',        bg: '#ff9f0a', color: '#000' },
        { t: '< 0.67', label: 'Terrible',   bg: '#ff453a', color: '#fff' },
    ];
    document.getElementById('legend-card').innerHTML = `
        <h3>Criterios</h3>
        ${criteria.map(c => `
            <div class="legend-item">
                <span class="legend-threshold">${c.t}</span>
                <span class="legend-badge" style="background:${c.bg};color:${c.color}">${c.label}</span>
            </div>`).join('')}`;
}

// ── Charts ────────────────────────────────────────────────────────────────────
function renderCharts(data) {
    const lim = limits[selectedMag];
    buildChart('chart-x', data.map(d => d.x), lim.xLSL, lim.xUSL, 'X');
    buildChart('chart-y', data.map(d => d.y), lim.yLSL, lim.yUSL, 'Y');
}

function buildChart(canvasId, values, lsl, usl, axis) {
    if (axis === 'X' && chartX) { chartX.destroy(); chartX = null; }
    if (axis === 'Y' && chartY) { chartY.destroy(); chartY = null; }

    const mean    = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
    const minVal  = Math.min(...values, lsl);
    const maxVal  = Math.max(...values, usl);
    const padding = (maxVal - minVal) * 0.2;

    const ctx = document.getElementById(canvasId).getContext('2d');
    const instance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: values.map((_, i) => i + 1),
            datasets: [{
                data: values,
                borderColor: DARK.line,
                backgroundColor: DARK.lineFill,
                pointBackgroundColor: DARK.line,
                pointBorderColor: 'rgba(255,255,255,0.15)',
                pointBorderWidth: 1,
                pointRadius: 4,
                pointHoverRadius: 6,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            animation: { duration: 350, easing: 'easeInOutQuart' },
            scales: {
                y: {
                    min: minVal - padding,
                    max: maxVal + padding,
                    grid:   { color: DARK.grid,       drawBorder: false },
                    border: { color: DARK.gridBorder, dash: [2,4] },
                    ticks:  { color: DARK.tick, font: { size: 11 },
                              callback: v => Number(v).toFixed(0) }
                },
                x: {
                    grid:   { color: DARK.grid, drawBorder: false },
                    border: { color: DARK.gridBorder },
                    title:  { display: true, text: 'Sample Index',
                              font: { size: 11 }, color: DARK.tick },
                    ticks:  { color: DARK.tick, font: { size: 11 } }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(28,28,30,0.95)',
                    titleColor: '#fff',
                    bodyColor: '#ebebf5',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: { label: ctx => ` ${ctx.parsed.y.toFixed(0)}` }
                },
                annotation: {
                    annotations: {
                        uslLine: {
                            type: 'line', yMin: usl, yMax: usl,
                            borderColor: DARK.usl, borderWidth: 1.5,
                            borderDash: [5, 5],
                            label: {
                                display: true,
                                content: `USL: ${usl.toFixed(0)}`,
                                position: 'start',
                                backgroundColor: 'rgba(255,69,58,0.85)',
                                color: DARK.annotation.text,
                                font: { size: 11, weight: 'bold' },
                                padding: DARK.annotation.padding,
                                borderRadius: DARK.annotation.radius
                            }
                        },
                        lslLine: {
                            type: 'line', yMin: lsl, yMax: lsl,
                            borderColor: DARK.lsl, borderWidth: 1.5,
                            borderDash: [5, 5],
                            label: {
                                display: true,
                                content: `LSL: ${lsl.toFixed(0)}`,
                                position: 'start',
                                backgroundColor: 'rgba(255,69,58,0.85)',
                                color: DARK.annotation.text,
                                font: { size: 11, weight: 'bold' },
                                padding: DARK.annotation.padding,
                                borderRadius: DARK.annotation.radius
                            }
                        },
                        meanLine: {
                            type: 'line', yMin: mean, yMax: mean,
                            borderColor: '#30d158', borderWidth: 2,
                            label: {
                                display: true,
                                content: `Mean: ${mean.toFixed(0)}`,
                                position: 'end',
                                backgroundColor: 'rgba(48,209,88,0.9)',
                                color: '#000',
                                font: { size: 11, weight: 'bold' },
                                padding: DARK.annotation.padding,
                                borderRadius: DARK.annotation.radius
                            }
                        }
                    }
                }
            }
        }
    });

    if (axis === 'X') chartX = instance;
    else              chartY = instance;
}

// ══════════════════════════════════════════════════════════════════════════════
//  MODAL
// ══════════════════════════════════════════════════════════════════════════════
function openPDFModal() {
    document.getElementById('pdf-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('fi-customer').focus(), 50);
}

function closePDFModal() {
    document.getElementById('pdf-modal').style.display = 'none';
}

function handleOverlayClick(e) {
    if (e.target === document.getElementById('pdf-modal')) closePDFModal();
}

// ══════════════════════════════════════════════════════════════════════════════
//  PDF GENERATION  (jsPDF + autoTable)
// ══════════════════════════════════════════════════════════════════════════════

/** Convert hex (#rrggbb or #rgb) to [r,g,b] for jsPDF */
function hexRGB(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(h => h + h).join('');
    return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
}

/** Draw chart canvas onto a white backing and return PNG data URL */
function chartToLightDataURL(canvas) {
    const off = document.createElement('canvas');
    off.width  = canvas.width;
    off.height = canvas.height;
    const ctx  = off.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, off.width, off.height);
    ctx.drawImage(canvas, 0, 0);
    return off.toDataURL('image/png');
}

/** Build a temp off-screen chart (light theme) for a mag type and return PNG */
async function buildLightChartPNG(values, lsl, usl, label) {
    return new Promise(resolve => {
        const canvas = document.createElement('canvas');
        canvas.width  = 900;
        canvas.height = 320;
        canvas.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';
        document.body.appendChild(canvas);

        const mean    = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
        const minV    = Math.min(...values, lsl);
        const maxV    = Math.max(...values, usl);
        const padding = (maxV - minV) * 0.2;

        const chart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: values.map((_, i) => i + 1),
                datasets: [{
                    data: values,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59,130,246,0.08)',
                    pointBackgroundColor: '#3b82f6',
                    pointRadius: 3,
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                animation: {
                    duration: 0,
                    onComplete: () => {
                        const off = document.createElement('canvas');
                        off.width  = canvas.width;
                        off.height = canvas.height;
                        const ctx  = off.getContext('2d');
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, off.width, off.height);
                        ctx.drawImage(canvas, 0, 0);
                        const dataURL = off.toDataURL('image/png');
                        chart.destroy();
                        document.body.removeChild(canvas);
                        resolve(dataURL);
                    }
                },
                responsive: false,
                scales: {
                    y: {
                        min: minV - padding,
                        max: maxV + padding,
                        grid: { color: '#f0f0f0' },
                        ticks: { color: '#555', font: { size: 10 },
                                 callback: v => Number(v).toFixed(0) }
                    },
                    x: {
                        grid: { color: '#f0f0f0' },
                        ticks: { color: '#555', font: { size: 10 } },
                        title: { display: true, text: label, font: { size: 11 }, color: '#666' }
                    }
                },
                plugins: {
                    legend: { display: false },
                    annotation: {
                        annotations: {
                            uslL: {
                                type:'line', yMin:usl, yMax:usl,
                                borderColor:'rgba(220,38,38,0.7)', borderWidth:1.5, borderDash:[5,5],
                                label:{ display:true, content:`USL: ${usl.toFixed(0)}`,
                                    position:'start', backgroundColor:'rgba(220,38,38,0.85)',
                                    color:'#fff', font:{size:10,weight:'bold'}, padding:{x:5,y:3}, borderRadius:4 }
                            },
                            lslL: {
                                type:'line', yMin:lsl, yMax:lsl,
                                borderColor:'rgba(220,38,38,0.7)', borderWidth:1.5, borderDash:[5,5],
                                label:{ display:true, content:`LSL: ${lsl.toFixed(0)}`,
                                    position:'start', backgroundColor:'rgba(220,38,38,0.85)',
                                    color:'#fff', font:{size:10,weight:'bold'}, padding:{x:5,y:3}, borderRadius:4 }
                            },
                            meanL: {
                                type:'line', yMin:mean, yMax:mean,
                                borderColor:'rgba(22,163,74,0.9)', borderWidth:2,
                                label:{ display:true, content:`Mean: ${mean.toFixed(0)}`,
                                    position:'end', backgroundColor:'rgba(22,163,74,0.9)',
                                    color:'#fff', font:{size:10,weight:'bold'}, padding:{x:5,y:3}, borderRadius:4 }
                            }
                        }
                    }
                }
            }
        });
    });
}

/** Human-readable mag names for the PDF report */
function magDisplayName(mag) {
    return mag === 'High Mag (M11)' ? 'High Magnification (M11)'
         : mag === 'Low Mag (M15)'  ? 'Low Magnification (M15)'
         :                            'Low Magnification (M19)';
}

async function generatePDF() {
    closePDFModal();

    // Customer info
    const info = {
        customer : document.getElementById('fi-customer').value  || '—',
        model    : document.getElementById('fi-model').value     || '—',
        serial   : document.getElementById('fi-serial').value    || '—',
        engineer : document.getElementById('fi-engineer').value  || '—'
    };

    const { jsPDF } = window.jspdf;
    const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw   = doc.internal.pageSize.getWidth();   // 210
    const ph   = doc.internal.pageSize.getHeight();  // 297
    const ml   = 15;   // margin left
    const mr   = 15;   // margin right
    const cw   = pw - ml - mr;  // content width
    let   y    = 14;

    /* ── Helpers ─────────────────────────────────────────────────────── */
    const setFont = (size, style = 'normal', color = [30,30,30]) => {
        doc.setFontSize(size);
        doc.setFont('helvetica', style);
        doc.setTextColor(...color);
    };

    const hLine = (yPos, color = [200,200,200]) => {
        doc.setDrawColor(...color);
        doc.setLineWidth(0.3);
        doc.line(ml, yPos, pw - mr, yPos);
    };

    /* ── LOGO ─────────────────────────────────────────────────────────── */
    const logoEl = document.getElementById('smt-logo');
    let logoLoaded = false;
    if (logoEl && logoEl.complete && logoEl.naturalWidth > 0) {
        try {
            const lc = document.createElement('canvas');
            lc.width  = logoEl.naturalWidth;
            lc.height = logoEl.naturalHeight;
            lc.getContext('2d').drawImage(logoEl, 0, 0);
            const logoData = lc.toDataURL('image/png');
            const lh = 12;
            const lw = lh * (logoEl.naturalWidth / logoEl.naturalHeight);
            doc.addImage(logoData, 'PNG', ml, y, lw, lh);
            logoLoaded = true;
        } catch (_) {}
    }

    /* Report title (top right) */
    setFont(20, 'bold', [20,20,20]);
    doc.text('CPK Report', pw - mr, y + 8, { align: 'right' });

    y += logoLoaded ? 18 : 12;
    hLine(y, [180,180,180]);
    y += 6;

    /* ── CUSTOMER INFO TABLE ──────────────────────────────────────────── */
    doc.autoTable({
        startY: y,
        head: [],
        body: [
            ['Customer Info.',  info.customer],
            ['Machine Model',   info.model],
            ['System S/N',      info.serial],
            ['SMTo Engineer',   info.engineer]
        ],
        margin: { left: ml, right: pw - mr - 120 },
        tableWidth: 120,
        styles: {
            fontSize: 10,
            cellPadding: 3.5,
            lineColor: [180,180,180],
            lineWidth: 0.25,
            fontStyle: 'normal'
        },
        columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 42, fillColor: [245,245,245] },
            1: { cellWidth: 78 }
        },
        theme: 'grid'
    });

    y = doc.lastAutoTable.finalY + 10;

    /* ── DATE ─────────────────────────────────────────────────────────── */
    setFont(9, 'normal', [150,150,150]);
    const now = new Date();
    doc.text(
        `Generated: ${now.toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'})}  ${now.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}`,
        pw - mr, doc.lastAutoTable.finalY - 3, { align: 'right' }
    );

    /* ── MAGNIFICATION SECTIONS ───────────────────────────────────────── */
    const magList = ['High Mag (M11)', 'Low Mag (M15)', 'Low Mag (M19)'];

    for (const mag of magList) {
        const data   = allLogData.filter(d => d.magType === mag);
        const lim    = limits[mag];
        const xVals  = data.map(d => d.x);
        const yVals  = data.map(d => d.y);
        const xSt    = calcStats(xVals);
        const ySt    = calcStats(yVals);
        const xCpk   = calcCPK(xSt.mean, xSt.stdDev, lim.xLSL, lim.xUSL);
        const yCpk   = calcCPK(ySt.mean, ySt.stdDev, lim.yLSL, lim.yUSL);
        const xStat  = getStatus(xCpk.cpk);
        const yStat  = getStatus(yCpk.cpk);
        const noData = data.length === 0;

        /* Section title */
        if (y > ph - 100) { doc.addPage(); y = 15; }

        setFont(14, 'bold', [20,20,20]);
        doc.text(magDisplayName(mag), pw / 2, y, { align: 'center' });
        y += 8;

        const fmt = (v, dec = 0) => noData ? 'N/A' : v.toFixed(dec);

        doc.autoTable({
            startY: y,
            margin: { left: ml, right: mr },
            tableWidth: cw,
            head: [[
                { content: '',              styles: { cellWidth: 38 } },
                { content: 'X-ray Spot (X)', colSpan: 2, styles: { halign: 'center', fontStyle: 'bold' } },
                { content: 'X-ray Spot (Y)', colSpan: 2, styles: { halign: 'center', fontStyle: 'bold' } }
            ]],
            body: [
                ['Standard Deviation',
                    fmt(xSt.stdDev, 4), '',
                    fmt(ySt.stdDev, 4), ''],
                ['Mean',
                    fmt(xSt.mean),     '',
                    fmt(ySt.mean),     ''],
                ['USL',
                    noData ? 'N/A' : lim.xUSL.toFixed(0), '',
                    noData ? 'N/A' : lim.yUSL.toFixed(0), ''],
                ['LSL',
                    noData ? 'N/A' : lim.xLSL.toFixed(0), '',
                    noData ? 'N/A' : lim.yLSL.toFixed(0), ''],
                ['Cp',
                    fmt(xCpk.cp, 12), noData ? '' : xStat.text,
                    fmt(yCpk.cp, 12), noData ? '' : yStat.text],
                ['Cpk',
                    fmt(xCpk.cpk, 12), noData ? '' : xStat.text,
                    fmt(yCpk.cpk, 12), noData ? '' : yStat.text]
            ],
            styles: {
                fontSize: 8.5,
                cellPadding: 3,
                lineColor: [200,200,200],
                lineWidth: 0.25
            },
            headStyles: {
                fillColor: [240,240,240],
                textColor: [30,30,30],
                fontStyle: 'bold',
                halign: 'center',
                fontSize: 9
            },
            columnStyles: {
                0: { fontStyle: 'bold', fillColor: [248,248,248], cellWidth: 38, halign: 'right' },
                1: { halign: 'right',   cellWidth: (cw - 38) * 0.30 },
                2: { halign: 'center',  cellWidth: (cw - 38) * 0.195 },
                3: { halign: 'right',   cellWidth: (cw - 38) * 0.30 },
                4: { halign: 'center',  cellWidth: (cw - 38) * 0.195 }
            },
            theme: 'grid',
            /* Color the Cp/Cpk status badge cells */
            didParseCell: (data) => {
                if (noData) return;
                const isStatusCol = (data.column.index === 2 || data.column.index === 4);
                const isValueRow  = (data.row.index >= 4);   // Cp & Cpk rows (body index)
                if (data.section === 'body' && isStatusCol && isValueRow && data.cell.raw) {
                    const isX   = data.column.index === 2;
                    const isCp  = data.row.index === 4;
                    const cpkV  = isX ? (isCp ? xCpk.cp : xCpk.cpk) : (isCp ? yCpk.cp : yCpk.cpk);
                    const st    = getStatus(cpkV);
                    data.cell.styles.fillColor  = hexRGB(st.bg);
                    data.cell.styles.textColor  = st.color === '#fff' ? [255,255,255] : [0,0,0];
                    data.cell.styles.fontStyle  = 'bold';
                    data.cell.styles.halign     = 'center';
                }
            }
        });

        y = doc.lastAutoTable.finalY + 8;
    }

    /* ── CPK CRITERIA TABLE ───────────────────────────────────────────── */
    if (y > ph - 60) { doc.addPage(); y = 15; }

    setFont(9, 'bold', [80,80,80]);
    doc.text('CPK Criteria', ml, y);
    y += 4;

    const criteria = [
        ['CPK >= 2.0',          'Excellent',  [34,197,94],    [0,0,0]],
        ['2.0 > CPK >= 1.67',   'Optimal',    [50,173,230],   [0,0,0]],
        ['1.67 > CPK >= 1.33',  'Good',       [134,239,172],  [0,0,0]],
        ['1.33 > CPK >= 1.0',   'Acceptable', [234,179,8],    [0,0,0]],
        ['1.0 > CPK >= 0.67',   'Bad',        [239,68,68],    [255,255,255]],
        ['0.67 > CPK',          'Terrible',   [127,29,29],    [255,255,255]],
    ];

    doc.autoTable({
        startY: y,
        margin: { left: ml },
        tableWidth: 90,
        head: [['CPK', 'Principle']],
        body: criteria.map(c => [c[0], c[1]]),
        headStyles: {
            fillColor: [60,60,60],
            textColor: [255,255,255],
            fontStyle: 'bold',
            fontSize: 9,
            halign: 'center'
        },
        styles: { fontSize: 9, cellPadding: 2.5, lineColor: [200,200,200], lineWidth: 0.25 },
        columnStyles: {
            0: { cellWidth: 50 },
            1: { cellWidth: 40, halign: 'center', fontStyle: 'bold' }
        },
        theme: 'grid',
        didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 1) {
                const c = criteria[data.row.index];
                data.cell.styles.fillColor = c[2];
                data.cell.styles.textColor = c[3];
            }
        }
    });

    y = doc.lastAutoTable.finalY + 12;

    /* ── CHARTS ───────────────────────────────────────────────────────── */
    doc.addPage();
    y = 15;

    setFont(14, 'bold', [20,20,20]);
    doc.text('Process Charts', pw / 2, y, { align: 'center' });
    y += 8;
    hLine(y, [200,200,200]);
    y += 8;

    const chartHeight = 62;  // mm
    const chartWidth  = cw;

    for (const mag of magList) {
        const data  = allLogData.filter(d => d.magType === mag);
        if (data.length === 0) continue;

        const lim   = limits[mag];

        // Section header
        if (y > ph - chartHeight * 2 - 30) { doc.addPage(); y = 15; }

        setFont(11, 'bold', [40,40,40]);
        doc.setFillColor(240, 240, 240);
        doc.roundedRect(ml, y - 4, cw, 9, 2, 2, 'F');
        doc.text(magDisplayName(mag), pw / 2, y + 2, { align: 'center' });
        y += 12;

        // X chart
        setFont(9, 'normal', [100,100,100]);
        doc.text('X-ray Spot (X)', ml, y);
        y += 3;

        const xPNG = await buildLightChartPNG(data.map(d => d.x), lim.xLSL, lim.xUSL, 'Sample Index — X');
        doc.addImage(xPNG, 'PNG', ml, y, chartWidth, chartHeight);
        y += chartHeight + 6;

        // Y chart
        doc.text('X-ray Spot (Y)', ml, y);
        y += 3;

        const yPNG = await buildLightChartPNG(data.map(d => d.y), lim.yLSL, lim.yUSL, 'Sample Index — Y');
        doc.addImage(yPNG, 'PNG', ml, y, chartWidth, chartHeight);
        y += chartHeight + 14;
    }

    /* ── FOOTER on each page ──────────────────────────────────────────── */
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        setFont(8, 'normal', [160,160,160]);
        doc.text(`CPK VITROX Report  •  Page ${p} of ${totalPages}`, pw / 2, ph - 8, { align: 'center' });
        hLine(ph - 12, [220,220,220]);
    }

    /* ── SAVE ─────────────────────────────────────────────────────────── */
    const dateStr = now.toISOString().slice(0,10).replace(/-/g,'');
    doc.save(`CPK_Report_${info.customer.replace(/\s+/g,'_') || 'VITROX'}_${dateStr}.pdf`);
}

// Expose exportPDF for button onclick
function exportPDF() { openPDFModal(); }
