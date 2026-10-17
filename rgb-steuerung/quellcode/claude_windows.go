package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"unsafe"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
	"github.com/lxn/walk"
	. "github.com/lxn/walk/declarative"
	"golang.org/x/sys/windows"
)

// Claude Modus: Man chattet mit Claude und Claude kann über Werkzeuge die Farben ändern.

const claudeModel = "claude-opus-5-5"

var (
	chatView     *walk.TextEdit
	chatInput    *walk.LineEdit
	sendBtn      *walk.PushButton
	newChatBtn   *walk.PushButton
	keyEdit      *walk.LineEdit
	keyStatus    *walk.Label
	chatStatus   *walk.Label
	autoApplyChk *walk.CheckBox

	chatMu      sync.Mutex
	chatHistory []anthropic.BetaMessageParam
	chatBusy    bool

	// Steht der Chat gerade am Anfang einer Zeile?
	chatAtLineStart = true
)

const claudeSystemPrompt = `Du bist Claude und steckst in der Windows App "RGB Steuerung". Mit der App stellt man die RGB Beleuchtung in einem Gaming PC ein. Du chattest mit dem Besitzer vom PC und kannst die Farben mit deinen Werkzeugen ändern.

So antwortest du:
- Auf Deutsch, kurz, locker und in einfacher Sprache.
- Keine Gedankenstriche, keine Tabellen und kein Markdown. Der Chat zeigt nur reinen Text.
- Wenn du etwas geändert hast, sag in ein oder zwei Sätzen, was du gemacht hast.

Die Geräte im PC (in Klammern der Name für die Werkzeuge):
- ASUS Aura Mainboard (mainboard)
- Lian Li Lüfter am Uni Hub (luefter_innen und luefter_aussen). Innen ist die Mitte vom Lüfter, außen der Rand.
- Lian Li Strimer Kabel (strimer). Es hat 12 Streifen: 1 bis 6 sind am 24 Pin Kabel, 7 bis 12 am Grafikkarten Kabel (die gibt es nur, wenn so ein Kabel angeschlossen ist).
- Lian Li Galahad II Pumpe (pumpe)
- Gigabyte RTX 4070 Ti SUPER Grafikkarte (grafikkarte)
- G.Skill RAM (ram)

Effekte: statisch, atmen, regenbogen, farbwechsel, aus. Nur der Strimer kann zusätzlich aufladen_hinten_nach_vorne und aufladen_vorne_nach_hinten.
Bei regenbogen und farbwechsel spielt die Farbe keine Rolle.
Helligkeit: 25, 50, 75 oder 100 Prozent. Tempo: 1 (sehr langsam) bis 5 (sehr schnell).

Einzeln einstellen:
- Mit set_strimer_strips bekommt jeder Strimer Streifen eine eigene Einstellung, zum Beispiel für Verläufe.
- Mit set_fans bekommt jeder Lüfter eine eigene Farbe. Am Hub gibt es 4 Anschlüsse mit je bis zu 4 Lüftern in einer Reihe. Effekt, Helligkeit und Tempo gibt es nur für den ganzen Anschluss (innen und außen getrennt), die Farbe hat jeder Lüfter selbst. Eigene Farben pro Lüfter gehen nur bei statisch und atmen.

Regeln:
- Schau dir mit get_lighting die aktuelle Einstellung an, bevor du etwas änderst, das auf der aktuellen Einstellung aufbaut.
- Ändere nur, worum der Nutzer bittet. Wenn er eine Stimmung, ein Gefühl, ein Spiel oder ein Thema beschreibt, such dir selbst passende Farben und Effekte aus.
- Die Änderungen schickt die App automatisch an den PC, wenn der Haken "Farben sofort am PC anwenden" gesetzt ist. Den RAM schickt sie nie automatisch, weil Windows dafür jedes Mal nach Administrator Rechten fragt. Sag dem Nutzer dann, dass er beim RAM auf "Anwenden" drücken muss.
- Mit save_preset speicherst du die aktuelle Einstellung unter einem Namen, mit load_preset lädst du ein Preset. Überschreib ein vorhandenes Preset nur, wenn der Nutzer das will.
- Bei Fragen, die nichts mit der Beleuchtung zu tun haben, darfst du ganz normal antworten.`

// Namen der Effekte für Claude, in der gleichen Reihenfolge wie stripEffects
var effectKeys = []string{"statisch", "atmen", "regenbogen", "farbwechsel", "aus", "aufladen_hinten_nach_vorne", "aufladen_vorne_nach_hinten"}

