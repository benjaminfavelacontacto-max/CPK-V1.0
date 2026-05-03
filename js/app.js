/**
 * app.js — UI controller
 * Mirrors: ContentView.swift · CPKChartView.swift
 */

'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let allLogData  = [];
let selectedMag = 'High Mag (M11)';
let chartX      = null;   // Chart.js instance for X axis
let chartY      = null;   // Chart.js instance for Y axis

// Mutable copy of limits (allows future UI editing if needed)
const limits = JSON.parse(JSON.stringify(DEFAULT_LIMITS));

// ── Event listeners ───────────────────────────────────────────────────────────
document.getElementById('mag-select').addEventListener('change', e => {
    selectedMag = e.target.value;
    render();
});

document.getElementById('folder-input').addEventListener('change', async e => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    allLogData = await parseLogs(files);
    // Reset input so the same folder can be re-selected if needed
    e.target.value = '';
    render();
});

// ── Main render ───────────────────────────────────────────────────────────────
function render() {
    const current = allLogData.filter(d => d.magType === selectedMag);
    const hasData = current.length > 0;

    document.getElementById('empty-state').style.display  = hasData ? 'none'  : 'flex';
    document.getElementById('main-content').style.display = hasData ? 'flex'  : 'none';
    document.getElementById('pdf-btn').disabled            = !hasData;

    if (!hasData) return;

    renderTable(current);
    renderStatsCards(current);
    renderLegend();
    renderCharts(current);
}

// ── Table (mirrors SwiftUI Table) ─────────────────────────────────────────────
function renderTable(data) {
    document.getElementById('log-count').textContent = `LOGS (${data.length})`;

    const tbody = document.getElementById('log-tbody');
    tbody.innerHTML = data.map(d => `
        <tr>
            <td title="${d.filename}">${d.filename}</td>
            <td>${d.x.toFixed(0)}</td>
            <td>${d.y.toFixed(0)}</td>
        </tr>
    `).join('');
}

// ── Stats Cards (mirrors statsCard ViewBuilder) ───────────────────────────────
function renderStatsCards(data) {
    const lim = limits[selectedMag];
    renderStatsCard('stats-x', 'X-RAY SPOT (X)', data.map(d => d.x), lim.xLSL, lim.xUSL);
    renderStatsCard('stats-y', 'X-RAY SPOT (Y)', data.map(d => d.y), lim.yLSL, lim.yUSL);
}

function renderStatsCard(elId, title, values, lsl, usl) {
    const { mean, stdDev } = calcStats(values);
    const { cpk }          = calcCPK(mean, stdDev, lsl, usl);
    const status           = getStatus(cpk);

    // toFixed(12) mirrors Swift specifier "%.12f"
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

        <span class="status-badge"
              style="background:${status.bg}; color:${status.color}">
            ${status.text}
        </span>
    `;
}

// ── Legend Card (mirrors legendCard()) ───────────────────────────────────────
function renderLegend() {
    const criteria = [
        { threshold: '≥ 2.0',  label: 'Excellent',  bg: '#22c55e', color: '#fff' },
        { threshold: '≥ 1.67', label: 'Optimal',    bg: '#06b6d4', color: '#000' },
        { threshold: '≥ 1.33', label: 'Good',       bg: '#66cc66', color: '#fff' },
        { threshold: '≥ 1.0',  label: 'Acceptable', bg: '#e5e7eb', color: '#000' },
        { threshold: '≥ 0.67', label: 'Bad',        bg: '#f97316', color: '#fff' },
        { threshold: '< 0.67', label: 'Terrible',   bg: '#ef4444', color: '#fff' },
    ];

    document.getElementById('legend-card').innerHTML = `
        <h3>Criterios</h3>
        ${criteria.map(c => `
            <div class="legend-item">
                <span class="legend-threshold">${c.threshold}</span>
                <span class="legend-badge"
                      style="background:${c.bg}; color:${c.color}">
                    ${c.label}
                </span>
            </div>
        `).join('')}
    `;
}

// ── Charts (mirrors CPKChartView) ─────────────────────────────────────────────
function renderCharts(data) {
    const lim = limits[selectedMag];
    buildChart('chart-x', data.map(d => d.x), lim.xLSL, lim.xUSL, 'X');
    buildChart('chart-y', data.map(d => d.y), lim.yLSL, lim.yUSL, 'Y');
}

/**
 * Creates (or rebuilds) a Chart.js line chart with USL, LSL, and Mean
 * rule marks — mirroring CPKChartView's RuleMark + LineMark + PointMark.
 */
function buildChart(canvasId, values, lsl, usl, axis) {
    // Destroy existing instance to avoid canvas reuse errors
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
                label: `X-ray Spot (${axis})`,
                data: values,
                // Blue gradient line — mirrors .foregroundStyle(Color.blue.gradient)
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                pointBackgroundColor: '#3b82f6',
                pointBorderColor: '#fff',
                pointBorderWidth: 1,
                pointRadius: 4,
                pointHoverRadius: 6,
                tension: 0.4,   // .interpolationMethod(.monotone)
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
                    grid: { color: 'rgba(0,0,0,0.06)' },
                    ticks: {
                        font: { size: 11 },
                        callback: v => Number(v).toFixed(0)
                    }
                },
                x: {
                    grid: { color: 'rgba(0,0,0,0.04)' },
                    title: { display: true, text: 'Sample Index', font: { size: 11 }, color: '#9ca3af' },
                    ticks: { font: { size: 11 } }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.parsed.y.toFixed(0)}`
                    }
                },
                // chartjs-plugin-annotation — mirrors RuleMark
                annotation: {
                    annotations: {
                        uslLine: {
                            type: 'line',
                            yMin: usl, yMax: usl,
                            borderColor: 'rgba(239, 68, 68, 0.85)',
                            borderWidth: 1.5,
                            borderDash: [5, 5],
                            label: {
                                display: true,
                                content: `USL: ${usl.toFixed(0)}`,
                                position: 'start',
                                backgroundColor: 'rgba(239, 68, 68, 0.85)',
                                color: '#fff',
                                font: { size: 11, weight: 'bold' },
                                padding: { x: 6, y: 3 },
                                borderRadius: 4
                            }
                        },
                        lslLine: {
                            type: 'line',
                            yMin: lsl, yMax: lsl,
                            borderColor: 'rgba(239, 68, 68, 0.85)',
                            borderWidth: 1.5,
                            borderDash: [5, 5],
                            label: {
                                display: true,
                                content: `LSL: ${lsl.toFixed(0)}`,
                                position: 'start',
                                backgroundColor: 'rgba(239, 68, 68, 0.85)',
                                color: '#fff',
                                font: { size: 11, weight: 'bold' },
                                padding: { x: 6, y: 3 },
                                borderRadius: 4
                            }
                        },
                        meanLine: {
                            type: 'line',
                            yMin: mean, yMax: mean,
                            borderColor: '#22c55e',
                            borderWidth: 2,
                            label: {
                                display: true,
                                content: `Mean: ${mean.toFixed(0)}`,
                                position: 'end',
                                backgroundColor: 'rgba(34, 197, 94, 0.9)',
                                color: '#fff',
                                font: { size: 11, weight: 'bold' },
                                padding: { x: 6, y: 3 },
                                borderRadius: 4
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

// ── PDF Export (mirrors exportPDF) ────────────────────────────────────────────
function exportPDF() {
    window.print();
}
