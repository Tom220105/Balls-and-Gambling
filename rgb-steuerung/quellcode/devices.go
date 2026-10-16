package main

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

// Die Geraete in der Reihenfolge wie im Fenster
const (
	DevAura = iota
	DevFanIn
	DevFanOut
	DevStrimer
	DevPump
	DevGPU
	DevRAM
	DevCount
)

var deviceNames = []string{
	"Mainboard (ASUS Aura)",
	"Lüfter innen (Lian Li)",
	"Lüfter außen (Lian Li)",
	"Strimer Kabel (Lian Li)",
	"Pumpe (Lian Li Galahad II)",
	"Grafikkarte (Gigabyte)",
	"RAM (G.Skill)",
}

// Namen in der Einstellungsdatei
var deviceKeys = []string{
	"mainboard",
	"luefter_innen",
	"luefter_aussen",
	"strimer",
	"pumpe",
	"grafikkarte",
	"ram",
}

const (
	EffStatic = iota
	EffBreathing
	EffRainbow
	EffColorCycle
	EffOff
	EffChargeBack  // nur Strimer
	EffChargeFront // nur Strimer
)

var effectNames = []string{"Statisch", "Atmen", "Regenbogen", "Farbwechsel", "Aus"}

// Der Strimer kann noch zwei Effekte mehr
var stripEffects = append(append([]string{}, effectNames...),
	"Aufladen (hinten nach vorne)", "Aufladen (vorne nach hinten)")

var brightnessNames = []string{"25 %", "50 %", "75 %", "100 %"}
var speedNames = []string{"Sehr langsam", "Langsam", "Normal", "Schnell", "Sehr schnell"}

var stripNames = []string{
	"24 Pin Streifen 1", "24 Pin Streifen 2", "24 Pin Streifen 3",
	"24 Pin Streifen 4", "24 Pin Streifen 5", "24 Pin Streifen 6",
	"GPU Kabel Streifen 1", "GPU Kabel Streifen 2", "GPU Kabel Streifen 3",
	"GPU Kabel Streifen 4", "GPU Kabel Streifen 5", "GPU Kabel Streifen 6",
}

// Setting ist das was man pro Geraet einstellen kann.
// Helligkeit geht von 1 (25 %) bis 4 (100 %), Tempo von 0 bis 4.
type Setting struct {
	Effect     int   `json:"effekt"`
	R          uint8 `json:"r"`
	G          uint8 `json:"g"`
	B          uint8 `json:"b"`
	Brightness int   `json:"helligkeit"`
	Speed      int   `json:"tempo"`
}

var DefaultSetting = Setting{Effect: EffStatic, R: 0, G: 120, B: 255, Brightness: 4, Speed: 2}

func (s Setting) clamp() Setting {
	if s.Effect < 0 || s.Effect > EffChargeFront {
		s.Effect = EffStatic
	}
	if s.Brightness < 1 || s.Brightness > 4 {
		s.Brightness = 4
	}
	if s.Speed < 0 || s.Speed > 4 {
		s.Speed = 2
	}
	return s
}

func sleepMs(ms int) {
	time.Sleep(time.Duration(ms) * time.Millisecond)
}

// Farbe passend zur Helligkeit dunkler machen
func scaleColor(s Setting) (r, g, b uint8) {
	f := float64(s.Brightness) * 0.25
	return uint8(float64(s.R) * f), uint8(float64(s.G) * f), uint8(float64(s.B) * f)
}

// Effekte bei denen die eigene Farbe benutzt wird
func usesColor(effect int) bool {
	switch effect {
	case EffStatic, EffBreathing, EffChargeBack, EffChargeFront:
		return true
	}
	return false
}

var auraPIDs = map[uint16]bool{
	0x18F3: true,
	0x1939: true,
	0x19AF: true,
	0x1AA6: true,
	0x1BED: true,
}

// Found merkt sich was beim Suchen gefunden wurde.
type Found struct {
	Info     [DevCount]*HidInfo
	All      []HidInfo
	Error    error
	GPUs     []GPUInfo
	GPU      *GPUInfo
	GPUError error
}

func (f *Found) Has(dev int) bool {
	switch dev {
	case DevGPU:
		return f.GPU != nil
	case DevRAM:
		return PawnIOInstalled() && ModuleFound()
	}
	return f.Info[dev] != nil
}

