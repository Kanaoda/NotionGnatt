<p align="center">
  <img src="assets/logo.png" alt="NotionGnatt logo" width="96" height="96" />
</p>

<h1 align="center">NotionGnatt</h1>

<p align="center">
  <strong>Notion Timeline / Gantt → client-ready export</strong><br/>
  Fix Notion’s broken timeline printing. Turn CSV into a shareable Gantt chart.
</p>

<p align="center">
  <a href="https://github.com/Kanaoda/NotionGnatt">GitHub</a> ·
  <a href="https://buymeacoffee.com/kanaoda">Buy Me a Coffee</a> ·
  <a href="https://github.com/sponsors/Kanaoda">Sponsors</a>
</p>

---

## Why NotionGnatt exists

If you have ever tried to **print**, **PDF-export**, or **screenshot** a Notion **Timeline** / **Gantt-style** board for a client, you already know the pain:

- Notion Export → CSV keeps dates, but **drops colors, bar layout, and view settings**
- Browser print chops a wide timeline into useless pages
- Full-page screenshots miss the horizontal scroll
- Clients should not need a Notion seat just to see the schedule

**NotionGnatt** was built for that gap.

Import your Notion CSV → rebuild a clean **Gantt / timeline** → hide internal tasks → export **PNG**, **PDF**, or standalone **HTML** that looks professional enough to send.

> Keywords people search: **Notion Gantt**, **Notion Timeline**, **NotionGnatt**, Notion timeline print, Notion gantt export, Notion CSV to Gantt.

---

## Features

- Import Notion database **CSV** (no server upload — runs in your browser)
- Rebuild **timeline / Gantt bars** with phase colors
- Filter by project & type; group by phase or project
- Customize bar labels, colors, order (drag), and today marker
- Hide sensitive rows before client delivery
- Export **full-width image**, **PDF** (via long image), or **interactive HTML**
- UI: **繁體中文 / English / 日本語**

---

## Quick start

### Option A — open locally

1. Clone or download this repo  
   `https://github.com/Kanaoda/NotionGnatt`
2. Open `index.html` in Chrome / Edge / Firefox
3. In Notion: database `⋯` → **Export** → **CSV**
4. Drag the CSV into **Data source**
5. Tweak filters / labels / hide list
6. Click **Export image** or **Export PDF** (prefer these over browser Print)

### Option B — GitHub Pages (optional)

After you enable Pages on this repo (`Settings → Pages → Deploy from branch /docs or root`), the app can be opened online without downloading.
---

## Recommended client workflow

1. Filter to the project the client should see  
2. Turn on **Preview as client** after hiding internal milestones / payments  
3. Export **PNG** for Slack / email, or **PDF** for contracts  
4. Optional: export **HTML** if the client needs to scroll a long timeline

**Tip:** Do not rely on the browser’s Print dialog for wide timelines. NotionGnatt’s image/PDF path is designed so the chart is **not cut mid-bar**.

---

## Privacy

All parsing happens **locally in your browser**. Your CSV is not uploaded to a NotionGnatt server.

Settings (mapping, hide list, colors, order) are stored in `localStorage` on your machine.

---

## Support the project

If NotionGnatt saved you a painful client delivery:

- [Buy Me a Coffee](https://buymeacoffee.com/kanaoda)
- [GitHub Sponsors](https://github.com/sponsors/Kanaoda)

---

## License & copyright

MIT License · © 2026 [Kanaoda](https://github.com/Kanaoda)

Product name: **NotionGnatt** (intentional spelling).
