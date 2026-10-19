// Original Reflow artwork. Run: swift -module-cache-path /tmp/reflow-swift-cache publishing/render-assets.swift
import AppKit

let output = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent("publishing")
func color(_ hex: UInt32) -> NSColor {
    NSColor(srgbRed: CGFloat((hex >> 16) & 255)/255, green: CGFloat((hex >> 8) & 255)/255, blue: CGFloat(hex & 255)/255, alpha: 1)
}
func rect(_ r: NSRect, _ fill: UInt32, radius: CGFloat = 0) {
    color(fill).setFill(); NSBezierPath(roundedRect: r, xRadius: radius, yRadius: radius).fill()
}
func text(_ s: String, _ x: CGFloat, _ y: CGFloat, _ size: CGFloat, _ fill: UInt32, weight: NSFont.Weight = .regular, mono: Bool = false) {
    let font = mono ? NSFont.monospacedSystemFont(ofSize: size, weight: weight) : NSFont.systemFont(ofSize: size, weight: weight)
    (s as NSString).draw(at: NSPoint(x: x, y: y), withAttributes: [.font: font, .foregroundColor: color(fill)])
}
func png(_ name: String, _ width: Int, _ height: Int, draw: () -> Void) {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    let cg = NSGraphicsContext(bitmapImageRep: bitmap)!.cgContext
    cg.translateBy(x: 0, y: CGFloat(height)); cg.scaleBy(x: 1, y: -1)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: cg, flipped: true)
    draw(); NSGraphicsContext.restoreGraphicsState()
    try! bitmap.representation(using: .png, properties: [:])!.write(to: output.appendingPathComponent(name))
}
png("icon.png", 128, 128) {
    rect(NSRect(x: 0, y: 0, width: 128, height: 128), 0x1c1d20, radius: 26)
    color(0xf46a32).setFill(); NSBezierPath(ovalIn: NSRect(x: 62, y: 38, width: 45, height: 45)).fill()
    for y in stride(from: 27, through: 99, by: 12) {
        let dy = CGFloat(y+3)-60.5
        let end: CGFloat = abs(dy) < 28 ? 84.5-sqrt(max(0, 28*28-dy*dy))-5 : 104
        rect(NSRect(x: 23, y: CGFloat(y), width: end-23, height: 5), 0xeceef0, radius: 2)
    }
}
png("thumbnail.png", 1920, 1080) {
    rect(NSRect(x: 0, y: 0, width: 1920, height: 1080), 0x1c1d20)
    rect(NSRect(x: 90, y: 100, width: 1740, height: 1), 0x3d4148)
    text("reflow", 90, 235, 112, 0xeceef0, weight: .medium, mono: true)
    text("let your text", 94, 420, 46, 0xeceef0)
    text("follow your shapes.", 94, 480, 46, 0xeceef0)
    text("editable text in figma", 96, 620, 25, 0xa0a5ad)
    text("built on pretext", 96, 785, 24, 0x91c49a, mono: true)
    text("by cheng lou + contributors", 96, 829, 19, 0xa0a5ad)
    text("independent integration by azuic", 96, 895, 18, 0x7b818a)
    rect(NSRect(x: 840, y: 170, width: 990, height: 740), 0xf7f3e8, radius: 12)
    text("a moving composition", 900, 220, 35, 0x24262a, weight: .medium)
    let article = Array(repeating: "Move the shapes and let the words find a new path. Text stays editable, the source stays whole, and the composition can keep changing. Built on Pretext by Cheng Lou and the Pretext contributors. ", count: 12).joined().split(separator: " ").map(String.init)
    let font = NSFont.systemFont(ofSize: 22)
    var index = 0
    for y in stride(from: 306, through: 842, by: 33) {
        var slots: [(CGFloat,CGFloat)] = [(900, 1770)]
        let top = CGFloat(y), bottom = top+30, cy: CGFloat = 493, radius: CGFloat = 148
        let nearest = top <= cy && bottom >= cy ? 0 : min(abs(top-cy),abs(bottom-cy))
        if nearest < radius {
            let half = sqrt(radius*radius-nearest*nearest)
            slots = [(900, 1515-half-17),(1515+half+17,1770)]
        }
        if top < 825 && bottom > 686 { slots = [(900,1085),(1345,1770)] }
        for (left,right) in slots where right-left > 55 {
            var line = ""
            while index < article.count {
                let candidate = line.isEmpty ? article[index] : line+" "+article[index]
                if (candidate as NSString).size(withAttributes: [.font:font]).width > right-left { break }
                line = candidate; index += 1
            }
            text(line,left,top,22,0x24262a)
        }
    }
    color(0xf46a32).setFill(); NSBezierPath(ovalIn: NSRect(x: 1384, y: 362, width: 262, height: 262)).fill()
    NSGraphicsContext.saveGraphicsState()
    let t = NSAffineTransform(); t.translateX(by: 1215, yBy: 755); t.rotate(byDegrees: -14); t.concat()
    rect(NSRect(x: -88,y: -58,width:176,height:116),0x425ad3)
    NSGraphicsContext.restoreGraphicsState()
    text("native text  /  local processing  /  open source", 900, 947, 20, 0xa0a5ad, mono: true)
}
print("Generated publishing/icon.png and publishing/thumbnail.png")
