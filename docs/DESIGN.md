# Engranajes — Documento de diseño

> Título provisional. Incremental mecánico: un tren de engranajes donde cada etapa multiplica la velocidad de la siguiente.

## Pitch

Empiezas con una manivela y un engranaje de madera. Cada vuelta da una moneda. Compras un motor, luego una segunda etapa: un piñón pequeño engranado a una rueda grande, que gira más rápido. Luego otra, y otra. La velocidad se **multiplica** en cada etapa, y el último engranaje acaba girando a millones de vueltas por segundo: deja de verse, se convierte en un disco borroso que brilla al rojo, después al blanco y después al azul.

## Pilares

1. **El crecimiento exponencial se ve.** No es un número que sube: es el último engranaje convertido en un borrón incandescente, con un zumbido que sube de tono.
2. **Una sola mecánica.** Relación de transmisión = dientes de la rueda / dientes del piñón. Todo el juego sale de ahí.
3. **Dopamina constante.** Hay algo que celebrar cada pocos segundos: un engranaje que cambia de material, una etapa nueva que arranca o una cascada de monedas.
4. **Física real, simplificada.** El tren es compuesto (piñón y rueda en el mismo eje), como en un reloj: las relaciones se multiplican de verdad y los dientes engranan en pantalla.

## Bucle principal

```
girar la manivela / motor → los ejes giran → cada vuelta paga monedas
        ↑                                              ↓
  más velocidad ← más dientes, más etapas, más motor ← comprar
                                                       ↓
          los ejes acumulan vueltas → suben de material → multiplicador global
```

## Sistemas

### Tren de engranajes
- El **eje 0** es el motor. El **eje i** (i ≥ 1) tiene un piñón de 8 dientes, movido por la rueda del eje anterior, y su propia rueda, que mueve al siguiente.
- Relación de la etapa i: `r_i = dientes_rueda / 8`. Empieza en 12 dientes (×1,5) y cada mejora añade 2 dientes (+0,25).
- `vps_i = motor × sobremarcha × Π_{j≤i} r_j` (vueltas por segundo).
- Una etapa nueva multiplica la velocidad de todo lo que viene detrás. Mejorar los dientes tiene rendimientos decrecientes (+0,25 sobre ×6 es poco), así que tarde o temprano conviene añadir otra etapa.

### Economía
- Cada eje paga 1 moneda por vuelta: `monedas/s = Σ vps_i × multiplicador_global`. En la práctica, el último eje aporta casi todo.
- Los costes crecen de forma geométrica (motor, dientes, etapas). Todos los números están en `src/sim/config.ts`.

### Materiales (hitos)
- Cada eje cuenta sus vueltas. Al llegar a 10, 100, 1 000… vueltas sube de material: Madera → Cobre → Bronce → Hierro → Acero → Titanio → Tungsteno → Cristal → Plasma → Estelar → Cuántico.
- Cada nivel de material de **cualquier** eje multiplica todos los ingresos.
- Una etapa nueva, al ser muy rápida, encadena varios materiales en pocos segundos: una **cascada de destellos**. Los ejes lentos del principio también suben, poco a poco, mientras juegas o estás fuera.

### Manivela (juego activo)
- Al principio no hay motor: haces clic para girar la manivela. Cada clic da un impulso que decae solo.
- Más adelante sigue sirviendo: cada clic suma un 25% de la velocidad del motor, hasta un +100%.

### Sobremarcha (riesgo)
- Se desbloquea con 3 etapas. Mientras la mantienes pulsada, la velocidad sube hasta ×3, pero el motor se calienta.
- Si el calor llega al 100%, el motor **se gripa**: se para unos segundos y echa humo. La decisión es cuándo soltar.

### Inercia
- El motor no cambia de velocidad al instante: acelera y frena con inercia. Arrancar, gripar y entrar en sobremarcha se sienten físicos.

### Historia: el Gran Reloj de Valdehierro
- Hace once años el Gran Reloj se paró con el maestro relojero **Anselmo Ruedas** dentro. Desde entonces es un **eco de vapor** atrapado en el mecanismo. Tus engranajes le llegan como vibraciones y le dejan asomarse para guiarte.
- **Objetivo:** que la salida gire a 10⁴⁰ vueltas/s. La barra del Gran Reloj (logarítmica, según la velocidad récord) siempre está visible arriba.
- 9 partes de historia que se desbloquean con hitos: el inicio, el primer motor, la sobremarcha, el primer material Cuántico, la etapa 6 (el horno), el primer renacer, el 50% y el 85% del reloj, y el final.
- **Final:** el reloj da la hora y Anselmo vuelve a ser él. Al terminar de contarlo se abre la pantalla de FIN con estadísticas. Después, modo libre: Anselmo sigue visitándote.

