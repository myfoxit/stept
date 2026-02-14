// Native Windows window info helper
// Compile: csc /optimize /out:window-info.exe WindowInfo.cs
// Or: dotnet build -c Release
// Usage: window-info.exe mouse|windows|point <x> <y>
// Output: JSON to stdout

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

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

    #endregion

    #region Win32 Imports

    static class Win32
    {
        public delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);
        public delegate bool MonitorEnumProc(IntPtr hMonitor, IntPtr hdc, ref RECT rect, IntPtr lParam);

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

        // DPI awareness (Windows 8.1+)
        [DllImport("shcore.dll", SetLastError = true)]
        public static extern int GetDpiForMonitor(IntPtr hMonitor, int dpiType, out uint dpiX, out uint dpiY);

        // DPI awareness (Windows 10 1607+)
        [DllImport("user32.dll", SetLastError = true)]
        public static extern uint GetDpiForWindow(IntPtr hwnd);

        // UI Automation COM
        [DllImport("oleacc.dll")]
        public static extern int AccessibleObjectFromPoint(POINT pt, [MarshalAs(UnmanagedType.Interface)] out IAccessible ppoleAcc, out object pvarChild);

        [DllImport("oleacc.dll")]
        public static extern int AccessibleObjectFromWindow(IntPtr hwnd, uint objId, ref Guid riid, [MarshalAs(UnmanagedType.Interface)] out IAccessible ppoleAcc);

        public const uint GA_ROOT = 2;
        public const uint MONITOR_DEFAULTTONEAREST = 2;
        public const uint OBJID_WINDOW = 0x00000000;
    }

    // IAccessible COM interface (MSAA)
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

    #region JSON Builder (zero-dependency)

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
                sb.Append($"\n  {Esc(pairs[i].key)}: {pairs[i].val}");
            }
            sb.Append("\n}");
            return sb.ToString();
        }

        public static string Num(double v) => v.ToString("G");
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
                sb.Append("\n  " + item);
                first = false;
            }
            sb.Append("\n]");
            return sb.ToString();
        }

        public static string Point(double x, double y) =>
            $"{{ \"x\": {Num(x)}, \"y\": {Num(y)} }}";

        public static string Rect(int x, int y, int w, int h) =>
            $"{{ \"x\": {Num(x)}, \"y\": {Num(y)}, \"width\": {Num(w)}, \"height\": {Num(h)} }}";

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

        public static string Element(string role, string title, string value, string description, string className) =>
            Obj(
                ("role", Str(role)),
                ("title", Str(title)),
                ("value", Str(value)),
                ("description", Str(description)),
                ("subrole", Str(className))
            );
    }

    #endregion

    class Program
    {
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

        static string GetElementJson(int x, int y, IntPtr rootHwnd)
        {
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

                // Get class name of the child control
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
            // Common MSAA roles
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

        // ---- Commands ----

        static void HandleMouse()
        {
            Win32.GetCursorPos(out POINT pt);
            var hwnd = Win32.WindowFromPoint(pt);
            var rootHwnd = Win32.GetAncestor(hwnd, Win32.GA_ROOT);
            double scale = GetScaleForPoint(pt.X, pt.Y);

            string windowJson = rootHwnd != IntPtr.Zero ? BuildWindowJson(rootHwnd) : Json.Null;
            string elementJson = rootHwnd != IntPtr.Zero ? GetElementJson(pt.X, pt.Y, rootHwnd) : Json.Null;

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
            var hwnd = Win32.WindowFromPoint(pt);
            var rootHwnd = Win32.GetAncestor(hwnd, Win32.GA_ROOT);
            double scale = GetScaleForPoint(pt.X, pt.Y);

            string windowJson = rootHwnd != IntPtr.Zero ? BuildWindowJson(rootHwnd) : Json.Null;
            string elementJson = rootHwnd != IntPtr.Zero ? GetElementJson(pt.X, pt.Y, rootHwnd) : Json.Null;

            Console.WriteLine(Json.Obj(
                ("mousePosition", Json.Point(x, y)),
                ("mousePositionFlipped", Json.Point(x, y)),
                ("scaleFactor", Json.Num(scale)),
                ("display", Json.Obj(("scaleFactor", Json.Num(scale)), ("isPrimary", Json.Bool(true)))),
                ("window", windowJson),
                ("element", elementJson)
            ));
        }

        static int Main(string[] args)
        {
            if (args.Length < 1)
            {
                Console.Error.WriteLine("Usage: window-info mouse|windows|point <x> <y>");
                return 1;
            }

            try
            {
                switch (args[0].ToLower())
                {
                    case "mouse": HandleMouse(); break;
                    case "windows": HandleWindows(); break;
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
