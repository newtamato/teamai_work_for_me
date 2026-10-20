# UNO player statistics (Redis-first)

## Storage

The aggregate is stored in the existing profile hash `wuno:player_info:{userid}` and is read through `PlayerInfo::GetFields` by the Assist `PlayerInfoResp` query. It is exposed as `experience`, `play_1v1`, `win_1v1`, and `total_win_coin`. Nickname/avatar APIs remain unchanged.

- `experience`: add configured `expPerGame` on settlement for every participant.
- `play_1v1`: add one when UnoGame::Start succeeds; matching/reconnect do not increment.
- `win_1v1`: add one for rank 1 or 2, including a zero-coin winner.
- `total_win_coin`: add max(final settlement coin_delta, 0). Not balance or net profit; entry fees are not deducted here.

Currently all games correspond to EBC_Normal. Human and robot participants are both counted; disconnected players do not depend on a live User lookup for the stats update.

## Events and deployment

`wuno:player_game_stats_events:{boutid}` stores `{userid}:start` and `{userid}:settle` markers. A Lua script atomically deduplicates and increments the profile hash. Markers currently have no TTL; plan archival after MySQL event persistence rather than expiring them while old events can still be replayed.

The game start snapshots `expPerGame` from `uno_level_config.json` alongside the executable. `scripts/build-caiisvr-linux.sh` copies the canonical `caiisvr/config/uno_level_config.json` to that location. Missing/invalid experience config refuses to start before charging the entry fee. Current value is 20. Manual deployment must also copy this JSON.

Writes retry up to three times with the same event ID. Settlement also retries the start event (idempotently), recovering a temporary Redis outage at start. Prolonged outages are logged with `UNO_STATS` and currently require reconciliation: there is no durable local outbox or automatic replay after process restart. Redis persistence/backup and no-eviction settings must be configured operationally. Statistics count settlement results, not confirmed downstream wallet postings.

Future MySQL mapping: `tbl_player_bout_info.total/win` with EBC_Normal, `tbl_player_win.win_coin`; experience schema still needs confirmation. Synchronization must not feed the same event into both legacy stats writers and this writer without deduplication.

## Verification

`python scripts/test-uno-player-stats.py` runs the actual embedded Lua on a temporary isolated Redis Unix socket, never the production Redis. Tests include duplicate start/settlement, top-two zero-reward wins, experience for losing players, cumulative games/coins, and no TTL. Game server compilation is separate; live start/settlement testing still required.