### Anselmo (el guía)
- Retrato SVG animado abajo a la izquierda: flota, el vapor ondula, los engranajes dorados giran y parpadea. Tiene 4 expresiones (normal, sorprendido, preocupado y orgulloso), que cambian con cada frase.
- **Nitidez:** cuanto más avanza el Gran Reloj, más se condensa. En reposo se ve tenue y al hablar se hace más visible; en el final queda del todo nítido.
- **Bocadillo** con texto que se escribe letra a letra, con un "bip" de voz. No bloquea el juego. Un clic completa la frase y el siguiente pasa a la próxima. La historia espera tu clic; reacciones y consejos se cierran solos.
- **Cola de mensajes:** la historia va delante de cualquier charla, y como mucho esperan 2 reacciones o consejos; el resto se descarta.
- **Reacciones** a lo que pasa (casi todas solo la primera vez): primera etapa, primer cambio de material, primera rueda al máximo, primera sobremarcha, gripado (y gripados posteriores, con pausa), primer latón gastado y cada renacer a partir del segundo.
- **Consejos:** tras 40 s sin comprar (con 75 s de pausa entre consejos), el primero que encaje según el momento: manivela, motor, etapa asequible, dientes, latón sin gastar, renacer si estás atascado, sobremarcha. Al pulsar a Anselmo da un consejo o, si no hay ninguno útil, una frase de charla.
- **Recuerdos** (arriba a la derecha): la lista de lo que ya ha contado; elige uno y lo vuelve a contar.
- Todos los textos están en `src/sim/dialogue.ts`.

### Eventos aleatorios
- Premian estar atento. Solo ocurren mientras juegas (nunca en el progreso offline ni con una ventana abierta): el primero, al minuto de tener motor; después, uno cada 2–4 minutos, y de uno en uno. Anselmo anuncia cada evento y comenta cómo acaba. Si el evento termina antes de que llegue a anunciarlo, el anuncio se descarta.
- **Racha de atención:** cada evento resuelto suma 1 (+5% de ingresos, hasta +50%). Perder uno la reinicia. Ignorar al chatarrero no cuenta como perderlo.

| Evento | Qué pasa | Qué hacer | Premio / castigo |
|---|---|---|---|
| Engranaje dorado | cruza la pantalla rodando (12 s) | pulsarlo | 5 min de ingresos, frenesí ×7 durante 30 s o motor frío |
| Campanada | suena la torre (10 s) | girar la manivela | cada clic de manivela vale ×50 |
| Fragmento de recuerdo | voluta azul (10 s) | recogerla | +5% de ingresos permanente y un recuerdo de Anselmo (12 en total) |
| Atasco | una etapa queda en ×1 | 5 golpes | en menos de 5 s: ×2 durante 20 s; si no, se suelta solo al minuto |
| Paloma | frena su etapa a la mitad (45 s) | espantarla | 40%: 1 de latón (o monedas, si aún no has renacido) |
| Aceite | aceitera sobre el motor (20 s) | engrasar | ×1,25 durante 60 s |
| Engranaje inestable | el multiplicador sube +0,35/s | estabilizar a tiempo | ese multiplicador durante 30 s; si revienta (entre ×3 y ×8, oculto), pierde 2 niveles de dientes |
| Chatarrero | oferta durante 30 s | aceptar o no | latón por monedas, elixir ×3 (con calor al 80%) o engranaje misterioso (60%: ×5) |
| Tormenta | 15 s | usar la sobremarcha | la sobremarcha no calienta |
| Pedido del pueblo | un vecino pide algo con tiempo | cumplirlo | monedas, y latón si ya has renacido |
| Resonancia | un anillo late al compás (12 s) | pulsar cuando el anillo se cierra | con 3 o más aciertos: ×(1,5 + 0,3 × aciertos), hasta ×3, durante 30 s |

- **Los pedidos escalan con el progreso:**
  - **Velocidad:** 4× (o 2,5× sin sobremarcha) tu salida nominal; el Turbocompresor sube el factor.
  - **Compras:** 5 + la mitad de tus etapas.
  - **Ganar monedas:** 1,6× lo que ganas en un minuto.
  - **Mantener la sobremarcha:** el 70% de lo que aguanta tu motor antes de griparse (más con Radiador).
  - **Añadir un engranaje:** solo si es asequible en minuto y medio.
  - **Premio:** (150 + 15 × etapas) segundos de ingresos, y latón (etapas / 6) si ya has renacido.
- Los efectos de los eventos están en `src/sim/modifiers.ts` y la lógica en `src/sim/events.ts`.

