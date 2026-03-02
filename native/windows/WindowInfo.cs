// Native Windows window info + input hooks helper
// Compile: dotnet publish -c Release -r win-x64 --self-contained
// Usage: window-info.exe mouse|windows|point <x> <y>|serve|hooks|watch
// Output: JSON to stdout

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Concurrent;
using System.Threading;
using System.Windows.Automation;

namespace Ondoki.Native
{
    #region Win32 Structs

    [StructLayout(LayoutKind.Sequential)]
    struct POINT { public int X, Y; }

    [StructLayout(LayoutKind.Sequential)]
    struct RECT { public int Left, Top, Right, Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    struct GUITHREADINFO
    {
        public int cbSize;
        public int flags;
        public IntPtr hwndActive;
        public IntPtr hwndFocus;
        public IntPtr hwndCapture;
        public IntPtr hwndMenuOwner;
        public IntPtr hwndMoveSize;
        public IntPtr hwndCaret;
        public RECT rcCaret;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct MONITORINFO
    {
        public int cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public int dwFlags;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct MSLLHOOKSTRUCT
    {
        public POINT pt;
        public uint mouseData;
        public uint flags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct KBDLLHOOKSTRUCT
    {
        public uint vkCode;
        public uint scanCode;
        public uint flags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct MSG
    {
        public IntPtr hwnd;
        public uint message;
        public IntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public POINT pt;
    }

    #endregion

    #region Win32 Imports

    static class Win32
    {
        public delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);
        public delegate bool MonitorEnumProc(IntPtr hMonitor, IntPtr hdc, ref RECT rect, IntPtr lParam);
        public delegate IntPtr LowLevelHookProc(int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT pt);
        [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT pt);
        [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hwnd, uint gaFlags);
        [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, StringBuilder sb, int maxCount);
        [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hwnd);
        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
        [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
        [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
        [DllImport("user32.dll")] public static extern IntPtr MonitorFromPoint(POINT pt, uint dwFlags);
        [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO mi);
        [DllImport("user32.dll")] public static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr lprcClip, MonitorEnumProc lpfnEnum, IntPtr dwData);
        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint threadId, ref GUITHREADINFO info);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd, StringBuilder sb, int maxCount);
        [DllImport("user32.dll")] public static extern IntPtr RealChildWindowFromPoint(IntPtr hwnd, POINT pt);
        [DllImport("user32.dll")] public static extern short GetKeyState(int nVirtKey);

        // Hooks
        [DllImport("user32.dll")] public static extern IntPtr SetWindowsHookEx(int idHook, LowLevelHookProc lpfn, IntPtr hMod, uint dwThreadId);
        [DllImport("user32.dll")] public static extern bool UnhookWindowsHookEx(IntPtr hhk);
        [DllImport("user32.dll")] public static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr GetModuleHandle(string lpModuleName);

        // WinEvent hooks
        public delegate void WinEventDelegate(IntPtr hWinEventHook, uint eventType, IntPtr hwnd, int idObject, int idChild, uint dwEventThread, uint dwmsEventTime);
        [DllImport("user32.dll")] public static extern IntPtr SetWinEventHook(uint eventMin, uint eventMax, IntPtr hmodWinEventProc, WinEventDelegate lpfnWinEventProc, uint idProcess, uint idThread, uint dwFlags);
        [DllImport("user32.dll")] public static extern bool UnhookWinEvent(IntPtr hWinEventHook);

        // Message pump
        [DllImport("user32.dll")] public static extern int GetMessage(out MSG msg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);
        [DllImport("user32.dll")] public static extern bool TranslateMessage(ref MSG msg);
        [DllImport("user32.dll")] public static extern IntPtr DispatchMessage(ref MSG msg);

        // DPI
        [DllImport("shcore.dll", SetLastError = true)]
        public static extern int GetDpiForMonitor(IntPtr hMonitor, int dpiType, out uint dpiX, out uint dpiY);
        [DllImport("shcore.dll", SetLastError = true)]
        public static extern int SetProcessDpiAwareness(int awareness);
        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool SetProcessDPIAware();

        // GDI - Screen capture
        [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hwnd);
        [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);
        [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr hdc);
        [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int w, int h);
        [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr hdc, IntPtr obj);
        [DllImport("gdi32.dll")] public static extern bool BitBlt(IntPtr hdcDest, int xDest, int yDest, int w, int h, IntPtr hdcSrc, int xSrc, int ySrc, uint rop);
        [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr obj);
        [DllImport("gdi32.dll")] public static extern bool DeleteDC(IntPtr hdc);
        public const uint SRCCOPY = 0x00CC0020;

        // Accessibility
        [DllImport("oleacc.dll")]
        public static extern int AccessibleObjectFromPoint(POINT pt, [MarshalAs(UnmanagedType.Interface)] out IAccessible ppoleAcc, out object pvarChild);

        public const uint GA_ROOT = 2;
        public const uint MONITOR_DEFAULTTONEAREST = 2;

        public const int WH_MOUSE_LL = 14;
        public const int WH_KEYBOARD_LL = 13;
        public const int WM_LBUTTONDOWN = 0x0201;
        public const int WM_RBUTTONDOWN = 0x0204;
        public const int WM_MBUTTONDOWN = 0x0207;
        public const int WM_MOUSEWHEEL = 0x020A;
        public const int WM_KEYDOWN = 0x0100;
        public const int WM_SYSKEYDOWN = 0x0104;

        public const int VK_CONTROL = 0x11;
        public const int VK_SHIFT = 0x10;
        public const int VK_MENU = 0x12; // Alt
        public const int VK_LWIN = 0x5B;
        public const int VK_RWIN = 0x5C;

        // WinEvent constants
        public const uint EVENT_SYSTEM_FOREGROUND = 0x0003;
        public const uint EVENT_OBJECT_NAMECHANGE = 0x800C;
        public const uint WINEVENT_OUTOFCONTEXT = 0x0000;
    }

    [ComImport, Guid("618736e0-3c3d-11cf-810c-00aa00389b71"), InterfaceType(ComInterfaceType.InterfaceIsIDispatch)]
    interface IAccessible
    {
        [DispId(-5009)] int get_accChildCount(out int count);
        [DispId(-5000)] int get_accName(object varChild, [MarshalAs(UnmanagedType.BStr)] out string name);
        [DispId(-5004)] int get_accRole(object varChild, out object role);
        [DispId(-5003)] int get_accValue(object varChild, [MarshalAs(UnmanagedType.BStr)] out string value);
        [DispId(-5005)] int get_accDescription(object varChild, [MarshalAs(UnmanagedType.BStr)] out string desc);
    }

    #endregion

    #region JSON Builder

    class Json
    {
        static string Esc(string s)
        {
            if (s == null) return "null";
            return "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "\\r").Replace("\t", "\\t") + "\"";
        }

        public static string Obj(params (string key, string val)[] pairs)
        {
            var sb = new StringBuilder("{");
            for (int i = 0; i < pairs.Length; i++)
            {
                if (i > 0) sb.Append(",");
                sb.Append($"{Esc(pairs[i].key)}:{pairs[i].val}");
            }
            sb.Append("}");
            return sb.ToString();
        }

        public static string Num(double v) => v.ToString("G", System.Globalization.CultureInfo.InvariantCulture);
        public static string Num(int v) => v.ToString();
        public static string Num(long v) => v.ToString();
        public static string Bool(bool v) => v ? "true" : "false";
        public static string Str(string v) => Esc(v ?? "");
        public static string Null => "null";

        public static string Arr(IEnumerable<string> items)
        {
            var sb = new StringBuilder("[");
            bool first = true;
            foreach (var item in items)
            {
                if (!first) sb.Append(",");
                sb.Append(item);
                first = false;
            }
            sb.Append("]");
            return sb.ToString();
        }

        public static string StrArr(IEnumerable<string> items)
        {
            var escaped = new List<string>();
            foreach (var item in items) escaped.Add(Str(item));
            return Arr(escaped);
        }

        public static string Point(double x, double y) =>
            $"{{\"x\":{Num(x)},\"y\":{Num(y)}}}";

        public static string Rect(int x, int y, int w, int h) =>
            $"{{\"x\":{Num(x)},\"y\":{Num(y)},\"width\":{Num(w)},\"height\":{Num(h)}}}";

        public static string Window(long handle, string title, string ownerName, int ownerPID, int x, int y, int w, int h, bool visible) =>
            Obj(
                ("handle", Num(handle)),
                ("title", Str(title)),
                ("ownerName", Str(ownerName)),
                ("ownerPID", Num(ownerPID)),
                ("bounds", Rect(x, y, w, h)),
                ("isVisible", Bool(visible)),
                ("layer", Num(0))
            );

        public static string Element(string role, string title, string value, string description, string className,
            string roleDescription = "", string placeholder = "", string help = "", string automationId = "", bool nameFromParent = false) =>
            Obj(
                ("role", Str(role)),
                ("title", Str(title)),
                ("value", Str(value)),
                ("description", Str(description)),
                ("subrole", Str(className)),
                ("roleDescription", Str(roleDescription)),
                ("placeholder", Str(placeholder)),
                ("help", Str(help)),
                ("automationId", Str(automationId)),
                ("nameFromParent", nameFromParent ? "true" : "false")
            );
    }

    #endregion

    class Program
    {
        // ---- Screen capture ----
        static string captureDir = Path.Combine(Path.GetTempPath(), "ondoki-captures");

        static string CaptureDisplayAtPoint(int x, int y)
        {
            try
            {
                Directory.CreateDirectory(captureDir);
                POINT pt; pt.X = x; pt.Y = y;
                IntPtr hMonitor = Win32.MonitorFromPoint(pt, 2 /* MONITOR_DEFAULTTONEAREST */);
                MONITORINFO mi = new MONITORINFO();
                mi.cbSize = Marshal.SizeOf(mi);
                Win32.GetMonitorInfo(hMonitor, ref mi);

                int left = mi.rcMonitor.Left;
                int top = mi.rcMonitor.Top;
                int w = mi.rcMonitor.Right - left;
                int h = mi.rcMonitor.Bottom - top;

                IntPtr hdcScreen = Win32.GetDC(IntPtr.Zero);
                IntPtr hdcMem = Win32.CreateCompatibleDC(hdcScreen);
                IntPtr hBitmap = Win32.CreateCompatibleBitmap(hdcScreen, w, h);
                IntPtr hOld = Win32.SelectObject(hdcMem, hBitmap);
                Win32.BitBlt(hdcMem, 0, 0, w, h, hdcScreen, left, top, Win32.SRCCOPY);
                Win32.SelectObject(hdcMem, hOld);

                string path = Path.Combine(captureDir, $"cap_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}.png");
                using (var bmp = System.Drawing.Image.FromHbitmap(hBitmap))
                {
                    bmp.Save(path, System.Drawing.Imaging.ImageFormat.Png);
                }

                Win32.DeleteObject(hBitmap);
                Win32.DeleteDC(hdcMem);
                Win32.ReleaseDC(IntPtr.Zero, hdcScreen);
                return path;
            }
            catch
            {
                return null;
            }
        }

        // ---- Helpers ----

        static string GetWindowTitle(IntPtr hwnd)
        {
            int len = Win32.GetWindowTextLength(hwnd);
            if (len == 0) return "";
            var sb = new StringBuilder(len + 1);
            Win32.GetWindowText(hwnd, sb, sb.Capacity);
            return sb.ToString();
        }

        static string GetClassName(IntPtr hwnd)
        {
            var sb = new StringBuilder(256);
            Win32.GetClassName(hwnd, sb, sb.Capacity);
            return sb.ToString();
        }

        static (uint pid, string processName) GetProcessInfo(IntPtr hwnd)
        {
            Win32.GetWindowThreadProcessId(hwnd, out uint pid);
            try
            {
                var proc = Process.GetProcessById((int)pid);
                return (pid, proc.ProcessName);
            }
            catch { return (pid, ""); }
        }

        static double GetScaleForPoint(int x, int y)
        {
            var pt = new POINT { X = x, Y = y };
            var hMonitor = Win32.MonitorFromPoint(pt, Win32.MONITOR_DEFAULTTONEAREST);
            try
            {
                Win32.GetDpiForMonitor(hMonitor, 0, out uint dpiX, out uint _);
                return dpiX / 96.0;
            }
            catch { return 1.0; }
        }

        struct DisplayData
        {
            public RECT Bounds;
            public double Scale;
            public bool IsPrimary;
        }

        static List<DisplayData> GetDisplays()
        {
            var displays = new List<DisplayData>();
            Win32.EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr hMon, IntPtr hdc, ref RECT rect, IntPtr data) =>
            {
                var mi = new MONITORINFO { cbSize = Marshal.SizeOf<MONITORINFO>() };
                Win32.GetMonitorInfo(hMon, ref mi);
                double scale = 1.0;
                try { Win32.GetDpiForMonitor(hMon, 0, out uint dpiX, out uint _); scale = dpiX / 96.0; } catch { }
                displays.Add(new DisplayData
                {
                    Bounds = mi.rcMonitor,
                    Scale = scale,
                    IsPrimary = (mi.dwFlags & 1) != 0
                });
                return true;
            }, IntPtr.Zero);
            return displays;
        }