// Detect sucht alle Geraete.
func Detect() *Found {
	f := &Found{}
	f.All, f.Error = EnumerateHID()
	for i := range f.All {
		h := f.All[i]
		switch {
		case h.VID == 0x0416 && (h.PID == 0x7371 || h.PID == 0x7373):
			// Die Pumpe hat mehrere Schnittstellen, Licht geht nur ueber mi_02
			if strings.Contains(strings.ToLower(h.Path), "mi_02") && h.OutLen >= 64 {
				f.Info[DevPump] = &h
			}
		case h.VID == 0x0B05 && auraPIDs[h.PID]:
			if h.PID == 0x19AF && h.UsagePage != 0xFF72 {
				continue
			}
			if f.Info[DevAura] == nil || h.UsagePage == 0xFF72 {
				f.Info[DevAura] = &h
			}
		case h.VID == 0x0CF2 && h.PID >= 0xA102 && h.PID <= 0xA105:
			if h.UsagePage == 0xFF72 {
				// Ein Hub fuer innen und aussen
				f.Info[DevFanIn] = &h
				f.Info[DevFanOut] = &h
			}
		case h.VID == 0x0CF2 && h.PID == 0xA200:
			if h.UsagePage == 0xFF72 {
				f.Info[DevStrimer] = &h
			}
		}
	}

	f.GPUs, f.GPUError = DetectGPUs()
	for i := range f.GPUs {
		if f.GPUs[i].Known {
			g := f.GPUs[i]
			f.GPU = &g
			break
		}
	}
	return f
}

// Apply setzt ein Geraet auf die Einstellung aus cfg.
func Apply(dev int, f *Found, cfg *Config) error {
	s := cfg.Devices[dev].clamp()
	switch dev {
	case DevGPU:
		return applyGPU(f.GPU, s)
	case DevRAM:
		_, err := ApplyRAM(s, 0)
		return err
	}

	info := f.Info[dev]
	if info == nil {
		return errors.New("nicht gefunden")
	}
	d, err := OpenHID(*info)
	if err != nil {
		return fmt.Errorf("konnte nicht geöffnet werden (%v)", err)
	}
	defer d.Close()

	switch dev {
	case DevAura:
		return applyAura(d, s)
	case DevFanIn, DevFanOut:
		return applyUniHub(d, cfg.Devices[DevFanIn].clamp(), cfg.Devices[DevFanOut].clamp(), cfg.NoFanLimit)
	case DevStrimer:
		var strips [12]Setting
		for i := range strips {
			if cfg.StrimerEinzeln {
				strips[i] = cfg.Strimer[i].clamp()
			} else {
				strips[i] = s
			}
		}
		return applyStrimer(d, strips)
	}
	return applyPump(d, s)
}

// ---------- Pumpe (Galahad II Trinity) ----------

func applyPump(d *HidDevice, s Setting) error {
	buf := make([]byte, 64)
	buf[0] = 0x01
	buf[1] = 0x83
	buf[5] = 0x13
	buf[6] = 0x02
	buf[8] = byte(s.Brightness)
	buf[9] = byte(s.Speed)

	color := true
	switch s.Effect {
	case EffStatic:
		buf[7] = 3
	case EffBreathing:
		buf[7] = 4
	case EffRainbow:
		buf[7] = 1
		color = false
	case EffColorCycle:
		buf[7] = 2
		color = false
	case EffOff:
		buf[7] = 3
		buf[8] = 0
		color = false
	default:
		buf[7] = 3
	}
	if color {
		r, g, b := s.R, s.G, s.B
		buf[10], buf[11], buf[12] = r, g, b
		buf[13], buf[14], buf[15] = r, g, b
	}
	buf[22] = 0
	return d.Write(buf)
}

// ---------- ASUS Aura Mainboard ----------

func auraRequest(d *HidDevice, cmd, resp byte) ([]byte, error) {
	if err := d.Write([]byte{0xEC, cmd}); err != nil {
		return nil, err
	}
	for i := 0; i < 8; i++ {
		buf, err := d.Read(700 * time.Millisecond)
		if err != nil {
			return nil, err
		}
		if len(buf) > 4 && buf[0] == 0xEC && buf[1] == resp {
			return buf, nil
		}
	}
	return nil, errors.New("keine passende Antwort")
}

type auraChannel struct {
	effCh int
	leds  int
}

func applyAura(d *HidDevice, s Setting) error {
	cfg, err := auraRequest(d, 0xB0, 0x30)
	if err != nil {
		return fmt.Errorf("Konfiguration nicht lesbar (%v)", err)
	}
	conf := make([]byte, 60)
	copy(conf, cfg[4:])

	mbLeds := int(conf[0x1B])
	numAddr := int(conf[0x02])

	var channels []auraChannel
	effCh := 0
	if mbLeds > 0 {
		channels = append(channels, auraChannel{effCh, mbLeds})
		effCh++
	}
	for i := 0; i < numAddr; i++ {
		channels = append(channels, auraChannel{effCh, 1})
		effCh++
	}
	if len(channels) == 0 {
		return errors.New("keine Kanäle gefunden")
	}

	// Gen1 Modus einschalten
	if err := d.Write([]byte{0xEC, 0x52, 0x53, 0x00, 0x01}); err != nil {
		return err
	}

	mode := byte(1)
	switch s.Effect {
	case EffStatic:
		mode = 1
	case EffBreathing:
		mode = 2
	case EffRainbow:
		mode = 5
	case EffColorCycle:
		mode = 4
	case EffOff:
		mode = 0
	}
	r, g, b := scaleColor(s)

	start := 0
	for _, ch := range channels {
		if err := d.Write([]byte{0xEC, 0x35, byte(ch.effCh), 0x00, 0x00, mode}); err != nil {
			return err
		}
		mask := ((1 << ch.leds) - 1) << start
		pkt := make([]byte, 65)
		pkt[0] = 0xEC
		pkt[1] = 0x36
		pkt[2] = byte(mask >> 8)
		pkt[3] = byte(mask & 0xFF)
		pkt[4] = 0x00
		for j := 0; j < ch.leds; j++ {
			o := 5 + 3*(start+j)
			if o+2 < len(pkt) {
				pkt[o], pkt[o+1], pkt[o+2] = r, g, b
			}
		}
		if err := d.Write(pkt); err != nil {
			return err
		}
		start += ch.leds
		sleepMs(5)
	}
	return d.Write([]byte{0xEC, 0x3F, 0x55})
}

