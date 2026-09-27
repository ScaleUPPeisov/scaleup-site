import SwiftUI

@main
struct PEISOVVPNApp: App {
    @StateObject private var model = VPNViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(model)
                .preferredColorScheme(.dark)
        }
    }
}
