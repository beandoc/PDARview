# NephroView: Peritoneal Dialysis AR Viewer & Patient Hub

NephroView is a comprehensive WebAR platform designed to empower Peritoneal Dialysis (PD) patients through interactive 3D education and daily self-care management.

## 🚀 Key Features

### 1. 3D AR Device Viewer
- **App-less AR**: Visualize the APD machine (Baxter HomeChoice Claria) in your own space using WebXR.
- **Interactive Hotspots**: Learn about the screen, cassette door, and ports through anchored 3D annotations.
- **Guided Tour**: Automated camera transitions that walk users through the machine's anatomy.

### 2. Comprehensive Educational Hub
- **CKD Basics**: Understanding eGFR and the stages of kidney disease.
- **PD Deep Dive**: How the peritoneum works as a filter.
- **Treatment Comparison**: Side-by-side analysis of APD vs. CAPD.

### 3. Procedure Guides
- **Sterile Technique**: Master the 'No-Touch' connection protocol.
- **Troubleshooting**: Visual guides for common cycler alarms (Low Drain, Power Failure).
- **Emergency Recognition**: Identifying peritonitis (Cloudy Bag) and critical warning signs.

### 4. Self-Care & Monitoring (Phase 2-3)
- **Interactive Daily Checklist**: Morning vitals tracker (Weight, BP, UF) with local persistence.
- **Exit Site Grading**: 3D simulator for identifying healthy vs. infected exit sites.
- **Supply Gallery**: Interactive 3D catalog of solution bags and minicaps with sterile zone highlighting.

## 🛠️ Technology Stack
- **Frontend**: Vite, Vanilla JavaScript, CSS3 (Glassmorphism design).
- **3D Rendering**: `<model-viewer>` (Google), WebXR.
- **Utilities**: `qrcode` (deployment), `sessionStorage`/`localStorage` (state management).

## 📦 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (Version 18 or higher)

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```

### Build for Production
```bash
npm run build
```

---
*For educational purposes only. Always follow your PD clinic's specific medical protocols.*
