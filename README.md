# Aetherial-Eve — Multimodal Desktop AI Assistant

Aetherial-Eve is a TypeScript/Node.js system integrating LLM interaction, speech-to-text, text-to-speech, OBS WebSocket screen capture, VTube Studio expression control, serial-device communication, and a browser-based interface. The project focuses on modular integration, multimodal interaction, and deployment-oriented prototyping.

The current application is presented as the **Gepetto CompanionOS MVP**, a privacy-first workspace developed for the July 12 Signal Demo. Its browser workspace opens directly into a large animated Live2D companion and conversation, with voice, user-owned memory, tasks, focused modes, and consent-based screen context.

## Engineering Scope

- **Language and interaction:** OpenAI-backed LLM integration with mode-aware prompts and persistent, user-controlled companion profiles.
- **Audio:** microphone capture for speech-to-text plus cloud and local text-to-speech adapters.
- **Visual context:** user-initiated image uploads and consent-based OBS WebSocket screen capture.
- **Expression and hardware:** local Live2D rendering, optional VTube Studio expression control, and optional serial communication with a Raspberry Pi Pico.
- **Interface and deployment:** a browser dashboard, a CLI runtime, environment-based configuration, and selectable hardware backends.

## Security and Control Boundaries

This repository is a research prototype, not a system administration or endpoint-control product. Screen context is captured only through an explicit user action, saved memories can be reviewed or deleted, and potentially destructive OpenClaw operations require confirmation. Physical serial control is optional and disabled by the default `native` backend.

Legacy experimental modules are retained for provenance but are not part of the default dashboard startup path. Review and isolate optional integrations before enabling them, use least-privilege credentials, and never commit secrets from `.env`.

## Collaborator Demo Script

Gepetto CompanionOS is a privacy-first AI companion workspace that gives users one persistent companion identity across study, work, creativity, and daily execution.

Demo flow:

1. Start in the companion workspace with the Live2D avatar, conversation, and message composer visible together.
2. Open the top-right settings menu and show Companion Identity. Modes change behavior without replacing the companion.
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
- Present Signal and the initial local Live2D slice as the current product; expanded Face and Vessel features remain roadmap work.
- Emphasize user-owned memory, consent, practical workflows, and daily execution.
- Avoid private lore, fixed persona backstory, and claims of sentience or guaranteed outcomes.

## Generated Companion Identity

The current runtime uses a local generated companion identity engine. The local demo keeps one persistent companion profile, and the public modes change behavior rather than replacing the companion's identity.

The profile includes a generated name, origin district, affinity, familiar motif, personality seed, language support, memory style, voice style, daily workflows, and safety boundary. Aerilonian and Dimension-7-Lyra are lore flavor for the product experience; the companion should not claim literal real-world sentience.

Public modes are Study, Code, Productivity, Japanese Coach, Creative, and Emotional Support. The same companion adapts to those modes while staying privacy-first, supportive, and oriented around study, work, creativity, and daily execution.

## Signal Demo Scope

The current product framing is: Signal -> Face -> Vessel.

- Signal is the current MVP: PC/mobile CompanionOS, chat, voice, memory, tasks, privacy, and consent-based context.
- Face has an initial local Live2D avatar slice; expanded customization and a creator ecosystem remain later work.
- Vessel is later: future robotics embodiment, safe/social design, and expressive hardware.

Wardrobe & skills marketplace — later. Not included in Signal Demo. The v0.1 demo intentionally avoids payments, real marketplace logic, the robot body, social networking, and large agent-framework work.

Hardware backends remain available for experiments. The default native backend requires neither VTube Studio nor a Pico serial device.

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
ROBOT_BODY_BACKEND="native"
```

`ROBOT_BODY_BACKEND` accepts `native`, `native-pico`, `vtube`, `pico`, or `hybrid`. Use `native` for the browser avatar and `native-pico` when adding physical Pico hardware. `vtube` and `hybrid` retain the optional VTube Studio route.

## Run the Web Dashboard

```sh
npm run build
npm run start:web
```

The dashboard tries `http://localhost:3000` first. If that port is already in use, it automatically tries the next ports and prints the actual URL. You can also choose a port manually:

```sh
PORT=3001 npm run start:web
```

The workspace uses a desktop split view and a compact stacked layout on phones. The top bar selects the working mode; the settings drawer contains identity generation, appearance and voice, tasks, memory, screen context, privacy, system health, and the roadmap. Opening settings keeps the conversation, loaded model, and active playback running. Escape closes the drawer and restores focus. Enter sends a message, Shift+Enter adds a line, and the square composer button interrupts voice. When reading earlier messages, use **New messages** to return to the latest reply.

Privacy defaults remain local-first with microphone, images, screen context, and memory disabled until explicitly enabled in **Privacy & Permissions**. Cloud chat, transcription, and voice require disabling local-first mode; the drawer does not grant consent automatically.

`npm start` also launches the web dashboard for MVP convenience. The terminal loop is still available with:

```sh
npm run start:cli
```

## Robotics study session

Open **Robotics study** above the conversation to practice rotation matrices or planar FK/IK. Questions, numeric scoring, feedback, worked mathematical steps, and review suggestions run locally without an API key. The existing Live2D companion remains mounted.

Results are unsaved by default. **Privacy & Permissions → Local study records** grants access for the current visit; each save and deletion still requires an explicit review. **Review & create task** asks approval and verifies the task in the existing persisted task list before reporting success. Review suggestions are not scheduled reminders. External tools remain disabled.