        static string GetElementViaUIA(int x, int y)
        {
            try
            {
                var point = new System.Windows.Point(x, y);
                var el = AutomationElement.FromPoint(point);
                if (el == null) return null;

                string name = el.Current.Name ?? "";
                string controlType = el.Current.ControlType?.ProgrammaticName?.Replace("ControlType.", "") ?? "";
                string helpText = "";
                try { helpText = el.Current.HelpText ?? ""; } catch { }
                string className = el.Current.ClassName ?? "";
                string automationId = el.Current.AutomationId ?? "";

                // Try ValuePattern for value
                string value = "";
                try
                {
                    if (el.TryGetCurrentPattern(ValuePattern.Pattern, out object pattern))
                    {
                        value = ((ValuePattern)pattern).Current.Value ?? "";
                        if (value.Length > 200) value = value.Substring(0, 200);
                    }
                }
                catch { }

                // If name is empty, walk up parents (max 8) to find one with a name
                bool nameFromParent = false;
                if (string.IsNullOrEmpty(name))
                {
                    var walker = TreeWalker.ControlViewWalker;
                    var current = el;
                    for (int i = 0; i < 8; i++)
                    {
                        current = walker.GetParent(current);
                        if (current == null || current == AutomationElement.RootElement) break;
                        string parentName = current.Current.Name ?? "";
                        if (!string.IsNullOrEmpty(parentName))
                        {
                            name = parentName;
                            nameFromParent = true;
                            break;
                        }
                    }
                }

                return Json.Element(
                    controlType,
                    name,
                    value,
                    "",
                    className,
                    controlType,
                    "",
                    helpText,
                    automationId,
                    nameFromParent
                );
            }
            catch
            {
                return null;
            }
        }

