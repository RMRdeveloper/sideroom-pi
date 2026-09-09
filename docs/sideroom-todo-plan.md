# Plan de continuación: `sideroom_todo`

Este documento conserva el contrato de diseño acordado para `sideroom_todo`. La implementación, pruebas, documentación y Changeset descritos aquí están presentes en la rama actual; consérvalo como referencia de contrato y checklist de mantenimiento.

## Ruta rápida

1. Implementar y probar la lógica pura en `extensions/todo/model.ts`.
2. Separar ejecución, sesión y steers en `execute.ts`, `session.ts` y `guards.ts`.
3. Dejar `extensions/todo/index.ts` como entrada de Pi que compone esos colaboradores.
4. Construir el widget de solo lectura en `extensions/todo/ui.ts`.
5. Añadir pruebas, documentación, Changeset y ejecutar `npm run check`.

No crear commits ni publicar salvo petición explícita.

## Resultado esperado

`sideroom_todo` será una herramienta normal del agente padre que mantiene un tablero visible encima del editor. El agente propone o actualiza las tareas; la persona usuaria lo dirige por chat. El tablero debe sobrevivir cambios de rama de sesión y compactación, sin escribir archivos de estado en el repositorio objetivo.

## Contrato cerrado

| Área | Decisión |
| --- | --- |
| Nombre | Registrar `sideroom_todo`, nunca `todo` (colisiona con la herramienta integrada de Pi). |
| Superficie | Widget visible y de solo lectura mediante `ctx.ui.setWidget`; no es un diálogo de aprobación ni un bloc de notas oculto. |
| Interacción | El agente llama la herramienta; la persona usuaria cambia el rumbo por chat. |
| Verbos | `propose` reemplaza toda la lista; `update` aplica parches por `id`. |
| Estado externo | No escribir archivos en el repositorio objetivo y no añadir `/todos` ni un slash command. |
| Ejecución | Herramienta secuencial, siguiendo el patrón de `extensions/ask/`. |
| Idioma | Copia de UI y bloques de prompt en inglés; conversación y este plan en español. |

## Modelo de datos

### Elemento

```ts
type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

interface TodoItem {
  readonly id: string;
  readonly content: string;
  readonly status: TodoStatus;
}
```

### Límites y normalización

- `id`: string proporcionado por quien llama, `trim()`, 1–32 caracteres y único.
- `content`: `trim()`, 1–200 caracteres.
- La lista acepta 0–20 elementos.
- El código nunca renumera identificadores.
- Sobrepasar límites, repetir un `id`, o referirse a un `id` inexistente es un error; no recortar silenciosamente fuera de normalizar espacios de los extremos.

### Invariantes de estado

- Puede haber como máximo un elemento `in_progress`.
- Si existe cualquier elemento `pending`, debe existir exactamente un `in_progress`.
- Si no hay elementos `pending`, puede haber cero o uno `in_progress`.
- `completed` y `cancelled` son estados resueltos.
- `propose` con una lista vacía limpia el tablero.

### Parámetros

Usar un único objeto TypeBox con `action` y propiedades opcionales:

```ts
type TodoParams =
  | { action: 'propose'; items: TodoItem[] }
  | {
      action: 'update';
      patches: Array<{
        id: string;
        status?: TodoStatus;
        content?: string;
      }>;
    };
```

Reglas adicionales:

- `propose` es el único verbo que puede añadir, quitar o reordenar elementos.
- `update` admite una tanda de parches para completar el actual e iniciar el siguiente en una sola llamada.
- Cada parche debe cambiar `status` o `content`; `{ id }` solo no es válido.
- No se pueden repetir `id` en una tanda de parches.
- `propose` necesita TUI para poder pintar el tablero; si no hay TUI devuelve exactamente `UI_UNAVAILABLE` siguiendo `extensions/ask/model.ts`.
- `update` funciona en modos print/RPC/JSON.

## Prompt del agente

En cada `before_agent_start`, reconstruir el tablero e inyectar este bloque mediante el resultado `systemPrompt`. No almacenarlo como `custom_message`. Omitir la inyección si no hay elementos.

```text
sideroom_todo (live board; do not recap in prose)
> auth   in_progress  Add login route
- tests  pending      Cover login
✓ schema completed    Item types
~ extra  cancelled    Optional telemetry

Call sideroom_todo update before the next item. While any item is pending, exactly one must be in_progress. Complete the current item and start the next in the same update. propose replaces the list; update patches by id.
```

Marcas: `>` para `in_progress`, `-` para `pending`, `✓` para `completed` y `~` para `cancelled`. Mantener el orden de la lista. Compartir `formatBoardBlock()` entre este bloque y el widget.

## Persistencia y compactación

