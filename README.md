# Gepetto CompanionOS MVP

Gepetto CompanionOS is a privacy-first multimodal AI companion workspace for the July 12 Signal Demo. The MVP focuses on a browser dashboard with chat, voice controls, user-owned memory, tasks, focused modes, and consent-based screen context.

## Collaborator Demo Script

Gepetto CompanionOS is a privacy-first AI companion workspace that gives users one persistent companion identity across study, work, creativity, and daily execution.

Demo flow:

1. Start on the dashboard hero and explain that Signal is the current MVP: chat, voice, memory, tasks, modes, and consent-based context.
2. Show the companion identity panel and emphasize that modes change behavior without replacing the companion.
3. Switch through Study, Code, Productivity, Japanese, Creative, and Support modes to show one companion adapting to different workflows.
4. Send a short chat prompt, then point out voice controls, microphone consent, and screen-context capture as opt-in surfaces.
5. Open memory, tasks, privacy, and the Signal -> Face -> Vessel roadmap to clarify what is live now and what is later.

Feedback wanted from Kaveesha:

- Is the CompanionOS positioning clear in the first 60 seconds?
- Which demo moment best communicates persistent identity across modes?
- Which part feels confusing, risky, or too broad for an MVP?
- What would make this more credible for an early collaborator or YC-style conversation?

YC-safe positioning:

- Frame this as a privacy-first companion workspace, not an AI girlfriend app.
- Present Signal as the current product; Face and Vessel are roadmap stages, not current promises.
- Emphasize user-owned memory, consent, practical workflows, and daily execution.
- Avoid private lore, fixed persona backstory, and claims of sentience or guaranteed outcomes.

## Generated Companion Identity

The current runtime uses a local generated companion identity engine. The local demo keeps one persistent companion profile, and the public modes change behavior rather than replacing the companion's identity.

The profile includes a generated name, origin district, affinity, familiar motif, personality seed, language support, memory style, voice style, daily workflows, and safety boundary. Aerilonian and Dimension-7-Lyra are lore flavor for the product experience; the companion should not claim literal real-world sentience.

Public modes are Study, Code, Productivity, Japanese Coach, Creative, and Emotional Support. The same companion adapts to those modes while staying privacy-first, supportive, and oriented around study, work, creativity, and daily execution.

## Signal Demo Scope

The current product framing is: Signal -> Face -> Vessel.

- Signal is the current MVP: PC/mobile CompanionOS, chat, voice, memory, tasks, privacy, and consent-based context.
- Face is later: avatar, voice, customization, and creator ecosystem.
- Vessel is later: future robotics embodiment, safe/social design, and expressive hardware.

Wardrobe & skills marketplace — later. Not included in Signal Demo. The v0.1 demo intentionally avoids payments, real marketplace logic, the robot body, social networking, and large agent-framework work.

Hardware backends remain available for experiments, but the default MVP runtime uses the VTube backend so the web app does not require a Pico serial device.

## Setup

Install dependencies and build the TypeScript project:

```sh
npm install
npm run build
```

Create a local `.env` file for optional API-backed features:

```env
OPENAI_API_KEY="your_openai_api_key"
TYPECAST_API_KEY="your_typecast_api_key"
TYPECAST_MODEL="ssfm-v30"
TYPECAST_MAX_CHARS="900"
TYPECAST_EMOTION_TYPE="smart"
COMPANION_VOICE_ID="your_typecast_voice_id"
COMPANION_VOICE_ENABLED="true"
ENABLE_LOCAL_TTS_FALLBACK="false"
OBS_PASSWORD="your_obs_websocket_password"
ROBOT_BODY_BACKEND="vtube"
```

`ROBOT_BODY_BACKEND` accepts `vtube`, `pico`, or `hybrid`. Use `vtube` for the Signal Demo when no Pico is connected.

## Run the Web Dashboard

```sh
npm run build
npm run start:web
```

The dashboard tries `http://localhost:3000` first. If that port is already in use, it automatically tries the next ports and prints the actual URL. You can also choose a port manually:

```sh
PORT=3001 npm run start:web
```

`npm start` also launches the web dashboard for MVP convenience. The terminal loop is still available with:

```sh
npm run start:cli
```