        static string GetElementJson(int x, int y, IntPtr rootHwnd)
        {
            // Try UIA first — richer data
            string uiaResult = GetElementViaUIA(x, y);
            if (uiaResult != null) return uiaResult;

            // Fall back to MSAA
            var pt = new POINT { X = x, Y = y };
            try
            {
                int hr = Win32.AccessibleObjectFromPoint(pt, out IAccessible acc, out object childVar);
                if (hr != 0 || acc == null) return Json.Null;

                string name = "", role = "", value = "", desc = "";
                try { acc.get_accName(childVar, out name); } catch { }
                try
                {
                    acc.get_accRole(childVar, out object roleObj);
                    if (roleObj is int roleInt) role = RoleName(roleInt);
                    else if (roleObj is string roleStr) role = roleStr;
                }
                catch { }
                try { acc.get_accValue(childVar, out value); } catch { }
                try { acc.get_accDescription(childVar, out desc); } catch { }

                var childHwnd = Win32.RealChildWindowFromPoint(rootHwnd, pt);
                string className = childHwnd != IntPtr.Zero ? GetClassName(childHwnd) : "";

                return Json.Element(
                    role ?? "",
                    name ?? "",
                    (value ?? "").Length > 200 ? (value ?? "").Substring(0, 200) : value ?? "",
                    desc ?? "",
                    className ?? ""
                );
            }
            catch { return Json.Null; }
        }

