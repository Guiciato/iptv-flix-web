const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const els = {
  toast: $("#toast"),
  loginScreen: $("#loginScreen"),
  appScreen: $("#appScreen"),
  xtreamTab: $("#xtreamTab"),
  m3uTab: $("#m3uTab"),
  xtreamForm: $("#xtreamForm"),
  m3uForm: $("#m3uForm"),
  backendUrl: $("#backendUrl"),
  apiPin: $("#apiPin"),
  m3uBackendUrl: $("#m3uBackendUrl"),
  m3uApiPin: $("#m3uApiPin"),
  categoryList: $("#categoryList"),
  grid: $("#grid"),
  searchInput: $("#searchInput"),
  loading: $("#loading"),
  emptyState: $("#emptyState"),
  hero: $("#hero"),
  currentListName: $("#currentListName"),
  accountStatus: $("#accountStatus"),
  detailPanel: $("#detailPanel"),
  detailContent: $("#detailContent"),
  closeDetail: $("#closeDetail"),
  logoutBtn: $("#logoutBtn"),
  refreshListBtn: $("#refreshListBtn"),
  proxyMode: $("#proxyMode"),
  playerOverlay: $("#playerOverlay"),
  video: $("#videoPlayer"),
  playerTitle: $("#playerTitle"),
  playerMeta: $("#playerMeta"),
  playPauseBtn: $("#playPauseBtn"),
  muteBtn: $("#muteBtn"),
  volume: $("#volume"),
  timeline: $("#timeline"),
  currentTime: $("#currentTime"),
  durationTime: $("#durationTime"),
  closePlayer: $("#closePlayer"),
  favoritePlayerBtn: $("#favoritePlayerBtn"),
  webCastBtn: $("#webCastBtn"),
  copyLinkBtn: $("#copyLinkBtn"),
  openExternalBtn: $("#openExternalBtn"),
  fullscreenBtn: $("#fullscreenBtn")
};

const storageKeys = {
  session: "iptvflixweb.session",
  favorites: "iptvflixweb.favorites",
  settings: "iptvflixweb.settings"
};

const DEFAULT_BACKEND_URL = "https://iptv-flix-web.onrender.com";

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

let hlsInstance = null;
let playerIdleTimer = null;
let searchTimer = null;
let webCastReady = false;

const state = {
  mode: "xtream",
  session: null,
  section: "live",
  activeCategory: "all",
  categories: { live: [], vod: [], series: [] },
  items: [],
  favorites: loadJSON(storageKeys.favorites, []),
  settings: loadJSON(storageKeys.settings, {}),
  currentMedia: null,
  cache: new Map()
};

function loadJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch (_) {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function showToast(message, ms = 3500) {
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.add("hidden"), ms);
}

function setLoading(value) {
  els.loading.classList.toggle("hidden", !value);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function normalizeServer(server) {
  let s = String(server || "").trim();
  if (!/^https?:\/\//i.test(s)) s = "http://" + s;
  return s.replace(/\/+$/, "");
}

function normalizeBackend(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function imageTag(src, title, className = "") {
  if (!src) return `<div class="placeholder ${className}">${escapeHTML((title || "IPTV").slice(0, 18))}</div>`;
  return `<img loading="lazy" src="${escapeHTML(src)}" alt="${escapeHTML(title)}" onerror="this.outerHTML='<div class=&quot;placeholder ${className}&quot;>${escapeHTML((title || "IPTV").slice(0, 18))}</div>'">`;
}

function formatDateFromUnix(value) {
  if (!value) return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  const date = new Date(num * 1000);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("pt-BR");
}

function secondsToTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function tryDecodeBase64(value) {
  if (!value || typeof value !== "string") return value || "";
  const clean = value.trim();
  if (!/^[A-Za-z0-9+/=]+$/.test(clean) || clean.length < 8) return value;
  try {
    const decoded = decodeURIComponent(escape(atob(clean)));
    const score = (decoded.match(/[a-zA-ZÀ-ÿ0-9 ]/g) || []).length / Math.max(decoded.length, 1);
    return score > 0.65 ? decoded : value;
  } catch (_) {
    return value;
  }
}

function apiBase() {
  return normalizeBackend(
    state.session?.backendUrl ||
    state.settings.backendUrl ||
    els.backendUrl.value ||
    els.m3uBackendUrl.value ||
    DEFAULT_BACKEND_URL
  );
}

async function apiPost(path, body) {
  const base = apiBase();
  if (!base) throw new Error("Informe a URL do backend.");

  const response = await fetch(base + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-pin": state.session?.apiPin || state.settings.apiPin || ""
    },
    body: JSON.stringify({
      ...body,
      pin: state.session?.apiPin || state.settings.apiPin || ""
    })
  });

  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) {
    throw new Error(json?.error || `Erro HTTP ${response.status}`);
  }

  return json;
}

