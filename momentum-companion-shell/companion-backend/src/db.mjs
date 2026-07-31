import pg from "pg";

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://companion:companion@localhost:5432/companion";

const pool = new pg.Pool({ connectionString });

export function query(text, params) {
  return pool.query(text, params);
}

export function end() {
  return pool.end();
}

export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
