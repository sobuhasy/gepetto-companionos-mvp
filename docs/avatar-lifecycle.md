# Avatar interaction lifecycle

Implemented on `codex/avatar-lifecycle`; no merge or deployment is performed.

## Architecture and changes

Previously the browser recorded WebM, sent it to `/api/transcribe`, and put the transcript in the text box. `/api/message` called `AetherialApp.interact`, which used the existing LLM provider, parsed text/emotion, activated a body expression, and optionally generated TypeCast audio. The browser then played one of several shared audio filenames. There was no playback acknowledgement and no activity owner. `VTubeBody.setStatusLight` logged activity but was not driven by conversation events.

`AvatarLifecycleController` now owns the existing `AvatarState`, using `AvatarActivity` and `AvatarEmotion` without adding another activity model. It sends activity to `RobotBody.setStatusLight` and emotion separately to `RobotBody.setExpression`. Body failures do not fail the conversation. Body writes are ordered; resets, timers, and completion events are scoped to one interaction ID.

The browser's small `AvatarMediaSession` adapter posts JSON to `/api/avatar`:

| Event | Result |
| --- | --- |
| `begin`, activity `listening` | Issue an ID after the recorder's actual `start` event |
| `processing` | Recording stopped; transcription and model processing are underway |
| `begin`, activity `thinking` | Start a typed interaction |
| `playing` | Enter speaking only after the media element emits `playing` and the backend has prepared audio |
| `ended`, `error`, `cancel` | Return that interaction to idle and neutral |
| `heartbeat` | Renew the current owner's lease |

A successful microphone transcript now submits the message automatically, retaining the same ID through transcription, model processing, and playback. Empty transcription and failures reset idle. Typed messages with voice enabled can also speak; with automatic playback disabled they follow `idle -> thinking -> idle` and skip TTS. `COMPANION_VOICE_ENABLED=false` and model replies with `speak:false` also finish without speaking.

`/api/message` receives `interactionId` and `audioEnabled` and returns the exact generated `audioUrl`. Generating an audio file leaves the avatar thinking until real playback begins. The voice-test button uses the same playback acknowledgements. It plays the newly generated file rather than falling back to an unrelated older recording on failure.

The endpoint accepts loopback, same-origin requests only; the HTTP server binds to IPv4 loopback. There is no additional service, socket infrastructure, or frontend framework. `/api/status` includes `{ avatar: { activity, emotion } }` for inspection.

Only one generation runs at a time because TypeCast and the local fallback use shared output filenames. Competing browser clients receive HTTP 409 while an owner is active. The owning browser cancels its previous playback before beginning another interaction. Already-running cloud work is allowed to finish under the generation lock, but its stale result cannot animate or reset another interaction. Retry a new message after that work finishes.

The browser sends heartbeats every five seconds. After 30 seconds without an accepted heartbeat the controller resets idle, including after a crashed tab or lost network. A tab also sends a best-effort cancellation on `pagehide`. Events with old IDs are ignored.

Expression filenames remain unchanged: neutral clears the active expression; love uses `Love.exp3.json`, angry `Angry.exp3.json`, sad `Cry.exp3.json`, amazed `Amazed.exp3.json`, sleepy `Sleepy.exp3.json`, nervous `Nervous.exp3.json`. Switching expressions cancels the previous cleanup timer and deactivates the previous expression. Shutdown clears the active expression, frees the body, and disconnects the VTube SDK. Plugin identity, authorization, token storage, and expression activation requests are preserved. Hybrid shutdown attempts to free every child body, even if a sibling fails.

## Automated verification

Run from the repository root:

```powershell
npm run build
node --check source/web/public/app.js
node --check source/web/public/avatar-lifecycle.js
node --test tests/*.test.cjs
```

The tests use mocked bodies, LLM/TTS, bridge calls, and browser audio events. They cover the full speech sequence, text-only and audio-disabled replies, TTS failure, playback rejection/error/pause, interruption, overlapping work, stale audio events, disconnected VTube with a Hybrid sibling, shutdown during processing, expressions changing while speaking, and lease expiration. Existing P0 tests also exercise HTTP consent gates, stale avatar events, foreign-origin rejection, and idle status. No VTube installation or paid API requests are needed.

For the default native browser renderer, follow [native Live2D setup and manual checks](native-live2d.md). The VTube-specific behavior and instructions below apply only when selecting `vtube` or `hybrid`.

## Manual VTube Studio test

