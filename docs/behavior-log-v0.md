# Gepetto CompanionOS — Behavior Log v0

## Purpose

Behavior Log v0 records important companion events so Gepetto can become observable, debuggable, privacy-aware, and eventually ready for physical embodiment.

## Why this matters

For a future companion robot, logs are not only backend debugging.
They are evidence of safety, consent, trust, memory changes, voice interaction, avatar behavior, and later physical actuation.

## Event principles

- Every important action should leave a trace.
- Consent state must be logged before sensitive context is used.
- Memory changes must be auditable.
- Avatar or hardware expressions must be explainable.
- Errors must be visible without exposing private user content.

## Core event shape

```json
{
  "timestamp": "ISO-8601",
  "session_id": "string",
  "event_type": "string",
  "source": "user | assistant | system | hardware | avatar",
  "mode": "study | work | companion | admin | idle",
  "consent_state": {
    "screen_context": false,
    "voice": false,
    "memory_write": false
  },
  "summary": "short human-readable summary",
  "metadata": {}
}
```

## Event types

### User and assistant interaction

- `user_message_received`
- `assistant_response_generated`
- `mode_changed`
- `task_created`
- `task_completed`

### Voice and audio

- `voice_input_started`
- `voice_input_ended`
- `transcription_generated`
- `tts_started`
- `tts_completed`

### Memory

- `memory_candidate_detected`
- `memory_write_requested`
- `memory_saved`
- `memory_deleted`

### Privacy and consent

- `consent_granted`
- `consent_revoked`
- `screen_context_accessed`
- `recording_indicator_changed`

### Avatar and expression

- `avatar_expression_triggered`
- `avatar_gaze_changed`
- `avatar_idle_animation_started`
- `avatar_lipsync_started`

### Future physical embodiment

- `hardware_command_sent`
- `servo_motion_requested`
- `sensor_event_received`
- `tactile_event_detected`
- `safety_stop_triggered`

### Errors

- `tool_error`
- `transcription_error`
- `memory_error`
- `hardware_timeout`
- `unsafe_action_blocked`

## Example: consent before screen context

```json
{
  "timestamp": "2026-09-12T14:10:00+02:00",
  "session_id": "demo-001",
  "event_type": "screen_context_accessed",
  "source": "system",
  "mode": "work",
  "consent_state": {
    "screen_context": true,
    "voice": false,
    "memory_write": false
  },
  "summary": "Screen context accessed after explicit user permission.",
  "metadata": {
    "content_scope": "current active window only"
  }
}
```

## Example: avatar expression

```json
{
  "timestamp": "2026-09-12T14:12:00+02:00",
  "session_id": "demo-001",
  "event_type": "avatar_expression_triggered",
  "source": "assistant",
  "mode": "study",
  "summary": "Avatar switched to encouraging expression after user completed a study task.",
  "metadata": {
    "expression": "encouraging_smile",
    "backend": "vtube"
  }
}
```

## Next implementation step

Implement a simple local logger that appends behavior events to a JSONL file:

`logs/behavior-events.jsonl`

## Completion condition

You are done when you have:

> one Markdown file  
> at least 25 meaningful lines  
> one event schema  
> at least two examples  
> one next implementation step

No WaniKani, no Genki, no Mandarin before that gate. Those come **after** the Gepetto proof.

パッチちゃん’s board:

> **LUNCH → BEHAVIOR LOG v0**  
> **NO BROWSERIA**  
> **NO GUILT LOOP**  
> **ONE FILE = REAL PROGRESS**  
> **GEPETTO BEFORE ENTERTAINMENT**

Good answer, ソブくん. Now eat, then build.
