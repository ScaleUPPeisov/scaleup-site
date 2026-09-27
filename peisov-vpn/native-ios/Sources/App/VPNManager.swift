import Foundation
import NetworkExtension

@MainActor
final class VPNManager: ObservableObject {
    static let shared = VPNManager()
    static let configAccount = "active-meduza-config"

    @Published private(set) var status: NEVPNStatus = .invalid
    @Published private(set) var handshakeVerified = false

    private var manager: NETunnelProviderManager?
    private var statusObserver: NSObjectProtocol?

    private var providerBundleIdentifier: String {
        (Bundle.main.object(forInfoDictionaryKey: "PEISOVTunnelProviderBundleIdentifier") as? String)
            ?? "com.peisov.vpn.PacketTunnel"
    }

    init() {
        statusObserver = NotificationCenter.default.addObserver(
            forName: .NEVPNStatusDidChange,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.syncStatus()
                if self?.status == .connected {
                    self?.handshakeVerified = false
                    Task { @MainActor [weak self] in
                        await self?.verifyHandshake()
                    }
                }
            }
        }
    }

    deinit {
        if let statusObserver {
            NotificationCenter.default.removeObserver(statusObserver)
        }
    }

    func prepare() async {
        do {
            manager = try await loadExistingManager()
            syncStatus()
            if status == .connected {
                await verifyHandshake()
            }
        } catch {
            status = .invalid
        }
    }

    func install(rawConfig: String, parsed: MeduzaConfig) async throws {
        try SharedKeychain.save(rawConfig, account: Self.configAccount)

        let targetManager = try await loadExistingManager() ?? NETunnelProviderManager()
        let tunnelProtocol = NETunnelProviderProtocol()
        tunnelProtocol.providerBundleIdentifier = providerBundleIdentifier
        tunnelProtocol.serverAddress = parsed.endpoint ?? "PEISOV VPN"
        tunnelProtocol.providerConfiguration = [
            "configAccount": Self.configAccount,
            "protocolID": parsed.protocolID
        ]

        targetManager.localizedDescription = "PEISOV VPN"
        targetManager.protocolConfiguration = tunnelProtocol
        targetManager.isEnabled = true

        try await save(targetManager)
        try await load(targetManager)

        manager = targetManager
        handshakeVerified = false
        syncStatus()
    }

    func connect() throws {
        guard let session = manager?.connection as? NETunnelProviderSession else {
            throw NSError(
                domain: "PEISOVVPN",
                code: 2001,
                userInfo: [NSLocalizedDescriptionKey: "VPN profile is not configured."]
            )
        }
        handshakeVerified = false
        try session.startTunnel(options: [
            "activationAttemptId": UUID().uuidString as NSString
        ])
    }

    func disconnect() {
        handshakeVerified = false
        if let session = manager?.connection as? NETunnelProviderSession {
            session.stopTunnel()
        } else {
            manager?.connection.stopVPNTunnel()
        }
    }

    func removeProfile() async throws {
        disconnect()
        if let manager {
            try await remove(manager)
        }
        SharedKeychain.delete(account: Self.configAccount)
        self.manager = nil
        status = .invalid
        handshakeVerified = false
    }

    func verifyHandshake(maxAttempts: Int = 12) async {
        guard status == .connected else {
            handshakeVerified = false
            return
        }

        for _ in 0..<maxAttempts {
            if await runtimeHasHandshake() {
                handshakeVerified = true
                return
            }
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            if status != .connected { break }
        }
        handshakeVerified = false
    }

    private func runtimeHasHandshake() async -> Bool {
        guard let session = manager?.connection as? NETunnelProviderSession else { return false }

        do {
            let data: Data? = try await withCheckedThrowingContinuation { continuation in
                do {
                    try session.sendProviderMessage(Data([0])) { response in
                        continuation.resume(returning: response)
                    }
                } catch {
                    continuation.resume(throwing: error)
                }
            }
            guard let data, let runtime = String(data: data, encoding: .utf8) else { return false }

            return runtime
                .split(separator: "\n")
                .filter { $0.hasPrefix("last_handshake_time_sec=") }
                .compactMap { line -> Int64? in
                    let value = line.split(separator: "=", maxSplits: 1).last
                    return value.flatMap { Int64($0) }
                }
                .contains { $0 > 0 }
        } catch {
            return false
        }
    }

    private func syncStatus() {
        status = manager?.connection.status ?? .invalid
        if status != .connected {
            handshakeVerified = false
        }
    }

    private func loadExistingManager() async throws -> NETunnelProviderManager? {
        let managers: [NETunnelProviderManager] = try await withCheckedThrowingContinuation { continuation in
            NETunnelProviderManager.loadAllFromPreferences { managers, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: managers ?? [])
                }
            }
        }

        return managers.first { manager in
            guard let proto = manager.protocolConfiguration as? NETunnelProviderProtocol else { return false }
            return proto.providerBundleIdentifier == providerBundleIdentifier
        }
    }

    private func save(_ manager: NETunnelProviderManager) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            manager.saveToPreferences { error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: ()) }
            }
        }
    }

    private func load(_ manager: NETunnelProviderManager) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            manager.loadFromPreferences { error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: ()) }
            }
        }
    }

    private func remove(_ manager: NETunnelProviderManager) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            manager.removeFromPreferences { error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: ()) }
            }
        }
    }
}
