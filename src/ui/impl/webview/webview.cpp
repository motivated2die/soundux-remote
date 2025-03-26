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

#ifdef _WIN32
#include "../../assets/icon.h"
#include <helper/misc/misc.hpp>
#include <shellapi.h>
#include <windows.h>
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

#ifdef _WIN32
        char rawPath[MAX_PATH];
        GetModuleFileNameA(nullptr, rawPath, MAX_PATH);

        auto path = std::filesystem::canonical(rawPath).parent_path() / "dist" / "index.html";
        tray = std::make_shared<Tray::Tray>("soundux-tray", IDI_ICON1);

        webview->disableAcceleratorKeys(true);
#endif
#if defined(__linux__)
        auto path = std::filesystem::canonical("/proc/self/exe").parent_path() / "dist" / "index.html";
        std::filesystem::path iconPath;

        if (std::filesystem::exists("/app/share/icons/hicolor/256x256/apps/io.github.Soundux.png"))
        {
            iconPath = "/app/share/icons/hicolor/256x256/apps/io.github.Soundux.png";
        }
        else if (std::filesystem::exists("/usr/share/pixmaps/soundux.png"))
        {
            iconPath = "/usr/share/pixmaps/soundux.png";
        }
        else
        {
            Fancy::fancy.logTime().warning() << "Failed to find iconPath for tray icon" << std::endl;
        }

        tray = std::make_shared<Tray::Tray>("soundux-tray", iconPath.u8string());
#endif

        exposeFunctions();
        fetchTranslations();

        webview->setCloseCallback([this]() { return onClose(); });
        webview->setResizeCallback([this](int width, int height) { onResize(width, height); });

#if defined(IS_EMBEDDED)
#if defined(__linux__)
        webview->setUrl("embedded://" + path.string());
#elif defined(_WIN32)
        webview->setUrl("file:///embedded/" + path.string());
#endif
#else
        webview->setUrl("file://" + path.string());
#endif
    }
    void WebView::show()
    {
        webview->show();
    }
    void WebView::exposeFunctions()
    {
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
                promise.discard();
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
                                              return setCustomLocalVolume(id, volume);
                                          }));
        webview->expose(Webview::Function("setCustomRemoteVolume",
                                          [this](const std::uint32_t &id, const std::optional<int> &volume) {
                                              return setCustomRemoteVolume(id, volume);
                                          }));
        webview->expose(Webview::Function("toggleSoundPlayback", [this]() { return toggleSoundPlayback(); }));

#if !defined(__linux__)
        webview->expose(Webview::Function("getOutputs", [this]() { return getOutputs(); }));
#endif
#if defined(_WIN32)
        webview->expose(Webview::Function("openUrl", [](const std::string &url) {
            ShellExecuteA(nullptr, nullptr, url.c_str(), nullptr, nullptr, SW_SHOW);
        }));
        webview->expose(Webview::Function("openFolder", [](const std::uint32_t &id) {
            auto tab = Globals::gData.getTab(id);
            if (tab)
            {
                ShellExecuteW(nullptr, nullptr, Helpers::widen(tab->path).c_str(), nullptr, nullptr, SW_SHOWNORMAL);
            }
            else
            {
                Fancy::fancy.logTime().warning() << "Failed to find tab with id " << id << std::endl;
            }
        }));
        webview->expose(Webview::Function("restartAsAdmin", [this] {
            Globals::gGuard.reset();
            wchar_t selfPath[MAX_PATH];
            GetModuleFileNameW(nullptr, selfPath, MAX_PATH);
            ShellExecuteW(nullptr, L"runas", selfPath, nullptr, nullptr, SW_SHOWNORMAL);

            webview->exit();
        }));
        webview->expose(Webview::Function("isVBCableProperlySetup", [] {
            if (Globals::gWinSound)
            {
                return Globals::gWinSound->isVBCableProperlySetup();
            }

            Fancy::fancy.logTime().failure() << "Windows Sound Backend not found" << std::endl;
            return false;
        }));
        webview->expose(Webview::Function("setupVBCable", [](const std::string &micOverride) {
            if (Globals::gWinSound)
            {
                return Globals::gWinSound->setupVBCable(Globals::gWinSound->getRecordingDevice(micOverride));
            }

            Fancy::fancy.logTime().failure() << "Windows Sound Backend not found" << std::endl;
            return false;
        }));
        webview->expose(Webview::Function(
            "getRecordingDevices", []() -> std::pair<std::vector<RecordingDevice>, std::optional<RecordingDevice>> {
                if (Globals::gWinSound)
                {
                    auto devices = Globals::gWinSound->getRecordingDevices();
                    for (auto it = devices.begin(); it != devices.end();)
                    {
                        if (it->getName().find("VB-Audio") != std::string::npos)
                        {
                            it = devices.erase(it);
                        }
                        else
                        {
                            ++it;
                        }
                    }

                    return std::make_pair(devices, Globals::gWinSound->getMic());
                }

                Fancy::fancy.logTime().failure() << "Windows Sound Backend not found" << std::endl;
                return {};
            }));
