# Free WiFi Share

A lightweight web application for sharing public WiFi passwords with an interactive map view showing pins, SSIDs, passwords, and location details.

## Project Structure
- `index.html`, `style.css`, `app.js`: Frontend application (responsive two-column desktop layout, single-column mobile view).
- `functions/api/config.js`: Cloudflare Pages Function that serves the Supabase configuration at `/api/config`, read from environment variables so no keys are stored in the frontend files.
- `config.example.js`: Empty template (not loaded by `index.html`; the app reads its configuration from `/api/config`).
- `supabase-setup.sql`: Database schema, Row Level Security (RLS) policies, and voting functions.

## UI
The interface follows the [shadcn/ui](https://ui.shadcn.com) design system (theme tokens, Button, Card, Input, Select, Tabs, Badge and Toast styles), implemented as plain CSS in `style.css` so the app still needs no build step. Light and dark themes are both supported.

## Wi-Fi QR codes
- **Connect to this Wi-Fi:** the details card has a button that copies the password and opens a short guide with a Wi-Fi QR code. Browsers cannot join a Wi-Fi network by themselves, so on another phone you can scan the QR code with the camera to join directly.
- **Scan to add:** on the *Add WiFi* tab, tap **Scan Wi-Fi QR code** to fill the name and password from a standard Wi-Fi QR code (`WIFI:T:WPA;S:name;P:password;;`). You can also upload a photo/screenshot of the QR code. The camera needs HTTPS (or `localhost`).
- The QR libraries ([qrcode-generator](https://www.npmjs.com/package/qrcode-generator) and [jsQR](https://www.npmjs.com/package/jsqr)) are loaded from jsDelivr only when these features are used.

## Map Tiles
The map uses raster tiles, so place labels are rendered on the server with proper text shaping and Bengali spelling (matras, conjuncts) is displayed correctly. (Vector/MapLibre labels draw Bengali letter by letter and break it.) If a tile server fails, the app automatically falls back:
1. **OpenStreetMap** (Primary)
2. **HOT / OpenStreetMap France** (Secondary)
3. **CARTO Voyager** (Final fallback)

## Setup Instructions
1. Create a new project on [Supabase](https://supabase.com).
2. Navigate to the SQL Editor, paste the contents of `supabase-setup.sql`, and run the script.
3. Go to **Project Settings → API** and copy your **Project URL** and **anon public** key.
4. Deploy to **Cloudflare Pages** (HTTPS is required for the Geolocation API).
5. In Cloudflare Pages go to **Settings → Variables and Secrets** and add:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`

   Then redeploy so the variables take effect.

## Local Demo (Demo Mode)
`python -m http.server` only serves static files, so the Cloudflare Function at `/api/config` does not run. To preview the app locally, create a dummy `api/config` file with empty values. With empty values the app starts in **Demo Mode** (data is saved only in your own browser).

**1. Create the dummy config file** (the file name is `config`, without any extension)

Mac / Linux:
```bash
mkdir api
echo '{"SUPABASE_URL":"","SUPABASE_ANON_KEY":""}' > api/config
```

Windows (PowerShell):
```powershell
mkdir api
'{"SUPABASE_URL":"","SUPABASE_ANON_KEY":""}' | Out-File -Encoding ascii api/config
```

**2. Start the local server**
```bash
python -m http.server 8000
```

**3. Open** `http://localhost:8000` in your browser. The header should show the **Demo mode** badge.

> ⚠️ **Before deploying, delete the local `api/` folder** (or add `/api/` to `.gitignore`). Use the leading slash: a plain `api/` entry would also ignore `functions/api/config.js`. Otherwise it can conflict with the real `/api/config` Function on Cloudflare.

### Local run with the real Supabase data (optional)
Create a `.dev.vars` file (add it to `.gitignore`) containing:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```
Then run the Cloudflare local server and open `http://localhost:8788`:
```bash
npx wrangler pages dev .
```