        static string RoleName(int role)
        {
            switch (role)
            {
                case 0x09: return "Window";
                case 0x0A: return "Client";
                case 0x0B: return "MenuPopup";
                case 0x0C: return "MenuItem";
                case 0x0D: return "Tooltip";
                case 0x0E: return "Application";
                case 0x0F: return "Document";
                case 0x10: return "Pane";
                case 0x11: return "Chart";
                case 0x12: return "Dialog";
                case 0x13: return "Border";
                case 0x14: return "Grouping";
                case 0x15: return "Separator";
                case 0x16: return "Toolbar";
                case 0x17: return "StatusBar";
                case 0x18: return "Table";
                case 0x19: return "ColumnHeader";
                case 0x1A: return "RowHeader";
                case 0x1B: return "Column";
                case 0x1C: return "Row";
                case 0x1D: return "Cell";
                case 0x1E: return "Link";
                case 0x1F: return "HelpBalloon";
                case 0x21: return "List";
                case 0x22: return "ListItem";
                case 0x23: return "Outline";
                case 0x24: return "OutlineItem";
                case 0x25: return "PageTab";
                case 0x26: return "PropertyPage";
                case 0x27: return "Indicator";
                case 0x28: return "Graphic";
                case 0x29: return "StaticText";
                case 0x2A: return "Text";
                case 0x2B: return "Button";
                case 0x2C: return "CheckBox";
                case 0x2D: return "RadioButton";
                case 0x2E: return "ComboBox";
                case 0x2F: return "DropList";
                case 0x30: return "ProgressBar";
                case 0x31: return "Dial";
                case 0x32: return "HotkeyField";
                case 0x33: return "Slider";
                case 0x34: return "SpinButton";
                case 0x35: return "Diagram";
                case 0x36: return "Animation";
                case 0x37: return "Equation";
                case 0x38: return "ButtonDropdown";
                case 0x39: return "ButtonMenu";
                case 0x3A: return "ButtonDropdownGrid";
                case 0x3B: return "Whitespace";
                case 0x3C: return "PageTabList";
                case 0x3D: return "Clock";
                case 0x3E: return "SplitButton";
                case 0x3F: return "IPAddress";
                case 0x40: return "TitleBar";
                default: return $"Role_{role}";
            }
        }

        static string BuildWindowJson(IntPtr hwnd)
        {
            Win32.GetWindowRect(hwnd, out RECT rect);
            var (pid, procName) = GetProcessInfo(hwnd);
            string title = GetWindowTitle(hwnd);
            bool visible = Win32.IsWindowVisible(hwnd);

            return Json.Window(
                hwnd.ToInt64(), title, procName, (int)pid,
                rect.Left, rect.Top, rect.Right - rect.Left, rect.Bottom - rect.Top,
                visible
            );
        }

        /// Build window JSON for a given screen point
        static string BuildWindowJsonAtPoint(POINT pt)
        {
            var hwnd = Win32.WindowFromPoint(pt);
            var rootHwnd = Win32.GetAncestor(hwnd, Win32.GA_ROOT);
            return rootHwnd != IntPtr.Zero ? BuildWindowJson(rootHwnd) : Json.Null;
        }

        /// Build element JSON for a given screen point
        static string BuildElementJsonAtPoint(POINT pt)
        {
            var hwnd = Win32.WindowFromPoint(pt);
            var rootHwnd = Win32.GetAncestor(hwnd, Win32.GA_ROOT);
            return rootHwnd != IntPtr.Zero ? GetElementJson(pt.X, pt.Y, rootHwnd) : Json.Null;
        }

        // ---- Commands ----

