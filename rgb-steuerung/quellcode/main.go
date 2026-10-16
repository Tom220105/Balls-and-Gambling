package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unsafe"

	"github.com/lxn/walk"
	. "github.com/lxn/walk/declarative"
	"github.com/lxn/win"
	"golang.org/x/sys/windows"
)

const version = "1.9"

var (
	mw           *walk.MainWindow
	devRows      [DevCount]*row
	allRow       *row
	cfg          Config
	found        = &Found{}
	applyMu      sync.Mutex
	warnLabel    *walk.Label
	infoLabel    *walk.Label
	autostartChk *walk.CheckBox
	pawnBtn      *walk.PushButton
	stripBtn     *walk.PushButton
	fanLimitChk  *walk.CheckBox
	tabs         *walk.TabWidget

	presets      map[string]Config
	presetNames  []string
	presetList   *walk.ListBox
	presetName   *walk.LineEdit
	presetStatus *walk.Label
	presetRAM    *walk.CheckBox
)

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "/ram":
			runRAMChild(os.Args[2:])
			return
		case "/anwenden", "--anwenden":
			runHeadless()
			return
		}
	}
	runGUI()
}

// runHeadless setzt beim Windows Start die gespeicherten Farben und beendet sich dann.
// Der RAM wird hier nicht gesetzt, weil das jedes Mal nach Admin Rechten fragen wuerde.
func runHeadless() {
	c := LoadConfig()
	logf("Autostart Version %s", version)
	deadline := time.Now().Add(20 * time.Second)
	var f *Found
	for {
		f = Detect()
		all := true
		for i := 0; i < DevCount; i++ {
			if i != DevRAM && !f.Has(i) {
				all = false
			}
		}
		if all || time.Now().After(deadline) {
			break
		}
		time.Sleep(2 * time.Second)
	}

	var todo []int
	for i := 0; i < DevCount; i++ {
		if i == DevRAM || i == DevFanOut {
			continue // RAM braucht Admin, Lüfter außen haengt am gleichen Hub wie innen
		}
		if f.Has(i) {
			todo = append(todo, i)
		} else {
			logf("%s: nicht gefunden", deviceNames[i])
		}
	}
	// Direkt nach dem Start sind manche Geraete noch nicht bereit, deshalb bis zu 3 Versuche
	for try := 1; try <= 3 && len(todo) > 0; try++ {
		if try > 1 {
			time.Sleep(3 * time.Second)
			f = Detect()
		}
		var failed []int
		for _, i := range todo {
			err := Apply(i, f, &c)
			if err != nil {
				logf("%s: Fehler: %v (Versuch %d)", deviceNames[i], err, try)
				failed = append(failed, i)
			} else {
				logf("%s: ok", deviceNames[i])
			}
		}
		todo = failed
	}
}

// otherRGBSoftware sucht Programme die sonst die Farben wieder ueberschreiben.
func otherRGBSoftware() []string {
	snap, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil
	}
	defer windows.CloseHandle(snap)

	var names []string
	seen := map[string]bool{}
	var pe windows.ProcessEntry32
	pe.Size = uint32(unsafe.Sizeof(pe))
	for err = windows.Process32First(snap, &pe); err == nil; err = windows.Process32Next(snap, &pe) {
		exe := strings.ToLower(windows.UTF16ToString(pe.ExeFile[:]))
		name := ""
		switch {
		case strings.Contains(exe, "signalrgb"):
			name = "SignalRGB"
		case strings.Contains(exe, "l-connect"):
			name = "L-Connect"
		case strings.Contains(exe, "openrgb"):
			name = "OpenRGB"
		case strings.Contains(exe, "armourycrate"), strings.Contains(exe, "lightingservice"):
			name = "Armoury Crate"
		}
		if name != "" && !seen[name] {
			seen[name] = true
			names = append(names, name)
		}
	}
	return names
}

// ---------- eine Zeile im Fenster ----------

type row struct {
	title    string
	effect   *walk.ComboBox
	swatch   *walk.Composite
	colorBtn *walk.PushButton
	bright   *walk.ComboBox
	speed    *walk.ComboBox
	applyBtn *walk.PushButton
	status   *walk.Label
	s        Setting
	owner    walk.Form
	effects  []string
	loading  bool
	busy     bool
	brush    *walk.SolidColorBrush
}