// ---------- API Schlüssel (mit Windows DPAPI verschlüsselt) ----------

func claudeKeyPath() string {
	return filepath.Join(filepath.Dir(configPath()), "claude_schluessel.dat")
}

func dpapi(data []byte, protect bool) ([]byte, error) {
	if len(data) == 0 {
		return nil, errors.New("leer")
	}
	in := windows.DataBlob{Size: uint32(len(data)), Data: &data[0]}
	var out windows.DataBlob
	const uiForbidden = 0x1
	var err error
	if protect {
		err = windows.CryptProtectData(&in, nil, nil, 0, nil, uiForbidden, &out)
	} else {
		err = windows.CryptUnprotectData(&in, nil, nil, 0, nil, uiForbidden, &out)
	}
	if err != nil {
		return nil, err
	}
	defer windows.LocalFree(windows.Handle(unsafe.Pointer(out.Data)))
	return append([]byte{}, unsafe.Slice(out.Data, out.Size)...), nil
}

// loadClaudeKey holt den gespeicherten Schlüssel, sonst ANTHROPIC_API_KEY.
func loadClaudeKey() string {
	if b, err := os.ReadFile(claudeKeyPath()); err == nil {
		if k, err := dpapi(b, false); err == nil {
			return strings.TrimSpace(string(k))
		}
	}
	return strings.TrimSpace(os.Getenv("ANTHROPIC_API_KEY"))
}

func saveClaudeKey(k string) error {
	p := claudeKeyPath()
	if k == "" {
		os.Remove(p)
		return nil
	}
	enc, err := dpapi([]byte(k), true)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
		return err
	}
	return os.WriteFile(p, enc, 0600)
}

// ---------- Werkzeuge für Claude ----------

func colorProp() map[string]any {
	return map[string]any{"type": "string", "description": "Farbe als Hex Code #RRGGBB, zum Beispiel #FF8800"}
}

func settingProps() map[string]any {
	return map[string]any{
		"effect":     map[string]any{"type": "string", "enum": effectKeys, "description": "Effekt. Die beiden aufladen Effekte gehen nur beim Strimer."},
		"color":      colorProp(),
		"brightness": map[string]any{"type": "integer", "enum": []int{25, 50, 75, 100}, "description": "Helligkeit in Prozent"},
		"speed":      map[string]any{"type": "integer", "minimum": 1, "maximum": 5, "description": "Tempo von 1 (sehr langsam) bis 5 (sehr schnell)"},
	}
}

func withProps(base map[string]any, extra map[string]any) map[string]any {
	for k, v := range extra {
		base[k] = v
	}
	return base
}

func claudeTool(name, desc string, props map[string]any, required []string) anthropic.BetaToolUnionParam {
	t := anthropic.BetaToolParam{
		Name:        name,
		Description: anthropic.String(desc),
		InputSchema: anthropic.BetaToolInputSchemaParam{
			Properties: props,
			Required:   required,
		},
		// Die Eingaben kommen beim Streamen gleich mit, wir prüfen sie danach selbst
		EagerInputStreaming: anthropic.Bool(true),
	}
	return anthropic.BetaToolUnionParam{OfTool: &t}
}

