import type { en } from './en.ts';

export const es: typeof en = {
  lang: 'es',
  meta: {
    homeTitle: 'Sideroom Pi — pregunta antes de suponer',
    homeDescription:
      'Un paquete de Pi que pregunta antes de suponer, mantiene el tablero de trabajo sobre el editor, revisa tus propias reglas en cada escritura y revisa los cambios antes de terminar.',
    policyTitle: 'Términos y política de uso — Sideroom Pi',
    policyDescription:
      'Qué hace Sideroom con tu código, qué no hace nunca por su cuenta y qué dice ya la licencia.',
    cardAlt: 'La marca de Sideroom Pi sobre un fondo claro.',
  },
  switchLabel: 'English',
  switchAria: 'Leer esta página en inglés',
  switchHref: '/',
  policyHref: '/es/politica/',
  skipToContent: 'Ir al contenido',
  links: {
    npm: 'El paquete en npm',
    repo: 'El repositorio',
    changelog: 'Todas las versiones publicadas',
    policy: 'Términos y política de uso',
    issues: 'Informar de un fallo',
    security: 'Política de seguridad',
  },

  masthead: {
    name: 'Sideroom Pi',
    nav: {
      faults: 'Fallos',
      ask: 'Preguntas',
      board: 'Tablero',
      browser: 'Navegador',
      rules: 'Reglas',
      session: 'Sesión',
      inside: 'Contenido',
      changelog: 'Versiones',
    },
  },

  opening: {
    claim: 'Pregunta antes de suponer.',
    offer:
      'Sideroom Pi es una sala aparte para Pi, el agente de código. Hace preguntas concretas con una recomendación al lado, mantiene el plan a la vista sobre el editor y aplica tus propias reglas en cada escritura y edición.',
    installNote:
      'Un comando, global para Pi. No se escribe nada en tu proyecto.',
    command: 'pi install npm:@rmrdeveloper/sideroom-pi',
    copy: 'Copiar',
    copied: 'Copiado',
    boardTitle: 'El tablero que construyó esta página',
    boardCaption:
      'Cinco filas sobre el editor mientras el trabajo avanza, en una sesión real. El paso en curso va primero; el resto espera detrás del aviso, y F9 enseña el tablero entero.',
  },

  faults: {
    title: 'Seis fallos a los que llega cualquier sesión larga.',
    lead: 'Cada uno tiene una herramienta detrás. El nombre es la carpeta donde vive.',
    rows: [
      {
        symptom: 'Supone.',
        seen: 'El agente llega a una decisión con dos respuestas razonables, elige una y construye doscientas líneas encima.',
        tool: 'ask',
      },
      {
        symptom: 'El trabajo desaparece.',
        seen: 'El avance se pierde en la transcripción. No sabes en qué paso está ni qué se saltó.',
        tool: 'todo',
      },
      {
        symptom: 'Tu repositorio se llena.',
        seen: 'Un plan de borrador, una lista a medias y notas abandonadas quedan al lado del código real.',
        tool: 'todo',
      },
      {
        symptom: 'Cada sesión inventa su estilo.',
        seen: 'El anidamiento, el manejo de errores, los nombres y la validación cambian de sesión en sesión, y la revisión se vuelve limpieza.',
        tool: 'guidelines',
      },
      {
        symptom: 'Las reglas se leen y se ignoran.',
        seen: 'Un if sin llaves, un error tragado, un console.log y un TODO viejo llegan igual al cambio.',
        tool: 'rules',
      },
      {
        symptom: 'Declara la victoria.',
        seen: 'El agente dice que terminó mientras el formateador, el linter, los tipos o las pruebas nunca se ejecutaron.',
        tool: 'guidelines',
      },
    ],
  },

  ask: {
    title: 'Lo primero que hace es preguntar.',
    lead: 'Una sola tanda, hasta cuatro preguntas, cada una con una recomendación y una salida. Esta es la tanda que decidió esta página: elige tus propias respuestas y el resumen de abajo se actualiza.',
    caption:
      'La tanda real, traducida, tal como se preguntó durante la reconstrucción de esta página. Las opciones marcadas como recomendadas son las que defendió el agente, y las que se tomaron aquí. Responde otra cosa y el resumen cambia.',
    recommended: 'recomendada',
    submit: 'Enviar',
    tabsLabel: 'Preguntas de la tanda',
    outOfScope: 'Fuera de alcance',
    custom: 'Tu propia respuesta',
    customPlaceholder: 'Escribe tu respuesta',
    write: 'Escribir',
    openAnswer: 'sin responder',
    help: 'Tab siguiente · Esc cancelar',
    questions: [
      {
        id: 'idea',
        label: 'La idea',
        prompt: 'Se va el disfraz. ¿Qué sostiene la página en su lugar?',
        recommendedValue: 'material',
        options: [
          {
            value: 'material',
            label: 'Piezas reales del producto',
            description:
              'Cada adorno de la página es algo que la herramienta produce de verdad: una pregunta, una fila del tablero, un comando, una ruta. Fuera las placas de figura, las letras de tecla y los cuadraditos numerados.',
          },
          {
            value: 'editorial',
            label: 'Una página editorial oscura',
            description:
              'Tipografía grande, mucho aire, capturas enmarcadas. Limpio y seguro, y el aspecto por defecto de cualquier página oscura de producto.',
          },
          {
            value: 'transcript',
            label: 'Un registro de sesión',
            description:
              'La página se lee como la transcripción de una sesión: casi todo monoespaciado, secuencial, más difícil de recorrer a saltos.',
          },
        ],
      },
      {
        id: 'showing',
        label: 'El producto',
        prompt: '¿Cómo se muestra la herramienta?',
        recommendedValue: 'live',
        options: [
          {
            value: 'live',
            label: 'Una reproducción viva, capturas para el resto',
            description:
              'La tanda de preguntas es lo único que se puede clicar; el tablero, las reglas y el cierre van con capturas reales.',
          },
          {
            value: 'captures',
            label: 'Sólo capturas reales',
            description:
              'Menos código que mantener y ningún riesgo de que la reproducción se desvíe de la herramienta, pero nadie puede probar nada.',
          },
          {
            value: 'more',
            label: 'Más reproducciones vivas',
            description:
              'Tanda, tablero y una escritura bloqueada, todo vivo. Es lo más parecido a usar la herramienta y lo que más código arrastra.',
          },
        ],
      },
      {
        id: 'type',
        label: 'Tipografía',
        prompt: '¿Cuál de las dos tipografías se queda?',
        recommendedValue: 'one',
        options: [
          {
            value: 'one',
            label: 'Una familia legible, mono para la máquina',
            description:
              'Comandos, rutas y código en mono; todo lo demás, titulares incluidos, en la misma grotesca a tamaños grandes.',
          },
          {
            value: 'newface',
            label: 'Una familia de texto nueva, con más carácter',
            description:
              'Un cambio de voz más marcado, con el coste de volver a medir todos los tamaños y pesos.',
          },
          {
            value: 'moremono',
            label: 'Más mono, no menos',
            description:
              'Voz de terminal en titulares y texto. Coherente con el producto y más difícil de leer en párrafos largos.',
          },
        ],
      },
      {
        id: 'firstscreen',
        label: 'Primera pantalla',
        prompt: '¿Qué tiene que quedar claro antes de bajar?',
        recommendedValue: 'hero',
        options: [
          {
            value: 'hero',
            label: 'El titular, el comando y el tablero real',
            description:
              'El primer scroll enseña qué es, cómo se instala y el producto en marcha. El aviso rojo y los datos bajan a su propia sección.',
          },
          {
            value: 'capture',
            label:
              'La captura del terminal a todo ancho, con el titular encima',
            description:
              'Enseña el producto antes que nada; el titular pierde fuerza sobre una imagen oscura y el comando tarda más en aparecer.',
          },
          {
            value: 'problem',
            label: 'El fallo primero, el agente que edita antes de preguntar',
            description:
              'Entra por el dolor, no por el producto. Más gancho para quien no conoce el problema, y más texto antes de ver nada.',
          },
        ],
      },
    ],
  },

  board: {
    title: 'El tablero es el plan, y el plan está a la vista.',
    lead: 'Hay exactamente un paso activo. El agente lo completa y empieza el siguiente en el mismo movimiento, así que saltarse un paso es estructuralmente difícil.',
    header: (active: number, queued: number) =>
      `Tablero de Sideroom (${String(active)} ${active === 1 ? 'activo' : 'activos'}, ${String(queued)} en cola)`,
    hidden: (count: number) => `…+${String(count)} más · F9: ver todo`,
    overlayTitle: (count: number) => `Tablero de trabajo (${String(count)})`,
    overlayHint: 'F9 o Esc para cerrar',
    fullTitle: 'El tablero entero',
    fullCaption:
      'Todos los elementos, los resueltos incluidos, tal como los enseña F9. El widget de arriba mantiene a la vista el paso activo y esconde el resto detrás de una cuenta.',
    steps: [
      { id: 'read', content: 'Leer el sitio actual' },
      { id: 'grill', content: 'Cerrar la dirección' },
      { id: 'plan', content: 'Escribir el plan de diseño' },
      { id: 'rebuild', content: 'Rehacer la página' },
      { id: 'copy', content: 'Reescribir los dos idiomas' },
      { id: 'design', content: 'Actualizar DESIGN.md' },
      { id: 'check', content: 'Pasar las comprobaciones' },
      { id: 'review', content: 'Leer las páginas construidas' },
    ],
    behavioursTitle: 'Cómo se comporta',
    behaviours: [
      {
        rule: 'Un solo paso activo',
        detail:
          'Un tablero con trabajo pendiente tiene exactamente un elemento en curso.',
      },
      {
        rule: 'Cinco filas sobre el editor',
        detail:
          'El widget enseña como mucho cinco filas y mantiene la activa a la vista.',
      },
      {
        rule: 'F9 abre el tablero entero',
        detail:
          'La lista completa es de sólo lectura y enseña todos los elementos, resueltos incluidos.',
      },
      {
        rule: 'Sobrevive a la sesión',
        detail:
          'Recargar, moverte por el árbol y compactar dejan el tablero donde estaba.',
      },
      {
        rule: 'Muere con la sesión',
        detail:
          'El tablero vive en la rama de la sesión, nunca en un archivo que subas al repositorio.',
      },
    ],
    videoAlt:
      'Una sesión de Pi: una tanda de cuatro preguntas, después el tablero de trabajo y la lista de archivos editados.',
    videoCaption:
      'Diez segundos de una sesión real: la tanda de cuatro preguntas, después el tablero y los archivos que editó.',
  },

  browser: {
    title: 'Señala el elemento. Llévalo a Pi.',
    lead: 'Selecciona un elemento en tu navegador y dale a Pi el contexto de la página y los posibles archivos de origen, sin modificar tu aplicación.',
    videoAlt:
      'Recorrido de la extensión: Alt+Shift+S activa el selector, dos clics preparan el contexto, Escape vuelve a la página y F7 lo revisa en Pi.',
    videoCaption:
      'Treinta segundos del recorrido completo: activar la selección, adjuntar dos elementos, salir y enviar la instrucción en Pi. Sin audio.',
    rows: [
      {
        title: 'Selecciona sin abrir la extensión',
        body: 'Alt+Shift+S activa o desactiva la selección. Haz clic en varios elementos y pulsa Escape para volver a navegar normalmente. Cambia el atajo en la página de atajos de tu navegador: chrome://extensions/shortcuts en Chrome, edge://extensions/shortcuts en Edge.',
      },
      {
        title: 'Revisa antes de que el agente empiece',
        body: 'F7 en Pi muestra los elementos pendientes y sus candidatos de origen. Un clic prepara el contexto; solo tu siguiente instrucción inicia el agente.',
      },
      {
        title: 'Candidatos, no un origen demostrado',
        body: 'La búsqueda compara etiquetas, clases, identificadores y texto visible en archivos locales. Los elementos ambiguos o dinámicos pueden quedar sin resolver. No se capturan valores de formularios ni texto editable.',
      },
      {
        title: 'Solo interviene cuando lo pides',
        body: 'El selector se carga al solicitar una selección y no intercepta clics cuando está inactivo. Autoriza una vez la conexión local con Pi; elige el destino si hay varias sesiones abiertas.',
      },
    ],
    selectionAlt:
      'El selector sobre esta página: un elemento queda resaltado y el selector indica Escape o Alt+Shift+S para salir. Abrir la imagen completa.',
    selectionCaption:
      'El selector incluido sobre esta página. Resalta el elemento bajo el puntero e indica Escape para salir. Abre la imagen para verla completa.',
    popupAlt:
      'Panel de la extensión con la sesión Storefront, el botón Select an element y el atajo asignado. Abrir la imagen completa.',
    popupCaption:
      'El panel incluido con la sesión elegida como destino. Aquí autorizas la conexión y eliges la sesión; el atajo activa la selección sin abrirlo.',
    installTitle: 'Instala sin una tienda de extensiones',
    download: 'Descargar el ZIP de la extensión del navegador',
    downloadNote:
      'Desde la última versión en GitHub Releases. Para navegadores basados en Chromium 116 o posterior, como Chrome, Edge o Brave; Firefox no está soportado.',
    installSteps: [
      'Descomprime el ZIP y guarda la carpeta sideroom-browser-extension en una ubicación permanente.',
      'Abre la página de extensiones de tu navegador (chrome://extensions en Chrome, edge://extensions en Edge), activa el modo desarrollador y elige Cargar desempaquetada. Selecciona la carpeta que contiene manifest.json.',
      'Inicia Pi con Sideroom, pulsa F7 y elige emparejar el navegador. Pega su dirección privada de emparejamiento en la extensión y conecta.',
      'Elige la sesión de Pi si hace falta. En una página web normal, pulsa Alt+Shift+S, selecciona elementos y revísalos en Pi con F7.',
    ],
    updateNote:
      'Las actualizaciones son manuales: descarga el nuevo ZIP, reemplaza los archivos en la misma carpeta y recarga la extensión. Un navegador administrado puede prohibir el modo desarrollador.',
    guide: 'Guía completa de instalación y Windows/WSL',
  },

  rules: {
    title: 'Tus reglas, revisadas en las líneas que se añaden.',
    lead: 'Cada escritura y cada edición se revisan. Sólo se leen las líneas añadidas, así que una regla nunca puede quejarse de código que el agente no escribió.',
    outcomes: [
      {
        id: 'block',
        label: 'Bloqueado',
        body: 'La escritura no ocurre, al agente se le dice qué línea es y el paso siguiente espera.',
        output: [
          'Blocked src/app.ts: sideroom rules violated.',
          '- [braced-conditionals] Wrap the conditional body in braces.',
          'Fix the flagged lines and retry the mutation.',
        ],
      },
      {
        id: 'warn',
        label: 'Señalado',
        body: 'La escritura pasa y el aviso se queda en el resultado, junto al archivo que nombra.',
        output: [
          'Sideroom rules flagged src/app.ts:',
          '- [debug-artifacts] Remove debug output before finishing.',
        ],
      },
      {
        id: 'steer',
        label: 'Corrección',
        body: 'Una regla que sigue saltando tras varios intentos se convierte en una corrección oculta, así que una regla equivocada nunca puede atrapar al agente en un bucle.',
        output: [],
      },
    ],
    linesTitle: 'Ejemplos',
    lines: [
      {
        code: 'if (!user) return 0;',
        verdict: 'Bloqueado',
        state: 'block',
        rule: 'braced-conditionals',
      },
      {
        code: 'catch { return null; }',
        verdict: 'Bloqueado',
        state: 'block',
        rule: 'explicit-error-handling',
      },
      {
        code: 'const data = getResult();',
        verdict: 'Señalado',
        state: 'warn',
        rule: 'clear-names',
      },
      {
        code: 'console.log(order);',
        verdict: 'Señalado',
        state: 'warn',
        rule: 'debug-artifacts',
      },
      {
        code: '// const total = sum(items);',
        verdict: 'Señalado',
        state: 'warn',
        rule: 'comments',
      },
    ],
  },

  session: {
    title: 'La sala está en la sesión, no en tus archivos.',
    lead: 'Todo el estado que produce Sideroom vive en la rama de la sesión de Pi. No hay archivo de configuración que añadir, ni grafo de tareas que subir, ni plan a medias que borrar.',
    body: 'El tablero, el historial de archivos editados y las respuestas a tus preguntas pertenecen a la sesión. Cuando la sesión termina, terminan con ella, y tu árbol de trabajo es exactamente lo que el agente escribió en él.',
    skillsTitle: 'En un monorepo, encuentra las habilidades que tienes debajo.',
    skillsBody:
      'Pi no baja a las carpetas hijas en busca de habilidades del proyecto. Sideroom mira tres niveles hacia abajo, añade sus .pi/skills y .agents/skills a la sesión y deja que Pi resuelva los nombres repetidos.',
    termsTitle: 'Palabras que usa esta página',
    terms: [
      {
        term: 'Tanda de preguntas',
        href: '#ask',
        body: 'Una sola llamada con hasta cuatro preguntas que se responden juntas.',
      },
      {
        term: 'Tablero de trabajo',
        href: '#board',
        body: 'La lista de trabajo guardada en la sesión, con exactamente uno activo.',
      },
      {
        term: 'Línea añadida',
        href: '#rules',
        body: 'Una línea que introduce una escritura o una edición. Las reglas sólo miran esas.',
      },
      {
        term: 'Corrección',
        href: '#rules',
        body: 'Un mensaje oculto que endereza al agente. Por sí solo nunca bloquea.',
      },
      {
        term: 'Hecho del proyecto',
        href: '#ask',
        body: 'Algo que el repositorio ya resuelve, así que al usuario no se le pregunta.',
      },
      {
        term: 'Comando de comprobación detectado',
        href: '#close',
        body: 'El comando del proyecto observado para compartir resultados válidos con la revisión.',
      },
    ],
  },

  inside: {
    title: 'Qué hay dentro.',
    lead: 'Extensiones de Pi, la extensión opcional del navegador y habilidades que se leen cuando hacen falta.',
    toolsTitle: 'Herramientas',
    tools: [
      {
        name: 'visual-context',
        does: 'Conecta la extensión del navegador con Pi y lleva los elementos pendientes y sus candidatos de origen locales a tu siguiente instrucción.',
      },
      {
        name: 'ask',
        does: 'El cuestionario: de una a cuatro preguntas en una tanda, cada una con una recomendación.',
      },
      {
        name: 'todo',
        does: 'El tablero de trabajo sobre el editor, con exactamente un paso activo.',
      },
      {
        name: 'modified-files',
        does: 'Las rutas de los archivos que escribió y editó, como enlaces en los que se puede clicar.',
      },
      {
        name: 'guidelines',
        does: 'La puerta de lectura antes de la primera escritura, y la revisión al final del turno.',
      },
      {
        name: 'rules',
        does: 'Comprobaciones mecánicas en las líneas que añades, bloqueando o anotando cada una.',
      },
      {
        name: 'persona',
        does: 'Las reglas de voz que sigue cada respuesta dirigida al usuario.',
      },
      {
        name: 'done',
        does: 'Comparte con la revisión los resultados observados sin forzar otra respuesta.',
      },
      {
        name: 'explain',
        does: 'Ofrece un recorrido y cómo probar el trabajo cuando se asienta.',
      },
      {
        name: 'jev',
        does: 'Opcional: pregunta a un modelo de decisión por las reglas de la guía, con la evidencia adjunta.',
      },
      {
        name: 'monorepo-skills',
        does: 'Encuentra habilidades en carpetas hijas de un monorepo y las añade a la sesión.',
      },
    ],
    jevTitle: 'Jev',
    jevLead:
      'Opcional, y la única parte del paquete que manda código fuera de tu máquina. Se queda apagado hasta que le des una clave.',
    jevRows: [
      {
        term: 'Qué manda',
        body: 'El archivo cambiado entero y como mucho cuatro archivos de código relacionados: los que importa y los que lo usan. Los dos se buscan dentro de tu directorio de trabajo. La conversación, la sesión, tu configuración y el resto del repositorio no se mandan nunca.',
      },
      {
        term: 'Cómo se enciende',
        body: 'Pon TYPESAFE_API_KEY en tu entorno, o pulsa F10 en la sesión y pega la clave. Sin clave no se hace ninguna petición.',
      },
      {
        term: 'Qué pregunta',
        body: 'Las reglas de la guía que necesitan el código de alrededor: responsabilidad, dirección de dependencias, comentarios, y si la comprobación que ve ya se hace en el borde de entrada.',
      },
      {
        term: 'Qué hacen sus hallazgos',
        body: 'Cada hallazgo nombra una regla y una probabilidad, y llega a la revisión del final del turno. Un hallazgo nunca bloquea una escritura.',
      },
    ],
    skillsTitle: 'Habilidades',
    skills: [
      {
        name: 'sideroom-grill',
        does: 'Te entrevista hasta que un plan difuso queda cerrado, antes de escribir código.',
      },
      {
        name: 'sideroom-architecture',
        does: 'Saca a la luz las decisiones que fuerza un cambio, para preguntarlas en vez de suponerlas.',
      },
      {
        name: 'sideroom-domain-modeling',
        does: 'Resuelve conflictos de nombres y deja escritas las decisiones difíciles.',
      },
      {
        name: 'sideroom-domain-scaffold',
        does: 'Construye un glosario desde el código para un repositorio que no tiene ninguno.',
      },
      {
        name: 'sideroom-guidelines',
        does: 'La lista completa y una guía por lenguaje.',
      },
      {
        name: 'sideroom-persona',
        does: 'Las reglas de voz, completas, para cuando una respuesta las necesita.',
      },
    ],
    languagesTitle: 'Lenguajes',
    languagesLead:
      'Una guía por lenguaje, elegida por la extensión del archivo. En cualquier otro lenguaje siguen aplicándose las tres reglas que no necesitan saber el lenguaje: nombres claros, comentarios viejos y salida de depuración.',
  },

  close: {
    title: 'Revisa los cambios antes de terminar.',
    note: 'Sideroom pide al agente revisar los cambios y ejecutar las comprobaciones pendientes, fallidas o desactualizadas. Los resultados válidos se reutilizan; observar las comprobaciones nunca fuerza otra respuesta.',
    stepTitle: 'Apunta a tus propias reglas.',
    stepBody:
      'El paquete incluye la semilla del archivo de guías. Cópiala y escribe tus propias reglas dentro; las guías se leen antes de la primera edición de un turno, no después.',
  },

  policy: {
    title: 'Términos y política de uso',
    lead: 'Qué hace Sideroom con tu código, qué no hace nunca por su cuenta y qué dice ya la licencia. Todo lo que cuenta esta página se puede comprobar en el repositorio.',
    sendsTitle: 'Tu código sale de tu máquina sólo por Jev',
    sendsLead:
      'Jev es la única parte opcional del paquete que habla con un servicio. Se queda apagado hasta que le des una clave, y sólo tú puedes dársela.',
    sendsRows: [
      {
        term: 'Qué manda',
        body: 'El archivo que has cambiado y como mucho cuatro archivos de código relacionados: los que importa y los que lo usan. Los dos se buscan dentro de tu directorio de trabajo.',
      },
      {
        term: 'Qué no manda nunca',
        body: 'La conversación, la sesión, tu configuración, tu documentación y el resto del repositorio. La búsqueda se salta las rutas ignoradas, las ocultas, las que son enlaces simbólicos, las de nombres sensibles y las de dependencias.',
      },
      {
        term: 'Qué vuelve',
        body: 'Un hallazgo que nombra una regla de la guía y una probabilidad. Llega a la revisión del final del turno y nunca bloquea una escritura.',
      },
    ],
    destinationTerm: 'A dónde va',
    aloneTitle: 'Sideroom no lo enciende por ti',
    aloneLead:
      'Sin clave, Jev no envía ninguna petición a su servicio. La extensión opcional del navegador usa una conexión local y se autoriza aparte con F7. Nada enciende Jev a tus espaldas.',
    aloneBody: [
      'La clave sale de TYPESAFE_API_KEY en tu entorno, o de una que escribas en la pantalla F10. Sideroom sólo guarda una clave cuando se la das, y la borra cuando se lo pides.',
      'La clave se lee en cada uso en vez de recordarse al arrancar, así que borrarla detiene las peticiones al momento, sin reiniciar Pi.',
    ],
    sessionTitle: 'Todo lo demás se queda en tu sesión',
    sessionLead:
      'El tablero, tus respuestas y la lista de archivos que el agente editó pertenecen a la rama de la sesión de Pi. Terminan cuando termina la sesión y nunca llegan a tu repositorio.',
    sessionBody:
      'Lo único que Sideroom escribe en tu árbol de trabajo es el código que le pediste escribir al agente.',
    siteTitle: 'Qué hace este sitio',
    siteLead:
      'Nada que te siga. Las páginas se construyen una vez y se sirven como archivos, las tipografías salen de este mismo sitio, y no hay cookies, ni analítica, ni scripts de terceros.',
    siteBody:
      'La tanda de preguntas de la portada se responde dentro de tu navegador. Tus clics y lo que escribas ahí no se mandan a ningún sitio.',
    licenceTitle: 'Licencia y garantía',
    licenceLead: 'Usar el paquete es gratis y no incluye ninguna garantía.',
    licenceRows: [
      { term: 'Licencia', body: 'MIT.' },
      {
        term: 'Garantía',
        body: 'Ninguna. El paquete se entrega tal cual está, como dice la licencia.',
      },
    ],
    licenceLink: 'Leer el texto de la licencia',
    securityLink: 'Informar de un problema de seguridad',
    linkFromJev: 'Qué sale de tu máquina y cuándo',
  },

  footer: {
    built: 'Esta página se construye desde el repositorio que describe.',
    state: 'Todo el estado que produce se queda en la sesión.',
    license: 'Licencia MIT.',
  },
};
