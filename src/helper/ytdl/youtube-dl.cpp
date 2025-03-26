#include "youtube-dl.hpp"
#include <core/global/globals.hpp>
#include <fancy.hpp>
#include <helper/misc/misc.hpp>
#include <optional>

namespace Soundux::Objects
{
    const std::regex YoutubeDl::urlRegex(
        R"(https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&\/\/=]*))");

    void YoutubeDl::setup()
    {
        // Disable functionality
        isAvailable = false;
        Fancy::fancy.logTime().warning() << "youtube-dl functionality has been disabled in this build" << std::endl;
    }

    std::optional<nlohmann::json> YoutubeDl::getInfo(const std::string &url) const
    {
        // Return nothing
        Globals::gGui->onError(Enums::ErrorCode::YtdlInformationUnknown);
        return std::nullopt;
    }

    bool YoutubeDl::download(const std::string &url)
    {
        // Always return false
        Globals::gGui->onError(Enums::ErrorCode::YtdlNotFound);
        return false;
    }

    void YoutubeDl::killDownload()
    {
        // Do nothing
    }

    bool YoutubeDl::available() const
    {
        // Always return false
        return false;
    }
}