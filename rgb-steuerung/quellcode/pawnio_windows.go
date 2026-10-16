package main

import (
	_ "embed"
	"encoding/binary"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

// RAM Zugriff ueber den PawnIO Treiber und das SmbusPIIX4 Modul (wie OpenRGB).

const moduleName = "SmbusPIIX4.bin"

//go:embed SmbusPIIX4.bin
var embeddedModule []byte

const (
	ioctlPawnIOLoad    = 0xA1B22084
	ioctlPawnIOExecute = 0xA1B22104
)

// PawnIOInstalled schaut ob der Treiber als Dienst eingetragen ist.
func PawnIOInstalled() bool {
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, `SYSTEM\CurrentControlSet\Services\PawnIO`, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	k.Close()
	return true
}

func modulePath() string {
	exe, err := os.Executable()
	if err != nil {
		return moduleName
	}
	return filepath.Join(filepath.Dir(exe), moduleName)
}

func ModuleFound() bool {
	if len(embeddedModule) > 0 {
		return true
	}
	_, err := os.Stat(modulePath())
	return err == nil
}

func moduleBlob() ([]byte, error) {
	if len(embeddedModule) > 0 {
		return embeddedModule, nil
	}
	return os.ReadFile(modulePath())
}

type PawnIO struct {
	h windows.Handle
}

func OpenPawnIO() (*PawnIO, error) {
	p, err := windows.UTF16PtrFromString(`\\?\GLOBALROOT\Device\PawnIO`)
	if err != nil {
		return nil, err
	}
	h, err := windows.CreateFile(p, windows.GENERIC_READ|windows.GENERIC_WRITE,
		windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE, nil, windows.OPEN_EXISTING, 0, 0)
	if err != nil {
		if err == windows.ERROR_ACCESS_DENIED {
			return nil, errors.New("keine Administrator Rechte")
		}
		return nil, fmt.Errorf("PawnIO Treiber nicht erreichbar (%v)", err)
	}
	return &PawnIO{h: h}, nil
}

func (p *PawnIO) Close() {
	windows.CloseHandle(p.h)
}

func (p *PawnIO) Load(blob []byte) error {
	if len(blob) == 0 {
		return errors.New("Modul ist leer")
	}
	var ret uint32
	err := windows.DeviceIoControl(p.h, ioctlPawnIOLoad, &blob[0], uint32(len(blob)), nil, 0, &ret, nil)
	if err != nil {
		return fmt.Errorf("Modul konnte nicht geladen werden (%v)", err)
	}
	return nil
}

// Execute ruft eine Funktion im Modul auf. Eingabe ist der Name (32 Byte) und danach die Zahlen.
func (p *PawnIO) Execute(name string, in []uint64, outN int) ([]uint64, error) {
	buf := make([]byte, 32+8*len(in))
	copy(buf, name)
	for i, v := range in {
		binary.LittleEndian.PutUint64(buf[32+8*i:], v)
	}
	out := make([]byte, 8*outN+8)
	var ret uint32
	err := windows.DeviceIoControl(p.h, ioctlPawnIOExecute, &buf[0], uint32(len(buf)), &out[0], uint32(8*outN), &ret, nil)
	if err != nil {
		return nil, err
	}
	res := make([]uint64, outN)
	for i := range res {
		res[i] = binary.LittleEndian.Uint64(out[8*i:])
	}
	return res, nil
}

// SMBus ist der geoeffnete Bus mit der globalen Sperre, die auch andere Programme benutzen.
type SMBus struct {
	p       *PawnIO
	mutex   windows.Handle
	oldPort uint64
}

const smbusMutexName = `Global\Access_SMBUS.HTP.Method`

// openSMBusMutex holt die gemeinsame Sperre. Wenn ein anderes Programm (HWiNFO, OpenRGB,
// SignalRGB, ...) sie schon angelegt hat, ist das kein Fehler, dann benutzen wir einfach die gleiche.
func openSMBusMutex() (windows.Handle, error) {
	name, err := windows.UTF16PtrFromString(smbusMutexName)
	if err != nil {
		return 0, err
	}
	h, err := windows.CreateMutex(nil, false, name)
	if h != 0 {
		return h, nil
	}
	// Vielleicht duerfen wir sie nur oeffnen und nicht anlegen
	h2, err2 := windows.OpenMutex(windows.SYNCHRONIZE|0x0001, false, name) // MUTEX_MODIFY_STATE
	if err2 == nil && h2 != 0 {
		return h2, nil
	}
	return 0, err
}

func OpenSMBus() (*SMBus, error) {
	blob, err := moduleBlob()
	if err != nil {
		return nil, fmt.Errorf("%s fehlt neben dem Tool", moduleName)
	}
	p, err := OpenPawnIO()
	if err != nil {
		return nil, err
	}
	if err := p.Load(blob); err != nil {
		p.Close()
		return nil, err
	}

	id, err := p.Execute("ioctl_identity", []uint64{0}, 3)
	if err != nil {
		p.Close()
		return nil, fmt.Errorf("Chipsatz nicht erkannt (%v)", err)
	}
	ven := id[2] & 0xFFFF
	dev := (id[2] >> 16) & 0xFFFF
	if ven != 0x1022 || dev != 0x790B {
		p.Close()
		return nil, fmt.Errorf("unbekannter Chipsatz %04X:%04X", ven, dev)
	}

	m, err := openSMBusMutex()
	if err != nil {
		p.Close()
		return nil, fmt.Errorf("SMBus Sperre nicht möglich (%v)", err)
	}
	s := &SMBus{p: p, mutex: m}

	if err := s.lock(); err != nil {
		s.closeRaw()
		return nil, err
	}
	// Der RAM haengt an Anschluss 0
	old, err := p.Execute("ioctl_piix4_port_sel", []uint64{0}, 1)
	windows.ReleaseMutex(s.mutex)
	if err != nil {
		s.closeRaw()
		return nil, fmt.Errorf("SMBus Anschluss nicht wählbar (%v)", err)
	}
	s.oldPort = old[0]
	return s, nil
}

func (s *SMBus) lock() error {
	ev, err := windows.WaitForSingleObject(s.mutex, 5000)
	if err != nil {
		return err
	}
	if ev != windows.WAIT_OBJECT_0 && ev != windows.WAIT_ABANDONED {
		return errors.New("SMBus ist gerade von einem anderen Programm belegt")
	}
	return nil
}

func (s *SMBus) closeRaw() {
	windows.CloseHandle(s.mutex)
	s.p.Close()
}

func (s *SMBus) Close() {
	if s.lock() == nil {
		if s.oldPort >= 1 && s.oldPort <= 4 {
			s.p.Execute("ioctl_piix4_port_sel", []uint64{s.oldPort}, 1)
		}
		windows.ReleaseMutex(s.mutex)
	}
	s.closeRaw()
}

// xfer macht einen SMBus Zugriff wie i2c_smbus_xfer in Linux.
func (s *SMBus) xfer(addr uint8, rw uint8, cmd uint8, size int, data []byte) ([]byte, error) {
	in := make([]uint64, 9)
	in[0] = uint64(addr)
	in[1] = uint64(rw)
	in[2] = uint64(cmd)
	in[3] = uint64(size)
	var d [40]byte
	copy(d[:], data)
	for i := 0; i < 5; i++ {
		in[4+i] = binary.LittleEndian.Uint64(d[8*i:])
	}

	if err := s.lock(); err != nil {
		return nil, err
	}
	out, err := s.p.Execute("ioctl_smbus_xfer", in, 5)
	windows.ReleaseMutex(s.mutex)
	if err != nil {
		return nil, err
	}

	res := make([]byte, 40)
	for i := 0; i < 5; i++ {
		binary.LittleEndian.PutUint64(res[8*i:], out[i])
	}
	return res, nil
}

const (
	smbusWrite = 0
	smbusRead  = 1

	smbusByte      = 1
	smbusByteData  = 2
	smbusWordData  = 3
	smbusBlockData = 5
)

func (s *SMBus) ReceiveByte(addr uint8) (int, error) {
	r, err := s.xfer(addr, smbusRead, 0, smbusByte, nil)
	if err != nil {
		return -1, err
	}
	return int(r[0]), nil
}

func (s *SMBus) ReadByteData(addr, cmd uint8) (int, error) {
	r, err := s.xfer(addr, smbusRead, cmd, smbusByteData, nil)
	if err != nil {
		return -1, err
	}
	return int(r[0]), nil
}

func (s *SMBus) WriteByteData(addr, cmd, val uint8) error {
	_, err := s.xfer(addr, smbusWrite, cmd, smbusByteData, []byte{val})
	return err
}

func (s *SMBus) WriteWordData(addr, cmd uint8, val uint16) error {
	_, err := s.xfer(addr, smbusWrite, cmd, smbusWordData, []byte{byte(val), byte(val >> 8)})
	return err
}

func (s *SMBus) WriteBlockData(addr, cmd uint8, data []byte) error {
	block := append([]byte{byte(len(data))}, data...)
	_, err := s.xfer(addr, smbusWrite, cmd, smbusBlockData, block)
	return err
}