async function xtream(action, extra = {}) {
  const s = state.session;
  const json = await apiPost("/api/xtream", {
    server: s.server,
    username: s.username,
    password: s.password,
    action,
    extra
  });
  return json.data;
}

function buildLiveUrl(item) {
  const s = state.session;
  if (item.url) return item.url;
  const output = s.output || "m3u8";
  return `${s.server}/live/${encodeURIComponent(s.username)}/${encodeURIComponent(s.password)}/${item.id}.${output}`;
}

function buildVodUrl(item) {
  const s = state.session;
  if (item.url) return item.url;
  const ext = item.ext || item.container_extension || "mp4";
  return `${s.server}/movie/${encodeURIComponent(s.username)}/${encodeURIComponent(s.password)}/${item.id}.${ext}`;
}

function buildEpisodeUrl(ep) {
  const s = state.session;
  if (ep.url) return ep.url;
  const ext = ep.container_extension || ep.ext || "mp4";
  return `${s.server}/series/${encodeURIComponent(s.username)}/${encodeURIComponent(s.password)}/${ep.id}.${ext}`;
}

function needsProxy(url) {
  if (els.proxyMode.checked) return true;
  const pageHttps = location.protocol === "https:";
  const mediaHttp = /^http:\/\//i.test(url);
  return pageHttps && mediaHttp;
}

function proxiedUrl(url) {
  const base = apiBase();
  const u = new URL(base + "/api/proxy");
  u.searchParams.set("url", url);
  if (url.toLowerCase().includes(".m3u8")) u.searchParams.set("playlist", "1");
  const pin = state.session?.apiPin || state.settings.apiPin || "";
  if (pin) u.searchParams.set("pin", pin);
  return u.toString();
}

function playbackUrl(url) {
  return needsProxy(url) ? proxiedUrl(url) : url;
}

function favoriteKey(item) {
  return `${item.type}:${item.id}`;
}

function isFavorite(item) {
  const key = favoriteKey(item);
  return state.favorites.some((fav) => favoriteKey(fav) === key);
}

function toggleFavorite(item) {
  const key = favoriteKey(item);

  if (isFavorite(item)) {
    state.favorites = state.favorites.filter((fav) => favoriteKey(fav) !== key);
    showToast("Removido dos favoritos.");
  } else {
    state.favorites.unshift(item);
    showToast("Adicionado aos favoritos.");
  }

  saveJSON(storageKeys.favorites, state.favorites);

  if (state.section === "favorites") renderFavorites();
}

function normalizeLive(item) {
  return {
    id: item.stream_id ?? item.id,
    title: item.name || item.title || "Canal",
    logo: item.stream_icon || item.logo || "",
    category_id: item.category_id || "",
    type: "live",
    raw: item
  };
}

function normalizeVod(item) {
  return {
    id: item.stream_id ?? item.id,
    title: item.name || item.title || "Filme",
    logo: item.stream_icon || item.cover || item.logo || "",
    category_id: item.category_id || "",
    type: "vod",
    ext: item.container_extension || item.ext || "mp4",
    rating: item.rating || "",
    raw: item
  };
}

function normalizeSeries(item) {
  return {
    id: item.series_id ?? item.id,
    title: item.name || item.title || "Série",
    logo: item.cover || item.stream_icon || item.logo || "",
    category_id: item.category_id || "",
    type: "series",
    plot: item.plot || "",
    raw: item
  };
}

function normalizeBySection(section, item) {
  if (section === "live") return normalizeLive(item);
  if (section === "vod") return normalizeVod(item);
  return normalizeSeries(item);
}

function getActionForSection(section) {
  if (section === "live") return "get_live_streams";
  if (section === "vod") return "get_vod_streams";
  if (section === "series") return "get_series";
  return "";
}

function getCategoryAction(section) {
  if (section === "live") return "get_live_categories";
  if (section === "vod") return "get_vod_categories";
  if (section === "series") return "get_series_categories";
  return "";
}

function splitM3UCategories(items, section) {
  const filtered = items.filter((item) => item.type === section);
  const map = new Map();

  for (const item of filtered) {
    const name = item.category_name || "Sem categoria";
    map.set(name, { category_id: name, category_name: name });
  }

  return [{ category_id: "all", category_name: "Todos" }, ...Array.from(map.values()).sort((a, b) => a.category_name.localeCompare(b.category_name))];
}

async function loadCategoriesForSection(section) {
  if (state.mode === "m3u" && state.session.m3uItems) {
    state.categories[section] = splitM3UCategories(state.session.m3uItems, section);
    return state.categories[section];
  }

  const cacheKey = `cat:${section}`;
  if (state.cache.has(cacheKey)) return state.cache.get(cacheKey);

  const data = await xtream(getCategoryAction(section));
  const categories = [{ category_id: "all", category_name: "Todos" }, ...(Array.isArray(data) ? data : [])];

  state.cache.set(cacheKey, categories);
  state.categories[section] = categories;

  return categories;
}

