/**
 * Minimal runtime stub for `ponder:registry` in Vitest.
 */
export const ponder = {};

export type Event = {
  name: string;
  block: { timestamp: number; number: number };
  transaction: { hash: `0x${string}` };
  log: { address: `0x${string}` };
  args: Record<string, unknown>;
};

export type Context = {
  db: {
    sql: unknown;
    find: unknown;
  };
  client: unknown;
  chain: { name: string; id: number };
  contracts: Record<string, unknown>;
};