func claudeTools() []anthropic.BetaToolUnionParam {
	devices := append([]string{"alle"}, deviceKeys...)
	return []anthropic.BetaToolUnionParam{
		claudeTool("get_lighting",
			"Zeigt die aktuelle Einstellung aller Geräte, der Strimer Streifen und der einzelnen Lüfter, welche Geräte gefunden wurden und welche Presets es gibt.",
			map[string]any{}, nil),
		claudeTool("set_devices",
			"Ändert Effekt, Farbe, Helligkeit oder Tempo von ganzen Geräten. Felder die fehlen, bleiben wie sie sind. 'alle' ändert alle Geräte auf einmal. Wenn du strimer änderst, gilt die Einstellung wieder für alle Streifen. Wenn du luefter_innen oder luefter_aussen änderst, gilt sie wieder für alle Lüfter.",
			map[string]any{
				"changes": map[string]any{
					"type": "array",
					"items": map[string]any{
						"type": "object",
						"properties": withProps(settingProps(), map[string]any{
							"device": map[string]any{"type": "string", "enum": devices},
						}),
						"required": []string{"device"},
					},
				},
			}, []string{"changes"}),
		claudeTool("set_strimer_strips",
			"Stellt einzelne Strimer Streifen ein (1 bis 6 am 24 Pin Kabel, 7 bis 12 am Grafikkarten Kabel). Damit wird Einzeln beim Strimer eingeschaltet. Felder die fehlen, bleiben wie sie sind.",
			map[string]any{
				"strips": map[string]any{
					"type": "array",
					"items": map[string]any{
						"type": "object",
						"properties": withProps(settingProps(), map[string]any{
							"strip": map[string]any{"type": "integer", "minimum": 1, "maximum": 12},
						}),
						"required": []string{"strip"},
					},
				},
			}, []string{"strips"}),
		claudeTool("set_fans",
			"Stellt Lüfter einzeln ein. port ist der Anschluss am Hub (1 bis 4), fan der Lüfter in der Reihe (1 bis 4, weglassen heißt alle Lüfter am Anschluss). ring sagt, ob innen, aussen oder beide geändert werden. Die Farbe gilt für den Lüfter, Effekt, Helligkeit und Tempo gelten immer für den ganzen Anschluss. Damit wird Einzeln bei den Lüftern eingeschaltet.",
			map[string]any{
				"fans": map[string]any{
					"type": "array",
					"items": map[string]any{
						"type": "object",
						"properties": withProps(settingProps(), map[string]any{
							"port": map[string]any{"type": "integer", "minimum": 1, "maximum": 4},
							"fan":  map[string]any{"type": "integer", "minimum": 1, "maximum": 4},
							"ring": map[string]any{"type": "string", "enum": []string{"innen", "aussen", "beide"}},
						}),
						"required": []string{"port", "ring"},
					},
				},
			}, []string{"fans"}),
		claudeTool("load_preset",
			"Lädt ein gespeichertes oder eingebautes Preset.",
			map[string]any{"name": map[string]any{"type": "string"}}, []string{"name"}),
		claudeTool("save_preset",
			"Speichert die aktuelle Einstellung als Preset. Gibt es den Namen schon, wird nur mit overwrite true überschrieben.",
			map[string]any{
				"name":      map[string]any{"type": "string"},
				"overwrite": map[string]any{"type": "boolean"},
			}, []string{"name"}),
	}
}

// settingInput sind die Felder, die Claude bei einer Einstellung mitschicken kann
type settingInput struct {
	Effect     *string `json:"effect"`
	Color      *string `json:"color"`
	Brightness *int    `json:"brightness"`
	Speed      *int    `json:"speed"`
}

func parseHex(s string) (RGB, error) {
	s = strings.TrimPrefix(strings.TrimSpace(s), "#")
	if len(s) != 6 {
		return RGB{}, fmt.Errorf("Farbe %q ist kein #RRGGBB", s)
	}
	v, err := strconv.ParseUint(s, 16, 32)
	if err != nil {
		return RGB{}, fmt.Errorf("Farbe %q ist kein #RRGGBB", s)
	}
	return RGB{uint8(v >> 16), uint8(v >> 8), uint8(v)}, nil
}

func hex(c RGB) string {
	return fmt.Sprintf("#%02X%02X%02X", c[0], c[1], c[2])
}

func effectIndex(name string, strimer bool) (int, error) {
	for i, k := range effectKeys {
		if k == name {
			if i >= EffChargeBack && !strimer {
				return 0, fmt.Errorf("Effekt %s gibt es nur beim Strimer", name)
			}
			return i, nil
		}
	}
	return 0, fmt.Errorf("Effekt %q gibt es nicht", name)
}

// change ändert s nach den Feldern aus in.
func (in settingInput) change(s Setting, strimer bool) (Setting, error) {
	if in.Effect != nil {
		e, err := effectIndex(*in.Effect, strimer)
		if err != nil {
			return s, err
		}
		s.Effect = e
	}
	if in.Color != nil {
		c, err := parseHex(*in.Color)
		if err != nil {
			return s, err
		}
		s.R, s.G, s.B = c[0], c[1], c[2]
	}
	if in.Brightness != nil {
		b := *in.Brightness
		if b < 1 || b > 100 {
			return s, fmt.Errorf("Helligkeit %d gibt es nicht", b)
		}
		s.Brightness = (b + 12) / 25 // 25 -> 1, 50 -> 2, 75 -> 3, 100 -> 4
		if s.Brightness < 1 {
			s.Brightness = 1
		}
	}
	if in.Speed != nil {
		if *in.Speed < 1 || *in.Speed > 5 {
			return s, fmt.Errorf("Tempo %d gibt es nicht", *in.Speed)
		}
		s.Speed = *in.Speed - 1
	}
	return s.clamp(), nil
}

