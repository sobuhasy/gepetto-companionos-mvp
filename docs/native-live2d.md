# Native Live2D dashboard avatar

CompanionOS can render a user-supplied Live2D model directly in the dashboard with the official Cubism SDK for Web. `ROBOT_BODY_BACKEND=native` is the default. It creates no VTube Studio client or WebSocket. Existing chat, LLM, memory, tasks, consent, TypeCast generation, browser audio playback, and `AvatarLifecycleController` interaction ownership continue to provide their existing behavior.

The repository includes its own renderer and SDK installation tooling, not the proprietary Cubism Core or any model. A successful application build alone does not demonstrate that a real model rendered. Rendering must be verified with a compatible official SDK and an authorized rigged model on the local machine.

## Obtain and install the official SDK

1. Visit the [official Cubism SDK for Web download page](https://www.live2d.com/en/sdk/download/web/). Review the [Live2D Proprietary Software License Agreement](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html), [Live2D Open Software License Agreement](https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html), and the license and notice files included with the SDK. Complete Live2D's own download procedure and extract the SDK yourself.
2. Before publishing, distributing, or hosting a product, review the [SDK Release License requirements](https://www.live2d.com/en/sdk/license/), including its AI/chatbot and Expandable Application guidance. SDK acceptance during development does not itself grant publication permission or rights to a model. Do not infer an exemption from this setup script.
3. Install project dependencies. Point the setup command at the extracted directory containing both `Core` and `Framework`:

   ```sh
   npm install
   npm run setup:live2d -- --sdk "C:/SDKs/CubismSdkForWeb" --accept-sdk-license
   ```

   Pass `--accept-sdk-license` only after reviewing and accepting the applicable terms yourself. The tool does not download the SDK, fetch a CDN runtime, accept Live2D's website agreements, or copy sample models. It refuses incomplete SDKs and missing SDK, Core, or Framework license files.

The installer bundles the local official Framework TypeScript with esbuild into the browser global `CompanionCubism`, copies `Core/live2dcubismcore.min.js` and packaged Core runtime companions, and retains license and redistribution notices under `source/web/public/live2d/licenses/`. SDK releases with external WebGL shaders have their `Framework/Shaders/WebGL` files copied into `live2d/shaders/`. Both scripts and optional shader/WASM assets are served locally. `installation.json` records content hashes without disclosing the absolute SDK path. The [official SDK structure](https://github.com/Live2D/CubismWebSamples#directory-structure) describes the Core/Framework layout.

All generated runtime files are git-ignored. Re-running setup replaces this generated runtime only after bundling succeeds; failed bundles leave the previous installation available. Keep the original SDK archive and notices. Installation is deliberately separate from `npm run build`, so builds and automated tests can run without proprietary files. Do not manually commit the generated files as part of an ordinary source change.

## Supply an authorized local model

Use a model you created or one for which you hold the needed usage rights. Keep its creator's notices and license with it. Possession of VTube Studio or a downloaded model is not by itself permission to redistribute the files. No copyrighted model is copied from VTube Studio, downloaded automatically, or shipped here. Official sample data has its own [model-specific terms](https://www.live2d.com/eula/live2d-sample-model-terms_en.html); SDK acceptance does not replace them.

Copy the complete authorized exported model folder, preserving relative filenames:

```text
data/live2d/models/my-companion/
  my-companion.model3.json
  my-companion.moc3
  textures/...
  [optional physics3.json, pose3.json and creator notices]
```

Its dashboard URL is `/models/my-companion/my-companion.model3.json`. The `FileReferences` in `.model3.json` must refer to assets inside the local model tree. Keep compatible Core and Framework versions from the same official SDK package and use a model export version supported by that Core. The renderer prefers WebGL2, with WebGL fallback for older compatible SDKs; newer model blend modes may require WebGL2. For SDKs that load external shaders asynchronously, the local compatibility bridge waits for loading/compilation and validates shader programs before reporting the avatar ready. The initial slice drives rig parameters; it does not implement VTube tracking, a motion editor, or a Live2D model importer.

Optional `.env` settings:

```env
ROBOT_BODY_BACKEND="native"
LIVE2D_MODELS_DIR="data/live2d/models"
LIVE2D_MODEL_URL="/models/my-companion/my-companion.model3.json"
```

`LIVE2D_MODELS_DIR` can point to another trusted local model directory. Restart the server after changing environment settings. URLs stay under `/models/`; arbitrary remote URLs and path traversal are rejected. The default private model tree and profile presentation selections are git-ignored. If you use a custom model directory inside the repository, add it to your local ignore rules before copying assets.

## Independent companion model and voice settings

Open **Appearance & voice** beneath the avatar or in the settings menu to save the selected profile's model URL, TypeCast voice ID, and optional rig parameter mapping. Changing a model reloads the visible model without changing its selected voice. Changing the voice affects subsequent TypeCast synthesis and voice tests; an existing audio file keeps the voice it was generated with. A TypeCast voice ID must be available to your existing provider account and supported by the configured model.

Presentation settings are separate from the existing identity/profile data and are persisted locally in `data/companion/presentation.json`. Existing saved profiles continue to load. Clearing an override restores the profile/environment fallback. The TypeCast provider credentials stay in their existing configuration and are never copied into presentation settings.

The local API supports:

```text
GET /api/companion/presentation?companionMode=study
  -> { profileId, modelUrl, voiceId, parameterMap, backend }

POST /api/companion/presentation
  { "profileId": "<profileId returned by GET>",
    "modelUrl": "/models/my-companion/my-companion.model3.json",
    "voiceId": "<authorized TypeCast voice ID>",
    "parameterMap": { "mouthOpen": "ParamMouthOpenY" } }
```

POST is a partial update: omit a field to preserve it, or use `null` to remove its override. Select a valid current/generated, mode, or existing legacy profile rather than inventing a profile ID. The normal reply and `/api/voice/test` paths use the same selected voice. `COMPANION_VOICE_ID` remains the environment fallback. Model selection does not enable microphone, cloud processing, memory, screen capture, or any other consent.

## Rigged activity and emotion controls

The renderer consumes the existing lifecycle state. Listening starts with the microphone interaction, thinking covers processing/generation, speaking begins only when the real browser audio emits `playing`, and the terminal lifecycle returns to idle. These states produce different head/gaze/brow poses and breathing/blink behavior. Existing emotions adjust supported face parameters. Mouse and pen movement over the canvas adds bounded, smoothed head and eye tracking; leaving the canvas returns gaze toward neutral. Touch input does not drive gaze. A model must actually rig the relevant controls for those differences to appear.

The workspace keeps one canvas, renderer, and media session mounted while settings panels open and close. The existing draw lifecycle adjusts the backing buffer and projection to the canvas's CSS size and device pixel ratio (capped at 2), including after responsive layout changes. Panel navigation does not reload the model or recreate its WebGL context. The composer’s **Interrupt voice** button cancels the active playback owner and immediately closes the mouth.

The semantic aliases accepted in `parameterMap` are:

| Alias | Typical Cubism rig ID |
| --- | --- |
| `angleX`, `angleY`, `angleZ` | `ParamAngleX`, `ParamAngleY`, `ParamAngleZ` |
| `bodyAngleX` | `ParamBodyAngleX` |
| `eyeLOpen`, `eyeROpen` | `ParamEyeLOpen`, `ParamEyeROpen` |
| `eyeBallX`, `eyeBallY` | `ParamEyeBallX`, `ParamEyeBallY` |
| `browLY`, `browRY` | `ParamBrowLY`, `ParamBrowRY` |
| `mouthOpen`, `mouthForm` | `ParamMouthOpenY`, `ParamMouthForm` |
| `breath` | `ParamBreath` |

Map aliases to your rig's actual IDs when it uses different names. Missing parameters are skipped rather than fabricated. Values are clamped to the rig's supported range. If `.model3.json` declares a `LipSync` parameter group, it is available for the actual model mouth controls. Parameter animation is an initial generic presentation layer; model-specific authored expressions and complex motion choreography can be added without moving interaction ownership out of `AvatarLifecycleController`.

Lip sync samples the actual browser playback element through Web Audio, using playback amplitude for the mouth rather than estimating speech from generated text. Microphone input is not used for this calculation. Autoplay/Web Audio restrictions can require a user gesture. A pause, end, blocked play, error, replacement interaction, interruption, or page cleanup resets the mouth immediately. No independent hidden audio player or additional cloud audio request is needed.

## Manual acceptance checks

Run the automated checks first:

```sh
npm run build
npm test
```

The setup tests use synthetic source and binary fixtures to check packaging and failures. These fixtures are not Live2D models and cannot demonstrate real model rendering. Perform these checks locally with an official SDK installed and at least one authorized model; use two visibly different authorized models to verify switching:

1. Close VTube Studio, set `ROBOT_BODY_BACKEND=native`, start `npm run start:web`, and open the URL printed by the server. Verify the selected model renders. In browser/network and server logs, confirm there is no connection to the VTube Studio port (normally `8001`). Chat, tasks and privacy surfaces should remain available.
2. Leave cloud/local-first controls at their current settings and inspect idle breathing/blinks. Enable microphone consent only when testing listening, then start a recording. Verify the visible listening pose differs from idle. Stop and submit; verify thinking differs during processing. Confirm microphone revocation still stops recording.
3. With the existing cloud/voice consent configured for a TypeCast test, submit a short spoken reply. Verify thinking remains until actual audio plays. While audio plays, verify speaking and amplitude-driven mouth changes. On normal audio end, verify an idle pose and closed mouth. Text-only responses should never animate speech.
4. Interrupt speech by starting another interaction, disabling voice, or pausing the browser audio controls. Also test a failed audio element or an invalid test voice. Verify the old mouth stops immediately, stale completion events do not claim the new interaction, and the text reply survives TTS failure.
5. Save a different authorized model URL in the dashboard settings. Verify the visible model changes and the TypeCast voice selection stays the same. Save another valid TypeCast voice ID, then request a new voice test/reply; verify the audible voice changes while the model stays the same. Reload the dashboard and verify saved selections persist. Restore the prior settings afterward if desired.
6. Try an invalid model URL or a missing texture. Verify an actionable avatar error appears while chat continues. Test rapid model switching and reloading during playback; there should be no stale model replacing the final selection, duplicate audio, or continuing mouth motion. Check the browser console for unhandled errors.
7. Close/reopen the page and repeat a short interaction. Verify animation/audio resources are released on cleanup. If hardware is available, repeat with `native-pico` and a valid `PICO_SERIAL_PORT`; the physical Pico remains optional. For the existing VTube route, deliberately select `vtube` or `hybrid` and verify its original behavior separately.

Until those real-asset checks run, record rendering/model compatibility and audible voice switching as **pending manual verification**, even if all unit tests and the normal build pass. No credentials or privately licensed assets should be added to tests or issue attachments.

### Local verification on 2026-10-22

Verified with the user-provided official **Cubism SDK for Web 5-r.5**, and the user's local Hiyori and Black Cat Girl models. The dashboard rendered both models, changed the visible model through its settings form, and restored the selected model after a page reload. Browser checks reported no rendering errors or warnings. SDK 5-r.5's native `Map` layout format and unused shader allocation slots are covered by compatibility regression tests.

An isolated local check page used the production `AvatarLifecycleController`, `NativeBody`, browser media session, renderer, and installed SDK. Listening and thinking produced visibly different poses. Two explicitly authorized fixed-sentence tests through the production TypeCast endpoint generated different voices (Miu Kobayashi and Poseidon); their local audio drove measured mouth movement. An active playback interruption changed the observed mouth value from `0.5756` to `0.0000` and activity from speaking to idle. The prior selected voice and existing playback file were restored afterward. The dashboard's Local-first setting stayed enabled.

The check page, audio outputs, and screenshots live only under ignored `tmp/`; the SDK runtime and model directory are also excluded from Git. The local model root may be a Windows junction to the user's authorized asset folder, so model files need not be copied. This check exercised actual rendering and playback without VTube Studio. Physical Pico hardware, microphone capture permissions, and optional VTube Studio behavior remain manual checks on their respective devices/apps.

## Failure recovery and cleanup

An unavailable SDK, missing model, WebGL initialization failure, invalid model assets, or TTS failure must leave the rest of the dashboard usable. Re-run the SDK installer for a complete official SDK, or clear/correct the profile's model selection. Use a browser with WebGL enabled. The selected rig must support the parameters you want to animate; a technically valid model with no mouth parameter cannot lip-sync visibly.

The renderer releases its model, texture/GPU resources and animation callbacks on replacement or disposal; playback handling disconnects its analyser and resets the mouth on stop. Its asynchronous loading path must discard obsolete loads rather than installing them after a newer selection. Page cleanup also releases lifecycle/audio resources. Persisted model paths do not authorize collection of any extra data.

To remove local SDK runtime files, stop the server and remove only `source/web/public/live2d`. Remove your own `data/live2d/models` assets only if you intend to delete them, and retain creator/license files where needed. Removing `data/companion/presentation.json` resets local model/voice overrides without editing existing companion identities. Keep `.env` and provider credentials untouched.

## Electron transparent-overlay migration

Keep the same `NativeLive2DRenderer(canvas)` module and its `loadModel(url, parameterMap)`, `setState(state)`, `setMouth(playbackLevel)`, `unload()` and `dispose()` APIs. A future Electron `BrowserWindow` can host this renderer on a transparent page, using a transparent canvas background and an appropriately configured transparent frameless window. Window positioning, click-through, visibility and always-on-top behavior belong in the Electron host. The renderer should not import Electron or assume a desktop window.

Keep `AvatarLifecycleController` as the interaction owner and deliver its existing state to whichever host is visible. Reuse the actual audio playback attachment; do not run a second TTS/audio stream in an overlay. Preserve a single owner when dashboard and overlay coexist. Serve local model assets through a scoped protocol/loopback route and use a preload/IPC boundary with context isolation rather than enabling Node integration in model content. This slice does not create an Electron overlay, but it keeps the rendering module independent of dashboard layout and server orchestration.
