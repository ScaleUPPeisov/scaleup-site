import Foundation
import WireGuardKit

enum MeduzaTunnelBuilderError: LocalizedError {
    case invalidField(String)

    var errorDescription: String? {
        switch self {
        case .invalidField(let field): return "Invalid Meduza field: \(field)"
        }
    }
}

enum MeduzaTunnelBuilder {
    static func build(from config: MeduzaConfig, name: String = "PEISOV VPN") throws -> TunnelConfiguration {
        guard
            let privateKeyText = config.interface["privatekey"],
            let privateKey = PrivateKey(base64Key: privateKeyText)
        else { throw MeduzaTunnelBuilderError.invalidField("Interface.PrivateKey") }

        var interface = InterfaceConfiguration(privateKey: privateKey)

        interface.addresses = try splitList(config.interface["address"]).map {
            guard let value = IPAddressRange(from: $0) else {
                throw MeduzaTunnelBuilderError.invalidField("Interface.Address")
            }
            return value
        }

        interface.dns = try splitList(config.interface["dns"]).map {
            guard let value = DNSServer(from: $0) else {
                throw MeduzaTunnelBuilderError.invalidField("Interface.DNS")
            }
            return value
        }

        if let mtu = config.interface["mtu"], !mtu.isEmpty {
            guard let parsed = UInt16(mtu) else { throw MeduzaTunnelBuilderError.invalidField("Interface.MTU") }
            interface.mtu = parsed
        }

        interface.junkPacketCount = try uint16(config.interface["jc"], field: "Jc")
        interface.junkPacketMinSize = try uint16(config.interface["jmin"], field: "Jmin")
        interface.junkPacketMaxSize = try uint16(config.interface["jmax"], field: "Jmax")
        interface.initPacketJunkSize = try uint16(config.interface["s1"], field: "S1")
        interface.responsePacketJunkSize = try uint16(config.interface["s2"], field: "S2")
        interface.cookieReplyPacketJunkSize = try uint16(config.interface["s3"], field: "S3")
        interface.transportPacketJunkSize = try uint16(config.interface["s4"], field: "S4")

        interface.initPacketMagicHeader = config.interface["h1"]
        interface.responsePacketMagicHeader = config.interface["h2"]
        interface.underloadPacketMagicHeader = config.interface["h3"]
        interface.transportPacketMagicHeader = config.interface["h4"]
        interface.specialJunk1 = config.interface["i1"]
        interface.specialJunk2 = config.interface["i2"]
        interface.specialJunk3 = config.interface["i3"]
        interface.specialJunk4 = config.interface["i4"]
        interface.specialJunk5 = config.interface["i5"]

        if let key = config.interface["headerprotectionkey"], !key.isEmpty {
            guard let parsed = PrivateKey(base64Key: key) else {
                throw MeduzaTunnelBuilderError.invalidField("HeaderProtectionKey")
            }
            interface.headerProtectionKey = parsed
        }

        interface.contentPaddingAddition = config.interface["contentpaddingaddition"]
        interface.rekeyAfterTime = config.interface["rekeyaftertime"]
        interface.rekeyTimeout = config.interface["rekeytimeout"]
        interface.rejectAfterTime = config.interface["rejectaftertime"]
        interface.keepaliveTimeout = config.interface["keepalivetimeout"]
        interface.maxHandshakeAttempts = config.interface["maxhandshakeattempts"]
        interface.randomTrailers = config.interface["randomtrailers"]
        interface.disableCookies = config.interface["disablecookies"]

        let peers = try config.peers.map { peerMap -> PeerConfiguration in
            guard
                let publicKeyText = peerMap["publickey"],
                let publicKey = PublicKey(base64Key: publicKeyText)
            else { throw MeduzaTunnelBuilderError.invalidField("Peer.PublicKey") }

            var peer = PeerConfiguration(publicKey: publicKey)

            if let psk = peerMap["presharedkey"], !psk.isEmpty {
                guard let parsed = PreSharedKey(base64Key: psk) else {
                    throw MeduzaTunnelBuilderError.invalidField("Peer.PresharedKey")
                }
                peer.preSharedKey = parsed
            }

            peer.allowedIPs = try splitList(peerMap["allowedips"]).map {
                guard let parsed = IPAddressRange(from: $0) else {
                    throw MeduzaTunnelBuilderError.invalidField("Peer.AllowedIPs")
                }
                return parsed
            }

            if let endpointText = peerMap["endpoint"], !endpointText.isEmpty {
                guard let endpoint = Endpoint(from: endpointText) else {
                    throw MeduzaTunnelBuilderError.invalidField("Peer.Endpoint")
                }
                peer.endpoint = endpoint
            }

            if let keepalive = peerMap["persistentkeepalive"], !keepalive.isEmpty {
                peer.persistentKeepAlive = keepalive
            }

            return peer
        }

        return TunnelConfiguration(name: name, interface: interface, peers: peers)
    }

    private static func splitList(_ value: String?) -> [String] {
        guard let value else { return [] }
        return value
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    private static func uint16(_ value: String?, field: String) throws -> UInt16? {
        guard let value, !value.isEmpty else { return nil }
        guard let parsed = UInt16(value) else {
            throw MeduzaTunnelBuilderError.invalidField(field)
        }
        return parsed
    }
}
