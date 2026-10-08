# Contributing

Contributions should keep Aetherial-Eve suitable for technical review as a cybersecurity and multimodal-systems prototype.

## Commit Messages

Use concise, professional, imperative commit subjects that describe the engineering change. Keep personal conversation, role-play language, and unrelated commentary out of commit history.

Good examples:

- `Add confirmation gate for process-control tools`
- `Document OBS screen-capture consent flow`
- `Fix text-to-speech preview duration`

Avoid vague subjects such as `updates`, descriptions of personal circumstances, or language that overstates the software's privileges or capabilities.

## Pull Requests

- Explain the technical problem, the implementation, and any security implications.
- Include the commands used to test the change.
- Call out new permissions, external services, device access, or credential requirements.
- Do not include secrets, personal data, generated audio, or local runtime state.

## Security Expectations

- Prefer least-privilege access and explicit user consent.
- Require confirmation before destructive or system-changing actions.
- Keep optional hardware, screen-capture, and process-control integrations disabled by default.
- Describe capabilities precisely; do not characterize the project as taking ownership or unrestricted control of a user's system.
