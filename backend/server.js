import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import morgan from "morgan";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { createCanvas, loadImage, registerFont } from "canvas";
import QRCode from "qrcode";
import { initDb, getPool } from "./db.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5000;
const DB_CONFIG = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "glamers_gathering_db",
};

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@123";
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || "GkdsdnJsssm@232";
const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN ||
  "http://localhost:5174,http://localhost:5173,http://localhost:5175,http://localhost:3000,http://localhost:5176";
const ALLOWED_ORIGINS = FRONTEND_ORIGIN.split(",")
  .map((origin) => origin.trim().replace(/^["']|["']$/g, ""))
  .filter(Boolean);
const ALLOW_ALL_ORIGINS = ALLOWED_ORIGINS.includes("*");

const TICKET_TEMPLATE_PATH = path.join(__dirname, "templates", "ticket.png");
const TICKET_FONT_PATH = path.join(
  __dirname,
  "templates",
  "fonts",
  "Montserrat-wght.ttf"
);
let ticketFontRegistered = false;

function ensureTicketFont() {
  if (ticketFontRegistered) return;
  try {
    registerFont(TICKET_FONT_PATH, { family: "Montserrat" });
    ticketFontRegistered = true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("Ticket font not registered, falling back to system font.", err);
  }
}

const TARGETS = {
  audience: 250,
  models: 30,
  "makeup-artists": 30,
  "stall-owners": 20,
};

const CATEGORY_MAP = {
  audience: {
    table: "audience_submissions",
    label: "Audience",
    countColumn: "tickets",
    searchColumns: ["full_name", "contact_number", "email", "ticket_code"],
  },
  models: {
    table: "model_submissions",
    label: "Models",
    countColumn: null,
    searchColumns: ["full_name", "contact_number", "email", "outfit_description"],
  },
  "makeup-artists": {
    table: "makeup_artist_submissions",
    label: "Makeup Artists",
    countColumn: null,
    searchColumns: ["full_name", "contact_number", "email", "specialization"],
  },
  "stall-owners": {
    table: "stall_submissions",
    label: "Stall Owners",
    countColumn: null,
    searchColumns: [
      "business_name",
      "owner_name",
      "contact_number",
      "email",
      "business_description",
    ],
  },
};

const app = express();
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (ALLOW_ALL_ORIGINS) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));
app.use("/templates", express.static("templates"));

function getString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function toInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.trunc(num);
}

function extractToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }
  if (typeof req.query?.token === "string" && req.query.token.trim()) {
    return req.query.token.trim();
  }
  return null;
}

function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

// ==========================================
// REAL-TIME EVENT STREAMING (SSE HUB)
// ==========================================
const publicSseClients = new Set();
const adminSseClients = new Set();

function sendSseMessage(res, eventName, data) {
  try {
    res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch (err) {
    // client might have disconnected
  }
}

function broadcastPublic(eventName, data) {
  for (const client of publicSseClients) {
    sendSseMessage(client, eventName, data);
  }
}

function broadcastAdmin(eventName, data) {
  for (const client of adminSseClients) {
    sendSseMessage(client, eventName, data);
  }
}

// Heartbeat every 25 seconds to keep HTTP connections alive through proxies
const sseHeartbeat = setInterval(() => {
  for (const client of publicSseClients) {
    try {
      client.write(": ping\n\n");
    } catch {
      publicSseClients.delete(client);
    }
  }
  for (const client of adminSseClients) {
    try {
      client.write(": ping\n\n");
    } catch {
      adminSseClients.delete(client);
    }
  }
}, 25000);
if (typeof sseHeartbeat.unref === "function") {
  sseHeartbeat.unref();
}

async function ensureAdminUser() {
  const pool = getPool();
  const [rows] = await pool.query(
    "SELECT id FROM admin_users WHERE username = ? LIMIT 1",
    [ADMIN_USERNAME]
  );

  if (!rows.length) {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await pool.query(
      "INSERT INTO admin_users (username, password_hash) VALUES (?, ?)",
      [ADMIN_USERNAME, hash]
    );
  }
}

async function getDailyCounts(pool, table, countColumn) {
  const countExpr = countColumn ? `SUM(${countColumn})` : "COUNT(*)";
  const [rows] = await pool.query(
    `SELECT DATE(created_at) AS day, ${countExpr} AS count
     FROM ${table}
     WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
     GROUP BY DATE(created_at)
     ORDER BY day`
  );

  const map = new Map();
  rows.forEach((row) => {
    const key = new Date(row.day).toISOString().slice(0, 10);
    map.set(key, Number(row.count) || 0);
  });

  const result = [];
  const today = new Date();
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, count: map.get(key) || 0 });
  }

  return result;
}