func describe(s Setting) string {
	e := "statisch"
	if s.Effect >= 0 && s.Effect < len(effectKeys) {
		e = effectKeys[s.Effect]
	}
	return fmt.Sprintf("%s, %s, %d %%, Tempo %d", e, hex(RGB{s.R, s.G, s.B}), s.Brightness*25, s.Speed+1)
}

func settingJSON(s Setting) map[string]any {
	e := effectKeys[0]
	if s.Effect >= 0 && s.Effect < len(effectKeys) {
		e = effectKeys[s.Effect]
	}
	return map[string]any{"effekt": e, "farbe": hex(RGB{s.R, s.G, s.B}), "helligkeit": s.Brightness * 25, "tempo": s.Speed + 1}
}

// onUI führt f im Fenster Thread aus und wartet bis es fertig ist.
func onUI(f func()) {
	done := make(chan struct{})
	mw.Synchronize(func() {
		defer close(done)
		f()
	})
	<-done
}

// readRows holt die Einstellungen aus dem Fenster in cfg.
func readRows() {
	allRow.readUI()
	cfg.All = allRow.s
	for i, r := range devRows {
		r.readUI()
		cfg.Devices[i] = r.s
	}
}

// writeRows zeigt cfg im Fenster an.
func writeRows() {
	allRow.s = cfg.All
	allRow.writeUI()
	for i, r := range devRows {
		r.s = cfg.Devices[i]
		r.writeUI()
	}
	updateStripBtn()
}

// toolTurn sammelt was in einer Antwort von Claude geändert wurde.
type toolTurn struct {
	changed map[int]bool
}

