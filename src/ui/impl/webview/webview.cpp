// --- START OF FILE webview.cpp ---
// Fixes traypp usage errors


#include "webview.hpp"
#include <core/global/globals.hpp>
#include <core/enums/enums.hpp>
#include <cstdint>
#include <fancy.hpp>
#include <filesystem>
#include <helper/audio/linux/pulseaudio/pulseaudio.hpp>
#include <helper/audio/windows/winsound.hpp>
#include <helper/json/bindings.hpp>
#include <helper/systeminfo/systeminfo.hpp>
#include <helper/version/check.hpp>
#include <helper/ytdl/youtube-dl.hpp>
#include <optional>
#include <nlohmann/json.hpp>
#include <thread>
#include <chrono>
#include <iostream>
#include <memory>
#include <tray.hpp>
#include <vector>
#include <string>
#include <helper/webserver/webserver.hpp>

#ifdef _WIN32
#include "../../assets/icon.h"
#include <helper/misc/misc.hpp>
#include <shellapi.h>
#include <windows.h>
#endif
#if defined(__linux__)
#include <unistd.h>
#include <limits.h>
#endif


namespace Soundux::Objects
{

    void WebView::setup()
    {
        Window::setup();

        webview =
            std::make_shared<Webview::Window>("Soundux", Soundux::Globals::gData.width, Soundux::Globals::gData.height);
        webview->setTitle("Soundux");
        webview->enableDevTools(std::getenv("SOUNDUX_DEBUG") != nullptr);
        webview->enableContextMenu(std::getenv("SOUNDUX_DEBUG") != nullptr);

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
        std::string basePath = ".";
         try {
             char selfPath[PATH_MAX];
             ssize_t len = readlink("/proc/self/exe", selfPath, sizeof(selfPath)-1);
             if(len != -1) { selfPath[len] = '\0'; basePath = std::filesystem::path(selfPath).parent_path().string(); }
         } catch (const std::exception& e) { Fancy::fancy.logTime().warning() << "Error getting executable path for frontend: " << e.what() << std::endl; }
         frontendPath = std::filesystem::path(basePath) / "dist" / "index.html";

        std::filesystem::path iconPath;
        std::vector<std::string> iconSearchPaths = { "/app/share/icons/hicolor/256x256/apps/io.github.Soundux.png", "/usr/share/pixmaps/soundux.png", basePath + "/../share/pixmaps/soundux.png", basePath + "/soundux.png" };
        for(const auto& p : iconSearchPaths) { if (std::filesystem::exists(p)) { iconPath = p; break; } }
        if (iconPath.empty()) { Fancy::fancy.logTime().warning() << "Failed to find iconPath for tray icon in standard locations." << std::endl; }
        else { Fancy::fancy.logTime().message() << "Using tray icon: " << iconPath.string() << std::endl; }
        tray = std::make_shared<Tray::Tray>("soundux-tray", iconPath.empty() ? "" : iconPath.string());
#endif

        exposeFunctions();
        fetchTranslations(); // Sets the navigate callback

        webview->setCloseCallback([this]() { return onClose(); });
        webview->setResizeCallback([this](int width, int height) {
             this->onResize(width, height);
         });


#if defined(IS_EMBEDDED)
#if defined(__linux__)
        webview->setUrl("embedded://" + frontendPath.string());
#elif defined(_WIN32)
        webview->setUrl("file:///embedded/" + frontendPath.string());
#endif
#else // Normal file serving
       try {
            if (std::filesystem::exists(frontendPath)) {
                 std::string url = "file://" + std::filesystem::absolute(frontendPath).string();
                 #ifdef _WIN32
                   std::replace(url.begin(), url.end(), '\\', '/');
                    if (url.rfind("file:///", 0) != 0) { url.replace(0, 8, "file:///"); }
                 #endif
                 Fancy::fancy.logTime().message() << "Setting WebView URL to: " << url << std::endl;
                 webview->setUrl(url);
            } else {
                 Fancy::fancy.logTime().failure() << "Frontend index.html not found at: " << frontendPath.string() << std::endl;
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

    void WebView::exposeFunctions() // Includes SortMode fix
    {
        if (!webview) return;

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
        webview->expose(Webview::Function("seekSound", [this](std::uint32_t id, std::uint64_t seekTo) { return seekSound(id, seekTo); }));
        webview->expose(Webview::AsyncFunction("pauseSound", [this](const Webview::Promise &promise, std::uint32_t id) { auto s=pauseSound(id); if(s){promise.resolve(*s);}else{promise.discard();} }));
        webview->expose(Webview::AsyncFunction("resumeSound", [this](const Webview::Promise &promise, std::uint32_t id) { auto s=resumeSound(id); if(s){promise.resolve(*s);}else{promise.discard();} }));
        webview->expose(Webview::Function("repeatSound", [this](std::uint32_t id, bool repeat) { return repeatSound(id, repeat); }));
        webview->expose(Webview::Function("stopSounds", [this]() { stopSounds(); }));
        webview->expose(Webview::Function("changeSettings", [this](const Settings &newSettings) { return changeSettings(newSettings); }));
        webview->expose(Webview::Function("requestHotkey", [](bool state) { Globals::gHotKeys.shouldNotify(state); }));
        webview->expose(Webview::Function("setHotkey", [this](std::uint32_t id, const std::vector<int> &keys) { return setHotkey(id, keys); }));
        webview->expose(Webview::Function("getHotkeySequence", [this](const std::vector<int> &keys) { return Globals::gHotKeys.getKeySequence(keys); }));
        webview->expose(Webview::Function("removeTab", [this](std::uint32_t id) { return removeTab(id); }));
        webview->expose(Webview::Function("refreshTab", [this](std::uint32_t id) { return refreshTab(id); }));
        webview->expose(Webview::Function("setSortMode", [this](std::uint32_t id, Soundux::Enums::SortMode sortMode) { return setSortMode(id, sortMode); }));
        webview->expose(Webview::Function("moveTabs", [this](const std::vector<int> &newOrder) { return changeTabOrder(newOrder); }));
        webview->expose(Webview::Function("markFavorite", [this](const std::uint32_t &id, bool favorite) { Globals::gData.markFavorite(id, favorite); onSettingsChanged(); return Globals::gData.getFavoriteIds(); }));
        webview->expose(Webview::Function("getFavorites", [this] { return Globals::gData.getFavoriteIds(); }));
        webview->expose(Webview::Function("isYoutubeDLAvailable", []() { return Globals::gYtdl.available(); }));
        webview->expose(Webview::AsyncFunction("getYoutubeDLInfo", [this](Webview::Promise promise, const std::string &url) { promise.resolve(Globals::gYtdl.getInfo(url)); }));
        webview->expose(Webview::AsyncFunction("startYoutubeDLDownload", [this](Webview::Promise promise, const std::string &url) { promise.resolve(Globals::gYtdl.download(url)); }));
        webview->expose(Webview::AsyncFunction("stopYoutubeDLDownload", [this](Webview::Promise promise) { std::thread([=] { Globals::gYtdl.killDownload(); promise.discard(); }).detach(); }));
        webview->expose(Webview::Function("getSystemInfo", []() -> std::string { return SystemInfo::getSummary(); }));
        webview->expose(Webview::AsyncFunction("updateCheck", [this](Webview::Promise promise) { promise.resolve(VersionCheck::getStatus()); }));
        webview->expose(Webview::Function("isOnFavorites", [this](bool state) { setIsOnFavorites(state); }));
        webview->expose(Webview::Function("deleteSound", [this](std::uint32_t id) { return deleteSound(id); }));
        webview->expose(Webview::Function("setCustomLocalVolume", [this](const std::uint32_t &id, const std::optional<int> &volume) { auto r = setCustomLocalVolume(id, volume); onSettingsChanged(); return r; }));
        webview->expose(Webview::Function("setCustomRemoteVolume", [this](const std::uint32_t &id, const std::optional<int> &volume) { auto r = setCustomRemoteVolume(id, volume); onSettingsChanged(); return r; }));
        webview->expose(Webview::Function("toggleSoundPlayback", [this]() { return toggleSoundPlayback(); }));
        webview->expose(Webview::Function("getSoundVolumes", []() {
            nlohmann::json response;
            response["defaultLocalVolume"] = Globals::gSettings.localVolume;
            response["defaultRemoteVolume"] = Globals::gSettings.remoteVolume;
            response["syncVolumes"] = Globals::gSettings.syncVolumes;
            nlohmann::json soundVolumes = nlohmann::json::object();
            auto sounds = Globals::gSounds.scoped();
            for (const auto &soundPair : *sounds) {
                const auto &sound = soundPair.second.get();
                bool hasCustomLocal = sound.localVolume.has_value();
                bool hasCustomRemote = sound.remoteVolume.has_value();
                if (hasCustomLocal || hasCustomRemote) {
                    nlohmann::json volumeInfo;
                    volumeInfo["id"] = sound.id;
                    volumeInfo["customLocalVolume"] = sound.localVolume.has_value() ? nlohmann::json(*sound.localVolume) : nlohmann::json(nullptr);
                    volumeInfo["customRemoteVolume"] = sound.remoteVolume.has_value() ? nlohmann::json(*sound.remoteVolume) : nlohmann::json(nullptr);
                    volumeInfo["hasCustomVolume"] = true;
                    volumeInfo["localVolume"] = sound.localVolume.value_or(Globals::gSettings.localVolume);
                    volumeInfo["remoteVolume"] = sound.remoteVolume.value_or(Globals::gSettings.remoteVolume);
                    float ratio = 1.0f; int defaultLocal = Globals::gSettings.localVolume;
                    if (hasCustomLocal) { if (defaultLocal > 0) ratio = static_cast<float>(*sound.localVolume) / static_cast<float>(defaultLocal); else if (*sound.localVolume > 0) ratio = 2.0f; }
                    int sliderPosition = 0; if (ratio >= 0.0f && ratio <= 2.0f) sliderPosition = static_cast<int>(std::round((ratio - 1.0f) * 50.0f)); else if (ratio > 2.0f) sliderPosition = 50; else sliderPosition = -50;
                    volumeInfo["sliderPosition"] = sliderPosition;
                    soundVolumes[std::to_string(sound.id)] = volumeInfo;
                }
            }
            response["sounds"] = soundVolumes;
            return response;
        }));

#if !defined(__linux__)
        webview->expose(Webview::Function("getOutputs", [this]() { return getOutputs(); }));
#endif
#if defined(_WIN32)
        webview->expose(Webview::Function("openUrl", [](const std::string &url) { ShellExecuteA(nullptr, "open", url.c_str(), nullptr, nullptr, SW_SHOWNORMAL); }));
        webview->expose(Webview::Function("openFolder", [](const std::uint32_t &id) { auto t = Globals::gData.getTab(id); if(t){ShellExecuteW(nullptr, L"explore", Helpers::widen(t->path).c_str(), nullptr, nullptr, SW_SHOWNORMAL);}else{Fancy::fancy.logTime().warning() << "Failed to find tab with id " << id << std::endl;} }));
        webview->expose(Webview::Function("restartAsAdmin", [this] { Globals::gGuard->reset(); wchar_t p[MAX_PATH]; GetModuleFileNameW(nullptr, p, MAX_PATH); SHELLEXECUTEINFOW sei = {sizeof(sei)}; sei.lpVerb=L"runas"; sei.lpFile=p; sei.hwnd=nullptr; sei.nShow=SW_SHOWNORMAL; if(!ShellExecuteExW(&sei)){Fancy::fancy.logTime().failure() << "Failed to restart as admin. Error: " << GetLastError();} else { Fancy::fancy.logTime().success() << "Restart as admin initiated."; if(webview)webview->exit(); else std::exit(0);}}));
        webview->expose(Webview::Function("isVBCableProperlySetup", [] { return Globals::gWinSound ? Globals::gWinSound->isVBCableProperlySetup() : false; }));
        webview->expose(Webview::Function("setupVBCable", [](const std::string &micOverride) { return Globals::gWinSound ? Globals::gWinSound->setupVBCable(Globals::gWinSound->getRecordingDevice(micOverride)) : false; }));
        webview->expose(Webview::Function("getRecordingDevices", []() -> std::pair<std::vector<RecordingDevice>, std::optional<RecordingDevice>> { if(Globals::gWinSound){ auto devs = Globals::gWinSound->getRecordingDevices(); std::vector<RecordingDevice> filt; for(const auto& d:devs){if(d.getName().find("VB-Audio") == std::string::npos && d.getName().find("CABLE Output") == std::string::npos){filt.push_back(d);}} return {filt, Globals::gWinSound->getMic()}; } return {}; }));
#endif
#if defined(__linux__)
        webview->expose(Webview::Function("openUrl", [](const std::string &url) { if(url.find("http://") != 0 && url.find("https://") != 0) return; if (system(("xdg-open \"" + url + "\"").c_str()) != 0) {} }));
        webview->expose(Webview::Function("openFolder", [](const std::uint32_t &id) { auto t = Globals::gData.getTab(id); if(t){if(!std::filesystem::exists(t->path) || !std::filesystem::is_directory(t->path)) return; if (system(("xdg-open \"" + t->path + "\"").c_str()) != 0){}} else {Fancy::fancy.logTime().warning() << "Failed to find tab with id " << id << std::endl;} }));
        webview->expose(Webview::Function("getOutputs", [this]() { return getOutputs(); }));
        webview->expose(Webview::Function("getPlayback", [this]() { return getPlayback(); }));
        webview->expose(Webview::Function("startPassthrough", [this](const std::string &app) { return startPassthrough(app); }));
        webview->expose(Webview::Function("stopPassthrough", [this](const std::string &name) { stopPassthrough(name); }));
        webview->expose(Webview::Function("unloadSwitchOnConnect", []() { auto pb = std::dynamic_pointer_cast<Soundux::Objects::PulseAudio>(Soundux::Globals::gAudioBackend); if(pb){ pb->unloadSwitchOnConnect(); pb->loadModules(); Globals::gAudio.setup(); } }));
#endif
    }

    bool WebView::onClose()
    {
        if (Globals::gSettings.minimizeToTray && tray) {
            if (tray->getEntries().size() > 1) { tray->getEntries().at(1)->setText(translations.show); }
            if (webview) webview->hide();
            return true;
        }
        Fancy::fancy.logTime().message() << "Window closing, saving configuration..." << std::endl;
        try { Soundux::Globals::gConfig.data.set(Soundux::Globals::gData); Soundux::Globals::gConfig.settings = Soundux::Globals::gSettings; Soundux::Globals::gConfig.save(); Fancy::fancy.logTime().success() << "Configuration saved on close." << std::endl; }
        catch(const std::exception& e) { Fancy::fancy.logTime().failure() << "Error saving configuration on close: " << e.what() << std::endl; }
        return false;
    }


    void WebView::onResize(int width, int height)
    {
        Globals::gData.width = width;
        Globals::gData.height = height;
    }

    // fetchTranslations now only handles translations and tray setup
    void WebView::fetchTranslations()
    {
         if (!webview) return;
        webview->setNavigateCallback([this]([[maybe_unused]] const std::string &url) -> bool {
            static bool initialLoadDone = false;
            if (!initialLoadDone && webview)
            {
                Fancy::fancy.logTime().message() << "WebView initial load detected, fetching translations..." << std::endl;
                #if defined(__linux__)
                // ... Pulse check ...
                #endif
                auto future = std::make_shared<std::future<void>>();
                *future = std::async(std::launch::async, [this, future] {
                   if (!this || !this->webview) { /* ... error log ... */ return; }
                   try {
                        // ... fetch translations ...
                        this->translations.settings = this->webview->callFunction<std::string>(Webview::JavaScriptFunction("window.getTranslation", "settings.title")).get();
                        // ... etc ...
                        Fancy::fancy.logTime().success() << "Translations fetched successfully.";
                        this->setupTray(); // Call setupTray
                   } catch (const std::exception& e) {
                        Fancy::fancy.logTime().failure() << "Failed during async setup task (translations/tray): " << e.what() << std::endl;
                        this->translations = { /* ... defaults ... */ };
                        this->setupTray(); // Call setupTray even on error
                   }
                });
                initialLoadDone = true;
            }
            return true;
        });
    }


    // Modified setupTray for correct item creation
    void WebView::setupTray()
    {
         if (!tray) { Fancy::fancy.logTime().warning() << "Tray icon not initialized, cannot setup entries." << std::endl; return; }

         // Remove clearEntries call
         // try { tray->clearEntries(); } catch (...) { }


        // --- Standard items ---
        std::string exitText = translations.exit.empty() ? "Exit" : translations.exit;
        tray->addEntry(Tray::Button(exitText, [this]() { if (tray) tray->exit(); if (webview) webview->exit(); }));

        bool isHidden = (webview && webview->isHidden());
        std::string showHideText = isHidden ? (translations.show.empty() ? "Show" : translations.show)
                                             : (translations.hide.empty() ? "Hide" : translations.hide);
        // Store pointer to the Show/Hide button
        trayShowHideMenuItem = tray->addEntry(Tray::Button(showHideText, [this]() { // Assign directly
             if (!webview || !trayShowHideMenuItem) return; // Check pointers
             bool wasHidden = webview->isHidden();
             std::string nextText = "";

             if (wasHidden) {
                 webview->show();
                 nextText = translations.hide.empty() ? "Hide" : translations.hide;
             } else {
                 webview->hide();
                 nextText = translations.show.empty() ? "Show" : translations.show;
             }
             // Update the text using the stored pointer
             trayShowHideMenuItem->setText(nextText);
             if (tray) tray->update(); // Update tray display
         }));
         if (!trayShowHideMenuItem) { Fancy::fancy.logTime().failure() << "Failed to add Show/Hide item to tray menu." << std::endl; }


        // --- Settings submenu ---
        std::string settingsText = translations.settings.empty() ? "Settings" : translations.settings;
        auto settingsMenu = tray->addEntry(Tray::Submenu(settingsText));
        if (settingsMenu) {
             std::string muteText = translations.muteDuringPlayback.empty() ? "Mute During Playback" : translations.muteDuringPlayback;
             std::string tabHotkeyText = translations.tabHotkeys.empty() ? "Tab Hotkeys Only" : translations.tabHotkeys;
             settingsMenu->addEntries(
                Tray::SyncedToggle(muteText, Globals::gSettings.muteDuringPlayback, [this](bool s) { Globals::gSettings.muteDuringPlayback = s; changeSettings(Globals::gSettings); onSettingsChanged(); }),
                Tray::SyncedToggle(tabHotkeyText, Globals::gSettings.tabHotkeysOnly, [this](bool s) { Globals::gSettings.tabHotkeysOnly = s; changeSettings(Globals::gSettings); onSettingsChanged(); })
             );
             settingsMenu->addEntry(Tray::Separator());
             settingsMenu->addEntry(Tray::Button("Reset Remote Sessions", [this]() { this->resetAllRemoteSessions(); }));
        }

        // --- PIN Display Item ---
        tray->addEntry(Tray::Separator());
        std::string initialPinText = "Remote PIN: -";
        if (Globals::gSettings.enableWebServer && !webRemotePin.empty() && Globals::gSettings.requirePin) { initialPinText = "Remote PIN: " + webRemotePin; }
        else if (!Globals::gSettings.enableWebServer || !Globals::gSettings.requirePin) { initialPinText = "Remote Auth Disabled"; }
        // Store Button pointer directly
        trayPinMenuItem = tray->addEntry(Tray::Button(initialPinText, nullptr));
        if (!trayPinMenuItem) { Fancy::fancy.logTime().failure() << "Failed to add PIN display item to tray menu." << std::endl; }
        // else { // Optionally disable: // trayPinMenuItem->setDisabled(true); // }


         tray->update();
         Fancy::fancy.logTime().success() << "Tray menu setup complete." << std::endl;
    }


    // setWebRemotePin remains the same (updates trayPinMenuItem)
    void WebView::setWebRemotePin(const std::string& pin)
    {
        webRemotePin = pin;
        std::cout << "[WebView] Web remote PIN set to: " << pin << std::endl;

        if (trayPinMenuItem && tray) { // trayPinMenuItem is now shared_ptr<Button>
             std::string pinText = "Remote PIN: -";
             if (Globals::gSettings.enableWebServer && !webRemotePin.empty() && Globals::gSettings.requirePin) {
                 pinText = "Remote PIN: " + webRemotePin;
             } else if (!Globals::gSettings.enableWebServer || !Globals::gSettings.requirePin) {
                 pinText = "Remote Auth Disabled";
             }
             try {
                // No cast needed anymore
                trayPinMenuItem->setText(pinText);
                tray->update();
                Fancy::fancy.logTime().message() << "Updated tray PIN display." << std::endl;
             } catch (const std::exception& e) { Fancy::fancy.logTime().failure() << "Failed to update tray text: " << e.what() << std::endl; }
               catch (...) { Fancy::fancy.logTime().failure() << "Failed to update tray text (unknown error)." << std::endl; }
        } else { Fancy::fancy.logTime().warning() << "Tray PIN menu item not available for update yet (will be updated soon)."; }
    }

    
    // Added resetAllRemoteSessions method
    void WebView::resetAllRemoteSessions()
    {
        Fancy::fancy.logTime().warning() << "Reset Remote Sessions requested.";
#ifdef _WIN32
        int choice = MessageBoxW(nullptr, L"This will log out all currently connected remote control devices.\nAre you sure you want to continue?", L"Reset Remote Sessions", MB_YESNO | MB_ICONWARNING | MB_DEFBUTTON2);
        if (choice != IDYES) { Fancy::fancy.logTime().message() << "Reset Remote Sessions cancelled by user."; return; }
#else
        Fancy::fancy.logTime().warning() << "Confirmation dialog not implemented for Linux. Proceeding with reset.";
#endif
        if (Globals::gWebServer) {
            Globals::gWebServer->clearAllTokens();
            Fancy::fancy.logTime().success() << "All remote sessions have been reset.";
        } else { Fancy::fancy.logTime().failure() << "Web server not available to reset tokens."; }
    }




    
    void WebView::mainLoop()
    {
        if (!webview) { Fancy::fancy.logTime().failure() << "WebView not initialized, cannot run main loop." << std::endl; return; }
        struct TrayGuard { std::shared_ptr<Tray::Tray> trayRef; TrayGuard(std::shared_ptr<Tray::Tray> t) : trayRef(t) {} ~TrayGuard() { if (trayRef) { try { trayRef->exit(); } catch (...) {} } } } trayGuard(tray);
        webview->run();
        Fancy::fancy.logTime().message() << "Saving configuration before final exit..." << std::endl;
        try { Soundux::Globals::gConfig.data.set(Soundux::Globals::gData); Soundux::Globals::gConfig.settings = Soundux::Globals::gSettings; Soundux::Globals::gConfig.save(); Fancy::fancy.logTime().success() << "Final configuration saved." << std::endl; }
        catch(const std::exception& e) { Fancy::fancy.logTime().failure() << "Error saving final configuration: " << e.what() << std::endl; }
        Fancy::fancy.logTime().message() << "WebView main loop finished." << std::endl;
    }

    // --- Event Handlers ---
    void WebView::onHotKeyReceived(const std::vector<int> &keys) { if (!webview) return; std::string seq; if (!keys.empty()){ for(size_t i=0; i<keys.size(); ++i){ seq += Globals::gHotKeys.getKeyName(keys[i]); if (i < keys.size() - 1) seq += " + "; }} else {seq = "None";} webview->callFunction<void>(Webview::JavaScriptFunction("window.hotkeyReceived", seq, keys)); }
    void WebView::onSoundFinished(const PlayingSound &sound) { if (!webview) return; Window::onSoundFinished(sound); webview->callFunction<void>(Webview::JavaScriptFunction("window.finishSound", sound)); }
    void WebView::onSoundPlayed(const PlayingSound &sound) { if (!webview) return; webview->callFunction<void>(Webview::JavaScriptFunction("window.onSoundPlayed", sound)); }
    void WebView::onSoundProgressed(const PlayingSound &sound) { if (!webview) return; webview->callFunction<void>(Webview::JavaScriptFunction("window.updateSound", sound)); }
    void WebView::onDownloadProgressed(float progress, const std::string &eta) { if (!webview) return; webview->callFunction<void>(Webview::JavaScriptFunction("window.downloadProgressed", progress, eta)); }
    void WebView::onError(const Soundux::Enums::ErrorCode &error) { if (!webview) return; webview->callFunction<void>(Webview::JavaScriptFunction("window.onError", static_cast<std::uint8_t>(error))); }
    Settings WebView::changeSettings(Settings newSettings) { auto applied = Window::changeSettings(newSettings); if (tray) tray->update(); return applied; }
    void WebView::onSettingsChanged() { if (!webview) return; webview->callFunction<void>(Webview::JavaScriptFunction("window.getStore().commit", "setSettings", Globals::gSettings)); if (tray) tray->update(); }
    void WebView::onAllSoundsFinished() { if (!webview) return; Window::onAllSoundsFinished(); webview->callFunction<void>(Webview::JavaScriptFunction("window.getStore().commit", "clearCurrentlyPlaying")); }
    void WebView::onSwitchOnConnectDetected(bool state) { if (!webview) return; webview->callFunction<void>(Webview::JavaScriptFunction("window.getStore().commit", "setSwitchOnConnectLoaded", state)); }
    void WebView::onAdminRequired() { if (!webview) return; webview->callFunction<void>(Webview::JavaScriptFunction("window.getStore().commit", "setAdministrativeModal", true)); }

    // --- Webserver Methods ---
    void WebView::stopAllSounds() { stopSounds(true); std::cout << "[WebView] stopAllSounds called." << std::endl; }
    std::optional<PlayingSound> WebView::playSoundById(const std::uint32_t &id) { std::cout << "[WebView] playSoundById called for ID: " << id << std::endl; return playSound(id); }
    std::optional<Sound> WebView::setCustomLocalVolumeForWeb(const std::uint32_t &id, const std::optional<int> &volume) { auto r = setCustomLocalVolume(id, volume); if (r && webview) { onSettingsChanged(); } return r; }
    std::optional<Sound> WebView::setCustomRemoteVolumeForWeb(const std::uint32_t &id, const std::optional<int> &volume) { auto r = setCustomRemoteVolume(id, volume); if (r && webview) { onSettingsChanged(); } return r; }
    bool WebView::toggleFavoriteForWeb(const std::uint32_t &id) { auto s = Globals::gData.getSound(id); if (s){ bool n = !s->get().isFavorite; Globals::gData.markFavorite(id, n); if (webview) { auto f = Globals::gData.getFavoriteIds(); webview->callFunction<void>(Webview::JavaScriptFunction("window.getStore().commit", "setFavorites", f)); } return true; } return false; }

    // --- PIN Display Methods ---




    // REMOVED: injectPinDisplay() implementation

} // namespace Soundux::Objects
// --- END OF FILE webview.cpp ---