var customColors [16]win.COLORREF

func (r *row) effectList() []string {
	if r.effects != nil {
		return r.effects
	}
	return effectNames
}

func (r *row) readUI() {
	r.s.Effect = r.effect.CurrentIndex()
	r.s.Brightness = r.bright.CurrentIndex() + 1
	r.s.Speed = r.speed.CurrentIndex()
	r.s = r.s.clamp()
}

func (r *row) writeUI() {
	r.loading = true
	e := r.s.Effect
	if e < 0 || e >= len(r.effectList()) {
		e = 0
	}
	r.effect.SetCurrentIndex(e)
	s := r.s.clamp()
	r.bright.SetCurrentIndex(s.Brightness - 1)
	r.speed.SetCurrentIndex(s.Speed)
	r.paintSwatch()
	r.updateEnabled()
	r.loading = false
}

// Wenn man eine Farbe waehlt aber ein Effekt ohne eigene Farbe eingestellt ist, auf Statisch wechseln
func (r *row) ensureColorEffect() {
	if r.loading || r.effect == nil {
		return
	}
	if !usesColor(r.effect.CurrentIndex()) {
		r.effect.SetCurrentIndex(EffStatic)
	}
}

func (r *row) paintSwatch() {
	if r.swatch == nil {
		return
	}
	b, err := walk.NewSolidColorBrush(walk.RGB(r.s.R, r.s.G, r.s.B))
	if err != nil {
		return
	}
	r.swatch.SetBackground(b)
	if r.brush != nil {
		r.brush.Dispose()
	}
	r.brush = b
}

func (r *row) updateEnabled() {
	// Kann schon waehrend dem Erstellen aufgerufen werden, dann gibt es noch nicht alle Knoepfe
	if r.colorBtn == nil || r.bright == nil || r.speed == nil {
		return
	}
	r.colorBtn.SetEnabled(true)
	r.bright.SetEnabled(true)
	r.speed.SetEnabled(true)
	if r.applyBtn != nil {
		r.applyBtn.SetEnabled(!r.busy)
	}
}

func (r *row) pickColor() {
	var hwnd win.HWND
	if r.owner != nil {
		hwnd = r.owner.Handle()
	} else if mw != nil {
		hwnd = mw.Handle()
	}
	cc := win.CHOOSECOLOR{
		HwndOwner:    hwnd,
		RgbResult:    win.COLORREF(uint32(r.s.R) | uint32(r.s.G)<<8 | uint32(r.s.B)<<16),
		LpCustColors: &customColors,
		Flags:        win.CC_RGBINIT | win.CC_FULLOPEN,
	}
	cc.LStructSize = uint32(unsafe.Sizeof(cc))
	if !win.ChooseColor(&cc) {
		return
	}
	c := uint32(cc.RgbResult)
	r.s.R, r.s.G, r.s.B = uint8(c), uint8(c>>8), uint8(c>>16)
	r.paintSwatch()
	r.ensureColorEffect()
}

// settingWidgets sind Effekt, Farbe, Helligkeit und Tempo (4 Spalten im Grid).
func settingWidgets(r *row) []Widget {
	return []Widget{
		ComboBox{
			AssignTo:              &r.effect,
			Model:                 r.effectList(),
			MinSize:               Size{Width: 190},
			OnCurrentIndexChanged: func() { r.updateEnabled() },
		},
		Composite{
			Layout: HBox{MarginsZero: true, Spacing: 4},
			Children: []Widget{
				// Das Farbfeld braucht ein Layout, sonst bekommt es von walk die Groesse 0 und ist unsichtbar
				Composite{
					AssignTo: &r.swatch,
					Layout:   HBox{MarginsZero: true},
					MinSize:  Size{Width: 26, Height: 22},
					MaxSize:  Size{Width: 26, Height: 22},
				},
				PushButton{
					AssignTo:  &r.colorBtn,
					Text:      "Wählen",
					MinSize:   Size{Width: 70},
					OnClicked: r.pickColor,
				},
			},
		},
		ComboBox{
			AssignTo: &r.bright,
			Model:    brightnessNames,
			MinSize:  Size{Width: 70},
			OnCurrentIndexChanged: func() {
				if r.effect != nil && r.effect.CurrentIndex() == EffOff {
					r.ensureColorEffect()
				}
			},
		},
		ComboBox{
			AssignTo: &r.speed,
			Model:    speedNames,
			MinSize:  Size{Width: 100},
		},
	}
}

