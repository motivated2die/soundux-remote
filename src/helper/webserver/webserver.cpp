#include "webserver.hpp"
#include <core/global/globals.hpp>
#include <fancy.hpp>
#include <filesystem>
#include <fancy.hpp>
#include <ui/impl/webview/webview.hpp>



namespace Soundux::Objects
{
    WebServer::WebServer() : server(std::make_unique<httplib::Server>())
    {
    }

    WebServer::~WebServer()
    {
        stop();
    }

    bool WebServer::start(const std::string &host, int port, const std::string &webRootPath)
    {
        if (running)
        {
            Fancy::fancy.logTime().warning() << "Web server is already running" << std::endl;
            return false;
        }

        std::string effectiveWebRoot = webRootPath;
        
        if (effectiveWebRoot.empty() || !std::filesystem::exists(effectiveWebRoot))
        {
            // Try looking in various standard locations
            std::vector<std::string> possiblePaths;
            
            #if defined(_WIN32)
                char rawPath[MAX_PATH];
                GetModuleFileNameA(nullptr, rawPath, MAX_PATH);
                std::string basePath = std::filesystem::path(rawPath).parent_path().string();
                
                possiblePaths = {
                    basePath + "/web",
                    basePath + "/Release/web",
                    basePath + "/Debug/web"
                };
            #else
                std::string basePath = std::filesystem::canonical("/proc/self/exe").parent_path().string();
                
                possiblePaths = {
                    basePath + "/web",
                    "/usr/share/soundux/web",
                    "/opt/soundux/web"
                };
            #endif

            for (const auto &path : possiblePaths)
            {
                if (std::filesystem::exists(path))
                {
                    effectiveWebRoot = path;
                    Fancy::fancy.logTime().success() << "Found web files at: " << effectiveWebRoot << std::endl;
                    break;
                }
            }
        }
        
        webRoot = effectiveWebRoot;
        
        if (!std::filesystem::exists(webRoot) || !std::filesystem::is_directory(webRoot))
        {
            Fancy::fancy.logTime().warning() << "Web root directory not found: " << webRoot << std::endl;
            return false;
        }

        setupRoutes();
        setupTabEndpoints();
        setupSoundEndpoints();
        serveStaticFiles();

        running = true;
        serverThread = std::thread([this, host, port]() {
            Fancy::fancy.logTime().success() << "Starting web server on " << host << ":" << port << std::endl;
            if (!server->listen(host.c_str(), port))
            {
                Fancy::fancy.logTime().failure() << "Failed to start web server" << std::endl;
                running = false;
            }
        });

        return true;
    }


    void WebServer::stop()
    {
        if (running)
        {
            running = false;
            server->stop();
            if (serverThread.joinable())
            {
                serverThread.join();
            }
            Fancy::fancy.logTime().success() << "Web server stopped" << std::endl;
        }
    }

    bool WebServer::isRunning() const
    {
        return running;
    }

    void WebServer::setupRoutes()
    {
        // Basic health check endpoint
        server->Get("/api/status", [](const httplib::Request &, httplib::Response &res) {
            res.set_content("{\"status\":\"ok\"}", "application/json");
        });

        // CORS headers for all responses
        server->set_default_headers({
            {"Access-Control-Allow-Origin", "*"},
            {"Access-Control-Allow-Methods", "GET, POST, OPTIONS"},
            {"Access-Control-Allow-Headers", "Content-Type, Authorization"}
        });

        // Handle OPTIONS requests (for CORS)
        server->Options(".*", [](const httplib::Request &, httplib::Response &res) {
            res.set_content("", "text/plain");
        });
    }