async function getOverallDailyCounts(pool) {
  const [rows] = await pool.query(
    `SELECT DATE(created_at) AS day, SUM(weight) AS count
     FROM (
       SELECT created_at, tickets AS weight FROM audience_submissions
       UNION ALL
       SELECT created_at, 1 AS weight FROM model_submissions
       UNION ALL
       SELECT created_at, 1 AS weight FROM makeup_artist_submissions
       UNION ALL
       SELECT created_at, 1 AS weight FROM stall_submissions
     ) AS all_rows
     WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
     GROUP BY DATE(created_at)
     ORDER BY day`
  );

  const map = new Map();
  rows.forEach((row) => {
    const key = new Date(row.day).toISOString().slice(0, 10);
    map.set(key, Number(row.count) || 0);
  });

  const result = [];
  const today = new Date();
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, count: map.get(key) || 0 });
  }

  return result;
}

async function getCountsAndRemaining(pool) {
  const counts = {};

  for (const key of Object.keys(CATEGORY_MAP)) {
    const { table, countColumn } = CATEGORY_MAP[key];
    const countExpr = countColumn ? `COALESCE(SUM(${countColumn}), 0)` : "COUNT(*)";
    const [rows] = await pool.query(
      `SELECT ${countExpr} AS count FROM ${table}`
    );
    counts[key] = Number(rows[0].count) || 0;
  }

  const total = Object.values(counts).reduce((sum, val) => sum + val, 0);
  const remaining = {};
  for (const key of Object.keys(counts)) {
    remaining[key] = Math.max(0, (TARGETS[key] || 0) - counts[key]);
  }

  return { counts, remaining, total };
}

async function getEntryStats(pool) {
  const [countRows] = await pool.query(
    "SELECT COUNT(*) AS count, SUM(tickets) AS ticket_sum FROM audience_entries"
  );
  const row = countRows?.[0] || {};
  return {
    entryCount: Number(row.count) || 0,
    entryTickets: Number(row.ticket_sum) || 0,
  };
}

