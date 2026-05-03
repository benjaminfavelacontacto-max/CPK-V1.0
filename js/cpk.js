/**
 * cpk.js — Pure data layer
 * Mirrors: Models.swift · LogParser.swift · Statistics.swift
 */

'use strict';

// ── Default limits (matches Swift defaultLimits) ─────────────────────────────
const DEFAULT_LIMITS = {
    'High Mag (M11)': { xLSL: 395265829, xUSL: 395542168, yLSL: 769901391, yUSL: 770001507 },
    'Low Mag (M15)':  { xLSL: 395356356, xUSL: 395500356, yLSL: 769774822, yUSL: 769863004 },
    'Low Mag (M19)':  { xLSL: 395263941, xUSL: 395532510, yLSL: 769619571, yUSL: 769740168 }
};

// ── MagType detection (mirrors LogParser.swift detectMagType) ─────────────────
function detectMagType(content) {
    if (content.includes('M11')) return 'High Mag (M11)';
    if (content.includes('M15')) return 'Low Mag (M15)';
    return 'Low Mag (M19)';
}

// ── File reader helper ────────────────────────────────────────────────────────
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = e => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Cannot read ' + file.name));
        reader.readAsText(file);
    });
}

// ── Log parser (mirrors LogParser.parse) ─────────────────────────────────────
async function parseLogs(files) {
    const logFiles = Array.from(files).filter(f => f.name.endsWith('.log'));
    const entries  = [];

    for (const file of logFiles) {
        try {
            const content  = await readFileAsText(file);
            const magType  = detectMagType(content);
            const lines    = content.split('\n').map(l => l.trim());
            const hdrIdx   = lines.findIndex(l => l.includes('NewLocationX(nm)'));

            if (hdrIdx === -1 || lines.length <= hdrIdx + 1) continue;

            const headers = lines[hdrIdx].split(',');
            const data    = lines[hdrIdx + 1].split(',');
            const xIdx    = headers.indexOf('NewLocationX(nm)');
            const yIdx    = headers.indexOf('NewLocationY(nm)');

            if (xIdx < 0 || yIdx < 0 || xIdx >= data.length || yIdx >= data.length) continue;

            const x = parseFloat(data[xIdx]);
            const y = parseFloat(data[yIdx]);

            if (!isNaN(x) && !isNaN(y)) {
                entries.push({ filename: file.name, x, y, magType });
            }
        } catch (err) {
            console.warn('[CPK] Skipping', file.name, err.message);
        }
    }

    // Sort by filename (mirrors Swift sorted { $0.filename < $1.filename })
    return entries.sort((a, b) => a.filename.localeCompare(b.filename));
}

// ── Statistics (mirrors Statistics.calculate) ────────────────────────────────
function calcStats(values) {
    const n = values.length;
    if (n === 0) return { mean: 0, stdDev: 0 };

    const mean  = values.reduce((acc, v) => acc + v, 0) / n;
    const sumSq = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0);
    return { mean, stdDev: Math.sqrt(sumSq / n) };
}

// ── CPK (mirrors Statistics.cpk) ─────────────────────────────────────────────
function calcCPK(mean, stdDev, lsl, usl) {
    if (stdDev <= 0) return { cp: 0, cpk: 0 };
    const cpu = (usl - mean) / (3 * stdDev);
    const cpl = (mean - lsl) / (3 * stdDev);
    const cp  = (usl - lsl) / (6 * stdDev);
    return { cp, cpk: Math.min(cpu, cpl) };
}

// ── PrincipleStatus (mirrors PrincipleStatus.get) ────────────────────────────
function getStatus(cpk) {
    if (cpk >= 2.0)  return { text: 'Excellent',  bg: '#22c55e', color: '#fff' };
    if (cpk >= 1.67) return { text: 'Optimal',    bg: '#06b6d4', color: '#000' };
    if (cpk >= 1.33) return { text: 'Good',       bg: '#66cc66', color: '#fff' };
    if (cpk >= 1.0)  return { text: 'Acceptable', bg: '#e5e7eb', color: '#000' };
    if (cpk >= 0.67) return { text: 'Bad',        bg: '#f97316', color: '#fff' };
    return                   { text: 'Terrible',  bg: '#ef4444', color: '#fff' };
}
