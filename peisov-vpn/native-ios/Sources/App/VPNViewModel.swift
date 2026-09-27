import Foundation
import Combine
import NetworkExtension

@MainActor
final class VPNViewModel: ObservableObject {
    @Published var importedName: String?
    @Published var endpoint: String?
    @Published var configSummary: String?
    @Published var errorMessage: String?
    @Published var busy = false

    let vpn = VPNManager.shared

    init() {
        Task {
            await vpn.prepare()
        }
    }

    var statusTitle: String {
        switch vpn.status {
        case .connected:
            return vpn.handshakeVerified ? "Protected" : "Tunnel active"
        case .connecting, .reasserting:
            return "Connecting…"
        case .disconnecting:
            return "Disconnecting…"
        case .disconnected:
            return importedName == nil ? "No configuration" : "Ready"
        case .invalid:
            return importedName == nil ? "No configuration" : "VPN profile unavailable"
        @unknown default:
            return "Unknown"
        }
    }

    var actionTitle: String {
        switch vpn.status {
        case .connected:
            return "DISCONNECT"
        case .connecting, .reasserting:
            return "CONNECTING"
        case .disconnecting:
            return "DISCONNECTING"
        default:
            return importedName == nil ? "IMPORT CONFIG" : "CONNECT"
        }
    }

    var canTapConnect: Bool {
        !busy && vpn.status != .connecting && vpn.status != .disconnecting && vpn.status != .reasserting
    }

    func importConfig(from url: URL) async {
        busy = true
        defer { busy = false }

        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }

        do {
            let data = try Data(contentsOf: url)
            guard data.count <= 128 * 1024 else {
                throw NSError(
                    domain: "PEISOVVPN",
                    code: 3001,
                    userInfo: [NSLocalizedDescriptionKey: "Config is too large."]
                )
            }
            guard let raw = String(data: data, encoding: .utf8) else {
                throw NSError(
                    domain: "PEISOVVPN",
                    code: 3002,
                    userInfo: [NSLocalizedDescriptionKey: "Config is not UTF-8 text."]
                )
            }

            let parsed = try MeduzaConfigParser.parse(raw)
            try await vpn.install(rawConfig: raw, parsed: parsed)

            importedName = url.lastPathComponent
            endpoint = parsed.endpoint
            configSummary = parsed.displaySummary
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func tapConnect() {
        guard canTapConnect else { return }

        switch vpn.status {
        case .connected:
            vpn.disconnect()
        default:
            do {
                try vpn.connect()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func removeConfiguration() async {
        busy = true
        defer { busy = false }
        do {
            try await vpn.removeProfile()
            importedName = nil
            endpoint = nil
            configSummary = nil
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
