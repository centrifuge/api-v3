# Multichain migration spikes (Phase A0)

## A0a — `generatedAlwaysAs` gate

Ponder 0.16.6 rejects generated columns at schema validation:

```
Schema validation failed: 'table.column' is a generated column and generated columns are unsupported.
```

Do **not** add `generatedAlwaysAs` to production schema. See `src/helpers/crosschainStatusCase.ts` for upsert-time CASE instead.

## A0b — Writable enum + upsert CASE

Validated via `CrosschainMessageService.upsertFacts` / `CrosschainPayloadService.upsertFacts` and GraphQL `crosschainMessages(where: { status })`.

## A0c — `saveMany` regression

`Service.saveMany` sets every non-PK column via `excluded.*` — breaks derived `status`. Crosschain entities must use `upsertFacts` only. See `src/helpers/upsertMerge.ts` `DERIVED_COLUMN_KEYS`.
