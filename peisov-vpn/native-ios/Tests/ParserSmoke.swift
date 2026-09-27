import Foundation

let fakeKeyA = Data(repeating: 1, count: 32).base64EncodedString()
let fakeKeyB = Data(repeating: 2, count: 32).base64EncodedString()
let fakeKeyC = Data(repeating: 3, count: 32).base64EncodedString()
let fakeKeyD = Data(repeating: 4, count: 32).base64EncodedString()

let config = """
# Meduza; protocol id: meduza
[Interface]
PrivateKey = \(fakeKeyA)
Address = 10.14.14.2/32, fd00:1414::2/128
DNS = 1.1.1.1, 1.0.0.1
MTU = 1280
Jc = 5
Jmin = 37
Jmax = 167
S1 = 12
S2 = 12
S3 = 12
S4 = 12
H1 = 1
H2 = 2
H3 = 3
H4 = 4
RekeyAfterTime = 101-115
RekeyTimeout = 4-7
RejectAfterTime = 148-171
KeepaliveTimeout = 11-14
MaxHandshakeAttempts = 6-7
RandomTrailers = on
DisableCookies = on
HeaderProtectionKey = \(fakeKeyB)
I1 = <b 0xce><b 0x00000001><b 0x0f><r 15><b 0x05><r 5><b 0x00><b 0x42b2><r 690>
I2 = <b 0x47><r 8><r 79>

[Peer]
PublicKey = \(fakeKeyC)
PresharedKey = \(fakeKeyD)
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = 203.0.113.10:443
PersistentKeepalive = 14-17
"""

let parsed = try MeduzaConfigParser.parse(config)
precondition(parsed.protocolID == "meduza")
precondition(parsed.endpoint == "203.0.113.10:443")
precondition(parsed.interface["randomtrailers"] == "on")
precondition(parsed.interface["disablecookies"] == "on")
precondition(parsed.interface["headerprotectionkey"] == fakeKeyB)
precondition(parsed.peers.first?["presharedkey"] == fakeKeyD)

let serialized = String(describing: parsed.displaySummary)
precondition(!serialized.contains(fakeKeyA))
precondition(!serialized.contains(fakeKeyB))
precondition(!serialized.contains(fakeKeyD))

print("PEISOV_NATIVE_MEDUZA_PARSER=PASS")