func (t *toolTurn) runTool(name string, raw []byte) (string, error) {
	var res string
	var err error
	switch name {
	case "get_lighting":
		onUI(func() { res, err = toolGetLighting() })
	case "set_devices":
		var in struct {
			Changes []struct {
				Device string `json:"device"`
				settingInput
			} `json:"changes"`
		}
		if err := json.Unmarshal(raw, &in); err != nil {
			return "", fmt.Errorf("Eingabe nicht lesbar: %v", err)
		}
		onUI(func() {
			backup := cfg
			defer func() {
				// Bei einem Fehler nichts halb geändert lassen
				if err != nil {
					cfg = backup
					writeRows()
				}
			}()
			readRows()
			var done []string
			var order []string
			groups := map[string][]string{}
			for _, ch := range in.Changes {
				targets := []int{}
				if ch.Device == "alle" {
					for i := range devRows {
						targets = append(targets, i)
					}
					s, e := ch.settingInput.change(cfg.All, false)
					if e != nil {
						err = e
						return
					}
					cfg.All = s
				} else {
					found := false
					for i, k := range deviceKeys {
						if k == ch.Device {
							targets = append(targets, i)
							found = true
						}
					}
					if !found {
						err = fmt.Errorf("Gerät %q gibt es nicht", ch.Device)
						return
					}
				}
				for _, i := range targets {
					s, e := ch.settingInput.change(cfg.Devices[i], i == DevStrimer)
					if e != nil {
						err = fmt.Errorf("%s: %v", deviceNames[i], e)
						return
					}
					cfg.Devices[i] = s
					t.changed[i] = true
					switch i {
					case DevStrimer:
						cfg.StrimerEinzeln = false
					case DevFanIn, DevFanOut:
						cfg.FanEinzeln = false
					}
					done = append(done, deviceNames[i]+": "+describe(s))
					desc := describe(s)
					if _, ok := groups[desc]; !ok {
						order = append(order, desc)
					}
					groups[desc] = append(groups[desc], strings.SplitN(deviceNames[i], " (", 2)[0])
				}
			}
			writeRows()
			res = "Geändert: " + strings.Join(done, "; ")
			for _, desc := range order {
				names := strings.Join(groups[desc], ", ")
				if len(groups[desc]) == DevCount {
					names = "Alle Geräte"
				}
				appendAction(names + ": " + desc)
			}
		})
	case "set_strimer_strips":
		var in struct {
			Strips []struct {
				Strip int `json:"strip"`
				settingInput
			} `json:"strips"`
		}
		if err := json.Unmarshal(raw, &in); err != nil {
			return "", fmt.Errorf("Eingabe nicht lesbar: %v", err)
		}
		onUI(func() {
			backup := cfg
			defer func() {
				// Bei einem Fehler nichts halb geändert lassen
				if err != nil {
					cfg = backup
					writeRows()
				}
			}()
			readRows()
			if !cfg.StrimerEinzeln {
				// Beim Einschalten erst alle Streifen wie die Strimer Zeile
				for i := range cfg.Strimer {
					cfg.Strimer[i] = cfg.Devices[DevStrimer]
				}
			}
			var done []string
			for _, st := range in.Strips {
				if st.Strip < 1 || st.Strip > 12 {
					err = fmt.Errorf("Streifen %d gibt es nicht", st.Strip)
					return
				}
				s, e := st.settingInput.change(cfg.Strimer[st.Strip-1], true)
				if e != nil {
					err = fmt.Errorf("Streifen %d: %v", st.Strip, e)
					return
				}
				cfg.Strimer[st.Strip-1] = s
				done = append(done, fmt.Sprintf("Streifen %d: %s", st.Strip, describe(s)))
			}
			cfg.StrimerEinzeln = true
			t.changed[DevStrimer] = true
			writeRows()
			res = "Strimer einzeln an. " + strings.Join(done, "; ")
			appendAction(fmt.Sprintf("Strimer: %d Streifen geändert", len(done)))
		})
	case "set_fans":
		var in struct {
			Fans []struct {
				Port int    `json:"port"`
				Fan  *int   `json:"fan"`
				Ring string `json:"ring"`
				settingInput
			} `json:"fans"`
		}
		if err := json.Unmarshal(raw, &in); err != nil {
			return "", fmt.Errorf("Eingabe nicht lesbar: %v", err)
		}
		onUI(func() {
			backup := cfg
			defer func() {
				// Bei einem Fehler nichts halb geändert lassen
				if err != nil {
					cfg = backup
					writeRows()
				}
			}()
			readRows()
			if !cfg.FanEinzeln {
				// Beim Einschalten erst alle Lüfter wie die Lüfter Zeilen
				var all [4]FanPort
				for i := range all {
					all[i] = fanPortFrom(cfg.Devices[DevFanIn], cfg.Devices[DevFanOut])
				}
				keepCounts(&cfg.Fans, all, cfg.Fans)
			}
			var done []string
			for _, f := range in.Fans {
				if f.Port < 1 || f.Port > 4 {
					err = fmt.Errorf("Anschluss %d gibt es nicht", f.Port)
					return
				}
				fp := &cfg.Fans[f.Port-1]
				fans := []int{0, 1, 2, 3}
				if f.Fan != nil {
					if *f.Fan < 1 || *f.Fan > 4 {
						err = fmt.Errorf("Lüfter %d gibt es nicht", *f.Fan)
						return
					}
					fans = []int{*f.Fan - 1}
				}
				var col *RGB
				if f.Color != nil {
					c, e := parseHex(*f.Color)
					if e != nil {
						err = e
						return
					}
					col = &c
				}
				rings := map[string][]bool{"innen": {true}, "aussen": {false}, "beide": {true, false}}[f.Ring]
				if rings == nil {
					err = fmt.Errorf("ring %q gibt es nicht", f.Ring)
					return
				}
				for _, inner := range rings {
					ring := &fp.Outer
					cols := &fp.OuterColors
					if inner {
						ring, cols = &fp.Inner, &fp.InnerColors
					}
					// Farbe pro Lüfter, Effekt usw. für den ganzen Anschluss
					port := f.settingInput
					port.Color = nil
					s, e := port.change(*ring, false)
					if e != nil {
						err = e
						return
					}
					*ring = s
					if col != nil {
						for _, n := range fans {
							cols[n] = *col
						}
					}
				}
				what := "alle Lüfter"
				if f.Fan != nil {
					what = fmt.Sprintf("Lüfter %d", *f.Fan)
				}
				done = append(done, fmt.Sprintf("Anschluss %d %s %s", f.Port, what, f.Ring))
			}
			cfg.FanEinzeln = true
			t.changed[DevFanIn] = true
			writeRows()
			res = "Lüfter einzeln an. Geändert: " + strings.Join(done, "; ")
			appendAction("Lüfter: " + strings.Join(done, ", "))
		})
	case "load_preset":
		var in struct {
			Name string `json:"name"`
		}
		if err := json.Unmarshal(raw, &in); err != nil {
			return "", fmt.Errorf("Eingabe nicht lesbar: %v", err)
		}
		onUI(func() {
			backup := cfg
			defer func() {
				// Bei einem Fehler nichts halb geändert lassen
				if err != nil {
					cfg = backup
					writeRows()
				}
			}()
			c, ok := findPreset(in.Name)
			if !ok {
				err = fmt.Errorf("Preset %q gibt es nicht", in.Name)
				return
			}
			cfg.All = c.All
			cfg.Devices = c.Devices
			cfg.Strimer = c.Strimer
			cfg.StrimerEinzeln = c.StrimerEinzeln
			keepCounts(&cfg.Fans, c.Fans, cfg.Fans)
			cfg.FanEinzeln = c.FanEinzeln
			writeRows()
			for i := range devRows {
				t.changed[i] = true
			}
			res = "Preset " + in.Name + " geladen."
			appendAction("Preset \"" + in.Name + "\" geladen")
		})
	case "save_preset":
		var in struct {
			Name      string `json:"name"`
			Overwrite bool   `json:"overwrite"`
		}
		if err := json.Unmarshal(raw, &in); err != nil {
			return "", fmt.Errorf("Eingabe nicht lesbar: %v", err)
		}
		name := strings.TrimSpace(in.Name)
		if name == "" {
			return "", errors.New("Name fehlt")
		}
		onUI(func() {
			if _, ok := findPreset(name); ok && !in.Overwrite {
				err = fmt.Errorf("Preset %q gibt es schon. Frag den Nutzer, ob es überschrieben werden soll", name)
				return
			}
			readRows()
			presets[name] = cfg
			if e := SavePresets(presets); e != nil {
				err = e
				return
			}
			refreshPresetList()
			res = "Preset " + name + " gespeichert."
			appendAction("Preset \"" + name + "\" gespeichert")
		})
	default:
		return "", fmt.Errorf("Werkzeug %q gibt es nicht", name)
	}
	return res, err
}

