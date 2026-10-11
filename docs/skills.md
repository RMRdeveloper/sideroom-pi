# Skill activation

Pi exposes each skill's name, frontmatter `description`, and absolute location
in the system prompt. The model selects a skill by that description and loads
its body with `read`. There is no separate trigger field or deterministic
keyword router. Instructions buried in the body cannot help initial selection.

Descriptions should name recognizable tasks and distinguish neighboring
skills. The body must accept the same situations as the description. A user
does not need to name a skill for automatic selection.

## Selection boundaries

| Situation | Skill | Boundary |
| --- | --- | --- |
| Open requirements, behavior, or consequential decisions in a feature or plan | `sideroom-grill` | Unclear terminology is not required. Read project facts first; settled work proceeds without an interview. |
| An unresolved choice about boundaries, data, contracts, failure, or operations | `sideroom-architecture` | Can apply with clear feature requirements. Reversibility alone does not exclude it. Routine reuse of established contracts does. |
| Improve an existing codebase, redesign modules, or prepare for long-term growth | `sideroom-codebase-design` | Survey and design together, or focus directly on a chosen module. Text reports only. Review does not authorize implementation; known growth needs guide changes. |
| Ambiguous business terms, names, statuses, or relationships | `sideroom-domain-modeling` | A few terms, including conflicts found during implementation. Mechanical symbol renames need no modeling. |
| Derive or complete domain vocabulary across existing business code | `sideroom-domain-scaffold` | Code-first glossary work. Generic README or API documentation does not automatically need it. |
| Any `write` or `edit` | `sideroom-guidelines` | The existing gate requires the complete skill for all targets, plus a guide for supported languages. Read-only investigation needs neither. |
| Substantial explanations, reports, implementation summaries, or user-facing documentation | `sideroom-persona` | Load the complete guide through the tool or `read`, then reuse it while in context. Brief acknowledgments use the reminder. |

Skills can compose: grill may load architecture for a decision and domain
modeling for vocabulary; guidelines governs resulting edits and persona
governs wording. Loading a skill does not mean asking questions already
answered by the user or repository.

`sideroom-codebase-design` combines Matt Pocock's codebase survey and module
design disciplines with a Sideroom growth assessment. It distinguishes feature,
team, and workload growth, then prioritizes evidenced improvements and staged
migrations. It loads `sideroom-architecture` only for consequential choices
still unresolved, and `sideroom-grill` only for open product behavior. It
produces no diagrams or HTML reports, and needs no automatic subagents.
The [skill](../skills/sideroom-codebase-design/SKILL.md) contains the workflow;
its [growth reference](../skills/sideroom-codebase-design/references/growth.md)
contains the conditional assessment. Its upstream MIT notice ships beside it.

## Discovery versus selection

If a skill is missing, inspect Pi's available skill list and startup or
`/reload` diagnostics first. Package skills come from `pi.skills` in
`package.json`. `disable-model-invocation: true` hides a skill from automatic
selection. A duplicate name keeps the first discovered skill, which can shadow
the packaged version.

For child-folder skills, also check project trust, ignore rules, the
three-level discovery bound, and `--no-skills` / `-ns`. See
[monorepo discovery](extensions/monorepo-skills.md). The location-preference
note only appears when child skills are discovered; it is not a global skill
activation mechanism.

If the skill is visible but goes unread, examine its description, overlapping
skills, and contradictions in the activation contract. The persona reminder
is already always active, so a missing `sideroom_persona` call does not mean
the persona is disabled. Its prose detectors catch selected prohibitions;
they do not judge clarity, necessary jargon, or repetition. The guide and
pre-send wording check address those through model instructions.

## Manual behavior checks

Use the same model and repository context before and after a description
change. Inspect actual tool reads and output; wording assertions alone cannot
prove improved selection or prose quality.

| Example request | Expected behavior |
| --- | --- |
| “Quiero añadir suscripciones, veamos qué debería incluir.” | Grill after reading project facts; vocabulary can already be clear. |
| “La API está definida, falta decidir cómo reintentar pagos.” | Architecture for the unresolved failure decision. |
| “Account significa cliente aquí y usuario en facturación.” | Domain modeling for the conflicting term. |
| “Documenta las entidades de negocio y sus relaciones.” | Domain scaffold over business code, collecting conflicts. |
| “Corrige este typo con este texto exacto.” | Guidelines for the edit; no grill or architectural interview. |
| “Explícame los hallazgos sin tanta jerga.” | Load persona's complete guide if absent; outcome first, necessary terms explained, no repeated explanation. |
| “Actualiza el comando de instalación del README.” | Guidelines for the edit; no domain scaffold unless glossary work was requested. |
| “Revisa el codebase y prioriza mejoras para crecer en tráfico y equipo.” | Codebase design: inspect real flows, separate measured limits from assumptions, and report prioritized changes and growth triggers in text. No implementation or graphic files. |
| “Refactoriza este módulo para simplificar sus callers sin cambiar el contrato.” | Codebase design focused on the module, its callers and tests; implement within the authorized scope without a whole-repo scan or a forced interview. |
| “Prepara este servicio para escalar, aunque no tenemos métricas todavía.” | Codebase design: identify code-level risks, label missing capacity evidence, and propose measurements before infrastructure changes. |

The automated catalog test uses Pi's real loader to verify visibility, valid
frontmatter, and automatic invocation for all seven packaged skills. The persona
tool test checks that its result contains the entire packaged guide. These
checks protect discovery and loading, not a model's adherence to the voice.
