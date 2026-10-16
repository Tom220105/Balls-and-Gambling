package main

import (
	"errors"
	"fmt"
	"strings"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Kleiner HID Zugriff ueber hid.dll und setupapi.dll (wie hidapi, nur ohne cgo).

var (
	modHid      = windows.NewLazySystemDLL("hid.dll")
	modSetupapi = windows.NewLazySystemDLL("setupapi.dll")

	procHidD_GetHidGuid                  = modHid.NewProc("HidD_GetHidGuid")
	procHidD_GetAttributes               = modHid.NewProc("HidD_GetAttributes")
	procHidD_GetPreparsedData            = modHid.NewProc("HidD_GetPreparsedData")
	procHidD_FreePreparsedData           = modHid.NewProc("HidD_FreePreparsedData")
	procHidP_GetCaps                     = modHid.NewProc("HidP_GetCaps")
	procHidD_GetProductString            = modHid.NewProc("HidD_GetProductString")
	procSetupDiGetClassDevsW             = modSetupapi.NewProc("SetupDiGetClassDevsW")
	procSetupDiEnumDeviceInterfaces      = modSetupapi.NewProc("SetupDiEnumDeviceInterfaces")
	procSetupDiGetDeviceInterfaceDetailW = modSetupapi.NewProc("SetupDiGetDeviceInterfaceDetailW")
	procSetupDiDestroyDeviceInfoList     = modSetupapi.NewProc("SetupDiDestroyDeviceInfoList")
)

type hiddAttributes struct {
	Size          uint32
	VendorID      uint16
	ProductID     uint16
	VersionNumber uint16
}

type hidpCaps struct {
	Usage                     uint16
	UsagePage                 uint16
	InputReportByteLength     uint16
	OutputReportByteLength    uint16
	FeatureReportByteLength   uint16
	Reserved                  [17]uint16
	NumberLinkCollectionNodes uint16
	NumberInputButtonCaps     uint16
	NumberInputValueCaps      uint16
	NumberInputDataIndices    uint16
	NumberOutputButtonCaps    uint16
	NumberOutputValueCaps     uint16
	NumberOutputDataIndices   uint16
	NumberFeatureButtonCaps   uint16
	NumberFeatureValueCaps    uint16
	NumberFeatureDataIndices  uint16
}

type spDeviceInterfaceData struct {
	CbSize             uint32
	InterfaceClassGuid windows.GUID
	Flags              uint32
	Reserved           uintptr
}

// HidInfo beschreibt ein gefundenes HID Geraet.
type HidInfo struct {
	Path      string
	VID       uint16
	PID       uint16
	UsagePage uint16
	Usage     uint16
	InLen     int
	OutLen    int
	Product   string
}

func (h HidInfo) String() string {
	iface := ""
	p := strings.ToLower(h.Path)
	if i := strings.Index(p, "mi_"); i >= 0 && i+5 <= len(p) {
		iface = p[i : i+5]
	}
	return fmt.Sprintf("%04X:%04X %s  Page %04X  Usage %04X  Out %d  In %d  %s",
		h.VID, h.PID, iface, h.UsagePage, h.Usage, h.OutLen, h.InLen, h.Product)
}

func openHandle(path string, access uint32) (windows.Handle, error) {
	p, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return windows.InvalidHandle, err
	}
	return windows.CreateFile(p, access, windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE, nil,
		windows.OPEN_EXISTING, windows.FILE_FLAG_OVERLAPPED, 0)
}

func readInfo(path string) (HidInfo, bool) {
	info := HidInfo{Path: path}
	h, err := openHandle(path, 0)
	if err != nil {
		return info, false
	}
	defer windows.CloseHandle(h)

	attr := &hiddAttributes{Size: uint32(unsafe.Sizeof(hiddAttributes{}))}
	r, _, _ := procHidD_GetAttributes.Call(uintptr(h), uintptr(unsafe.Pointer(attr)))
	if r == 0 {
		return info, false
	}
	info.VID = attr.VendorID
	info.PID = attr.ProductID

	pp := new(uintptr)
	r, _, _ = procHidD_GetPreparsedData.Call(uintptr(h), uintptr(unsafe.Pointer(pp)))
	if r != 0 {
		caps := new(hidpCaps)
		r, _, _ = procHidP_GetCaps.Call(*pp, uintptr(unsafe.Pointer(caps)))
		if uint32(r) == 0x110000 { // HIDP_STATUS_SUCCESS
			info.UsagePage = caps.UsagePage
			info.Usage = caps.Usage
			info.InLen = int(caps.InputReportByteLength)
			info.OutLen = int(caps.OutputReportByteLength)
		}
		procHidD_FreePreparsedData.Call(*pp)
	}

	buf := make([]uint16, 128)
	r, _, _ = procHidD_GetProductString.Call(uintptr(h), uintptr(unsafe.Pointer(&buf[0])), 256)
	if r != 0 {
		info.Product = strings.TrimSpace(windows.UTF16ToString(buf))
	}
	return info, true
}

