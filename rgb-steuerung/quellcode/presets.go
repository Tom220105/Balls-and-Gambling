package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
)

// Presets sind gespeicherte Einstellungen mit Namen.

func presetsPath() string {
	return filepath.Join(filepath.Dir(configPath()), "presets.json")
}

// builtinPresets sind immer da. Man kann sie mit einem eigenen Preset gleichen Namens ueberschreiben.
func builtinPresets() map[string]Config {
	all := func(s Setting) Config {
		c := DefaultConfig()
		c.All = s
		for i := range c.Devices {
			c.Devices[i] = s
		}
		for i := range c.Strimer {
			c.Strimer[i] = s
		}
		for i := range c.Fans {
			c.Fans[i] = fanPortFrom(s, s)
		}
		return c
	}

	white := Setting{Effect: EffStatic, R: 255, G: 255, B: 255, Brightness: 4, Speed: 2}
	red := Setting{Effect: EffStatic, R: 255, G: 0x46, B: 0x55, Brightness: 4, Speed: 2}
	rainbow := Setting{Effect: EffRainbow, R: 255, G: 255, B: 255, Brightness: 4, Speed: 2}
	off := Setting{Effect: EffOff, R: 255, G: 255, B: 255, Brightness: 4, Speed: 2}
	sunset := Setting{Effect: EffStatic, R: 255, G: 0x96, B: 0x32, Brightness: 4, Speed: 2}

	// Sonnenuntergang: der Strimer bekommt einen Verlauf von Orange nach Rot
	sun := all(sunset)
	sun.StrimerEinzeln = true
	grad := [6][3]uint8{
		{0xFF, 0x96, 0x32},
		{0xFF, 0x82, 0x28},
		{0xFF, 0x70, 0x1E},
		{0xFF, 0x60, 0x14},
		{0xFF, 0x50, 0x0A},
		{0xFF, 0x41, 0x05},
	}
	for i := range sun.Strimer {
		g := grad[i%6]
		sun.Strimer[i].R, sun.Strimer[i].G, sun.Strimer[i].B = g[0], g[1], g[2]
	}

	charge := all(white)
	charge.Devices[DevStrimer] = Setting{Effect: EffChargeBack, R: 255, G: 255, B: 255, Brightness: 4, Speed: 2}

	return map[string]Config{
		"Alles Weiß":        all(white),
		"Valorant Rot":      all(red),
		"Regenbogen":        all(rainbow),
		"Alles aus":         all(off),
		"Weiß mit Aufladen": charge,
		"Sonnenuntergang":   sun,
	}
}

// LoadPresets liest die eigenen Presets. Gibt nie nil zurueck.
func LoadPresets() map[string]Config {
	res := map[string]Config{}
	data, err := os.ReadFile(presetsPath())
	if err != nil {
		return res
	}
	var m map[string]configFile
	if err := json.Unmarshal(data, &m); err != nil {
		return res
	}
	for name, f := range m {
		res[name] = configFromFile(f)
	}
	return res
}

func SavePresets(p map[string]Config) error {
	m := map[string]configFile{}
	for name, c := range p {
		m[name] = configToFile(c)
	}
	if err := os.MkdirAll(filepath.Dir(presetsPath()), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(presetsPath(), data, 0644)
}

// PresetNames gibt zuerst die eigenen Presets und dann die eingebauten zurueck (jeweils sortiert).
func PresetNames(own map[string]Config) []string {
	var names []string
	for n := range own {
		names = append(names, n)
	}
	sort.Strings(names)
	var builtin []string
	for n := range builtinPresets() {
		if _, ok := own[n]; !ok {
			builtin = append(builtin, n)
		}
	}
	sort.Strings(builtin)
	return append(names, builtin...)
}
