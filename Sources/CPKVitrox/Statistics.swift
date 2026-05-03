import Foundation

// MARK: - Statistics
struct Statistics {

    /// Returns (mean, population standard deviation) for an array of values.
    static func calculate(_ values: [Double]) -> (mean: Double, stdDev: Double) {
        let n = Double(values.count)
        guard n > 0 else { return (0, 0) }
        let mean   = values.reduce(0, +) / n
        let sumSq  = values.reduce(0.0) { $0 + pow($1 - mean, 2) }
        return (mean, sqrt(sumSq / n))
    }

    /// Returns (Cp, Cpk) process-capability indices.
    static func cpk(mean: Double, stdDev: Double, lsl: Double, usl: Double) -> (cp: Double, cpk: Double) {
        guard stdDev > 0 else { return (0, 0) }
        let cpu = (usl - mean) / (3 * stdDev)
        let cpl = (mean - lsl) / (3 * stdDev)
        let cp  = (usl - lsl) / (6 * stdDev)
        return (cp, min(cpu, cpl))
    }
}