    void WebServer::setupTabEndpoints()
    {
        // Get all tabs
        server->Get("/api/tabs", [](const httplib::Request &, httplib::Response &res) {
            auto tabs = Soundux::Globals::gData.getTabs();
            
            // Manual JSON construction for tabs
            std::string jsonStr = "[";
            bool first = true;
            for (const auto &tab : tabs)
            {
                if (!first) jsonStr += ",";
                first = false;
                
                jsonStr += "{";
                jsonStr += "\"id\":" + std::to_string(tab.id) + ",";
                jsonStr += "\"name\":\"" + tab.name + "\",";
                jsonStr += "\"path\":\"" + tab.path + "\",";
                jsonStr += "\"sortMode\":" + std::to_string(static_cast<int>(tab.sortMode)) + "";
                jsonStr += "}";
            }
            jsonStr += "]";
            
            res.set_content(jsonStr, "application/json");
        });

        // Get sounds in a specific tab
        server->Get(R"(/api/tabs/(\d+)/sounds)", [](const httplib::Request &req, httplib::Response &res) {
            auto tabIdStr = req.matches[1];
            try
            {
                auto tabId = std::stoul(tabIdStr);
                auto tab = Soundux::Globals::gData.getTab(tabId);
                if (tab)
                {
                    // Manual JSON construction for sounds
                    std::string jsonStr = "[";
                    bool first = true;
                    for (const auto &sound : tab->sounds)
                    {
                        if (!first) jsonStr += ",";
                        first = false;
                        
                        jsonStr += "{";
                        jsonStr += "\"id\":" + std::to_string(sound.id) + ",";
                        jsonStr += "\"name\":\"" + sound.name + "\",";
                        jsonStr += "\"path\":\"" + sound.path + "\",";
                        jsonStr += "\"isFavorite\":" + std::string(sound.isFavorite ? "true" : "false");
                        jsonStr += "}";
                    }
                    jsonStr += "]";
                    
                    res.set_content(jsonStr, "application/json");
                }
                else
                {
                    res.status = 404;
                    res.set_content("{\"error\":\"Tab not found\"}", "application/json");
                }
            }
            catch (const std::exception &)
            {
                res.status = 400;
                res.set_content("{\"error\":\"Invalid tab ID\"}", "application/json");
            }
        });

        // Get favorites
        server->Get("/api/favorites", [](const httplib::Request &, httplib::Response &res) {
            auto favorites = Soundux::Globals::gData.getFavorites();
            
            // Manual JSON construction for favorites
            std::string jsonStr = "[";
            bool first = true;
            for (const auto &sound : favorites)
            {
                if (!first) jsonStr += ",";
                first = false;
                
                jsonStr += "{";
                jsonStr += "\"id\":" + std::to_string(sound.id) + ",";
                jsonStr += "\"name\":\"" + sound.name + "\",";
                jsonStr += "\"path\":\"" + sound.path + "\",";
                jsonStr += "\"isFavorite\":true";
                jsonStr += "}";
            }
            jsonStr += "]";
            
            res.set_content(jsonStr, "application/json");
        });
    }

    void WebServer::setupSoundEndpoints()
    {
        // For now, we'll just implement a simple stop all sounds endpoint
        // We'll add more endpoints once we address the protected methods issue
        

        // Play a specific sound
        server->Post(R"(/api/sounds/(\d+)/play)", [](const httplib::Request &req, httplib::Response &res) {
            auto soundIdStr = req.matches[1];
            try {
                auto soundId = std::stoul(soundIdStr);
                
                // Get WebView instance
                auto* webview = dynamic_cast<Soundux::Objects::WebView*>(Soundux::Globals::gGui.get());
                if (!webview) {
                    res.status = 500;
                    res.set_content("{\"error\":\"WebView interface not available\"}", "application/json");
                    return;
                }
                
                // Use WebView's playSoundById method
                auto playingSound = webview->playSoundById(soundId);
                
                if (playingSound) {
                    // CRITICAL: Notify the UI that a sound is playing
                    webview->onSoundPlayed(*playingSound);
                    
                    res.set_content(
                        "{\"success\":true,\"id\":" + std::to_string(soundId) + 
                        ",\"playingId\":" + std::to_string(playingSound->id) + "}", 
                        "application/json"
                    );
                } else {
                    res.status = 500;
                    res.set_content("{\"error\":\"Failed to play sound\"}", "application/json");
                }
            } catch (const std::exception &e) {
                res.status = 400;
                res.set_content("{\"error\":\"Invalid sound ID: " + std::string(e.what()) + "\"}", "application/json");
            }
        });
        

        // Update the "stop all sounds" endpoint to actually stop sounds
        server->Post("/api/sounds/stop", [](const httplib::Request &, httplib::Response &res) {
            try {
                Fancy::fancy.logTime().message() << "WebServer: Stopping all sounds" << std::endl;
                
                // Use the new public method on the WebView
                auto* webview = dynamic_cast<Soundux::Objects::WebView*>(Soundux::Globals::gGui.get());
                if (webview) {
                    webview->stopAllSounds();
                    Fancy::fancy.logTime().success() << "WebServer: All sounds stopped successfully" << std::endl;
                    res.set_content("{\"success\":true}", "application/json");
                } else {
                    res.status = 500;
                    res.set_content("{\"error\":\"WebView interface not available\"}", "application/json");
                }
            } 
            catch (const std::exception &e) {
                Fancy::fancy.logTime().failure() << "WebServer: Error stopping sounds: " << e.what() << std::endl;
                res.status = 500;
                res.set_content("{\"error\":\"Failed to stop sounds: " + std::string(e.what()) + "\"}", "application/json");
            }
        });
        
        
        
        
    }

    void WebServer::serveStaticFiles()
    {
        server->set_mount_point("/", webRoot.c_str());
    }
} // namespace Soundux::Objects