#include "youtube-dl.hpp"
#include <core/global/globals.hpp>
#include <fancy.hpp>

namespace Soundux::Objects
{
    void YoutubeDl::setup()
    {
        isAvailable = false;
    }

    std::optional<nlohmann::json> YoutubeDl::getInfo(const std::string &url) const
    {
        if (Globals::gGui)
        {
            Globals::gGui->onError(Enums::ErrorCode::YtdlInformationUnknown);
        }
        return std::nullopt;
    }

    bool YoutubeDl::download(const std::string &url)
    {
        if (Globals::gGui)
        {
            Globals::gGui->onError(Enums::ErrorCode::YtdlNotFound);
        }
        return false;
    }

    void YoutubeDl::killDownload()
    {
        // This functionality is disabled.
    }

    bool YoutubeDl::available() const
    {
        return false;
    }
} // namespace Soundux::Objects