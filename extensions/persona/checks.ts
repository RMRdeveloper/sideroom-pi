import {
  type Prohibition,
  type ProhibitionId,
  prohibitionById,
  TEXT_SCOPE,
  type TextScope,
} from './catalog.ts';

interface ProhibitionDetector {
  readonly prohibitionId: ProhibitionId;
  readonly pattern: RegExp;
}

// Each detector is a heuristic for one prohibition. The rule text in the
// catalog stays authoritative; a detector never fires on its own judgement.
const DETECTORS: readonly ProhibitionDetector[] = [
  {
    prohibitionId: 'decorative-symbols',
    pattern: /\p{Emoji_Presentation}|\uFE0F|[\u2713\u2714\u2717\u2718]/u,
  },
  {
    prohibitionId: 'flattery-and-filler',
    pattern:
      /^[ \t>*+-]*(?:[¡!]?\s*(?:great|excellent|awesome|fantastic|amazing|perfect|good)\s+(?:question|idea|point|catch|observation|call)\b[!.]?|certainly\b|of course\b|absolutely\b|sure thing\b|[¡!]?\s*(?:excelente|gran|buena|perfecta)\s+(?:pregunta|idea|observaci[oó]n|punto)\b[!.]?|por supuesto\b|claro que s[ií]\b)/imu,
  },
  {
    prohibitionId: 'hedging-and-apology',
    pattern:
      /\b(?:sorry (?:for|about)|i apologize|my apologies|perd[oó]n por|disculp[áa]|lamento (?:el|la|los|las|haber|no haber))\b|\b(?:maybe we could|might be worth|i think we could|we could consider|perhaps we could|quiz[áa]s podr[íi]amos|tal vez podr[íi]amos|podr[íi]amos considerar|creo que podr[íi]amos|you might want to consider)\b/iu,
  },
  {
    prohibitionId: 'ai-meta-commentary',
    pattern:
      /\b(?:as an ai\b|as a language model\b|i['’]?m an ai\b|i am an ai\b|como (?:un )?modelo de lenguaje\b|soy una? (?:ia|inteligencia artificial|asistente de ia)\b|no tengo acceso a (?:internet|tiempo real)\b|i (?:do not|don['’]?t) have access to (?:the )?internet\b)/iu,
  },
];

export interface ProhibitionViolation {
  readonly prohibition: Prohibition;
  readonly excerpt: string;
}

export function findViolations(
  text: string,
  scope: TextScope,
): readonly ProhibitionViolation[] {
  if (text.length === 0) {
    return [];
  }

  const violations: ProhibitionViolation[] = [];
  for (const detector of DETECTORS) {
    const prohibition = prohibitionById(detector.prohibitionId);
    if (!prohibition.scopes.includes(scope)) {
      continue;
    }
    const match = detector.pattern.exec(text);
    if (match === null) {
      continue;
    }
    violations.push({ prohibition, excerpt: excerptOf(match[0]) });
  }
  return violations;
}

export function artifactViolations(
  addedLines: readonly string[],
): readonly ProhibitionViolation[] {
  return findViolations(addedLines.join('\n'), TEXT_SCOPE.artifact);
}

export function addedLinesMissingFrom(
  previous: string | undefined,
  next: string,
): readonly string[] {
  const remaining = countLines(previous);
  const added: string[] = [];

  for (const line of next.split('\n')) {
    const key = line.trim();
    if (key.length === 0) {
      continue;
    }
    const available = remaining.get(key) ?? 0;
    if (available > 0) {
      remaining.set(key, available - 1);
      continue;
    }
    added.push(line);
  }

  return added;
}

function countLines(content: string | undefined): Map<string, number> {
  const counts = new Map<string, number>();
  if (content === undefined) {
    return counts;
  }

  for (const line of content.split('\n')) {
    const key = line.trim();
    if (key.length === 0) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

// Detector matches are short by construction; drop the bullet or indentation
// they carry so the reason stays on one line.
function excerptOf(match: string): string {
  const singleLine = match.replaceAll(/\s+/gu, ' ').trim();
  return singleLine.replace(/^[>*+-]+\s*/u, '');
}
