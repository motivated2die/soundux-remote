
#include <backward.hpp>
#include <core/enums/enums.hpp>
#include <core/global/globals.hpp>
#include <fancy.hpp>
#include <ui/impl/webview/webview.hpp>
#include <signal.h>



#include <filesystem>


#if defined(__linux__)
#include <helper/audio/linux/backend.hpp>
#endif

#if defined(_WIN32)
#include "../assets/icon.h"
#include <Windows.h>
#include <helper/misc/misc.hpp>
#include <shellapi.h>

int __stdcall WinMain([[maybe_unused]] HINSTANCE hInstrance, [[maybe_unused]] HINSTANCE prevInstance,
                      [[maybe_unused]] LPSTR winArgs, [[maybe_unused]] int argc)
#else
int main(int argc, char **arguments)
#endif
{
    using namespace Soundux::Globals; // NOLINT
    using namespace Soundux::Objects; // NOLINT
    using namespace Soundux::Enums;   // NOLINT

#if defined(_WIN32)
    auto **arguments = CommandLineToArgvW(GetCommandLineW(), &argc);

    std::vector<std::string> args;
    for (int i = 0; argc > i; i++)
    {
        args.emplace_back(Soundux::Helpers::narrow(arguments[i]));
    }
#else
    std::vector<std::string> args(reinterpret_cast<char **>(arguments), reinterpret_cast<char **>(arguments) + argc);
#endif

#if defined(_WIN32)
    if (std::getenv("SOUNDUX_DEBUG")) // NOLINT
    {
        AllocConsole();
        freopen_s(reinterpret_cast<FILE **>(stdin), "CONIN$", "r", stdin);
        freopen_s(reinterpret_cast<FILE **>(stderr), "CONOUT$", "w", stderr);
        freopen_s(reinterpret_cast<FILE **>(stdout), "CONOUT$", "w", stdout);

        DWORD lMode = 0;
        HANDLE hStdout = GetStdHandle(STD_OUTPUT_HANDLE);
        GetConsoleMode(hStdout, &lMode);
        SetConsoleMode(hStdout, lMode | ENABLE_VIRTUAL_TERMINAL_PROCESSING | DISABLE_NEWLINE_AUTO_RETURN);
    }
#endif
    if (std::getenv("SOUNDUX_DEBUG") != nullptr) // NOLINT
    {
        Fancy::fancy.logTime().success() << "Enabling debug features" << std::endl;
    }

    backward::SignalHandling crashHandler;
    gGuard = std::make_shared<Instance::Guard>("soundux-guard");


    if (std::find(args.begin(), args.end(), "--reset-mutex") != args.end())
    {
        gGuard->reset();
        gGuard.reset();
        gGuard = std::make_shared<Instance::Guard>("soundux-guard");
    }

    if (gGuard->isAnotherRunning())
    {
        Fancy::fancy.logTime().failure() << "Another Instance is already running!" << std::endl;
        return 1;
    }

    gConfig.load();
    gData.set(gConfig.data);
    gSettings = gConfig.settings;

#if defined(__linux__)
    gIcons = IconFetcher::createInstance();
    gAudioBackend = AudioBackend::createInstance(gSettings.audioBackend);
#elif defined(_WIN32)
    gWinSound = WinSound::createInstance();
#endif

    gAudio.setup();
    gYtdl.setup();

#if defined(__linux__)
    if (gAudioBackend && gSettings.audioBackend == BackendType::PulseAudio && gConfig.settings.useAsDefaultDevice)
    {
        gAudioBackend->useAsDefault();
    }
#endif

    gGui = std::make_unique<Soundux::Objects::WebView>();
    gGui->setup();

    // Web server initialization
    if (gSettings.enableWebServer)
    {
        gWebServer = std::make_unique<Soundux::Objects::WebServer>();

        std::string webRoot = gSettings.webServerRoot;
        // If web root is not specified, use default location
        if (webRoot.empty())
        {
        #if defined(_WIN32)
            char rawPath[MAX_PATH];
            GetModuleFileNameA(nullptr, rawPath, MAX_PATH);
            std::string basePath = std::filesystem::path(rawPath).parent_path().string();
            webRoot = basePath + "/web";
        #else
            std::string basePath = std::filesystem::canonical("/proc/self/exe").parent_path().string();
            webRoot = basePath + "/web";
        #endif
        }

        // Start the web server with the configured settings
        if (!gWebServer->start(gSettings.webServerHost, gSettings.webServerPort, webRoot))
        {
            Fancy::fancy.logTime().failure() << "Failed to start web server" << std::endl;
        }
        else
        {
            // Get the generated PIN and display it in the WebView UI
            auto* webview = dynamic_cast<Soundux::Objects::WebView*>(gGui.get());
            if (webview && gWebServer) { // Check gWebServer is valid too
                webview->setWebRemotePin(gWebServer->getPin());
            } else {
                Fancy::fancy.logTime().warning() << "Could not set Web Remote PIN in UI" << std::endl;
            }
        }
    }


    if (std::find(args.begin(), args.end(), "--hidden") == args.end())
    {
        gGui->show();
    }
    else
    {
        Fancy::fancy.logTime().message() << "Starting window hidden" << std::endl;
    }

#if defined(_WIN32)
    HICON hIcon = LoadIcon(GetModuleHandle(nullptr), MAKEINTRESOURCE(IDI_ICON1)); // NOLINT
    SendMessage(GetActiveWindow(), WM_SETICON, ICON_SMALL, reinterpret_cast<LPARAM>(hIcon));
    SendMessage(GetActiveWindow(), WM_SETICON, ICON_BIG, reinterpret_cast<LPARAM>(hIcon));
#endif

    gGui->mainLoop();

    gAudio.destroy();
#if defined(__linux__)
    if (gAudioBackend)
    {
        gAudioBackend->destroy();
    }
#endif
    gConfig.data.set(gData);
    gConfig.settings = gSettings;
    gConfig.save();

    // Shutdown in reverse order of initialization
    try {
        // First stop the web server as it might be using other components
        if (gWebServer && gWebServer->isRunning()) {
            Fancy::fancy.logTime().message() << "Stopping web server..." << std::endl;
            gWebServer->stop();
        }

        // Then stop audio-related services
        Fancy::fancy.logTime().message() << "Cleaning up audio resources..." << std::endl;
        gAudio.destroy();

        #if defined(__linux__)
        if (gAudioBackend) {
            gAudioBackend->destroy();
        }
        #endif

        // Save configuration last
        Fancy::fancy.logTime().message() << "Saving configuration..." << std::endl;
        gConfig.data.set(gData);
        gConfig.settings = gSettings;
        gConfig.save();

        Fancy::fancy.logTime().success() << "Shutdown completed successfully" << std::endl;
    } catch (const std::exception& e) {
        Fancy::fancy.logTime().failure() << "Error during shutdown: " << e.what() << std::endl;
    }

    std::thread shutdownGuard([]() {
        // Wait 5 seconds then force exit if still running
        std::this_thread::sleep_for(std::chrono::seconds(5));
        Fancy::fancy.logTime().warning() << "Forcing exit after timeout" << std::endl;
        std::_Exit(0); // Force immediate exit - use only as last resort
    });
    shutdownGuard.detach();

    // Make one final save attempt before exiting
    try {
        Soundux::Globals::gConfig.data.set(Soundux::Globals::gData);
        Soundux::Globals::gConfig.settings = Soundux::Globals::gSettings;
        Soundux::Globals::gConfig.save();
    } catch (const std::exception& e) {
        Fancy::fancy.logTime().warning() << "Final save attempt failed: " << e.what() << std::endl;
    } catch (...) {
        Fancy::fancy.logTime().warning() << "Final save attempt failed" << std::endl;
    }


    return 0;
}
