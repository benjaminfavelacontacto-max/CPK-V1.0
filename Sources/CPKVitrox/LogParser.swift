import Foundation

// MARK: - Log Parser
struct LogParser {

    /// Reads all `.log` files inside `folder` and returns parsed `LogEntry` objects
    /// sorted by filename.
    static func parse(folder: URL) -> [LogEntry] {
        guard let files = try? FileManager.default
                .contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)
        else { return [] }

        var loaded: [LogEntry] = []

        for file in files where file.pathExtension == "log" {
            guard let content = try? String(contentsOf: file) else { continue }

            let magType: MagType = content.contains("M11") ? .highM11
                                 : content.contains("M15") ? .lowM15
                                 : .lowM19

            let lines = content.components(separatedBy: .newlines)

            guard
                let headerIdx = lines.firstIndex(where: { $0.contains("NewLocationX(nm)") }),
                lines.count > headerIdx + 1
            else { continue }

            let headers = lines[headerIdx].components(separatedBy: ",")
            let data    = lines[headerIdx + 1].components(separatedBy: ",")

            guard
                let xIdx = headers.firstIndex(of: "NewLocationX(nm)"),
                let yIdx = headers.firstIndex(of: "NewLocationY(nm)"),
                xIdx < data.count,
                yIdx < data.count,
                let x = Double(data[xIdx]),
                let y = Double(data[yIdx])
            else { continue }

            loaded.append(LogEntry(filename: file.lastPathComponent, x: x, y: y, magType: magType))
        }

        return loaded.sorted { $0.filename < $1.filename }
    }
}
