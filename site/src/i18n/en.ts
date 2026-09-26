// Page text. Board ids and statuses stay in English in both languages: they are
// the tokens the agent writes, printed the way the tool prints them. Everything
// a person reads is translated.

export const en = {
  lang: 'en',
  meta: {
    homeTitle: 'Sideroom Pi — it asks before it guesses',
    homeDescription:
      'A Pi package that asks before it guesses, keeps the work board above the editor, checks your own rules on every write, and refuses to finish while your checks are red.',
    policyTitle: 'Terms and usage policy — Sideroom Pi',
    policyDescription:
      'What Sideroom does with your code, what it never does on its own, and what the licence already says.',
    cardAlt: 'The Sideroom Pi mark on a light background.',
  },
  switchLabel: 'Español',
  switchAria: 'Read this page in Spanish',
  switchHref: '/es/',
  policyHref: '/policy/',
  skipToContent: 'Skip to content',
  links: {
    npm: 'The package on npm',
    repo: 'The repository',
    changelog: 'Every released version',
    policy: 'Terms and usage policy',
    issues: 'Report a bug',
    security: 'Security policy',
  },

  masthead: {
    name: 'Sideroom Pi',
    nav: {
      faults: 'Failures',
      ask: 'Asking',
      board: 'Board',
      rules: 'Rules',
      session: 'Session',
      inside: 'Inside',
      changelog: 'Changelog',
    },
  },

  opening: {
    claim: 'It asks before it guesses.',
    offer:
      'Sideroom Pi is a side room for Pi, the coding agent. It asks sharp questions with a recommendation attached, keeps the plan visible above the editor, and holds your own rules around every write and edit.',
    installNote:
      'One command, global to Pi. Nothing is written to your project.',
    command: 'pi install npm:@rmrdeveloper/sideroom-pi',
    copy: 'Copy',
    copied: 'Copied',
    boardTitle: 'The board that built this page',
    boardCaption:
      'Five rows above the editor while the work runs, in a real session. The step in progress sits first; the rest wait behind the hint, and F9 shows the whole board.',
  },

  faults: {
    title: 'Six failures a long session always reaches.',
    lead: 'Each one has a tool behind it. The tool name is the folder it lives in.',
    rows: [
      {
        symptom: 'It guesses.',
        seen: 'The agent meets a decision with two sane answers, picks one, and builds two hundred lines on top of it.',
        tool: 'ask',
      },
      {
        symptom: 'The work disappears.',
        seen: 'Progress scrolls away in the transcript. You cannot tell which step it is on, or what it already skipped.',
        tool: 'todo',
      },
      {
        symptom: 'Your repository fills up.',
        seen: 'A scratch plan, a half-finished task list and abandoned notes land next to real code.',
        tool: 'todo',
      },
      {
        symptom: 'Every session invents its own style.',
        seen: 'Nesting, error handling, naming and validation differ from session to session, and review turns into cleanup.',
        tool: 'guidelines',
      },
      {
        symptom: 'The rules are read and ignored.',
        seen: 'A braceless if, a swallowed error, a console.log and a stale TODO reach the diff anyway.',
        tool: 'rules',
      },
      {
        symptom: 'It declares victory.',
        seen: 'The agent says the work is done while the formatter, the linter, the types or the tests were never run.',
        tool: 'done',
      },
    ],
  },

  ask: {
    title: 'The first thing it does is ask.',
    lead: 'One batch, up to four questions, each with a recommendation and a way out of it. This is the batch that decided this page: pick your own answers and the sheet below updates.',
    caption:
      'The real batch, translated from Spanish, asked while this page was being rebuilt. The options marked recommended are the ones the agent argued for, and the ones taken here. Answer them differently and the summary updates.',
    recommended: 'recommended',
    submit: 'Submit',
    tabsLabel: 'Questions in the batch',
    outOfScope: 'Out of scope',
    custom: 'Your own answer',
    customPlaceholder: 'Write your answer',
    write: 'Write it',
    openAnswer: 'not answered',
    help: 'Tab next · Esc cancel',
    questions: [
      {
        id: 'idea',
        label: 'The idea',
        prompt: 'The costume goes. What holds the page up instead?',
        recommendedValue: 'material',
        options: [
          {
            value: 'material',
            label: 'Real pieces of the product',
            description:
              'Every device on the page is something the tool actually produces: a question, a board row, a command, a path. The figure plates, the key letters and the numbered squares go.',
          },
          {
            value: 'editorial',
            label: 'A dark editorial page',
            description:
              'Large type, plenty of air, framed captures. Clean and safe, and the default look of any dark product page.',
          },
          {
            value: 'transcript',
            label: 'A session log',
            description:
              'The page reads like a session transcript: mostly monospace, sequential, harder to skim.',
          },
        ],
      },
      {
        id: 'showing',
        label: 'Showing it',
        prompt: 'How does the page show the tool?',
        recommendedValue: 'live',
        options: [
          {
            value: 'live',
            label: 'One live reproduction, captures for the rest',
            description:
              'The question batch is the one thing you can click; the board, the rules and the close use real captures.',
          },
          {
            value: 'captures',
            label: 'Real captures only',
            description:
              'Less code to keep and no risk of a reproduction drifting from the tool, but nobody can try anything.',
          },
          {
            value: 'more',
            label: 'More live reproductions',
            description:
              'Batch, board and a blocked write, all alive. Closest to using the tool, and the most code to carry.',
          },
        ],
      },
      {
        id: 'type',
        label: 'Type',
        prompt: 'Which of the two typefaces stays?',
        recommendedValue: 'one',
        options: [
          {
            value: 'one',
            label: 'One readable family, mono for the machine',
            description:
              'Commands, paths and code in mono; everything else, headings included, in the same grotesque at large sizes.',
          },
          {
            value: 'newface',
            label: 'A new text family with more character',
            description:
              'A stronger change of voice, at the cost of re-measuring every size and weight.',
          },
          {
            value: 'moremono',
            label: 'More mono, not less',
            description:
              'Terminal voice in headings and body text. Consistent with the product, harder to read in long paragraphs.',
          },
        ],
      },
      {
        id: 'firstscreen',
        label: 'First screen',
        prompt: 'What has to be clear before the first scroll?',
        recommendedValue: 'hero',
        options: [
          {
            value: 'hero',
            label: 'The claim, the install command and the real board',
            description:
              'The first scroll shows what it is, how to install it and the product running. The red warning and the facts move to their own section.',
          },
          {
            value: 'capture',
            label: 'The terminal capture full width, claim over it',
            description:
              'Shows the product first; the claim loses force over a dark image and the command takes longer to appear.',
          },
          {
            value: 'problem',
            label: 'The failure first, the agent that edits before asking',
            description:
              'Enters through the pain, not the product. More hook for someone who does not know the problem, more text before anything is visible.',
          },
        ],
      },
    ],
  },

  board: {
    title: 'The board is the plan, and the plan is visible.',
    lead: 'Exactly one step is active. The agent completes it and starts the next one in the same move, which makes a skipped step structurally hard.',
    header: (active: number, queued: number) =>
      `Sideroom board (${String(active)} active, ${String(queued)} queued)`,
    hidden: (count: number) => `…+${String(count)} more · F9: view all`,
    overlayTitle: (count: number) => `Work board (${String(count)})`,
    overlayHint: 'F9 or Esc close',
    fullTitle: 'The whole board',
    fullCaption:
      'Every item, resolved ones included, as F9 shows it. The widget above keeps the active step in view and hides the rest behind a count.',
    steps: [
      { id: 'read', content: 'Read the current site' },
      { id: 'grill', content: 'Settle the direction' },
      { id: 'plan', content: 'Write the design plan' },
      { id: 'rebuild', content: 'Rebuild the page' },
      { id: 'copy', content: 'Rewrite both languages' },
      { id: 'design', content: 'Update DESIGN.md' },
      { id: 'check', content: 'Run the checks' },
      { id: 'review', content: 'Read the built pages' },
    ],
    behavioursTitle: 'How it behaves',
    behaviours: [
      {
        rule: 'One active step',
        detail: 'A board with pending work has exactly one item in progress.',
      },
      {
        rule: 'Five rows above the editor',
        detail:
          'The widget shows at most five rows and keeps the active one in view.',
      },
      {
        rule: 'F9 opens the whole board',
        detail:
          'The full list is read-only and shows every item, resolved ones included.',
      },
      {
        rule: 'It survives the session',
        detail:
          'Reload, tree navigation and compaction leave the board where it was.',
      },
      {
        rule: 'It dies with the session',
        detail:
          'The board lives in the session branch, never in a file you commit.',
      },
    ],
    videoAlt:
      'A Pi session: a batch of four questions, then the work board and the list of edited files.',
    videoCaption:
      'Ten seconds of a real session: the batch of four questions, then the board and the files it edited.',
  },

  rules: {
    title: 'Your rules, checked on the lines you add.',
    lead: 'Every write and edit is checked. Only the added lines are read, so a rule can never complain about code the agent did not write.',
    outcomes: [
      {
        id: 'block',
        label: 'Blocked',
        body: 'The write does not happen, the agent is told which line, and the next step waits.',
        output: [
          'Blocked src/app.ts: sideroom rules violated.',
          '- [braced-conditionals] Wrap the conditional body in braces.',
          'Fix the flagged lines and retry the mutation.',
        ],
      },
      {
        id: 'warn',
        label: 'Flagged',
        body: 'The write goes through and the warning stays in the result, next to the file it names.',
        output: [
          'Sideroom rules flagged src/app.ts:',
          '- [debug-artifacts] Remove debug output before finishing.',
        ],
      },
      {
        id: 'steer',
        label: 'Steer',
        body: 'A rule that keeps firing after repeated attempts degrades into a hidden correction, so a wrong rule can never trap the agent in a loop.',
        output: [],
      },
    ],
    linesTitle: 'Examples',
    lines: [
      {
        code: 'if (!user) return 0;',
        verdict: 'Blocked',
        state: 'block',
        rule: 'braced-conditionals',
      },
      {
        code: 'catch { return null; }',
        verdict: 'Blocked',
        state: 'block',
        rule: 'explicit-error-handling',
      },
      {
        code: 'const data = getResult();',
        verdict: 'Flagged',
        state: 'warn',
        rule: 'clear-names',
      },
      {
        code: 'console.log(order);',
        verdict: 'Flagged',
        state: 'warn',
        rule: 'debug-artifacts',
      },
      {
        code: '// const total = sum(items);',
        verdict: 'Flagged',
        state: 'warn',
        rule: 'comments',
      },
    ],
  },

  session: {
    title: 'The room is in the session, not in your files.',
    lead: 'All the state Sideroom produces lives in the Pi session branch. There is no config file to add, no task graph to commit and no leftover plan to delete.',
    body: 'The board, the edited-file history and the answers to your questions belong to the session. When the session ends, they end with it, and your working tree is exactly what the agent wrote to it.',
    skillsTitle: 'In a monorepo, it finds the skills below you.',
    skillsBody:
      'Pi does not walk down into child folders for project skills. Sideroom scans three levels down, adds their .pi/skills and .agents/skills to the session, and leaves duplicate names to Pi to resolve.',
    termsTitle: 'Words used on this page',
    terms: [
      {
        term: 'Question batch',
        href: '#ask',
        body: 'One call carrying up to four questions answered together.',
      },
      {
        term: 'Work board',
        href: '#board',
        body: 'The session-backed list of work items, with exactly one active.',
      },
      {
        term: 'Added line',
        href: '#rules',
        body: 'A line a write or an edit introduces. The rules check only those.',
      },
      {
        term: 'Steer',
        href: '#rules',
        body: 'A hidden message that corrects the agent. On its own it never blocks.',
      },
      {
        term: 'Project fact',
        href: '#ask',
        body: 'Something the repository already settles, so the user is never asked.',
      },
      {
        term: 'Detected check command',
        href: '#close',
        body: 'The one project command that decides whether the session is green.',
      },
    ],
  },

  inside: {
    title: 'What is in the box.',
    lead: 'Ten tools, one folder each, and six skills read on demand.',
    toolsTitle: 'Tools',
    tools: [
      {
        name: 'ask',
        does: 'The questionnaire: one to four questions in one batch, each with a recommendation.',
      },
      {
        name: 'todo',
        does: 'The work board above the editor, with exactly one step active.',
      },
      {
        name: 'modified-files',
        does: 'The paths of the files it wrote and edited, as clickable links.',
      },
      {
        name: 'guidelines',
        does: 'The read gate before the first write, and the review at the end of the run.',
      },
      {
        name: 'rules',
        does: 'Mechanical checks on the lines you added, blocking or noting each one.',
      },
      {
        name: 'persona',
        does: 'The voice rules every user-facing answer follows.',
      },
      {
        name: 'done',
        does: 'Watches the project’s own check command and steers back while it is red.',
      },
      {
        name: 'explain',
        does: 'Offers a walkthrough, and how to test the work, once it settles.',
      },
      {
        name: 'jev',
        does: 'Optional: asks a decision model about the guide rules, with the evidence attached.',
      },
      {
        name: 'monorepo-skills',
        does: 'Finds skills in child folders of a monorepo and adds them to the session.',
      },
    ],
    jevTitle: 'Jev',
    jevLead:
      'Optional, and the only part of the package that sends code off your machine. It stays off until you give it a key.',
    jevRows: [
      {
        term: 'What it sends',
        body: 'The whole changed file and at most four related source files: the ones it imports, and the files that use it. Both are found inside your working directory. The conversation, the session, your configuration and the rest of the repository are never sent.',
      },
      {
        term: 'How it turns on',
        body: 'Put TYPESAFE_API_KEY in your environment, or press F10 in the session and paste the key. Without a key no request is made at all.',
      },
      {
        term: 'What it asks',
        body: 'The guide rules that need the code around the change: responsibility, dependency direction, comments, and whether the check it sees is already done at the input boundary.',
      },
      {
        term: 'What its findings do',
        body: 'Each finding names one rule and a probability, and reaches the review at the end of the run. A finding never blocks a write.',
      },
    ],
    skillsTitle: 'Skills',
    skills: [
      {
        name: 'sideroom-grill',
        does: 'Interviews you until a fuzzy plan is settled, before any code.',
      },
      {
        name: 'sideroom-architecture',
        does: 'Surfaces the decisions a change forces, so they are asked rather than assumed.',
      },
      {
        name: 'sideroom-domain-modeling',
        does: 'Resolves naming conflicts and writes the hard decisions down.',
      },
      {
        name: 'sideroom-domain-scaffold',
        does: 'Builds a code-first glossary for a repository that has none.',
      },
      {
        name: 'sideroom-guidelines',
        does: 'The complete checklist and one guide per language.',
      },
      {
        name: 'sideroom-persona',
        does: 'The voice rules, in full, for when an answer needs them.',
      },
    ],
    languagesTitle: 'Languages',
    languagesLead:
      'One guide per language, chosen by the file extension. A file in any other language still gets the three rules that do not need to know the language: clear names, stale comments and debug output.',
  },

  close: {
    title: 'The run is not over while your checks are red.',
    note: 'Sideroom reads the project’s own check command and steers the agent back to it, instead of accepting a summary. Nothing is called done before that command passes.',
    stepTitle: 'Point it at your own rules.',
    stepBody:
      'The package ships the seed for the guidelines file. Copy it, then write your own rules into it; the guides are read before the first edit of a run, not after.',
  },

  policy: {
    title: 'Terms and usage policy',
    lead: 'What Sideroom does with your code, what it never does on its own, and what the licence already says. Everything on this page can be checked in the repository.',
    sendsTitle: 'Your code leaves your machine only through Jev',
    sendsLead:
      'Jev is the one optional part of the package that talks to a service. It stays off until you give it a key, and only you can give it one.',
    sendsRows: [
      {
        term: 'What it sends',
        body: 'The file you changed and at most four related source files: the ones it imports, and the files that use it. Both are found inside your working directory.',
      },
      {
        term: 'What it never sends',
        body: 'The conversation, the session, your configuration, your documentation and the rest of the repository. The search skips ignored, hidden, symlinked, sensitive-named and dependency paths.',
      },
      {
        term: 'What comes back',
        body: 'A finding that names a guide rule and a probability. It reaches the review at the end of the run, and it never blocks a write.',
      },
    ],
    destinationTerm: 'Where it goes',
    aloneTitle: 'Sideroom never turns it on for you',
    aloneLead:
      'No key, no request. Nothing in the package reaches the network on its own, and nothing switches Jev on behind your back.',
    aloneBody: [
      'The key comes from TYPESAFE_API_KEY in your environment, or from one you type in the F10 screen. Sideroom stores a key only when you give it one, and clears it when you ask.',
      'The key is read on every use rather than remembered at start-up, so clearing it stops the requests immediately, without restarting Pi.',
    ],
    sessionTitle: 'Everything else stays in your session',
    sessionLead:
      'The board, your answers and the list of files the agent edited belong to the Pi session branch. They end when the session ends, and they never reach your repository.',
    sessionBody:
      'The only thing Sideroom writes into your working tree is the code you asked the agent to write.',
    siteTitle: 'What this site does',
    siteLead:
      'Nothing that follows you. The pages are built once and served as files, the fonts come from this site, and there are no cookies, no analytics and no third-party scripts.',
    siteBody:
      'The question batch on the front page is answered inside your browser. Your clicks and anything you type there are not sent anywhere.',
    licenceTitle: 'Licence and warranty',
    licenceLead: 'Using the package is free, and it comes with no warranty.',
    licenceRows: [
      { term: 'Licence', body: 'MIT.' },
      {
        term: 'Warranty',
        body: 'None. The package is provided as it is, as the licence states.',
      },
    ],
    licenceLink: 'Read the licence text',
    securityLink: 'Report a security problem',
    linkFromJev: 'What leaves your machine, and when',
  },

  footer: {
    built: 'This page is built from the repository it describes.',
    state: 'All the state it produces stays in the session.',
    license: 'MIT licensed.',
  },
};
