# RGB Steuerung (Version 1.9)

Kleines Windows Tool, mit dem man die RGB Beleuchtung im PC einstellt:
Mainboard (ASUS Aura), Lian Li Lüfter, Strimer Kabel, Galahad II Pumpe,
Gigabyte Grafikkarte und G.Skill RAM.

## Benutzen

Einfach `RGB-Steuerung.exe` starten. Man muss nichts installieren.
Nur für den RAM braucht man den PawnIO Treiber, den kann man direkt im Tool
mit dem Knopf "PawnIO installieren (für RAM)" installieren.

Wichtig: L-Connect, Armoury Crate, SignalRGB und OpenRGB müssen komplett
geschlossen sein, sonst überschreiben sie die Farben wieder.

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
