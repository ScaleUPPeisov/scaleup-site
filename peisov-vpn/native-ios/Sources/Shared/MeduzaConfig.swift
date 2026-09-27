import Foundation

struct MeduzaConfig: Equatable {
    let protocolID: String
    let interface: [String: String]
    let peers: [[String: String]]

    var endpoint: String? { peers.first?["endpoint"] }
    var address: String? { interface["address"] }
    var dns: String? { interface["dns"] }
    var mtu: String? { interface["mtu"] }

    var displaySummary: String {
        let endpointText = endpoint ?? "No endpoint"
        let mtuText = mtu ?? "auto"
        return "\(protocolID.uppercased()) · \(endpointText) · MTU \(mtuText)"
    }
}

enum MeduzaConfigError: LocalizedError, Equatable {
    case empty
    case malformedLine(Int)
    case missingInterface
    case missingPeer
    case missingField(String)
    case notMeduza

    var errorDescription: String? {
        switch self {
        case .empty: return "Файл конфигурации пустой."
        case .malformedLine(let line): return "Некорректная строка конфигурации: \(line)."
        case .missingInterface: return "В конфигурации нет секции [Interface]."
        case .missingPeer: return "В конфигурации нет секции [Peer]."
        case .missingField(let field): return "В конфигурации отсутствует \(field)."
        case .notMeduza: return "Файл не распознан как Meduza VPN."
        }
    }
}

enum MeduzaConfigParser {
    private static let meduzaKeys: Set<String> = [
        "jc", "jmin", "jmax", "s1", "s2", "s3", "s4",
        "h1", "h2", "h3", "h4", "i1", "i2", "i3", "i4", "i5",
        "headerprotectionkey", "contentpaddingaddition",
        "rekeyaftertime", "rekeytimeout", "rejectaftertime",
        "keepalivetimeout", "maxhandshakeattempts",
        "randomtrailers", "disablecookies"
    ]

    static func parse(_ raw: String) throws -> MeduzaConfig {
        let normalized = raw
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        guard !normalized.isEmpty else { throw MeduzaConfigError.empty }

        enum Section {
            case none
            case interface
            case peer(Int)
        }

        var section: Section = .none
        var interface = [String: String]()
        var peers = [[String: String]]()
        var protocolID = ""
        var meduzaHintCount = 0

        for (offset, rawLine) in normalized.split(separator: "\n", omittingEmptySubsequences: false).enumerated() {
            let lineNumber = offset + 1
            let trimmed = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty { continue }

            if trimmed.hasPrefix("#") || trimmed.hasPrefix(";") {
                let comment = trimmed.dropFirst().trimmingCharacters(in: .whitespaces)
                let lower = comment.lowercased()
                if let range = lower.range(of: "protocol id:") {
                    let distance = lower.distance(from: lower.startIndex, to: range.upperBound)
                    let originalStart = comment.index(comment.startIndex, offsetBy: distance)
                    let value = comment[originalStart...]
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                        .split(whereSeparator: { $0.isWhitespace || $0 == ";" })
                        .first
                    if let value { protocolID = String(value).lowercased() }
                }
                continue
            }

            let content: String
            if let hash = trimmed.firstIndex(of: "#") {
                content = String(trimmed[..<hash]).trimmingCharacters(in: .whitespacesAndNewlines)
            } else {
                content = trimmed
            }
            if content.isEmpty { continue }

            if content.caseInsensitiveCompare("[Interface]") == .orderedSame {
                section = .interface
                continue
            }
            if content.caseInsensitiveCompare("[Peer]") == .orderedSame {
                peers.append([:])
                section = .peer(peers.count - 1)
                continue
            }

            guard let equals = content.firstIndex(of: "=") else {
                throw MeduzaConfigError.malformedLine(lineNumber)
            }
            let key = content[..<equals].trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let value = content[content.index(after: equals)...].trimmingCharacters(in: .whitespacesAndNewlines)
            guard !key.isEmpty else { throw MeduzaConfigError.malformedLine(lineNumber) }

            if meduzaKeys.contains(key) { meduzaHintCount += 1 }

            switch section {
            case .interface:
                merge(key: key, value: value, into: &interface)
            case .peer(let index):
                merge(key: key, value: value, into: &peers[index])
            case .none:
                throw MeduzaConfigError.malformedLine(lineNumber)
            }
        }

        guard !interface.isEmpty else { throw MeduzaConfigError.missingInterface }
        guard !peers.isEmpty else { throw MeduzaConfigError.missingPeer }

        for required in ["privatekey", "address"] where interface[required]?.isEmpty != false {
            throw MeduzaConfigError.missingField("Interface.\(required)")
        }
        for required in ["publickey", "allowedips", "endpoint"] where peers.first?[required]?.isEmpty != false {
            throw MeduzaConfigError.missingField("Peer.\(required)")
        }

        let isMeduza = protocolID == "meduza" || meduzaHintCount >= 3
        guard isMeduza else { throw MeduzaConfigError.notMeduza }

        return MeduzaConfig(
            protocolID: protocolID.isEmpty ? "meduza" : protocolID,
            interface: interface,
            peers: peers
        )
    }

    private static func merge(key: String, value: String, into dictionary: inout [String: String]) {
        let multiValueKeys: Set<String> = ["address", "dns", "allowedips"]
        if multiValueKeys.contains(key), let current = dictionary[key], !current.isEmpty {
            dictionary[key] = current + ", " + value
        } else {
            dictionary[key] = value
        }
    }
}