async function getRecentActivity(pool, limit = 25) {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM (
        SELECT 'audience' AS category, id, full_name, tickets, contact_number, email, ticket_code, created_at AS timestamp, 'New Audience Booking' AS action_label
        FROM audience_submissions
        UNION ALL
        SELECT 'models' AS category, id, full_name, 1 AS tickets, contact_number, email, NULL AS ticket_code, created_at AS timestamp, 'New Model Application' AS action_label
        FROM model_submissions
        UNION ALL
        SELECT 'makeup-artists' AS category, id, full_name, 1 AS tickets, contact_number, email, NULL AS ticket_code, created_at AS timestamp, 'New Makeup Artist Application' AS action_label
        FROM makeup_artist_submissions
        UNION ALL
        SELECT 'stall-owners' AS category, id, business_name AS full_name, 1 AS tickets, contact_number, email, NULL AS ticket_code, created_at AS timestamp, 'New Stall Application' AS action_label
        FROM stall_submissions
        UNION ALL
        SELECT 'checkin' AS category, id, full_name, tickets, contact_number, email, ticket_code, scanned_at AS timestamp, 'Audience Gate Check-in' AS action_label
        FROM audience_entries
      ) AS unified_activity
      ORDER BY timestamp DESC LIMIT ?`,
      [limit]
    );
    return rows;
  } catch (err) {
    console.error("Failed to fetch activity", err);
    return [];
  }
}

async function broadcastStatsAndSlotUpdate(pool, recentAction = null) {
  try {
    const { counts, remaining, total } = await getCountsAndRemaining(pool);
    const { entryCount, entryTickets } = await getEntryStats(pool);
    broadcastPublic("slot_update", {
      counts,
      remaining,
      targets: TARGETS,
      total,
      updatedAt: new Date().toISOString(),
    });
    broadcastAdmin("stats_updated", {
      counts,
      remaining,
      targets: TARGETS,
      total,
      entryCount,
      entryTickets,
      action: recentAction,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Failed to broadcast stats", err);
  }
}

async function checkInTicket(code, scannedBy = null) {
  const pool = getPool();
  const [audienceRows] = await pool.query(
    "SELECT id, full_name, tickets, contact_number, email, ticket_code FROM audience_submissions WHERE ticket_code = ? LIMIT 1",
    [code]
  );
  if (!audienceRows.length) {
    return {
      ok: false,
      status: "invalid",
      message: "Invalid Ticket",
    };
  }

  const [existingRows] = await pool.query(
    "SELECT * FROM audience_entries WHERE ticket_code = ? LIMIT 1",
    [code]
  );
  if (existingRows.length) {
    return {
      ok: true,
      status: "already",
      message: "Already Checked In",
      entry: existingRows[0],
    };
  }

  const ticket = audienceRows[0];
  await pool.query(
    "INSERT INTO audience_entries (ticket_code, audience_id, full_name, tickets, contact_number, email, scanned_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      ticket.ticket_code,
      ticket.id,
      ticket.full_name,
      ticket.tickets,
      ticket.contact_number,
      ticket.email,
      scannedBy,
    ]
  );

  const [entryRows] = await pool.query(
    "SELECT * FROM audience_entries WHERE ticket_code = ? LIMIT 1",
    [code]
  );

  const checkedEntry = entryRows[0];
  const stats = await getEntryStats(pool);
  const { counts, remaining, total } = await getCountsAndRemaining(pool);

  broadcastAdmin("checkin", {
    ok: true,
    status: "checked-in",
    entry: checkedEntry,
    entryCount: stats.entryCount,
    entryTickets: stats.entryTickets,
    remainingAudience: remaining.audience,
    timestamp: new Date().toISOString(),
  });

  return {
    ok: true,
    status: "checked-in",
    message: "Check-in Success",
    entry: checkedEntry,
  };
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get("/api/public/remaining", async (req, res) => {
  try {
    const pool = getPool();
    const { remaining, counts, total } = await getCountsAndRemaining(pool);
    return res.json({ remaining, counts, targets: TARGETS, total });
  } catch (err) {
    return res.status(500).json({ error: "Failed to load counts" });
  }
});

// SSE endpoint for public landing page real-time availability updates
app.get("/api/realtime/public", async (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  publicSseClients.add(res);

  try {
    const pool = getPool();
    const { remaining, counts, total } = await getCountsAndRemaining(pool);
    sendSseMessage(res, "init", {
      remaining,
      counts,
      targets: TARGETS,
      total,
      connectedAt: new Date().toISOString(),
    });
  } catch (err) {
    // ignore
  }

  req.on("close", () => {
    publicSseClients.delete(res);
  });
});

// SSE endpoint for authenticated admin panel real-time stream
app.get("/api/realtime/admin", async (req, res) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  adminSseClients.add(res);

  try {
    const pool = getPool();
    const { remaining, counts, total } = await getCountsAndRemaining(pool);
    const { entryCount, entryTickets } = await getEntryStats(pool);
    const recentActivity = await getRecentActivity(pool, 20);

    sendSseMessage(res, "init", {
      counts,
      remaining,
      targets: TARGETS,
      total,
      entryCount,
      entryTickets,
      recentActivity,
      connectedAt: new Date().toISOString(),
    });
  } catch (err) {
    // ignore
  }

  req.on("close", () => {
    adminSseClients.delete(res);
  });
});

// Fast Ticket Verification endpoint
app.get("/api/tickets/verify/:code", async (req, res) => {
  const code = getString(req.params.code);
  if (!code) {
    return res.status(400).json({ valid: false, message: "Missing ticket code" });
  }

  try {
    const pool = getPool();
    const [subRows] = await pool.query(
      "SELECT id, full_name, tickets, contact_number, email, ticket_code, created_at FROM audience_submissions WHERE ticket_code = ? LIMIT 1",
      [code]
    );

    if (!subRows.length) {
      return res.status(404).json({
        valid: false,
        message: `Ticket "${code}" not found. Please verify the code.`,
      });
    }

    const ticket = subRows[0];
    const [entryRows] = await pool.query(
      "SELECT * FROM audience_entries WHERE ticket_code = ? LIMIT 1",
      [code]
    );

    const checkedIn = entryRows.length > 0;
    return res.json({
      valid: true,
      checkedIn,
      ticket: {
        id: ticket.id,
        fullName: ticket.full_name,
        tickets: Number(ticket.tickets) || 1,
        contactNumber: ticket.contact_number,
        email: ticket.email,
        ticketCode: ticket.ticket_code,
        createdAt: ticket.created_at,
      },
      entry: checkedIn ? entryRows[0] : null,
      message: checkedIn
        ? `Already Checked In (${ticket.full_name})`
        : `Valid Ticket (${ticket.full_name} - ${ticket.tickets} Tickets)`,
    });
  } catch (err) {
    return res.status(500).json({ valid: false, message: "Failed to verify ticket" });
  }
});

app.get("/api/tickets/:code.png", async (req, res) => {
  const code = getString(req.params.code);
  if (!code) {
    return res.status(400).json({ error: "Missing ticket code" });
  }

  try {
    const pool = getPool();
    const [rows] = await pool.query(
      "SELECT full_name, ticket_code, tickets, contact_number, email, created_at FROM audience_submissions WHERE ticket_code = ? LIMIT 1",
      [code]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    const ticket = rows[0];
    ensureTicketFont();

    // 1. Setup Canvas (Wider aspect ratio for a modern pass look)
    const width = 1400;
    const height = 500;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // 2. Design Configuration
    const colors = {
      bg: "#501122",       // Deep Slate Blue
      cardBg: "#574144",   // Lighter Slate for contrast
      accent: "#004a41",   // Amber/Gold
      textMain: "#f8fafc", // White
      textMuted: "#0e7c71", // Gray
      border: "#bfa5a8"    // Subtle border
    };

    // Helper: Draw Rounded Rectangle
    const roundRect = (x, y, w, h, r) => {
      if (w < 2 * r) r = w / 2;
      if (h < 2 * r) r = h / 2;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };

    // 3. Draw Main Background
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, height);

    // 4. Draw Left Accent Bar
    ctx.fillStyle = colors.accent;
    roundRect(20, 20, 15, height - 40, 8);
    ctx.fill();

    // 5. Draw Header Section
    ctx.font = "bold 42px 'Montserrat'";
    ctx.fillStyle = colors.textMain;
    ctx.fillText("GLAMOUR GATHERINGS", 70, 80);

    ctx.font = "22px 'Montserrat'";
    ctx.fillStyle = colors.accent;
    ctx.fillText("OFFICIAL ENTRY PASS", 70, 115);

    // 6. Draw Attendee Name (Hero Text)
    ctx.font = "bold 80px 'Montserrat'";
    ctx.fillStyle = colors.textMain;
    let name = ticket.full_name ?? "Guest";
    // Simple text scaling if name is too long
    if (ctx.measureText(name).width > 800) {
      ctx.font = "bold 60px 'Montserrat'";
    }
    ctx.fillText(name.toUpperCase(), 70, 220);

    // 7. Draw Details Grid
    const startY = 300;
    const colX1 = 70;
    const colX2 = 420;
    
    ctx.font = "18px 'Montserrat'";
    
    // Row 1
    ctx.fillStyle = colors.textMuted;
    ctx.fillText("TICKET ID", colX1, startY);
    ctx.fillText("QUANTITY", colX2, startY);
    
    ctx.fillStyle = colors.textMain;
    ctx.font = "bold 28px 'Montserrat'";
    ctx.fillText(ticket.ticket_code ?? "", colX1, startY + 35);
    ctx.fillText(String(ticket.tickets || 1), colX2, startY + 35);

    // Row 2
    ctx.font = "18px 'Montserrat'";
    ctx.fillStyle = colors.textMuted;
    ctx.fillText("BOOKED ON", colX1, startY + 90);
    ctx.fillText("CONTACT", colX2, startY + 90);

    ctx.fillStyle = colors.textMain;
    ctx.font = "bold 24px 'Montserrat'";
    const createdAt = ticket.created_at ?? null;
    const date = createdAt ? new Date(createdAt) : null;
    const dateStr =
      date && !Number.isNaN(date.getTime())
        ? date.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : "N/A";
    ctx.fillText(dateStr, colX1, startY + 120);
    ctx.fillText(ticket.contact_number ?? "N/A", colX2, startY + 120);

    // 8. Draw Decorative Separator (Dashed Line)
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 2;
    ctx.setLineDash([15, 15]);
    ctx.beginPath();
    ctx.moveTo(920, 50);
    ctx.lineTo(920, height - 50);
    ctx.stroke();
    ctx.setLineDash([]);

    // 9. Draw QR Code Area
    const qrSize = 280;
    const qrX = 1000;
    const qrY = (height - qrSize) / 2;

    // Card background for QR
    ctx.fillStyle = colors.cardBg;
    roundRect(qrX - 20, qrY - 20, qrSize + 40, qrSize + 80, 16);
    ctx.fill();

    // QR Generation
    const qrData = ticket.ticket_code ?? "";
    const qrUrl = await QRCode.toDataURL(qrData, {
      width: 1024,
      margin: 1,
      errorCorrectionLevel: "H",
      color: { dark: colors.bg, light: "#ffffff" },
    });
    
    const qrImage = await loadImage(qrUrl);
    // Draw white background for QR code specifically
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(qrX, qrY, qrSize, qrSize);
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

    // Text below QR
    ctx.fillStyle = colors.textMain;
    ctx.font = "bold 22px 'Montserrat'";
    ctx.textAlign = "center";
    const codeLabel =
      typeof ticket.ticket_code === "string" ? ticket.ticket_code.slice(0, 8) : "";
    ctx.fillText(codeLabel, qrX + qrSize / 2, qrY + qrSize + 45);
    ctx.textAlign = "left"; // Reset alignment

    // 10. Draw Footer Info
    ctx.font = "16px 'Montserrat'";
    ctx.fillStyle = colors.textMuted;
    ctx.fillText("Event Date: 02 May 2026  |  Venue: Salem, Tamil Nadu", 70, height - 40);

    // 11. Send Response
    const buffer = canvas.toBuffer("image/png");
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "no-store");
    return res.send(buffer);

  } catch (err) {
    console.error("Failed to generate ticket image", err);
    return res.status(500).json({ error: "Failed to generate ticket" });
  }
});

app.post("/api/submissions/audience", async (req, res) => {
  const fullName = getString(req.body.fullName);
  const contactNumber = getString(req.body.contactNumber);
  const tickets = toInt(req.body.tickets);
  const email = getString(req.body.email);

  if (!fullName || !contactNumber || !tickets || tickets < 1) {
    return res.status(400).json({ error: "Invalid submission" });
  }

  const pool = getPool();
  const ticketCode = randomUUID();
  // random ticket code with prefix "GG-" and 8 characters after that from the uuid, removing dashes and taking first 8 characters
  const formattedTicketCode = `GG-${ticketCode.replace(/-/g, "").substring(0, 8)}`;
  const [result] = await pool.query(
    "INSERT INTO audience_submissions (full_name, tickets, contact_number, email, ticket_code) VALUES (?, ?, ?, ?, ?)",
    [fullName, tickets, contactNumber, email || null, formattedTicketCode]
  );

  const insertId = result?.insertId;
  const [rows] = await pool.query(
    "SELECT id, full_name, tickets, created_at, ticket_code FROM audience_submissions WHERE id = ? LIMIT 1",
    [insertId]
  );
  const ticket = rows?.[0];

  const ticketResponse = ticket
    ? {
        id: ticket.id,
        fullName: ticket.full_name,
        tickets: Number(ticket.tickets) || 0,
        createdAt: ticket.created_at,
        code: ticket.ticket_code || ticketCode,
      }
    : {
        id: insertId,
        fullName,
        tickets,
        createdAt: new Date().toISOString(),
        code: formattedTicketCode,
      };

  // Broadcast real-time slot update to public visitors and admin dashboard
  void broadcastStatsAndSlotUpdate(pool, {
    category: "audience",
    name: fullName,
    tickets,
    ticketCode: ticketResponse.code,
    time: new Date().toISOString(),
  });

  broadcastAdmin("new_submission", {
    category: "audience",
    record: {
      id: ticketResponse.id,
      full_name: fullName,
      tickets,
      contact_number: contactNumber,
      email: email || null,
      ticket_code: ticketResponse.code,
      created_at: ticketResponse.createdAt,
    },
  });

  return res.json({
    ok: true,
    ticket: ticketResponse,
  });
});

app.post("/api/submissions/models", async (req, res) => {
  const fullName = getString(req.body.fullName);
  const contactNumber = getString(req.body.contactNumber);
  const age = toInt(req.body.age);
  const email = getString(req.body.email);
  const outfitDescription = getString(req.body.outfitDescription);

  if (!fullName || !contactNumber || !age || age < 1) {
    return res.status(400).json({ error: "Invalid submission" });
  }

  const pool = getPool();
  const [result] = await pool.query(
    "INSERT INTO model_submissions (full_name, age, contact_number, email, outfit_description) VALUES (?, ?, ?, ?, ?)",
    [fullName, age, contactNumber, email || null, outfitDescription || null]
  );

  const insertId = result?.insertId;

  void broadcastStatsAndSlotUpdate(pool, {
    category: "models",
    name: fullName,
    tickets: 1,
    time: new Date().toISOString(),
  });

  broadcastAdmin("new_submission", {
    category: "models",
    record: {
      id: insertId,
      full_name: fullName,
      age,
      contact_number: contactNumber,
      email: email || null,
      outfit_description: outfitDescription || null,
      created_at: new Date().toISOString(),
    },
  });

  return res.json({ ok: true, id: insertId });
});

app.post("/api/submissions/makeup-artists", async (req, res) => {
  const fullName = getString(req.body.fullName);
  const contactNumber = getString(req.body.contactNumber);
  const experience = toInt(req.body.experience);
  const email = getString(req.body.email);
  const specialization = getString(req.body.specialization);

  if (!fullName || !contactNumber || experience === null || experience < 0) {
    return res.status(400).json({ error: "Invalid submission" });
  }

  const pool = getPool();
  const [result] = await pool.query(
    "INSERT INTO makeup_artist_submissions (full_name, experience, contact_number, email, specialization) VALUES (?, ?, ?, ?, ?)",
    [fullName, experience, contactNumber, email || null, specialization || null]
  );

  const insertId = result?.insertId;

  void broadcastStatsAndSlotUpdate(pool, {
    category: "makeup-artists",
    name: fullName,
    tickets: 1,
    time: new Date().toISOString(),
  });

  broadcastAdmin("new_submission", {
    category: "makeup-artists",
    record: {
      id: insertId,
      full_name: fullName,
      experience,
      contact_number: contactNumber,
      email: email || null,
      specialization: specialization || null,
      created_at: new Date().toISOString(),
    },
  });

  return res.json({ ok: true, id: insertId });
});

app.post("/api/submissions/stall-owners", async (req, res) => {
  const businessName = getString(req.body.businessName);
  const ownerName = getString(req.body.ownerName);
  const contactNumber = getString(req.body.contactNumber);
  const email = getString(req.body.email);
  const description = getString(req.body.desc);

  if (!businessName || !ownerName || !contactNumber) {
    return res.status(400).json({ error: "Invalid submission" });
  }

  const pool = getPool();
  const [result] = await pool.query(
    "INSERT INTO stall_submissions (business_name, owner_name, contact_number, email, business_description) VALUES (?, ?, ?, ?, ?)",
    [businessName, ownerName, contactNumber, email || null, description || null]
  );

  const insertId = result?.insertId;

  void broadcastStatsAndSlotUpdate(pool, {
    category: "stall-owners",
    name: ownerName,
    businessName,
    tickets: 1,
    time: new Date().toISOString(),
  });

  broadcastAdmin("new_submission", {
    category: "stall-owners",
    record: {
      id: insertId,
      business_name: businessName,
      owner_name: ownerName,
      contact_number: contactNumber,
      email: email || null,
      business_description: description || null,
      created_at: new Date().toISOString(),
    },
  });

  return res.json({ ok: true, id: insertId });
});

app.post("/api/auth/login", async (req, res) => {
  const username = getString(req.body.username);
  const password = getString(req.body.password);

  if (!username || !password) {
    return res.status(400).json({ error: "Missing credentials" });
  }

  const pool = getPool();
  const [rows] = await pool.query(
    "SELECT id, username, password_hash FROM admin_users WHERE username = ? LIMIT 1",
    [username]
  );

  if (!rows.length) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const user = rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: "12h" }
  );

  return res.json({ token });
});

app.post("/checkin", async (req, res) => {
  const code = getString(req.body.code);
  if (!code) {
    return res.json({ ok: false, status: "invalid", message: "Invalid Ticket" });
  }

  const payload = await checkInTicket(code, null);
  return res.json(payload);
});

app.post("/api/checkin", async (req, res) => {
  const code = getString(req.body.code);
  if (!code) {
    return res.json({ ok: false, status: "invalid", message: "Invalid Ticket" });
  }

  const payload = await checkInTicket(code, null);
  return res.json(payload);
});

app.get("/api/admin/overview", requireAuth, async (req, res) => {
  const pool = getPool();
  const { counts, remaining, total } = await getCountsAndRemaining(pool);
  const { entryCount, entryTickets } = await getEntryStats(pool);

  const daily = await getOverallDailyCounts(pool);

  return res.json({
    counts,
    targets: TARGETS,
    remaining,
    total,
    entryCount,
    entryTickets,
    daily,
  });
});

app.post("/api/admin/audience/entry", requireAuth, async (req, res) => {
  const code = getString(req.body.code);
  if (!code) {
    return res.status(400).json({ error: "Missing ticket code" });
  }

  const payload = await checkInTicket(code, req.user?.id || null);
  return res.json(payload);
});

app.get("/api/admin/audience/entries", requireAuth, async (req, res) => {
  const query =
    typeof req.query.q === "string" ? req.query.q.trim() : "";
  const limit = Math.min(Math.max(toInt(req.query.limit) || 200, 1), 1000);
  const like = `%${query}%`;
  const searchColumns = ["ticket_code", "full_name", "email", "contact_number"];
  const whereClause =
    query
      ? `WHERE ${searchColumns.map((col) => `${col} LIKE ?`).join(" OR ")}`
      : "";
  const params = query ? [...searchColumns.map(() => like), limit] : [limit];

  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT * FROM audience_entries ${whereClause} ORDER BY scanned_at DESC LIMIT ?`,
    params
  );
  return res.json({ rows });
});

