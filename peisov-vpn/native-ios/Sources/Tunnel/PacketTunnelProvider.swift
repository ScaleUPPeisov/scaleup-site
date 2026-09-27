import Foundation
import NetworkExtension
import os
import WireGuardKit

final class PacketTunnelProvider: NEPacketTunnelProvider {
    private let logger = Logger(subsystem: "com.peisov.vpn", category: "PacketTunnel")

    private lazy var adapter = WireGuardAdapter(with: self) { [weak self] level, message in
        switch level {
        case .error:
            self?.logger.error("\(message, privacy: .public)")
        case .verbose:
            self?.logger.debug("\(message, privacy: .public)")
        @unknown default:
            self?.logger.debug("\(message, privacy: .public)")
        }
    }

    override func startTunnel(
        options: [String: NSObject]?,
        completionHandler: @escaping (Error?) -> Void
    ) {
        do {
            guard
                let tunnelProtocol = protocolConfiguration as? NETunnelProviderProtocol,
                let providerConfiguration = tunnelProtocol.providerConfiguration,
                let account = providerConfiguration["configAccount"] as? String
            else {
                throw NSError(
                    domain: "PEISOVVPN.PacketTunnel",
                    code: 1001,
                    userInfo: [NSLocalizedDescriptionKey: "Missing configAccount"]
                )
            }

            let raw = try SharedKeychain.load(account: account)
            let parsed = try MeduzaConfigParser.parse(raw)
            let tunnel = try MeduzaTunnelBuilder.build(from: parsed)

            logger.info("Starting Meduza tunnel for endpoint \(parsed.endpoint ?? "unknown", privacy: .public)")

            adapter.start(tunnelConfiguration: tunnel) { [weak self] error in
                if let error {
                    self?.logger.error("Tunnel start failed: \(String(describing: error), privacy: .public)")
                    completionHandler(error)
                } else {
                    self?.logger.info("Packet tunnel started")
                    completionHandler(nil)
                }
            }
        } catch {
            logger.error("Tunnel configuration failed: \(error.localizedDescription, privacy: .public)")
            completionHandler(error)
        }
    }

    override func stopTunnel(
        with reason: NEProviderStopReason,
        completionHandler: @escaping () -> Void
    ) {
        logger.info("Stopping packet tunnel, reason=\(reason.rawValue)")
        adapter.stop { [weak self] error in
            if let error {
                self?.logger.error("Tunnel stop error: \(String(describing: error), privacy: .public)")
            }
            completionHandler()
        }
    }

    override func handleAppMessage(
        _ messageData: Data,
        completionHandler: ((Data?) -> Void)? = nil
    ) {
        guard let completionHandler else { return }

        if messageData.count == 1, messageData.first == 0 {
            adapter.getRuntimeConfiguration { runtime in
                completionHandler(runtime?.data(using: .utf8))
            }
        } else {
            completionHandler(nil)
        }
    }
}
