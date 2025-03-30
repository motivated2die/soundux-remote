// --- START OF FILE webview.hpp ---
// Adds member for tray Show/Hide item
#pragma once
#include <tray.hpp>
#include <ui/ui.hpp>
#include <webview.hpp>
#include <string>
#include <optional>
#include <core/enums/enums.hpp>
#include <memory>

// Forward declare Tray types needed
namespace Tray {
    class Item;
    class Button; // Added
}

namespace Soundux
{
    namespace Objects
    {
        struct PlayingSound;
        struct Settings;
        struct Sound;

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

            std::string webRemotePin;

            // Pointers to specific tray items we need to update
            std::shared_ptr<Tray::Button> trayShowHideMenuItem = nullptr; // ADDED
            std::shared_ptr<Tray::Button> trayPinMenuItem = nullptr; // CHANGED back to Button

            void resetAllRemoteSessions();

            void onAllSoundsFinished() override;
            Settings changeSettings(Settings newSettings) override;

            bool playbackGloballyPaused = false; // Tracks if the main toggle paused sounds
            bool isTalkThroughActive = false; // Tracks if talk-through button is currently held

            // State before pausing/talk-through started
            struct PlaybackInterruptionState {
                bool wasPttPressedBySoundux = false;
                bool wasMicMutedBySoundux = false;
                std::vector<std::uint32_t> pausedSoundInstanceIds; // Store *instance* IDs (from PlayingSound)
            };
            PlaybackInterruptionState togglePauseState;
            PlaybackInterruptionState talkThroughPauseState; // Separate state for talk-through



          public:
            // ... (rest is the same) ...
            void show() override;
            void setup() override;
            void mainLoop() override;
            void onSoundFinished(const PlayingSound &sound) override;
            void onHotKeyReceived(const std::vector<int> &keys) override;
            void onAdminRequired() override;
            void onSettingsChanged() override;
            void onSwitchOnConnectDetected(bool state) override;
            void onError(const Soundux::Enums::ErrorCode &error) override;
            void onSoundPlayed(const PlayingSound &sound) override;
            void onSoundProgressed(const PlayingSound &sound) override;
            void onDownloadProgressed(float progress, const std::string &eta) override;
            void stopAllSounds();
            std::optional<PlayingSound> playSoundById(const std::uint32_t &id);
            std::optional<Sound> setCustomLocalVolumeForWeb(const std::uint32_t &id, const std::optional<int> &volume);
            std::optional<Sound> setCustomRemoteVolumeForWeb(const std::uint32_t &id, const std::optional<int> &volume);
            bool toggleFavoriteForWeb(const std::uint32_t &id);
            void setWebRemotePin(const std::string& pin);

            std::string toggleAllPlaybackState(); // Returns "paused" or "playing"
            void startTalkThrough();
            void stopTalkThrough();

        };
    } // namespace Objects
} // namespace Soundux
// --- END OF FILE webview.hpp ---