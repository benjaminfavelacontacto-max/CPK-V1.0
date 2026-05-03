# CPK VITROX

Web version of the CPK Vitrox macOS app — analyze X-ray spot placement data from `.log` files and compute process capability indices (Cp / Cpk) per camera magnification.

## Live Demo

Deploy to **GitHub Pages**:
`Settings → Pages → Branch: main → Folder: / (root) → Save`

Your app will be live at `https://<your-username>.github.io/<repo-name>/`

---

## Features

- Load a folder of `.log` files directly in the browser (no server required)
- Auto-detects camera type: **High Mag (M11)**, **Low Mag (M15)**, **Low Mag (M19)**
- Computes **Cpk**, **Cp**, **Mean**, and **Std Deviation** for X and Y axes
- Color-coded status badges: Excellent / Optimal / Good / Acceptable / Bad / Terrible
- Interactive **Chart.js** line charts with USL, LSL, and Mean rule marks
- **PDF export** via browser print dialog
- Matches the original macOS SwiftUI app layout and logic exactly

---

## Repository Structure

```
├── index.html          # Main page
├── css/
│   └── styles.css      # All styles (macOS-inspired)
├── js/
│   ├── cpk.js          # Data layer: parser, statistics, CPK (pure functions)
│   └── app.js          # UI controller: rendering, charts, state
├── Sources/            # Original Swift source (macOS app)
│   └── CPKVitrox/
│       ├── CPKVitroxApp.swift
│       ├── Models.swift
│       ├── ContentView.swift
│       ├── CPKChartView.swift
│       ├── LogParser.swift
│       └── Statistics.swift
├── assets/
│   └── SMTLogo.png     # ← Place your logo here
├── Package.swift       # Swift Package Manager config
└── .gitignore
```

---

## Getting Started

### Option A — Open locally
Just open `index.html` in Chrome, Edge, or Safari 14+. No build step needed.

### Option B — GitHub Pages
1. Push this repo to GitHub
2. Go to **Settings → Pages → Source: Deploy from branch → main / root**
3. Visit the generated URL

### Option C — macOS app (Xcode)
1. Open Xcode → **File → New → Project → macOS App**
2. Name it `CPKVitrox`, Swift, SwiftUI interface
3. Drag all files from `Sources/CPKVitrox/` into the project navigator
4. Add `SMTLogo` to `Assets.xcassets`
5. Build & Run (requires macOS 13+, Xcode 15+)

---

## Logo

Place your `SMTLogo.png` inside the `assets/` folder. If the image is missing the header will show a blue **SMT** fallback badge automatically.

---

## Default Limits

| Camera | xLSL | xUSL | yLSL | yUSL |
|---|---|---|---|---|
| High Mag (M11) | 395 265 829 | 395 542 168 | 769 901 391 | 770 001 507 |
| Low Mag (M15)  | 395 356 356 | 395 500 356 | 769 774 822 | 769 863 004 |
| Low Mag (M19)  | 395 263 941 | 395 532 510 | 769 619 571 | 769 740 168 |

---

## Browser Compatibility

| Browser | Folder Loading | Charts | PDF |
|---|---|---|---|
| Chrome 86+ | ✅ | ✅ | ✅ |
| Edge 86+   | ✅ | ✅ | ✅ |
| Firefox 111+ | ✅ | ✅ | ✅ |
| Safari 14+ | ✅ | ✅ | ✅ |

> Folder selection uses the standard `webkitdirectory` attribute, supported by all modern browsers.

---

## CPK Reference

| Cpk | Status |
|---|---|
| ≥ 2.00 | 🟢 Excellent |
| ≥ 1.67 | 🔵 Optimal |
| ≥ 1.33 | 🟩 Good |
| ≥ 1.00 | ⬜ Acceptable |
| ≥ 0.67 | 🟠 Bad |
| < 0.67 | 🔴 Terrible |
