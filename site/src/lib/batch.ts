// The question batch's own tokens, shared by the markup rendered on the server
// and the script that runs in the browser, so the two can never drift apart.

// The marks the terminal prints on a tab: answered, or still open. Written as
// escapes because the source carries no decorative symbol.
export const ANSWERED_MARK = '\u25cf';
export const OPEN_MARK = '\u25cb';

// The two reserved options every question carries.
export const OUT_OF_SCOPE_VALUE = 'out_of_scope';
export const CUSTOM_VALUE = 'custom';

// The last tab of the batch, which summarises the answers.
export const SUMMARY_TAB_ID = 'summary';
