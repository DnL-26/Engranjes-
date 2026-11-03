# Engranajes

Incremental mecánico: un tren de engranajes donde cada etapa multiplica la velocidad de la siguiente. Diseño completo en [docs/DESIGN.md](docs/DESIGN.md).

## Comandos

```bash
npm install        # dependencias
npm run dev        # servidor de desarrollo en http://localhost:5173
npm test           # tests de la simulación
npm run balance    # un bot juega 4 horas (con fundiciones) y muestra cada ciclo
npm run build      # build de producción en dist/
```

`BOT_SECONDS=3600 npm run balance` acorta la partida del bot y `BOT_STALL=300` cambia cuánto espera sin comprar etapas antes de fundir. En desarrollo, `?speed=40` en la URL acelera la simulación, y `window.__game`, `window.__renderer` y `window.__fx` dan acceso al juego desde la consola.

## Versión web

Cada push a `main` ejecuta los tests, compila y publica el juego en GitHub Pages (`.github/workflows/deploy.yml`):
https://dnl-26.github.io/Engranjes-/

Requisito, una sola vez: en el repositorio, *Settings → Pages → Source: GitHub Actions*.

## Controles

- **Clic** en el escenario, el botón **Manivela** o **Espacio**: girar la manivela.
- Mantener el botón **Sobremarcha** o **Shift**: ×3 de velocidad mientras el motor se calienta. Si llega al 100%, se gripa.

## Estructura

```
src/
  sim/        simulación pura, sin DOM (economía, latón, historia, sobremarcha)
  core/       Game (fachada y eventos), bucle de paso fijo, guardado y progreso offline
  platform/   almacenamiento del guardado (localStorage)
  render/     disposición del tren, dibujo de engranajes en canvas y efectos
  audio/      sonido sintetizado con WebAudio
  ui/         panel de compras, controles y diálogos
tests/        tests unitarios (vitest)
scripts/      simulación de balance
```

Los números de balance están en `src/sim/config.ts` (y los del latón en `src/sim/brass.ts`).
