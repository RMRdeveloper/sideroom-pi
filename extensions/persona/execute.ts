import {
  formatPersonaDetail,
  type PersonaToolDetails,
  personaToolDetails,
} from './model.ts';

export interface PersonaToolResult {
  readonly content: { readonly type: 'text'; readonly text: string }[];
  readonly details: PersonaToolDetails;
}

export function executePersona(): PersonaToolResult {
  return {
    content: [{ type: 'text', text: formatPersonaDetail() }],
    details: personaToolDetails(),
  };
}
