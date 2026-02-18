// Native macOS window info + input hooks helper
// Compile: swiftc -O -o window-info window-info.swift -framework AppKit -framework CoreGraphics -framework ApplicationServices
// Usage: window-info mouse          → returns mouse position + window under cursor + element info
//        window-info windows        → returns all visible windows
//        window-info point <x> <y>  → returns window/element at point
//        window-info serve          → persistent JSON-RPC mode via stdin/stdout
//        window-info hooks          → stream input events (click/key/scroll) as JSON lines
// Output: JSON to stdout

import AppKit
import CoreGraphics
import Foundation

// MARK: - Data types

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
    let mousePositionFlipped: Point
    let display: DisplayInfo
    let scaleFactor: Double
    let window: WindowResult?
    let element: ElementInfo?
}

struct WindowsResult: Codable {
    let windows: [WindowResult]
    let displays: [DisplayInfo]
}

// MARK: - JSON-RPC types for serve mode

struct ServeRequest: Codable {
    let id: Int
    let cmd: String
    let args: [String: Double]?
}

// MARK: - Hook event types

struct HookClickEvent: Codable {
    let type = "click"
    let x: Double
    let y: Double
    let button: Int
    let window: WindowResult?
    let element: ElementInfo?
    let scale: Double
    let timestamp: Int64
    let screenshotPath: String?
}

struct HookKeyEvent: Codable {
    let type = "key"
    let keycode: Int
    let modifiers: [String]
    let window: WindowResult?
    let timestamp: Int64
}

struct HookScrollEvent: Codable {
    let type = "scroll"
    let x: Double
    let y: Double
    let deltaX: Double
    let deltaY: Double
    let window: WindowResult?
    let timestamp: Int64
}

struct HookReadyEvent: Codable {
    let type = "ready"
    let platform = "darwin"
    let coordSpace = "logical"
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

func getScaleForPoint(_ point: CGPoint) -> Double {
    return getDisplayForPoint(point).scaleFactor
}

// MARK: - JSON output helpers

let encoder: JSONEncoder = {
    let e = JSONEncoder()
    e.outputFormatting = .sortedKeys
    return e
}()

// ---------------------------------------------------------------------------
// Synchronous screenshot capture at click time
// ---------------------------------------------------------------------------

let captureDir: String = {
    let dir = NSTemporaryDirectory() + "ondoki-captures/"
    try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    return dir
}()

func captureDisplayAtPoint(_ point: CGPoint) -> String? {
    // Find which display contains this point
    var displayID: CGDirectDisplayID = 0
    var count: UInt32 = 0
    CGGetDisplaysWithPoint(point, 1, &displayID, &count)
    if count == 0 { displayID = CGMainDisplayID() }
    
    // Synchronous capture — ~3-5ms, runs BEFORE event reaches target app
    guard let image = CGDisplayCreateImage(displayID) else { return nil }
    
    let path = captureDir + "cap_\(Int64(Date().timeIntervalSince1970 * 1000)).png"
    let url = URL(fileURLWithPath: path)
    guard let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil) else { return nil }
    CGImageDestinationAddImage(dest, image, nil)
    guard CGImageDestinationFinalize(dest) else { return nil }
    
    return path
}

func writeJSON<T: Encodable>(_ value: T) {
    if let data = try? encoder.encode(value), let json = String(data: data, encoding: .utf8) {
        print(json)
        fflush(stdout)
    }
}

// MARK: - Commands (return JSON Data)

func buildMouseResult() -> Data? {
    let mouseLocation = NSEvent.mouseLocation
    let screenHeight = NSScreen.main?.frame.height ?? 1080
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
    
    return try? encoder.encode(result)
}

func buildWindowsResult() -> Data? {
    let result = WindowsResult(
        windows: getWindowList(),
        displays: getDisplays()
    )
    return try? encoder.encode(result)
}

func buildPointResult(x: Double, y: Double) -> Data? {
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
    
    return try? encoder.encode(result)
}