// rowWidgets ist eine ganze Zeile im Hauptfenster (7 Spalten).
func rowWidgets(r *row, applyText string, onApply walk.EventHandler, extra Widget) []Widget {
	font := Font{Family: "Segoe UI", PointSize: 9, Bold: r == allRow}
	var title Widget = Label{Text: r.title, Font: font}
	if extra != nil {
		title = Composite{
			Layout:   HBox{MarginsZero: true, Spacing: 6},
			Children: []Widget{Label{Text: r.title, Font: font}, extra},
		}
	}
	w := []Widget{title}
	w = append(w, settingWidgets(r)...)
	w = append(w,
		PushButton{AssignTo: &r.applyBtn, Text: applyText, MinSize: Size{Width: 110}, OnClicked: onApply},
		Label{AssignTo: &r.status, MinSize: Size{Width: 150}},
	)
	return w
}

func setStatus(r *row, text string, ok bool) {
	if r.status == nil {
		return
	}
	r.status.SetText(text)
	r.status.SetToolTipText(text)
	if ok {
		r.status.SetTextColor(walk.RGB(0, 130, 0))
	} else {
		r.status.SetTextColor(walk.RGB(190, 0, 0))
	}
	r.status.Invalidate()
}

func setRowBusy(r *row, b bool) {
	r.busy = b
	if r.applyBtn != nil {
		r.applyBtn.SetEnabled(!b)
	}
}

func setBusy(b bool) {
	for _, r := range devRows {
		if r.applyBtn != nil {
			r.applyBtn.SetEnabled(!b && !r.busy)
		}
	}
	if allRow.applyBtn != nil {
		allRow.applyBtn.SetEnabled(!b)
	}
}

func saveFromUI() {
	allRow.readUI()
	cfg.All = allRow.s
	for i, r := range devRows {
		r.readUI()
		cfg.Devices[i] = r.s
	}
	if err := SaveConfig(cfg); err != nil {
		logf("Einstellungen speichern: %v", err)
	}
}

// applyDevices setzt die Geraete im Hintergrund, damit das Fenster nicht haengt.
func applyDevices(idx ...int) {
	saveFromUI()
	var list []int
	for _, i := range idx {
		if i < 0 || i >= DevCount {
			continue
		}
		list = append(list, i)
		setRowBusy(devRows[i], true)
		setStatus(devRows[i], "wird gesetzt ...", true)
	}
	c := cfg
	f := found
	hwnd := uintptr(mw.Handle())

	go func() {
		applyMu.Lock()
		defer applyMu.Unlock()

		results := map[int]error{}
		for _, i := range list {
			// Lüfter innen und außen sind ein Hub, also nur einmal setzen
			if i == DevFanIn || i == DevFanOut {
				if err, ok := results[DevFanIn]; ok {
					results[i] = err
					continue
				}
				if err, ok := results[DevFanOut]; ok {
					results[i] = err
					continue
				}
			}
			start := time.Now()
			var err error
			if i == DevRAM {
				_, err = ApplyRAM(c.Devices[DevRAM], hwnd)
			} else {
				err = Apply(i, f, &c)
			}
			results[i] = err
			res := "ok"
			if err != nil {
				res = "Fehler: " + err.Error()
			}
			logf("%s: %v (%d ms)", deviceNames[i], res, time.Since(start).Milliseconds())
		}

		mw.Synchronize(func() {
			for i, err := range results {
				if err == nil {
					setStatus(devRows[i], "Fertig", true)
				} else {
					setStatus(devRows[i], "Fehler: "+err.Error(), false)
				}
				setRowBusy(devRows[i], false)
			}
		})
	}()
}

var logMu sync.Mutex

