import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import morgan from "morgan";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { initDb, getPool } from "./db.js";

dotenv.config();

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
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const ALLOWED_ORIGINS = FRONTEND_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const TARGETS = {
  audience: 250,
  models: 60,
  "makeup-artists": 30,
  "stall-owners": 90,
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
    searchColumns: ["full_name", "contact_number", "email", "outfit_description"],
  },
  "makeup-artists": {
    table: "makeup_artist_submissions",
    label: "Makeup Artists",
    searchColumns: ["full_name", "contact_number", "email", "specialization"],
  },
  "stall-owners": {
    table: "stall_submissions",
    label: "Stall Owners",
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
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

function getString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function toInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.trunc(num);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized" });
  }
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
    const countExpr = countColumn ? `SUM(${countColumn})` : "COUNT(*)";
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

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
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
  const [result] = await pool.query(
    "INSERT INTO audience_submissions (full_name, tickets, contact_number, email, ticket_code) VALUES (?, ?, ?, ?, ?)",
    [fullName, tickets, contactNumber, email || null, ticketCode]
  );

  const insertId = result?.insertId;
  const [rows] = await pool.query(
    "SELECT id, full_name, tickets, created_at, ticket_code FROM audience_submissions WHERE id = ? LIMIT 1",
    [insertId]
  );
  const ticket = rows?.[0];

  return res.json({
    ok: true,
    ticket: ticket
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
          code: ticketCode,
        },
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
  await pool.query(
    "INSERT INTO model_submissions (full_name, age, contact_number, email, outfit_description) VALUES (?, ?, ?, ?, ?)",
    [fullName, age, contactNumber, email || null, outfitDescription || null]
  );

  return res.json({ ok: true });
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
  await pool.query(
    "INSERT INTO makeup_artist_submissions (full_name, experience, contact_number, email, specialization) VALUES (?, ?, ?, ?, ?)",
    [fullName, experience, contactNumber, email || null, specialization || null]
  );

  return res.json({ ok: true });
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
  await pool.query(
    "INSERT INTO stall_submissions (business_name, owner_name, contact_number, email, business_description) VALUES (?, ?, ?, ?, ?)",
    [businessName, ownerName, contactNumber, email || null, description || null]
  );

  return res.json({ ok: true });
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

  const pool = getPool();
  const [audienceRows] = await pool.query(
    "SELECT id, full_name, tickets, contact_number, email, ticket_code FROM audience_submissions WHERE ticket_code = ? LIMIT 1",
    [code]
  );
  if (!audienceRows.length) {
    return res.status(404).json({ error: "Ticket not found" });
  }

  const [existingRows] = await pool.query(
    "SELECT * FROM audience_entries WHERE ticket_code = ? LIMIT 1",
    [code]
  );
  if (existingRows.length) {
    return res.json({ ok: true, status: "already", entry: existingRows[0] });
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
      req.user?.id || null,
    ]
  );

  const [entryRows] = await pool.query(
    "SELECT * FROM audience_entries WHERE ticket_code = ? LIMIT 1",
    [code]
  );
  return res.json({
    ok: true,
    status: "checked-in",
    entry: entryRows[0],
  });
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