        static void HandleMouse()
        {
            Win32.GetCursorPos(out POINT pt);
            double scale = GetScaleForPoint(pt.X, pt.Y);
            string windowJson = BuildWindowJsonAtPoint(pt);
            string elementJson = BuildElementJsonAtPoint(pt);

            Console.WriteLine(Json.Obj(
                ("mousePosition", Json.Point(pt.X, pt.Y)),
                ("mousePositionFlipped", Json.Point(pt.X, pt.Y)),
                ("scaleFactor", Json.Num(scale)),
                ("display", Json.Obj(("scaleFactor", Json.Num(scale)), ("isPrimary", Json.Bool(true)))),
                ("window", windowJson),
                ("element", elementJson)
            ));
        }

        static void HandleWindows()
        {
            var windowJsons = new List<string>();
            Win32.EnumWindows((hwnd, _) =>
            {
                if (!Win32.IsWindowVisible(hwnd)) return true;
                string title = GetWindowTitle(hwnd);
                if (string.IsNullOrEmpty(title)) return true;
                Win32.GetWindowRect(hwnd, out RECT rect);
                int w = rect.Right - rect.Left;
                int h = rect.Bottom - rect.Top;
                if (w < 50 || h < 50) return true;
                windowJsons.Add(BuildWindowJson(hwnd));
                return true;
            }, IntPtr.Zero);

            var displayJsons = new List<string>();
            foreach (var d in GetDisplays())
            {
                displayJsons.Add(Json.Obj(
                    ("id", Json.Num(displayJsons.Count)),
                    ("bounds", Json.Rect(d.Bounds.Left, d.Bounds.Top, d.Bounds.Right - d.Bounds.Left, d.Bounds.Bottom - d.Bounds.Top)),
                    ("scaleFactor", Json.Num(d.Scale)),
                    ("isPrimary", Json.Bool(d.IsPrimary))
                ));
            }

            Console.WriteLine(Json.Obj(
                ("windows", Json.Arr(windowJsons)),
                ("displays", Json.Arr(displayJsons))
            ));
        }

        static void HandlePoint(double x, double y)
        {
            var pt = new POINT { X = (int)x, Y = (int)y };
            double scale = GetScaleForPoint(pt.X, pt.Y);
            string windowJson = BuildWindowJsonAtPoint(pt);
            string elementJson = BuildElementJsonAtPoint(pt);

            Console.WriteLine(Json.Obj(
                ("mousePosition", Json.Point(x, y)),
                ("mousePositionFlipped", Json.Point(x, y)),
                ("scaleFactor", Json.Num(scale)),
                ("display", Json.Obj(("scaleFactor", Json.Num(scale)), ("isPrimary", Json.Bool(true)))),
                ("window", windowJson),
                ("element", elementJson)
            ));
        }

