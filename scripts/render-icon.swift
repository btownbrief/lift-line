import AppKit

let size = NSSize(width: 180, height: 180)
let image = NSImage(size: size)
image.lockFocus()

NSColor(calibratedRed: 16/255, green: 42/255, blue: 67/255, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(origin: .zero, size: size), xRadius: 36, yRadius: 36).fill()

NSColor(calibratedRed: 1, green: 200/255, blue: 87/255, alpha: 1).setFill()
NSBezierPath(ovalIn: NSRect(x: 119, y: 121, width: 40, height: 40)).fill()

let mountain = NSBezierPath()
mountain.move(to: NSPoint(x: 0, y: 22))
mountain.line(to: NSPoint(x: 58, y: 130))
mountain.line(to: NSPoint(x: 93, y: 79))
mountain.line(to: NSPoint(x: 114, y: 109))
mountain.line(to: NSPoint(x: 180, y: 22))
mountain.close()
NSColor(calibratedRed: 234/255, green: 246/255, blue: 248/255, alpha: 1).setFill()
mountain.fill()

NSColor(calibratedRed: 1, green: 107/255, blue: 53/255, alpha: 1).setStroke()
let cable = NSBezierPath()
cable.move(to: NSPoint(x: 10, y: 141))
cable.line(to: NSPoint(x: 170, y: 141))
cable.lineWidth = 7
cable.stroke()

func chair(x: CGFloat) {
  let hanger = NSBezierPath()
  hanger.move(to: NSPoint(x: x + 21, y: 141))
  hanger.line(to: NSPoint(x: x + 21, y: 113))
  hanger.lineWidth = 7
  hanger.stroke()
  NSColor(calibratedRed: 1, green: 107/255, blue: 53/255, alpha: 1).setFill()
  NSBezierPath(roundedRect: NSRect(x: x, y: 92, width: 42, height: 27), xRadius: 7, yRadius: 7).fill()
}
chair(x: 34)
chair(x: 104)

let text = "LIFT LINE" as NSString
let style = NSMutableParagraphStyle()
style.alignment = .center
text.draw(in: NSRect(x: 10, y: 6, width: 160, height: 31), withAttributes: [
  .font: NSFont.boldSystemFont(ofSize: 25),
  .foregroundColor: NSColor(calibratedRed: 16/255, green: 42/255, blue: 67/255, alpha: 1),
  .paragraphStyle: style,
])

image.unlockFocus()
guard let tiff = image.tiffRepresentation,
      let rep = NSBitmapImageRep(data: tiff),
      let png = rep.representation(using: .png, properties: [:]) else {
  fatalError("Could not render PNG")
}
try png.write(to: URL(fileURLWithPath: "icon-180.png"))
