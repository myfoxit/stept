# Windows Native Helper

## Build

### Option A: .NET SDK (recommended)
```bash
cd native/windows
dotnet publish -c Release -r win-x64 --self-contained
# Output: bin/Release/net8.0/win-x64/publish/window-info.exe
```

### Option B: C# compiler (no SDK)
```bash
csc /optimize /out:window-info.exe WindowInfo.cs
```

## Usage
```bash
window-info.exe mouse           # Mouse pos + window under cursor + element
window-info.exe windows         # All visible windows
window-info.exe point 500 300   # Window + element at specific coordinates
```

## Features
- Window detection via `WindowFromPoint` + `GetAncestor(GA_ROOT)`
- Per-monitor DPI via `GetDpiForMonitor` (Windows 8.1+)
- MSAA accessibility via `AccessibleObjectFromPoint` — element role, name, value
- Window enumeration via `EnumWindows`
- Multi-monitor support via `EnumDisplayMonitors`
- Zero dependencies, single ~15MB self-contained exe
