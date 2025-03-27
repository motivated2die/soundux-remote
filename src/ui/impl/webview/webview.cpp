
#include "webview.hpp"
#include <core/global/globals.hpp>
#include <cstdint>
#include <fancy.hpp>
#include <filesystem>
#include <helper/audio/linux/pulseaudio/pulseaudio.hpp>
#include <helper/audio/windows/winsound.hpp>
#include <helper/json/bindings.hpp>
#include <helper/systeminfo/systeminfo.hpp>
#include <helper/version/check.hpp>
#include <helper/ytdl/youtube-dl.hpp>
#include <optional> // Ensure optional is included

// Include nlohmann/json forward declaration or full header if needed here
#include <nlohmann/json.hpp>


#ifdef _WIN32
#include "../../assets/icon.h"
#include <helper/misc/misc.hpp>
#include <shellapi.h>
#include <windows.h>
#endif
#if defined(__linux__)
#include <unistd.h> // For readlink
#include <limits.h> // For PATH_MAX
#endif


namespace Soundux::Objects
{
    void WebView::setup()
    {
        Window::setup();

        webview =
            std::make_shared<Webview::Window>("Soundux", Soundux::Globals::gData.width, Soundux::Globals::gData.height);
        webview->setTitle("Soundux");
        webview->enableDevTools(std::getenv("SOUNDUX_DEBUG") != nullptr);    // NOLINT
        webview->enableContextMenu(std::getenv("SOUNDUX_DEBUG") != nullptr); // NOLINT

        std::filesystem::path frontendPath;

#ifdef _WIN32
        char rawPath[MAX_PATH];
        GetModuleFileNameA(nullptr, rawPath, MAX_PATH);
        std::string basePath = std::filesystem::path(rawPath).parent_path().string();
        frontendPath = std::filesystem::path(basePath) / "dist" / "index.html";
        tray = std::make_shared<Tray::Tray>("soundux-tray", IDI_ICON1);
        webview->disableAcceleratorKeys(true);
#endif
#if defined(__linux__)
        std::string basePath = "."; // Default
         try {
             char selfPath[PATH_MAX];
             ssize_t len = readlink("/proc/self/exe", selfPath, sizeof(selfPath)-1);
             if(len != -1) {
               selfPath[len] = '\0';
               basePath = std::filesystem::path(selfPath).parent_path().string();
             }
         } catch (const std::exception& e) {
             Fancy::fancy.logTime().warning() << "Error getting executable path for frontend: " << e.what() << std::endl;
         }
         frontendPath = std::filesystem::path(basePath) / "dist" / "index.html";


        std::filesystem::path iconPath;
        std::vector<std::string> iconSearchPaths = {
            "/app/share/icons/hicolor/256x256/apps/io.github.Soundux.png", // Flatpak
            "/usr/share/pixmaps/soundux.png", // Standard install
            basePath + "/../share/pixmaps/soundux.png", // Relative path
            basePath + "/soundux.png" // Local path
        };

        for(const auto& p : iconSearchPaths) {
            if (std::filesystem::exists(p)) {
                iconPath = p;
                break;
            }
        }

        if (iconPath.empty()) {
            Fancy::fancy.logTime().warning() << "Failed to find iconPath for tray icon in standard locations." << std::endl;
        } else {
             Fancy::fancy.logTime().message() << "Using tray icon: " << iconPath.string() << std::endl;
        }


        tray = std::make_shared<Tray::Tray>("soundux-tray", iconPath.empty() ? "" : iconPath.string());
#endif

        exposeFunctions();
        fetchTranslations();

        webview->setCloseCallback([this]() { return onClose(); });
        webview->setResizeCallback([this](int width, int height) { onResize(width, height); });

#if defined(IS_EMBEDDED) // This assumes embedded resources are handled differently
#if defined(__linux__)
        webview->setUrl("embedded://" + frontendPath.string());
#elif defined(_WIN32)
        // Windows embedded paths might need special handling
        webview->setUrl("file:///embedded/" + frontendPath.string()); // Verify this format
#endif
#else // Normal file serving
       try {
           // Ensure path exists before setting URL
            if (std::filesystem::exists(frontendPath)) {
                 std::string url = "file://" + std::filesystem::absolute(frontendPath).string();
                 // Replace backslashes on Windows for URL format
                 #ifdef _WIN32
                   std::replace(url.begin(), url.end(), '\\', '/');
                   // Add third slash for absolute path drive letter
                    if (url.rfind("file:///", 0) != 0) {
                         url.replace(0, 8, "file:///");
                    }
                 #endif
                 Fancy::fancy.logTime().message() << "Setting WebView URL to: " << url << std::endl;
                 webview->setUrl(url);
            } else {
                 Fancy::fancy.logTime().failure() << "Frontend index.html not found at: " << frontendPath.string() << std::endl;
                 // Display an error in the webview?
                 webview->setHtml("<html><body><h1>Error</h1><p>Frontend not found.</p></body></html>");
            }
       } catch (const std::exception& e) {
            Fancy::fancy.logTime().failure() << "Error setting webview URL: " << e.what() << std::endl;
            webview->setHtml("<html><body><h1>Error</h1><p>Could not load frontend.</p></body></html>");
       }
#endif
    }
    void WebView::show()
    {
        if (webview) webview->show();
    }
    void WebView::exposeFunctions()
    {
        if (!webview) return; // Safety check

        webview->expose(Webview::Function("getSettings", []() { return Globals::gSettings; }));
        webview->expose(Webview::Function("isLinux", []() {
#if defined(__linux__)
            return true;
#else
            return false;
#endif
        }));
        webview->expose(Webview::Function("addTab", [this]() { return (addTab()); }));
        webview->expose(Webview::Function("getTabs", []() { return Globals::gData.getTabs(); }));
        webview->expose(Webview::Function("playSound", [this](std::uint32_t id) { return playSound(id); }));
        webview->expose(Webview::Function("stopSound", [this](std::uint32_t id) { return stopSound(id); }));
        webview->expose(Webview::Function(
            "seekSound", [this](std::uint32_t id, std::uint64_t seekTo) { return seekSound(id, seekTo); }));
        webview->expose(Webview::AsyncFunction("pauseSound", [this](const Webview::Promise &promise, std::uint32_t id) {
            auto sound = pauseSound(id);
            if (sound)
            {
                promise.resolve(*sound);
            }
            else
            {
                promise.discard();
            }
        }));
        webview->expose(
            Webview::AsyncFunction("resumeSound", [this](const Webview::Promise &promise, std::uint32_t id) {
                auto sound = resumeSound(id);
                if (sound)
                {
                    promise.resolve(*sound);
                }
                else
                {
                    promise.discard();
                }
            }));
        webview->expose(Webview::Function("repeatSound",
                                          [this](std::uint32_t id, bool repeat) { return repeatSound(id, repeat); }));
        webview->expose(Webview::Function("stopSounds", [this]() { stopSounds(); }));
        webview->expose(Webview::Function("changeSettings",
                                          [this](const Settings &newSettings) { return changeSettings(newSettings); }));
        webview->expose(Webview::Function("requestHotkey", [](bool state) { Globals::gHotKeys.shouldNotify(state); }));
        webview->expose(Webview::Function(
            "setHotkey", [this](std::uint32_t id, const std::vector<int> &keys) { return setHotkey(id, keys); }));
        webview->expose(Webview::Function("getHotkeySequence", [this](const std::vector<int> &keys) {
            return Globals::gHotKeys.getKeySequence(keys);
        }));
        webview->expose(Webview::Function("removeTab", [this](std::uint32_t id) { return removeTab(id); }));
        webview->expose(Webview::Function("refreshTab", [this](std::uint32_t id) { return refreshTab(id); }));
        webview->expose(Webview::Function(
            "setSortMode", [this](std::uint32_t id, Enums::SortMode sortMode) { return setSortMode(id, sortMode); }));
        webview->expose(Webview::Function(
            "moveTabs", [this](const std::vector<int> &newOrder) { return changeTabOrder(newOrder); }));
        webview->expose(Webview::Function("markFavorite", [this](const std::uint32_t &id, bool favorite) {
            Globals::gData.markFavorite(id, favorite);
            // Maybe return the updated sound object or just favorite IDs? Plan implies IDs.
             onSettingsChanged(); // Notify UI about potential changes (e.g., favorite list update)
            return Globals::gData.getFavoriteIds();
        }));
        webview->expose(Webview::Function("getFavorites", [this] { return Globals::gData.getFavoriteIds(); }));
        webview->expose(Webview::Function("isYoutubeDLAvailable", []() { return Globals::gYtdl.available(); }));
        webview->expose(
            Webview::AsyncFunction("getYoutubeDLInfo", [this](Webview::Promise promise, const std::string &url) {
                promise.resolve(Globals::gYtdl.getInfo(url));
            }));
        webview->expose(
            Webview::AsyncFunction("startYoutubeDLDownload", [this](Webview::Promise promise, const std::string &url) {
                promise.resolve(Globals::gYtdl.download(url));
            }));
        webview->expose(Webview::AsyncFunction("stopYoutubeDLDownload", [this](Webview::Promise promise) {
            std::thread killDownload([promise, this] {
                Globals::gYtdl.killDownload();
                promise.discard(); // Discard indicates stop, maybe resolve with success?
            });
            killDownload.detach();
        }));
        webview->expose(Webview::Function("getSystemInfo", []() -> std::string { return SystemInfo::getSummary(); }));
        webview->expose(Webview::AsyncFunction(
            "updateCheck", [this](Webview::Promise promise) { promise.resolve(VersionCheck::getStatus()); }));
        webview->expose(Webview::Function("isOnFavorites", [this](bool state) { setIsOnFavorites(state); }));
        webview->expose(Webview::Function("deleteSound", [this](std::uint32_t id) { return deleteSound(id); }));
        webview->expose(Webview::Function("setCustomLocalVolume",
                                          [this](const std::uint32_t &id, const std::optional<int> &volume) {
                                               auto result = setCustomLocalVolume(id, volume);
                                               onSettingsChanged(); // Notify UI
                                              return result;
                                          }));
        webview->expose(Webview::Function("setCustomRemoteVolume",
                                          [this](const std::uint32_t &id, const std::optional<int> &volume) {
                                               auto result = setCustomRemoteVolume(id, volume);
                                               onSettingsChanged(); // Notify UI
                                              return result;
                                          }));
        webview->expose(Webview::Function("toggleSoundPlayback", [this]() { return toggleSoundPlayback(); }));

        // Add this with the other expose statements
        webview->expose(Webview::Function("getWebRemotePin", [this]() -> std::string {
            return webRemotePin; // Return the stored PIN
        }));


#if !defined(__linux__)
        webview->expose(Webview::Function("getOutputs", [this]() { return getOutputs(); }));
#endif
#if defined(_WIN32)
        webview->expose(Webview::Function("openUrl", [](const std::string &url) {
             Fancy::fancy.logTime().message() << "Opening URL: " << url << std::endl;
            ShellExecuteA(nullptr, "open", url.c_str(), nullptr, nullptr, SW_SHOWNORMAL); // Use "open" verb
        }));
        webview->expose(Webview::Function("openFolder", [](const std::uint32_t &id) {
            auto tab = Globals::gData.getTab(id);
            if (tab)
            {
                 Fancy::fancy.logTime().message() << "Opening folder: " << tab->path << std::endl;
                // Use SHOpenFolderAndSelectItems or equivalent for better experience?
                // ShellExecuteW for wide paths
                ShellExecuteW(nullptr, L"explore", Helpers::widen(tab->path).c_str(), nullptr, nullptr, SW_SHOWNORMAL); // Use "explore"
            }
            else
            {
                Fancy::fancy.logTime().warning() << "Failed to find tab with id " << id << " to open folder." << std::endl;
            }
        }));
        webview->expose(Webview::Function("restartAsAdmin", [this] {
            Fancy::fancy.logTime().message() << "Attempting to restart as administrator..." << std::endl;
            Globals::gGuard->reset(); // Release mutex before restarting
            wchar_t selfPath[MAX_PATH];
            GetModuleFileNameW(nullptr, selfPath, MAX_PATH);
            SHELLEXECUTEINFOW sei = { sizeof(sei) };
            sei.lpVerb = L"runas";
            sei.lpFile = selfPath;
            sei.hwnd = nullptr;
            sei.nShow = SW_SHOWNORMAL;

            if (!ShellExecuteExW(&sei)) {
                DWORD error = GetLastError();
                 Fancy::fancy.logTime().failure() << "Failed to restart as admin. Error code: " << error << std::endl;
                 // Optionally re-acquire guard if restart fails?
                 // Globals::gGuard = std::make_shared<Instance::Guard>("soundux-guard"); // Re-acquire if needed
            } else {
                 Fancy::fancy.logTime().success() << "Restart as admin initiated. Exiting current instance." << std::endl;
                 if(webview) webview->exit(); // Exit the current instance gracefully
                 else std::exit(0);
            }
        }));
        webview->expose(Webview::Function("isVBCableProperlySetup", [] {
            if (Globals::gWinSound)
            {
                return Globals::gWinSound->isVBCableProperlySetup();
            }

            Fancy::fancy.logTime().failure() << "isVBCableProperlySetup: Windows Sound Backend not found" << std::endl;
            return false;
        }));
        webview->expose(Webview::Function("setupVBCable", [](const std::string &micOverride) {
            if (Globals::gWinSound)
            {
                auto device = Globals::gWinSound->getRecordingDevice(micOverride);
                if (!device && !micOverride.empty()) {
                    Fancy::fancy.logTime().warning() << "setupVBCable: Specified mic override '" << micOverride << "' not found." << std::endl;
                } else if (!device) {
                     Fancy::fancy.logTime().warning() << "setupVBCable: Default mic could not be determined." << std::endl;
                }
                return Globals::gWinSound->setupVBCable(device);
            }

            Fancy::fancy.logTime().failure() << "setupVBCable: Windows Sound Backend not found" << std::endl;
            return false;
        }));
        webview->expose(Webview::Function(
            "getRecordingDevices", []() -> std::pair<std::vector<RecordingDevice>, std::optional<RecordingDevice>> {
            if (Globals::gWinSound)
            {
                auto devices = Globals::gWinSound->getRecordingDevices();
                 std::vector<RecordingDevice> filteredDevices;
                 // Filter out VB-Audio devices explicitly
                 for (const auto& device : devices) {
                    if (device.getName().find("VB-Audio") == std::string::npos &&
                        device.getName().find("CABLE Output") == std::string::npos ) // Also filter default name
                    {
                        filteredDevices.push_back(device);
                    }
                 }

                return std::make_pair(filteredDevices, Globals::gWinSound->getMic());
            }

            Fancy::fancy.logTime().failure() << "getRecordingDevices: Windows Sound Backend not found" << std::endl;
            return {};
        }));


        // Add volume-related functions (summary endpoint)
        webview->expose(Webview::Function("getSoundVolumes", []() {
            // Create a response with all sound volumes
            nlohmann::json response;
            response["defaultLocalVolume"] = Globals::gSettings.localVolume;
            response["defaultRemoteVolume"] = Globals::gSettings.remoteVolume;
            response["syncVolumes"] = Globals::gSettings.syncVolumes;


            nlohmann::json soundVolumes = nlohmann::json::object(); // Use object { id: { details } }
            auto sounds = Globals::gSounds.scoped();

            for (const auto &soundPair : *sounds) {
                const auto &sound = soundPair.second.get();
                bool hasCustomLocal = sound.localVolume.has_value();
                bool hasCustomRemote = sound.remoteVolume.has_value();

                if (hasCustomLocal || hasCustomRemote) {
                    nlohmann::json volumeInfo;
                    volumeInfo["id"] = sound.id; // Redundant if key is ID, but maybe useful

                    // FIX: Assign optional correctly
                    volumeInfo["customLocalVolume"] = sound.localVolume.has_value() ? nlohmann::json(*sound.localVolume) : nlohmann::json(nullptr);
                    volumeInfo["customRemoteVolume"] = sound.remoteVolume.has_value() ? nlohmann::json(*sound.remoteVolume) : nlohmann::json(nullptr);

                    volumeInfo["hasCustomVolume"] = true;
                    // Report effective volumes too?
                    volumeInfo["localVolume"] = sound.localVolume.value_or(Globals::gSettings.localVolume);
                    volumeInfo["remoteVolume"] = sound.remoteVolume.value_or(Globals::gSettings.remoteVolume);

                     // Calculate slider position
                     float ratio = 1.0f;
                     int defaultLocal = Globals::gSettings.localVolume;
                     if (hasCustomLocal) {
                         if (defaultLocal > 0) ratio = static_cast<float>(*sound.localVolume) / static_cast<float>(defaultLocal);
                         else if (*sound.localVolume > 0) ratio = 2.0f;
                     }
                     int sliderPosition = 0;
                     if (ratio >= 0.0f && ratio <= 2.0f) sliderPosition = static_cast<int>(std::round((ratio - 1.0f) * 50.0f)); // Use round
                     else if (ratio > 2.0f) sliderPosition = 50;
                     else sliderPosition = -50;
                     volumeInfo["sliderPosition"] = sliderPosition;

                    soundVolumes[std::to_string(sound.id)] = volumeInfo;
                }
            }

            response["sounds"] = soundVolumes;
            return response;
        }));


#endif
#if defined(__linux__)
        webview->expose(Webview::Function("openUrl", [](const std::string &url) {
             Fancy::fancy.logTime().message() << "Opening URL: " << url << std::endl;
            // Sanitize URL? Basic check for safety.
             if (url.find("http://") != 0 && url.find("https://") != 0) {
                 Fancy::fancy.logTime().warning() << "Refusing to open non-HTTP(S) URL: " << url << std::endl;
                 return;
             }
            if (system(("xdg-open \"" + url + "\"").c_str()) != 0) // NOLINT
            {
                Fancy::fancy.logTime().warning() << "Failed to open url " << url << " using xdg-open." << std::endl;
            }
        }));
        webview->expose(Webview::Function("openFolder", [](const std::uint32_t &id) {
            auto tab = Globals::gData.getTab(id);
            if (tab)
            {
                 Fancy::fancy.logTime().message() << "Opening folder: " << tab->path << std::endl;
                // Ensure path exists and is a directory?
                 if (!std::filesystem::exists(tab->path) || !std::filesystem::is_directory(tab->path)) {
                     Fancy::fancy.logTime().warning() << "Folder path does not exist or is not a directory: " << tab->path << std::endl;
                     return;
                 }
                if (system(("xdg-open \"" + tab->path + "\"").c_str()) != 0) // NOLINT
                {
                    Fancy::fancy.logTime().warning() << "Failed to open folder " << tab->path << " using xdg-open." << std::endl;
                }
            }
            else
            {
                Fancy::fancy.logTime().warning() << "Failed to find tab with id " << id << " to open folder." << std::endl;
            }
        }));
        webview->expose(Webview::Function("getOutputs", [this]() { return getOutputs(); }));
        webview->expose(Webview::Function("getPlayback", [this]() { return getPlayback(); }));
        webview->expose(
            Webview::Function("startPassthrough", [this](const std::string &app) { return startPassthrough(app); }));
        webview->expose(
            Webview::Function("stopPassthrough", [this](const std::string &name) { stopPassthrough(name); }));
        webview->expose(Webview::Function("unloadSwitchOnConnect", []() {
            auto pulseBackend =
                std::dynamic_pointer_cast<Soundux::Objects::PulseAudio>(Soundux::Globals::gAudioBackend);
            if (pulseBackend)
            {
                 Fancy::fancy.logTime().message() << "Unloading PulseAudio switch-on-connect module..." << std::endl;
                pulseBackend->unloadSwitchOnConnect();
                 Fancy::fancy.logTime().message() << "Reloading PulseAudio modules..." << std::endl;
                pulseBackend->loadModules(); // Reload other necessary modules
                 Fancy::fancy.logTime().message() << "Re-setting up audio..." << std::endl;
                Globals::gAudio.setup(); // Re-initialize audio streams
                 Fancy::fancy.logTime().success() << "PulseAudio switch-on-connect unloaded and audio reset." << std::endl;
            }
            else
            {
                Fancy::fancy.logTime().failure()
                    << "unloadSwitchOnConnect called but no PulseAudio backend was detected!" << std::endl;
            }
        }));
#endif
    }
    bool WebView::onClose()
    {
        if (Globals::gSettings.minimizeToTray && tray) // Check if tray exists
        {
            if (tray->getEntries().size() > 1) { // Ensure entry exists
               tray->getEntries().at(1)->setText(translations.show);
            }
            if (webview) webview->hide();
            return true; // Prevent default close
        }

        // Save configuration before allowing window to close
        Fancy::fancy.logTime().message() << "Window closing, saving configuration..." << std::endl;
        try {
             Soundux::Globals::gConfig.data.set(Soundux::Globals::gData);
             Soundux::Globals::gConfig.settings = Soundux::Globals::gSettings;
             Soundux::Globals::gConfig.save();
             Fancy::fancy.logTime().success() << "Configuration saved on close." << std::endl;
        } catch(const std::exception& e) {
             Fancy::fancy.logTime().failure() << "Error saving configuration on close: " << e.what() << std::endl;
        }

        return false; // Allow default close (which should exit the app via mainLoop end)
    }