### Fundición (renacer)
- Siempre disponible. **1 de latón por cada engranaje construido en el ciclo**: en la etapa 4, fundir da 4. Las etapas regaladas por los Planos no cuentan, para que no se pueda renacer en bucle ganando latón gratis.
- Reinicia monedas, motor, etapas y materiales. Se conservan el latón, sus mejoras, la historia y el récord.
- **Tienda de latón:**

| Mejora | Efecto por nivel | Tope |
|---|---|---|
| Motores en paralelo | ×(motores) velocidad del motor | sin tope |
| Piñones finos | piñón de 8 → 7 → 6 dientes: todas las relaciones suben | 2 |
| Fresadora | +8 dientes de tope en cada rueda | sin tope |
| Aleaciones | cada material da +0,02 al multiplicador | sin tope |
| Planos | empiezas cada ciclo con una etapa más (y motor) | 6 |
| Radiador | la sobremarcha calienta un 20% menos | 4 |
| Turbocompresor | sobremarcha +1 al máximo | 3 |
| Autómata | nivel 1: compra dientes y motor; nivel 2: también etapas | 2 |

- El autómata compra lo que más rinde por moneda y, si lo mejor es una etapa que no puede comprar, ahorra para ella.
- El coste de las etapas tiene un término cuadrático (`×1,06^((n−1)(n−2)/2)`): aunque el latón suba lo que aporta cada etapa, siempre acaba apareciendo un muro.

### Ritmo (bot de balance)
- El bot funde cuando lleva 150 s sin poder comprar una etapa. Primer ciclo: ~12 min, etapa 9, +9 latón. Cada ciclo es más corto que el anterior.
- El final llega hacia el ciclo 7, en ~51 min para un bot que compra de forma óptima; una persona tardará algo más.
- En modo libre, el latón crece de forma lineal (un engranaje más, un latón más) mientras las mejoras cuestan de forma geométrica, así que el progreso se va frenando poco a poco. Todas las cantidades tienen un tope de 10³⁰⁰ para que nunca se desborden.

## Sensaciones

- **Engranajes de verdad:** dientes que engranan y ejes que giran en sentidos alternos. La cámara sigue a las últimas etapas, que son las rápidas.
- **Cámara lenta visual:** todos los ejes giran en pantalla a su velocidad real multiplicada por un mismo factor, elegido para que el primer eje visible vaya despacio. Al ser un factor común, las relaciones (y el engrane) se conservan.
- **Cada eje gira más rápido que el anterior:** cuando los dientes se funden, el giro en pantalla sigue creciendo (de forma logarítmica, hasta un tope) y la estela del borrón se alarga con la velocidad. Nunca se frena un eje respecto al anterior.
- **Desenfoque por velocidad:** cuando los dientes pasan demasiado rápido para verlos, el engranaje se convierte en un disco con estelas. El brillo depende de la velocidad real: rojo, naranja, blanco y azul.
- **Motores:** se dibuja uno por cada motor en paralelo, con su eje hacia el engranaje; las aletas se ponen al rojo con el calor.
- **Monedas:** los ejes lentos sueltan un "+1" en cada vuelta; los rápidos, chispas y un flujo continuo.
- **Sonido:** tic al girar la manivela, clac al comprar, una campanilla al cambiar de material (más aguda cuanto mejor es el material) y un zumbido de fondo cuyo tono sigue a la velocidad del último eje.

## Interfaz
- Sin panel lateral: el taller ocupa toda la pantalla.
- Arriba: monedas a la izquierda, la barra del Gran Reloj en el centro y la velocidad de salida a la derecha. Debajo, botones pequeños: *Recuerdos*, *Ver todo el tren* y *Ajustes* (sonido, exportar, importar, borrar).
- Abajo, una barra con la manivela, cuatro botones y la sobremarcha:
  - **Mejorar motor:** compra niveles de motor.
  - **Engranajes:** abre el **taller**, una ventana con una fila por etapa (material, progreso, relación y botón de dientes), el selector ×1/×10/Máx y *Mejorar todo*. El botón muestra cuántas mejoras se pueden pagar.
  - **Añadir engranaje:** compra la etapa siguiente.
  - **Renacer:** siempre disponible. Muestra el latón que darías (1 por engranaje) y abre la **fundición**, con el botón para renacer y la tienda de latón debajo.
- La cámara encuadra el tren en el hueco libre entre la barra superior y la inferior.

## Ideas para más adelante
- **Cajas de cambios:** etapas especiales que alternan entre dos relaciones.
- **Diferencial:** el tren se bifurca en dos ramas que luego se reúnen.
- **Resonancia:** si varios ejes giran a velocidades cuyo cociente es entero, dan bonificación.
- **Segunda capa de prestigio** para el modo libre, con mecánicas nuevas.