app.get("/api/admin/category/:type", requireAuth, async (req, res) => {
  const type = req.params.type;
  const category = CATEGORY_MAP[type];
  if (!category) {
    return res.status(404).json({ error: "Unknown category" });
  }

  const query =
    typeof req.query.q === "string" ? req.query.q.trim() : "";

  const pool = getPool();
  const limit = Math.min(Math.max(toInt(req.query.limit) || 200, 1), 1000);
  const searchColumns = category.searchColumns || [];
  const like = `%${query}%`;
  const whereClause =
    query && searchColumns.length
      ? `WHERE ${searchColumns.map((col) => `${col} LIKE ?`).join(" OR ")}`
      : "";
  const params =
    query && searchColumns.length
      ? [...searchColumns.map(() => like), limit]
      : [limit];

  const [rows] = await pool.query(
    `SELECT * FROM ${category.table} ${whereClause} ORDER BY created_at DESC LIMIT ?`,
    params
  );
  const [countRows] = await pool.query(
    `SELECT ${category.countColumn ? `SUM(${category.countColumn})` : "COUNT(*)"} AS count FROM ${category.table}`
  );

  const total = Number(countRows[0].count) || 0;
  const target = TARGETS[type] || 0;
  const remaining = Math.max(0, target - total);
  const daily = await getDailyCounts(pool, category.table, category.countColumn);

  return res.json({
    type,
    label: category.label,
    rows,
    total,
    target,
    remaining,
    daily,
  });
});

