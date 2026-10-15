# Sideroom Visual Context

## English

This is a manually installed companion for Chromium-based browsers 116 or
later, such as Chrome, Edge or Brave. It is not a store installation. Firefox is
not supported.

1. Extract the ZIP. Keep the `sideroom-browser-extension` folder in a permanent
   location; the browser loads the extension from this directory.
2. Open `chrome://extensions` (or `edge://extensions`), enable developer mode,
   choose **Load unpacked**, and select the folder containing `manifest.json`.
3. Install Sideroom Pi with `pi install npm:@rmrdeveloper/sideroom-pi`. Start Pi
   in your project, press `F7`, and choose **Pair browser**.
4. Open the companion, paste the private pairing address from Pi, and choose
   **Connect to Pi**. Keep that address private. Choose a destination if several
   Pi sessions are open. Repeat pairing for a separate Windows or WSL installation.
5. On a normal web page, press `Alt+Shift+S` to start selecting. Click several
   elements. Press the shortcut again or Escape to return to normal browsing.
   Review pending elements with `F7` in Pi, then send your instruction.

Change or assign the shortcut in `chrome://extensions/shortcuts` or
`edge://extensions/shortcuts`. Browser and operating-system shortcuts can take
priority. Internal browser pages and other protected pages cannot be inspected.
Managed browsers can prohibit developer mode.

Updates are manual. Download the ZIP from the new Sideroom GitHub Release,
replace the files in the same folder, and reload the extension from the browser's
extensions page. Do not remove and reinstall it unless you want to pair again.
The extension connects only to authorized local Pi installations; it captures
DOM descriptions, not form values or editable text. Source locations are inferred
candidates by default. Ask Pi to enable compiler context in a selected project
for locations checked against local markup. Pi can run in a parent folder;
F7 can associate a page with a child project. After setup, restart the development
server and refresh the page. This companion requires visual protocol version 3;
upgrade/reload Pi and the companion together without changing the pairing address.

## Español

Esta extensión se instala manualmente en navegadores basados en Chromium 116 o
posterior, como Chrome, Edge o Brave. No se instala desde una tienda. Firefox no
está soportado.

1. Descomprime el ZIP. Guarda la carpeta `sideroom-browser-extension` en una
   ubicación permanente; el navegador carga la extensión desde esa carpeta.
2. Abre `chrome://extensions` (o `edge://extensions`), activa el modo
   desarrollador, elige **Cargar desempaquetada** y selecciona la carpeta que
   contiene `manifest.json`.
3. Instala Sideroom Pi con `pi install npm:@rmrdeveloper/sideroom-pi`. Inicia Pi
   en tu proyecto, pulsa `F7` y elige **Pair browser**.
4. Abre la extensión, pega la dirección privada de emparejamiento de Pi y elige
   **Connect to Pi**. No compartas esa dirección. Elige un destino si hay varias
   sesiones abiertas. Repite el emparejamiento para otra instalación de Windows o WSL.
5. En una página web normal, pulsa `Alt+Shift+S` para seleccionar. Haz clic en
   varios elementos. Pulsa de nuevo el atajo o Escape para navegar normalmente.
   Revisa los elementos con `F7` en Pi y envía tu instrucción.

Cambia o asigna el atajo en `chrome://extensions/shortcuts` o
`edge://extensions/shortcuts`. Los atajos del navegador o del sistema pueden
tener prioridad. No puedes seleccionar elementos de páginas internas del
navegador ni de otras páginas protegidas. Un navegador administrado puede
prohibir el modo desarrollador.

Las actualizaciones son manuales. Descarga el ZIP de la nueva versión de Sideroom
en GitHub Releases, reemplaza los archivos en la misma carpeta y recarga la
extensión desde la página de extensiones del navegador. No la elimines y
reinstales salvo que quieras volver a emparejarla.
La extensión solo se conecta a instalaciones locales de Pi que hayas autorizado;
recoge descripciones de los elementos, no valores de formularios ni texto editable.
Por defecto, los archivos de origen son candidatos inferidos. Pide a Pi que active
el contexto del compilador en un proyecto elegido para obtener ubicaciones
comprobadas contra el código local. Pi puede estar en la carpeta padre; F7 permite
asociar una página con un proyecto hijo. Tras configurarlo, reinicia el servidor
de desarrollo y actualiza la página. Esta versión requiere el protocolo visual 3:
actualiza y recarga Pi y la extensión juntos, conservando el emparejamiento.

Full guide / Guía completa:
https://github.com/RMRdeveloper/sideroom-pi/blob/main/docs/extensions/visual-context.md
