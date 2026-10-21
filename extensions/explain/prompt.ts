export const EXPLAIN_REMINDER_HEADING = 'Sideroom walkthrough invitation:';

export const EXPLAIN_REMINDER = `${EXPLAIN_REMINDER_HEADING}
After completing meaningful changes, review, and checks, you may end the final response with one short sentence in the user's language offering to explain the changes or how to test them. Offer only when it adds value; omit it for trivial work, when the requested explanation is already provided, or when the user asks for no follow-up. Do not ask an automatic question or call sideroom_ask just to offer a walkthrough. Only after the user explicitly accepts the invitation, use sideroom_ask in the TUI if clarification is needed about changes, test steps, or both; otherwise explain directly. Outside the TUI, clarify in ordinary conversation when needed.`;

export function appendExplainReminder(systemPrompt: string): string {
  if (systemPrompt.includes(EXPLAIN_REMINDER_HEADING)) {
    return systemPrompt;
  }
  return systemPrompt.length === 0
    ? EXPLAIN_REMINDER
    : `${systemPrompt}\n\n${EXPLAIN_REMINDER}`;
}