// Admin Live Activity Feed
app.get("/api/admin/activity", requireAuth, async (req, res) => {
  const pool = getPool();
  const limit = Math.min(Math.max(toInt(req.query.limit) || 30, 1), 100);
  const rows = await getRecentActivity(pool, limit);
  return res.json({ rows });
});

// Update a submission in any category
app.put("/api/admin/submissions/:type/:id", requireAuth, async (req, res) => {
  const type = req.params.type;
  const id = toInt(req.params.id);
  const category = CATEGORY_MAP[type];

  if (!category || !id) {
    return res.status(400).json({ error: "Invalid category or ID" });
  }

  const pool = getPool();
  const [existing] = await pool.query(
    `SELECT * FROM ${category.table} WHERE id = ? LIMIT 1`,
    [id]
  );
  if (!existing.length) {
    return res.status(404).json({ error: "Record not found" });
  }

  const b = req.body || {};

  if (type === "audience") {
    const fullName = getString(b.fullName || b.full_name || existing[0].full_name);
    const contact = getString(b.contactNumber || b.contact_number || existing[0].contact_number);
    const email = getString(b.email !== undefined ? b.email : existing[0].email);
    const tickets = toInt(b.tickets) ?? Number(existing[0].tickets);

    await pool.query(
      "UPDATE audience_submissions SET full_name = ?, contact_number = ?, email = ?, tickets = ? WHERE id = ?",
      [fullName, contact, email || null, Math.max(1, tickets), id]
    );

    // Also update matching checked-in audience entry if name or tickets changed
    if (existing[0].ticket_code) {
      await pool.query(
        "UPDATE audience_entries SET full_name = ?, tickets = ?, contact_number = ?, email = ? WHERE ticket_code = ?",
        [fullName, Math.max(1, tickets), contact, email || null, existing[0].ticket_code]
      );
    }
  } else if (type === "models") {
    const fullName = getString(b.fullName || b.full_name || existing[0].full_name);
    const age = toInt(b.age) ?? Number(existing[0].age);
    const contact = getString(b.contactNumber || b.contact_number || existing[0].contact_number);
    const email = getString(b.email !== undefined ? b.email : existing[0].email);
    const outfit = getString(b.outfitDescription || b.outfit_description || existing[0].outfit_description);

    await pool.query(
      "UPDATE model_submissions SET full_name = ?, age = ?, contact_number = ?, email = ?, outfit_description = ? WHERE id = ?",
      [fullName, age, contact, email || null, outfit || null, id]
    );
  } else if (type === "makeup-artists") {
    const fullName = getString(b.fullName || b.full_name || existing[0].full_name);
    const exp = toInt(b.experience) ?? Number(existing[0].experience);
    const contact = getString(b.contactNumber || b.contact_number || existing[0].contact_number);
    const email = getString(b.email !== undefined ? b.email : existing[0].email);
    const spec = getString(b.specialization || existing[0].specialization);

    await pool.query(
      "UPDATE makeup_artist_submissions SET full_name = ?, experience = ?, contact_number = ?, email = ?, specialization = ? WHERE id = ?",
      [fullName, exp, contact, email || null, spec || null, id]
    );
  } else if (type === "stall-owners") {
    const bName = getString(b.businessName || b.business_name || existing[0].business_name);
    const oName = getString(b.ownerName || b.owner_name || existing[0].owner_name);
    const contact = getString(b.contactNumber || b.contact_number || existing[0].contact_number);
    const email = getString(b.email !== undefined ? b.email : existing[0].email);
    const desc = getString(b.description || b.business_description || existing[0].business_description);

    await pool.query(
      "UPDATE stall_submissions SET business_name = ?, owner_name = ?, contact_number = ?, email = ?, business_description = ? WHERE id = ?",
      [bName, oName, contact, email || null, desc || null, id]
    );
  }

  const [updatedRows] = await pool.query(
    `SELECT * FROM ${category.table} WHERE id = ? LIMIT 1`,
    [id]
  );
  const updatedRecord = updatedRows[0];

  void broadcastStatsAndSlotUpdate(pool, {
    category: type,
    id,
    action: "updated",
    time: new Date().toISOString(),
  });

  broadcastAdmin("submission_updated", {
    category: type,
    record: updatedRecord,
  });

  return res.json({ ok: true, record: updatedRecord });
});