// logf schreibt in Dokumente\RGB-Steuerung\log.txt
func logf(format string, args ...interface{}) {
	logMu.Lock()
	defer logMu.Unlock()
	home, err := os.UserHomeDir()
	if err != nil {
		return
	}
	dir := filepath.Join(home, "Documents", "RGB-Steuerung")
	os.MkdirAll(dir, 0755)
	f, err := os.OpenFile(filepath.Join(dir, "log.txt"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, "%s  %s\r\n", time.Now().Format("2006-01-02 15:04:05"), fmt.Sprintf(format, args...))
}

// applyAll nimmt die Vorlage fuer alle Geraete und setzt alles was gefunden wurde.
func applyAll() {
	allRow.readUI()
	cfg.All = allRow.s
	for i := range cfg.Strimer {
		cfg.Strimer[i] = cfg.All
	}
	cfg.StrimerEinzeln = false
	updateStripBtn()

	var idx []int
	for i, r := range devRows {
		r.s = cfg.All
		cfg.Devices[i] = cfg.All
		r.writeUI()
		if found.Has(i) {
			idx = append(idx, i)
		}
	}
	if len(idx) == 0 {
		walk.MsgBox(mw, "RGB Steuerung", "Es wurde kein Gerät gefunden.", walk.MsgBoxIconWarning)
		saveFromUI()
		return
	}
	applyDevices(idx...)
}

func refreshDetection() {
	found = Detect()
	for i, r := range devRows {
		if r.busy {
			continue
		}
		if i == DevRAM {
			switch {
			case !PawnIOInstalled():
				setStatus(r, "PawnIO fehlt", false)
			case !ModuleFound():
				setStatus(r, moduleName+" fehlt", false)
			default:
				setStatus(r, "bereit (fragt nach Admin)", true)
			}
			continue
		}
		if found.Has(i) {
			setStatus(r, "gefunden", true)
		} else {
			setStatus(r, "nicht gefunden", false)
		}
	}
	setBusy(false)
	pawnBtn.SetVisible(!PawnIOInstalled())

	if names := otherRGBSoftware(); len(names) > 0 {
		warnLabel.SetText("Achtung: " + strings.Join(names, ", ") + " läuft noch. Bitte komplett schließen (auch unten rechts im Infobereich), sonst überschreibt es die Farben.")
		warnLabel.SetVisible(true)
	} else {
		warnLabel.SetVisible(false)
	}
}

func installPawnIO() {
	if walk.MsgBox(mw, "RGB Steuerung",
		"Jetzt wird der PawnIO Treiber installiert. Er wird nur für den RAM gebraucht.\r\n\r\nIm Installer bitte die normale Version (Official) wählen, nicht \"Unrestricted\".\r\n\r\nWeiter?",
		walk.MsgBoxYesNo|walk.MsgBoxIconQuestion) != walk.DlgCmdYes {
		return
	}
	pawnBtn.SetEnabled(false)
	hwnd := uintptr(mw.Handle())
	go func() {
		err := InstallPawnIO(hwnd)
		mw.Synchronize(func() {
			pawnBtn.SetEnabled(true)
			refreshDetection()
			if err != nil {
				walk.MsgBox(mw, "RGB Steuerung", "PawnIO Installation: "+err.Error(), walk.MsgBoxIconError)
			} else {
				walk.MsgBox(mw, "RGB Steuerung", "PawnIO ist installiert. Du kannst den RAM jetzt einstellen.", walk.MsgBoxIconInformation)
			}
		})
	}()
}

func updateStripBtn() {
	if stripBtn == nil {
		return
	}
	if cfg.StrimerEinzeln {
		stripBtn.SetText("Einzeln: an")
	} else {
		stripBtn.SetText("Einzeln ...")
	}
}

// showStrimerDialog ist das Fenster fuer die 12 einzelnen Strimer Streifen.
func showStrimerDialog() {
	saveFromUI()

	var dlg *walk.Dialog
	var chk *walk.CheckBox
	var hint *walk.Label
	var rows [12]*row

	items := []Widget{
		Label{},
		Label{Text: "Effekt"},
		Label{Text: "Farbe"},
		Label{Text: "Helligkeit"},
		Label{Text: "Tempo"},
	}
	for i := range rows {
		rows[i] = &row{title: stripNames[i], s: cfg.Strimer[i], effects: stripEffects}
		if i == 6 {
			items = append(items, VSpacer{ColumnSpan: 5, Size: 6})
		}
		items = append(items, Label{Text: stripNames[i]})
		items = append(items, settingWidgets(rows[i])...)
	}

	save := func() {
		for i, r := range rows {
			r.readUI()
			cfg.Strimer[i] = r.s
		}
		cfg.StrimerEinzeln = chk.Checked()
		updateStripBtn()
		if err := SaveConfig(cfg); err != nil {
			logf("Einstellungen speichern: %v", err)
		}
	}
	likeMain := func() {
		devRows[DevStrimer].readUI()
		for _, r := range rows {
			r.s = devRows[DevStrimer].s
			r.writeUI()
		}
	}
	apply := func() {
		save()
		if !found.Has(DevStrimer) {
			hint.SetText("Strimer nicht gefunden")
			return
		}
		hint.SetText("wird gesetzt ...")
		c := cfg
		f := found
		go func() {
			applyMu.Lock()
			err := Apply(DevStrimer, f, &c)
			applyMu.Unlock()
			res := "ok"
			if err != nil {
				res = "Fehler: " + err.Error()
			}
			logf("Strimer Streifen: %v", res)
			dlg.Synchronize(func() {
				if err != nil {
					hint.SetText("Fehler: " + err.Error())
				} else {
					hint.SetText("Fertig")
				}
			})
		}()
	}

	err := Dialog{
		AssignTo: &dlg,
		Title:    "Strimer Streifen einzeln",
		MinSize:  Size{Width: 620, Height: 520},
		Layout:   VBox{},
		Children: []Widget{
			CheckBox{
				AssignTo: &chk,
				Text:     "Streifen einzeln einstellen (sonst gilt die Strimer Zeile im Hauptfenster)",
				Checked:  cfg.StrimerEinzeln,
			},
			Label{Text: "Dein Strimer hängt am 24 Pin Kabel. Die GPU Kabel Streifen gelten nur, wenn du auch ein Strimer Grafikkarten Kabel hast."},
			Composite{
				Layout:   Grid{Columns: 5, Spacing: 8},
				Children: items,
			},
			VSpacer{},
			Composite{
				Layout: HBox{MarginsZero: true},
				Children: []Widget{
					Label{AssignTo: &hint},
					HSpacer{},
					PushButton{Text: "Alle wie Hauptfenster", MinSize: Size{Width: 130}, OnClicked: likeMain},
					PushButton{Text: "Anwenden", OnClicked: func() {
						chk.SetChecked(true)
						apply()
					}},
					PushButton{Text: "Schließen", OnClicked: func() {
						dlg.Accept()
					}},
				},
			},
		},
	}.Create(mw)
	if err != nil {
		walk.MsgBox(mw, "RGB Steuerung", "Dialog Fehler: "+err.Error(), walk.MsgBoxIconError)
		return
	}
	for _, r := range rows {
		r.owner = dlg
		r.writeUI()
	}
	// Auch beim Schliessen ueber das X speichern, sonst gehen die Einstellungen verloren
	dlg.Closing().Attach(func(canceled *bool, reason walk.CloseReason) {
		save()
	})
	dlg.Run()
}

// ---------- Presets ----------

func presetsPage() TabPage {
	presets = LoadPresets()
	return TabPage{
		Title:  "Presets",
		Layout: VBox{},
		Children: []Widget{
			Label{Text: "Hier kannst du deine aktuelle Einstellung unter einem Namen speichern und später wieder laden."},
			ListBox{
				AssignTo: &presetList,
				MinSize:  Size{Height: 200},
				OnCurrentIndexChanged: func() {
					if i := presetList.CurrentIndex(); i >= 0 && i < len(presetNames) {
						presetName.SetText(presetNames[i])
					}
				},
				OnItemActivated: func() { loadPreset(true) },
			},
			Composite{
				Layout: HBox{MarginsZero: true},
				Children: []Widget{
					Label{Text: "Name:"},
					LineEdit{AssignTo: &presetName, MinSize: Size{Width: 220}},
					PushButton{Text: "Aktuelle Einstellung speichern", MinSize: Size{Width: 180}, OnClicked: savePreset},
					HSpacer{},
				},
			},
			Composite{
				Layout: HBox{MarginsZero: true},
				Children: []Widget{
					PushButton{Text: "Laden und anwenden", MinSize: Size{Width: 130}, OnClicked: func() { loadPreset(true) }},
					PushButton{Text: "Nur laden", MinSize: Size{Width: 80}, OnClicked: func() { loadPreset(false) }},
					PushButton{Text: "Löschen", MinSize: Size{Width: 80}, OnClicked: deletePreset},
					HSpacer{},
				},
			},
			CheckBox{
				AssignTo:  &presetRAM,
				Text:      "RAM auch setzen (fragt jedes Mal nach Admin Rechten)",
				Alignment: AlignHNearVCenter,
			},
			Label{AssignTo: &presetStatus},
			VSpacer{},
			Label{Text: "Die eingebauten Presets (Alles Weiß, Valorant Rot, Regenbogen, Alles aus, Weiß mit Aufladen, Sonnenuntergang) kann man nicht löschen, aber mit eigenem Namen überschreiben."},
		},
	}
}

func refreshPresetList() {
	presetNames = PresetNames(presets)
	presetList.SetModel(presetNames)
}

func findPreset(name string) (Config, bool) {
	if c, ok := presets[name]; ok {
		return c, true
	}
	c, ok := builtinPresets()[name]
	return c, ok
}

func savePreset() {
	name := strings.TrimSpace(presetName.Text())
	if name == "" {
		walk.MsgBox(mw, "RGB Steuerung", "Bitte gib zuerst einen Namen ein.", walk.MsgBoxIconInformation)
		return
	}
	saveFromUI()
	presets[name] = cfg
	if err := SavePresets(presets); err != nil {
		presetStatus.SetText("Fehler: " + err.Error())
		return
	}
	refreshPresetList()
	presetStatus.SetText("Preset \"" + name + "\" gespeichert.")
}

func loadPreset(apply bool) {
	name := strings.TrimSpace(presetName.Text())
	if i := presetList.CurrentIndex(); i >= 0 && i < len(presetNames) && name == "" {
		name = presetNames[i]
	}
	c, ok := findPreset(name)
	if !ok {
		walk.MsgBox(mw, "RGB Steuerung", "Bitte zuerst ein Preset in der Liste auswählen.", walk.MsgBoxIconInformation)
		return
	}
	// Die Lüfter Begrenzung gehoert nicht zum Preset
	cfg.All = c.All
	cfg.Devices = c.Devices
	cfg.Strimer = c.Strimer
	cfg.StrimerEinzeln = c.StrimerEinzeln

	allRow.s = cfg.All
	allRow.writeUI()
	for i, r := range devRows {
		r.s = cfg.Devices[i]
		r.writeUI()
	}
	updateStripBtn()
	if err := SaveConfig(cfg); err != nil {
		logf("Einstellungen speichern: %v", err)
	}

	if !apply {
		presetStatus.SetText("Preset \"" + name + "\" geladen.")
		tabs.SetCurrentIndex(0)
		return
	}
	var idx []int
	for i := 0; i < DevCount; i++ {
		if i == DevRAM && !presetRAM.Checked() {
			continue
		}
		if found.Has(i) {
			idx = append(idx, i)
		}
	}
	logf("Preset %q anwenden", name)
	applyDevices(idx...)
	presetStatus.SetText("Preset \"" + name + "\" wurde angewendet.")
	tabs.SetCurrentIndex(0)
}

func deletePreset() {
	name := strings.TrimSpace(presetName.Text())
	if _, ok := presets[name]; !ok {
		if _, builtin := builtinPresets()[name]; builtin {
			walk.MsgBox(mw, "RGB Steuerung", "Eingebaute Presets kann man nicht löschen.", walk.MsgBoxIconInformation)
		} else {
			walk.MsgBox(mw, "RGB Steuerung", "Bitte zuerst ein eigenes Preset auswählen.", walk.MsgBoxIconInformation)
		}
		return
	}
	if walk.MsgBox(mw, "RGB Steuerung", "Preset \""+name+"\" wirklich löschen?", walk.MsgBoxYesNo|walk.MsgBoxIconQuestion) != walk.DlgCmdYes {
		return
	}
	delete(presets, name)
	if err := SavePresets(presets); err != nil {
		presetStatus.SetText("Fehler: " + err.Error())
	}
	refreshPresetList()
	presetName.SetText("")
	presetStatus.SetText("Preset \"" + name + "\" gelöscht.")
}

// ---------- Geraete Infos ----------

func showInfo() {
	exe, _ := os.Executable()
	var b strings.Builder
	b.WriteString("Version " + version + "\r\nProgramm: " + exe + "\r\n\r\n")
	b.WriteString("Erkannte Geräte:\r\n")
	for i := 0; i < DevCount; i++ {
		b.WriteString(deviceNames[i] + ": ")
		switch {
		case i == DevGPU && found.GPU != nil:
			b.WriteString(found.GPU.String())
		case i == DevRAM:
			if found.Has(DevRAM) {
				b.WriteString("PawnIO bereit")
			} else {
				b.WriteString("nicht gefunden")
			}
		case found.Info[i] != nil:
			b.WriteString(found.Info[i].String())
		default:
			b.WriteString("nicht gefunden")
		}
		b.WriteString("\r\n")
	}

	b.WriteString("\r\nNVIDIA Grafikkarten:\r\n")
	for _, g := range found.GPUs {
		b.WriteString(g.String() + "\r\n")
	}
	if found.GPUError != nil {
		b.WriteString("Fehler: " + found.GPUError.Error() + "\r\n")
	}

	b.WriteString("\r\nUSB Geräte von ASUS (0B05), Lian Li (0CF2) und Nuvoton (0416):\r\n")
	n := 0
	for _, h := range found.All {
		if h.VID == 0x0B05 || h.VID == 0x0CF2 || h.VID == 0x0416 {
			b.WriteString(h.String() + "\r\n")
			n++
		}
	}
	if n == 0 {
		b.WriteString("keine\r\n")
	}
	if found.Error != nil {
		b.WriteString("\r\nFehler bei der Suche: " + found.Error.Error() + "\r\n")
	}
	b.WriteString(fmt.Sprintf("\r\nHID Geräte insgesamt: %d\r\n", len(found.All)))
	b.WriteString(fmt.Sprintf("\r\nRAM: PawnIO installiert: %v, %s gefunden: %v\r\n", PawnIOInstalled(), moduleName, ModuleFound()))
	if data, err := os.ReadFile(configPath() + ".ram.txt"); err == nil {
		b.WriteString("\r\nLetzter RAM Versuch:\r\n" + string(data))
	}
	report := b.String()

	var dlg *walk.Dialog
	err := Dialog{
		AssignTo: &dlg,
		Title:    "Geräte Infos",
		MinSize:  Size{Width: 640, Height: 360},
		Layout:   VBox{},
		Children: []Widget{
			TextEdit{
				Text:     report,
				ReadOnly: true,
				VScroll:  true,
				Font:     Font{Family: "Consolas", PointSize: 9},
			},
			Composite{
				Layout: HBox{MarginsZero: true},
				Children: []Widget{
					HSpacer{},
					PushButton{Text: "Kopieren", OnClicked: func() { walk.Clipboard().SetText(report) }},
					PushButton{Text: "Schließen", OnClicked: func() { dlg.Accept() }},
				},
			},
		},
	}.Create(mw)
	if err != nil {
		walk.MsgBox(mw, "RGB Steuerung", "Dialog Fehler: "+err.Error(), walk.MsgBoxIconError)
		return
	}
	dlg.Run()
}

// ---------- Hauptfenster ----------

func runGUI() {
	cfg = LoadConfig()
	exe, _ := os.Executable()
	logf("Start Version %s aus %s", version, exe)

	allRow = &row{title: "Vorlage für alle", s: cfg.All, effects: effectNames}
	for i := range devRows {
		eff := effectNames
		if i == DevStrimer {
			eff = stripEffects
		}
		devRows[i] = &row{title: deviceNames[i], s: cfg.Devices[i], effects: eff}
	}

	grid := []Widget{
		Label{},
		Label{Text: "Effekt"},
		Label{Text: "Farbe"},
		Label{Text: "Helligkeit"},
		Label{Text: "Tempo"},
		Label{},
		Label{},
	}
	grid = append(grid, rowWidgets(allRow, "Auf alle anwenden", applyAll, nil)...)
	grid = append(grid, VSpacer{ColumnSpan: 7, Size: 6})
	for i := range devRows {
		i := i
		var extra Widget
		if i == DevStrimer {
			extra = PushButton{AssignTo: &stripBtn, Text: "Einzeln ...", MinSize: Size{Width: 90}, OnClicked: showStrimerDialog}
		}
		grid = append(grid, rowWidgets(devRows[i], "Anwenden", func() { applyDevices(i) }, extra)...)
	}

	err := MainWindow{
		AssignTo: &mw,
		Title:    "RGB Steuerung   (Version " + version + ")",
		MinSize:  Size{Width: 1000, Height: 520},
		Size:     Size{Width: 1060, Height: 560},
		Layout:   VBox{},
		Children: []Widget{
			Label{
				AssignTo:  &warnLabel,
				Visible:   false,
				TextColor: walk.RGB(190, 0, 0),
				Font:      Font{Family: "Segoe UI", PointSize: 9, Bold: true},
			},
			TabWidget{
				AssignTo: &tabs,
				Pages: []TabPage{
					{
						Title:  "Geräte",
						Layout: VBox{},
						Children: []Widget{
							Composite{
								Layout:   Grid{Columns: 7, Spacing: 8},
								Children: grid,
							},
							VSpacer{},
							Label{AssignTo: &infoLabel, Text: "Die Effekte laufen direkt in der Hardware. Du kannst das Tool nach dem Anwenden einfach schließen."},
						},
					},
					presetsPage(),
				},
			},
			Composite{
				Layout: HBox{MarginsZero: true},
				Children: []Widget{
					CheckBox{
						AssignTo: &autostartChk,
						Text:     "Beim Windows Start Farben setzen (Tool schließt sich danach sofort)",
						OnClicked: func() {
							if err := SetAutostart(autostartChk.Checked()); err != nil {
								walk.MsgBox(mw, "RGB Steuerung", "Autostart konnte nicht geändert werden: "+err.Error(), walk.MsgBoxIconError)
								autostartChk.SetChecked(AutostartEnabled())
								return
							}
							saveFromUI()
						},
					},
					CheckBox{
						AssignTo: &fanLimitChk,
						Text:     "Lüfter heller (Lian Li Begrenzung aus)",
						OnClicked: func() {
							if fanLimitChk.Checked() {
								if walk.MsgBox(mw, "RGB Steuerung",
									"Lian Li begrenzt die Helligkeit der Lüfter ab Werk, damit die LEDs nicht zu warm werden und länger halten. Bei hellen Farben wie Weiß leuchten sie deshalb nur mit etwa 60 %.\r\n\r\nWenn du die Begrenzung ausschaltest, werden die Lüfter heller. Das ist auf eigene Gefahr. Trotzdem ausschalten?",
									walk.MsgBoxYesNo|walk.MsgBoxIconWarning) != walk.DlgCmdYes {
									fanLimitChk.SetChecked(false)
								}
							}
							cfg.NoFanLimit = fanLimitChk.Checked()
							SaveConfig(cfg)
						},
					},
					HSpacer{},
					PushButton{AssignTo: &pawnBtn, Text: "PawnIO installieren (für RAM)", OnClicked: installPawnIO},
					PushButton{Text: "Neu suchen", OnClicked: refreshDetection},
					PushButton{Text: "Geräte Infos", OnClicked: showInfo},
				},
			},
		},
	}.Create()
	if err != nil {
		walk.MsgBox(nil, "RGB Steuerung", "Fenster konnte nicht erstellt werden: "+err.Error(), walk.MsgBoxIconError)
		return
	}

	allRow.owner = mw
	allRow.writeUI()
	for _, r := range devRows {
		r.owner = mw
		r.writeUI()
	}
	autostartChk.SetChecked(AutostartEnabled())
	fanLimitChk.SetChecked(cfg.NoFanLimit)
	updateStripBtn()
	refreshPresetList()
	refreshDetection()

	mw.Closing().Attach(func(canceled *bool, reason walk.CloseReason) {
		saveFromUI()
	})
	mw.Run()
}
