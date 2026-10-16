package main

import (
	"encoding/json"
	"os"
	"path/filepath"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

// Config ist alles was im Fenster eingestellt ist.
type Config struct {
	All            Setting
	Devices        [DevCount]Setting
	StrimerEinzeln bool
	Strimer        [12]Setting
	NoFanLimit     bool
}

// So steht es in der Datei
type configFile struct {
	All            Setting            `json:"alle"`
	Geraete        map[string]Setting `json:"geraete_v2"`
	StrimerEinzeln bool               `json:"strimer_einzeln"`
	Strimer        []Setting          `json:"strimer_streifen"`
	NoFanLimit     bool               `json:"luefter_ohne_begrenzung"`
}

func DefaultConfig() Config {
	c := Config{All: DefaultSetting}
	for i := range c.Devices {
		c.Devices[i] = DefaultSetting
	}
	for i := range c.Strimer {
		c.Strimer[i] = DefaultSetting
	}
	return c
}

func configPath() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		dir = "."
	}
	return filepath.Join(dir, "RGB-Steuerung", "einstellungen.json")
}

func configFromFile(f configFile) Config {
	c := DefaultConfig()
	c.All = f.All.clamp()
	for i, k := range deviceKeys {
		if s, ok := f.Geraete[k]; ok {
			c.Devices[i] = s.clamp()
		}
	}
	c.StrimerEinzeln = f.StrimerEinzeln
	c.NoFanLimit = f.NoFanLimit
	for i := range c.Strimer {
		if i < len(f.Strimer) {
			c.Strimer[i] = f.Strimer[i].clamp()
		}
	}
	return c
}

func configToFile(c Config) configFile {
	f := configFile{
		All:            c.All,
		Geraete:        map[string]Setting{},
		StrimerEinzeln: c.StrimerEinzeln,
		Strimer:        append([]Setting{}, c.Strimer[:]...),
		NoFanLimit:     c.NoFanLimit,
	}
	for i, k := range deviceKeys {
		f.Geraete[k] = c.Devices[i]
	}
	return f
}

func LoadConfig() Config {
	data, err := os.ReadFile(configPath())
	if err != nil {
		return DefaultConfig()
	}
	f := &configFile{All: DefaultSetting}
	if err := json.Unmarshal(data, f); err != nil {
		return DefaultConfig()
	}
	return configFromFile(*f)
}

func SaveConfig(c Config) error {
	p := configPath()
	if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(configToFile(c), "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0644)
}

const runKey = `Software\Microsoft\Windows\CurrentVersion\Run`
const runName = "RGB-Steuerung"

func AutostartEnabled() bool {
	k, err := registry.OpenKey(registry.CURRENT_USER, runKey, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer k.Close()
	_, _, err = k.GetStringValue(runName)
	return err == nil
}

func SetAutostart(on bool) error {
	k, err := registry.OpenKey(registry.CURRENT_USER, runKey, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer k.Close()
	if on {
		exe, err := os.Executable()
		if err != nil {
			return err
		}
		return k.SetStringValue(runName, `"`+exe+`" /anwenden`)
	}
	err = k.DeleteValue(runName)
	if err == windows.ERROR_FILE_NOT_FOUND {
		return nil
	}
	return err
}