// Delete a submission from any category
app.delete("/api/admin/submissions/:type/:id", requireAuth, async (req, res) => {
  const type = req.params.type;
  const id = toInt(req.params.id);
  const category = CATEGORY_MAP[type];

  if (!category || !id) {
    return res.status(400).json({ error: "Invalid category or ID" });
  }

  const pool = getPool();
  const [existing] = await pool.query(
    `SELECT * FROM ${category.table} WHERE id = ? LIMIT 1`,
    [id]
  );
  if (!existing.length) {
    return res.status(404).json({ error: "Record not found" });
  }

  const row = existing[0];

  if (type === "audience" && row.ticket_code) {
    await pool.query("DELETE FROM audience_entries WHERE ticket_code = ?", [
      row.ticket_code,
    ]);
  }

  await pool.query(`DELETE FROM ${category.table} WHERE id = ?`, [id]);

  void broadcastStatsAndSlotUpdate(pool, {
    category: type,
    id,
    action: "deleted",
    time: new Date().toISOString(),
  });

  broadcastAdmin("submission_deleted", {
    category: type,
    id,
  });

  return res.json({ ok: true, deletedId: id });
});

// Export Category Submissions or Gate Entries to CSV
app.get("/api/admin/export/:type", requireAuth, async (req, res) => {
  const type = req.params.type;
  const pool = getPool();

  let tableName = "";
  let fileBase = type;

  if (type === "entries") {
    tableName = "audience_entries";
    fileBase = "audience-entries";
  } else if (CATEGORY_MAP[type]) {
    tableName = CATEGORY_MAP[type].table;
    fileBase = type;
  } else {
    return res.status(400).json({ error: "Invalid export type" });
  }

  const [rows] = await pool.query(
    `SELECT * FROM ${tableName} ORDER BY id DESC`
  );

  if (!rows.length) {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="glamour-${fileBase}.csv"`
    );
    return res.send("No records found\r\n");
  }

  const headers = Object.keys(rows[0]);
  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const csvLines = [
    headers.map(escapeCsv).join(","),
    ...rows.map((row) => headers.map((col) => escapeCsv(row[col])).join(",")),
  ];

  const csvContent = csvLines.join("\r\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="glamour-${fileBase}-${new Date().toISOString().slice(0, 10)}.csv"`
  );
  return res.send(csvContent);
});

async function start() {
  await initDb(DB_CONFIG);
  await ensureAdminUser();

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend running on port ${PORT}`);
  });
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server", err);
  process.exit(1);
});