// EnumerateHID listet alle HID Geraete auf.
func EnumerateHID() ([]HidInfo, error) {
	guid := new(windows.GUID)
	procHidD_GetHidGuid.Call(uintptr(unsafe.Pointer(guid)))

	set, _, e := procSetupDiGetClassDevsW.Call(uintptr(unsafe.Pointer(guid)), 0, 0,
		0x12) // DIGCF_PRESENT | DIGCF_DEVICEINTERFACE
	if set == uintptr(windows.InvalidHandle) {
		return nil, fmt.Errorf("SetupDiGetClassDevs: %v", e)
	}
	defer procSetupDiDestroyDeviceInfoList.Call(set)

	var list []HidInfo
	for i := 0; i < 1024; i++ {
		ifd := &spDeviceInterfaceData{CbSize: uint32(unsafe.Sizeof(spDeviceInterfaceData{}))}
		r, _, _ := procSetupDiEnumDeviceInterfaces.Call(set, 0, uintptr(unsafe.Pointer(guid)), uintptr(i), uintptr(unsafe.Pointer(ifd)))
		if r == 0 {
			break
		}
		need := new(uint32)
		procSetupDiGetDeviceInterfaceDetailW.Call(set, uintptr(unsafe.Pointer(ifd)), 0, 0, uintptr(unsafe.Pointer(need)), 0)
		if *need < 8 {
			continue
		}
		size := *need + 8
		buf := make([]byte, size)
		*(*uint32)(unsafe.Pointer(&buf[0])) = 8 // cbSize von SP_DEVICE_INTERFACE_DETAIL_DATA_W auf 64 Bit
		r, _, _ = procSetupDiGetDeviceInterfaceDetailW.Call(set, uintptr(unsafe.Pointer(ifd)), uintptr(unsafe.Pointer(&buf[0])), uintptr(*need), 0, 0)
		if r == 0 {
			continue
		}
		n := (int(*need) - 4) / 2
		path := windows.UTF16ToString(unsafe.Slice((*uint16)(unsafe.Pointer(&buf[4])), n))
		info, ok := readInfo(path)
		if !ok {
			continue
		}
		list = append(list, info)
	}
	return list, nil
}

// HidDevice ist ein geoeffnetes HID Geraet.
type HidDevice struct {
	Info HidInfo
	h    windows.Handle
	ov   *windows.Overlapped
}

func OpenHID(info HidInfo) (*HidDevice, error) {
	h, err := openHandle(info.Path, windows.GENERIC_READ|windows.GENERIC_WRITE)
	if err != nil {
		return nil, err
	}
	return &HidDevice{Info: info, h: h}, nil
}

func (d *HidDevice) Close() {
	if d.h != windows.InvalidHandle && d.h != 0 {
		windows.CloseHandle(d.h)
		d.h = windows.InvalidHandle
	}
}

func (d *HidDevice) waitIO(ov *windows.Overlapped, timeout time.Duration) (uint32, error) {
	ev, err := windows.WaitForSingleObject(ov.HEvent, uint32(timeout.Milliseconds()))
	if err != nil {
		return 0, err
	}
	if ev == uint32(windows.WAIT_TIMEOUT) {
		windows.CancelIoEx(d.h, ov)
		var n uint32
		windows.GetOverlappedResult(d.h, ov, &n, true)
		return 0, errors.New("Zeitueberschreitung")
	}
	var n uint32
	if err := windows.GetOverlappedResult(d.h, ov, &n, true); err != nil {
		return 0, err
	}
	return n, nil
}

// Write schickt einen Report. Klappt es nicht, wird es nach 20 ms noch einmal versucht.
func (d *HidDevice) Write(data []byte) error {
	err := d.writeOnce(data)
	if err != nil {
		time.Sleep(20 * time.Millisecond)
		err = d.writeOnce(data)
	}
	return err
}

func (d *HidDevice) writeOnce(data []byte) error {
	// Windows will immer genau die Report Laenge haben, also auffuellen
	n := d.Info.OutLen
	if n < len(data) {
		n = len(data)
	}
	buf := make([]byte, n)
	copy(buf, data)

	ev, err := windows.CreateEvent(nil, 1, 0, nil)
	if err != nil {
		return err
	}
	defer windows.CloseHandle(ev)
	ov := &windows.Overlapped{HEvent: ev}
	d.ov = ov

	err = windows.WriteFile(d.h, buf, nil, ov)
	if err != nil && err != windows.ERROR_IO_PENDING {
		return fmt.Errorf("Schreiben fehlgeschlagen: %v", err)
	}
	_, err = d.waitIO(ov, time.Second)
	return err
}

// Read liest einen Report (mit Zeitlimit).
func (d *HidDevice) Read(timeout time.Duration) ([]byte, error) {
	n := d.Info.InLen
	if n <= 0 {
		n = 65
	}
	buf := make([]byte, n)

	ev, err := windows.CreateEvent(nil, 1, 0, nil)
	if err != nil {
		return nil, err
	}
	defer windows.CloseHandle(ev)
	ov := &windows.Overlapped{HEvent: ev}
	d.ov = ov

	err = windows.ReadFile(d.h, buf, nil, ov)
	if err != nil && err != windows.ERROR_IO_PENDING {
		return nil, fmt.Errorf("Lesen fehlgeschlagen: %v", err)
	}
	got, err := d.waitIO(ov, timeout)
	if err != nil {
		return nil, err
	}
	return buf[:got], nil
}
