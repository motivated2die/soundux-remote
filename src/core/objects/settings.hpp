#pragma once
#include <core/enums/enums.hpp>
#include <string>
#include <vector>

namespace Soundux
{
    namespace Objects
    {
        struct Settings
        {
            Enums::BackendType audioBackend = Enums::BackendType::PulseAudio;
            Enums::ViewMode viewMode = Enums::ViewMode::List;
            Enums::Theme theme = Enums::Theme::System;

            std::vector<int> pushToTalkKeys;
            std::vector<int> stopHotkey;

            std::vector<std::string> outputs;
            std::uint32_t selectedTab = 0;

            int remoteVolume = 100;
            int localVolume = 50;
            bool syncVolumes = false;

            bool allowMultipleOutputs = false;
            bool useAsDefaultDevice = false;
            bool muteDuringPlayback = false;
            bool allowOverlapping = true;
            bool minimizeToTray = false;
            bool tabHotkeysOnly = false;
            bool deleteToTrash = true;


            // Add these fields to the Settings struct
            bool enableWebServer = true;
            std::string webServerHost = "0.0.0.0";
            int webServerPort = 8080;
            std::string webServerRoot = "";

            // Add these fields after the webServerRoot field
            std::string remotePin;                       // Current PIN for web remote
            bool requirePin = true;                      // Whether authentication is required
            std::vector<std::string> authorizedTokens;   // List of valid session tokens (Note: Plan used vector, implementation uses unordered_set in webserver.cpp - vector is kept here as per plan spec)
        };
    } // namespace Objects
} // namespace Soundux
