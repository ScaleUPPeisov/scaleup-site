import Foundation
import Security

enum SharedKeychainError: LocalizedError {
    case unexpectedStatus(OSStatus)
    case invalidData

    var errorDescription: String? {
        switch self {
        case .unexpectedStatus(let status):
            return "Keychain error: \(status)"
        case .invalidData:
            return "Keychain returned invalid data."
        }
    }
}

enum SharedKeychain {
    static let service = "com.peisov.vpn.config"

    private static var accessGroup: String? {
        guard
            let value = Bundle.main.object(forInfoDictionaryKey: "PEISOVKeychainAccessGroup") as? String,
            !value.isEmpty,
            !value.contains("$(")
        else { return nil }
        return value
    }

    static func save(_ string: String, account: String) throws {
        guard let data = string.data(using: .utf8) else { throw SharedKeychainError.invalidData }

        var query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account
        ]
        if let accessGroup { query[kSecAttrAccessGroup] = accessGroup }

        SecItemDelete(query as CFDictionary)

        query[kSecValueData] = data
        query[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw SharedKeychainError.unexpectedStatus(status)
        }
    }

    static func load(account: String) throws -> String {
        var query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne
        ]
        if let accessGroup { query[kSecAttrAccessGroup] = accessGroup }

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess else {
            throw SharedKeychainError.unexpectedStatus(status)
        }
        guard
            let data = item as? Data,
            let string = String(data: data, encoding: .utf8)
        else {
            throw SharedKeychainError.invalidData
        }
        return string
    }

    static func delete(account: String) {
        var query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account
        ]
        if let accessGroup { query[kSecAttrAccessGroup] = accessGroup }
        SecItemDelete(query as CFDictionary)
    }
}
