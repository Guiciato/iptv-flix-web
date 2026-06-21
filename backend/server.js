require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const axios = require("axios");
const { URL } = require("url");

const app = express();
const PORT = process.env.PORT || 3000;
const API_PIN = process.env.API_PIN || "";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "";

app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: false
}));
app.use(compression());
app.use(express.json({ limit: "2mb" }));

app.use(cors({
  origin: FRONTEND_ORIGIN ? FRONTEND_ORIGIN : true,
  credentials: false
}));

function okUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_) {
    return false;
  }
}

function normalizeServer(server) {
  if (!server) throw new Error("Servidor vazio.");
  let s = String(server).trim();
  if (!/^https?:\/\//i.test(s)) s = "http://" + s;
  return s.replace(/\/+$/, "");
}

function requirePin(req, res, next) {
  if (!API_PIN) return next();

  const sentPin =
    req.headers["x-api-pin"] ||
    req.query.pin ||
    req.body?.pin ||
    "";

  if (String(sentPin) !== String(API_PIN)) {
    return res.status(401).json({
      ok: false,
      error: "PIN do backend inválido."
    });
  }

  next();
}

function makeXtreamUrl({ server, username, password, action, extra = {} }) {
  const base = normalizeServer(server);
  const url = new URL(base + "/player_api.php");
  url.searchParams.set("username", username || "");
  url.searchParams.set("password", password || "");

  if (action) url.searchParams.set("action", action);

  for (const [key, value] of Object.entries(extra || {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function basicHeaders(extra = {}) {
  return {
    "User-Agent": "Mozilla/5.0 IPTV-Flix-Web/1.0",
    "Accept": "*/*",
    ...extra
  };
}

function parseM3U(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const items = [];
  let info = null;

  function attr(name, str) {
    const regex = new RegExp(`${name}="([^"]*)"`, "i");
    const match = str.match(regex);
    return match ? match[1] : "";
  }

  for (const line of lines) {
    if (line.startsWith("#EXTINF")) {
      const commaIndex = line.indexOf(",");
      info = {
        title: commaIndex >= 0 ? line.slice(commaIndex + 1).trim() : "Sem título",
        logo: attr("tvg-logo", line),
        category: attr("group-title", line) || "Sem categoria",
        tvgName: attr("tvg-name", line)
      };
      continue;
    }

    if (!line.startsWith("#") && info) {
      const mediaUrl = line;
      const lower = mediaUrl.toLowerCase();

      let type = "live";
      if (/\/movie\/|\.mp4|\.mkv|\.avi|\.mov|\.m4v/.test(lower)) type = "vod";
      if (/\/series\//.test(lower)) type = "series";

      items.push({
        id: `${type}-${items.length}-${Buffer.from(mediaUrl).toString("base64url").slice(0, 14)}`,
        title: info.tvgName || info.title,
        logo: info.logo,
        category_name: info.category,
        category_id: info.category,
        type,
        url: mediaUrl
      });

      info = null;
    }
  }

  return items;
}

function inferXtreamFromM3U(m3uUrl) {
  try {
    const url = new URL(m3uUrl);
    const username = url.searchParams.get("username");
    const password = url.searchParams.get("password");
    const output = url.searchParams.get("output") || "m3u8";

    if (!username || !password) return null;

    return {
      server: `${url.protocol}//${url.host}`,
      username,
      password,
      output
    };
  } catch (_) {
    return null;
  }
}

function proxyUrlFor(req, target, playlist = false) {
  const base = `${req.protocol}://${req.get("host")}/api/proxy`;
  const url = new URL(base);
  url.searchParams.set("url", target);
  if (playlist) url.searchParams.set("playlist", "1");
  if (API_PIN) url.searchParams.set("pin", API_PIN);
  return url.toString();
}

function isPlaylistUrl(url) {
  const clean = String(url || "").split("?")[0].toLowerCase();
  return clean.endsWith(".m3u8") || clean.endsWith(".m3u");
}

function rewriteM3U8(text, originalUrl, req) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        if (trimmed.startsWith("#EXT-X-KEY") && trimmed.includes("URI=")) {
          return trimmed.replace(/URI="([^"]+)"/, (_m, uri) => {
            const abs = new URL(uri, originalUrl).toString();
            return `URI="${proxyUrlFor(req, abs, false)}"`;
          });
        }
        return line;
      }

      const abs = new URL(trimmed, originalUrl).toString();
      return proxyUrlFor(req, abs, isPlaylistUrl(abs));
    })
    .join("\n");
}

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    name: "IPTV Flix Backend",
    status: "online"
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, status: "online" });
});

app.post("/api/xtream", requirePin, async (req, res) => {
  try {
    const { server, username, password, action, extra } = req.body || {};

    const url = makeXtreamUrl({
      server,
      username,
      password,
      action,
      extra
    });

    const response = await axios.get(url, {
      timeout: 25000,
      responseType: "json",
      validateStatus: () => true,
      headers: basicHeaders()
    });

    if (response.status < 200 || response.status >= 300) {
      return res.status(response.status).json({
        ok: false,
        error: `Servidor respondeu HTTP ${response.status}`
      });
    }

    res.json({
      ok: true,
      data: response.data
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "Erro ao conectar no servidor Xtream."
    });
  }
});

app.post("/api/m3u", requirePin, async (req, res) => {
  try {
    const { url } = req.body || {};

    if (!okUrl(url)) {
      return res.status(400).json({
        ok: false,
        error: "Link M3U inválido."
      });
    }

    const response = await axios.get(url, {
      timeout: 30000,
      responseType: "text",
      validateStatus: () => true,
      headers: basicHeaders()
    });

    if (response.status < 200 || response.status >= 300) {
      return res.status(response.status).json({
        ok: false,
        error: `HTTP ${response.status} ao baixar M3U`
      });
    }

    const items = parseM3U(response.data);
    const inferred = inferXtreamFromM3U(url);

    res.json({
      ok: true,
      inferred,
      count: items.length,
      items
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "Erro ao carregar M3U."
    });
  }
});

app.get("/api/proxy", requirePin, async (req, res) => {
  try {
    const target = req.query.url;
    const playlistMode = req.query.playlist === "1";

    if (!okUrl(target)) {
      return res.status(400).send("URL inválida.");
    }

    const range = req.headers.range;

    if (playlistMode || isPlaylistUrl(target)) {
      const response = await axios.get(target, {
        timeout: 30000,
        responseType: "text",
        validateStatus: () => true,
        headers: basicHeaders()
      });

      if (response.status < 200 || response.status >= 300) {
        return res.status(response.status).send(`HTTP ${response.status}`);
      }

      const rewritten = rewriteM3U8(response.data, target, req);

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-store");
      return res.send(rewritten);
    }

    const response = await axios.get(target, {
      responseType: "stream",
      timeout: 30000,
      validateStatus: () => true,
      headers: basicHeaders(range ? { Range: range } : {})
    });

    res.status(response.status);

    const contentType = response.headers["content-type"] || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "no-store");

    for (const header of ["content-length", "content-range"]) {
      if (response.headers[header]) res.setHeader(header, response.headers[header]);
    }

    response.data.pipe(res);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).send(error.message || "Erro no proxy.");
    } else {
      res.end();
    }
  }
});

app.listen(PORT, () => {
  console.log(`IPTV Flix Backend online na porta ${PORT}`);
});
