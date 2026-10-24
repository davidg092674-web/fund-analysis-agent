# FundLens unattended refresh · revision 1

The owner requested daily cloud updates without a home computer. This workflow is for the owner-private FundLens Site identified in `.openai/hosting.json`.

1. Call Sites `get_site` for the linked Site. Confirm the owner-private access policy is unchanged. Obtain the supported service bearer in memory; do not persist or log it. A service caller has no visitor identity and must use the shared updater below, never forge visitor headers.
2. GET `/api/jobs/instructions` using `OAI-Sites-Authorization: Bearer <in-memory service bearer>`. This reads the saved workflow revision independently of the authoring chat.
3. POST `/api/jobs/refresh` using that service access. The server enumerates the private watchlist, obtains each code's historical unit NAV through the saved Eastmoney adapter, computes descriptive reports, and preserves the first snapshot for each user, code and NAV date. No orders, paid AI calls, repository writes or publishing are part of routine updates.
4. GET `/api/jobs/status` using the same service access. Verify the latest generatedAt and code-level results match the write. Distinguish successful HTTP delivery from per-fund source errors. No funds is a valid empty update, not an instruction to seed sample funds.
5. If a response is uncertain, read status before retrying. Snapshot insertion is idempotent. Do not rebrand one upstream as independently verified data, invent NAV or turn observations into automatic buy/sell instructions. Report failures concisely with the affected code and cause.

The schedule should run daily at 22:30 Asia/Hong_Kong unless the owner changes it. Published NAV can still lag at that time, especially QDII/FOF. Retain reported NAV dates and data-quality flags. The schedule being saved does not prove a later scheduled occurrence has run.

For verification, `/api/jobs/probe?code=<six-digit-code>` reads an actual public provider dataset without adding a watchlist entry or user report. It only populates the public NAV cache. This is intended for source-readiness checks through owner-private platform service access.
