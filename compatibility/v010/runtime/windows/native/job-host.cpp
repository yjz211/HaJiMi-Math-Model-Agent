#define _WIN32_WINNT 0x0A00
#define UNICODE
#define _UNICODE
#include <windows.h>
#include <aclapi.h>
#include <sddl.h>
#include <string>
#include <vector>
#include <iostream>

// Build with /MT: end users do not need Visual Studio or the VC redistributable.
struct Handle {
    HANDLE value;
    explicit Handle(HANDLE h = nullptr) : value(h) {}
    ~Handle() { if (value && value != INVALID_HANDLE_VALUE) CloseHandle(value); }
    Handle(const Handle&) = delete; Handle& operator=(const Handle&) = delete;
};
static int fail(const wchar_t* message, DWORD code = GetLastError()) {
    std::wcerr << message << L" (Win32 " << code << L")\n"; return 125;
}
// CommandLineToArgvW/CRT-compatible quoting. No cmd.exe or PowerShell interpolation.
static std::wstring quote(const std::wstring& s) {
    std::wstring result = L"\""; size_t slashes = 0;
    for (wchar_t c : s) {
        if (c == L'\\') { ++slashes; continue; }
        if (c == L'\"') result.append(slashes * 2 + 1, L'\\');
        else result.append(slashes, L'\\');
        slashes = 0; result += c;
    }
    result.append(slashes * 2, L'\\'); return result + L"\"";
}
struct Watch { HANDLE control; HANDLE job; };
static DWORD WINAPI watchParent(void* value) {
    Watch* w = static_cast<Watch*>(value); char bytes[256]; DWORD count;
    while (ReadFile(w->control, bytes, sizeof(bytes), &count, nullptr) && count) {}
    TerminateJobObject(w->job, 130); return 0;
}
static bool ownedByCurrentUser(const wchar_t* directory) {
    HANDLE raw = nullptr;
    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &raw)) return false;
    Handle token(raw); DWORD size = 0;
    GetTokenInformation(token.value, TokenUser, nullptr, 0, &size);
    std::vector<BYTE> memory(size);
    if (!GetTokenInformation(token.value, TokenUser, memory.data(), size, &size)) return false;
    PSID owner = nullptr; PSECURITY_DESCRIPTOR descriptor = nullptr;
    DWORD result = GetNamedSecurityInfoW(const_cast<LPWSTR>(directory), SE_FILE_OBJECT, OWNER_SECURITY_INFORMATION, &owner, nullptr, nullptr, nullptr, &descriptor);
    bool same = result == ERROR_SUCCESS && EqualSid(owner, reinterpret_cast<TOKEN_USER*>(memory.data())->User.Sid);
    if (descriptor) LocalFree(descriptor); return same;
}
int wmain(int argc, wchar_t** argv) {
    if (argc == 3 && std::wstring(argv[1]) == L"--assert-owned") return ownedByCurrentUser(argv[2]) ? 0 : fail(L"Runtime home must be owned by the current Windows user", ERROR_ACCESS_DENIED);
    if (argc == 3 && std::wstring(argv[1]) == L"--lock") {
        Handle lock(CreateFileW(argv[2], GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr));
        if (lock.value == INVALID_HANDLE_VALUE) {
            DWORD error = GetLastError();
            if (error == ERROR_SHARING_VIOLATION || error == ERROR_LOCK_VIOLATION) return 73;
            return fail(L"Cannot open runtime lock", error);
        }
        // Write a byte-stable LF handshake; CRT text mode translates '\n' to CRLF on Windows.
        const char locked[] = "LOCKED\n"; DWORD written = 0;
        if (!WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), locked, sizeof(locked) - 1, &written, nullptr) || written != sizeof(locked) - 1) return fail(L"Cannot announce runtime lock");
        char buffer[256]; DWORD bytes;
        while (ReadFile(GetStdHandle(STD_INPUT_HANDLE), buffer, sizeof(buffer), &bytes, nullptr) && bytes) {}
        return 0; // OS releases the lock after normal exit, cancellation, or a crash.
    }
    if (argc < 3 || std::wstring(argv[1]) != L"--run") return fail(L"Usage: job-host --run ABSOLUTE_EXE [args...] | --lock FILE | --assert-owned DIRECTORY", 87);
    std::wstring executable(argv[2]);
    if (executable.size() < 3 || executable[1] != L':' || (executable[2] != L'\\' && executable[2] != L'/')) return fail(L"Executable must be an absolute local-drive path", 87);
    Handle job(CreateJobObjectW(nullptr, nullptr));
    if (!job.value) return fail(L"CreateJobObject failed");
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = {};
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    if (!SetInformationJobObject(job.value, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) return fail(L"SetInformationJobObject failed");
    SECURITY_ATTRIBUTES security = { sizeof(SECURITY_ATTRIBUTES), nullptr, TRUE };
    Handle input(CreateFileW(L"NUL", GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, &security, OPEN_EXISTING, 0, nullptr));
    if (input.value == INVALID_HANDLE_VALUE) return fail(L"Cannot open child stdin");
    STARTUPINFOEXW startup = {}; startup.StartupInfo.cb = sizeof(startup); startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
    startup.StartupInfo.hStdInput = input.value; startup.StartupInfo.hStdOutput = GetStdHandle(STD_OUTPUT_HANDLE); startup.StartupInfo.hStdError = GetStdHandle(STD_ERROR_HANDLE);
    SIZE_T attributeSize = 0;
    InitializeProcThreadAttributeList(nullptr, 1, 0, &attributeSize);
    std::vector<BYTE> attributeBytes(attributeSize);
    startup.lpAttributeList = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(attributeBytes.data());
    if (!InitializeProcThreadAttributeList(startup.lpAttributeList, 1, 0, &attributeSize)) return fail(L"Cannot initialize process attributes");
    if (!UpdateProcThreadAttribute(startup.lpAttributeList, 0, PROC_THREAD_ATTRIBUTE_JOB_LIST, &job.value, sizeof(HANDLE), nullptr, nullptr)) return fail(L"Cannot set atomic job assignment");
    if (!SetHandleInformation(startup.StartupInfo.hStdOutput, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT) || !SetHandleInformation(startup.StartupInfo.hStdError, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT)) return fail(L"Cannot inherit output pipes");
    std::wstring command;
    for (int i = 2; i < argc; i++) { if (i > 2) command += L' '; command += quote(argv[i]); }
    if (command.size() >= 32760) return fail(L"Windows command line is too long", 87);
    std::vector<wchar_t> mutableCommand(command.begin(), command.end()); mutableCommand.push_back(0);
    PROCESS_INFORMATION process = {};
    if (!CreateProcessW(executable.c_str(), mutableCommand.data(), nullptr, nullptr, TRUE, CREATE_SUSPENDED | CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT | EXTENDED_STARTUPINFO_PRESENT, nullptr, nullptr, &startup.StartupInfo, &process)) return fail(L"CreateProcess failed");
    Handle child(process.hProcess), thread(process.hThread);
    DeleteProcThreadAttributeList(startup.lpAttributeList);
    // PROC_THREAD_ATTRIBUTE_JOB_LIST assigns at creation, including the parent-crash
    // window before ResumeThread. There is no unassigned suspended child to orphan.
    Watch watch = { GetStdHandle(STD_INPUT_HANDLE), job.value };
    Handle watcher(CreateThread(nullptr, 0, watchParent, &watch, 0, nullptr));
    if (!watcher.value) return fail(L"Cannot monitor parent lifetime");
    if (ResumeThread(thread.value) == static_cast<DWORD>(-1)) { TerminateJobObject(job.value, 125); ExitProcess(125); }
    if (WaitForSingleObject(child.value, INFINITE) != WAIT_OBJECT_0) { TerminateJobObject(job.value, 125); ExitProcess(125); }
    DWORD code = 125; if (!GetExitCodeProcess(child.value, &code)) { TerminateJobObject(job.value, 125); ExitProcess(125); }
    // Do not leave a watcher referencing stack memory/handles during C++ destruction.
    // Closing the job first kills any surviving grandchildren; ExitProcess ends watcher too.
    CloseHandle(job.value); job.value = nullptr;
    ExitProcess(code);
}
