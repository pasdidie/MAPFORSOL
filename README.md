# MAP — Web App

MAP is a lightweight web application that provides an interactive interface with a clean UI and a modern front-end stack (Vite + TypeScript + Tailwind).  
The goal is simple: deliver a fast, responsive website that can be deployed directly on Vercel and updated through GitHub pushes.

---

## What the website does

- **Single-page web experience** built for speed and clarity
- **Modern UI styling** with Tailwind CSS
- **TypeScript codebase** for maintainability
- **Utility-based architecture** (helpers/utilities used across the app)

---

## How it works (high-level)

The application is structured around a front-end project located in the `frontend/` folder:

- `frontend/` contains the actual website source code
- Vite handles bundling and produces a production build in `dist/`
- Tailwind is used for styling and responsive layout
- Shared utilities live in `src/utils/` to keep logic clean and reusable

When deployed, Vercel builds the front-end and serves the generated static assets.

---

## Deployment (Vercel)

This project is designed to be deployed via GitHub → Vercel.

### Recommended Vercel settings
- **Root Directory:** `frontend`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

Every push to the default branch triggers an automatic redeploy on Vercel.

---

## Environment variables

If the app requires secrets or API keys, they should **not** be committed in the repository.  
Add them directly in **Vercel → Project Settings → Environment Variables**.

---

## Project structure

```txt
MAP/
  frontend/
    src/
      utils/
    public/
    index.html
    vite.config.ts
    tailwind.config.js
    tsconfig.json