async function loadItemsForSection(section) {
  if (state.mode === "m3u" && state.session.m3uItems) {
    return state.session.m3uItems.filter((item) => item.type === section);
  }

  const cacheKey = `items:${section}`;
  if (state.cache.has(cacheKey)) return state.cache.get(cacheKey);

  const data = await xtream(getActionForSection(section));
  const items = (Array.isArray(data) ? data : []).map((item) => normalizeBySection(section, item));

  state.cache.set(cacheKey, items);
  return items;
}

function renderCategories(categories) {
  els.categoryList.innerHTML = "";

  for (const cat of categories) {
    const button = document.createElement("button");
    button.className = "category-btn" + (String(cat.category_id) === String(state.activeCategory) ? " active" : "");
    button.textContent = cat.category_name || "Sem categoria";
    button.title = cat.category_name || "";
    button.type = "button";
    button.addEventListener("click", () => {
      state.activeCategory = String(cat.category_id);
      renderCategories(categories);
      renderGrid();
    });
    els.categoryList.appendChild(button);
  }
}

function filteredItems() {
  const q = els.searchInput.value.trim().toLowerCase();

  return state.items.filter((item) => {
    const matchSearch = !q || item.title.toLowerCase().includes(q);
    const matchCat = state.activeCategory === "all" || String(item.category_id) === String(state.activeCategory);
    return matchSearch && matchCat;
  });
}

function cardSubtitle(item) {
  if (item.type === "live") return "Canal ao vivo";
  if (item.type === "vod") return item.rating ? `Filme • ⭐ ${item.rating}` : "Filme";
  if (item.type === "episode") return "Episódio";
  return "Série";
}

function renderGrid() {
  const items = filteredItems();
  const limit = 900;
  const visible = items.slice(0, limit);

  els.grid.innerHTML = "";
  els.emptyState.classList.toggle("hidden", items.length > 0);
  els.hero.classList.toggle("hidden", items.length > 0 || state.section === "favorites");

  const frag = document.createDocumentFragment();

  for (const item of visible) {
    const card = document.createElement("article");
    card.className = "card";

    const posterClass = item.type === "live" ? "poster channel" : "poster";
    card.innerHTML = `
      <div class="${posterClass}">${imageTag(item.logo, item.title, item.type === "live" ? "channel" : "")}</div>
      <div class="card-body">
        <div class="card-title">${escapeHTML(item.title)}</div>
        <div class="card-sub">${escapeHTML(cardSubtitle(item))}</div>
        <div class="card-actions">
          <button data-action="open" type="button">${item.type === "series" ? "Ver" : "Play"}</button>
          <button data-action="fav" type="button">${isFavorite(item) ? "★" : "☆"}</button>
        </div>
      </div>
    `;

    card.querySelector('[data-action="open"]').addEventListener("click", () => openItem(item));
    card.querySelector('[data-action="fav"]').addEventListener("click", (event) => {
      event.stopPropagation();
      toggleFavorite(item);
      renderGrid();
    });

    frag.appendChild(card);
  }

  els.grid.appendChild(frag);

  if (items.length > limit) {
    showToast(`Mostrando ${limit} de ${items.length}. Use a busca para filtrar melhor.`, 4500);
  }
}

