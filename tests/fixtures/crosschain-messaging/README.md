# Crosschain messaging parity fixtures (Phase A4)

Commit GraphQL snapshots and permuted event-order replay vectors here.

## Required scenarios

1. Underpaid → repay promotion (`repaidAt*` on messages)
2. Fail → retry → execute (same `(id, index)`)
3. Duplicate `messageHash` in batch
4. v3_1 multi `payloadIndex`
5. Permuted order vectors (execute-before-prepare, handle-before-send, …)
6. v3 proof quorum regression

Export baseline from omnichain indexer at block `B`; diff against multichain reindex via `scripts/parity/graphql-diff.mjs`.
