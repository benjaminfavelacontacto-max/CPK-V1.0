import SwiftUI

// MARK: - MagType
enum MagType: String, CaseIterable, Identifiable {
    case highM11 = "High Mag (M11)"
    case lowM15  = "Low Mag (M15)"
    case lowM19  = "Low Mag (M19)"

    var id: Self { self }

    var safeFileName: String {
        switch self {
        case .highM11: return "HighMag_M11"
        case .lowM15:  return "LowMag_M15"
        case .lowM19:  return "LowMag_M19"
        }
    }
}

// MARK: - LogEntry
struct LogEntry: Identifiable {
    let id       = UUID()
    let filename : String
    let x        : Double
    let y        : Double
    let magType  : MagType
}

// MARK: - PrincipleStatus
struct PrincipleStatus {
    let text    : String
    let bg      : Color
    let textCol : Color

    static func get(for value: Double) -> PrincipleStatus {
        if value >= 2.0  { return PrincipleStatus(text: "Excellent",  bg: .green,                              textCol: .white) }
        if value >= 1.67 { return PrincipleStatus(text: "Optimal",    bg: .cyan,                               textCol: .black) }
        if value >= 1.33 { return PrincipleStatus(text: "Good",       bg: Color(red: 0.4, green: 0.8, blue: 0.4), textCol: .white) }
        if value >= 1.0  { return PrincipleStatus(text: "Acceptable", bg: Color(white: 0.9),                   textCol: .black) }
        if value >= 0.67 { return PrincipleStatus(text: "Bad",        bg: .orange,                             textCol: .white) }
        return                    PrincipleStatus(text: "Terrible",   bg: .red,                                textCol: .white)
    }
}

// MARK: - MagLimits
struct MagLimits {
    var xLSL: String
    var xUSL: String
    var yLSL: String
    var yUSL: String
}
