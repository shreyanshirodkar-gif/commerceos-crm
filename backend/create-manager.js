require("dotenv").config();

const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "commerceos_crm",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD,
});

async function main() {
  const email = process.env.MANAGER_EMAIL?.trim().toLowerCase();
  const password = process.env.MANAGER_PASSWORD;

  if (!email || !password || password.length < 12) {
    throw new Error(
      "Set MANAGER_EMAIL and a MANAGER_PASSWORD of at least 12 characters in .env"
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await pool.query(
    `INSERT INTO app_users (email, password_hash, role, is_active)
     VALUES ($1, $2, 'manager', TRUE)
     ON CONFLICT (email)
     DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       role = 'manager',
       is_active = TRUE,
       updated_at = NOW()`,
    [email, passwordHash]
  );

  console.log(`Manager account configured for ${email}`);
}

main()
  .catch((error) => {
    console.error("Manager setup failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());