async function changeSection(section) {
  state.section = section;
  state.activeCategory = "all";
  els.searchInput.value = "";
  els.detailPanel.classList.add("hidden");
  $$(".nav-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.section === section));

  if (section === "favorites") {
    renderFavorites();
    return;
  }

  setLoading(true);
  els.grid.innerHTML = "";
  els.emptyState.classList.add("hidden");

  try {
    const [categories, items] = await Promise.all([
      loadCategoriesForSection(section),
      loadItemsForSection(section)
    ]);

    state.items = items;
    renderCategories(categories);
    renderGrid();
  } catch (error) {
    showToast(error.message, 6000);
  } finally {
    setLoading(false);
  }
}

function renderFavorites() {
  state.items = state.favorites;
  els.categoryList.innerHTML = "<div class='category-btn active'>Todos os favoritos</div>";
  renderGrid();
}

async function openItem(item) {
  if (item.type === "series") return openSeries(item);
  if (item.type === "vod") return openVod(item);
  return openLive(item);
}

async function openLive(item) {
  els.detailPanel.classList.remove("hidden");
  els.detailContent.innerHTML = `<div class="loading">Carregando programação...</div>`;

  let epg = [];

  if (state.mode === "xtream") {
    try {
      const data = await xtream("get_short_epg", { stream_id: item.id, limit: 8 });
      epg = Array.isArray(data?.epg_listings) ? data.epg_listings : [];
    } catch (_) {}
  }

  const url = buildLiveUrl(item);

  els.detailContent.innerHTML = `
    <div class="detail-head channel">
      <div>${imageTag(item.logo, item.title, "channel")}</div>
      <div>
        <h2 class="detail-title">${escapeHTML(item.title)}</h2>
        <p class="detail-desc">Canal ao vivo. A programação aparece quando o servidor fornece EPG.</p>
        <div class="detail-actions">
          <button class="play" id="detailPlay" type="button">▶ Assistir</button>
          <button id="detailFav" type="button">${isFavorite(item) ? "★ Remover favorito" : "☆ Favoritar"}</button>
        </div>
      </div>
    </div>

    <h3>Programação</h3>
    <div class="epg-list">
      ${epg.length ? epg.map((program) => `
        <div class="epg-item">
          <strong>${escapeHTML(tryDecodeBase64(program.title || ""))}</strong><br>
          <span class="detail-desc">${escapeHTML(program.start || "")} — ${escapeHTML(program.end || "")}</span>
          <p class="detail-desc">${escapeHTML(tryDecodeBase64(program.description || ""))}</p>
        </div>
      `).join("") : "<p class='detail-desc'>Nenhuma programação retornada pelo servidor.</p>"}
    </div>
  `;

  $("#detailPlay").addEventListener("click", () => openPlayer({ ...item, url }, url));
  $("#detailFav").addEventListener("click", () => {
    toggleFavorite(item);
    openLive(item);
  });
}

async function openVod(item) {
  els.detailPanel.classList.remove("hidden");
  els.detailContent.innerHTML = `<div class="loading">Carregando sinopse...</div>`;

  let info = {};
  let movieData = {};

  if (state.mode === "xtream") {
    try {
      const data = await xtream("get_vod_info", { vod_id: item.id });
      info = data?.info || {};
      movieData = data?.movie_data || {};
    } catch (_) {}
  }

  const merged = {
    ...item,
    logo: info.movie_image || info.cover_big || item.logo,
    ext: movieData.container_extension || item.ext || "mp4"
  };

  const url = buildVodUrl(merged);
  const plot = info.plot || info.description || item.raw?.plot || "Sinopse não enviada pelo servidor.";

  els.detailContent.innerHTML = `
    <div class="detail-head">
      <div>${imageTag(merged.logo, item.title)}</div>
      <div>
        <h2 class="detail-title">${escapeHTML(item.title)}</h2>
        <p class="detail-desc">${escapeHTML(plot)}</p>
        <p class="detail-desc">
          ${info.genre ? `Gênero: ${escapeHTML(info.genre)}<br>` : ""}
          ${info.releaseDate ? `Lançamento: ${escapeHTML(info.releaseDate)}<br>` : ""}
          ${info.rating ? `Avaliação: ⭐ ${escapeHTML(info.rating)}<br>` : ""}
          ${info.duration ? `Duração: ${escapeHTML(info.duration)}` : ""}
        </p>
        <div class="detail-actions">
          <button class="play" id="detailPlay" type="button">▶ Assistir</button>
          <button id="detailFav" type="button">${isFavorite(item) ? "★ Remover favorito" : "☆ Favoritar"}</button>
        </div>
      </div>
    </div>
  `;

  $("#detailPlay").addEventListener("click", () => openPlayer({ ...merged, url }, url));
  $("#detailFav").addEventListener("click", () => {
    toggleFavorite(item);
    openVod(item);
  });
}

function makeEpisodeMedia(ep, seriesTitle, seasonNumber, cover) {
  const epTitle = ep.title || ep.name || `Episódio ${ep.episode_num || ""}`;
  const cleanTitle = `${seriesTitle} - T${String(seasonNumber).padStart(2, "0")}E${String(ep.episode_num || "").padStart(2, "0")} - ${epTitle}`;
  const thumb = ep.info?.movie_image || ep.info?.cover_big || cover;

  return {
    id: ep.id,
    title: cleanTitle,
    displayTitle: epTitle,
    container_extension: ep.container_extension,
    ext: ep.container_extension || "mp4",
    logo: thumb,
    type: "episode"
  };
}

async function openSeries(item) {
  els.detailPanel.classList.remove("hidden");
  els.detailContent.innerHTML = `<div class="loading">Carregando temporadas e episódios...</div>`;

  if (state.mode === "m3u") {
    const url = item.url;

    els.detailContent.innerHTML = `
      <div class="detail-head">
        <div>${imageTag(item.logo, item.title)}</div>
        <div>
          <h2 class="detail-title">${escapeHTML(item.title)}</h2>
          <p class="detail-desc">Link M3U detectado como série, mas sem metadados de temporada. Para temporadas completas, use login Xtream.</p>
          <div class="detail-actions">
            <button class="play" id="detailPlay" type="button">▶ Assistir</button>
            <button id="detailFav" type="button">${isFavorite(item) ? "★ Remover favorito" : "☆ Favoritar"}</button>
          </div>
        </div>
      </div>
    `;

    $("#detailPlay").addEventListener("click", () => openPlayer({ ...item, url }, url));
    $("#detailFav").addEventListener("click", () => toggleFavorite(item));
    return;
  }

  let data = {};

  try {
    data = await xtream("get_series_info", { series_id: item.id });
  } catch (error) {
    showToast(error.message, 6000);
  }

  const info = data?.info || {};
  const episodesBySeason = data?.episodes || {};
  const seasons = Object.keys(episodesBySeason).sort((a, b) => Number(a) - Number(b));
  const cover = info.cover || item.logo;

  els.detailContent.innerHTML = `
    <div class="detail-head">
      <div>${imageTag(cover, item.title)}</div>
      <div>
        <h2 class="detail-title">${escapeHTML(item.title)}</h2>
        <p class="detail-desc">${escapeHTML(info.plot || item.plot || "Sinopse não enviada pelo servidor.")}</p>
        <p class="detail-desc">
          ${info.genre ? `Gênero: ${escapeHTML(info.genre)}<br>` : ""}
          ${info.releaseDate ? `Lançamento: ${escapeHTML(info.releaseDate)}<br>` : ""}
          ${info.rating ? `Avaliação: ⭐ ${escapeHTML(info.rating)}` : ""}
        </p>
        <div class="detail-actions">
          <button id="detailFav" type="button">${isFavorite(item) ? "★ Remover favorito" : "☆ Favoritar"}</button>
        </div>
      </div>
    </div>

    ${seasons.length ? seasons.map((season) => `
      <div class="season-title">Temporada ${escapeHTML(season)}</div>
      <div class="episode-list">
        ${(episodesBySeason[season] || []).map((ep) => {
          const epMedia = makeEpisodeMedia(ep, item.title, season, cover);
          const url = buildEpisodeUrl(epMedia);
          const epForData = { ...epMedia, url };
          return `
            <div class="episode-item">
              ${imageTag(epMedia.logo, epMedia.displayTitle)}
              <div>
                <strong>${escapeHTML(epMedia.displayTitle)}</strong>
                <p class="detail-desc">${escapeHTML(ep.info?.plot || ep.info?.description || "Sem sinopse.")}</p>
              </div>
              <button class="pill-btn ep-play" type="button" data-ep='${escapeHTML(JSON.stringify(epForData))}'>▶ Assistir</button>
            </div>
          `;
        }).join("")}
      </div>
    `).join("") : "<p class='detail-desc'>Nenhum episódio retornado pelo servidor.</p>"}
  `;

  $("#detailFav").addEventListener("click", () => {
    toggleFavorite(item);
    openSeries(item);
  });

  $$(".ep-play").forEach((button) => {
    button.addEventListener("click", () => {
      const ep = JSON.parse(button.dataset.ep);
      openPlayer(ep, ep.url);
    });
  });
}


function getCastContentType(url) {
  const lower = String(url || "").toLowerCase();
  if (lower.includes(".m3u8")) return "application/x-mpegURL";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mkv")) return "video/x-matroska";
  if (lower.endsWith(".ts")) return "video/mp2t";
  return "video/mp4";
}

window.__onGCastApiAvailable = function(isAvailable) {
  if (!isAvailable || !window.cast || !window.chrome?.cast) return;

  try {
    const context = cast.framework.CastContext.getInstance();
    context.setOptions({
      receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
    });
    webCastReady = true;
  } catch (error) {
    console.warn("Cast Web init failed", error);
  }
};

async function castOrAirPlayCurrent() {
  if (!state.currentMedia?.url) return showToast("Nenhum vídeo aberto.");

  // Safari/iPhone: tenta AirPlay quando disponível.
  if (typeof els.video.webkitShowPlaybackTargetPicker === "function") {
    try {
      els.video.webkitShowPlaybackTargetPicker();
      showToast("Abrindo AirPlay.");
      return;
    } catch (_) {}
  }

  // Chrome/Android/PC: tenta Chromecast pelo Google Cast Web Sender.
  if (webCastReady && window.cast && window.chrome?.cast) {
    try {
      const context = cast.framework.CastContext.getInstance();
      let session = context.getCurrentSession();

      if (!session) {
        await context.requestSession();
        session = context.getCurrentSession();
      }

      const mediaUrl = playbackUrl(state.currentMedia.url);
      const mediaInfo = new chrome.cast.media.MediaInfo(mediaUrl, getCastContentType(mediaUrl));
      mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata();
      mediaInfo.metadata.title = state.currentMedia.title || "IPTV Flix";

      const request = new chrome.cast.media.LoadRequest(mediaInfo);
      await session.loadMedia(request);

      showToast("Enviado para o Chromecast.");
      return;
    } catch (error) {
      showToast("Não consegui iniciar o Chromecast. Vou copiar o link.", 5000);
    }
  }

  await navigator.clipboard?.writeText(playbackUrl(state.currentMedia.url)).catch(() => {});
  showToast("Cast não disponível neste navegador. Link copiado.");
}


function openPlayer(item, originalUrl) {
  state.currentMedia = { ...item, url: originalUrl };
  const url = playbackUrl(originalUrl);

  els.playerOverlay.classList.remove("hidden");
  els.playerOverlay.classList.remove("controls-hidden");
  els.playerTitle.textContent = item.title || "Reproduzindo";
  els.playerMeta.textContent = needsProxy(originalUrl) ? "Reproduzindo via proxy" : "Reproduzindo";
  els.favoritePlayerBtn.textContent = isFavorite(item) ? "★ Favorito" : "⭐ Favoritar";

  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }

  // Usamos controles próprios para poder esconder no celular após 5 segundos.
  els.video.controls = false;
  els.video.pause();
  els.video.removeAttribute("src");
  els.video.load();

  const lower = url.toLowerCase();

  if (!isIOS && !isSafari && lower.includes(".m3u8") && window.Hls && Hls.isSupported()) {
    hlsInstance = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 90
    });

    hlsInstance.loadSource(url);
    hlsInstance.attachMedia(els.video);
    hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
      console.warn("HLS error", data);
      if (data.fatal) {
        els.playerMeta.textContent = "Erro no HLS. Tente ativar o Proxy.";
      }
    });
  } else {
    els.video.src = url;
  }

  els.video.play().catch(() => {
    els.playerMeta.textContent = "Toque em Play para iniciar.";
  });

  resetPlayerIdleTimer();
}

