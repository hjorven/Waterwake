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
- **M3 Hochwasser und Clan**: Die Flutwelle der Schneeschmelze wird jedes Jahr
  höher, überflutete Gebäude nehmen Schaden und werden weggerissen, Pflanzen
  ertrinken. Otter haben eine Stimmung (Hütte, Versorgung, Badesteg,
  Musikplatz, Trauer), bekommen Junge und sterben im Alter. Kampagnenkarte
  Ottertal mit Ziel, Startmenü, Einleitung, Endbildschirm. Spielstände lokal
  (vier Plätze, Autosave) und in der Cloud (Supabase, anonyme Anmeldung).
  Artstil: Tilt-Shift, Farbstimmung je Jahreszeit, braunes Schmelzwasser,
  Hitzeflimmern in der Dürre.
- **M4, Teil 1: Schlammflut und Strom**: Ab dem dritten Jahr bringt die
  Schlammflut schmutziges Wasser aus den Bergen. Die Verschmutzung wandert mit
  dem Fluss, Pflanzen am Ufer gehen ein, schmutziges Trinkwasser macht Otter
  krank (Heilerhütte, Sandfilter). Wasserräder erzeugen Strom aus der Strömung,
  Laufräder als Notstrom, Pumpwerk und Sandfilter verbrauchen ihn. Brunnen und
  Zisterne für lange Dürren. Baumenü mit Reitern Siedlung, Versorgung, Strom.
- **M4, Teil 2: Wissen und Technologiebaum**: Bibliothek, Schule und Sternwarte
  sammeln Wissen, mit dem 14 Techniken erforscht werden (Reiter Forschung). Sie
  schalten 25 der 34 Gebäude frei. Neue Waren: Bretter aus dem Sägewerk für
  Pfahlhaus, Langhaus, Aussichtsturm und mehr, Fisch (Fischerhütte, Fischteich),
  Korn und Brot (Feld, Bäckerei), Kräuter für die Heilerhütte, Werkzeug aus der
  Werkstatt. Abwechslung beim Essen und Freude-Gebäude (Lagerfeuer, Statue,
  Spielplatz, Beerenschenke, Aussichtsturm) machen den Clan zufriedener, der
  Beerengärtner pflanzt Sträucher, die Sternwarte sagt Jahreszeiten genau voraus.
- **M4, Teil 3: Bezirke und Flöße**: Ein zweites Lager oder das Lagerhaus
  (hundert Stück je Ware) bildet einen eigenen Bezirk. Floßanleger am Fluss
  bekommen ein Floß, der Flößer fährt mit und bringt Waren dorthin, wo sie
  knapp sind, solange der Fluss durchgehend Wasser führt (in der Dürre nicht).
  Der Holzsteg macht eine Wasserzelle begehbar. Technik Flößerei.
- **M5, Teil 1: Otter-Kampagne**: Fünf Karten mit eigenem Tal, eigenem
  Jahreslauf und eigenem Ziel: Das Ottertal (16 Otter, Jahr 3), Die Schlucht
  (einen Stausee mit 60 Zellen von 2 Tiefe zwei Tage halten), Das Dürreland
  (Dürren von 14 bis 20 Tagen, 12 Otter, Jahr 3), Das Delta (Nebenfluss und
  Flutwellen vom ersten Jahr an, 30 Otter, Jahr 4) und Der große Clan (60 Otter,
  Jahr 5). Ein Sieg schaltet die nächste Karte frei, der Fortschritt bleibt im
  Browser. `?karte=schlucht` öffnet eine Karte direkt.
- **M5, Teil 2: Tageskarte mit Bestenliste**: Jeden Tag eine neue Zufallskarte,
  für alle Spieler dieselbe (Seed aus dem Datum nach Weltzeit). Es zählt, wie
  lange der Clan durchhält: 10 Punkte je überstandenem Tag und 5 je Otter. Die
  Wertung geht mit einem Spielernamen in die Bestenliste (Supabase-Tabelle
  `ww_daily`, nur die beste des Tages zählt), zu sehen im Startmenü unter
  Tageskarte. `?karte=tageskarte` öffnet die Karte von heute.
