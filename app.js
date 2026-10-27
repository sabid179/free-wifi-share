(function () {
  "use strict";

  /* ---------- helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2800);
  }
  function dist(a, b, c, d) {
    const R = 6371000,
      r = (x) => (x * Math.PI) / 180;
    const dLat = r(c - a),
      dLon = r(d - b);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const fmtDist = (m) =>
    m < 1000 ? Math.round(m) + " m" : (m / 1000).toFixed(1) + " km";
  const fmtCoord = (lat, lng) =>
    Number(lat).toFixed(5) + ", " + Number(lng).toFixed(5);

  /* ---------- theme ---------- */
  const root = document.documentElement;
  function applyTheme(t) {
    root.setAttribute("data-theme", t);
    $("themeBtn").textContent = t === "dark" ? "Light mode" : "Dark mode";
  }
  let theme = null;
  try {
    theme = localStorage.getItem("wifi-theme");
  } catch (e) {}
  if (!theme)
    theme = matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  applyTheme(theme);
  $("themeBtn").onclick = () => {
    theme = theme === "dark" ? "light" : "dark";
    applyTheme(theme);
    try {
      localStorage.setItem("wifi-theme", theme);
    } catch (e) {}
  };

  /* ---------- backend (Supabase or demo) ---------- */
  const cfg = window.APP_CONFIG || {};
  const useSupabase = !!(
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_ANON_KEY &&
    window.supabase
  );
  const sb = useSupabase
    ? window.supabase.createClient(
        cfg.SUPABASE_URL.trim(),
        cfg.SUPABASE_ANON_KEY.trim(),
      )
    : null;
  $("modeBadge").textContent = useSupabase ? "Live database" : "Demo mode";
  $("modeBadge").classList.add(useSupabase ? "live" : "demo");

  let items = [];
  const DEMO_KEY = "wifi-demo-items";
  function demoLoad() {
    try {
      return JSON.parse(localStorage.getItem(DEMO_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }
  function demoSave() {
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(items));
    } catch (e) {}
  }

  async function load() {
    if (useSupabase) {
      const { data, error } = await sb
        .from("wifis")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) {
        console.error(error);
        toast("Could not load data: " + error.message);
        return;
      }
      items = data || [];
    } else items = demoLoad();
    render();
  }

  async function insertItem(row) {
    const normalize = (value) => value.trim().toLowerCase();
    const CLOSE_DISTANCE_METERS = 20;

    function distanceMeters(lat1, lng1, lat2, lng2) {
      const toRad = (value) => (value * Math.PI) / 180;
      const dLat = toRad(lat2 - lat1);
      const dLng = toRad(lng2 - lng1);

      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

      return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    let candidates;

    if (useSupabase) {
      const { data, error } = await sb
        .from("wifis")
        .select("id, ssid, password, lat, lng")
        .ilike("ssid", row.ssid.trim());

      if (error) throw error;
      candidates = data || [];
    } else {
      candidates = items;
    }

    const nearby = candidates.find(
      (item) =>
        normalize(item.ssid) === normalize(row.ssid) &&
        distanceMeters(
          Number(item.lat),
          Number(item.lng),
          Number(row.lat),
          Number(row.lng),
        ) <= CLOSE_DISTANCE_METERS,
    );

    // console.log("WiFi duplicate check:", {
    //   submittedSSID: row.ssid,
    //   submittedLat: row.lat,
    //   submittedLng: row.lng,
    //   candidateCount: candidates.length,
    //   matches: candidates.map((item) => ({
    //     ssid: item.ssid,
    //     distanceMeters: distanceMeters(
    //       Number(item.lat),
    //       Number(item.lng),
    //       Number(row.lat),
    //       Number(row.lng),
    //     ),
    //   })),
    // });

    if (nearby) {
      if (nearby.password === row.password) {
        throw new Error(
          "This WiFi already exists nearby with the same password.",
        );
      }

      const shouldUpdate = confirm(
        "A WiFi with the same SSID exists within 20 metres, but its password is different.\n\n" +
          "Update the existing WiFi password instead of creating a duplicate?",
      );

      if (!shouldUpdate) {
        throw new Error("WiFi was not changed.");
      }

      if (useSupabase) {
        const { data, error } = await sb
          .from("wifis")
          .update({
            password: row.password,
            place: row.place,
            address: row.address,
          })
          .eq("id", nearby.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      }

      Object.assign(nearby, {
        password: row.password,
        place: row.place,
        address: row.address,
      });

      demoSave();
      return nearby;
    }

    if (useSupabase) {
      const { data, error } = await sb
        .from("wifis")
        .insert(row)
        .select()
        .single();

      if (error) throw error;
      return data;
    }

    const newItem = {
      ...row,
      id: "d" + Date.now(),
      works: 0,
      fails: 0,
      created_at: new Date().toISOString(),
    };

    items.unshift(newItem);
    demoSave();
    return newItem;
  }

  async function vote(id, ok) {
    const voteKey = `wifi-vote-${id}`;

    if (localStorage.getItem(voteKey)) {
      alert("You have already voted for this WiFi from this browser.");
      return;
    }

    if (useSupabase) {
      const { error } = await sb.rpc("vote_wifi", {
        p_id: id,
        p_ok: ok,
      });

      if (error) throw error;

      localStorage.setItem(voteKey, ok ? "works" : "fails");
      await load();
    } else {
      const it = items.find((x) => x.id === id);

      if (it) {
        ok ? it.works++ : it.fails++;
        localStorage.setItem(voteKey, ok ? "works" : "fails");
        demoSave();
        render();
      }
    }
  }

  if (useSupabase) {
    sb.channel("wifis-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wifis" },
        () => load(),
      )
      .subscribe();
  }

  /* ---------- map (raster tiles: labels are shaped on the server, so Bengali spelling stays correct) ---------- */
  const map = L.map("map", { zoomControl: true, maxZoom: 19 }).setView(
    [23.8103, 90.4125],
    12,
  );
  const TILE_SOURCES = [
    {
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      maxZoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    },
    {
      url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
      subdomains: "abc",
      maxZoom: 19,
      attribution:
        '© OpenStreetMap contributors, tiles by <a href="https://www.hotosm.org/" target="_blank" rel="noopener">HOT</a>, hosted by <a href="https://openstreetmap.fr/" target="_blank" rel="noopener">OpenStreetMap France</a>',
    },
    {
      url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      subdomains: "abcd",
      maxZoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
    },
  ];
  let baseLayer = null,
    tileIdx = 0,
    tileErrors = 0;
  function mountBase() {
    if (baseLayer) map.removeLayer(baseLayer);
    const { url, ...opts } = TILE_SOURCES[tileIdx];
    baseLayer = L.tileLayer(url, opts).addTo(map);
    baseLayer.on("tileload", () => {
      tileErrors = 0;
    });
    baseLayer.on("tileerror", () => {
      if (++tileErrors >= 4 && tileIdx < TILE_SOURCES.length - 1) {
        tileIdx++;
        tileErrors = 0;
        console.warn("Tile server failed, switching to source " + tileIdx);
        mountBase();
      }
    });
  }
  mountBase();

  /* ---------- marker icons ---------- */
  function pinIcon(kind) {
    const color =
      { normal: "#0f766e", active: "#e11d48", pick: "#2563eb" }[kind] ||
      "#0f766e";
    const big = kind !== "normal";
    const w = big ? 38 : 32,
      h = big ? 50 : 42;
    const svg = `<svg width="${w}" height="${h}" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 1C7.7 1 1 7.6 1 15.8 1 26.6 16 41 16 41s15-14.4 15-25.2C31 7.6 24.3 1 16 1z" fill="${color}" stroke="#fff" stroke-width="2"/>
    <circle cx="16" cy="16" r="10" fill="#fff"/>
    <path d="M10.6 14.1a7.6 7.6 0 0 1 10.8 0M13 16.8a4.3 4.3 0 0 1 6 0" fill="none" stroke="${color}" stroke-width="1.9" stroke-linecap="round"/>
    <circle cx="16" cy="19.6" r="1.4" fill="${color}"/>
  </svg>`;
    return L.divIcon({
      className: "pin",
      html: svg,
      iconSize: [w, h],
      iconAnchor: [w / 2, h],
      popupAnchor: [0, -h],
    });
  }
  const meIcon = L.divIcon({
    className: "me-dot",
    html: '<span class="me-pulse"></span><span class="me-core"></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

  const markers = L.layerGroup().addTo(map);
  let ref = null,
    refMarker = null,
    refCircle = null,
    radiusCircle = null,
    selected = null;

  /* Draws the selected range as a circle around the reference point */
  function updateRadius(fit) {
    if (radiusCircle) {
      map.removeLayer(radiusCircle);
      radiusCircle = null;
    }
    const rad = +$("radius").value;
    if (!ref || !rad) {
      if (fit && ref) map.setView([ref.lat, ref.lng], 16);
      return;
    }
    radiusCircle = L.circle([ref.lat, ref.lng], {
      radius: rad,
      color: "#006a4e",
      weight: 2,
      dashArray: "6 6",
      fillColor: "#006a4e",
      fillOpacity: 0.07,
      interactive: false,
    }).addTo(map);
    if (fit)
      map.fitBounds(radiusCircle.getBounds(), {
        padding: [30, 30],
        maxZoom: 18,
      });
  }
  let addLoc = null,
    pickMarker = null,
    pickMode = false,
    addrTouched = false;

  /* ---------- geolocation + geocoding ---------- */
  function getLocation() {
    return new Promise((res, rej) => {
      if (!navigator.geolocation)
        return rej(new Error("This browser does not support location"));
      navigator.geolocation.getCurrentPosition(
        (p) =>
          res({
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            acc: p.coords.accuracy,
          }),
        (e) =>
          rej(
            new Error(
              e.code === 1
                ? "Location permission denied (লোকেশনের অনুমতি দিন, HTTPS লাগবে)"
                : "Could not get your location",
            ),
          ),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    });
  }
  async function reverseGeocode(lat, lng) {
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=en&lat=${lat}&lon=${lng}`,
      );
      if (!r.ok) return null;
      const j = await r.json();
      return j.display_name || null;
    } catch (e) {
      return null;
    }
  }
  function bindSearch(inputEl, btnEl, resEl, onPick) {
    async function go() {
      const q = inputEl.value.trim();
      if (!q) return;
      resEl.innerHTML = '<li class="empty">Searching…</li>';
      try {
        const r = await fetch(
          "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=en&q=" +
            encodeURIComponent(q),
        );
        const j = await r.json();
        if (!j.length) {
          resEl.innerHTML = '<li class="empty">No results found</li>';
          return;
        }
        resEl.innerHTML = j
          .map((p, i) => `<li data-i="${i}">${esc(p.display_name)}</li>`)
          .join("");
        resEl.querySelectorAll("li[data-i]").forEach(
          (li) =>
            (li.onclick = () => {
              const p = j[+li.dataset.i];
              resEl.innerHTML = "";
              onPick(+p.lat, +p.lon, p.display_name);
            }),
        );
      } catch (e) {
        resEl.innerHTML =
          '<li class="empty">Search failed. Check your internet.</li>';
      }
    }
    btnEl.onclick = go;
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        go();
      }
    });
  }

  /* ---------- GET tab: reference location ---------- */
  function setRef(lat, lng, label, acc) {
    ref = { lat, lng };
    if (refMarker) map.removeLayer(refMarker);
    if (refCircle) {
      map.removeLayer(refCircle);
      refCircle = null;
    }
    refMarker = L.marker([lat, lng], {
      icon: meIcon,
      interactive: false,
      keyboard: false,
      zIndexOffset: 500,
    }).addTo(map);
    if (acc && acc < 2000) {
      refCircle = L.circle([lat, lng], {
        radius: acc,
        color: "#2563eb",
        weight: 1,
        fillColor: "#2563eb",
        fillOpacity: 0.1,
        interactive: false,
      }).addTo(map);
    }
    $("locStatus").textContent =
      label +
      ": " +
      fmtCoord(lat, lng) +
      (acc ? " (±" + Math.round(acc) + " m)" : "");
    map.setView([lat, lng], 16);
    updateRadius(true);
    render();
  }
  $("locBtn").onclick = async () => {
    $("locStatus").textContent = "Finding your location…";
    try {
      const p = await getLocation();
      setRef(p.lat, p.lng, "Your location", p.acc);
    } catch (e) {
      $("locStatus").textContent = e.message;
      toast(e.message);
    }
  };
  bindSearch($("areaInput"), $("areaBtn"), $("areaRes"), (lat, lng, name) =>
    setRef(lat, lng, name.split(",").slice(0, 2).join(",")),
  );

  /* ---------- ADD tab: choose location ---------- */
  function showPickMarker() {
    if (!addLoc) return;
    if (!pickMarker) {
      pickMarker = L.marker([addLoc.lat, addLoc.lng], {
        icon: pinIcon("pick"),
        draggable: true,
        zIndexOffset: 1000,
      });
      pickMarker.on("dragend", () => {
        const p = pickMarker.getLatLng();
        setAddLoc(p.lat, p.lng, "Dragged pin", false);
      });
    } else pickMarker.setLatLng([addLoc.lat, addLoc.lng]);
    if (!map.hasLayer(pickMarker)) pickMarker.addTo(map);
  }
  async function setAddLoc(lat, lng, source, fly) {
    addLoc = { lat, lng };
    showPickMarker();
    if (fly) map.setView([lat, lng], Math.max(map.getZoom(), 17));
    const base = source + ": " + fmtCoord(lat, lng);
    $("addLocStatus").textContent = base;
    const token = (setAddLoc._t = (setAddLoc._t || 0) + 1);
    const name = await reverseGeocode(lat, lng);
    if (token !== setAddLoc._t || !name) return;
    $("addLocStatus").textContent = base + " — near " + name;
    if (!addrTouched) $("addr").value = name.slice(0, 200);
  }
  function setPickMode(on) {
    pickMode = on;
    $("pickBtn").classList.toggle("active", on);
    $("pickBtn").textContent = on ? "Click on the map…" : "Pick on map";
    $("map").classList.toggle("picking", on);
    $("pickHint").classList.toggle("hidden", !on);
  }
  $("pickBtn").onclick = () => setPickMode(!pickMode);
  $("addGpsBtn").onclick = async () => {
    $("addLocStatus").textContent = "Finding your location…";
    try {
      const p = await getLocation();
      setPickMode(false);
      setAddLoc(p.lat, p.lng, "GPS", true);
    } catch (e) {
      $("addLocStatus").textContent = e.message;
      toast(e.message);
    }
  };
  bindSearch($("addInput"), $("addSearchBtn"), $("addRes"), (lat, lng) => {
    setPickMode(false);
    setAddLoc(lat, lng, "Searched place", true);
  });
  $("addr").addEventListener("input", () => {
    addrTouched = true;
  });

  map.on("click", (e) => {
    if (pickMode) {
      setPickMode(false);
      setAddLoc(e.latlng.lat, e.latlng.lng, "Map pin", false);
      return;
    }
    if (selected) {
      selected = null;
      render();
    }
  });

  /* ---------- tabs ---------- */
  function setTab(name) {
    document
      .querySelectorAll(".tab")
      .forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    $("panel-get").classList.toggle("hidden", name !== "get");
    $("panel-add").classList.toggle("hidden", name !== "add");
    if (name === "add") {
      if (addLoc) showPickMarker();
    } else {
      setPickMode(false);
      if (pickMarker && map.hasLayer(pickMarker)) map.removeLayer(pickMarker);
    }
  }
  document
    .querySelectorAll(".tab")
    .forEach((t) => (t.onclick = () => setTab(t.dataset.tab)));

  /* ---------- list + markers ---------- */
  function visible() {
    const q = $("search").value.trim().toLowerCase();
    const rad = +$("radius").value;
    return items
      .map((x) => ({
        ...x,
        d: ref ? dist(ref.lat, ref.lng, x.lat, x.lng) : null,
      }))
      .filter(
        (x) =>
          !q ||
          (x.ssid + " " + x.place + " " + (x.address || ""))
            .toLowerCase()
            .includes(q),
      )
      .filter((x) => !(rad && ref) || x.d <= rad)
      .sort((a, b) =>
        ref ? a.d - b.d : new Date(b.created_at) - new Date(a.created_at),
      );
  }
  function render() {
    const v = visible();
    markers.clearLayers();
    v.forEach((x) => {
      L.marker([x.lat, x.lng], {
        icon: pinIcon(selected === x.id ? "active" : "normal"),
        zIndexOffset: selected === x.id ? 800 : 0,
        title: x.ssid,
      })
        .on("click", () => select(x.id, false))
        .addTo(markers);
    });
    const ul = $("list");
    if (!v.length) {
      ul.innerHTML =
        '<li class="empty" style="cursor:default;border:0">No WiFi found here yet. Be the first to add one!</li>';
    } else
      ul.innerHTML = v
        .map(
          (x) => `
    <li data-id="${esc(x.id)}" class="${selected === x.id ? "active" : ""}">
      <div class="name">${esc(x.ssid)}</div>
      <div class="meta"><span>${esc(x.place)}</span>
        ${x.d != null ? `<span class="tag">${fmtDist(x.d)}</span>` : ""}
        <span>✓ ${x.works || 0}</span><span>✕ ${x.fails || 0}</span></div>
    </li>`,
        )
        .join("");
    ul.querySelectorAll("li[data-id]").forEach(
      (li) => (li.onclick = () => select(li.dataset.id, true)),
    );
    if (selected) showDetails(selected);
    else $("details").classList.add("hidden");
  }
  function select(id, fly) {
    selected = id;
    const x = items.find((i) => i.id === id);
    if (x && fly) map.flyTo([x.lat, x.lng], Math.max(map.getZoom(), 17));
    render();
    if (x && fly && matchMedia("(max-width: 860px)").matches)
      document
        .querySelector(".mapwrap")
        .scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function showDetails(id) {
    const x = items.find((i) => i.id === id),
      box = $("details");
    if (!x) {
      box.classList.add("hidden");
      return;
    }
    const d = ref ? fmtDist(dist(ref.lat, ref.lng, x.lat, x.lng)) : null;
    box.classList.remove("hidden");
    box.innerHTML = `
    <button class="close" id="dClose" aria-label="Close">×</button>
    <div class="cred">
      <div class="cred-label">Wi-Fi name</div>
      <div class="cred-ssid">${esc(x.ssid)}</div>
      <div class="cred-label">Password</div>
      <div class="cred-pass"><code>${esc(x.password)}</code><button class="btn" id="dCopy" type="button">Copy</button></div>
      <button class="btn primary block" id="dConnect" type="button">Connect to this Wi-Fi</button>
    </div>
    <div class="kv"><b>Place</b>${esc(x.place)}</div>
    ${x.address ? `<div class="kv"><b>Details</b>${esc(x.address)}</div>` : ""}
    <div class="kv"><b>Location</b>${fmtCoord(x.lat, x.lng)}${d ? " · " + d + " away" : ""}</div>
    <div class="kv"><b>Added</b>${esc(new Date(x.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }))}</div>
    <div class="actions">
      <button class="btn" id="dOk" type="button">✓ Works (${x.works || 0})</button>
      <button class="btn" id="dBad" type="button">✕ Not working (${x.fails || 0})</button>
      <a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${x.lat},${x.lng}">Directions</a>
    </div>`;
    $("dClose").onclick = () => {
      selected = null;
      render();
    };
    $("dCopy").onclick = async () => {
      try {
        await navigator.clipboard.writeText(x.password);
        toast("Password copied");
      } catch (e) {
        toast("Could not copy. Please copy manually.");
      }
    };
    $("dConnect").onclick = () => connectWifi(x);
    const doVote = (ok) =>
      vote(x.id, ok)
        .then(() => toast("Thanks for your feedback!"))
        .catch((e) => toast("Vote failed: " + e.message));
    $("dOk").onclick = () => doVote(true);
    $("dBad").onclick = () => doVote(false);
  }

  /* ---------- modal + lazy script loader ---------- */
  const libs = {};
  function loadScript(src) {
    if (!libs[src])
      libs[src] = new Promise((res, rej) => {
        const sc = document.createElement("script");
        sc.src = src;
        sc.onload = res;
        sc.onerror = () => {
          delete libs[src];
          rej(new Error("Could not load " + src));
        };
        document.head.appendChild(sc);
      });
    return libs[src];
  }
  let modalCleanup = null;
  function openModal(html, cleanup) {
    closeModal();
    $("modalCard").innerHTML = html;
    $("modal").classList.remove("hidden");
    modalCleanup = cleanup || null;
  }
  function closeModal() {
    if (modalCleanup) {
      const fn = modalCleanup;
      modalCleanup = null;
      fn();
    }
    $("modal").classList.add("hidden");
    $("modalCard").innerHTML = "";
  }
  $("modal").addEventListener("click", (e) => {
    if (e.target === $("modal")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("modal").classList.contains("hidden"))
      closeModal();
  });

  /* ---------- Wi-Fi QR format: WIFI:T:WPA;S:name;P:password;; ---------- */
  const wifiEsc = (v) => String(v).replace(/([\\;,:"])/g, "\\$1");
  const wifiPayload = (ssid, password) =>
    "WIFI:T:WPA;S:" + wifiEsc(ssid) + ";P:" + wifiEsc(password) + ";;";
  function parseWifiQR(raw) {
    const t = String(raw || "").trim();
    if (!/^WIFI:/i.test(t)) return null;
    const f = {};
    let k = "",
      v = "",
      inKey = true,
      esc2 = false;
    for (const c of t.slice(5)) {
      if (esc2) {
        if (inKey) k += c;
        else v += c;
        esc2 = false;
      } else if (c === "\\") esc2 = true;
      else if (inKey && c === ":") inKey = false;
      else if (c === ";") {
        if (!inKey) f[k.toUpperCase()] = v;
        k = "";
        v = "";
        inKey = true;
      } else if (inKey) k += c;
      else v += c;
    }
    if (!inKey && k) f[k.toUpperCase()] = v;
    const unquote = (z) => (/^".*"$/.test(z) ? z.slice(1, -1) : z);
    if (!f.S) return null;
    return { ssid: unquote(f.S), password: unquote(f.P || "") };
  }

  /* ---------- "Connect to this Wi-Fi" (copy password + QR for another phone) ---------- */
  const QR_GEN_SRC =
    "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
  async function connectWifi(x) {
    let copied = false;
    try {
      await navigator.clipboard.writeText(x.password);
      copied = true;
    } catch (e) {}
    openModal(`
      <h2>Connect to “${esc(x.ssid)}”</h2>
      <p class="sub">${copied ? "Password copied to your clipboard." : "Tap “Copy password” below."}</p>
      <ol class="steps">
        <li>Open your device’s Wi-Fi settings.</li>
        <li>Select <b>${esc(x.ssid)}</b>.</li>
        <li>Paste the password and connect.</li>
      </ol>
      <div class="qr-box"><img id="qrImg" class="hidden" alt="Wi-Fi QR code"><span id="qrMsg" class="muted">Creating QR code…</span></div>
      <p class="muted center">On another phone, scan this QR code with the camera to join directly.</p>
      <div class="actions">
        <button class="btn" id="mCopy" type="button">Copy password</button>
        <button class="btn primary" id="mClose" type="button">Done</button>
      </div>`);
    $("mClose").onclick = closeModal;
    $("mCopy").onclick = async () => {
      try {
        await navigator.clipboard.writeText(x.password);
        toast("Password copied");
      } catch (e) {
        toast("Could not copy. Please copy manually.");
      }
    };
    const img = $("qrImg"),
      msg = $("qrMsg");
    try {
      await loadScript(QR_GEN_SRC);
      qrcode.stringToBytes = (str) => Array.from(new TextEncoder().encode(str));
      const qr = qrcode(0, "M");
      qr.addData(wifiPayload(x.ssid, x.password));
      qr.make();
      img.src = qr.createDataURL(6, 2);
      img.classList.remove("hidden");
      msg.remove();
    } catch (e) {
      msg.textContent = "Could not create the QR code (check your internet).";
    }
  }

  /* ---------- scan a Wi-Fi QR code to fill the add form ---------- */
  const JSQR_SRC = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
  let scanStream = null,
    scanTimer = 0,
    scanning = false,
    lastBad = "";
  function stopScanner() {
    scanning = false;
    clearTimeout(scanTimer);
    scanTimer = 0;
    if (scanStream) {
      scanStream.getTracks().forEach((t) => t.stop());
      scanStream = null;
    }
  }
  function handleScanned(text, status) {
    const w = parseWifiQR(text);
    if (!w) {
      if (status && lastBad !== text) {
        lastBad = text;
        status.textContent = "This is not a Wi-Fi QR code. Try another one…";
      }
      return false;
    }
    $("ssid").value = w.ssid.slice(0, 60);
    $("pass").value = w.password.slice(0, 80);
    closeModal();
    toast(
      w.password
        ? "QR scanned: name and password filled in"
        : "QR scanned: name filled in. This QR has no password.",
    );
    $("place").focus();
    return true;
  }
  async function scanFile(file, status) {
    status.textContent = "Reading image…";
    lastBad = "";
    try {
      await loadScript(JSQR_SRC);
      const url = URL.createObjectURL(file);
      const img = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = url;
      });
      URL.revokeObjectURL(url);
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.width * k);
      cv.height = Math.round(img.height * k);
      const cx = cv.getContext("2d");
      cx.drawImage(img, 0, 0, cv.width, cv.height);
      const d = cx.getImageData(0, 0, cv.width, cv.height);
      const code = jsQR(d.data, d.width, d.height, {
        inversionAttempts: "attemptBoth",
      });
      if (!code || !code.data) {
        status.textContent = "No QR code found in this image.";
        return;
      }
      handleScanned(code.data, status);
    } catch (e) {
      status.textContent = "Could not read this image.";
    }
  }
  async function openScanner() {
    lastBad = "";
    openModal(
      `
      <h2>Scan Wi-Fi QR code</h2>
      <p class="sub">Point the camera at the Wi-Fi QR code. The name and password will be filled in automatically.</p>
      <div class="qr-video"><video id="qrVideo" playsinline muted></video><div class="qr-frame"></div></div>
      <p id="qrStatus" class="muted">Starting camera…</p>
      <div class="actions">
        <button class="btn" id="qrUpload" type="button">Upload QR image</button>
        <button class="btn" id="qrCancel" type="button">Cancel</button>
      </div>
      <input id="qrFile" type="file" accept="image/*" class="hidden">`,
      stopScanner,
    );
    const status = $("qrStatus"),
      video = $("qrVideo");
    $("qrCancel").onclick = closeModal;
    $("qrUpload").onclick = () => $("qrFile").click();
    $("qrFile").onchange = async (e) => {
      const f = e.target.files[0];
      if (f) await scanFile(f, status);
      e.target.value = "";
    };
    try {
      await loadScript(JSQR_SRC);
    } catch (e) {
      status.textContent = "Could not load the QR scanner (check your internet).";
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      status.textContent =
        "Camera is not available here (HTTPS is required). You can upload a QR image instead.";
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
    } catch (e) {
      status.textContent =
        "Camera permission denied or unavailable. You can upload a QR image instead.";
      return;
    }
    if (!video.isConnected) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    scanStream = stream;
    video.srcObject = stream;
    try {
      await video.play();
    } catch (e) {}
    status.textContent = "Looking for a QR code…";
    scanning = true;
    const cv = document.createElement("canvas"),
      cx = cv.getContext("2d", { willReadFrequently: true });
    const tick = () => {
      if (!scanning) return;
      if (video.readyState >= 2 && video.videoWidth) {
        const k = Math.min(1, 640 / video.videoWidth);
        cv.width = Math.round(video.videoWidth * k);
        cv.height = Math.round(video.videoHeight * k);
        cx.drawImage(video, 0, 0, cv.width, cv.height);
        const d = cx.getImageData(0, 0, cv.width, cv.height);
        const code = jsQR(d.data, d.width, d.height, {
          inversionAttempts: "dontInvert",
        });
        if (code && code.data && handleScanned(code.data, status)) return;
      }
      scanTimer = setTimeout(tick, 120);
    };
    tick();
  }
  $("qrScanBtn").onclick = openScanner;

  /* ---------- add form ---------- */

  /* ---------- add form ---------- */
  let isSubmitting = false;

  $("addForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    if (isSubmitting) return;

    if (!addLoc) {
      toast("Set a location first (লোকেশন সেট করুন)");
      return;
    }

    const row = {
      ssid: $("ssid").value.trim(),
      password: $("pass").value.trim(),
      place: $("place").value.trim(),
      address: $("addr").value.trim() || null,
      lat: addLoc.lat,
      lng: addLoc.lng,
    };

    if (!row.ssid || !row.password || !row.place) {
      toast("Please fill all required fields");
      return;
    }

    const submitBtn = $("addForm").querySelector('button[type="submit"]');

    isSubmitting = true;
    submitBtn.disabled = true;

    try {
      const saved = await insertItem(row);

      $("addForm").reset();
      addrTouched = false;
      addLoc = null;

      if (pickMarker) {
        map.removeLayer(pickMarker);
        pickMarker = null;
      }

      $("addLocStatus").textContent = "Location not set";
      toast("WiFi added successfully");
      setTab("get");

      if (useSupabase) await load();
      else render();

      select(saved.id, true);
    } catch (err) {
      console.error(err);
      toast("Could not save: " + err.message);
    } finally {
      isSubmitting = false;
      submitBtn.disabled = false;
    }
  });

  $("search").oninput = render;
  $("radius").onchange = () => {
    if (!ref)
      toast(
        "Set a reference location first (Use my current location or search an area)",
      );
    updateRadius(true);
    render();
  };

  load();
})();