func toolGetLighting() (string, error) {
	readRows()
	var devs []map[string]any
	for i := range devRows {
		d := settingJSON(cfg.Devices[i])
		d["geraet"] = deviceKeys[i]
		d["name"] = deviceNames[i]
		d["gefunden"] = found.Has(i)
		devs = append(devs, d)
	}
	var strips []map[string]any
	for i, s := range cfg.Strimer {
		d := settingJSON(s)
		d["streifen"] = i + 1
		strips = append(strips, d)
	}
	var ports []map[string]any
	for i, fp := range cfg.Fans {
		var ci, co []string
		for f := 0; f < 4; f++ {
			ci = append(ci, hex(fp.InnerColors[f]))
			co = append(co, hex(fp.OuterColors[f]))
		}
		in := settingJSON(fp.Inner)
		out := settingJSON(fp.Outer)
		delete(in, "farbe")
		delete(out, "farbe")
		ports = append(ports, map[string]any{
			"anschluss": i + 1, "anzahl_luefter": fp.Count,
			"innen": in, "aussen": out, "farben_innen": ci, "farben_aussen": co,
		})
	}
	state := map[string]any{
		"geraete":                devs,
		"strimer_einzeln":        cfg.StrimerEinzeln,
		"strimer_streifen":       strips,
		"luefter_einzeln":        cfg.FanEinzeln,
		"luefter_anschluesse":    ports,
		"luefter_begrenzung_aus": cfg.NoFanLimit,
		"presets":                PresetNames(presets),
		"sofort_anwenden":        autoApplyChk.Checked(),
	}
	b, err := json.Marshal(state)
	return string(b), err
}

// ---------- Chat ----------

func appendChat(text string) {
	if chatView == nil || text == "" {
		return
	}
	chatView.AppendText(strings.ReplaceAll(strings.ReplaceAll(text, "\r\n", "\n"), "\n", "\r\n"))
	chatAtLineStart = strings.HasSuffix(text, "\n")
}

// appendAction zeigt im Chat in einer eigenen Zeile, was Claude geändert hat.
func appendAction(text string) {
	if !chatAtLineStart {
		appendChat("\r\n")
	}
	appendChat("   (" + text + ")\r\n")
}

func setChatBusy(b bool) {
	chatBusy = b
	sendBtn.SetEnabled(!b)
	newChatBtn.SetEnabled(!b)
	if b {
		chatStatus.SetText("Claude denkt nach ...")
	} else {
		chatStatus.SetText("")
	}
}