function closePlayer() {
  els.video.pause();

  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }

  clearTimeout(playerIdleTimer);
  els.playerOverlay.classList.remove("controls-hidden");
  els.video.removeAttribute("src");
  els.video.load();
  els.playerOverlay.classList.add("hidden");
}

function resetPlayerIdleTimer() {
  if (els.playerOverlay.classList.contains("hidden")) return;

  els.playerOverlay.classList.remove("controls-hidden");
  clearTimeout(playerIdleTimer);

  playerIdleTimer = setTimeout(() => {
    if (!els.playerOverlay.classList.contains("hidden") && !els.video.paused) {
      els.playerOverlay.classList.add("controls-hidden");
    }
  }, 5000);
}

async function refreshList() {
  if (!state.session) return;

  const oldText = els.refreshListBtn.textContent;
  els.refreshListBtn.disabled = true;
  els.refreshListBtn.textContent = "Atualizando...";
  state.cache.clear();

  try {
    if (state.mode === "m3u" && state.session.m3uUrl) {
      const json = await apiPost("/api/m3u", { url: state.session.m3uUrl });
      state.session.m3uItems = json.items || [];
      if (state.session.rememberMe) saveJSON(storageKeys.session, state.session);
    }

    await changeSection(state.section === "favorites" ? "live" : state.section);
    showToast("Lista atualizada.");
  } catch (error) {
    showToast(error.message, 6000);
  } finally {
    els.refreshListBtn.disabled = false;
    els.refreshListBtn.textContent = oldText;
  }
}