    void WebView::onResize(int width, int height)
    {
        Globals::gData.width = width;
        Globals::gData.height = height;
        // Optionally debounce saving this?
    }
    void WebView::fetchTranslations()
    {
         if (!webview) return;
        // Use setNavigateCallback to run *after* the page is loaded and JS context is ready
        webview->setNavigateCallback([this]([[maybe_unused]] const std::string &url) {
            static bool translationsFetched = false;
            if (!translationsFetched && webview) // Ensure webview still exists
            {
                Fancy::fancy.logTime().message() << "Fetching translations from frontend..." << std::endl;

#if defined(__linux__) // PulseAudio specific logic
                if (auto pulseBackend = std::dynamic_pointer_cast<PulseAudio>(Globals::gAudioBackend); pulseBackend)
                {
                    //* We have to call this so that we can trigger an event in the frontend that switchOnConnect was
                    //* found because previously the UI was not initialized.
                     Fancy::fancy.logTime().message() << "Checking PulseAudio switch-on-connect status..." << std::endl;
                    pulseBackend->switchOnConnectPresent(); // Notify frontend if module is loaded
                }
#endif

                // Use async calls to avoid blocking the navigate callback
                auto future = std::make_shared<std::future<void>>();
                *future = std::async(std::launch::async, [this, future] { // Capture future for lifetime management if needed
                   try {
                        translations.settings = webview->callFunction<std::string>(Webview::JavaScriptFunction("window.getTranslation", "settings.title")).get();
                        translations.tabHotkeys = webview->callFunction<std::string>(Webview::JavaScriptFunction("window.getTranslation", "settings.tabHotkeysOnly")).get();
                        translations.muteDuringPlayback = webview->callFunction<std::string>(Webview::JavaScriptFunction("window.getTranslation", "settings.muteDuringPlayback")).get();
                        translations.show = webview->callFunction<std::string>(Webview::JavaScriptFunction("window.getTranslation", "tray.show")).get();
                        translations.hide = webview->callFunction<std::string>(Webview::JavaScriptFunction("window.getTranslation", "tray.hide")).get();
                        translations.exit = webview->callFunction<std::string>(Webview::JavaScriptFunction("window.getTranslation", "tray.exit")).get();

                        Fancy::fancy.logTime().success() << "Translations fetched successfully." << std::endl;
                        setupTray(); // Setup tray *after* getting translations
                   } catch (const std::exception& e) {
                        Fancy::fancy.logTime().failure() << "Failed to fetch translations: " << e.what() << std::endl;
                        // Setup tray with default text?
                        translations.settings = "Settings";
                        translations.tabHotkeys = "Tab Hotkeys Only";
                        translations.muteDuringPlayback = "Mute During Playback";
                        translations.show = "Show";
                        translations.hide = "Hide";
                        translations.exit = "Exit";
                        setupTray();
                   }
                });

                translationsFetched = true; // Only try once
            }
            return true; // Allow navigation
        });
    }
    void WebView::setupTray()
    {
         if (!tray) {
             Fancy::fancy.logTime().warning() << "Tray icon not initialized, cannot setup entries." << std::endl;
             return;
         }
         // Clear existing entries first?
         // tray->clearEntries(); // If Tray class supports this

        tray->addEntry(Tray::Button(translations.exit.empty() ? "Exit" : translations.exit, [this]() {
            Fancy::fancy.logTime().message() << "Exit requested from tray." << std::endl;
            if (tray) tray->exit(); // Stop tray updates
            if (webview) webview->exit(); // Terminate webview loop
        }));

        tray->addEntry(Tray::Button((webview && webview->isHidden()) ? translations.show : translations.hide, [this]() {
             if (!webview) return;
            if (!webview->isHidden())
            {
                webview->hide();
                if (tray && tray->getEntries().size() > 1) tray->getEntries().at(1)->setText(translations.show);
            }
            else
            {
                webview->show();
                 if (tray && tray->getEntries().size() > 1) tray->getEntries().at(1)->setText(translations.hide);
            }
        }));

        auto settingsMenu = tray->addEntry(Tray::Submenu(translations.settings.empty() ? "Settings" : translations.settings));
        if (settingsMenu) { // Check if submenu was added successfully
             settingsMenu->addEntries(
                Tray::SyncedToggle(translations.muteDuringPlayback.empty() ? "Mute During Playback" : translations.muteDuringPlayback,
                                   Globals::gSettings.muteDuringPlayback,
                                   [this](bool state) {
                                       Globals::gSettings.muteDuringPlayback = state; // Update setting directly
                                       changeSettings(Globals::gSettings); // Apply changes
                                       onSettingsChanged(); // Notify UI
                                   }),
                Tray::SyncedToggle(translations.tabHotkeys.empty() ? "Tab Hotkeys Only" : translations.tabHotkeys,
                                   Globals::gSettings.tabHotkeysOnly,
                                   [this](bool state) {
                                       Globals::gSettings.tabHotkeysOnly = state; // Update setting
                                       changeSettings(Globals::gSettings); // Apply changes
                                       onSettingsChanged(); // Notify UI
                                   })
                // Add more settings toggles here if needed
             );
        }
         tray->update(); // Apply changes to the tray icon
         Fancy::fancy.logTime().success() << "Tray menu setup complete." << std::endl;
    }
    void WebView::mainLoop()
    {
        if (!webview) {
             Fancy::fancy.logTime().failure() << "WebView not initialized, cannot run main loop." << std::endl;
             return;
        }
        // Safely destroy tray before exiting webview->run() blocks
        struct TrayGuard {
            std::shared_ptr<Tray::Tray> trayRef;
            TrayGuard(std::shared_ptr<Tray::Tray> t) : trayRef(t) {}
            ~TrayGuard() {
                if (trayRef) {
                    try {
                         Fancy::fancy.logTime().message() << "Destroying tray icon..." << std::endl;
                        trayRef->exit();
                    } catch (const std::exception& e) {
                        Fancy::fancy.logTime().warning() << "Error destroying tray: " << e.what() << std::endl;
                    }
                }
            }
        } trayGuard(tray); // RAII for tray destruction


        webview->run(); // This blocks until the window is closed or exit() is called

        // Code here runs after webview->run() returns

        // Explicitly save configuration before shutdown (also saved in onClose if not minimizing)
        Fancy::fancy.logTime().message() << "Saving configuration before final exit..." << std::endl;
        try {
             Soundux::Globals::gConfig.data.set(Soundux::Globals::gData);
             Soundux::Globals::gConfig.settings = Soundux::Globals::gSettings;
             Soundux::Globals::gConfig.save();
              Fancy::fancy.logTime().success() << "Final configuration saved." << std::endl;
        } catch(const std::exception& e) {
             Fancy::fancy.logTime().failure() << "Error saving final configuration: " << e.what() << std::endl;
        }


        Fancy::fancy.logTime().message() << "WebView main loop finished." << std::endl;
        // Tray is destroyed automatically by trayGuard destructor here
    }



