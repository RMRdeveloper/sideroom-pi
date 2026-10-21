# Walkthrough invitation (`explain`)

After meaningful changes are complete, including review and checks, the agent
may end its final response with one short sentence offering to explain the
changes or how to test them, in the user's language.

The invitation is optional. Omit it for trivial work, when the requested
explanation is already provided, or when the user asks for no follow-up.
There is no file-count threshold, automatic questionnaire, closing steer,
widget, tool, or persisted state.

## Timing and interaction

`before_agent_start` appends a fixed, idempotent reminder to the system prompt.
The reminder contains no session state, so the composed prompt stays
byte-identical across turns. The model decides whether the invitation adds
value and includes it in the final response; the extension does not rewrite
responses or guarantee that an invitation appears.

`explain` registers no settle handler and requests no continuation. It works
without another extension scheduling a review or checks, and cannot open an
extra model turn or interrupt work with an automatic question.

Only after the user explicitly accepts, the agent may use `sideroom_ask` in
the TUI if it needs to clarify whether to explain changes, test steps, or
both. If the scope is already clear, it explains directly. Outside the TUI,
any necessary clarification stays in ordinary conversation.

## Files and tests

`index.ts` registers the fixed reminder; `prompt.ts` owns its wording and
idempotent append. Tests verify prompt preservation, stable composition, and
that the extension registers no tools or closing hooks. The shared prompt
cache tests keep the system prompt stable after work-board updates, while
the settle tests verify that loading explain adds no closing continuation.
