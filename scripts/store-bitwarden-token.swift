import Foundation
import Security
import Darwin

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

if CommandLine.arguments.contains("--help") {
    print("Store a Bitwarden Secrets Manager access token in the macOS login keychain.\nEnter the token at the hidden prompt, or provide it on standard input.\nThe token is never passed as a command argument or printed.")
    exit(0)
}
guard CommandLine.arguments.count == 1 else {
    fail("Pass the token on standard input, not as an argument.")
}

func readToken() -> String {
    if isatty(STDIN_FILENO) == 0 {
        return String(data: FileHandle.standardInput.readDataToEndOfFile(), encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }
    var original = termios()
    guard tcgetattr(STDIN_FILENO, &original) == 0 else { fail("Could not secure terminal input.") }
    var hidden = original
    hidden.c_lflag &= ~tcflag_t(ECHO)
    guard tcsetattr(STDIN_FILENO, TCSAFLUSH, &hidden) == 0 else { fail("Could not hide terminal input.") }
    defer {
        tcsetattr(STDIN_FILENO, TCSAFLUSH, &original)
        FileHandle.standardError.write(Data("\n".utf8))
    }
    FileHandle.standardError.write(Data("Bitwarden Secrets Manager access token: ".utf8))
    return readLine()?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
}

let token = readToken()
guard !token.isEmpty else { fail("No token supplied. Nothing was stored.") }
guard token.range(of: #"^0\.[^.\s]+\.[^:\s]+:\S+$"#, options: .regularExpression) != nil else {
    fail("Expected a complete Secrets Manager machine-account access token. Create one under Secrets Manager → Machine accounts → Access tokens. Nothing was stored.")
}
let env = ProcessInfo.processInfo.environment
let service = env["BITWARDEN_KEYCHAIN_SERVICE"] ?? "roomform.bitwarden-access-token"
let account = env["BITWARDEN_KEYCHAIN_ACCOUNT"] ?? NSUserName()
let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: service,
    kSecAttrAccount as String: account,
]
var item = query
item[kSecValueData as String] = Data(token.utf8)
item[kSecAttrLabel as String] = "Roomform — Bitwarden Secrets Manager"
item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
var status = SecItemAdd(item as CFDictionary, nil)
if status == errSecDuplicateItem {
    status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: Data(token.utf8)] as CFDictionary)
}
guard status == errSecSuccess else {
    let reason = SecCopyErrorMessageString(status, nil) as String? ?? "Keychain error \(status)"
    fail("Could not store token: \(reason)")
}
print("Stored the Bitwarden access token in macOS Keychain (\(service)).")