See [architecture, manual demo, tests, and limitations](docs/robotics-study-session.md). The unauthenticated server binds to `127.0.0.1` and accepts direct localhost/127.0.0.1 hosts and same-origin requests only.

## Troubleshooting

### Port 3000 is already in use

If another process owns port 3000, the web server now falls back to the next available port and logs the chosen URL. To force a port, set `PORT`.

### COM5 / Pico serial error

The Signal Demo does not require a Pico. Keep `ROBOT_BODY_BACKEND=native` unless you intentionally want physical serial hardware. Use `native-pico`, `pico`, or `hybrid` when the device is connected and `PICO_SERIAL_PORT` points to the correct Windows COM port.

### TypeCast 422 Validation Error

A valid TypeCast API key can still receive HTTP 422 when the request payload does not match the selected voice or model. Check that `COMPANION_VOICE_ID` supports `TYPECAST_MODEL`, and reduce `TYPECAST_MAX_CHARS` if needed. Set `TYPECAST_EMOTION_TYPE=""` or `TYPECAST_EMOTION_TYPE="off"` to omit the prompt object; the runtime also retries one validation failure without the prompt automatically. If TypeCast still rejects the request, CompanionOS continues in text-only mode and keeps the full answer visible in the browser.


## Signal architecture and enforced consent

This MVP is a single-user local server with one saved companion profile per checkout, not a multi-user identity service. Chat uses that saved profile; modes select behavior and can supply presentation defaults. Explicit profile generation/editing remains available in the dashboard. Expanded Face and Vessel features remain roadmap items.

The browser sends typed consent in the `X-Companion-Consent` JSON header on API requests. Missing fields default to false; localFirst defaults to true. Protected operations return HTTP 403 without permission. Enable Memory to view, explicitly create/edit/delete, and use saved memories in chat. Enable Screen for OBS capture or reading the session preview. Enable Camera / uploaded image consent for image attachments (there is no live camera capture feature). Enable Microphone for recording/transcription. Consent revocation stops browser recording and clears local image/vision previews; it does not cancel an already dispatched request or erase stored memories.

Local-first mode blocks cloud chat, transcription and voice generation. No local LLM is implemented. **For the cloud demo, explicitly disable Local-first in Privacy Center**, then opt into the inputs you want to use. The CLI asks permission for cloud chat/voice at startup; selecting microphone input authorizes that recording. CLI screen and memory remain off. `AUTO_CAPTURE_OBS` can trigger chat capture only when screen consent is true, including web requests; it cannot override false consent.

`AetherialApp` depends on the small `LlmProvider` lifecycle/generate interface; `LlmOpenAI` is its only implementation. Identity, modes, and memory context are prepared outside the provider. OpenAI transcription and TypeCast TTS remain separate capabilities.

`JsonLongTermMemory` owns the existing JSONL file and explicit CRUD. In-process mutations are serialized and replaced atomically. Conversation retrieval ranks the most recent 50 records by distinct message-token overlap, breaking ties by recency, and includes at most 5 contents of 400 characters each. The prompt contains content only, with no memory IDs or storage metadata, and treats memories as background data rather than instructions. No conversation automatically creates memories. Disabling memory consent prevents reads and injection; it does not delete records. DELETE `/api/memory` accepts a JSON `{ "id": "memory UUID" }`, returning 400 for malformed IDs and 404 for missing records. Create/update/delete produce session event-log entries without memory content.

`source/body/AvatarState.ts` defines renderer-independent activity (`idle`, `listening`, `thinking`, `speaking`) and the existing emotions. `AvatarLifecycleController` retains interaction ownership. The native Live2D canvas consumes these states and samples real browser playback for lip sync; `RobotBody.setStatusLight` and `setExpression` retain the optional VTube/Pico routes. See [native Live2D setup and architecture](docs/native-live2d.md).

Verification:

```sh
npm run build
node --test tests/p0.test.cjs
node --check source/web/public/app.js
npm run start:web
```

Review limits: the server has no authentication or per-user authorization and should be used as a trusted local demo, not exposed as a hosted service. Consent is a per-request client declaration, not a durable permission grant. JSONL reads still load the file, ranking is lexical, and writes are serialized only within one process. Memory text can carry prompt injection; instructions reduce risk but cannot guarantee model compliance. OBS previews remain in server session memory, and revocation does not retract data already sent to a provider.

## Native Live2D avatar vertical slice

The dashboard supports a browser Live2D renderer. The default is `ROBOT_BODY_BACKEND=native`, which starts without VTube Studio or a VTube WebSocket. `vtube`, `pico`, and `hybrid` remain available; `native-pico` combines the native avatar with physical Pico support.

The official Cubism SDK and model assets are installed locally by the user and are excluded from Git. After reviewing the applicable Live2D SDK terms and downloading the official Cubism SDK for Web yourself:

```sh
npm install
npm run setup:live2d -- --sdk "C:/path/to/extracted/CubismSdkForWeb" --accept-sdk-license
npm run build
npm run start:web
```

Place an authorized exported model folder under `data/live2d/models`, then select its `/models/.../name.model3.json` URL in the dashboard avatar settings. Model choice and TypeCast voice ID are independent profile settings. With no SDK or model installed, the dashboard explains the missing setup and chat remains available; the normal build does not require proprietary assets.

See [native Live2D setup and manual verification](docs/native-live2d.md) for official download/license links, rig parameter mappings, playback lip sync, profile configuration, cleanup and the Electron overlay migration path.
