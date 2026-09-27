# PEISOV VPN Native iOS 0.2.0 RC

This is the native iPhone client path for PEISOV VPN.

## What is implemented

- SwiftUI iPhone app.
- Native `NetworkExtension` packet-tunnel provider.
- Import of Meduza `.conf` files from the iOS Files picker.
- Raw configuration is stored in a shared Keychain access group, not in UserDefaults.
- The packet-tunnel extension reads the Keychain config and converts it to `WireGuardKit` / AmneziaWG tunnel configuration.
- AmneziaWG 3.x fields are mapped, including Jc/Jmin/Jmax, S1-S4, H1-H4, I1-I5, HeaderProtectionKey, timing ranges, RandomTrailers and DisableCookies.
- UI reports `Protected` only after iOS reports the tunnel connected and the engine runtime reports a non-zero handshake.
- No real Meduza secret or customer config is committed.

## Dependency

Pinned:
`amnezia-vpn/amneziawg-apple@9d5ee60edefa95b933a738dd7cda671dd18021fc`.

The dependency's Go backend must be built before Xcode links `WireGuardKit`; `scripts/build-rc.sh` performs that step.

## Local build

Requirements:
- macOS with Xcode
- Go
- XcodeGen
- Apple Developer signing for installation on a physical iPhone

Run:

```bash
cd peisov-vpn/native-ios
./scripts/build-rc.sh
```

The CI gate builds without signing. A real iPhone install requires an Apple Development certificate/provisioning profile with the Packet Tunnel Provider capability.

## Security

The app stores the imported raw config in the iOS Keychain using the shared group:
`$(AppIdentifierPrefix)com.peisov.vpn.shared`.

The NetworkExtension profile stores only a keychain account identifier and protocol metadata; it does not store private keys in `providerConfiguration`.

## Release rule

This folder is an RC. Do not publish an IPA/TestFlight/App Store build until explicit release approval and a physical iPhone tunnel test pass.
