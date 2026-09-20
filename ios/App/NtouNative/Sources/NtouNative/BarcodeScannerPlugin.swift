#if os(iOS)
import AVFoundation
import Capacitor
import ImageIO
import UIKit
import Vision

/// Apple-native QR implementation; Android keeps its existing ML Kit plugin.
@objc(NtouBarcodeScannerPlugin)
public final class NtouBarcodeScannerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NtouBarcodeScannerPlugin"
    public let jsName = "BarcodeScanner"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readBarcodesFromImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise)
    ]
    private var scanning = false

    static func barcode(_ value: String) -> [String: Any] {
        ["rawValue": value, "displayValue": value, "format": "QR_CODE", "valueType": "TEXT"]
    }
    @objc public func isSupported(_ call: CAPPluginCall) {
        call.resolve(["supported": AVCaptureDevice.default(for: .video) != nil])
    }
    @objc public func checkPermissions(_ call: CAPPluginCall) {
        let state = AVCaptureDevice.authorizationStatus(for: .video)
        call.resolve(["camera": state == .authorized ? "granted" : state == .notDetermined ? "prompt" : "denied"])
    }
    @objc public func requestPermissions(_ call: CAPPluginCall) {
        AVCaptureDevice.requestAccess(for: .video) { allowed in call.resolve(["camera": allowed ? "granted" : "denied"]) }
    }
    @objc public func scan(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard !self.scanning, let presenter = self.bridge?.viewController else {
                call.reject("掃描器正在使用中"); return
            }
            guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
                call.reject("請在設定允許相機權限"); return
            }
            self.scanning = true
            let scanner = QRScannerController()
            scanner.modalPresentationStyle = .fullScreen
            scanner.completion = { value, error in
                scanner.dismiss(animated: true) {
                    self.scanning = false
                    if let value { call.resolve(["barcodes": [Self.barcode(value)]]) }
                    else { call.reject(error ?? "掃描已取消", "SCAN_CANCELED") }
                }
            }
            presenter.present(scanner, animated: true)
        }
    }
    @objc public func readBarcodesFromImage(_ call: CAPPluginCall) {
        guard let path = call.getString("path"), let url = URL(string: path), url.isFileURL else {
            call.reject("請選擇手機裡的 QR Code 圖片"); return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                // Downsample large library photos before Vision; no upload or network request.
                guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
                      let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                        kCGImageSourceCreateThumbnailFromImageAlways: true,
                        kCGImageSourceThumbnailMaxPixelSize: 4096,
                        kCGImageSourceCreateThumbnailWithTransform: true
                      ] as CFDictionary) else { throw NativeMailError.message("無法開啟圖片") }
                let request = VNDetectBarcodesRequest()
                request.symbologies = [.qr]
                try VNImageRequestHandler(cgImage: image).perform([request])
                let values = request.results?.compactMap(\.payloadStringValue) ?? []
                call.resolve(["barcodes": values.map(Self.barcode)])
            } catch { call.reject("圖片 QR Code 辨識失敗，請選擇清晰的圖片") }
        }
    }
}

private final class QRScannerController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var completion: ((String?, String?) -> Void)?
    private let session = AVCaptureSession()
    private let captureQueue = DispatchQueue(label: "tw.ntou.tat.qr")
    private var preview: AVCaptureVideoPreviewLayer?
    private var finished = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(layer)
        preview = layer
        let close = UIButton(type: .system)
        close.setTitle("取消掃描", for: .normal)
        close.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        close.tintColor = .white
        close.backgroundColor = UIColor.black.withAlphaComponent(0.7)
        close.layer.cornerRadius = 10
        close.translatesAutoresizingMaskIntoConstraints = false
        close.addTarget(self, action: #selector(cancel), for: .touchUpInside)
        view.addSubview(close)
        let help = UILabel()
        help.text = "將課表 QR Code 放入鏡頭範圍"
        help.textColor = .white
        help.backgroundColor = UIColor.black.withAlphaComponent(0.7)
        help.textAlignment = .center
        help.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(help)
        NSLayoutConstraint.activate([
            close.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20),
            close.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            close.widthAnchor.constraint(equalToConstant: 120), close.heightAnchor.constraint(equalToConstant: 48),
            help.leadingAnchor.constraint(equalTo: view.leadingAnchor), help.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            help.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24),
            help.heightAnchor.constraint(equalToConstant: 48)
        ])
        captureQueue.async {
            do {
                guard let camera = AVCaptureDevice.default(for: .video) else { throw NativeMailError.message("沒有可用相機") }
                let input = try AVCaptureDeviceInput(device: camera)
                let output = AVCaptureMetadataOutput()
                self.session.beginConfiguration()
                guard self.session.canAddInput(input), self.session.canAddOutput(output) else {
                    self.session.commitConfiguration(); throw NativeMailError.message("相機無法啟動")
                }
                self.session.addInput(input); self.session.addOutput(output)
                output.setMetadataObjectsDelegate(self, queue: .main)
                output.metadataObjectTypes = [.qr]
                self.session.commitConfiguration()
                self.session.startRunning()
            } catch { DispatchQueue.main.async { self.finish(nil, "相機無法啟動，請改從圖庫選擇") } }
        }
    }
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        preview?.frame = view.bounds
        if let orientation = view.window?.windowScene?.interfaceOrientation,
           let video = AVCaptureVideoOrientation(rawValue: orientation.rawValue) {
            preview?.connection?.videoOrientation = video
        }
    }
    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        captureQueue.async { self.session.stopRunning() }
    }
    @objc private func cancel() { finish(nil, nil) }
    private func finish(_ value: String?, _ error: String?) {
        guard !finished else { return }
        finished = true
        captureQueue.async { self.session.stopRunning() }
        completion?(value, error)
    }
    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        if let value = (metadataObjects.first as? AVMetadataMachineReadableCodeObject)?.stringValue { finish(value, nil) }
    }
}
#endif
