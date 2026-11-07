# Waterwake (Flussreich 2)

Städtebau im Browser mit echter Wassersimulation, Dürren und Hochwasser.
Ein Otterclan siedelt an einem unberechenbaren Fluss: Wer Wasser speichert,
Dämme baut und das Land formt, überlebt.

Spielen: https://hjorven.github.io/Waterwake/

## Stand

- **M1 Wasser-Prototyp**: Flusstal mit Mäander und Schlucht, Wassersimulation
  (virtuelle Rohre) im Web Worker, Damm, Deich, Schleusentor, Aufschütten, Sprengen.
- **M2 Erste Siedlung**: Otter mit Bedürfnissen Wasser und Nahrung, Pfadsuche,
  Lager, Wohnhütte, Pumpe, Wassertank, Beerensammler, Holzfäller, Förster,
  Bäume und Beerensträucher mit Bodenfeuchte, Jahreslauf mit angekündigter
  Dürre und Schneeschmelze, neue Oberfläche.

## Steuerung

| Eingabe | Wirkung |
|---|---|
| Linke Maustaste, ein Finger | Werkzeug anwenden, Gebäude setzen, Gebäude anklicken |
| Rechte Maustaste, zwei Finger | Kamera drehen |
| Shift + ziehen, zwei Finger ziehen | Kamera verschieben |
| Mausrad, Kneifen | Zoomen |
| W A S D, Pfeile, Q E | Kamera bewegen und drehen |
| Leertaste, 1 2 3 | Pause, Spielgeschwindigkeit |
| Esc | Werkzeug ablegen |

URL-Parameter: `?seed=12` wählt eine andere Karte, `?frei` macht Wasserbau kostenlos.

## Entwicklung

```bash
npm install
npm run dev
```

Tests und Build:

```bash
npm test
npm run build
```

Aufbau: `src/sim` (Simulation, läuft im Worker), `src/render` (Three.js),
`src/ui` (Oberfläche), `src/data` (Gebäudedaten).