func sendChat() {
	if chatBusy {
		return
	}
	text := strings.TrimSpace(chatInput.Text())
	if text == "" {
		return
	}
	key := loadClaudeKey()
	if key == "" {
		walk.MsgBox(mw, "RGB Steuerung", "Bitte trag zuerst oben deinen API Schlüssel von Anthropic ein.", walk.MsgBoxIconInformation)
		return
	}
	chatInput.SetText("")
	appendChat("Du: " + text + "\r\n\r\n")
	setChatBusy(true)
	go func() {
		t := &toolTurn{changed: map[int]bool{}}
		err := chatTurn(key, text, t)
		mw.Synchronize(func() {
			if err != nil {
				if !chatAtLineStart {
					appendChat("\r\n")
				}
				appendChat("(" + friendlyError(err) + ")\r\n")
				logf("Claude: %v", err)
			}
			// Leerzeile vor der nächsten Nachricht
			if !chatAtLineStart {
				appendChat("\r\n")
			}
			appendChat("\r\n")
			finishTurn(t)
			setChatBusy(false)
		})
	}()
}

// finishTurn speichert und schickt die geänderten Geräte an den PC.
func finishTurn(t *toolTurn) {
	if len(t.changed) == 0 {
		return
	}
	if !autoApplyChk.Checked() {
		saveFromUI()
		return
	}
	var idx []int
	for i := range devRows {
		if t.changed[i] && i != DevRAM && found.Has(i) {
			idx = append(idx, i)
		}
	}
	if len(idx) == 0 {
		saveFromUI()
		return
	}
	applyDevices(idx...)
}

func friendlyError(err error) string {
	var apierr *anthropic.Error
	if errors.As(err, &apierr) {
		switch apierr.StatusCode {
		case 401:
			return "Der API Schlüssel stimmt nicht. Bitte prüf ihn oben."
		case 403:
			return "Dein API Schlüssel darf das Modell nicht benutzen."
		case 429:
			return "Zu viele Anfragen oder kein Guthaben mehr. Warte kurz oder schau in deinem Anthropic Konto nach."
		case 529, 500, 502, 503:
			return "Claude ist gerade überlastet. Versuch es gleich nochmal."
		default:
			return fmt.Sprintf("Fehler von Claude (%d)", apierr.StatusCode)
		}
	}
	return "Keine Verbindung zu Claude: " + err.Error()
}

// chatTurn schickt eine Nachricht an Claude und führt die Werkzeuge aus, bis Claude fertig ist.
func chatTurn(key, text string, t *toolTurn) error {
	client := anthropic.NewClient(option.WithAPIKey(key))
	ctx := context.Background()

	chatMu.Lock()
	start := len(chatHistory)
	hist := append(append([]anthropic.BetaMessageParam{}, chatHistory...),
		anthropic.NewBetaUserMessage(anthropic.NewBetaTextBlock(text)))
	chatMu.Unlock()

	tools := claudeTools()
	wrote := false
	for step := 0; step < 12; step++ {
		params := anthropic.BetaMessageNewParams{
			Model:     claudeModel,
			MaxTokens: 64000,
			System:    []anthropic.BetaTextBlockParam{{Text: claudeSystemPrompt}},
			Messages:  hist,
			Tools:     tools,
			// Für einen Chat reicht wenig Nachdenken, dann antwortet Claude schneller
			OutputConfig: anthropic.BetaOutputConfigParam{Effort: anthropic.BetaOutputConfigEffortLow},
			// Der gleiche Anfang wird zwischengespeichert, das macht es billiger
			CacheControl: anthropic.NewBetaCacheControlEphemeralParam(),
			// Falls Claude eine Anfrage ablehnt, versucht es der Server mit einem anderen Modell
			Fallbacks: anthropic.BetaFallbacksParamOfDefault(),
			Betas:     []anthropic.AnthropicBeta{anthropic.AnthropicBetaServerSideFallback2026_07_01},
		}
		stream := client.Beta.Messages.NewStreaming(ctx, params)
		msg := anthropic.BetaMessage{}
		for stream.Next() {
			ev := stream.Current()
			if err := msg.Accumulate(ev); err != nil {
				return err
			}
			if ev.Type == "content_block_delta" && ev.Delta.Type == "text_delta" && ev.Delta.Text != "" {
				d := ev.Delta.Text
				mw.Synchronize(func() {
					if !wrote {
						appendChat("Claude: ")
						chatStatus.SetText("Claude schreibt ...")
						d = strings.TrimLeft(d, " ")
					} else if chatAtLineStart {
						d = strings.TrimLeft(d, " ")
					}
					wrote = true
					appendChat(d)
				})
			}
		}
		if err := stream.Err(); err != nil {
			return err
		}

		if msg.StopReason == anthropic.BetaStopReasonRefusal {
			// Abgelehnt: die halbe Antwort nicht in den Verlauf übernehmen
			mw.Synchronize(func() { appendChat("\r\n(Claude möchte darauf nicht antworten.)\r\n") })
			chatMu.Lock()
			chatHistory = chatHistory[:start]
			chatMu.Unlock()
			return nil
		}

		hist = append(hist, msg.ToParam())

		var results []anthropic.BetaContentBlockParamUnion
		for _, block := range msg.Content {
			if block.Type != "tool_use" {
				continue
			}
			raw := []byte(block.Input)
			if len(raw) == 0 {
				raw = []byte("{}")
			}
			var check map[string]any
			if err := json.Unmarshal(raw, &check); err != nil {
				results = append(results, anthropic.NewBetaToolResultBlock(block.ID, "INVALID_JSON: Die Eingabe war kein gültiges JSON. Bitte nochmal senden.", true))
				continue
			}
			out, err := t.runTool(block.Name, raw)
			if err != nil {
				results = append(results, anthropic.NewBetaToolResultBlock(block.ID, "Fehler: "+err.Error(), true))
			} else {
				results = append(results, anthropic.NewBetaToolResultBlock(block.ID, out, false))
			}
		}

		if msg.StopReason != anthropic.BetaStopReasonToolUse || len(results) == 0 {
			break
		}
		hist = append(hist, anthropic.NewBetaUserMessage(results...))
	}

	chatMu.Lock()
	chatHistory = hist
	chatMu.Unlock()
	return nil
}

