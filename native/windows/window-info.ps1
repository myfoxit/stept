# Native Windows window info helper
# Usage: powershell -File window-info.ps1 mouse
#        powershell -File window-info.ps1 windows  
#        powershell -File window-info.ps1 point <x> <y>
# Output: JSON to stdout

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;
using System.Diagnostics;

public struct POINT { public int X; public int Y; }
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

public class WinAPI {
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT pt);
    [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT pt);
    [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hwnd, uint gaFlags);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, StringBuilder sb, int maxCount);
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("shcore.dll")] public static extern int GetDpiForMonitor(IntPtr hmonitor, int dpiType, out uint dpiX, out uint dpiY);
    [DllImport("user32.dll")] public static extern IntPtr MonitorFromPoint(POINT pt, uint dwFlags);
    
    public delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);
    
    public static string GetWindowTitle(IntPtr hwnd) {
        int len = GetWindowTextLength(hwnd);
        if (len == 0) return "";
        StringBuilder sb = new StringBuilder(len + 1);
        GetWindowText(hwnd, sb, sb.Capacity);
        return sb.ToString();
    }
    
    public static uint GetPID(IntPtr hwnd) {
        uint pid = 0;
        GetWindowThreadProcessId(hwnd, out pid);
        return pid;
    }
}
"@

function Get-WindowInfo($hwnd) {
    $rect = New-Object RECT
    [WinAPI]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
    $title = [WinAPI]::GetWindowTitle($hwnd)
    $pid = [WinAPI]::GetPID($hwnd)
    $proc = try { (Get-Process -Id $pid -ErrorAction SilentlyContinue).ProcessName } catch { "" }
    
    @{
        handle = [int64]$hwnd
        title = $title
        ownerName = $proc
        ownerPID = [int]$pid
        bounds = @{
            x = $rect.Left
            y = $rect.Top
            width = $rect.Right - $rect.Left
            height = $rect.Bottom - $rect.Top
        }
        isVisible = [WinAPI]::IsWindowVisible($hwnd)
    }
}

function Get-DpiForPoint($x, $y) {
    $pt = New-Object POINT
    $pt.X = $x; $pt.Y = $y
    $monitor = [WinAPI]::MonitorFromPoint($pt, 2)
    $dpiX = [uint32]0; $dpiY = [uint32]0
    try {
        [WinAPI]::GetDpiForMonitor($monitor, 0, [ref]$dpiX, [ref]$dpiY) | Out-Null
        return $dpiX / 96.0
    } catch {
        return 1.0
    }
}

$command = $args[0]

switch ($command) {
    "mouse" {
        $pt = New-Object POINT
        [WinAPI]::GetCursorPos([ref]$pt) | Out-Null
        $hwnd = [WinAPI]::WindowFromPoint($pt)
        $rootHwnd = [WinAPI]::GetAncestor($hwnd, 2)  # GA_ROOT
        $scale = Get-DpiForPoint $pt.X $pt.Y
        
        $result = @{
            mousePosition = @{ x = $pt.X; y = $pt.Y }
            mousePositionFlipped = @{ x = $pt.X; y = $pt.Y }
            scaleFactor = $scale
            display = @{ scaleFactor = $scale; isPrimary = $true }
        }
        
        if ($rootHwnd -ne [IntPtr]::Zero) {
            $result.window = Get-WindowInfo $rootHwnd
        }
        
        $result | ConvertTo-Json -Depth 5
    }
    "windows" {
        $windows = @()
        $callback = [WinAPI+EnumWindowsProc]{
            param($hwnd, $lParam)
            if ([WinAPI]::IsWindowVisible($hwnd)) {
                $title = [WinAPI]::GetWindowTitle($hwnd)
                if ($title.Length -gt 0) {
                    $rect = New-Object RECT
                    [WinAPI]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
                    $w = $rect.Right - $rect.Left
                    $h = $rect.Bottom - $rect.Top
                    if ($w -gt 50 -and $h -gt 50) {
                        $script:windows += Get-WindowInfo $hwnd
                    }
                }
            }
            return $true
        }
        [WinAPI]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
        
        @{ windows = $windows } | ConvertTo-Json -Depth 5
    }
    "point" {
        $x = [double]$args[1]; $y = [double]$args[2]
        $pt = New-Object POINT
        $pt.X = [int]$x; $pt.Y = [int]$y
        $hwnd = [WinAPI]::WindowFromPoint($pt)
        $rootHwnd = [WinAPI]::GetAncestor($hwnd, 2)
        $scale = Get-DpiForPoint $pt.X $pt.Y
        
        $result = @{
            mousePosition = @{ x = $x; y = $y }
            mousePositionFlipped = @{ x = $x; y = $y }
            scaleFactor = $scale
            display = @{ scaleFactor = $scale; isPrimary = $true }
        }
        
        if ($rootHwnd -ne [IntPtr]::Zero) {
            $result.window = Get-WindowInfo $rootHwnd
        }
        
        $result | ConvertTo-Json -Depth 5
    }
}
