# Kiter

Aplicacion de escritorio con Electron, React y TypeScript para listar archivos de audio.

## Biblioteca de audio

- Pulsa **Abrir carpeta** y selecciona un directorio.
- Se muestran los archivos `.mp3`, `.wav`, `.flac`, `.ogg`, `.m4a` y `.aac`,
  sin distinguir mayusculas y minusculas, ordenados por nombre.
- Se incluyen los archivos del directorio seleccionado y todas sus subcarpetas.
  Cada archivo muestra su ruta relativa para distinguir nombres repetidos.
  No se siguen enlaces simbolicos, evitando ciclos y salidas de la carpeta.
  El filtro usa la extension, no verifica el contenido del audio.
- La lista indica el total y permite desplazarse si hay muchos archivos.
- Cada sample muestra su forma de onda y duracion cuando su fila se acerca a
  la zona visible. Las ondas se procesan de una en una y se guardan hasta 256
  resultados en memoria; los buffers de audio decodificados se liberan.
- Pulsa **Preview** para escuchar un sample y **Detener** para pararlo.
  Un reproductor compartido permite pausar, buscar y ajustar el volumen.
  Reproducir otro sample detiene el anterior; abrir una carpeta detiene la preview.
- Arrastra una fila desde el nombre o la onda hacia Ableton Live u otro DAW.
  Se usa el arrastre nativo del sistema operativo con el archivo original,
  no la URL interna ni un archivo temporal. No se mueve ni modifica el sample.
  El destino debe aceptar archivos externos y soportar el formato de audio.
  Se arrastra un sample por gesto; no hay seleccion multiple.
  Si el archivo deja de estar disponible, se muestra el error en su fila.
- Los archivos se sirven por un protocolo local de Electron con identificadores
  opacos, limitado a la biblioteca cargada. No se exponen rutas de disco como URLs.
- Si el navegador no soporta un codec o el archivo esta danado/no disponible,
  se muestra un error en su fila sin bloquear el resto de la biblioteca.
  Decodificar archivos muy largos puede ser costoso; no se decodifica toda la
  biblioteca al abrirla. La cache es de sesion y se renueva al cargar una carpeta.
- Cancelar conserva la lista anterior. Si la lectura falla, se muestra el error
  y se conserva la ultima carpeta leida correctamente. Si una subcarpeta no se
  puede leer, se informa el error en lugar de mostrar una lista incompleta.

## Validacion

Con Node.js 22.18 o superior:

```bash
pnpm test       # Biblioteca, picos de onda, cache, cancelacion y cola de decodificacion
pnpm test:app   # Compila y prueba la app real con Electron (requiere escritorio)
pnpm lint
```

La prueba de Electron automatiza la seleccion del directorio para comprobar
el flujo completo entre la interfaz, el preload y el proceso principal,
incluyendo ondas de archivos WAV reales, reproduccion, rangos de lectura,
cambio de sample, parada, errores de codec y carga diferida al desplazarse.
Tambien comprueba el evento de arrastre, el puente IPC, la ruta e icono enviados
a `webContents.startDrag`, y el rechazo de archivos no disponibles/no autorizados.
La llamada al arrastre del sistema se sustituye en esa prueba: la recepcion
real del archivo en Ableton Live u otro DAW requiere una prueba manual.

## TypeScript

La comprobacion de tipos usa **TypeScript 7.0.2** mediante el alias
`@typescript/native`, que proporciona el ejecutable `tsc`.
ESLint usa la API de TypeScript 6 mediante el alias
`typescript` para `@typescript/typescript6`, ya que `typescript-eslint` aun no
soporta la API de TypeScript 7. Esta es la
[instalacion conjunta recomendada por Microsoft](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0).

```bash
pnpm exec tsc --version  # Compilador TypeScript 7
pnpm typecheck
```

Para usar TypeScript 7 tambien en el editor, instala la extension recomendada
[TypeScript (Native Preview)](https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.native-preview).
La instalacion de dependencias por si sola no actualiza el servicio de
TypeScript integrado en VS Code.

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ pnpm install
```

### Development

```bash
$ pnpm dev
```

### Build

```bash
# For windows
$ pnpm build:win

# For macOS
$ pnpm build:mac

# For Linux
$ pnpm build:linux
```
