# Robotics study session

This slice completes one offline learning-to-task workflow in the current TypeScript/Node.js application. No new dependencies or character, model, voice, or other media assets are included.

## Architecture

- `StudyService` provides two fixed exercises: an active right-handed z rotation and planar two-link forward/inverse kinematics. A session holds a topic and question; a scored record adds the student's answer, component feedback, score, worked steps, and a suggested review date. Inputs are strict numeric tuples, including numeric fractions, with a 0.001 component tolerance. Full credit suggests review in three days; partial credit in one day. Sessions expire after 30 minutes and are capped at 100 in memory.
- `StudyRecordStore` stores explicitly saved records in ignored `data/study/records.json`. Independent `study` consent defaults to false, is checked before reads/writes, and is never restored affirmatively on a browser reload. Records are inspectable/deletable through the study panel. Serialized atomic replacements protect in-process mutations; corrupt files and write failures are surfaced, never silently replaced with empty data.
- `SkillActionRouter` accepts typed `study.save`, `study.delete`, and `task.create` requests. Runtime validation and consent authorization precede fixed risk assessment and explicit approval. Saves/tasks carry `caution` risk; deletion and external tools carry `dangerous` risk. All local mutations require `approved === true`. External tool requests are always denied; no external executor is registered. Unknown actions/fields fail closed.
- The router's newest 100 outcomes are inspectable at `GET /api/study/audit`. Its audit contains action, risk, status, reason, ID and time only. It lives in process memory so auditing does not silently persist answers, memories, or tool arguments. Denials, requests needing approval, and failures are audited alongside successes.
- `TaskStore` extracts the existing dashboard task JSON array without changing its path or ordinary API response shapes. It serializes atomic mutations and re-reads the complete saved task before returning success. A study record's ID prevents duplicate review tasks on retries. Only the review suggestion and suggested date are copied into Tasks; the student's answer is not copied. The browser also refreshes Tasks and matches the returned ID/title before claiming success.
- `study-session.js` renders plain-text mathematical matrices and intermediate steps in a scrollable panel in the existing conversation area. The chat, composer, identity, Live2D canvas and audio remain mounted. `StudyExpression` uses the existing avatar types: question → idle/neutral, answer focus → listening/neutral, scoring → thinking/neutral, full credit → idle/amazed, retry → idle/neutral. These are browser presentation cues; listening does not capture audio. Existing voice ownership takes precedence. No study operation commands physical hardware or synthesizes speech.
- Study routes never initialize `AetherialApp`, query private memories, contact an LLM, or capture media. The `LlmProvider` contract, OpenAI implementation, companion prompt/identity generation, voice, and hardware adapters remain intact. Existing consent gates still protect cloud features. The server remains bound to `127.0.0.1`; direct loopback Host, same-origin Origin and Fetch Metadata checks precede request processing.

## Manual demo

1. Run `npm install`, `npm run build`, and `npm run start:web`. Open the printed `http://localhost:<port>` URL. Leave Local-first enabled and media/memory consent off. An API key is unnecessary for this workflow. An authorized local Live2D model is optional; the existing setup message remains visible when none is installed.
2. Open **Robotics study** above the conversation. Select **Robotics rotation matrices**, then **Start session**. Enter `0, 1, 0` and choose **Check answer**. Expect 3/3, the symbolic rotation matrix, substitution at 90°, row products, and a review suggestion.
3. Choose **Review & create task**, inspect the exact title/details/date, then approve. Expect a verified task ID. Choose **Inspect tasks** to see the same task in the existing task list. Retrying creation for this result should return that same task. Restart the server and check Tasks to verify persistence.
4. Start another session with **Planar forward and inverse kinematics**. Enter `1, 1, 0, 90` for 4/4. Start again with `1, 0, 0, 90` for partial credit and targeted feedback. Malformed tuples should show a validation error without completing the session.
5. Before granting study consent, **Review & save result** is disabled. Open **Privacy and permissions**, enable **Local study records**, close settings, then choose **Review & save result** and approve. Expand **Saved study records**, choose **Inspect saved records**, and inspect the answer, feedback, steps and review.
6. Revoke access in Privacy. Saved results disappear from the browser and later reads/saves are forbidden. Existing records remain on disk. Re-enable study access, inspect records, choose **Delete saved record**, review and approve. Refresh to confirm removal; created tasks are retained separately. Reloading the page requires a fresh study grant.
7. Cancel a confirmation and confirm nothing is created. Close/reopen the study panel during scoring; it should preserve the result without overriding the hidden panel's avatar presentation. Existing chat modes, profile editing, Live2D settings and voice controls remain available.

## Validation

Run:

```sh
npm run build
npm test
node --check source/web/public/app.js
node --check source/web/public/study-session.js
```

Tests cover numeric scoring/partial credit and malformed inputs; session expiry/capacity/retries; consent defaults, revocation, in-flight stale UI responses and local CRUD; approval, external-tool denial and audit privacy; restart persistence, duplicate prevention, concurrent task mutations, corruption and write failures; an HTTP learning-to-task flow and regression consent/network boundaries. Existing identity, provider, voice, avatar lifecycle, renderer and navigation suites also run. Exact execution results are recorded in the PR description.

Validation on 2026-10-29: `npm run build` passed; `npm test` passed 119 tests with zero failures/skips; both JavaScript syntax checks passed. A real browser showed the rotation exercise scoring 3/3 and the complete worked matrix steps. Browser automation timed out at the native task confirmation dialog, so that manual confirmation and subsequent browser actions were not verified. HTTP and DOM behavior tests cover the complete approved task workflow and save/inspect/delete/revocation paths.

## Limits and untested integrations

- There is one fixed question per topic. Scoring checks numeric components, not written derivations or general robotics mastery. Plain Unicode/preformatted mathematics has no LaTeX engine or remote rendering service.
- Suggested dates are displayed and copied into task details. There is no scheduler, notification delivery, calendar integration, external tool access, autonomous agent loop or physical motion implementation.
- This remains a single-user trusted local demo, without authentication. Consent and approvals are client declarations per request. A local client can assert them; this is not identity-based authorization. Revocation blocks subsequent access and suppresses stale browser responses; it does not undo an already dispatched write or erase existing records. Re-enable study consent to inspect/delete saved records. Tasks have independent persistence through an explicit task-creation approval.
- Atomic storage is serialized within one server process. Multiple processes sharing a data directory, crash/power-loss durability, file encryption, very large histories and OS-specific permission combinations are not covered. Volatile sessions/audit disappear on restart. Task persistence survives restart; tasks are idempotent for the same scored record ID.
- Paid OpenAI/TypeCast calls, real microphone/camera/OBS capture, authorized proprietary Live2D assets, VTube Studio, Pico/serial hardware, and other physical backends require separately configured live integration checks. Automated tests use mocks/fixtures for those integrations.