1. Start VTube Studio with the same working model and API port 8001. Keep its plugin API enabled and retain the existing authorization token. Do not delete or regenerate the token. Keep the existing VB-Audio/VTube microphone routing for lip sync.
2. In the repository's existing local environment, keep `ROBOT_BODY_BACKEND=vtube` (or `hybrid` for attached Pico hardware), the configured LLM and TypeCast credentials, and voice enabled. Run `npm run build`, then `npm run start:web`. Open the printed localhost URL; the port may fall back from 3000 if occupied.
3. In the web UI, grant microphone consent, disable local-first mode for cloud interaction, and enable STT and automatic playback. Watch the server's `[VTubeBody]: status light -> ...` logs. To inspect current state independently, open `/api/status` in another tab and refresh it at each stage.
4. Click the microphone and speak. Expect `listening` after recording starts. Stop recording: expect `thinking` during transcription, automatic message submission, LLM processing, and TTS generation. When sound actually starts, expect `speaking`. At the end expect `idle`, with the active expression cleared. Check lip sync through the existing audio routing.
5. Disable automatic playback and send a typed prompt. Expect `thinking -> idle`, text displayed, and no TTS playback. Re-enable playback and send a typed prompt to verify generated speech uses `thinking -> speaking -> idle`.
6. Ask for a loving reply and then an angry or amazed reply. Confirm the existing expression files activate, old expressions are deactivated, and an old timer does not clear a newer activation. Emotion changes do not themselves change speaking activity. The model chooses the emotion, so repeat or use the existing expression test if it returns neutral.
7. During a longer spoken reply, click **Interrupt voice**. Sound should stop, the expression should clear, and activity should become idle. Start another conversation; delayed events from the old audio must not reset it. Starting a new message while audio is playing also interrupts that playback.
8. While a reply is processing, interrupt it and try another request. The backend keeps the shared generation locked until the old work finishes; expect a retry message rather than overlapping TypeCast writes. In a second tab, attempt an interaction while the first is active: expect HTTP 409. After completion or cancellation, retry successfully.
9. Use browser DevTools request blocking to block the returned audio URL, or deny autoplay. Expect text to remain available, a playback error, and idle. For TTS failure, temporarily disable TypeCast connectivity; expect the text response and idle. Restore connectivity afterward. The voice-test button should also follow thinking/speaking/idle.
10. Close VTube Studio and send a message. Chat should remain usable; unavailable body output must not strand the lifecycle. Restart VTube Studio and verify the SDK's connection behavior with the existing configuration. During active playback, close the browser tab: expect immediate best-effort reset, or reset within 30 seconds if that event is lost. Stop the backend with Ctrl+C during an interaction and verify active expressions are cleared when VTube is reachable.

## Limits and remaining risks

- VTube Studio has no model-independent listening/thinking animation API. This repository's activity adapter still logs `setStatusLight`; activity correctness is visible in logs and `/api/status`. Expressions remain visible in VTube Studio, and lip sync remains dependent on the existing audio routing. No model-specific motion or Live2D parameter mapping was invented.
- Real VTube Studio, physical Pico hardware, browser permissions, VB-Audio routing, and paid providers were not exercised by automated tests. Expression cleanup cannot be guaranteed while VTube Studio is disconnected or after forced process termination.
- Background-tab timer throttling or a network outage can expire the 30-second lease during otherwise valid playback. This favors an idle fail-safe. Backend cancellation suppresses stale effects but does not abort or refund a provider request already in flight.
- This synchronization is for one local desktop/avatar. LAN/mobile access is no longer exposed by the server's loopback binding. Multi-user ownership, authenticated remote media events, and multi-process generation are outside scope.
- Clients using the older message API without an interaction ID retain text/audio generation compatibility, but must adopt the event protocol to drive actual playback state. The CLI does not own browser playback and therefore cannot report speaking through this protocol.
- The controller reports the requested emotion until reset or another emotion is applied. Existing expression durations can visually return the model to neutral earlier than that logical emotion.
- Generated audio still uses the existing shared files and retention behavior. No credentials, tokens, recordings, or personal memory data are part of this change.

## Changed files

- `source/body/AvatarLifecycleController.ts`: lifecycle, ownership, lease, safe reset and shutdown.
- `source/body/VTubeBody.ts`: expression replacement and timer cleanup.
- `source/body/HybridBody.ts`: attempt all child cleanups.
- `source/module/VTubeBridge.ts`: disconnect the SDK during cleanup; authentication preserved.
- `source/index/AetherialApp.ts`: drive processing/emotion, guard generation and return exact audio URL.
- `source/web/server.ts`: local event endpoint, status, startup lock, overlap guards and shutdown signals.
- `source/web/public/avatar-lifecycle.js`: media event adapter and cancellation.
- `source/web/public/app.js`: microphone/submission/playback wiring and interrupt control.
- `source/web/public/index.html`: load the small media adapter.
- `tests/avatar-lifecycle.test.cjs`, `tests/p0.test.cjs`: lifecycle mocks and HTTP regression coverage.
- `docs/avatar-lifecycle.md`: architecture, protocol, manual test guide and limits.

The pre-existing local `.gitignore` modification is left untouched.