// MARK: - Serve mode (persistent JSON-RPC via stdin/stdout)

func handleServe() {
    setbuf(stdout, nil)
    
    while let line = readLine(strippingNewline: true) {
        guard !line.isEmpty else { continue }
        
        guard let lineData = line.data(using: .utf8),
              let request = try? JSONDecoder().decode(ServeRequest.self, from: lineData) else {
            let errJson = "{\"id\":0,\"error\":\"invalid JSON\"}\n"
            fputs(errJson, stdout)
            fflush(stdout)
            continue
        }
        
        let requestId = request.id
        var resultData: Data? = nil
        var errorMsg: String? = nil
        
        switch request.cmd {
        case "mouse":
            resultData = buildMouseResult()
        case "windows":
            resultData = buildWindowsResult()
        case "point":
            if let args = request.args, let x = args["x"], let y = args["y"] {
                resultData = buildPointResult(x: x, y: y)
            } else {
                errorMsg = "point requires args.x and args.y"
            }
        default:
            errorMsg = "unknown command: \(request.cmd)"
        }
        
        var response: String
        if let err = errorMsg {
            let escaped = err.replacingOccurrences(of: "\"", with: "\\\"")
            response = "{\"id\":\(requestId),\"error\":\"\(escaped)\"}"
        } else if let data = resultData, let resultJson = String(data: data, encoding: .utf8) {
            response = "{\"id\":\(requestId),\"result\":\(resultJson)}"
        } else {
            response = "{\"id\":\(requestId),\"result\":null}"
        }
        
        print(response)
        fflush(stdout)
    }
}

// MARK: - Hooks mode (CGEventTap — stream input events)

// Global ref so we can re-enable the tap if it gets disabled
var globalEventTap: CFMachPort?

func eventTapCallback(proxy: CGEventTapProxy, type: CGEventType, event: CGEvent, refcon: UnsafeMutableRawPointer?) -> Unmanaged<CGEvent>? {
    // Re-enable tap if it got disabled (system disables after timeout)
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
        if let tap = globalEventTap {
            CGEvent.tapEnable(tap: tap, enable: true)
        }
        return Unmanaged.passRetained(event)
    }
    
    let timestamp = Int64(Date().timeIntervalSince1970 * 1000)
    let location = event.location // CGPoint in Quartz coords (top-left origin, logical)
    
    switch type {
    case .leftMouseDown, .rightMouseDown, .otherMouseDown:
        let button: Int
        switch type {
        case .leftMouseDown: button = 1
        case .rightMouseDown: button = 2
        default: button = 3
        }
        
        let point = CGPoint(x: location.x, y: location.y)
        
        // Capture screenshot SYNCHRONOUSLY before event reaches target app
        let screenshotPath = captureDisplayAtPoint(point)
        
        let window = getWindowAtPoint(point)
        var element: ElementInfo? = nil
        if let w = window {
            element = getElementAtPoint(point, pid: w.ownerPID)
        }
        let scale = getScaleForPoint(point)
        
        let clickEvent = HookClickEvent(
            x: location.x,
            y: location.y,
            button: button,
            window: window,
            element: element,
            scale: scale,
            timestamp: timestamp,
            screenshotPath: screenshotPath
        )
        writeJSON(clickEvent)
        
    case .keyDown:
        let keycode = Int(event.getIntegerValueField(.keyboardEventKeycode))
        let flags = event.flags
        var modifiers: [String] = []
        if flags.contains(.maskControl) { modifiers.append("ctrl") }
        if flags.contains(.maskAlternate) { modifiers.append("alt") }
        if flags.contains(.maskShift) { modifiers.append("shift") }
        if flags.contains(.maskCommand) { modifiers.append("meta") }
        
        // Get foreground window for keyboard events
        let mouseLocation = NSEvent.mouseLocation
        let screenHeight = NSScreen.main?.frame.height ?? 1080
        let flippedY = screenHeight - mouseLocation.y
        let foregroundWindow = getWindowAtPoint(CGPoint(x: mouseLocation.x, y: flippedY))
        
        let keyEvent = HookKeyEvent(
            keycode: keycode,
            modifiers: modifiers,
            window: foregroundWindow,
            timestamp: timestamp
        )
        writeJSON(keyEvent)
        
    case .scrollWheel:
        let deltaY = event.getDoubleValueField(.scrollWheelEventDeltaAxis1)
        let deltaX = event.getDoubleValueField(.scrollWheelEventDeltaAxis2)
        
        let point = CGPoint(x: location.x, y: location.y)
        let window = getWindowAtPoint(point)
        
        let scrollEvent = HookScrollEvent(
            x: location.x,
            y: location.y,
            deltaX: deltaX,
            deltaY: deltaY,
            window: window,
            timestamp: timestamp
        )
        writeJSON(scrollEvent)
        
    default:
        break
    }
    
    return Unmanaged.passRetained(event)
}

