#if defined(_WIN32)
#include "../systeminfo.hpp"
#include <Windows.h>
#include "../../../helper/misc/misc.hpp"
#include <string>
#include <sstream>

std::string SystemInfo::getSystemInfo()
{
    auto [result, success] = Soundux::Helpers::getResultCompact("cmd /c ver");
    if (success && !result.empty()) {
        result.erase(std::remove(result.begin(), result.end(), '\r'));
        return result;
    }
    return "winver failed\n";
}

std::string SystemInfo::getLocalIP()
{
    try {
        // Get all IPv4 addresses and return the first non-localhost one
        auto [result, success] = Soundux::Helpers::getResultCompact(
            "cmd /c \"for /f \"tokens=14 delims= \" %a in ('ipconfig ^| findstr IPv4') do @echo %a\""
        );
        
        if (success && !result.empty()) {
            // Split by newlines and get first non-localhost IP
            std::istringstream iss(result);
            std::string ip;
            while (std::getline(iss, ip)) {
                ip.erase(std::remove(ip.begin(), ip.end(), '\r'), ip.end());
                if (ip != "127.0.0.1" && !ip.empty()) {
                    return ip; // Return first valid non-localhost IP
                }
            }
        }
    } catch (...) {
        // Ignore any errors and return default
    }
    return "IP Unavailable";
}
#endif