func newChat() {
	if chatBusy {
		return
	}
	chatMu.Lock()
	chatHistory = nil
	chatMu.Unlock()
	chatView.SetText("")
	appendChat("Claude: Hi! Sag mir einfach, wie dein PC leuchten soll. Zum Beispiel \"mach alles lila\", \"Lüfter wie ein Sonnenuntergang\" oder \"etwas Gemütliches für den Abend\".\r\n\r\n")
}

func saveKeyFromUI() {
	k := strings.TrimSpace(keyEdit.Text())
	if err := saveClaudeKey(k); err != nil {
		keyStatus.SetText("Fehler: " + err.Error())
		keyStatus.SetTextColor(walk.RGB(190, 0, 0))
		return
	}
	keyEdit.SetText("")
	updateKeyStatus()
}

func updateKeyStatus() {
	if loadClaudeKey() != "" {
		keyStatus.SetText("Schlüssel ist eingetragen")
		keyStatus.SetTextColor(walk.RGB(0, 130, 0))
	} else {
		keyStatus.SetText("Noch kein Schlüssel")
		keyStatus.SetTextColor(walk.RGB(190, 0, 0))
	}
}

func claudePage() TabPage {
	return TabPage{
		Title:  "Claude",
		Layout: VBox{},
		Children: []Widget{
			Composite{
				Layout: HBox{MarginsZero: true},
				Children: []Widget{
					Label{Text: "API Schlüssel:"},
					LineEdit{AssignTo: &keyEdit, PasswordMode: true, MinSize: Size{Width: 260}, CueBanner: "sk-ant-..."},
					PushButton{Text: "Speichern", OnClicked: saveKeyFromUI},
					Label{AssignTo: &keyStatus, MinSize: Size{Width: 160}},
					HSpacer{},
					Label{Text: "Den Schlüssel gibt es auf console.anthropic.com"},
				},
			},
			TextEdit{
				AssignTo:  &chatView,
				ReadOnly:  true,
				VScroll:   true,
				MaxLength: 2000000000,
				Font:      Font{Family: "Segoe UI", PointSize: 10},
			},
			Composite{
				Layout: HBox{MarginsZero: true},
				Children: []Widget{
					LineEdit{
						AssignTo:  &chatInput,
						CueBanner: "Schreib Claude, wie dein PC leuchten soll ...",
						OnKeyDown: func(key walk.Key) {
							if key == walk.KeyReturn {
								sendChat()
							}
						},
					},
					PushButton{AssignTo: &sendBtn, Text: "Senden", MinSize: Size{Width: 90}, OnClicked: sendChat},
					PushButton{AssignTo: &newChatBtn, Text: "Neuer Chat", MinSize: Size{Width: 90}, OnClicked: newChat},
				},
			},
			Composite{
				Layout: HBox{MarginsZero: true},
				Children: []Widget{
					CheckBox{AssignTo: &autoApplyChk, Text: "Farben sofort am PC anwenden (den RAM nur über den Anwenden Knopf)", Checked: true},
					HSpacer{},
					Label{AssignTo: &chatStatus, Text: " "},
				},
			},
		},
	}
}