La instantánea canónica es `{ items }` y se escribe al terminar con éxito cada `propose` o `update`:

```ts
pi.appendEntry('sideroom-todo', { items });
```

Además, devolver los elementos en `details` del resultado de la herramienta.

Para reconstruir el estado:

1. Usar `ctx.sessionManager.getBranch()`; no usar `buildContextEntries()` ni `getEntries()`.
2. Escanear la rama desde el final para encontrar la última entrada personalizada con `customType: 'sideroom-todo'`.
3. Una lista vacía encontrada es estado válido y definitivo: no aplicar fallback.
4. Solo si no existe esa entrada, usar el último `details` de resultado de `sideroom_todo` en la rama.

La entrada personalizada no llega al LLM, por eso el bloque `systemPrompt` se recompone antes de cada turno. No tomar el evento `session_before_compact` ni reemplazar `/compact`.

Refrescar el widget tras:

- `session_start`
- `session_tree`
- `session_compact`
- cada ejecución exitosa de la herramienta

Claves cerradas:

| Uso | Valor |
| --- | --- |
| Clave del widget | `sideroom-todo` |
| `customType` de la instantánea | `sideroom-todo` |
| Nudge de propuesta | `sideroom-todo-nudge` |
| Watchdog de actualización | `sideroom-todo-watchdog` |

## Prevención de omisiones

La prevención orienta al agente, pero nunca bloquea `write`, `edit` ni `bash`.

1. Incluir el tablero compacto en todos los `before_agent_start`.
2. Si una llamada mutante (`write`, `edit` o `bash`) ocurre con tablero vacío, enviar un único nudge para que haga `propose`.
3. Si un turno usó una herramienta mutante y no llamó `sideroom_todo`, enviar un único watchdog para que haga `update`.
4. Emitir ambos mensajes con `sendMessage`, `display: false`, `deliverAs: 'steer'` y `triggerTurn: true`.
5. Etiquetar los steers propios para que su continuación no dispare otro nudge o watchdog.

Estado mínimo de control:

```ts
proposeNudgedThisRun: boolean;
updateWatchdogThisTurn: boolean;
turnMutated: boolean;
turnCalledTodo: boolean;
steerFromUs: boolean;
```

Restablecer `proposeNudgedThisRun` solamente cuando llegue un evento `input` con `source: 'interactive'` o `source: 'rpc'`. No restablecerlo en `agent_start` ni en cada `before_agent_start`: esos eventos también ocurren para continuaciones dirigidas por los propios steers.

Añadir `promptGuidelines` para `sideroom_todo`, pero no confiar solo en ellas: el widget no forma parte del contexto del LLM.

## Archivos a crear o actualizar

| Archivo | Responsabilidad |
| --- | --- |
| `extensions/todo/model.ts` | Esquemas TypeBox, tipos, parseo, normalización, parches, invariantes y decisiones puras de nudge/watchdog. |
| `extensions/todo/execute.ts` | Preparación pura de resultados `propose`/`update`; no muta el store. |
| `extensions/todo/session.ts` | Reconstrucción, instantáneas, refresco del widget e inyección del prompt. |
| `extensions/todo/guards.ts` | Steers de prevención de omisiones. |
| `extensions/todo/index.ts` | `registerTool` y composición de colaboradores. |
| `extensions/todo/ui.ts` | Widget de solo lectura, distintivo y compacto, usando tokens de tema de Pi. |
| `extensions/todo/model.test.ts` | Límites, normalización, parches, duplicados, ids desconocidos e invariantes. |
| `extensions/todo/execute.test.ts` | Modo TUI/no TUI de `propose`/`update`. |
| `extensions/todo/session.test.ts` | Reconstrucción de instantáneas, incluida una lista vacía canónica. |
| `extensions/todo/index.test.ts` | Persistencia, inyección, refresco y controles de omisión. |
| `AGENTS.md` | Añadir `extensions/todo/` como fuente de verdad y sus reglas de diseño. |
| `README.md` | Documentar ambos tools y el uso del tablero. |
| `package.json` | Actualizar descripción y palabras clave si corresponde; ampliar scripts de lint/formato para incluir `docs` solo si se acuerda. |
| `.changeset/<nombre>.md` | Changeset menor para el nuevo tool. |

## Orden recomendado de implementación

### 1. Lógica y pruebas de `model.ts`

Seguir el patrón de `extensions/ask/model.ts`:

- Declarar el esquema con TypeBox.
- Ejecutar `Check()` y luego validaciones semánticas con mensajes de error explícitos.
- Exportar `parseTodoParams()`.
- Implementar aplicación atómica de parches: validar todo antes de exponer la lista resultante.
- Exportar `formatBoardBlock()`, para no duplicar formato entre UI e inyección.
- Cubrir primero el contrato de errores; después los helpers de nudge/watchdog.

