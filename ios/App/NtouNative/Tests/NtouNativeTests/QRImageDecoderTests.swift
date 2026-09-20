import XCTest
import CoreImage
import ImageIO
@testable import NtouNative

final class QRImageDecoderTests: XCTestCase {
    private let context = CIContext(options: [.useSoftwareRenderer: true])
    private func raster(_ image: CIImage) throws -> CGImage {
        try XCTUnwrap(context.createCGImage(image, from: image.extent))
    }
    private func code(_ text: String) throws -> CIImage {
        let filter = try XCTUnwrap(CIFilter(name: "CIQRCodeGenerator"))
        filter.setValue(Data(text.utf8), forKey: "inputMessage")
        let qr = try XCTUnwrap(filter.outputImage).transformed(by: CGAffineTransform(scaleX: 8, y: 8))
        let white = CIImage(color: CIColor(red: 1, green: 1, blue: 1))
            .cropped(to: qr.extent.insetBy(dx: -32, dy: -32))
        return qr.composited(over: white)
    }
    func testDecodesRealQRImage() throws {
        let payload = "NTOUTAT iOS QR bridge check"
        XCTAssertEqual(QRImageDecoder.read(try raster(code(payload))), [payload])
    }
    func testRotatedQRCode() throws {
        let payload = "NTOUTAT:1:" + String(repeating: "a1B2c3D4", count: 60)
        XCTAssertEqual(QRImageDecoder.read(try raster(code(payload).oriented(.left))), [payload])
    }
    func testBlankImageHasNoPayload() throws {
        let blank = CIImage(color: CIColor(red: 1, green: 1, blue: 1)).cropped(to: CGRect(x: 0, y: 0, width: 200, height: 200))
        XCTAssertTrue(QRImageDecoder.read(try raster(blank)).isEmpty)
    }
}