        static void HandleServe()
        {
            string line;
            while ((line = Console.ReadLine()) != null)
            {
                if (string.IsNullOrWhiteSpace(line)) continue;

                int id = 0;
                string cmd = "";
                double argX = 0, argY = 0;
                bool hasX = false, hasY = false;

                try
                {
                    id = ExtractInt(line, "\"id\"");
                    cmd = ExtractString(line, "\"cmd\"");
                    int argsIdx = line.IndexOf("\"args\"");
                    if (argsIdx >= 0)
                    {
                        string argsSection = line.Substring(argsIdx);
                        hasX = TryExtractDouble(argsSection, "\"x\"", out argX);
                        hasY = TryExtractDouble(argsSection, "\"y\"", out argY);
                    }
                }
                catch
                {
                    Console.WriteLine("{\"id\":0,\"error\":\"invalid JSON\"}");
                    Console.Out.Flush();
                    continue;
                }

                try
                {
                    var sw = new System.IO.StringWriter();
                    var origOut = Console.Out;
                    Console.SetOut(sw);

                    switch (cmd.ToLower())
                    {
                        case "mouse": HandleMouse(); break;
                        case "windows": HandleWindows(); break;
                        case "point":
                            if (hasX && hasY) HandlePoint(argX, argY);
                            else
                            {
                                Console.SetOut(origOut);
                                Console.WriteLine($"{{\"id\":{id},\"error\":\"point requires args.x and args.y\"}}");
                                Console.Out.Flush();
                                continue;
                            }
                            break;
                        default:
                            Console.SetOut(origOut);
                            Console.WriteLine($"{{\"id\":{id},\"error\":\"unknown command: {cmd}\"}}");
                            Console.Out.Flush();
                            continue;
                    }

                    Console.SetOut(origOut);
                    string result = sw.ToString().Trim();
                    Console.WriteLine($"{{\"id\":{id},\"result\":{result}}}");
                    Console.Out.Flush();
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"{{\"id\":{id},\"error\":\"{ex.Message.Replace("\"", "\\\"")}\"}}");
                    Console.Out.Flush();
                }
            }
        }

        // ---- Hooks mode ----

        static readonly object _writeLock = new object();

        static void WriteEvent(string json)
        {
            lock (_writeLock)
            {
                Console.WriteLine(json);
                Console.Out.Flush();
            }
        }

        // ---- Background element detection (avoids UIA deadlock in hook callback) ----

        struct ClickQueueItem
        {
            public POINT pt;
            public int button;
            public string windowJson;
            public string screenshotPath;
            public string monBoundsJson;
            public double scale;
            public long ts;
            public IntPtr rootHwnd;
        }

        static readonly ConcurrentQueue<ClickQueueItem> _clickQueue = new ConcurrentQueue<ClickQueueItem>();
        static readonly AutoResetEvent _clickSignal = new AutoResetEvent(false);
        static volatile bool _hooksRunning;
        static Thread _elementThread;

        static void ElementDetectionWorker()
        {
            while (_hooksRunning)
            {
                _clickSignal.WaitOne(200);
                while (_clickQueue.TryDequeue(out ClickQueueItem item))
                {
                    string elementJson;
                    try
                    {
                        elementJson = item.rootHwnd != IntPtr.Zero
                            ? GetElementJson(item.pt.X, item.pt.Y, item.rootHwnd)
                            : Json.Null;
                    }
                    catch
                    {
                        elementJson = Json.Null;
                    }

                    string screenshotJson = item.screenshotPath != null ? Json.Str(item.screenshotPath) : "null";
                    WriteEvent(Json.Obj(
                        ("type", Json.Str("click")),
                        ("x", Json.Num(item.pt.X)),
                        ("y", Json.Num(item.pt.Y)),
                        ("button", Json.Num(item.button)),
                        ("window", item.windowJson),
                        ("element", elementJson),
                        ("scale", Json.Num(item.scale)),
                        ("monitorBounds", item.monBoundsJson),
                        ("timestamp", Json.Num(item.ts)),
                        ("screenshotPath", screenshotJson)
                    ));
                }
            }
        }

        static List<string> GetModifiers()
        {
            var mods = new List<string>();
            if ((Win32.GetKeyState(Win32.VK_CONTROL) & 0x8000) != 0) mods.Add("ctrl");
            if ((Win32.GetKeyState(Win32.VK_SHIFT) & 0x8000) != 0) mods.Add("shift");
            if ((Win32.GetKeyState(Win32.VK_MENU) & 0x8000) != 0) mods.Add("alt");
            if ((Win32.GetKeyState(Win32.VK_LWIN) & 0x8000) != 0 || (Win32.GetKeyState(Win32.VK_RWIN) & 0x8000) != 0) mods.Add("meta");
            return mods;
        }

        static long GetTimestampMs()
        {
            return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        }

        // Must hold references to prevent GC
        static Win32.LowLevelHookProc _mouseProc;
        static Win32.LowLevelHookProc _keyboardProc;

        static IntPtr MouseHookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0)
            {
                int msg = wParam.ToInt32();
                var hookStruct = Marshal.PtrToStructure<MSLLHOOKSTRUCT>(lParam);
                var pt = hookStruct.pt;
                double scale = GetScaleForPoint(pt.X, pt.Y);
                long ts = GetTimestampMs();

                if (msg == Win32.WM_LBUTTONDOWN || msg == Win32.WM_RBUTTONDOWN || msg == Win32.WM_MBUTTONDOWN)
                {
                    // Capture screenshot FIRST — synchronous BitBlt before anything else
                    // BitBlt is GDI and safe to call from the hook callback
                    string screenshotPath = CaptureDisplayAtPoint(pt.X, pt.Y);

                    int button = msg == Win32.WM_LBUTTONDOWN ? 1 : msg == Win32.WM_RBUTTONDOWN ? 2 : 3;

                    // Collect all NON-UIA data (pure Win32/GDI calls — safe from hook)
                    var hwnd = Win32.WindowFromPoint(pt);
                    var rootHwnd = Win32.GetAncestor(hwnd, Win32.GA_ROOT);
                    string windowJson = rootHwnd != IntPtr.Zero ? BuildWindowJson(rootHwnd) : Json.Null;

                    var hMonitor = Win32.MonitorFromPoint(pt, Win32.MONITOR_DEFAULTTONEAREST);
                    var monInfo = new MONITORINFO { cbSize = Marshal.SizeOf<MONITORINFO>() };
                    Win32.GetMonitorInfo(hMonitor, ref monInfo);
                    var mr = monInfo.rcMonitor;
                    string monBoundsJson = Json.Rect(mr.Left, mr.Top, mr.Right - mr.Left, mr.Bottom - mr.Top);

                    // Enqueue for background element detection (UIA uses COM cross-process
                    // calls that DEADLOCK when called from within WH_MOUSE_LL)
                    _clickQueue.Enqueue(new ClickQueueItem
                    {
                        pt = pt,
                        button = button,
                        windowJson = windowJson,
                        screenshotPath = screenshotPath,
                        monBoundsJson = monBoundsJson,
                        scale = scale,
                        ts = ts,
                        rootHwnd = rootHwnd
                    });
                    _clickSignal.Set();
                }
                else if (msg == Win32.WM_MOUSEWHEEL)
                {
                    // Scroll delta is in high word of mouseData, signed
                    short delta = (short)(hookStruct.mouseData >> 16);
                    double deltaY = delta / 120.0; // 120 = WHEEL_DELTA

                    // For scroll, get cursor position (hookStruct.pt is screen coords)
                    string windowJson = BuildWindowJsonAtPoint(pt);

                    WriteEvent(Json.Obj(
                        ("type", Json.Str("scroll")),
                        ("x", Json.Num(pt.X)),
                        ("y", Json.Num(pt.Y)),
                        ("deltaX", Json.Num(0)),
                        ("deltaY", Json.Num(deltaY)),
                        ("window", windowJson),
                        ("timestamp", Json.Num(ts))
                    ));
                }
            }

            return Win32.CallNextHookEx(IntPtr.Zero, nCode, wParam, lParam);
        }

        static IntPtr KeyboardHookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0)
            {
                int msg = wParam.ToInt32();
                if (msg == Win32.WM_KEYDOWN || msg == Win32.WM_SYSKEYDOWN)
                {
                    var hookStruct = Marshal.PtrToStructure<KBDLLHOOKSTRUCT>(lParam);
                    var mods = GetModifiers();
                    long ts = GetTimestampMs();

                    // Get foreground window for keyboard events
                    var fgHwnd = Win32.GetForegroundWindow();
                    string windowJson = fgHwnd != IntPtr.Zero ? BuildWindowJson(fgHwnd) : Json.Null;

                    WriteEvent(Json.Obj(
                        ("type", Json.Str("key")),
                        ("keycode", Json.Num((int)hookStruct.vkCode)),
                        ("scancode", Json.Num((int)hookStruct.scanCode)),
                        ("modifiers", Json.StrArr(mods)),
                        ("window", windowJson),
                        ("timestamp", Json.Num(ts))
                    ));
                }
            }

            return Win32.CallNextHookEx(IntPtr.Zero, nCode, wParam, lParam);
        }

        static void HandleHooks()
        {
            _mouseProc = MouseHookCallback;
            _keyboardProc = KeyboardHookCallback;

            var moduleHandle = Win32.GetModuleHandle(null);

            var mouseHook = Win32.SetWindowsHookEx(Win32.WH_MOUSE_LL, _mouseProc, moduleHandle, 0);
            if (mouseHook == IntPtr.Zero)
            {
                Console.Error.WriteLine("Failed to install mouse hook");
                Environment.Exit(1);
            }

            var keyboardHook = Win32.SetWindowsHookEx(Win32.WH_KEYBOARD_LL, _keyboardProc, moduleHandle, 0);
            if (keyboardHook == IntPtr.Zero)
            {
                Win32.UnhookWindowsHookEx(mouseHook);
                Console.Error.WriteLine("Failed to install keyboard hook");
                Environment.Exit(1);
            }

            // Start background thread for UIA element detection
            _hooksRunning = true;
            _elementThread = new Thread(ElementDetectionWorker)
            {
                IsBackground = true,
                Name = "UIA-ElementDetection"
            };
            _elementThread.Start();

            // Send ready message — coords are in physical pixel space (DPI aware)
            WriteEvent(Json.Obj(
                ("type", Json.Str("ready")),
                ("platform", Json.Str("win32")),
                ("coordSpace", Json.Str("physical"))
            ));

            // Send physical display bounds so Electron can map physical→logical coords
            var nativeDisplays = GetDisplays();
            var dispJsonList = new List<string>();
            foreach (var d in nativeDisplays)
            {
                dispJsonList.Add(Json.Obj(
                    ("bounds", Json.Rect(d.Bounds.Left, d.Bounds.Top,
                        d.Bounds.Right - d.Bounds.Left, d.Bounds.Bottom - d.Bounds.Top)),
                    ("scaleFactor", Json.Num(d.Scale)),
                    ("isPrimary", Json.Bool(d.IsPrimary))
                ));
            }
            WriteEvent(Json.Obj(
                ("type", Json.Str("displays")),
                ("displays", Json.Arr(dispJsonList))
            ));

            // Message pump — required for low-level hooks to work
            while (Win32.GetMessage(out MSG msg, IntPtr.Zero, 0, 0) > 0)
            {
                Win32.TranslateMessage(ref msg);
                Win32.DispatchMessage(ref msg);
            }

            // Shut down background element detection thread
            _hooksRunning = false;
            _clickSignal.Set();
            _elementThread.Join(2000);

            Win32.UnhookWindowsHookEx(mouseHook);
            Win32.UnhookWindowsHookEx(keyboardHook);
        }

        // ---- Watch mode ----

        // Must hold reference to prevent GC
        static Win32.WinEventDelegate _watchEventProc;

        static string _lastWatchApp = "";
        static string _lastWatchTitle = "";
        static int _selfPid = Process.GetCurrentProcess().Id;

        static string GetProcessDescription(int pid)
        {
            try
            {
                var proc = Process.GetProcessById(pid);
                try
                {
                    var desc = proc.MainModule.FileVersionInfo.FileDescription;
                    if (!string.IsNullOrWhiteSpace(desc)) return desc;
                }
                catch { }
                return proc.ProcessName;
            }
            catch { return ""; }
        }

        static void WatchEventCallback(IntPtr hWinEventHook, uint eventType, IntPtr hwnd, int idObject, int idChild, uint dwEventThread, uint dwmsEventTime)
        {
            try
            {
                var fgHwnd = Win32.GetForegroundWindow();
                if (fgHwnd == IntPtr.Zero) return;

                string title = GetWindowTitle(fgHwnd);
                var (pid, processName) = GetProcessInfo(fgHwnd);

                // Skip self
                if ((int)pid == _selfPid) return;

                // For name-change events, only care about the foreground window
                if (eventType == Win32.EVENT_OBJECT_NAMECHANGE && hwnd != fgHwnd) return;

                string app = GetProcessDescription((int)pid);
                if (string.IsNullOrEmpty(app)) app = processName;
                if (string.IsNullOrEmpty(app)) return;

                // Dedup
                if (app == _lastWatchApp && title == _lastWatchTitle) return;
                _lastWatchApp = app;
                _lastWatchTitle = title;

                WriteEvent(Json.Obj(
                    ("type", Json.Str("change")),
                    ("app", Json.Str(app)),
                    ("title", Json.Str(title)),
                    ("pid", Json.Num((int)pid))
                ));
            }
            catch { }
        }

        static void HandleWatch()
        {
            _watchEventProc = WatchEventCallback;

            // Hook foreground window changes
            var fgHook = Win32.SetWinEventHook(
                Win32.EVENT_SYSTEM_FOREGROUND, Win32.EVENT_SYSTEM_FOREGROUND,
                IntPtr.Zero, _watchEventProc, 0, 0, Win32.WINEVENT_OUTOFCONTEXT);

            // Hook title/name changes (e.g. browser tab navigation)
            var nameHook = Win32.SetWinEventHook(
                Win32.EVENT_OBJECT_NAMECHANGE, Win32.EVENT_OBJECT_NAMECHANGE,
                IntPtr.Zero, _watchEventProc, 0, 0, Win32.WINEVENT_OUTOFCONTEXT);

            if (fgHook == IntPtr.Zero || nameHook == IntPtr.Zero)
            {
                Console.Error.WriteLine("Failed to install WinEvent hooks");
                Environment.Exit(1);
            }

            // Ready
            WriteEvent(Json.Obj(("type", Json.Str("ready"))));

            // Emit initial state
            _watchEventProc(IntPtr.Zero, Win32.EVENT_SYSTEM_FOREGROUND, Win32.GetForegroundWindow(), 0, 0, 0, 0);

            // Message pump
            while (Win32.GetMessage(out MSG msg, IntPtr.Zero, 0, 0) > 0)
            {
                Win32.TranslateMessage(ref msg);
                Win32.DispatchMessage(ref msg);
            }

            Win32.UnhookWinEvent(fgHook);
            Win32.UnhookWinEvent(nameHook);
        }

        // ---- Utilities ----

        static int ExtractInt(string json, string key)
        {
            int idx = json.IndexOf(key);
            if (idx < 0) return 0;
            idx = json.IndexOf(':', idx) + 1;
            string sub = json.Substring(idx).TrimStart();
            int end = 0;
            while (end < sub.Length && (char.IsDigit(sub[end]) || sub[end] == '-')) end++;
            return int.Parse(sub.Substring(0, end));
        }

        static string ExtractString(string json, string key)
        {
            int idx = json.IndexOf(key);
            if (idx < 0) return "";
            idx = json.IndexOf(':', idx) + 1;
            string sub = json.Substring(idx).TrimStart();
            if (sub.Length < 2 || sub[0] != '"') return "";
            int end = sub.IndexOf('"', 1);
            return sub.Substring(1, end - 1);
        }

        static bool TryExtractDouble(string json, string key, out double value)
        {
            value = 0;
            int idx = json.IndexOf(key);
            if (idx < 0) return false;
            idx = json.IndexOf(':', idx) + 1;
            string sub = json.Substring(idx).TrimStart();
            int end = 0;
            while (end < sub.Length && (char.IsDigit(sub[end]) || sub[end] == '.' || sub[end] == '-')) end++;
            return double.TryParse(sub.Substring(0, end), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out value);
        }

        // ---- Main ----

        static int Main(string[] args)
        {
            // Per-Monitor DPI Aware
            try { Win32.SetProcessDpiAwareness(2); }
            catch { try { Win32.SetProcessDPIAware(); } catch { } }

            if (args.Length < 1)
            {
                Console.Error.WriteLine("Usage: window-info mouse|windows|point <x> <y>|serve|hooks|watch");
                return 1;
            }

            try
            {
                switch (args[0].ToLower())
                {
                    case "mouse": HandleMouse(); break;
                    case "windows": HandleWindows(); break;
                    case "serve": HandleServe(); break;
                    case "hooks": HandleHooks(); break;
                    case "watch": HandleWatch(); break;
                    case "point":
                        if (args.Length < 3 || !double.TryParse(args[1], out double px) || !double.TryParse(args[2], out double py))
                        {
                            Console.Error.WriteLine("Usage: window-info point <x> <y>");
                            return 1;
                        }
                        HandlePoint(px, py);
                        break;
                    default:
                        Console.Error.WriteLine($"Unknown command: {args[0]}");
                        return 1;
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Error: {ex.Message}");
                return 1;
            }

            return 0;
        }
    }
}
