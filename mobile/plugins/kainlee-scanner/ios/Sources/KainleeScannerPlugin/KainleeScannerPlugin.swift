import AVFoundation
import Capacitor
import Foundation
import UIKit

/// Entry-QR scanner for the gate. Opens a full-screen camera, returns the first QR it reads.
/// JS: KainleeScanner.scan({ title }) -> { code } | { cancelled: true }; rejects with a readable message.
@objc(KainleeScannerPlugin)
public class KainleeScannerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KainleeScannerPlugin"
    public let jsName = "KainleeScanner"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise)
    ]

    @objc func status(_ call: CAPPluginCall) {
        call.resolve(["camera": Self.permission(), "available": AVCaptureDevice.default(for: .video) != nil])
    }

    @objc func scan(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? "Scan the entry QR"
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            present(call, title)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async {
                    if granted { self.present(call, title) } else { call.reject("Camera access was not allowed.", "DENIED") }
                }
            }
        default:
            call.reject("Camera access is off. Turn it on in iPhone Settings › Kainlee › Camera.", "DENIED")
        }
    }

    private static func permission() -> String {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: return "granted"
        case .notDetermined: return "prompt"
        default: return "denied"
        }
    }

    private func present(_ call: CAPPluginCall, _ title: String) {
        DispatchQueue.main.async {
            guard var top = self.bridge?.viewController else {
                call.reject("The app is still starting. Try again.", "NOT_READY")
                return
            }
            // present on top of whatever is showing (presenting from a busy controller fails silently)
            while let shown = top.presentedViewController, !shown.isBeingDismissed { top = shown }
            let scanner = KainleeScannerViewController()
            scanner.titleText = title
            scanner.onFinish = { code, error in
                if let code = code {
                    call.resolve(["code": code])
                } else if let error = error {
                    call.reject(error, "ERROR")
                } else {
                    call.resolve(["cancelled": true])
                }
            }
            scanner.modalPresentationStyle = .fullScreen
            top.present(scanner, animated: true)
        }
    }
}

final class KainleeScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var titleText = ""
    var onFinish: ((String?, String?) -> Void)?

    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "in.kainlee.scanner")
    private var preview: AVCaptureVideoPreviewLayer?
    private var device: AVCaptureDevice?
    private var setupError: String?
    private var finished = false
    private let frameView = UIView()
    private let torchButton = UIButton(type: .system)

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        configureSession()
        buildOverlay()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if let error = setupError { finish(code: nil, error: error); return }
        sessionQueue.async { if !self.session.isRunning { self.session.startRunning() } }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        setTorch(false)
        sessionQueue.async { if self.session.isRunning { self.session.stopRunning() } }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        preview?.frame = view.bounds
    }

    private func configureSession() {
        let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
            ?? AVCaptureDevice.default(for: .video)
        guard let camera = camera else { setupError = "No camera found on this device."; return }
        guard let input = try? AVCaptureDeviceInput(device: camera) else { setupError = "The camera could not be opened."; return }
        session.beginConfiguration()
        if session.canSetSessionPreset(.high) { session.sessionPreset = .high }
        guard session.canAddInput(input) else { session.commitConfiguration(); setupError = "The camera is busy. Close other camera apps and try again."; return }
        session.addInput(input)
        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else { session.commitConfiguration(); setupError = "The scanner could not start."; return }
        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        if output.availableMetadataObjectTypes.contains(.qr) { output.metadataObjectTypes = [.qr] }
        session.commitConfiguration()
        device = camera

        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        layer.frame = view.bounds
        view.layer.addSublayer(layer)
        preview = layer
    }

    private func buildOverlay() {
        frameView.translatesAutoresizingMaskIntoConstraints = false
        frameView.layer.borderColor = UIColor(red: 1, green: 0.16, blue: 0.16, alpha: 1).cgColor
        frameView.layer.borderWidth = 4
        frameView.layer.cornerRadius = 18
        frameView.isUserInteractionEnabled = false
        view.addSubview(frameView)

        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.text = titleText
        label.textColor = .white
        label.font = .systemFont(ofSize: 19, weight: .semibold)
        label.textAlignment = .center
        label.numberOfLines = 2
        label.layer.shadowColor = UIColor.black.cgColor
        label.layer.shadowOpacity = 0.8
        label.layer.shadowRadius = 4
        label.layer.shadowOffset = .zero
        view.addSubview(label)

        let cancel = UIButton(type: .system)
        cancel.translatesAutoresizingMaskIntoConstraints = false
        cancel.setTitle("Cancel", for: .normal)
        cancel.titleLabel?.font = .systemFont(ofSize: 18, weight: .semibold)
        cancel.setTitleColor(.white, for: .normal)
        cancel.backgroundColor = UIColor(white: 0, alpha: 0.55)
        cancel.layer.cornerRadius = 24
        cancel.contentEdgeInsets = UIEdgeInsets(top: 12, left: 28, bottom: 12, right: 28)
        cancel.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        view.addSubview(cancel)

        torchButton.translatesAutoresizingMaskIntoConstraints = false
        torchButton.setTitle("Torch", for: .normal)
        torchButton.titleLabel?.font = .systemFont(ofSize: 18, weight: .semibold)
        torchButton.setTitleColor(.white, for: .normal)
        torchButton.backgroundColor = UIColor(white: 0, alpha: 0.55)
        torchButton.layer.cornerRadius = 24
        torchButton.contentEdgeInsets = UIEdgeInsets(top: 12, left: 28, bottom: 12, right: 28)
        torchButton.addTarget(self, action: #selector(torchTapped), for: .touchUpInside)
        torchButton.isHidden = !(device?.hasTorch ?? false)
        view.addSubview(torchButton)

        let guide = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            frameView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            frameView.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: -20),
            frameView.widthAnchor.constraint(equalTo: view.widthAnchor, multiplier: 0.68),
            frameView.heightAnchor.constraint(equalTo: frameView.widthAnchor),
            label.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 24),
            label.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -24),
            label.bottomAnchor.constraint(equalTo: frameView.topAnchor, constant: -24),
            cancel.bottomAnchor.constraint(equalTo: guide.bottomAnchor, constant: -24),
            cancel.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 24),
            torchButton.bottomAnchor.constraint(equalTo: guide.bottomAnchor, constant: -24),
            torchButton.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -24)
        ])
    }

    @objc private func cancelTapped() { finish(code: nil, error: nil) }

    @objc private func torchTapped() {
        guard let device = device, device.hasTorch else { return }
        setTorch(device.torchMode != .on)
    }

    private func setTorch(_ on: Bool) {
        guard let device = device, device.hasTorch, (try? device.lockForConfiguration()) != nil else { return }
        device.torchMode = on ? .on : .off
        device.unlockForConfiguration()
        torchButton.setTitle(on ? "Torch off" : "Torch", for: .normal)
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard !finished,
              let code = metadataObjects.compactMap({ ($0 as? AVMetadataMachineReadableCodeObject)?.stringValue }).first,
              !code.isEmpty else { return }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        finish(code: code, error: nil)
    }

    private func finish(code: String?, error: String?) {
        guard !finished else { return }
        finished = true
        let done = onFinish
        dismiss(animated: true) { done?(code, error) }
    }
}