function updateAccountUI() {
  const s = state.session;
  els.currentListName.textContent = s.listName || "Minha lista";

  if (s.userInfo) {
    const exp = formatDateFromUnix(s.userInfo.exp_date);
    const status = s.userInfo.status ? `Status: ${s.userInfo.status}` : "";
    const active = s.userInfo.active_cons ? `Conexões: ${s.userInfo.active_cons}/${s.userInfo.max_connections || "?"}` : "";
    els.accountStatus.textContent = `Vencimento: ${exp} ${status ? "• " + status : ""} ${active ? "• " + active : ""}`;
  } else {
    els.accountStatus.textContent = "Vencimento: não informado";
  }
}

async function loginWithXtream({ listName, server, username, password, backendUrl, apiPin, rememberMe }) {
  state.mode = "xtream";
  state.session = {
    listName,
    server: normalizeServer(server),
    username,
    password,
    backendUrl: normalizeBackend(backendUrl),
    apiPin: apiPin || "",
    output: "m3u8",
    rememberMe: !!rememberMe
  };

  state.settings.backendUrl = state.session.backendUrl;
  state.settings.apiPin = state.session.apiPin;
  saveJSON(storageKeys.settings, state.settings);

  const json = await apiPost("/api/xtream", {
    server: state.session.server,
    username,
    password
  });

  if (!json.data || json.data.user_info?.auth === 0) {
    throw new Error("Login não autorizado. Confira usuário, senha e servidor.");
  }

  state.session.userInfo = json.data.user_info || {};

  if (rememberMe) saveJSON(storageKeys.session, state.session);
  else localStorage.removeItem(storageKeys.session);

  afterLogin();
}