    void WebView::onHotKeyReceived(const std::vector<int> &keys)
    {
         if (!webview) return;
        std::string hotkeySequence;
        if (!keys.empty()) {
            for (size_t i = 0; i < keys.size(); ++i)
            {
                hotkeySequence += Globals::gHotKeys.getKeyName(keys[i]);
                if (i < keys.size() - 1) {
                    hotkeySequence += " + ";
                }
            }
        } else {
            hotkeySequence = "None"; // Or empty string?
        }

        webview->callFunction<void>(Webview::JavaScriptFunction(
            "window.hotkeyReceived", hotkeySequence, keys));
    }
    void WebView::onSoundFinished(const PlayingSound &sound)
    {
         if (!webview) return;
        Window::onSoundFinished(sound);
        // Only notify frontend if it was played through the default device? This check seems odd.
        // Notify regardless of output device?
        // if (sound.playbackDevice.isDefault)
        // {
            webview->callFunction<void>(Webview::JavaScriptFunction("window.finishSound", sound));
        // }
    }
    void WebView::onSoundPlayed(const PlayingSound &sound)
    {
        if (!webview) return;
        webview->callFunction<void>(Webview::JavaScriptFunction("window.onSoundPlayed", sound));
    }
    void WebView::onSoundProgressed(const PlayingSound &sound)
    {
         if (!webview) return;
        // Debounce this call? Can be very frequent.
        // Add a simple time-based debounce?
        // static auto lastProgressUpdate = std::chrono::steady_clock::now();
        // auto now = std::chrono::steady_clock::now();
        // if (now - lastProgressUpdate > std::chrono::milliseconds(100)) { // Update ~10 times/sec max
        //     lastProgressUpdate = now;
             webview->callFunction<void>(Webview::JavaScriptFunction("window.updateSound", sound));
        // }
    }
    void WebView::onDownloadProgressed(float progress, const std::string &eta)
    {
        if (!webview) return;
        webview->callFunction<void>(Webview::JavaScriptFunction("window.downloadProgressed", progress, eta));
    }
    void WebView::onError(const Enums::ErrorCode &error)
    {
         if (!webview) return;
        webview->callFunction<void>(Webview::JavaScriptFunction("window.onError", static_cast<std::uint8_t>(error)));
    }
    Settings WebView::changeSettings(Settings newSettings)
    {
        // Apply changes through base class
        auto appliedSettings = Window::changeSettings(newSettings);

        // Update tray if it exists
         if (tray) tray->update();

        // Return the actually applied settings
        return appliedSettings; // Should be Globals::gSettings after Window::changeSettings
    }
    void WebView::onSettingsChanged()
    {
        if (!webview) return;
        // Call the Vuex mutation (or equivalent) to update the frontend store
        webview->callFunction<void>(
            Webview::JavaScriptFunction("window.getStore().commit", "setSettings", Globals::gSettings));
         // Also potentially update tray toggles if settings affecting them changed
         if (tray) tray->update();
    }
    void WebView::onAllSoundsFinished()
    {
        if (!webview) return;
        Window::onAllSoundsFinished();
        webview->callFunction<void>(Webview::JavaScriptFunction("window.getStore().commit", "clearCurrentlyPlaying"));
    }
    void WebView::onSwitchOnConnectDetected(bool state)
    {
        if (!webview) return;
        webview->callFunction<void>(
            Webview::JavaScriptFunction("window.getStore().commit", "setSwitchOnConnectLoaded", state));
    }
    void WebView::onAdminRequired()
    {
        if (!webview) return;
        webview->callFunction<void>(
            Webview::JavaScriptFunction("window.getStore().commit", "setAdministrativeModal", true));
    }


