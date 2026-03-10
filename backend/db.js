import mysql from "mysql2/promise";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "schema.sql");

let pool;

export async function initDb(config) {
  const { host, user, password } = config;

  const connection = await mysql.createConnection({
    host,
    user,
    password,
  });

  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.database}\``
  );
  await connection.end();

  pool = mysql.createPool({
    host,
    user,
    password,
    database: config.database,
    multipleStatements: true,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  const schema = await fs.readFile(schemaPath, "utf8");
  await pool.query(schema);

  try {
    await pool.query(
      "ALTER TABLE audience_submissions ADD COLUMN ticket_code VARCHAR(36) UNIQUE"
    );
  } catch (err) {
    if (err && err.code !== "ER_DUP_FIELDNAME") {
      throw err;
    }
  }
}

export function getPool() {
  if (!pool) {
    throw new Error("Database not initialized");
  }
  return pool;
}
