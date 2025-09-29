# Changelog

## [2.0.0](https://github.com/centrifuge/api-v3/compare/v1.6.0...v2.0.0) (2025-09-29)


### ⚠ BREAKING CHANGES

* redefine primary keys for crosschain payloads ([#139](https://github.com/centrifuge/api-v3/issues/139))

### Features

* redefine primary keys for crosschain payloads ([#139](https://github.com/centrifuge/api-v3/issues/139)) ([075d46b](https://github.com/centrifuge/api-v3/commit/075d46bf60b33b7fcc6959ec14bca8e66fddcbe3))
* track transfers in investorTransactions ([#138](https://github.com/centrifuge/api-v3/issues/138)) ([a031e88](https://github.com/centrifuge/api-v3/commit/a031e8881f1e91b769ef124069be354c52b2527f))


### Bug Fixes

* crosschainMessages retries not correctly handled ([3628931](https://github.com/centrifuge/api-v3/commit/36289310fb773963fbc665278e8545bb2c1a2249))
* investOrders contains wrong state ([#136](https://github.com/centrifuge/api-v3/issues/136)) ([6db9870](https://github.com/centrifuge/api-v3/commit/6db9870d2ea4e2d6c6f03e92f0f5bab1f69f26b6))
* missing adapter names ([#134](https://github.com/centrifuge/api-v3/issues/134)) ([8f18438](https://github.com/centrifuge/api-v3/commit/8f184383629cc5848a3549599cbdbfe3f827238a))
* missing payload completion on single adapter chains ([a0980eb](https://github.com/centrifuge/api-v3/commit/a0980eb645b2fd6591ca2216bb55c0bb2ec0e64b))
* prefer arbitrum alchemy wss ([16e3a87](https://github.com/centrifuge/api-v3/commit/16e3a87942013e867485ffcf64b29ca008048eb8))

## [1.6.0](https://github.com/centrifuge/api-v3/compare/v1.5.1...v1.6.0) (2025-09-10)


### Features

* instantiate deployment contract from available chain contracts ([#126](https://github.com/centrifuge/api-v3/issues/126)) ([9b14046](https://github.com/centrifuge/api-v3/commit/9b14046dd167aa430bd2093da6f0885e05598e90))

## [1.5.1](https://github.com/centrifuge/api-v3/compare/v1.5.0...v1.5.1) (2025-09-10)


### Bug Fixes

* validUntil fallback to largest possible ISO date ([c30143c](https://github.com/centrifuge/api-v3/commit/c30143c79d2ff074399f72c102cc982001764894))

## [1.5.0](https://github.com/centrifuge/api-v3/compare/v1.4.0...v1.5.0) (2025-09-10)


### Features

* whitelisted investors ([#123](https://github.com/centrifuge/api-v3/issues/123)) ([dc587c2](https://github.com/centrifuge/api-v3/commit/dc587c22ab0aba548349409c671f2e08b92bc5b0))

## [1.4.0](https://github.com/centrifuge/api-v3/compare/v1.3.0...v1.4.0) (2025-09-05)


### Features

* crosschainMessages include messageHash ([#120](https://github.com/centrifuge/api-v3/issues/120)) ([641c7d8](https://github.com/centrifuge/api-v3/commit/641c7d8d8a366e9691429580c6c28ce9bdbd932a))
* tracking merkle proof managers and onOfframp managers contracts ([#117](https://github.com/centrifuge/api-v3/issues/117)) ([3440786](https://github.com/centrifuge/api-v3/commit/3440786738fba9cf756338d35788f6f3761745de))

## [1.3.0](https://github.com/centrifuge/api-v3/compare/v1.2.0...v1.3.0) (2025-09-02)


### Features

* add iso currencies and decimals to pools and assets ([#113](https://github.com/centrifuge/api-v3/issues/113)) ([1f01985](https://github.com/centrifuge/api-v3/commit/1f019851d5f0cf57bbb423cb0ee9c4da3d76afe5))


### Bug Fixes

* deployments ([#110](https://github.com/centrifuge/api-v3/issues/110)) ([816c084](https://github.com/centrifuge/api-v3/commit/816c084d6ebc7b2541ce3c09d9076ee58bf6f57a))

## [1.2.0](https://github.com/centrifuge/api-v3/compare/v1.1.2...v1.2.0) (2025-08-27)


### Features

* aggregated totalIssuance on token entity ([d6afe2d](https://github.com/centrifuge/api-v3/commit/d6afe2dd9b55d995d73784455a3b279c0f272276))
* initialise unprepared messages and batches ([#107](https://github.com/centrifuge/api-v3/issues/107)) ([61731d6](https://github.com/centrifuge/api-v3/commit/61731d6218993bc2442fa164df203f059b6ac252))
* trackk minting and burning of tokenInstances ([4bea74b](https://github.com/centrifuge/api-v3/commit/4bea74b697594c514248f1cfbf080093f95b0aea))


### Bug Fixes

* tokensnInstanceSnapshot totalIssuance ([#104](https://github.com/centrifuge/api-v3/issues/104)) ([3a155a0](https://github.com/centrifuge/api-v3/commit/3a155a036ec5a2a0bdad2be166171483c0eb08c3))
* totalIssuance only on token transfers ([2607b79](https://github.com/centrifuge/api-v3/commit/2607b79d5d101bd7135352836cb8b0138335c765))

## [1.1.2](https://github.com/centrifuge/api-v3/compare/v1.1.1...v1.1.2) (2025-08-21)


### Bug Fixes

* investor addresses in orders and transactions ([3ba86f3](https://github.com/centrifuge/api-v3/commit/3ba86f329c9f292fa136909f2c995046272fe01a))
* prevent approval of 0n amounts ([324ec49](https://github.com/centrifuge/api-v3/commit/324ec499b776e0ea8c43d4547faaf1681b3530a5))

## [1.1.1](https://github.com/centrifuge/api-v3/compare/v1.1.0...v1.1.1) (2025-08-18)


### Bug Fixes

* missing asset metadata ([#98](https://github.com/centrifuge/api-v3/issues/98)) ([75d9d10](https://github.com/centrifuge/api-v3/commit/75d9d10f3f1b66f7d14b34aedc2bbe3816746c9c))

## [1.1.0](https://github.com/centrifuge/api-v3/compare/v1.0.0...v1.1.0) (2025-08-13)


### Features

* add partiallyFailed batches ([d7fd5b1](https://github.com/centrifuge/api-v3/commit/d7fd5b1a49cde4b4464c7cf64b342b28012f0266))
* add poolId to crosschainPayload ([8103e44](https://github.com/centrifuge/api-v3/commit/8103e44f6d05b7fc424e11d508a2ea5630284795))
* pool metadata from ipfs ([9e06883](https://github.com/centrifuge/api-v3/commit/9e06883fbd6eaeedb200aefeb943625321fa5590))
* tokenInstanceSnapshots ([f3c08b1](https://github.com/centrifuge/api-v3/commit/f3c08b12b92c3ba67d4c3125e04baebd224155d1))


### Bug Fixes

* add first pool hub manager ([fc3fe1c](https://github.com/centrifuge/api-v3/commit/fc3fe1cdbf9c1e18b61e3007c1ba71d5a6d110be))
* display partiallyFailed payloads ([aa3a538](https://github.com/centrifuge/api-v3/commit/aa3a5389f69850cf348c4f0c49918affc254e74f))
* fail gracefully and log pk collisions in invest and redeem orders ([a6c4e06](https://github.com/centrifuge/api-v3/commit/a6c4e06d3158b8b6f5bf5607a37b5cbfb7648a73))
* fail gracefully and log pk collisions in invest and redeem orders ([78d462e](https://github.com/centrifuge/api-v3/commit/78d462edc723d3df3f15c2676f13ebf0882bfded))
* handle dynamic length messages ([626b7a6](https://github.com/centrifuge/api-v3/commit/626b7a69b773878f51ca07724b845d6ef214d62a))
* handle zero assets in getPrice ([ad5dd76](https://github.com/centrifuge/api-v3/commit/ad5dd76e8b66d127beb854d86b9a58b6a6419458))
* ignore failed inserts ([2eb7bab](https://github.com/centrifuge/api-v3/commit/2eb7bab8fc158024dc6f4449e9d44e396328485a))
* message decoding offset ([718dc33](https://github.com/centrifuge/api-v3/commit/718dc33fde214c99f748f75ef2c82b9ea808a222))
* outstandingOrders ([f660c96](https://github.com/centrifuge/api-v3/commit/f660c96c26316b2759d771d58fb4dd0439aabfd5)), closes [#68](https://github.com/centrifuge/api-v3/issues/68)
* partiallyFailed payload execution ([c0301fc](https://github.com/centrifuge/api-v3/commit/c0301fca25571548518991f2041a461654a0d65b))
* plume endpoint ([9a5e5ed](https://github.com/centrifuge/api-v3/commit/9a5e5edd3e24e4b70807cb899307c04805fd8fab))
* revert to upsert for Invest and Redeem orders ([8408272](https://github.com/centrifuge/api-v3/commit/840827222015871f4284ae4be745517b9d7b5992))
* set delivered batches on failed messages retry ([e2c42d7](https://github.com/centrifuge/api-v3/commit/e2c42d7101909b56f8dcc40141b51849f19894dc))
* silent error on crosschain messages ([dcd1a51](https://github.com/centrifuge/api-v3/commit/dcd1a5131d4df038aa0b4aff8172ffd4c2fd4f21))
* tidy up current epoch ([e184c9c](https://github.com/centrifuge/api-v3/commit/e184c9c5a9270e63493a8c3178aa6932900e81c4))
* update ethereum contracts ([f79163d](https://github.com/centrifuge/api-v3/commit/f79163dcf53671b363b93b157d67a46019eb24bf))

## 1.0.0 (2025-07-21)


### Features

* adapt to latest deployment ([24e139f](https://github.com/centrifuge/api-v3/commit/24e139fcc9bc00f3eb41579d4203e53e2fbbd7b1))
* adapt to new deployment ([79e925a](https://github.com/centrifuge/api-v3/commit/79e925a6a315f7eb29ca68c7c205f300b3fb9ca5))
* add manager to vaults ([#72](https://github.com/centrifuge/api-v3/issues/72)) ([34faf6e](https://github.com/centrifuge/api-v3/commit/34faf6e109613d3bf907e3d7b77e7d2a496280e8)), closes [#71](https://github.com/centrifuge/api-v3/issues/71)
* add support for iso 4217 asset ids in registrations ([#50](https://github.com/centrifuge/api-v3/issues/50)) ([cf636b9](https://github.com/centrifuge/api-v3/commit/cf636b9a7d0121d7344cab4c4955b086ae2bd4fa)), closes [#43](https://github.com/centrifuge/api-v3/issues/43)
* add tracking of ERC-6909 ([#49](https://github.com/centrifuge/api-v3/issues/49)) ([2797f3a](https://github.com/centrifuge/api-v3/commit/2797f3ad8db30026b81f82d64c1632a722798c99)), closes [#41](https://github.com/centrifuge/api-v3/issues/41)
* add vaults init ([ce6a09f](https://github.com/centrifuge/api-v3/commit/ce6a09f67acf62c47ac36b537eb447d8e39698f6))
* enable holdings snapshots upon holdings events ([#47](https://github.com/centrifuge/api-v3/issues/47)) ([209e559](https://github.com/centrifuge/api-v3/commit/209e559c171c1027c18b4adb4b2d6ea4fc1b5705)), closes [#30](https://github.com/centrifuge/api-v3/issues/30)
* enable token snapshots ([#38](https://github.com/centrifuge/api-v3/issues/38)) ([32c0dcb](https://github.com/centrifuge/api-v3/commit/32c0dcbe71391f32932366c3b1531303ac444757))
* index deployments ([#56](https://github.com/centrifuge/api-v3/issues/56)) ([724cdfc](https://github.com/centrifuge/api-v3/commit/724cdfc80301d1f9cdc81c4c4c21148b2a7650c8)), closes [#6](https://github.com/centrifuge/api-v3/issues/6)
* index token data ([#34](https://github.com/centrifuge/api-v3/issues/34)) ([1404366](https://github.com/centrifuge/api-v3/commit/1404366bb10326d1df7ba0759cc90a1081887939))
* initialise entities for holdings ([9cc3d91](https://github.com/centrifuge/api-v3/commit/9cc3d91a68dde26a7c220e2a383acc0d0fa57954))
* initialise pools ([7c34c5d](https://github.com/centrifuge/api-v3/commit/7c34c5d6f284334b632769ad0b3eb755e315d0fb))
* initialise snapshotter ([6d88ced](https://github.com/centrifuge/api-v3/commit/6d88ced633763442808eff601ecd3feb01f39f87))
* multichain testnets ([#37](https://github.com/centrifuge/api-v3/issues/37)) ([ba763e2](https://github.com/centrifuge/api-v3/commit/ba763e29c79adde4ff69b8b6f83ade13a29c05f3))
* outstanding orders ([25800a7](https://github.com/centrifuge/api-v3/commit/25800a7824f4b4d1e9060abdc9a73ef25c2e5ab8))
* snapshots upon token events ([9d81a87](https://github.com/centrifuge/api-v3/commit/9d81a87bbe3e0d4f1e83dbe958566dedd4637e93))
* synd and async deposits and redemptions for investorTransactions ([#61](https://github.com/centrifuge/api-v3/issues/61)) ([ebc3d60](https://github.com/centrifuge/api-v3/commit/ebc3d60eb3dcac5828b52bdb5a068ed0b921dd01)), closes [#55](https://github.com/centrifuge/api-v3/issues/55)
* track blockchainIds ([31cc1ea](https://github.com/centrifuge/api-v3/commit/31cc1ea1700053a1ae8dec0a2205759c7dcb641c))
* track escrows ([#39](https://github.com/centrifuge/api-v3/issues/39)) ([5480924](https://github.com/centrifuge/api-v3/commit/54809242033867db969ea59570c6dfab545f173f))
* track holdings ([9a4e2d2](https://github.com/centrifuge/api-v3/commit/9a4e2d285c55a9b9740fd5d29666428884f3ebd6))
* track holdings data ([#46](https://github.com/centrifuge/api-v3/issues/46)) ([c50f9b9](https://github.com/centrifuge/api-v3/commit/c50f9b919d6f54cf45c0086f6b2b8dbd92bdd984)), closes [#29](https://github.com/centrifuge/api-v3/issues/29) [#44](https://github.com/centrifuge/api-v3/issues/44)
* track holdings hub side ([84f6fad](https://github.com/centrifuge/api-v3/commit/84f6fadd975c1387e73c46c61c4f0674771fa7f5))
* track tokens ([a80b9a2](https://github.com/centrifuge/api-v3/commit/a80b9a20adee5f2e9068f973a8b576f747a34dc3))
* track vaults ([1e3b729](https://github.com/centrifuge/api-v3/commit/1e3b7298fb715096beb410796f14dd57877f40bf))
* track vaults and tokens ([94d3ae2](https://github.com/centrifuge/api-v3/commit/94d3ae2a02b82bc2f32b861d5ae07ba25cbea5b8))
* track vaults with status ([f8508b7](https://github.com/centrifuge/api-v3/commit/f8508b7c9c01dca4238718ba893e2e745cf1ebad))
* updated data model ([#27](https://github.com/centrifuge/api-v3/issues/27)) ([f835ae4](https://github.com/centrifuge/api-v3/commit/f835ae43d0e25db6e2a04c773f696281f53ab0d0))
* updates schema ([84dc2fe](https://github.com/centrifuge/api-v3/commit/84dc2fe19aaed35f7ccf3f291f13008cc65d12d6))


### Bug Fixes

* actualize data model and update logic for new contracts ([3526f9b](https://github.com/centrifuge/api-v3/commit/3526f9bcb56e92a52052b55fd305e44e3de7649d))
* asset schema ([#53](https://github.com/centrifuge/api-v3/issues/53)) ([ffed39c](https://github.com/centrifuge/api-v3/commit/ffed39c32af48be4afcf5661241e9794c7e2d00f)), closes [#51](https://github.com/centrifuge/api-v3/issues/51)
* assetregistration instances ([9b040ef](https://github.com/centrifuge/api-v3/commit/9b040ef3f49fa8489e55d9996fdadd251c2ceecc))
* deploy vault should rely on getorinit ([095ae6c](https://github.com/centrifuge/api-v3/commit/095ae6cff734e1992fea80dd7beb9b58fe7ca9ed))
* escrow primary key ([#80](https://github.com/centrifuge/api-v3/issues/80)) ([4ba96b0](https://github.com/centrifuge/api-v3/commit/4ba96b047c59dd12ef81d35416966f9015a9d852))
* multichain indexing ([d170c28](https://github.com/centrifuge/api-v3/commit/d170c28444052600e1f678ec9db544f5abde4433))
* tokens data model ([e653d11](https://github.com/centrifuge/api-v3/commit/e653d11a69230c16609d159584e5fd73ea200937))
* unnecessary type conversion ([9207fd0](https://github.com/centrifuge/api-v3/commit/9207fd04ca66b52d3a175a0314ba4987c9dc7e78))
* updates schema ([7889262](https://github.com/centrifuge/api-v3/commit/7889262fbb0220fe189dc2f2662ceb9e1fc3bab5))
* vault composed primary key ([f1344b3](https://github.com/centrifuge/api-v3/commit/f1344b3d55419e054cd05bcc4013113185e5d96b))