    //webserver related public methods

    void WebView::stopAllSounds() {
        stopSounds(true);  // Call base class method with sync=true if needed
        // No need to call webview function here, UI updates via onAllSoundsFinished
         Fancy::fancy.logTime().message() << "WebView::stopAllSounds called." << std::endl;
    }

    std::optional<PlayingSound> WebView::playSoundById(const std::uint32_t &id) {
         Fancy::fancy.logTime().message() << "WebView::playSoundById called for ID: " << id << std::endl;
        return playSound(id); // Call base class method
        // UI updates via onSoundPlayed
    }

    // Volume control wrapper methods for web server -> WebView interaction
    // These primarily call the base Window methods and then ensure the UI is notified.

    std::optional<Sound> WebView::setCustomLocalVolumeForWeb(const std::uint32_t &id, const std::optional<int> &volume)
    {
        Fancy::fancy.logTime().message() << "WebView::setCustomLocalVolumeForWeb ID: " << id << " Volume: " << (volume ? std::to_string(*volume) : "reset") << std::endl;
        // Call the base class method to update the volume in data/settings
        auto result = setCustomLocalVolume(id, volume);

        // If successful, notify the WebView UI about the change.
        if (result && webview) {
            // onSettingsChanged() pushes the whole settings object, which might be enough.
            // Or send a more specific event.
            onSettingsChanged(); // This should update the volume sliders/info in UI

            // Optional: Send a specific event if needed by frontend logic
            // nlohmann::json detail;
            // detail["id"] = id;
            // detail["localVolume"] = result->localVolume.value_or(Globals::gSettings.localVolume);
            // detail["remoteVolume"] = result->remoteVolume.value_or(Globals::gSettings.remoteVolume);
            // detail["hasCustomVolume"] = result->localVolume.has_value() || result->remoteVolume.has_value();
            // webview->eval("window.dispatchEvent(new CustomEvent('soundVolumeChanged', { detail: " + detail.dump() + " }))");
        }

        return result;
    }