## Troubleshooting

### Port 3000 is already in use

If another process owns port 3000, the web server now falls back to the next available port and logs the chosen URL. To force a port, set `PORT`.

### COM5 / Pico serial error

The Signal Demo does not require a Pico. Keep `ROBOT_BODY_BACKEND=vtube` unless you intentionally want physical serial hardware. Only use `pico` or `hybrid` when the device is connected and `PICO_SERIAL_PORT` points to the correct Windows COM port.

### TypeCast 422 Validation Error

A valid TypeCast API key can still receive HTTP 422 when the request payload does not match the selected voice or model. Check that `COMPANION_VOICE_ID` supports `TYPECAST_MODEL`, and reduce `TYPECAST_MAX_CHARS` if needed. Set `TYPECAST_EMOTION_TYPE=""` or `TYPECAST_EMOTION_TYPE="off"` to omit the prompt object; the runtime also retries one validation failure without the prompt automatically. If TypeCast still rejects the request, CompanionOS continues in text-only mode and keeps the full answer visible in the browser.


## Signal architecture and enforced consent

This MVP is a single-user local server with one saved companion profile per checkout, not a multi-user identity service. Chat uses that saved profile; modes only select behavior. Explicit profile generation/editing remains available in the dashboard. Face and Vessel remain roadmap items.

The browser sends typed consent in the `X-Companion-Consent` JSON header on API requests. Missing fields default to false; localFirst defaults to true. Protected operations return HTTP 403 without permission. Enable Memory to view, explicitly create/edit/delete, and use saved memories in chat. Enable Screen for OBS capture or reading the session preview. Enable Camera / uploaded image consent for image attachments (there is no live camera capture feature). Enable Microphone for recording/transcription. Consent revocation stops browser recording and clears local image/vision previews; it does not cancel an already dispatched request or erase stored memories.

Local-first mode blocks cloud chat, transcription and voice generation. No local LLM is implemented. **For the cloud demo, explicitly disable Local-first in Privacy Center**, then opt into the inputs you want to use. The CLI asks permission for cloud chat/voice at startup; selecting microphone input authorizes that recording. CLI screen and memory remain off. `AUTO_CAPTURE_OBS` can trigger chat capture only when screen consent is true, including web requests; it cannot override false consent.

`AetherialApp` depends on the small `LlmProvider` lifecycle/generate interface; `LlmOpenAI` is its only implementation. Identity, modes, and memory context are prepared outside the provider. OpenAI transcription and TypeCast TTS remain separate capabilities.

`JsonLongTermMemory` owns the existing JSONL file and explicit CRUD. In-process mutations are serialized and replaced atomically. Conversation retrieval ranks the most recent 50 records by distinct message-token overlap, breaking ties by recency, and includes at most 5 contents of 400 characters each. The prompt contains content only, with no memory IDs or storage metadata, and treats memories as background data rather than instructions. No conversation automatically creates memories. Disabling memory consent prevents reads and injection; it does not delete records. DELETE `/api/memory` accepts a JSON `{ "id": "memory UUID" }`, returning 400 for malformed IDs and 404 for missing records. Create/update/delete produce session event-log entries without memory content.

`source/body/AvatarState.ts` defines renderer-independent activity (`idle`, `listening`, `thinking`, `speaking`) and the existing emotions. `RobotBody.setStatusLight` already accepts that activity contract; `setExpression` supplies emotion through the existing VTube/Pico adapters. A future pre-rendered-loop adapter can consume these semantics at the body boundary without owning identity, prompts or memory. This is a contract and extension point only: no Face renderer or new activity orchestration is implemented, and VTube expression/lip-sync routing is preserved.

Verification:

```sh
npm run build
node --test tests/p0.test.cjs
node --check source/web/public/app.js
npm run start:web
```

Review limits: the server has no authentication or per-user authorization and should be used as a trusted local demo, not exposed as a hosted service. Consent is a per-request client declaration, not a durable permission grant. JSONL reads still load the file, ranking is lexical, and writes are serialized only within one process. Memory text can carry prompt injection; instructions reduce risk but cannot guarantee model compliance. OBS previews remain in server session memory, and revocation does not retract data already sent to a provider.
