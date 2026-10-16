package main

import (
	"errors"
	"fmt"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Grafikkarte ueber den I2C Bus vom NVIDIA Treiber (wie OpenRGB).

var (
	modNvapi                = windows.NewLazySystemDLL("nvapi64.dll")
	procNvapiQueryInterface = modNvapi.NewProc("nvapi_QueryInterface")
)

var (
	nvOK               bool
	nvInitialize       uintptr
	nvEnumPhysicalGPUs uintptr
	nvGetPCIIDs        uintptr
	nvI2CWriteEx       uintptr
	nvI2CReadEx        uintptr
)

type knownGPU struct {
	Dev    uint16
	SubVen uint16
	SubDev uint16
	Addr   uint8
	Name   string
}

// Karten bei denen wir wissen wo der RGB Chip sitzt
var knownGPUs = []knownGPU{
	{0x2705, 0x1458, 0x413F, 0x71, "Gigabyte RTX 4070 Ti SUPER AERO OC"},
}

type GPUInfo struct {
	handle uintptr
	Dev    uint16
	Ven    uint16
	SubDev uint16
	SubVen uint16
	Addr   uint8
	Name   string
	Known  bool
}

func (g GPUInfo) String() string {
	s := fmt.Sprintf("PCI %04X:%04X  Sub %04X:%04X", g.Ven, g.Dev, g.SubVen, g.SubDev)
	if g.Known {
		s += fmt.Sprintf("  %s, I2C Adresse 0x%02X", g.Name, g.Addr)
	} else {
		s += "  (nicht in der Liste, wird nicht angesprochen)"
	}
	return s
}

// NV_I2C_INFO_V3, 64 Byte
type nvI2CInfo struct {
	Version     uint32
	DisplayMask uint32
	IsDDCPort   uint8
	DevAddress  uint8
	_           [6]byte
	RegAddress  *byte
	RegAddrSize uint32
	_           uint32
	Data        *byte
	Size        uint32
	Speed       uint32
	SpeedKhz    uint32
	PortID      uint8
	_           [3]byte
	PortIDSet   uint32
	_           uint32
}

func nvQuery(id uint32) uintptr {
	r, _, _ := procNvapiQueryInterface.Call(uintptr(id))
	return r
}

func nvInit() error {
	if nvOK {
		return nil
	}
	if procNvapiQueryInterface.Find() != nil {
		return errors.New("NVIDIA Treiber Schnittstelle nicht gefunden")
	}
	nvInitialize = nvQuery(0x0150E828)
	nvEnumPhysicalGPUs = nvQuery(0xE5AC921F)
	nvGetPCIIDs = nvQuery(0x2DDFB66E)
	nvI2CWriteEx = nvQuery(0x283AC65A)
	nvI2CReadEx = nvQuery(0x4D7B0709)
	if nvInitialize == 0 || nvEnumPhysicalGPUs == 0 || nvGetPCIIDs == 0 || nvI2CWriteEx == 0 || nvI2CReadEx == 0 {
		return errors.New("NVIDIA Funktionen fehlen")
	}
	r, _, _ := syscall.SyscallN(nvInitialize)
	if int32(r) != 0 {
		return fmt.Errorf("NvAPI Start fehlgeschlagen (%d)", int32(r))
	}
	nvOK = true
	return nil
}

// DetectGPUs listet alle NVIDIA Karten auf.
func DetectGPUs() ([]GPUInfo, error) {
	if err := nvInit(); err != nil {
		return nil, err
	}
	var handles [64]uintptr
	var count int32
	r, _, _ := syscall.SyscallN(nvEnumPhysicalGPUs, uintptr(unsafe.Pointer(&handles[0])), uintptr(unsafe.Pointer(&count)))
	if int32(r) != 0 {
		return nil, fmt.Errorf("Grafikkarten nicht auflistbar (%d)", int32(r))
	}

	var list []GPUInfo
	for i := 0; i < int(count) && i < 64; i++ {
		var devID, subID, rev, ext uint32
		r, _, _ := syscall.SyscallN(nvGetPCIIDs, handles[i],
			uintptr(unsafe.Pointer(&devID)), uintptr(unsafe.Pointer(&subID)),
			uintptr(unsafe.Pointer(&rev)), uintptr(unsafe.Pointer(&ext)))
		if int32(r) != 0 {
			continue
		}
		g := GPUInfo{
			handle: handles[i],
			Ven:    uint16(devID),
			Dev:    uint16(devID >> 16),
			SubVen: uint16(subID),
			SubDev: uint16(subID >> 16),
		}
		for _, k := range knownGPUs {
			if g.Ven == 0x10DE && k.Dev == g.Dev && k.SubVen == g.SubVen && k.SubDev == g.SubDev {
				g.Known = true
				g.Addr = k.Addr
				g.Name = k.Name
			}
		}
		list = append(list, g)
	}
	return list, nil
}

// i2c schreibt oder liest genau ein Byte (SMBus "byte" ohne Register).
func (g *GPUInfo) i2c(write bool, b byte) (byte, error) {
	data := b
	info := nvI2CInfo{
		Version:    0x30040,
		DevAddress: g.Addr << 1,
		Data:       &data,
		Size:       1,
		Speed:      0xFFFF,
		PortID:     1,
		PortIDSet:  1,
	}
	var unknown uint32
	proc := nvI2CReadEx
	if write {
		proc = nvI2CWriteEx
	}
	r, _, _ := syscall.SyscallN(proc, g.handle, uintptr(unsafe.Pointer(&info)), uintptr(unsafe.Pointer(&unknown)))
	if int32(r) != 0 {
		return 0, fmt.Errorf("I2C Fehler (%d)", int32(r))
	}
	return data, nil
}

func (g *GPUInfo) write4(b [4]byte) error {
	for i := 0; i < 4; i++ {
		if _, err := g.i2c(true, b[i]); err != nil {
			return err
		}
	}
	return nil
}

// checkController fragt den RGB Chip nach seiner Kennung.
func (g *GPUInfo) checkController() error {
	if err := g.write4([4]byte{0xAB, 0, 0, 0}); err != nil {
		return err
	}
	a, err := g.i2c(false, 0)
	if err != nil {
		return err
	}
	v, err := g.i2c(false, 0)
	if err != nil {
		return err
	}
	g.i2c(false, 0)
	g.i2c(false, 0)
	if a == 0xAB && (v == 0x10 || v == 0x11 || v == 0x12 || v == 0x14) {
		return nil
	}
	return fmt.Errorf("RGB Chip antwortet nicht wie erwartet (%02X %02X)", a, v)
}

func applyGPU(g *GPUInfo, s Setting) error {
	if g == nil || !g.Known {
		return errors.New("nicht gefunden")
	}
	if err := nvInit(); err != nil {
		return err
	}
	if err := g.checkController(); err != nil {
		return err
	}

	speed := [5]byte{0x00, 0x02, 0x05, 0x07, 0x09}[s.Speed]
	bright := [5]byte{0x00, 0x19, 0x32, 0x4A, 0x63}[s.Brightness]
	var mode byte
	color := false
	switch s.Effect {
	case EffStatic:
		mode, speed, color = 0x01, 0, true
	case EffBreathing:
		mode, color = 0x02, true
	case EffRainbow:
		mode = 0x11
	case EffColorCycle:
		mode = 0x10
	case EffOff:
		mode, speed, bright, color = 0x01, 0, 0, true
	default:
		mode, color = 0x01, true
	}

	if err := g.write4([4]byte{0x88, mode, speed, bright}); err != nil {
		return err
	}
	if color {
		r, gr, b := s.R, s.G, s.B
		if s.Effect == EffOff {
			r, gr, b = 0, 0, 0
		}
		if err := g.write4([4]byte{0x40, r, gr, b}); err != nil {
			return err
		}
	}
	return g.write4([4]byte{0xAA, 0, 0, 0})
}