async function loginWithM3U({ listName, url, backendUrl, apiPin, rememberMe }) {
  state.mode = "m3u";
  state.session = {
    listName,
    m3uUrl: url,
    backendUrl: normalizeBackend(backendUrl),
    apiPin: apiPin || "",
    rememberMe: !!rememberMe
  };

  state.settings.backendUrl = state.session.backendUrl;
  state.settings.apiPin = state.session.apiPin;
  saveJSON(storageKeys.settings, state.settings);

  const json = await apiPost("/api/m3u", { url });

  if (!json.items?.length) {
    throw new Error("Não encontrei itens no link M3U.");
  }

  state.session.m3uItems = json.items;

  if (json.inferred) {
    state.session.server = normalizeServer(json.inferred.server);
    state.session.username = json.inferred.username;
    state.session.password = json.inferred.password;
    state.session.output = json.inferred.output || "m3u8";

    try {
      const loginJson = await apiPost("/api/xtream", {
        server: state.session.server,
        username: state.session.username,
        password: state.session.password
      });
      state.session.userInfo = loginJson.data?.user_info || null;
    } catch (_) {}
  }

  if (rememberMe) saveJSON(storageKeys.session, state.session);
  else localStorage.removeItem(storageKeys.session);

  afterLogin();
}

function afterLogin() {
  els.loginScreen.classList.add("hidden");
  els.appScreen.classList.remove("hidden");
  updateAccountUI();
  state.cache.clear();
  changeSection("live");
}

function clearLoginForms() {
  $("#listName").value = "";
  $("#username").value = "";
  $("#password").value = "";
  $("#server").value = "";
  $("#m3uListName").value = "";
  $("#m3uUrl").value = "";
  $("#rememberXtream").checked = false;
  $("#rememberM3U").checked = false;
  applySavedAdvancedSettings();
}

function logout() {
  closePlayer();
  localStorage.removeItem(storageKeys.session);
  state.session = null;
  state.items = [];
  state.cache.clear();
  clearLoginForms();
  els.appScreen.classList.add("hidden");
  els.loginScreen.classList.remove("hidden");
  els.xtreamTab.click();
}


function syncAdvancedFields(source = "xtream") {
  const backend = normalizeBackend(
    source === "m3u" ? els.m3uBackendUrl.value : els.backendUrl.value
  ) || DEFAULT_BACKEND_URL;

  const pin = source === "m3u" ? els.m3uApiPin.value : els.apiPin.value;

  els.backendUrl.value = backend;
  els.m3uBackendUrl.value = backend;
  els.apiPin.value = pin;
  els.m3uApiPin.value = pin;

  state.settings.backendUrl = backend;
  state.settings.apiPin = pin || "";
  saveJSON(storageKeys.settings, state.settings);
}

function applySavedAdvancedSettings() {
  const backend = normalizeBackend(state.settings.backendUrl || DEFAULT_BACKEND_URL);
  const pin = state.settings.apiPin || "";

  els.backendUrl.value = backend;
  els.m3uBackendUrl.value = backend;
  els.apiPin.value = pin;
  els.m3uApiPin.value = pin;
}