// ---------- Lian Li UniHub (Luefter) ----------

func uniHubFor(s Setting, n int, noLimit bool) (mode, speed, bright byte, data []byte) {
	useColor := true
	switch s.Effect {
	case EffStatic:
		mode = 1
	case EffBreathing:
		mode = 2
	case EffRainbow:
		mode = 5
		useColor = false
	case EffColorCycle:
		mode = 4
		useColor = false
	case EffOff:
		mode = 1
	default:
		mode = 1
	}
	speed = []byte{0x02, 0x01, 0x00, 0xFF, 0xFE}[s.Speed]
	bright = []byte{0x08, 0x03, 0x02, 0x01, 0x00}[s.Brightness]
	if useColor {
		// Die Helligkeit steckt dann schon in der Farbe
		bright = 0
	}
	if s.Effect == EffOff {
		bright = 8
	}

	data = make([]byte, n*3)
	if useColor && s.Effect != EffOff {
		r, g, b := scaleColor(s)
		if !noLimit {
			// Lian Li begrenzt die Summe, sonst wird der Hub zu warm
			sum := int(r) + int(g) + int(b)
			if sum > 460 {
				k := 460.0 / float64(sum)
				r = uint8(float64(r) * k)
				g = uint8(float64(g) * k)
				b = uint8(float64(b) * k)
			}
		}
		for i := 0; i < n; i++ {
			data[3*i] = r
			data[3*i+1] = b
			data[3*i+2] = g
		}
	}
	return
}

func applyUniHub(d *HidDevice, inner, outer Setting, noLimit bool) error {
	inf := d.Info.PID == 0xA102
	channels := 4
	if inf {
		channels = 8
	}
	const leds = 96

	for ch := 0; ch < channels; ch++ {
		s := inner
		if inf && ch%2 == 1 {
			s = outer
		}
		mode, speed, bright, data := uniHubFor(s, leds, noLimit)

		var x, y byte
		if inf {
			x = byte(ch/2 + 1)
			y = 4
		} else {
			x = byte(ch<<4 + 4)
			y = 0
		}
		if err := d.Write([]byte{0xE0, 0x10, 0x60, x, y}); err != nil {
			return err
		}
		sleepMs(5)

		pkt := append([]byte{0xE0, byte(0x30 + ch)}, data...)
		if err := d.Write(pkt); err != nil {
			return err
		}
		sleepMs(5)

		if err := d.Write([]byte{0xE0, byte(0x10 + ch), mode, speed, 0x00, bright}); err != nil {
			return err
		}
		sleepMs(5)
	}
	return nil
}

// ---------- Lian Li Strimer L Connect ----------

func applyStrimer(d *HidDevice, strips [12]Setting) error {
	for i, s := range strips {
		useColor, meteor := true, false
		dir, mode := byte(1), byte(1)
		switch s.Effect {
		case EffStatic:
			mode = 1
		case EffBreathing:
			mode = 2
		case EffRainbow:
			useColor, mode = false, 5
		case EffColorCycle:
			useColor, mode = false, 4
		case EffOff:
			mode = 1
		case EffChargeBack:
			meteor, dir, mode = true, 0, 0x20
		case EffChargeFront:
			meteor, dir, mode = true, 1, 0x20
		}
		speed := []byte{0x02, 0x01, 0x00, 0xFE, 0xFF}[s.Speed]
		bright := []byte{0x08, 0x03, 0x02, 0x01, 0x00}[s.Brightness]
		if useColor {
			bright = 0
		}
		r, g, b := scaleColor(s)
		if s.Effect == EffOff {
			r, g, b = 0, 0, 0
			bright = 8
		}

		n := 27
		if i < 6 {
			n = 20
		}
		if meteor {
			n = 6
		}

		if useColor {
			pkt := []byte{0xE0, byte(0x30 | i)}
			for j := 0; j < n; j++ {
				pkt = append(pkt, r, b, g)
			}
			if err := d.Write(pkt); err != nil {
				return err
			}
		}
		if err := d.Write([]byte{0xE0, byte(0x10 | i), mode, speed, dir, bright}); err != nil {
			return err
		}
		sleepMs(3)
	}
	return d.Write([]byte{0xE0, 0x2C, 0x0F, 0xFF, 0x00, 0x00, 0x00, 0x00})
}