#endif
#if defined(__linux__)
        webview->expose(Webview::Function("openUrl", [](const std::string &url) {
            if (system(("xdg-open \"" + url + "\"").c_str()) != 0) // NOLINT
            {
                Fancy::fancy.logTime().warning() << "Failed to open url " << url << std::endl;
            }
        }));
        webview->expose(Webview::Function("openFolder", [](const std::uint32_t &id) {
            auto tab = Globals::gData.getTab(id);
            if (tab)
            {
                if (system(("xdg-open \"" + tab->path + "\"").c_str()) != 0) // NOLINT
                {
                    Fancy::fancy.logTime().warning() << "Failed to open folder " << tab->path << std::endl;
                }
            }
            else
            {
                Fancy::fancy.logTime().warning() << "Failed to find tab with id " << id << std::endl;
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
                pulseBackend->unloadSwitchOnConnect();
                pulseBackend->loadModules();
                Globals::gAudio.setup();
            }
            else
            {
                Fancy::fancy.logTime().failure()
                    << "unloadSwitchOnConnect was called but no pulse backend was detected!" << std::endl;
            }
        }));
#endif
    }
    bool WebView::onClose()
    {
        if (Globals::gSettings.minimizeToTray)
        {
            tray->getEntries().at(1)->setText(translations.show);
            webview->hide();
            return true;
        }
        return false;
    }
    void WebView::onResize(int width, int height)
    {
        Globals::gData.width = width;
        Globals::gData.height = height;
    }
    void WebView::fetchTranslations()
    {
        webview->setNavigateCallback([this]([[maybe_unused]] const std::string &url) {
            static bool once = false;
            if (!once)
            {
#if defined(__linux__)
                if (auto pulseBackend = std::dynamic_pointer_cast<PulseAudio>(Globals::gAudioBackend); pulseBackend)
                {
                    //* We have to call this so that we can trigger an event in the frontend that switchOnConnect was
                    //* found becausepreviously the UI was not initialized.
                    pulseBackend->switchOnConnectPresent();
                }
#endif

                auto future = std::make_shared<std::future<void>>();
                *future = std::async(std::launch::async, [future, this] {
                    translations.settings = webview
                                                ->callFunction<std::string>(Webview::JavaScriptFunction(
                                                    "window.getTranslation", "settings.title"))
                                                .get();
                    translations.tabHotkeys = webview
                                                  ->callFunction<std::string>(Webview::JavaScriptFunction(
                                                      "window.getTranslation", "settings.tabHotkeysOnly"))
                                                  .get();
                    translations.muteDuringPlayback = webview
                                                          ->callFunction<std::string>(Webview::JavaScriptFunction(
                                                              "window.getTranslation", "settings.muteDuringPlayback"))
                                                          .get();
                    translations.show = webview
                                            ->callFunction<std::string>(
                                                Webview::JavaScriptFunction("window.getTranslation", "tray.show"))
                                            .get();
                    translations.hide = webview
                                            ->callFunction<std::string>(
                                                Webview::JavaScriptFunction("window.getTranslation", "tray.hide"))
                                            .get();
                    translations.exit = webview
                                            ->callFunction<std::string>(
                                                Webview::JavaScriptFunction("window.getTranslation", "tray.exit"))
                                            .get();

                    setupTray();
                });

                once = true;
            }
        });
    }
    void WebView::setupTray()
    {
        tray->addEntry(Tray::Button(translations.exit, [this]() {
            tray->exit();
            webview->exit();
        }));

        tray->addEntry(Tray::Button(webview->isHidden() ? translations.show : translations.hide, [this]() {
            if (!webview->isHidden())
            {
                webview->hide();
                tray->getEntries().at(1)->setText(translations.show);
            }
            else
            {
                webview->show();
                tray->getEntries().at(1)->setText(translations.hide);
            }
        }));

        auto settings = tray->addEntry(Tray::Submenu(translations.settings));
        settings->addEntries(Tray::SyncedToggle(translations.muteDuringPlayback, Globals::gSettings.muteDuringPlayback,
                                                [this]([[maybe_unused]] bool state) {
                                                    changeSettings(Globals::gSettings);
                                                    onSettingsChanged();
                                                }),
                             Tray::SyncedToggle(translations.tabHotkeys, Globals::gSettings.tabHotkeysOnly,
                                                [this]([[maybe_unused]] bool state) {
                                                    changeSettings(Globals::gSettings);
                                                    onSettingsChanged();
                                                }));
    }
    void WebView::mainLoop()
    {
        // Safely destroy tray before exiting
        auto safelyDestroyTray = [this]() {
            if (tray) {
                try {
                    tray->exit();
                    tray.reset();
                } catch (const std::exception& e) {
                    Fancy::fancy.logTime().warning() << "Error destroying tray: " << e.what() << std::endl;
                }
            }
        };

        webview->run();
        safelyDestroyTray();
        Fancy::fancy.logTime().message() << "UI exited" << std::endl;
    }


    void WebView::onHotKeyReceived(const std::vector<int> &keys)
    {
        std::string hotkeySequence;
        for (const auto &key : keys)
        {
            hotkeySequence += Globals::gHotKeys.getKeyName(key) + " + ";
        }
        webview->callFunction<void>(Webview::JavaScriptFunction(
            "window.hotkeyReceived", hotkeySequence.substr(0, hotkeySequence.length() - 3), keys));
    }
    void WebView::onSoundFinished(const PlayingSound &sound)
    {
        Window::onSoundFinished(sound);
        if (sound.playbackDevice.isDefault)
        {
            webview->callFunction<void>(Webview::JavaScriptFunction("window.finishSound", sound));
        }
    }
    void WebView::onSoundPlayed(const PlayingSound &sound)
    {
        webview->callFunction<void>(Webview::JavaScriptFunction("window.onSoundPlayed", sound));
    }
    void WebView::onSoundProgressed(const PlayingSound &sound)
    {
        webview->callFunction<void>(Webview::JavaScriptFunction("window.updateSound", sound));
    }
    void WebView::onDownloadProgressed(float progress, const std::string &eta)
    {
        webview->callFunction<void>(Webview::JavaScriptFunction("window.downloadProgressed", progress, eta));
    }
    void WebView::onError(const Enums::ErrorCode &error)
    {
        webview->callFunction<void>(Webview::JavaScriptFunction("window.onError", static_cast<std::uint8_t>(error)));
    }
    Settings WebView::changeSettings(Settings newSettings)
    {
        auto rtn = Window::changeSettings(newSettings);
        tray->update();

        return rtn;
    }
    void WebView::onSettingsChanged()
    {
        webview->callFunction<void>(
            Webview::JavaScriptFunction("window.getStore().commit", "setSettings", Globals::gSettings));
    }
    void WebView::onAllSoundsFinished()
    {
        Window::onAllSoundsFinished();
        webview->callFunction<void>(Webview::JavaScriptFunction("window.getStore().commit", "clearCurrentlyPlaying"));
    }
    void WebView::onSwitchOnConnectDetected(bool state)
    {
        webview->callFunction<void>(
            Webview::JavaScriptFunction("window.getStore().commit", "setSwitchOnConnectLoaded", state));
    }
    void WebView::onAdminRequired()
    {
        webview->callFunction<void>(
            Webview::JavaScriptFunction("window.getStore().commit", "setAdministrativeModal", true));
    }

    
    //webserver
    void WebView::stopAllSounds() {
        stopSounds(true);  // Call with sync=true
    }

    std::optional<PlayingSound> WebView::playSoundById(const std::uint32_t &id) {
        return playSound(id);
    }

    
} // namespace Soundux::Objects