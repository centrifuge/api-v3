# Tests

Unit and parity tests run with [Vitest](https://vitest.dev/).

```sh
pnpm test              # all tests under test/
pnpm test:parity:crosschain
pnpm test:parity:decimals
```

## Drizzle mocking

Service tests that hit the database should use the official `drizzle.mock()` API via `createMockDb()`:

```ts
import { beforeEach, describe, it } from "vitest";
import { createMockDb } from "../helpers/mockDb";
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

`vitest.config.ts` aliases `ponder:schema` and `ponder:registry` so service modules import cleanly in tests.

### Bug regression coverage (crosschain plan)

| Bug | Tests |
|-----|-------|
| **A** Missing `poolId`/`tokenId` on Request messages | `test/parity/crosschain-decode.test.ts`, `test/services/CrosschainMessageService.link.test.ts` |
| **B** Underpaid payload with no linked messages | `getFirstUnlinkedAwaiting` + `linkMessagesToPayload` in `test/services/CrosschainMessageService.link.test.ts` |
| **C** Payload stays `Delivered` after child fail | `test/parity/crosschain-payload-status.test.ts`, `test/parity/crosschain-upsert-merge.test.ts`, `test/services/crosschain-reconciliation.test.ts` |

Compare baseline vs candidate GraphQL exports (script lives under `scripts/`, not `test/`):

```sh
node scripts/graphql-diff.mjs baseline.json candidate.json
```