function bindEvents() {
  applySavedAdvancedSettings();

  els.xtreamTab.addEventListener("click", () => {
    els.xtreamTab.classList.add("active");
    els.m3uTab.classList.remove("active");
    els.xtreamForm.classList.remove("hidden");
    els.m3uForm.classList.add("hidden");
  });

  els.m3uTab.addEventListener("click", () => {
    els.m3uTab.classList.add("active");
    els.xtreamTab.classList.remove("active");
    els.m3uForm.classList.remove("hidden");
    els.xtreamForm.classList.add("hidden");
  });

  els.backendUrl.addEventListener("change", () => syncAdvancedFields("xtream"));
  els.apiPin.addEventListener("change", () => syncAdvancedFields("xtream"));
  els.m3uBackendUrl.addEventListener("change", () => syncAdvancedFields("m3u"));
  els.m3uApiPin.addEventListener("change", () => syncAdvancedFields("m3u"));

  els.xtreamForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setLoading(true);

    try {
      syncAdvancedFields("xtream");
      await loginWithXtream({
        backendUrl: $("#backendUrl").value,
        apiPin: $("#apiPin").value,
        listName: $("#listName").value.trim(),
        username: $("#username").value.trim(),
        password: $("#password").value.trim(),
        server: $("#server").value.trim(),
        rememberMe: $("#rememberXtream").checked
      });
    } catch (error) {
      showToast(error.message, 6000);
    } finally {
      setLoading(false);
    }
  });

  els.m3uForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setLoading(true);

    try {
      syncAdvancedFields("m3u");
      await loginWithM3U({
        backendUrl: $("#m3uBackendUrl").value,
        apiPin: $("#m3uApiPin").value,
        listName: $("#m3uListName").value.trim(),
        url: $("#m3uUrl").value.trim(),
        rememberMe: $("#rememberM3U").checked
      });
    } catch (error) {
      showToast(error.message, 6000);
    } finally {
      setLoading(false);
    }
  });

  $$(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => changeSection(btn.dataset.section));
  });

  els.searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderGrid, 160);
  });

  els.closeDetail.addEventListener("click", () => els.detailPanel.classList.add("hidden"));
  els.logoutBtn.addEventListener("click", logout);
  els.refreshListBtn.addEventListener("click", refreshList);

  els.proxyMode.addEventListener("change", () => {
    showToast(els.proxyMode.checked ? "Proxy ativado." : "Proxy automático ativado.");
  });

  els.closePlayer.addEventListener("click", closePlayer);

  els.playPauseBtn.addEventListener("click", () => {
    if (els.video.paused) els.video.play();
    else els.video.pause();
    resetPlayerIdleTimer();
  });

  els.video.addEventListener("play", () => {
    els.playPauseBtn.textContent = "⏸";
    resetPlayerIdleTimer();
  });

  els.video.addEventListener("pause", () => {
    els.playPauseBtn.textContent = "▶";
    els.playerOverlay.classList.remove("controls-hidden");
  });

  els.video.addEventListener("timeupdate", () => {
    const duration = els.video.duration;
    const current = els.video.currentTime;

    els.currentTime.textContent = secondsToTime(current);

    if (Number.isFinite(duration)) {
      els.durationTime.textContent = secondsToTime(duration);
      els.timeline.disabled = false;
      els.timeline.value = String((current / duration) * 100 || 0);
    } else {
      els.durationTime.textContent = "AO VIVO";
      els.timeline.disabled = true;
      els.timeline.value = "100";
    }
  });

  els.timeline.addEventListener("input", () => {
    if (Number.isFinite(els.video.duration)) {
      els.video.currentTime = (Number(els.timeline.value) / 100) * els.video.duration;
    }
    resetPlayerIdleTimer();
  });

  els.volume.addEventListener("input", () => {
    els.video.volume = Number(els.volume.value);
    els.video.muted = els.video.volume === 0;
    els.muteBtn.textContent = els.video.muted ? "🔇" : "🔊";
    resetPlayerIdleTimer();
  });

  els.muteBtn.addEventListener("click", () => {
    els.video.muted = !els.video.muted;
    els.muteBtn.textContent = els.video.muted ? "🔇" : "🔊";
    resetPlayerIdleTimer();
  });

  els.favoritePlayerBtn.addEventListener("click", () => {
    if (!state.currentMedia) return;
    toggleFavorite(state.currentMedia);
    els.favoritePlayerBtn.textContent = isFavorite(state.currentMedia) ? "★ Favorito" : "⭐ Favoritar";
  });

  els.webCastBtn.addEventListener("click", castOrAirPlayCurrent);

  els.copyLinkBtn.addEventListener("click", async () => {
    if (!state.currentMedia?.url) return;
    await navigator.clipboard.writeText(state.currentMedia.url).catch(() => {});
    showToast("Link copiado.");
  });

  els.openExternalBtn.addEventListener("click", () => {
    if (state.currentMedia?.url) window.open(state.currentMedia.url, "_blank", "noopener");
  });

  els.fullscreenBtn.addEventListener("click", async () => {
    resetPlayerIdleTimer();

    try {
      // iPhone/Safari: fullscreen real do vídeo.
      if (typeof els.video.webkitEnterFullscreen === "function") {
        els.video.webkitEnterFullscreen();
        return;
      }

      // Android/Chrome/PC: fullscreen da área do player.
      const shell = document.querySelector(".player-shell");
      if (!document.fullscreenElement) {
        await shell.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch (_) {
      showToast("Tela cheia não disponível neste navegador.");
    }
  });

  els.playerOverlay.addEventListener("mousemove", resetPlayerIdleTimer);
  els.playerOverlay.addEventListener("click", resetPlayerIdleTimer);
  els.playerOverlay.addEventListener("touchstart", resetPlayerIdleTimer, { passive: true });
  els.playerOverlay.addEventListener("touchend", resetPlayerIdleTimer, { passive: true });
  els.video.addEventListener("touchstart", resetPlayerIdleTimer, { passive: true });
  els.video.addEventListener("click", resetPlayerIdleTimer);

  document.addEventListener("keydown", (event) => {
    if (!els.playerOverlay.classList.contains("hidden")) {
      resetPlayerIdleTimer();
      if (event.code === "Space") {
        event.preventDefault();
        if (els.video.paused) els.video.play();
        else els.video.pause();
      }
      if (event.code === "Escape") closePlayer();
    }
  });
}

function restoreSession() {
  const saved = loadJSON(storageKeys.session, null);

  if (!saved || saved.rememberMe !== true) {
    localStorage.removeItem(storageKeys.session);
    return;
  }

  state.session = saved;
  state.mode = saved.m3uItems ? "m3u" : "xtream";
  afterLogin();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

bindEvents();
restoreSession();
