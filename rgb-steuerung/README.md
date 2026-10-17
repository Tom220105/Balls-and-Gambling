# RGB Steuerung (Version 2.3)

Kleines Windows Tool, mit dem man die RGB Beleuchtung im PC einstellt:
Mainboard (ASUS Aura), Lian Li Lüfter, Strimer Kabel, Galahad II Pumpe,
Gigabyte Grafikkarte und G.Skill RAM.

## Benutzen

Einfach `RGB-Steuerung.exe` starten. Man muss nichts installieren.
Nur für den RAM braucht man den PawnIO Treiber, den kann man direkt im Tool
mit dem Knopf "PawnIO installieren (für RAM)" installieren.

Wichtig: L-Connect, Armoury Crate, SignalRGB und OpenRGB müssen komplett
geschlossen sein, sonst überschreiben sie die Farben wieder.

## Neu in Version 2.3: Claude Modus

Im neuen Reiter "Claude" kann man mit Claude chatten. Claude kann dabei die
Farben selbst ändern, zum Beispiel "mach alles lila", "Lüfter wie ein
Sonnenuntergang" oder "etwas Gemütliches für den Abend". Claude kann auch die
Strimer Streifen und die Lüfter einzeln einstellen und Presets laden oder
speichern.

So geht es:

1. Auf console.anthropic.com ein Konto machen und einen API Schlüssel erstellen.
   Die Nutzung kostet etwas Geld, abgerechnet wird über das Anthropic Konto.
2. Den Schlüssel oben im Reiter "Claude" eintragen und auf "Speichern" drücken.
   Er wird mit Windows verschlüsselt gespeichert und nur für deinen Windows
   Benutzer lesbar.
3. Unten eine Nachricht schreiben und Enter drücken.

Ist "Farben sofort am PC anwenden" an, schickt die App die Änderungen gleich
an die Geräte. Den RAM schickt sie nie automatisch, weil Windows dafür jedes Mal
nach Administrator Rechten fragt. Dafür auf "Anwenden" beim RAM drücken.

Die App benutzt das Modell Claude Opus 5.5. Falls Claude eine Anfrage ablehnt,
versucht es der Server automatisch mit einem anderen Claude Modell.

## Neu in Version 2.2

Neues eingebautes Preset "Satt und glücklich". Es zeigt das Gefühl, wenn man
genau das isst, worauf man richtig Bock hatte: warmes Gold und Orange wie
frisches Essen und ein bisschen Rosa für das Glücksgefühl. Die Lüfter und die
Pumpe atmen langsam und zufrieden, und der Strimer lädt sich langsam auf wie ein
Bauch, der voll wird.

## Neu in Version 2.1

Die Lüfter kann man jetzt einzeln einstellen. Dafür gibt es in der Zeile
"Lüfter innen" den Knopf "Einzeln ...". Im Fenster gibt es für jeden Anschluss
vom Lian Li Hub einen Reiter:

1. Bei "Lüfter an diesem Anschluss" stellt man ein, wie viele Lüfter dort in
   einer Reihe hängen (0 bis 4). Lüfter die es nicht gibt, werden grau.
2. Den Effekt, die Helligkeit und das Tempo gibt es für den ganzen Anschluss,
   einmal für innen (Mitte vom Lüfter) und einmal für außen (Rand).
3. Die Farbe kann jeder Lüfter selbst haben, innen und außen getrennt.
   Das klappt bei den Effekten Statisch und Atmen.
4. Haken bei "Lüfter einzeln einstellen" setzen und auf "Anwenden" drücken.

Die einzelnen Lüfter werden auch in Presets gespeichert. Im Fenster
"Neues Preset erstellen" gibt es dafür den Knopf "Lüfter einzeln ...".

## Neu in Version 2.0

Auf der Seite "Presets" gibt es jetzt den Knopf "Neues Preset erstellen ...".
Damit öffnet sich ein eigenes Fenster, in dem man für jedes Gerät Effekt,
Farbe, Helligkeit und Tempo einstellt, einen Namen eingibt und auf
"Preset speichern" drückt. Die Farben am PC ändern sich dabei noch nicht.
Mit "Für alle übernehmen" gilt die Vorlage für alle Geräte, und mit
"Streifen ..." kann man die Strimer Streifen einzeln einstellen.
Das neue Preset steht danach in der Liste und kann wie die anderen geladen werden.

## Was in Version 1.9 repariert wurde

1. Das Farbfeld neben "Wählen" war unsichtbar. Jetzt sieht man die gewählte Farbe.
2. Das Preset "Sonnenuntergang" hat gefehlt. Jetzt ist es in der Liste und der
   Strimer bekommt dabei einen Verlauf von Orange nach Rot.
3. Der RAM ging nicht, sobald ein anderes Programm (zum Beispiel HWiNFO,
   OpenRGB oder SignalRGB) den SMBus schon einmal benutzt hatte. Das Tool hat
   dann mit "SMBus Sperre nicht möglich" abgebrochen. Das ist behoben.
4. Beim Strimer Fenster werden die Einstellungen jetzt auch gespeichert, wenn
   man es oben rechts mit dem X schließt.
5. Beim Autostart wird es jetzt bis zu 3 Mal versucht, falls ein Gerät direkt
   nach dem Windows Start noch nicht bereit ist. Alles wird in
   `Dokumente\RGB-Steuerung\log.txt` mitgeschrieben.

## Selbst bauen

Im Ordner `quellcode` liegt der Quellcode (Go). Bauen mit:

```
cd quellcode
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-H windowsgui -s -w" -o ../RGB-Steuerung.exe .
```

`PawnIO_setup.exe` und `SmbusPIIX4.bin` werden dabei in die exe eingebaut.
