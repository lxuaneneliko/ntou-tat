import CoreImage
import Vision

enum QRImageDecoder {
    static func read(_ image: CGImage) -> [String] {
        #if os(iOS) && !targetEnvironment(simulator)
        // Prefer Vision on real iPhones; its recent detector needs hardware that
        // hosted macOS VMs do not expose, even when usesCPUOnly is requested.
        let request = VNDetectBarcodesRequest()
        request.symbologies = [.qr]
        if (try? VNImageRequestHandler(cgImage: image).perform([request])) != nil {
            let values = request.results?.compactMap(\.payloadStringValue) ?? []
            if !values.isEmpty { return values }
        }
        #endif
        // Also handles images Vision misses. This is a real local QR decoder,
        // not a test stub; no payload is uploaded or inferred from the filename.
        let context = CIContext(options: [.useSoftwareRenderer: true])
        let detector = CIDetector(ofType: CIDetectorTypeQRCode, context: context,
                                  options: [CIDetectorAccuracy: CIDetectorAccuracyHigh])
        return detector?.features(in: CIImage(cgImage: image))
            .compactMap { ($0 as? CIQRCodeFeature)?.messageString } ?? []
    }
}
