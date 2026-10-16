package main

import (
	_ "embed"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// RAM (ENE Chip auf G.Skill Trident Z RGB usw.) ueber SMBus, wie OpenRGB.
// Das braucht Administrator Rechte, deshalb startet sich das Tool dafuer kurz selbst
// noch einmal mit "/ram ..." als Administrator.

//go:embed PawnIO_setup.exe
var pawnioSetup []byte

type eneVersion struct {
	effectReg uint16
	ledOffset int
}

var eneVersions = map[string]eneVersion{
	"LED-0116":        {0x8010, 2},
	"DIMM_LED-0102":   {0x8010, 2},
	"DIMM_LED-0103":   {0x8010, 2},
	"AUDA0-E6K5-0101": {0x8160, 2},
	"AUMA0-E6K5-0104": {0x8160, 2},
	"AUMA0-E6K5-0105": {0x8160, 2},
	"AUMA0-E6K5-0106": {0x8160, 2},
	"AUMA0-E8K4-0101": {0x8010, 2},
	"AUMA0-E6K5-0107": {0x8160, 3},
	"AUMA0-E6K5-1110": {0x8160, 3},
	"AUMA0-E6K5-1111": {0x8160, 3},
	"AUMA0-E6K5-1107": {0x8160, 3},
	"AUMA0-E6K5-0008": {0x8160, 3},
	"AUMA0-E6K5-1113": {0x8160, 3},
	"AUMA0-E6K5-1114": {0x8160, 3},
}

// Adressen an denen ENE RAM Chips liegen koennen
var eneAddrs = []uint8{0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x76, 0x77, 0x4F, 0x66, 0x67, 0x39, 0x3A, 0x3B, 0x3C, 0x3D}

type eneDevice struct {
	addr     uint8
	version  string
	ledCount int
	ver      eneVersion
}

func eneSetReg(bus *SMBus, addr uint8, reg uint16) error {
	return bus.WriteWordData(addr, 0x00, reg<<8|reg>>8)
}

func eneRead(bus *SMBus, addr uint8, reg uint16) (int, error) {
	if err := eneSetReg(bus, addr, reg); err != nil {
		return 0, err
	}
	return bus.ReadByteData(addr, 0x81)
}

func eneWrite(bus *SMBus, addr uint8, reg uint16, val uint8) error {
	if err := eneSetReg(bus, addr, reg); err != nil {
		return err
	}
	return bus.WriteByteData(addr, 0x01, val)
}

func eneWriteBlock(bus *SMBus, addr uint8, reg uint16, data []byte) error {
	if err := eneSetReg(bus, addr, reg); err != nil {
		return err
	}
	if bus.WriteBlockData(addr, 0x03, data) == nil {
		return nil
	}
	// Falls Block nicht geht: Byte fuer Byte
	for i, b := range data {
		if err := eneWrite(bus, addr, reg+uint16(i), b); err != nil {
			return err
		}
	}
	return nil
}

// testENE schaut ob an der Adresse ein ENE Chip antwortet (wie OpenRGB).
func testENE(bus *SMBus, addr uint8) bool {
	if _, err := bus.ReceiveByte(addr); err != nil {
		if _, err := bus.ReadByteData(addr, 0x00); err != nil {
			return false
		}
	}
	for i := 0xA0; i < 0xB0; i++ {
		v, err := bus.ReadByteData(addr, uint8(i))
		if err != nil || v != i-0xA0 {
			return false
		}
	}
	var name [16]byte
	for i := range name {
		v, _ := eneRead(bus, addr, 0x1030+uint16(i))
		name[i] = byte(v)
	}
	return !strings.HasPrefix(string(name[:]), "Micron")
}

func findRAM(bus *SMBus) ([]eneDevice, string) {
	var log strings.Builder

	// RAM Riegel die noch auf 0x77 sitzen bekommen eine eigene Adresse
	next := -1
	for slot := 0; slot < 8; slot++ {
		if _, err := bus.ReceiveByte(0x77); err != nil {
			break
		}
		next++
		for next < len(eneAddrs) {
			if _, err := bus.ReceiveByte(eneAddrs[next]); err != nil {
				break
			}
			next++
		}
		if next >= len(eneAddrs) {
			continue
		}
		fmt.Fprintf(&log, "Slot %d -> 0x%02X\r\n", slot, eneAddrs[next])
		eneWrite(bus, 0x77, 0x80F8, uint8(slot))
		eneWrite(bus, 0x77, 0x80F9, eneAddrs[next]<<1)
	}

	var devs []eneDevice
	for _, a := range eneAddrs {
		if !testENE(bus, a) {
			continue
		}
		var nb [16]byte
		for i := range nb {
			v, _ := eneRead(bus, a, 0x1000+uint16(i))
			nb[i] = byte(v)
		}
		nb[15] = 0
		name := strings.TrimRight(string(nb[:]), "\x00")
		if i := strings.IndexByte(name, 0); i >= 0 {
			name = name[:i]
		}
		ver, ok := eneVersions[name]
		if !ok {
			fmt.Fprintf(&log, "0x%02X: unbekannte Version %q, wird nicht angefasst\r\n", a, name)
			continue
		}
		n, _ := eneRead(bus, a, 0x1C00+uint16(ver.ledOffset))
		fmt.Fprintf(&log, "0x%02X: %s, %d LEDs\r\n", a, name, uint8(n))
		if uint8(n) == 0 || uint8(n) > 30 {
			continue
		}
		devs = append(devs, eneDevice{addr: a, version: name, ledCount: int(uint8(n)), ver: ver})
		time.Sleep(time.Millisecond)
	}
	return devs, log.String()
}

func applyENE(bus *SMBus, addr uint8, s Setting, effectReg uint16, leds int) error {
	mode, color := uint8(1), true
	switch s.Effect {
	case EffStatic:
		mode = 1
	case EffBreathing:
		mode = 2
	case EffRainbow:
		mode, color = 5, false
	case EffColorCycle:
		mode, color = 4, false
	case EffOff:
		mode, color = 0, false
	}
	speed := 0
	if s.Effect != EffStatic {
		speed = 4 - s.Speed // beim ENE ist 0 schnell und 4 langsam
	}
	if s.Effect == EffOff {
		speed = 0
	}

	regs := []struct {
		reg uint16
		val uint8
	}{
		{0x8021, mode},
		{0x8022, uint8(speed)},
		{0x8023, 0},
		{0x80A0, 1},
		{0x8020, 0}, // kein Direkt Modus
		{0x80A0, 1},
	}
	for _, r := range regs {
		if err := eneWrite(bus, addr, r.reg, r.val); err != nil {
			return err
		}
	}

	if color {
		r, g, b := scaleColor(s)
		buf := make([]byte, 0, leds*3)
		for i := 0; i < leds; i++ {
			buf = append(buf, r, b, g) // ENE will Rot, Blau, Gruen
		}
		for off := 0; off < len(buf); off += 3 {
			end := off + 3
			if end > len(buf) {
				end = len(buf)
			}
			if err := eneWriteBlock(bus, addr, effectReg+uint16(off), buf[off:end]); err != nil {
				return err
			}
		}
		if err := eneWrite(bus, addr, 0x80A0, 1); err != nil {
			return err
		}
	}
	// Speichern, damit es auch nach dem Neustart bleibt
	return eneWrite(bus, addr, 0x80A0, 0xAA)
}

// ApplyRAMElevated laeuft im Administrator Teil.
func ApplyRAMElevated(s Setting) (string, error) {
	bus, err := OpenSMBus()
	if err != nil {
		return "", err
	}
	defer bus.Close()

	devs, log := findRAM(bus)
	if len(devs) == 0 {
		return log, errors.New("kein RAM mit passendem RGB Chip gefunden")
	}
	for _, d := range devs {
		if err := applyENE(bus, d.addr, s, d.ver.effectReg, d.ledCount); err != nil {
			return log, fmt.Errorf("RAM an 0x%02X: %v", d.addr, err)
		}
	}
	return log + fmt.Sprintf("%d RAM Riegel gesetzt\r\n", len(devs)), nil
}

// runRAMChild ist der Teil der mit "/ram effekt r g b helligkeit tempo datei" gestartet wird.
func runRAMChild(args []string) {
	runtime.LockOSThread()
	if len(args) < 7 {
		os.Exit(2)
	}
	var v [6]int
	for i := range v {
		v[i], _ = strconv.Atoi(args[i])
	}
	s := Setting{Effect: v[0], R: uint8(v[1]), G: uint8(v[2]), B: uint8(v[3]), Brightness: v[4], Speed: v[5]}.clamp()

	log, err := ApplyRAMElevated(s)
	out := "OK\r\n" + log
	if err != nil {
		out = "FEHLER: " + err.Error() + "\r\n" + log
	}
	os.WriteFile(args[6], []byte(out), 0644)
	if err != nil {
		os.Exit(1)
	}
	os.Exit(0)
}

type shellExecuteInfo struct {
	cbSize       uint32
	fMask        uint32
	hwnd         uintptr
	lpVerb       *uint16
	lpFile       *uint16
	lpParameters *uint16
	lpDirectory  *uint16
	nShow        int32
	hInstApp     uintptr
	lpIDList     uintptr
	lpClass      *uint16
	hkeyClass    uintptr
	dwHotKey     uint32
	hIcon        uintptr
	hProcess     windows.Handle
}

var (
	modShell32          = windows.NewLazySystemDLL("shell32.dll")
	procShellExecuteExW = modShell32.NewProc("ShellExecuteExW")
)

// runAndWait startet ein Programm (mit "runas" als Administrator) und wartet bis es fertig ist.
func runAndWait(hwnd uintptr, verb, file, params string, timeout time.Duration) (uint32, error) {
	v, _ := windows.UTF16PtrFromString(verb)
	f, _ := windows.UTF16PtrFromString(file)
	p, _ := windows.UTF16PtrFromString(params)
	info := &shellExecuteInfo{
		fMask:        0x40, // SEE_MASK_NOCLOSEPROCESS
		hwnd:         hwnd,
		lpVerb:       v,
		lpFile:       f,
		lpParameters: p,
		nShow:        1,
	}
	info.cbSize = uint32(unsafe.Sizeof(*info))
	r, _, e := procShellExecuteExW.Call(uintptr(unsafe.Pointer(info)))
	if r == 0 {
		if e == windows.ERROR_CANCELLED {
			return 0, errors.New("Administrator Abfrage abgelehnt")
		}
		return 0, fmt.Errorf("konnte nicht gestartet werden (%v)", e)
	}
	if info.hProcess == 0 {
		return 0, nil
	}
	defer windows.CloseHandle(info.hProcess)
	windows.WaitForSingleObject(info.hProcess, uint32(timeout.Milliseconds()))
	var code uint32
	windows.GetExitCodeProcess(info.hProcess, &code)
	return code, nil
}

// InstallPawnIO packt den eingebauten PawnIO Installer aus und startet ihn.
func InstallPawnIO(hwnd uintptr) error {
	if len(pawnioSetup) == 0 {
		return errors.New("Installer fehlt im Tool")
	}
	dir := filepath.Join(os.TempDir(), "RGB-Steuerung")
	os.MkdirAll(dir, 0755)
	p := filepath.Join(dir, "PawnIO_setup.exe")
	if err := os.WriteFile(p, pawnioSetup, 0755); err != nil {
		return fmt.Errorf("Installer konnte nicht entpackt werden (%v)", err)
	}
	defer os.Remove(p)
	if _, err := runAndWait(hwnd, "runas", p, "", 600*time.Second); err != nil {
		return err
	}
	if !PawnIOInstalled() {
		return errors.New("PawnIO wurde nicht installiert")
	}
	return nil
}

// ApplyRAM startet den Administrator Teil und liest danach das Ergebnis.
func ApplyRAM(s Setting, hwnd uintptr) (string, error) {
	if !PawnIOInstalled() {
		return "", errors.New("PawnIO ist nicht installiert")
	}
	if !ModuleFound() {
		return "", fmt.Errorf("%s fehlt", moduleName)
	}
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	out := configPath() + ".ram.txt"
	os.MkdirAll(filepath.Dir(out), 0755)
	os.Remove(out)
	params := fmt.Sprintf(`/ram %d %d %d %d %d %d "%s"`, s.Effect, s.R, s.G, s.B, s.Brightness, s.Speed, out)
	if _, err := runAndWait(hwnd, "runas", exe, params, 60*time.Second); err != nil {
		return "", err
	}
	data, _ := os.ReadFile(out)
	txt := string(data)
	if strings.HasPrefix(txt, "OK") {
		return txt, nil
	}
	if strings.HasPrefix(txt, "FEHLER: ") {
		first := strings.SplitN(strings.TrimPrefix(txt, "FEHLER: "), "\r\n", 2)[0]
		return txt, errors.New(first)
	}
	return txt, errors.New("keine Rückmeldung vom RAM Teil")
}
