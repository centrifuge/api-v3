# Tests

## Layout

| Path | Purpose | Runner |
|------|---------|--------|
| `test/unit/` | All Vitest tests (`*.test.ts`) and unit test infra | `pnpm test` / `pnpm test:unit` |
| `test/unit/support/` | Mocks, stubs, shared helpers (not tests) | imported by unit tests |
| `test/unit/fixtures/` | Static data for parity / replay scenarios | consumed by unit tests |
| `test/smoke/` | Live GraphQL + RPC integration harness | `pnpm smoke` |
| `test/smoke/checks/` | Individual smoke checks (`.mjs`) | via `pnpm smoke` |
| `test/smoke/specs/` | Smoke specifications (markdown) | documentation |

**Rule:** Vitest only runs files under `test/unit/`. Nothing under `test/smoke/` is Vitest.

## Unit tests (Vitest)

```sh
pnpm test              # all unit tests
pnpm test:unit         # same
pnpm test:parity:crosschain
pnpm test:parity:decimals
```

### Drizzle mocking

Service tests that hit the database should use the official `drizzle.mock()` API via `createMockDb()`:

```ts
import { beforeEach, describe, it } from "vitest";
import { createMockDb } from "../support/mockDb";
import { CrosschainMessage } from "ponder:schema";

describe("MyService", () => {
  let db: ReturnType<typeof createMockDb>["db"];
  let mock: ReturnType<typeof createMockDb>["mock"];

  beforeEach(() => {
    ({ db, mock } = createMockDb());
  });

  it("loads rows", async () => {
    mock.onSelect(CrosschainMessage).respond([/* ... */]);
    const rows = await db.select().from(CrosschainMessage);
    // ...
  });
});
```

`vitest.config.ts` aliases `ponder:schema` and `ponder:registry` to `test/unit/support/`.

### Bug regression coverage (crosschain plan)

| Bug | Tests |
|-----|-------|
| **A** Missing `poolId`/`tokenId` on Request messages | `test/unit/parity/crosschain-decode.test.ts`, `test/unit/services/CrosschainMessageService.link.test.ts` |
| **B** Underpaid payload with no linked messages | `getFirstUnlinkedAwaiting` + `linkMessagesToPayload` in `test/unit/services/CrosschainMessageService.link.test.ts` |
| **C** Payload stays `Delivered` after child fail | `test/unit/parity/crosschain-payload-status.test.ts`, `test/unit/parity/crosschain-upsert-merge.test.ts`, `test/unit/services/crosschain-reconciliation.test.ts` |

Compare baseline vs candidate GraphQL exports (script lives under `scripts/`, not `test/`):

```sh
node scripts/graphql-diff.mjs baseline.json candidate.json
```

## Smoke tests (live integration)

See [`test/smoke/specs/README.md`](smoke/specs/README.md) and root [`README.md`](../README.md#smoke-tests).

```sh
pnpm smoke list
pnpm smoke --mismatches-only
```
