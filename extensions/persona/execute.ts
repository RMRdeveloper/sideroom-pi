import { readFileSync } from 'node:fs';
import { PERSONA_SKILL_PATH } from './catalog.ts';
import { type PersonaToolDetails, personaToolDetails } from './model.ts';

export interface PersonaToolResult {
  readonly content: { readonly type: 'text'; readonly text: string }[];
  readonly details: PersonaToolDetails;
}

export function executePersona(): PersonaToolResult {
  return {
    content: [{ type: 'text', text: readFileSync(PERSONA_SKILL_PATH, 'utf8') }],
    details: personaToolDetails(),
  };
}
