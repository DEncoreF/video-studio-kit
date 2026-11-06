// OCR with macOS Vision (no extra install). Prints one JSON line per input image:
// {"file": "...", "lines": [{"text": "...", "conf": 0.0-1.0}], "error": "..."}
import Foundation
import Vision

for path in CommandLine.arguments.dropFirst() {
  var lines: [[String: Any]] = []
  var error: String? = nil
  let req = VNRecognizeTextRequest()
  req.recognitionLevel = .accurate
  req.recognitionLanguages = ["zh-Hant", "en-US"]
  req.usesLanguageCorrection = false
  do {
    try VNImageRequestHandler(url: URL(fileURLWithPath: path)).perform([req])
    for o in req.results ?? [] {
      if let c = o.topCandidates(1).first { lines.append(["text": c.string, "conf": Double(c.confidence)]) }
    }
  } catch let e { error = "\(e)" }
  var out: [String: Any] = ["file": path, "lines": lines]
  if let e = error { out["error"] = e }
  let data = try! JSONSerialization.data(withJSONObject: out)
  print(String(data: data, encoding: .utf8)!)
}
