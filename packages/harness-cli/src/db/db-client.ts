import type { DbConfig } from "./db-config.ts";

export interface DbQueryResult<Row> {
  rows: Row[];
}

export interface DbClient {
  query<Row = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<DbQueryResult<Row>>;
  end(): Promise<void>;
}

export async function createDbClient(config: DbConfig): Promise<DbClient> {
  const pg = await import("pg");
  const client = new pg.Client({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password
  });
  await client.connect();
  return client;
}
