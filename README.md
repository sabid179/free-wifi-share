# Free WiFi Share

A lightweight web application for sharing public WiFi passwords with an interactive map view showing pins, SSIDs, passwords, and location details.

## Project Structure
- `index.html`, `style.css`, `app.js`: Frontend application (responsive two-column desktop layout, single-column mobile view).
- `config.js`: Your Supabase configuration (kept private, ignored via `.gitignore`).
- `config.example.js`: Empty template file safe for version control.
- `supabase-setup.sql`: Database schema, Row Level Security (RLS) policies, and voting functions.

## Map Tile Fallback (Handling 403 Errors)
OpenStreetMap's tile servers occasionally return `403 Forbidden` errors. The application automatically implements a resilient tile fallback strategy:
1. **CARTO** (Primary)
2. **Esri** (Secondary fallback)
3. **OpenStreetMap** (Final fallback)

## Setup Instructions
1. Create a new project on [Supabase](https://supabase.com).
2. Navigate to the SQL Editor, paste the contents of `supabase-setup.sql`, and run the script.
3. Go to **Project Settings → API** and copy your **Project URL** and **anon public** key.
4. Duplicate or rename `config.example.js` to `config.js` and insert your credentials. Leaving these blank activates Demo Mode (local browser state only).
5. Deploy to an HTTPS-enabled hosting provider (required for Geolocation API): **Netlify Drop**, **Vercel**, or **GitHub Pages**.

## Local Development
Run a local static server using Python:
```bash
python3 -m http.server 8000