- **M5, Teil 3: Karteneditor und Karten teilen**: Im Startmenü unter
  Karteneditor entsteht ein Zufallstal oder eine flache Karte, die sich mit
  den Geländewerkzeugen formen lässt; dazu kommen Quellen, Abflüsse und ein
  Startlager. Das Wasser läuft dabei weiter, damit der Fluss sichtbar wird.
  Über das Menü bekommt die Karte Name, Autor und Ziel, wird im Browser
  gespeichert (bis zu 24 Karten unter `waterwake.maps`), per Probespiel
  getestet und mit einem Code aus sechs Zeichen geteilt (Supabase-Tabelle
  `ww_maps`). Andere geben den Code ein oder öffnen `?code=ABC234`; die Liste
  der neuesten Karten steht im selben Menü. Spielstände auf eigenen Karten
  betten die Karte ein (Spielstand Version 5). `?editor` oder
  `?editor&seed=42` öffnet den Editor direkt.
- **M6, Teil 1: Das Molchvolk**: Ein zweites Volk mit eigener Kampagne
  (Lagune, Schlammtal, Hochland), offen nach dem ersten Sieg im Ottertal.
  Molche bauen mit Stein statt Holz, ihre Höhlen und die Grotte stehen im
  flachen Wasser, der Steinbruch bricht Stein aus dem Hang, die Algenfarm
  liefert Algen, das Kiesbecken reinigt den Wasserspeicher und der Laichplatz
  bringt mehr Nachwuchs. Sie schwimmen schneller als sie laufen, trinken in der
  Dürre doppelt so viel und leiden stärker unter schmutzigem Wasser. Das freie
  Spiel lässt das Volk wählen.

## Steuerung

| Eingabe | Wirkung |
|---|---|
| Linke Maustaste, ein Finger | Werkzeug anwenden, Gebäude setzen, Gebäude anklicken |
| Rechte Maustaste, zwei Finger | Kamera drehen |
| Shift + ziehen, zwei Finger ziehen | Kamera verschieben |
| Mausrad, Kneifen | Zoomen |
| W A S D, Pfeile, Q E | Kamera bewegen und drehen |
| Leertaste, 1 2 3 | Pause, Spielgeschwindigkeit |
| Esc | Werkzeug ablegen, Menü öffnen und schließen |

URL-Parameter: `?karte=ottertal` startet die Kampagne direkt, `?seed=12`
startet ein freies Spiel auf einer anderen Karte, `?frei` macht Wasserbau
kostenlos und schaltet alle Techniken frei, `?alles` schaltet nur die Techniken
frei, `?flach` schaltet den Tilt-Shift-Effekt ab, `?editor` (auch mit
`&seed=42`) öffnet den Karteneditor, `?code=ABC234` lädt eine geteilte Karte, `?frei&volk=molch` startet das freie
Spiel mit dem Molchvolk.

## Spielstände in der Cloud

Die Cloud-Spielstände liegen in Supabase in der Tabelle `ww_saves`, die
Migration steht in `supabase/migrations/`. Die Oberfläche meldet sich anonym
an, jeder Browser sieht nur seine eigenen Spielstände. Projekt-URL und
Schlüssel lassen sich über `VITE_SUPABASE_URL` und `VITE_SUPABASE_KEY`
setzen, sonst gelten die Werte aus `src/online/cloud.ts`.

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

Aufbau: `src/sim` (Simulation, läuft im Worker), `src/render` (Three.js und
Nachbearbeitung), `src/ui` (Oberfläche und Menü), `src/data` (Gebäude, Waren,
Technologien und Karten), `src/online` (Spielstände lokal und in der Cloud).
