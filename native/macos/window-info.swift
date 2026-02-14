// Native macOS window info helper
// Compiled: swiftc -O -o window-info window-info.swift -framework AppKit -framework CoreGraphics -framework ApplicationServices
// Usage: window-info mouse          → returns mouse position + window under cursor + element info
//        window-info windows        → returns all visible windows
//        window-info window <pid>   → returns specific window info
// Output: JSON to stdout

import AppKit
import CoreGraphics
import Foundation

struct Point: Codable {
    let x: Double
    let y: Double
}

struct Rect: Codable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

struct DisplayInfo: Codable {
    let id: UInt32
    let bounds: Rect
    let scaleFactor: Double
    let isPrimary: Bool
}

struct WindowResult: Codable {
    let handle: Int
    let title: String
    let ownerName: String
    let ownerPID: Int
    let bounds: Rect
    let isVisible: Bool
    let layer: Int
}

struct ElementInfo: Codable {
    let role: String
    let title: String
    let value: String
    let description: String
    let subrole: String
}

struct MouseResult: Codable {
    let mousePosition: Point
    let mousePositionFlipped: Point  // Screen coords (top-left origin)
    let display: DisplayInfo
    let scaleFactor: Double
    let window: WindowResult?
    let element: ElementInfo?
}

struct WindowsResult: Codable {
    let windows: [WindowResult]
    let displays: [DisplayInfo]
}

// MARK: - Helpers

func getDisplays() -> [DisplayInfo] {
    let maxDisplays: UInt32 = 16
    var displayIDs = [CGDirectDisplayID](repeating: 0, count: Int(maxDisplays))
    var displayCount: UInt32 = 0
    CGGetActiveDisplayList(maxDisplays, &displayIDs, &displayCount)
    
    let primaryID = CGMainDisplayID()
    
    return (0..<Int(displayCount)).map { i in
        let id = displayIDs[i]
        let bounds = CGDisplayBounds(id)
        let nsScreen = NSScreen.screens.first { screen in
            let screenNumber = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? UInt32
            return screenNumber == id
        }
        let scale = nsScreen?.backingScaleFactor ?? 1.0
        
        return DisplayInfo(
            id: id,
            bounds: Rect(x: bounds.origin.x, y: bounds.origin.y, width: bounds.size.width, height: bounds.size.height),
            scaleFactor: scale,
            isPrimary: id == primaryID
        )
    }
}

func getWindowList() -> [WindowResult] {
    guard let windowList = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else {
        return []
    }
    
    return windowList.compactMap { info in
        guard let windowID = info[kCGWindowNumber as String] as? Int,
              let layer = info[kCGWindowLayer as String] as? Int,
              let boundsDict = info[kCGWindowBounds as String] as? [String: Double],
              let bx = boundsDict["X"], let by = boundsDict["Y"],
              let bw = boundsDict["Width"], let bh = boundsDict["Height"],
              bw > 0, bh > 0 else {
            return nil
        }
        
        let title = info[kCGWindowName as String] as? String ?? ""
        let ownerName = info[kCGWindowOwnerName as String] as? String ?? ""
        let ownerPID = info[kCGWindowOwnerPID as String] as? Int ?? 0
        let isOnScreen = info[kCGWindowIsOnscreen as String] as? Bool ?? false
        
        // Skip system UI elements and tiny windows
        if layer != 0 { return nil }
        if ownerName == "Window Server" { return nil }
        if bw < 50 || bh < 50 { return nil }
        
        return WindowResult(
            handle: windowID,
            title: title.isEmpty ? ownerName : title,
            ownerName: ownerName,
            ownerPID: ownerPID,
            bounds: Rect(x: bx, y: by, width: bw, height: bh),
            isVisible: isOnScreen,
            layer: layer
        )
    }
}

func getWindowAtPoint(_ point: CGPoint) -> WindowResult? {
    let windows = getWindowList()
    // Windows are in front-to-back order, first match wins
    for w in windows {
        let b = w.bounds
        if point.x >= b.x && point.x < b.x + b.width &&
           point.y >= b.y && point.y < b.y + b.height {
            return w
        }
    }
    return nil
}

