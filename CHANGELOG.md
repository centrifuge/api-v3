# Changelog

## [3.0.4](https://github.com/centrifuge/api-v3/compare/v3.0.3...v3.0.4) (2026-02-26)


### Bug Fixes

* security improvements ([#264](https://github.com/centrifuge/api-v3/issues/264)) ([995aa34](https://github.com/centrifuge/api-v3/commit/995aa344425a18b17f663bf86312c662f6656a1b))

## [3.0.3](https://github.com/centrifuge/api-v3/compare/v3.0.2...v3.0.3) (2026-02-25)


### Bug Fixes

* saturate vaultInvestOrders and vaultRedeemOrders at zero ([#261](https://github.com/centrifuge/api-v3/issues/261)) ([74bafbf](https://github.com/centrifuge/api-v3/commit/74bafbf134e2b3edae2a0b5b5f162fdf8326f17b))

## [3.0.2](https://github.com/centrifuge/api-v3/compare/v3.0.1...v3.0.2) (2026-02-24)


### Bug Fixes

* minor upgrade for hono ([#258](https://github.com/centrifuge/api-v3/issues/258)) ([6c426ba](https://github.com/centrifuge/api-v3/commit/6c426ba3e5a751235a902be278dedc1be9437c1b)), closes [#253](https://github.com/centrifuge/api-v3/issues/253)

## [3.0.1](https://github.com/centrifuge/api-v3/compare/v3.0.0...v3.0.1) (2026-02-10)


### Bug Fixes

* added correct Optimism explorer link ([#249](https://github.com/centrifuge/api-v3/issues/249)) ([f12edcb](https://github.com/centrifuge/api-v3/commit/f12edcb6e921c5c10f5bf75b47f54fd0d9c788f5))
* chain not found on new 3_1  deploy vaults ([#247](https://github.com/centrifuge/api-v3/issues/247)) ([bc927ec](https://github.com/centrifuge/api-v3/commit/bc927eca91c730cbb1c65e0f3ca77543e431b4dc))
* little change to test ci ([6a7c01b](https://github.com/centrifuge/api-v3/commit/6a7c01b556aa5a9db851b73a727f4d5458cd4c30))

## [3.0.0](https://github.com/centrifuge/api-v3/compare/v2.1.0...v3.0.0) (2026-02-06)


### ⚠ BREAKING CHANGES

* unify naming of timestamp fields across entities

### Features

* add adapter wiring information ([#203](https://github.com/centrifuge/api-v3/issues/203)) ([6fefb13](https://github.com/centrifuge/api-v3/commit/6fefb13255549dad2e7a6ad6034a4914c0f88ee8)), closes [#200](https://github.com/centrifuge/api-v3/issues/200)
* add originating txHash to default entity fields ([#202](https://github.com/centrifuge/api-v3/issues/202)) ([ab0aedc](https://github.com/centrifuge/api-v3/commit/ab0aedc0e321c07acef125d09311a4550c051b66)), closes [#191](https://github.com/centrifuge/api-v3/issues/191)
* add urls and ipfs pinnend symbold ([#244](https://github.com/centrifuge/api-v3/issues/244)) ([de74050](https://github.com/centrifuge/api-v3/commit/de740502b6bb7a695cd409525d5d25188627dcd9))
* allow protocol overlapping period ([#233](https://github.com/centrifuge/api-v3/issues/233)) ([0f5e225](https://github.com/centrifuge/api-v3/commit/0f5e2252985ae4042af6833463a8b6a77e9614f5))
* architecture for concurrent indexing of V3 and V3.1 indexing logic Fixes [#161](https://github.com/centrifuge/api-v3/issues/161) ([a12fb55](https://github.com/centrifuge/api-v3/commit/a12fb555ad2c5a0dbf00c9323df2d6fe98315912))
* improve crosschain messaging ([813d33e](https://github.com/centrifuge/api-v3/commit/813d33e5fb74c89d2cde42d7b96b36768923305a))
* improved logging ([594683d](https://github.com/centrifuge/api-v3/commit/594683d2fadccf73ef401d588a925a92198d3a8e))
* index v3.1 ([#208](https://github.com/centrifuge/api-v3/issues/208)) ([a89c210](https://github.com/centrifuge/api-v3/commit/a89c210af306b27ff13ac0ebd10f1c274d80cd2b))
* ops improvements ([#243](https://github.com/centrifuge/api-v3/issues/243)) ([d56fe06](https://github.com/centrifuge/api-v3/commit/d56fe06826715cda560674f57e062be75c115606))
* optimized prod logging ([fc31e52](https://github.com/centrifuge/api-v3/commit/fc31e5259d88e9cdbcf478130d3df314ee8e6341))
* run v3.1 only indexer ([#226](https://github.com/centrifuge/api-v3/issues/226)) ([11263d1](https://github.com/centrifuge/api-v3/commit/11263d1d5a17eef831b1a418edf2f4a926c09c26))
* unify naming of timestamp fields across entities ([8385ea8](https://github.com/centrifuge/api-v3/commit/8385ea88f05d738212ac503bd49a233fce3fbf23))
* update deployments to include new contracts ([e83e6ee](https://github.com/centrifuge/api-v3/commit/e83e6ee9e53e11b0c8d90c7b6260a460f2981c27))
* upgrade to ponder 0.15.17 ([a12fb55](https://github.com/centrifuge/api-v3/commit/a12fb555ad2c5a0dbf00c9323df2d6fe98315912))
* user order structure ([#212](https://github.com/centrifuge/api-v3/issues/212)) ([150aecc](https://github.com/centrifuge/api-v3/commit/150aecc110d6a64793707d9d0735f1ac02a295ed))


### Bug Fixes

* add update on approve ([#223](https://github.com/centrifuge/api-v3/issues/223)) ([c3e54d9](https://github.com/centrifuge/api-v3/commit/c3e54d9b0b49e831277f35322955fa0f64aebce5))
* allow to select chains in contracts ([20419ae](https://github.com/centrifuge/api-v3/commit/20419ae3bb7851dfaea81980f8d3937b6bffe3b8))
* cache should skip unsupported commands ([b4405fd](https://github.com/centrifuge/api-v3/commit/b4405fdf41f77a2a7e2f33306b75392bdec0b180))
* filter out reduntant txin + txout for invest redemption orders ([50e980e](https://github.com/centrifuge/api-v3/commit/50e980ee935ac3e385813e8921d365506921dd0d))
* filter out reduntant txin + txout for invest redemption orders ([3efd3b2](https://github.com/centrifuge/api-v3/commit/3efd3b22ad0f5bfe420ada87d01fbfba65a1788b))
* imissing icons ([1031051](https://github.com/centrifuge/api-v3/commit/1031051f4c5a19523857eda6e809ef367e87b69d))
* improved logging and graceful handling of exceptions ([e2e8f9e](https://github.com/centrifuge/api-v3/commit/e2e8f9e248126f5a7d8658dd04e38c35ab7c55ef))
* inconsistency in pendingInvestOrders ([#216](https://github.com/centrifuge/api-v3/issues/216)) ([59ca557](https://github.com/centrifuge/api-v3/commit/59ca5575487cf960f3418c8873f55fbe046d06ba)), closes [#214](https://github.com/centrifuge/api-v3/issues/214)
* investor and redeem orders precision fix ([#188](https://github.com/centrifuge/api-v3/issues/188)) ([16a8615](https://github.com/centrifuge/api-v3/commit/16a8615038ca09c3b43f311c16229ee37e228f02))
* issue and revoke conversions ([1435215](https://github.com/centrifuge/api-v3/commit/1435215565fd2412d4401049fe1ee7c28e36ad67))
* load correct abis for chain requests ([9e0500e](https://github.com/centrifuge/api-v3/commit/9e0500e4131b959221c742ef825dfe66533bab69))
* mainnet registry ([132e22c](https://github.com/centrifuge/api-v3/commit/132e22c895c69ebbe631cf2c309c098994693db4))
* missing dependencies in prod ([e9b59bd](https://github.com/centrifuge/api-v3/commit/e9b59bd54ed1c8990738511ef396b15295fc557f))
* missing setup handlers ([d44eb75](https://github.com/centrifuge/api-v3/commit/d44eb75510e6bb563b66d33779cbf8b7d61f4147))
* missing several txHashes in Invest and Redeem Orders as well as epoch ([8385ea8](https://github.com/centrifuge/api-v3/commit/8385ea88f05d738212ac503bd49a233fce3fbf23))
* missing several txHashes in Invest and Redeem Orders as well as epoch ([#205](https://github.com/centrifuge/api-v3/issues/205)) ([8385ea8](https://github.com/centrifuge/api-v3/commit/8385ea88f05d738212ac503bd49a233fce3fbf23))
* missing token decimals in V3.1 ([#213](https://github.com/centrifuge/api-v3/issues/213)) ([b8bd839](https://github.com/centrifuge/api-v3/commit/b8bd83930df4a8126e89ed73f1546ba04fb05b9a))
* multiple instances of failing claims ([a97c900](https://github.com/centrifuge/api-v3/commit/a97c9009f58c4d0bcd4f1450d0048ce62516899e)), closes [#201](https://github.com/centrifuge/api-v3/issues/201)
* multiple instances of failing claims ([#207](https://github.com/centrifuge/api-v3/issues/207)) ([a97c900](https://github.com/centrifuge/api-v3/commit/a97c9009f58c4d0bcd4f1450d0048ce62516899e))
* negative tokenInstance balance ([#190](https://github.com/centrifuge/api-v3/issues/190)) ([1435215](https://github.com/centrifuge/api-v3/commit/1435215565fd2412d4401049fe1ee7c28e36ad67))
* onchain sync vault bug ([#228](https://github.com/centrifuge/api-v3/issues/228)) ([352337f](https://github.com/centrifuge/api-v3/commit/352337fb0d05a89c85125d4040097de7e9867dfc))
* refine Invest and Redeem Orders ([#210](https://github.com/centrifuge/api-v3/issues/210)) ([6ef36b0](https://github.com/centrifuge/api-v3/commit/6ef36b040a98d8a52509473a5ceb64dc9139d820)), closes [#209](https://github.com/centrifuge/api-v3/issues/209)
* registry defaults ([e3db503](https://github.com/centrifuge/api-v3/commit/e3db503d78ce8c1c9e9e42adc3c9378dbf6fbf79))
* registry details ([8b6b40e](https://github.com/centrifuge/api-v3/commit/8b6b40e96f6d15c202e97cb812370873fcac2340))
* remove unused imports ([d28cdd1](https://github.com/centrifuge/api-v3/commit/d28cdd100a46f12511cfc5c82705cfef5acca61e))
* require glibc image ([95083b8](https://github.com/centrifuge/api-v3/commit/95083b803d032d612e5d2648d3c4b60f4e790a99))
* track upon vault events correctly ([#225](https://github.com/centrifuge/api-v3/issues/225)) ([9d0b619](https://github.com/centrifuge/api-v3/commit/9d0b6195568d4764e9284e559e19bf7fd7046ff8))
* unify inclusion of tx hashes ([8385ea8](https://github.com/centrifuge/api-v3/commit/8385ea88f05d738212ac503bd49a233fce3fbf23))
* v3.1 phantom pendingInvestOrder ([#242](https://github.com/centrifuge/api-v3/issues/242)) ([cabecac](https://github.com/centrifuge/api-v3/commit/cabecac7eaa4bcb09bd142e31d21c5e1a63c67fc))
* vaultInvestOrder claimable in asset denomination ([#218](https://github.com/centrifuge/api-v3/issues/218)) ([044db99](https://github.com/centrifuge/api-v3/commit/044db992671863716acdea216f54aa705158003d)), closes [#217](https://github.com/centrifuge/api-v3/issues/217)

## [2.1.0](https://github.com/centrifuge/api-v3/compare/v2.0.0...v2.1.0) (2025-11-18)


### Features

* add asset relationship in InvestorTransactions with currency amounts ([#182](https://github.com/centrifuge/api-v3/issues/182)) ([ac05de6](https://github.com/centrifuge/api-v3/commit/ac05de63116dee7eb03e21ec3e54b742d843e5df)), closes [#177](https://github.com/centrifuge/api-v3/issues/177)
* add bsc to indexer ([#143](https://github.com/centrifuge/api-v3/issues/143)) ([3f2f0d6](https://github.com/centrifuge/api-v3/commit/3f2f0d602330fe0df9c0cb62f1b118649693a0e1))
* add decimals to token ([#163](https://github.com/centrifuge/api-v3/issues/163)) ([80e16ef](https://github.com/centrifuge/api-v3/commit/80e16ef24d21577b766add0ce1724236a8010924))
* add hardcoded v2 investors ([#185](https://github.com/centrifuge/api-v3/issues/185)) ([6e123ff](https://github.com/centrifuge/api-v3/commit/6e123ff241cbc8c15121a0577f22dfc519639690))
* add issuance api ([#112](https://github.com/centrifuge/api-v3/issues/112)) ([d52bd8e](https://github.com/centrifuge/api-v3/commit/d52bd8ef2956d3dc3d98de9036b33496d9257877))
* add message preparation and execution hash ([#166](https://github.com/centrifuge/api-v3/issues/166)) ([ba6b136](https://github.com/centrifuge/api-v3/commit/ba6b136b5e34d8c9b8515e3e7d6807ead9176157))
* add rawData to payload for underpaid retry ([#149](https://github.com/centrifuge/api-v3/issues/149)) ([7727882](https://github.com/centrifuge/api-v3/commit/7727882a56a27169da26d7e1f73c825fa93c9c0f))
* add revokedPoolAmount to redeemOrders ([#184](https://github.com/centrifuge/api-v3/issues/184)) ([24abc28](https://github.com/centrifuge/api-v3/commit/24abc28bdb7322fa30b5db3f12ad16ea1e4fa208))
* enable sql over http ([#181](https://github.com/centrifuge/api-v3/issues/181)) ([03afecd](https://github.com/centrifuge/api-v3/commit/03afecdd643865a6c583b01c682b861eb4b1c2e8))
* holding escrow snapshots upon redeem and deposit approvals for non zero asset holdings ([#142](https://github.com/centrifuge/api-v3/issues/142)) ([f502ca5](https://github.com/centrifuge/api-v3/commit/f502ca5666509652ddea0bd63806c13928bbac2f))
* HoldingEscrow snapshots ([d487c6c](https://github.com/centrifuge/api-v3/commit/d487c6cc125f5a3aa5129fc20d6bb41709b14724))
* index fail reason ([#170](https://github.com/centrifuge/api-v3/issues/170)) ([4e91aef](https://github.com/centrifuge/api-v3/commit/4e91aef9e3b57bf8917f5075c7f15d339d440aa4))
* index spoke chains per pool ([#173](https://github.com/centrifuge/api-v3/issues/173)) ([8b19772](https://github.com/centrifuge/api-v3/commit/8b19772ed2f4c07f8ebc90bd18ea3c62bb169105))
* track sync orders in epoch and investor orders ([#147](https://github.com/centrifuge/api-v3/issues/147)) ([a8e29d8](https://github.com/centrifuge/api-v3/commit/a8e29d85897497b16cdd6e95f302c1070e69eb9b))
* update ponder 0.15.4 ([6e57dee](https://github.com/centrifuge/api-v3/commit/6e57deea9ec6d81bd9a4ec5e983d7efa30991aea))
* upgrade ponder to 0.14.13 ([9b4198a](https://github.com/centrifuge/api-v3/commit/9b4198a6ef87b0d5249425a3ab407d72bdb9a845))
* upgrade to ponder 0.15.1 ([831760b](https://github.com/centrifuge/api-v3/commit/831760b642de8595b7819693b81a965b96b90cb2))
* upgrade to ponder 0.41 ([a2ce305](https://github.com/centrifuge/api-v3/commit/a2ce305b98544e1e2537ab9ef5eb3a320747595c))
* use registry from IPFS to load chain data and ABIs ([#172](https://github.com/centrifuge/api-v3/issues/172)) ([2dda9c2](https://github.com/centrifuge/api-v3/commit/2dda9c2af9ac21526638948bd41cb695bd0f6066))


### Bug Fixes

* correctly set prepareTxHash and deliveryTxHash ([#167](https://github.com/centrifuge/api-v3/issues/167)) ([6715e40](https://github.com/centrifuge/api-v3/commit/6715e40aed389fc760dd6f4f1f880526c5066b10))
* decoding of all messages ([#169](https://github.com/centrifuge/api-v3/issues/169)) ([9ecb98c](https://github.com/centrifuge/api-v3/commit/9ecb98c3aa2ac51429663862d74398d963c525cc))
* defaults and env for build process ([#175](https://github.com/centrifuge/api-v3/issues/175)) ([b89e7d1](https://github.com/centrifuge/api-v3/commit/b89e7d12b8d529df1c0ddfc9384b5d16f989d6e3))
* formatting of issuance data ([#179](https://github.com/centrifuge/api-v3/issues/179)) ([872145d](https://github.com/centrifuge/api-v3/commit/872145d9e961a0aed45f8395d2d1dfd37daf438f))
* handling of proofs and initialization of underpaids in crosschain messages ([221eb47](https://github.com/centrifuge/api-v3/commit/221eb47f035e26c647516b5146f8b77bc94a5338))
* holding escrow does not populate on UpdateAssetPrice ([#141](https://github.com/centrifuge/api-v3/issues/141)) ([d487c6c](https://github.com/centrifuge/api-v3/commit/d487c6cc125f5a3aa5129fc20d6bb41709b14724))
* inverted share price calculation in investor transactions ([#187](https://github.com/centrifuge/api-v3/issues/187)) ([05d00f8](https://github.com/centrifuge/api-v3/commit/05d00f80ea6e8fbc024adeb6395f153fa4a97a69))
* invest order issue shares decimals ([#186](https://github.com/centrifuge/api-v3/issues/186)) ([fe067f0](https://github.com/centrifuge/api-v3/commit/fe067f08c21de47ae7baff42ecec52e75317afde))
* issuance tracking for v2 tokens ([#178](https://github.com/centrifuge/api-v3/issues/178)) ([ed29a8b](https://github.com/centrifuge/api-v3/commit/ed29a8b119d7cfc6e03f69ad5a7551a07cb06e82))
* plume skip block parameter ([ae747fe](https://github.com/centrifuge/api-v3/commit/ae747feffb6b2355fb74babb6b1b540e5b1e73a9))
* redeem amounts ([#183](https://github.com/centrifuge/api-v3/issues/183)) ([b3b9158](https://github.com/centrifuge/api-v3/commit/b3b9158f1135e9d49aa17c902e52b54b7c803821))
* repaid messages stuck as unsent ([#150](https://github.com/centrifuge/api-v3/issues/150)) ([2500708](https://github.com/centrifuge/api-v3/commit/250070873e46d9a3dbb1564e9a52fe80bc0d2f63))
* underpaid batches should look for already prepared messages ([#165](https://github.com/centrifuge/api-v3/issues/165)) ([0e94269](https://github.com/centrifuge/api-v3/commit/0e94269b4da0fb39ce7173718f176496092f45ea))
* undo rename of blockchain to hub blockchain ([#174](https://github.com/centrifuge/api-v3/issues/174)) ([9c85e08](https://github.com/centrifuge/api-v3/commit/9c85e08932fe6f761d85cee554489c688fcb4fdf))
* updated OnOffRampManager ABI ([b9b8817](https://github.com/centrifuge/api-v3/commit/b9b8817e1b5c7df3609bf84cd3444abe7cde09e1))

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
