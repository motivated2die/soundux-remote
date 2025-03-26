#pragma once
#include <tray.hpp>
#include <ui/ui.hpp>
#include <webview.hpp>

namespace Soundux
{
    namespace Objects
    {
        class WebView : public Window
        {
          private:
            std::shared_ptr<Tray::Tray> tray;
            std::shared_ptr<Webview::Window> webview;

            bool onClose();
            void exposeFunctions();
            void onResize(int, int);

            void setupTray();
            void fetchTranslations();

            void onAllSoundsFinished() override;
            Settings changeSettings(Settings newSettings) override;

          public:
            void show() override;
            void setup() override;
            void mainLoop() override;
            void onSoundFinished(const PlayingSound &sound) override;
            void onHotKeyReceived(const std::vector<int> &keys) override;

            void onAdminRequired() override;
            void onSettingsChanged() override;
            void onSwitchOnConnectDetected(bool state) override;
            void onError(const Enums::ErrorCode &error) override;
            void onSoundPlayed(const PlayingSound &sound) override;
            void onSoundProgressed(const PlayingSound &sound) override;
            void onDownloadProgressed(float progress, const std::string &eta) override;

            void stopAllSounds();

            std::optional<PlayingSound> playSoundById(const std::uint32_t &id);

            
        };
    } // namespace Objects
} // namespace Soundux