func getElementAtPoint(_ point: CGPoint, pid: Int) -> ElementInfo? {
    let app = AXUIElementCreateApplication(pid_t(pid))
    
    var element: AXUIElement?
    let err = AXUIElementCopyElementAtPosition(app, Float(point.x), Float(point.y), &element)
    guard err == .success, let el = element else {
        return nil
    }
    
    func attr(_ name: String) -> String {
        var value: AnyObject?
        AXUIElementCopyAttributeValue(el, name as CFString, &value)
        return (value as? String) ?? ""
    }
    
    return ElementInfo(
        role: attr(kAXRoleAttribute),
        title: attr(kAXTitleAttribute),
        value: {
            var value: AnyObject?
            AXUIElementCopyAttributeValue(el, kAXValueAttribute as CFString, &value)
            if let str = value as? String {
                // Truncate long values
                return String(str.prefix(200))
            }
            return ""
        }(),
        description: attr(kAXDescriptionAttribute),
        subrole: attr(kAXSubroleAttribute)
    )
}

func getDisplayForPoint(_ point: CGPoint) -> DisplayInfo {
    let displays = getDisplays()
    for d in displays {
        if point.x >= d.bounds.x && point.x < d.bounds.x + d.bounds.width &&
           point.y >= d.bounds.y && point.y < d.bounds.y + d.bounds.height {
            return d
        }
    }
    return displays.first ?? DisplayInfo(id: 0, bounds: Rect(x: 0, y: 0, width: 1920, height: 1080), scaleFactor: 1.0, isPrimary: true)
}

// MARK: - Commands

func handleMouse() {
    let mouseLocation = NSEvent.mouseLocation
    let screenHeight = NSScreen.main?.frame.height ?? 1080
    
    // Convert from AppKit coords (bottom-left origin) to screen coords (top-left origin)
    let flippedY = screenHeight - mouseLocation.y
    let screenPoint = CGPoint(x: mouseLocation.x, y: flippedY)
    
    let display = getDisplayForPoint(screenPoint)
    let window = getWindowAtPoint(screenPoint)
    
    var element: ElementInfo? = nil
    if let w = window {
        element = getElementAtPoint(screenPoint, pid: w.ownerPID)
    }
    
    let result = MouseResult(
        mousePosition: Point(x: mouseLocation.x, y: mouseLocation.y),
        mousePositionFlipped: Point(x: screenPoint.x, y: screenPoint.y),
        display: display,
        scaleFactor: display.scaleFactor,
        window: window,
        element: element
    )
    
    let encoder = JSONEncoder()
    encoder.outputFormatting = .prettyPrinted
    if let data = try? encoder.encode(result), let json = String(data: data, encoding: .utf8) {
        print(json)
    }
}

func handleWindows() {
    let result = WindowsResult(
        windows: getWindowList(),
        displays: getDisplays()
    )
    
    let encoder = JSONEncoder()
    encoder.outputFormatting = .prettyPrinted
    if let data = try? encoder.encode(result), let json = String(data: data, encoding: .utf8) {
        print(json)
    }
}

func handlePointQuery(x: Double, y: Double) {
    let point = CGPoint(x: x, y: y)
    let display = getDisplayForPoint(point)
    let window = getWindowAtPoint(point)
    
    var element: ElementInfo? = nil
    if let w = window {
        element = getElementAtPoint(point, pid: w.ownerPID)
    }
    
    let result = MouseResult(
        mousePosition: Point(x: x, y: y),
        mousePositionFlipped: Point(x: x, y: y),
        display: display,
        scaleFactor: display.scaleFactor,
        window: window,
        element: element
    )
    
    let encoder = JSONEncoder()
    encoder.outputFormatting = .prettyPrinted
    if let data = try? encoder.encode(result), let json = String(data: data, encoding: .utf8) {
        print(json)
    }
}

// MARK: - Main

let args = CommandLine.arguments

if args.count < 2 {
    fputs("Usage: window-info mouse|windows|point <x> <y>\n", stderr)
    exit(1)
}

switch args[1] {
case "mouse":
    handleMouse()
case "windows":
    handleWindows()
case "point":
    if args.count >= 4, let x = Double(args[2]), let y = Double(args[3]) {
        handlePointQuery(x: x, y: y)
    } else {
        fputs("Usage: window-info point <x> <y>\n", stderr)
        exit(1)
    }
default:
    fputs("Unknown command: \(args[1])\n", stderr)
    exit(1)
}
