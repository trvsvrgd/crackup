# CRACKUP project working instructions

## Task summaries

Always end tasks with a summary including:
1. How long did the task run?
2. What decisions were made?
3. Was success achieved against the initial prompt?
4. A summary of the actions taken, verification, and remaining work.

## Continuing work after interruptions

- A new message such as `continue` resumes the active conversation's unfinished task first. It does not replace an ongoing documentation task with gameplay implementation.
- When continuing the reliability/living-city coding program, including in a fresh conversation in this repository, first read `artifacts/reliability-living-city-checkpoint.json`, `artifacts/reliability-living-city-status.md`, and the interruption/resume protocol in `docs/RELIABILITY_LIVING_CITY_PROMPTS.md`. Then read the active prompt and relevant PRD sections.
- The current program is `docs/PRD_ADDENDUM_RELIABILITY_AND_LIVING_CITY.md`, with work orders in `docs/RELIABILITY_LIVING_CITY_PROMPTS.md`. If no implementation prompt has begun, the first coding work order is P001. Follow a user-specified different program/task instead when one is named.
- Treat the durable checkpoint as a navigation aid, not proof that code or tests finished. Inspect the working tree and saved command output. Reconcile interrupted actions before continuing; never infer success from a command that was only launched.
- Checkpoint before a risky/long operation, after each coherent edit/test result, and at least every ten minutes while actively working when tools permit. Do not rely on receiving advance notice of usage limits. Record partial work and the exact next action, not just the current phase number.
- On a requested stop, record a handoff if possible, safely stop only owned temporary processes when appropriate, and stop work. A usage-limit cutoff may prevent any final write; resume by inspecting actual files/processes/logs from the last durable checkpoint. Do not promise automatic execution while access is unavailable.
- Preserve uncommitted work, personal saves, offline solo, no spending, existing gameplay and campaign ownership. Never reset the working tree to recover from an interrupted task. Recheck a process's command/working directory/start time before stopping it; a recorded PID alone is not ownership proof.
- Complete and verify the current phase before dependent work. Human/target-hardware evidence stays pending when unavailable. Do not silently skip it, fabricate approval, or restart the whole program because a conversation changed.

## Animation follow-through

For LC08/P049–P054, read `docs/TRAVERSAL_ANIMATION_PACK_SPEC.md`. Jump anticipation, arm-driven takeoff, ledge reach/catch/hang/mantle, soft/hard landing compression, and an authoritative fall-damage recovery beat are explicit requirements. A downloaded pack or unused animation state does not satisfy runtime coverage.
