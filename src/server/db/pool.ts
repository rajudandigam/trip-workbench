import pg from "pg";

const { Pool } = pg;

export type Db = pg.Pool;
export type DbClient = pg.PoolClient;

export function createPool(databaseUrl: string): Db {
  return new Pool({
    connectionString: databaseUrl,
    max: 10,
  });
}

export async function withTransaction<T>(
  db: Db,
  fn: (client: DbClient) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