    std::optional<Sound> WebView::setCustomRemoteVolumeForWeb(const std::uint32_t &id, const std::optional<int> &volume)
    {
         Fancy::fancy.logTime().message() << "WebView::setCustomRemoteVolumeForWeb ID: " << id << " Volume: " << (volume ? std::to_string(*volume) : "reset") << std::endl;
        // Call the base class method
        auto result = setCustomRemoteVolume(id, volume);

        if (result && webview) {
            // Notify the WebView UI
            onSettingsChanged();

            // Optional specific event
            // nlohmann::json detail;
            // detail["id"] = id;
            // detail["localVolume"] = result->localVolume.value_or(Globals::gSettings.localVolume);
            // detail["remoteVolume"] = result->remoteVolume.value_or(Globals::gSettings.remoteVolume);
            // detail["hasCustomVolume"] = result->localVolume.has_value() || result->remoteVolume.has_value();
            // webview->eval("window.dispatchEvent(new CustomEvent('soundVolumeChanged', { detail: " + detail.dump() + " }))");
        }

        return result;
    }

    // Toggles favorite status and notifies UI
    bool WebView::toggleFavoriteForWeb(const std::uint32_t &id)
    {
         Fancy::fancy.logTime().message() << "WebView::toggleFavoriteForWeb ID: " << id << std::endl;
        auto sound = Globals::gData.getSound(id);
        if (sound)
        {
            bool newState = !sound->get().isFavorite;
            Globals::gData.markFavorite(id, newState); // Update data model
            Fancy::fancy.logTime().message() << "Sound ID " << id << " favorite status set to: " << newState << std::endl;

            // Notify the WebView UI about the change in favorites
            if (webview) {
                // Send updated list of favorite IDs
                 auto favIds = Globals::gData.getFavoriteIds();
                 // Use the existing commit mechanism if available
                 webview->callFunction<void>(Webview::JavaScriptFunction("window.getStore().commit", "setFavorites", favIds));

                // Also trigger a general settings update if favorites are part of main settings display
                // onSettingsChanged(); // Maybe redundant if setFavorites handles UI update
            }
            return true;
        }
         Fancy::fancy.logTime().warning() << "WebView::toggleFavoriteForWeb failed for ID: " << id << " (Sound not found)" << std::endl;
        return false;
    }

    // Implementation for setWebRemotePin
    void WebView::setWebRemotePin(const std::string& pin)
    {
        webRemotePin = pin; // Store the PIN locally

        // Update the UI to show the PIN
        if (webview) {
            try {
                // Call a JS function, assuming the frontend has implemented `window.setWebRemotePin`
                 Fancy::fancy.logTime().message() << "Calling JS window.setWebRemotePin with PIN: " << pin << std::endl;
                // Ensure the webview is ready for JS calls. This might need to happen later, e.g., in navigate callback.
                // For now, assume it's okay to call here or shortly after setup.
                webview->callFunction<void>(Webview::JavaScriptFunction(
                    "window.setWebRemotePin", pin));
            } catch(const std::exception& e) {
                 Fancy::fancy.logTime().warning() << "Failed to call window.setWebRemotePin in JS: " << e.what() << std::endl;
                 // Maybe try eval as fallback?
                 // webview->eval("try { window.setWebRemotePin('" + pin + "'); } catch (e) { console.error('Failed to set PIN:', e); }");
            }
        } else {
             Fancy::fancy.logTime().warning() << "WebView not available when trying to set remote PIN." << std::endl;
        }
    }


} // namespace Soundux::Objects