func handleHooks() {
    setbuf(stdout, nil)
    
    // Events we want to capture
    let eventMask: CGEventMask = (
        (1 << CGEventType.leftMouseDown.rawValue) |
        (1 << CGEventType.rightMouseDown.rawValue) |
        (1 << CGEventType.otherMouseDown.rawValue) |
        (1 << CGEventType.keyDown.rawValue) |
        (1 << CGEventType.scrollWheel.rawValue)
    )
    
    guard let eventTap = CGEvent.tapCreate(
        tap: .cgSessionEventTap,
        place: .headInsertEventTap,
        options: .defaultTap,  // Active tap: callback runs BEFORE event reaches target app
        eventsOfInterest: eventMask,
        callback: eventTapCallback,
        userInfo: nil
    ) else {
        fputs("{\"type\":\"error\",\"message\":\"Failed to create event tap. Grant accessibility permissions in System Preferences.\"}\n", stderr)
        exit(1)
    }
    
    globalEventTap = eventTap
    
    let runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0)
    CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
    CGEvent.tapEnable(tap: eventTap, enable: true)
    
    // Send ready message
    writeJSON(HookReadyEvent())
    
    // Run forever
    CFRunLoopRun()
}

// MARK: - CLI Commands

func handleMouse() {
    if let data = buildMouseResult() {
        if let obj = try? JSONSerialization.jsonObject(with: data),
           let pretty = try? JSONSerialization.data(withJSONObject: obj, options: .sortedKeys),
           let prettyStr = String(data: pretty, encoding: .utf8) {
            print(prettyStr)
        }
    }
}

func handleWindowsCmd() {
    if let data = buildWindowsResult() {
        if let obj = try? JSONSerialization.jsonObject(with: data),
           let pretty = try? JSONSerialization.data(withJSONObject: obj, options: .sortedKeys),
           let prettyStr = String(data: pretty, encoding: .utf8) {
            print(prettyStr)
        }
    }
}

func handlePointQuery(x: Double, y: Double) {
    if let data = buildPointResult(x: x, y: y) {
        if let obj = try? JSONSerialization.jsonObject(with: data),
           let pretty = try? JSONSerialization.data(withJSONObject: obj, options: .sortedKeys),
           let prettyStr = String(data: pretty, encoding: .utf8) {
            print(prettyStr)
        }
    }
}

// MARK: - Main

let args = CommandLine.arguments

if args.count < 2 {
    fputs("Usage: window-info mouse|windows|point <x> <y>|serve|hooks\n", stderr)
    exit(1)
}

switch args[1] {
case "mouse":
    handleMouse()
case "windows":
    handleWindowsCmd()
case "point":
    if args.count >= 4, let x = Double(args[2]), let y = Double(args[3]) {
        handlePointQuery(x: x, y: y)
    } else {
        fputs("Usage: window-info point <x> <y>\n", stderr)
        exit(1)
    }
case "serve":
    handleServe()
case "hooks":
    handleHooks()
default:
    fputs("Unknown command: \(args[1])\n", stderr)
    exit(1)
}
