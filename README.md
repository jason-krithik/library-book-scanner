# Library Book Scanner

A mobile-friendly web app for scanning and cataloguing library books using phone photos and Google's Gemini AI. Photos are submitted to a Google Apps Script backend that extracts book metadata and logs it to a Google Sheet.

## How it works

1. The user opens the app on their phone and selects a library (Senior or Junior).
2. They photograph the front cover, back cover, and ISBN barcode of each book.
3. On submit, the images are compressed client-side and sent (fire-and-forget) to a Google Apps Script endpoint.
4. The Apps Script calls the Gemini 2.5 Flash API with the images and a cataloguing prompt.
5. Gemini returns structured JSON with title, author, publisher, ISBN, and ~15 other fields.
6. The data is appended as a new row to the appropriate Google Sheet tab.
7. A persistent status pill at the bottom of the screen shows processing / done / failed counts. Tapping it opens a slide-up drawer with per-book status.

Failed submissions (after 2 Gemini retries) are logged to a "Failed Submissions" sheet tab for manual re-scanning.

## Project structure

```
index.html              # Single-page scanner UI (vanilla HTML/CSS/JS)
apps-script/Code.gs     # Google Apps Script backend
```

## Setup

### 1. Deploy the Apps Script

1. Go to [script.google.com](https://script.google.com) and create a new project.
2. Paste the contents of `apps-script/Code.gs`.
3. Set `GEMINI_API_KEY` at the top of the file to your [Google AI Studio](https://aistudio.google.com) API key.
4. Deploy as a **Web App** (execute as yourself, access for anyone).
5. Copy the deployment URL.

### 2. Configure the frontend

In `index.html`, replace the `APPS_SCRIPT_URL` constant with your deployment URL:

```js
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
```

### 3. Host the frontend

The app is a single static HTML file. You can host it on:
- **GitHub Pages** — push to a repo and enable Pages (a `.nojekyll` file is already included).
- Any static host (Netlify, Vercel, etc.).

## Google Sheet columns

| Sl.No. | Accession No. | Title | Sub Title | Author | Editor | Compiler | Illustrator | Publisher | Edition | Volume No. | Series | Place | Price | Year | Pages | Size | Source | ISBN No. | Lost cost | Damage Quantity |
|--------|---------------|-------|-----------|--------|--------|----------|-------------|-----------|---------|------------|--------|-------|-------|------|-------|------|--------|----------|-----------|-----------------|

Two sheet tabs are maintained: **Senior Library** and **Junior Library**, plus corresponding **Failed Submissions** tabs.

## Libraries / APIs used

- [Gemini 2.5 Flash](https://ai.google.dev/) — book metadata extraction from images
- Google Apps Script — serverless backend + Google Sheets integration
- Vanilla HTML/CSS/JS — no build step, no dependencies
