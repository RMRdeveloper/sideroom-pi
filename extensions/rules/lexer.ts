import { LANGUAGE, type LanguageId } from './catalog.ts';

const LEXICAL_MODE = {
  code: 'code',
  lineComment: 'line-comment',
  blockComment: 'block-comment',
  string: 'string',
} as const;

type LexicalMode = (typeof LEXICAL_MODE)[keyof typeof LEXICAL_MODE];

export function maskNonCode(source: string, language: LanguageId): string {
  const masked = [...source];
  let mode: LexicalMode = LEXICAL_MODE.code;
  let delimiter = '';

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? '';

    if (mode === LEXICAL_MODE.lineComment) {
      if (character === '\n') {
        mode = LEXICAL_MODE.code;
        continue;
      }
      maskCharacter(masked, index);
      continue;
    }

    if (mode === LEXICAL_MODE.blockComment) {
      const closesComment = character === '*' && source[index + 1] === '/';
      if (closesComment) {
        maskCharacter(masked, index);
        maskCharacter(masked, index + 1);
        index += 1;
        mode = LEXICAL_MODE.code;
        continue;
      }
      maskCharacter(masked, index);
      continue;
    }

    if (mode === LEXICAL_MODE.string) {
      if (character === '\\') {
        maskCharacter(masked, index);
        if (source[index + 1] !== undefined) {
          maskCharacter(masked, index + 1);
          index += 1;
        }
        continue;
      }
      const closesString = source.startsWith(delimiter, index);
      if (closesString) {
        for (let offset = 0; offset < delimiter.length; offset += 1) {
          maskCharacter(masked, index + offset);
        }
        index += delimiter.length - 1;
        delimiter = '';
        mode = LEXICAL_MODE.code;
        continue;
      }
      if (delimiter.length === 1 && character === '\n') {
        mode = LEXICAL_MODE.code;
        continue;
      }
      maskCharacter(masked, index);
      continue;
    }

    const startsLineComment = character === '/' && source[index + 1] === '/';
    if (startsLineComment) {
      maskCharacter(masked, index);
      maskCharacter(masked, index + 1);
      index += 1;
      mode = LEXICAL_MODE.lineComment;
      continue;
    }

    const startsBlockComment = character === '/' && source[index + 1] === '*';
    if (startsBlockComment) {
      maskCharacter(masked, index);
      maskCharacter(masked, index + 1);
      index += 1;
      mode = LEXICAL_MODE.blockComment;
      continue;
    }

    const startsHashComment =
      character === '#' && supportsHashComments(language);
    if (startsHashComment) {
      maskCharacter(masked, index);
      mode = LEXICAL_MODE.lineComment;
      continue;
    }

    const startsString =
      character === "'" || character === '"' || character === '`';
    if (startsString) {
      delimiter = stringDelimiter(source, index, language, character);
      for (let offset = 0; offset < delimiter.length; offset += 1) {
        maskCharacter(masked, index + offset);
      }
      index += delimiter.length - 1;
      mode = LEXICAL_MODE.string;
    }
  }

  return masked.join('');
}

function stringDelimiter(
  source: string,
  index: number,
  language: LanguageId,
  quote: string,
): string {
  const tripleQuote = `${quote}${quote}${quote}`;
  const isPythonTripleQuote =
    language === LANGUAGE.python && source.startsWith(tripleQuote, index);
  if (isPythonTripleQuote) {
    return tripleQuote;
  }
  return quote;
}

function supportsHashComments(language: LanguageId): boolean {
  return language === LANGUAGE.python || language === LANGUAGE.php;
}

function maskCharacter(masked: string[], index: number): void {
  const character = masked[index];
  const shouldMask =
    character !== undefined && character !== '\n' && character !== '\r';
  if (shouldMask) {
    masked[index] = ' ';
  }
}
