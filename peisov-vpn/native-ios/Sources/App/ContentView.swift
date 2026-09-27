import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @EnvironmentObject private var model: VPNViewModel
    @State private var showImporter = false

    private var isProtected: Bool {
        model.vpn.status == .connected && model.vpn.handshakeVerified
    }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color.black, Color(red: 0.03, green: 0.04, blue: 0.07)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                header
                Spacer(minLength: 24)
                statusBlock
                Spacer(minLength: 28)
                connectButton
                Spacer(minLength: 34)
                configurationCard
                Spacer()
                footer
            }
            .padding(.horizontal, 22)
            .padding(.top, 14)
            .padding(.bottom, 18)
        }
        .fileImporter(
            isPresented: $showImporter,
            allowedContentTypes: [.data],
            allowsMultipleSelection: false
        ) { result in
            switch result {
            case .success(let urls):
                if let url = urls.first {
                    Task { await model.importConfig(from: url) }
                }
            case .failure(let error):
                model.errorMessage = error.localizedDescription
            }
        }
        .alert("PEISOV VPN", isPresented: Binding(
            get: { model.errorMessage != nil },
            set: { if !$0 { model.errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) { model.errorMessage = nil }
        } message: {
            Text(model.errorMessage ?? "")
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            Image("peisov-logo")
                .resizable()
                .scaledToFill()
                .frame(width: 42, height: 42)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text("PEISOV VPN")
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                Text("NATIVE iOS · 0.2.0 RC")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.secondary)
                    .tracking(1.2)
            }

            Spacer()

            Circle()
                .fill(isProtected ? Color.green : Color.white.opacity(0.12))
                .frame(width: 10, height: 10)
                .shadow(color: isProtected ? Color.green.opacity(0.55) : .clear, radius: 8)
        }
    }

    private var statusBlock: some View {
        VStack(spacing: 8) {
            Text("PROTECTION STATUS")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.secondary)
                .tracking(1.6)

            Text(model.statusTitle)
                .font(.system(size: 24, weight: .bold, design: .rounded))

            if let endpoint = model.endpoint {
                Text(endpoint)
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundColor(.secondary)
            }
        }
    }

    private var connectButton: some View {
        Button {
            if model.importedName == nil {
                showImporter = true
            } else {
                model.tapConnect()
            }
        } label: {
            ZStack {
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [
                                Color(red: 0.32, green: 0.42, blue: 1.0).opacity(isProtected ? 0.42 : 0.18),
                                Color.black.opacity(0.2)
                            ],
                            center: .center,
                            startRadius: 4,
                            endRadius: 95
                        )
                    )
                    .overlay(
                        Circle()
                            .stroke(Color.white.opacity(0.16), lineWidth: 1)
                    )
                    .shadow(
                        color: Color(red: 0.32, green: 0.42, blue: 1.0).opacity(isProtected ? 0.48 : 0.20),
                        radius: 30
                    )

                VStack(spacing: 10) {
                    Image(systemName: isProtected ? "checkmark.circle.fill" : "power")
                        .font(.system(size: 36, weight: .medium))
                    Text(model.actionTitle)
                        .font(.system(size: 11, weight: .bold))
                        .tracking(1.3)
                }
            }
            .frame(width: 184, height: 184)
        }
        .buttonStyle(.plain)
        .disabled(!model.canTapConnect)
        .opacity(model.canTapConnect ? 1 : 0.65)
    }

    private var configurationCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(model.importedName ?? "Meduza .conf")
                        .font(.system(size: 15, weight: .semibold))
                    Text(model.configSummary ?? "Import a Meduza configuration to create the native tunnel.")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .lineLimit(2)
                }
                Spacer()
                Image(systemName: model.importedName == nil ? "square.and.arrow.down" : "lock.shield.fill")
                    .foregroundColor(model.importedName == nil ? .secondary : .green)
            }

            Divider().overlay(Color.white.opacity(0.08))

            HStack(spacing: 12) {
                Button("Import .conf") { showImporter = true }
                    .buttonStyle(PEISOVSecondaryButtonStyle())

                if model.importedName != nil {
                    Button("Remove", role: .destructive) {
                        Task { await model.removeConfiguration() }
                    }
                    .buttonStyle(PEISOVSecondaryButtonStyle())
                }
            }
        }
        .padding(18)
        .background(Color.white.opacity(0.045))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var footer: some View {
        Text("Private keys stay in the shared iOS Keychain. Protected is shown only after the packet tunnel is connected and the engine reports a real handshake.")
            .font(.system(size: 10))
            .foregroundColor(.secondary)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 8)
    }
}

private struct PEISOVSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 12, weight: .semibold))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 11)
            .background(Color.white.opacity(configuration.isPressed ? 0.10 : 0.06))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}
