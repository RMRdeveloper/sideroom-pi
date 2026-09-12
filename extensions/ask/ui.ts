import type { ExtensionUIContext } from '@earendil-works/pi-coding-agent';
import {
  Editor,
  type EditorTheme,
  Key,
  matchesKey,
  visibleWidth,
  wrapTextWithAnsi,
} from '@earendil-works/pi-tui';
import {
  type AskAnswer,
  type AskQuestion,
  type AskResult,
  MULTIPLE_SELECTION_MODE,
  type RenderOption,
  renderOptions,
} from './model.ts';
import { answerFromSelections, toggleSelection } from './selection.ts';

export async function runAskUi(
  ui: Pick<ExtensionUIContext, 'custom'>,
  questions: readonly AskQuestion[],
): Promise<AskResult> {
  const isMulti = questions.length > 1;
  const totalTabs = questions.length + 1;

  return ui.custom<AskResult>((tui, theme, _keybindings, done) => {
    let currentTab = 0;
    const firstQuestion = questions[0];
    let optionIndex = firstQuestion?.recommendedIndices[0] ?? 0;
    let inputMode = false;
    let inputQuestionId: string | null = null;
    let cachedLines: string[] | undefined;
    const answers = new Map<string, AskAnswer>();

    const editorTheme: EditorTheme = {
      borderColor: (s) => theme.fg('accent', s),
      selectList: {
        selectedPrefix: (t) => theme.fg('accent', t),
        selectedText: (t) => theme.fg('accent', t),
        description: (t) => theme.fg('muted', t),
        scrollInfo: (t) => theme.fg('dim', t),
        noMatch: (t) => theme.fg('warning', t),
      },
    };
    const editor = new Editor(tui, editorTheme);

    function refresh(): void {
      cachedLines = undefined;
      tui.requestRender();
    }

    function submit(cancelled: boolean): void {
      done({
        questions,
        answers: Array.from(answers.values()),
        cancelled,
      });
    }

    function currentQuestion(): AskQuestion | undefined {
      return questions[currentTab];
    }

    function currentOptions(): RenderOption[] {
      const question = currentQuestion();
      if (question === undefined) {
        return [];
      }
      return renderOptions(question);
    }

    function allAnswered(): boolean {
      return questions.every((question) => answers.has(question.id));
    }

    function focusTab(tab: number): void {
      currentTab = tab;
      const question = questions[tab];
      if (question === undefined) {
        optionIndex = 0;
        refresh();
        return;
      }
      const saved = answers.get(question.id);
      optionIndex =
        saved?.index !== undefined
          ? saved.index - 1
          : (question.recommendedIndices[0] ?? 0);
      refresh();
    }

    function advanceAfterAnswer(): void {
      if (!isMulti) {
        submit(false);
        return;
      }
      if (currentTab < questions.length - 1) {
        focusTab(currentTab + 1);
        return;
      }
      focusTab(questions.length);
    }

    function saveAnswer(answer: AskAnswer): void {
      answers.set(answer.id, answer);
    }

    function selectedIndices(question: AskQuestion): readonly number[] {
      const saved = answers.get(question.id);
      if (saved?.selections === undefined) {
        return [];
      }
      return saved.selections.map((selection) => selection.index - 1);
    }

    function answerSummary(answer: AskAnswer): string {
      if (answer.selections === undefined || answer.selections.length === 0) {
        return answer.label;
      }
      return answer.selections.map((selection) => selection.label).join(', ');
    }

    function isReservedOption(opt: RenderOption): boolean {
      return opt.isOther === true || opt.isOutOfScope === true;
    }

    function activateReservedOption(
      question: AskQuestion,
      opt: RenderOption,
      index: number,
    ): void {
      if (opt.isOther === true) {
        openCustomEditor(question);
        return;
      }
      saveAnswer({
        id: question.id,
        value: opt.value,
        label: opt.label,
        wasCustom: false,
        outOfScope: true,
        index: index + 1,
      });
      advanceAfterAnswer();
    }

    function openCustomEditor(question: AskQuestion): void {
      inputMode = true;
      inputQuestionId = question.id;
      const saved = answers.get(question.id);
      if (saved?.wasCustom === true) {
        editor.setText(saved.label);
      } else {
        editor.setText('');
      }
      refresh();
    }

    function confirmOption(
      question: AskQuestion,
      opts: readonly RenderOption[],
      index: number,
    ): void {
      const opt = opts[index];
      if (opt === undefined) {
        return;
      }
      if (isReservedOption(opt)) {
        activateReservedOption(question, opt, index);
        return;
      }
      const original = question.options[index];
      saveAnswer({
        id: question.id,
        value: original?.value ?? opt.value,
        label: original?.label ?? opt.label,
        wasCustom: false,
        outOfScope: false,
        index: index + 1,
      });
      advanceAfterAnswer();
    }

    function toggleMultipleOption(
      question: AskQuestion,
      opts: readonly RenderOption[],
      index: number,
    ): void {
      const opt = opts[index];
      if (opt === undefined) {
        return;
      }
      if (isReservedOption(opt)) {
        activateReservedOption(question, opt, index);
        return;
      }
      const next = toggleSelection(selectedIndices(question), index);
      if (next.length === 0) {
        answers.delete(question.id);
        refresh();
        return;
      }
      answers.set(question.id, answerFromSelections(question, next));
      refresh();
    }

    function confirmMultipleSelection(
      question: AskQuestion,
      opts: readonly RenderOption[],
      index: number,
    ): void {
      const opt = opts[index];
      if (opt === undefined) {
        return;
      }
      if (isReservedOption(opt)) {
        activateReservedOption(question, opt, index);
        return;
      }
      if (selectedIndices(question).length === 0) {
        refresh();
        return;
      }
      advanceAfterAnswer();
    }

    editor.onSubmit = (value) => {
      if (inputQuestionId === null) {
        return;
      }
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        inputMode = false;
        inputQuestionId = null;
        editor.setText('');
        refresh();
        return;
      }
      const question = questions.find((entry) => entry.id === inputQuestionId);
      const displayIndex =
        question === undefined ? 1 : renderOptions(question).length;
      saveAnswer({
        id: inputQuestionId,
        value: trimmed,
        label: trimmed,
        wasCustom: true,
        outOfScope: false,
        index: displayIndex,
      });
      inputMode = false;
      inputQuestionId = null;
      editor.setText('');
      advanceAfterAnswer();
    };

    function handleInput(data: string): void {
      if (inputMode) {
        if (matchesKey(data, Key.escape)) {
          inputMode = false;
          inputQuestionId = null;
          editor.setText('');
          refresh();
          return;
        }
        editor.handleInput(data);
        refresh();
        return;
      }

      const question = currentQuestion();
      const opts = currentOptions();

      if (isMulti) {
        if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
          focusTab((currentTab + 1) % totalTabs);
          return;
        }
        if (matchesKey(data, Key.shift('tab')) || matchesKey(data, Key.left)) {
          focusTab((currentTab - 1 + totalTabs) % totalTabs);
          return;
        }
      }

      if (currentTab === questions.length) {
        if (matchesKey(data, Key.enter) && allAnswered()) {
          submit(false);
        } else if (matchesKey(data, Key.escape)) {
          submit(true);
        }
        return;
      }

      if (matchesKey(data, Key.up)) {
        optionIndex = Math.max(0, optionIndex - 1);
        refresh();
        return;
      }
      if (matchesKey(data, Key.down)) {
        optionIndex = Math.min(opts.length - 1, optionIndex + 1);
        refresh();
        return;
      }

      if (
        question?.selectionMode === MULTIPLE_SELECTION_MODE &&
        matchesKey(data, Key.space)
      ) {
        toggleMultipleOption(question, opts, optionIndex);
        return;
      }

      const digit = optionIndexFromDigit(data, opts.length);
      if (digit !== undefined && question !== undefined) {
        optionIndex = digit;
        if (question.selectionMode === MULTIPLE_SELECTION_MODE) {
          toggleMultipleOption(question, opts, digit);
        } else {
          confirmOption(question, opts, digit);
        }
        return;
      }

      if (matchesKey(data, Key.enter) && question !== undefined) {
        if (question.selectionMode === MULTIPLE_SELECTION_MODE) {
          confirmMultipleSelection(question, opts, optionIndex);
        } else {
          confirmOption(question, opts, optionIndex);
        }
        return;
      }

      if (matchesKey(data, Key.escape)) {
        submit(true);
      }
    }

    function render(width: number): string[] {
      if (cachedLines !== undefined) {
        return cachedLines;
      }

      const lines: string[] = [];
      const renderWidth = Math.max(1, width);
      const question = currentQuestion();
      const opts = currentOptions();

      function addWrapped(text: string): void {
        lines.push(...wrapTextWithAnsi(text, renderWidth));
      }

      function addWrappedWithPrefix(prefix: string, text: string): void {
        const prefixWidth = visibleWidth(prefix);
        if (prefixWidth >= renderWidth) {
          addWrapped(prefix + text);
          return;
        }
        const wrapped = wrapTextWithAnsi(text, renderWidth - prefixWidth);
        const continuationPrefix = ' '.repeat(prefixWidth);
        for (let index = 0; index < wrapped.length; index += 1) {
          const part = wrapped[index];
          if (part === undefined) {
            continue;
          }
          lines.push(`${index === 0 ? prefix : continuationPrefix}${part}`);
        }
      }

      lines.push(theme.fg('accent', '─'.repeat(renderWidth)));

      if (isMulti) {
        const tabs: string[] = [];
        for (let index = 0; index < questions.length; index += 1) {
          const entry = questions[index];
          if (entry === undefined) {
            continue;
          }
          const isActive = index === currentTab;
          const isAnswered = answers.has(entry.id);
          const mark = isAnswered ? '●' : '○';
          const color = isAnswered ? 'success' : 'muted';
          const text = ` ${mark} ${entry.label} `;
          const styled = isActive
            ? theme.bg('selectedBg', theme.fg('text', text))
            : theme.fg(color, text);
          tabs.push(styled);
        }
        const canSubmit = allAnswered();
        const isSubmitTab = currentTab === questions.length;
        const submitText = ' Submit ';
        const submitStyled = isSubmitTab
          ? theme.bg('selectedBg', theme.fg('text', submitText))
          : theme.fg(canSubmit ? 'success' : 'dim', submitText);
        tabs.push(submitStyled);
        addWrappedWithPrefix(' ', tabs.join(' '));
        lines.push('');
      }

      function renderOptionList(questionForList: AskQuestion): void {
        const isMultipleAnswer =
          questionForList.selectionMode === MULTIPLE_SELECTION_MODE;
        const selected = selectedIndices(questionForList);
        for (let index = 0; index < opts.length; index += 1) {
          const opt = opts[index];
          if (opt === undefined) {
            continue;
          }
          if (opt.isOutOfScope === true) {
            lines.push('');
          }
          const focused = index === optionIndex;
          const prefix = focused ? theme.fg('accent', '> ') : '  ';
          const color = focused ? 'accent' : 'text';
          let line = '';
          if (isMultipleAnswer && !isReservedOption(opt)) {
            line += selected.includes(index)
              ? theme.fg('success', '[x] ')
              : theme.fg('dim', '[ ] ');
          }
          line += theme.fg(color, `${String(index + 1)}. ${opt.label}`);
          if (opt.isRecommended === true) {
            line = `${line} ${theme.fg('dim', 'recommended')}`;
          }
          addWrappedWithPrefix(prefix, line);
          if (opt.description !== undefined) {
            addWrappedWithPrefix('     ', theme.fg('muted', opt.description));
          }
        }
      }

      if (inputMode && question !== undefined) {
        addWrappedWithPrefix(
          ' ',
          theme.fg('accent', theme.bold(question.prompt)),
        );
        lines.push('');
        addWrappedWithPrefix(' ', theme.fg('muted', 'Custom answer'));
        for (const line of editor.render(Math.max(1, renderWidth - 2))) {
          lines.push(` ${line}`);
        }
        lines.push('');
        addWrappedWithPrefix(
          ' ',
          theme.fg('dim', 'Enter save · Esc back to options'),
        );
      } else if (currentTab === questions.length) {
        for (const entry of questions) {
          const answer = answers.get(entry.id);
          const name = theme.fg('muted', `${entry.label}: `);
          if (answer === undefined) {
            addWrappedWithPrefix(
              ' ',
              `${name}${theme.fg('warning', 'not answered')}`,
            );
            continue;
          }
          let kind = '';
          if (answer.outOfScope) {
            kind = 'out of scope · ';
          } else if (answer.wasCustom) {
            kind = 'custom · ';
          }
          addWrappedWithPrefix(
            ' ',
            `${name}${theme.fg('dim', kind)}${theme.fg('text', answerSummary(answer))}`,
          );
        }
        lines.push('');
        if (allAnswered()) {
          addWrappedWithPrefix(
            ' ',
            theme.fg('success', 'Enter send answers · Esc cancel'),
          );
        } else {
          const missing = questions
            .filter((entry) => !answers.has(entry.id))
            .map((entry) => entry.label)
            .join(', ');
          addWrappedWithPrefix(
            ' ',
            theme.fg('warning', `Answer ${missing} to continue`),
          );
        }
      } else if (question !== undefined) {
        addWrappedWithPrefix(
          ' ',
          theme.fg('accent', theme.bold(question.prompt)),
        );
        const saved = answers.get(question.id);
        if (saved !== undefined) {
          addWrappedWithPrefix(
            ' ',
            theme.fg('muted', `Current: ${answerSummary(saved)}`),
          );
        }
        lines.push('');
        renderOptionList(question);
      }

      if (!inputMode && currentTab !== questions.length) {
        lines.push('');
        if (
          question?.selectionMode === MULTIPLE_SELECTION_MODE &&
          selectedIndices(question).length === 0
        ) {
          addWrappedWithPrefix(
            ' ',
            theme.fg('warning', 'Select at least one option'),
          );
        }
        const count = String(opts.length);
        let help = `↑↓ or 1–${count} · Enter select · Esc cancel`;
        if (question?.selectionMode === MULTIPLE_SELECTION_MODE) {
          help = `↑↓ or 1–${count} toggle · Space toggle · Enter confirm · Esc cancel`;
        } else if (isMulti) {
          help = `↑↓ or 1–${count} · Enter · Tab next · Esc cancel`;
        }
        addWrappedWithPrefix(' ', theme.fg('dim', help));
      }
      lines.push(theme.fg('accent', '─'.repeat(renderWidth)));

      cachedLines = lines;
      return lines;
    }

    return {
      render,
      invalidate: () => {
        cachedLines = undefined;
      },
      handleInput,
    };
  });
}

function optionIndexFromDigit(
  data: string,
  optionCount: number,
): number | undefined {
  if (data.length !== 1) {
    return undefined;
  }
  const code = data.charCodeAt(0);
  if (code < 49 || code > 57) {
    return undefined;
  }
  const index = code - 49;
  if (index >= optionCount) {
    return undefined;
  }
  return index;
}