### 2. Wiring por colaboradores

- `execute.ts` prepara el resultado; no muta el store.
- `session.ts` reconstruye, confirma el tablero, refresca el widget e inyecta el prompt.
- `guards.ts` emite los steers de prevención de omisiones.
- `index.ts` registra `sideroom_todo` con `executionMode: 'sequential'` y compone esos colaboradores.
- Persistir únicamente tras una operación exitosa.
- Devolver los elementos en `details` para fallback compatible con el historial de herramientas.
- Reconstruir con `getBranch()` y preferir la última entrada `sideroom-todo`.
- Instalar los manejadores de `session_start`, `session_tree`, `session_compact`, `input`, `before_agent_start`, `tool_execution_start` y el final de turno elegido para el watchdog.
- Usar `before_agent_start` para devolver `systemPrompt`, no `message`.

### 3. Widget en `ui.ts`

- Mostrar una cabecera breve y filas compactas con el marcador, id, estado y contenido.
- Usar `theme.fg(...)` y otros tokens de Pi; no codificar colores ANSI.
- Devolver `undefined` a `setWidget` cuando el tablero esté vacío.
- Mantenerlo informativo, no interactivo, y sin copiar el aspecto de la encuesta `sideroom_ask`.

### 4. Documentación y release

- Actualizar `AGENTS.md` y `README.md` con el nuevo tool y sus límites.
- Crear un Changeset menor.
- No añadir ESLint ni Prettier; Biome es el único linter/formateador.

## Checklist de aceptación

### Contrato

- [ ] `propose` reemplaza la lista, incluso al vaciarla.
- [ ] `update` solo cambia elementos existentes y acepta un lote atómico.
- [ ] Los ids se conservan, son únicos y respetan 1–32 caracteres.
- [ ] El contenido respetar 1–200 caracteres tras `trim()`.
- [ ] Las invariantes de `in_progress` se cumplen tras cada operación exitosa.
- [ ] No existen campos extra como `activeForm`, notas o prioridad.

### Visibilidad y contexto

- [ ] El widget aparece encima del editor y se actualiza en las transiciones de sesión acordadas.
- [ ] El bloque de tablero se inyecta antes de cada turno no vacío.
- [ ] El LLM no recibe una recapitulación redundante fuera del bloque.
- [ ] El usuario puede guiar cambios mediante chat, sin pantalla de aprobación.

### Supervivencia de sesión

- [ ] Cada mutación exitosa escribe `appendEntry('sideroom-todo', { items })`.
- [ ] La reconstrucción usa la última entrada personalizada de `getBranch()`.
- [ ] Una instantánea vacía no cae al fallback de tool results.
- [ ] Compactar o navegar el árbol conserva tanto widget como prompt.

### Prevención de omisiones

- [ ] Un primer `write`/`edit`/`bash` con tablero vacío recibe, como máximo, un nudge de `propose` por prompt real de usuario.
- [ ] Un turno mutante sin `sideroom_todo` recibe, como máximo, un watchdog de `update`.
- [ ] Los steers emitidos por la extensión no se encadenan en un bucle.
- [ ] No se bloquea ninguna operación mutante.

### Verificación final

- [ ] Ejecutar `npm run types`.
- [ ] Ejecutar `npm test`.
- [ ] Ejecutar `npm run check`.
- [ ] Revisar `lsp_diagnostics` y `lens_diagnostics` para los archivos modificados.
- [ ] Confirmar que el Changeset describe un cambio menor y que no se publicó ni se creó un commit sin petición.

## Referencias de implementación

- `extensions/ask/index.ts`: registro de herramienta, ejecución secuencial, resultados y renderizado.
- `extensions/ask/model.ts`: TypeBox con `Check()` y validación semántica posterior.
- `extensions/ask/index.test.ts` y `extensions/ask/model.test.ts`: patrón de pruebas con dependencias inyectables.
- `examples/extensions/todo.ts`: reconstrucción desde la rama de sesión; no copiar su comando `/todos`.
- `examples/extensions/plan-mode/index.ts`: widget y `appendEntry`.
- `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts`: contratos de `setWidget`, `sendMessage`, `appendEntry`, `InputEvent`, `BeforeAgentStartEvent` y eventos de sesión.
- `AGENTS.md`: restricciones del paquete y comandos de calidad.

## Próximo paso

Crear `extensions/todo/model.ts` junto con `extensions/todo/model.test.ts`. Antes de integrar Pi, verificar por pruebas la normalización, las invariantes y la semántica de parches; después conectar la persistencia y los eventos en `index.ts`.
