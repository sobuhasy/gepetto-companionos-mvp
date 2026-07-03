# Gepetto CompanionOS MVP

Gepetto CompanionOS is a privacy-first multimodal AI companion workspace for the July 12 Signal Demo. The MVP focuses on a browser dashboard with chat, voice controls, memory, tasks, study modes, and consent-based screen context.

## Signal Demo Scope

The current product framing is: from chatbot to companion OS. First the signal, then the face, then the vessel.

The v0.1 demo intentionally avoids the robot body, marketplace, payments, social network, and large agent-framework work. Hardware backends remain available for experiments, but the default MVP runtime uses the VTube backend so the web app does not require a Pico serial device.

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
