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
            
            // Join with timeout
            if (serverThread.joinable())
            {
                // Use std::future with wait_for to implement a timeout
                std::future<void> future = std::async(std::launch::async, [&](){
                    if (serverThread.joinable()) {
                        serverThread.join();
                    }
                });
                
                // Wait for thread to join with 2 second timeout
                if (future.wait_for(std::chrono::seconds(2)) == std::future_status::timeout) {
                    Fancy::fancy.logTime().warning() << "Web server thread did not join in time" << std::endl;
                    // Could use more drastic approaches like std::terminate if needed
                }
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
                
                // Get the WebView instance
                auto* webview = dynamic_cast<Soundux::Objects::WebView*>(Soundux::Globals::gGui.get());
                if (!webview) {
                    res.status = 500;
                    res.set_content("{\"error\":\"WebView interface not available\"}", "application/json");
                    return;
                }
                
                // Use the WebView's playSoundById method
                auto playingSound = webview->playSoundById(soundId);
                
                if (playingSound) {
                    // Construct a more detailed JSON response with length information
                    std::stringstream jsonResponse;
                    jsonResponse << "{";
                    jsonResponse << "\"success\":true,";
                    jsonResponse << "\"id\":" << std::to_string(soundId) << ",";
                    jsonResponse << "\"playingId\":" << std::to_string(playingSound->id) << ",";
                    jsonResponse << "\"lengthInMs\":" << std::to_string(playingSound->lengthInMs) << ",";
                    jsonResponse << "\"length\":" << std::to_string(playingSound->length) << ",";
                    jsonResponse << "\"sampleRate\":" << std::to_string(playingSound->sampleRate);
                    jsonResponse << "}";
                    
                    res.set_content(jsonResponse.str(), "application/json");
                } else {
                    res.status = 500;
                    res.set_content("{\"error\":\"Failed to play sound\"}", "application/json");
                }
            } catch (const std::exception &e) {
                res.status = 400;
                res.set_content("{\"error\":\"Invalid sound ID: " + std::string(e.what()) + "\"}", "application/json");
            }
        });

        // Get progress of currently playing sounds
        server->Get("/api/sounds/progress", [](const httplib::Request &, httplib::Response &res) {
            try {
                // Get all currently playing sounds
                auto playingSounds = Soundux::Globals::gAudio.getPlayingSounds();
                nlohmann::json jsonArray = nlohmann::json::array();

                for (const auto &sound : playingSounds) {
                    nlohmann::json soundObj;
                    soundObj["id"] = sound.id;
                    soundObj["soundId"] = sound.sound.id;
                    soundObj["lengthInMs"] = sound.lengthInMs;
                    soundObj["readInMs"] = sound.readInMs.load();
                    soundObj["paused"] = sound.paused.load();
                    soundObj["repeat"] = sound.repeat.load();
                    jsonArray.push_back(soundObj);
                }

                res.set_content(jsonArray.dump(), "application/json");

            } 
            catch (const std::exception &e) {
                res.status = 500;
                res.set_content("{\"error\":\"Failed to get sound progress: " + std::string(e.what()) + "\"}", "application/json");
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

            
        // Get single sound details with volume position
        server->Get(R"(/api/sounds/(\d+))", [](const httplib::Request &req, httplib::Response &res) {
            auto soundIdStr = req.matches[1];
            try {
                auto soundId = std::stoul(soundIdStr);
                auto sound = Soundux::Globals::gData.getSound(soundId);
                
                if (sound) {
                    // Get tab information for this sound
                    std::string tabName;
                    for (const auto &tab : Soundux::Globals::gData.getTabs()) {
                        for (const auto &tabSound : tab.sounds) {
                            if (tabSound.id == soundId) {
                                tabName = tab.name;
                                break;
                            }
                        }
                        if (!tabName.empty()) break;
                    }
                    
                    // Build response JSON
                    nlohmann::json response;
                    response["id"] = sound->get().id;
                    response["name"] = sound->get().name;
                    response["path"] = sound->get().path;
                    response["isFavorite"] = sound->get().isFavorite;
                    response["tabName"] = tabName;
                    
                    // Get default volumes
                    int defaultLocalVolume = Soundux::Globals::gSettings.localVolume;
                    int defaultRemoteVolume = Soundux::Globals::gSettings.remoteVolume;
                    
                    response["defaultLocalVolume"] = defaultLocalVolume;
                    response["defaultRemoteVolume"] = defaultRemoteVolume;
                    
                    // Check if this sound has custom volume
                    bool hasCustomVolume = sound->get().localVolume.has_value() || sound->get().remoteVolume.has_value();
                    response["hasCustomVolume"] = hasCustomVolume;
                    
                    // Include current volumes
                    int localVolume = sound->get().localVolume.value_or(defaultLocalVolume);
                    int remoteVolume = sound->get().remoteVolume.value_or(defaultRemoteVolume);
                    
                    response["localVolume"] = localVolume;
                    response["remoteVolume"] = remoteVolume;
                    
                    // Calculate slider position if custom volume is set
                    if (hasCustomVolume) {
                        // Use local volume for calculating slider position (could use either local or remote)
                        float ratio = static_cast<float>(localVolume) / static_cast<float>(defaultLocalVolume);
                        
                        // Calculate slider position: -50 to +50
                        int sliderPosition = 0;
                        
                        if (ratio > 1.0f) {
                            // Right side (volume increase)
                            sliderPosition = static_cast<int>((ratio - 1.0f) * 50.0f);
                            sliderPosition = std::min(50, sliderPosition);
                        } else if (ratio < 1.0f) {
                            // Left side (volume decrease)
                            sliderPosition = static_cast<int>((ratio - 1.0f) * 50.0f);
                            sliderPosition = std::max(-50, sliderPosition);
                        }
                        
                        response["sliderPosition"] = sliderPosition;
                        response["volumeRatio"] = ratio;
                    } else {
                        // Default to center position
                        response["sliderPosition"] = 0;
                        response["volumeRatio"] = 1.0f;
                    }
                    
                    res.set_content(response.dump(), "application/json");
                } else {
                    res.status = 404;
                    res.set_content("{\"error\":\"Sound not found\"}", "application/json");
                }
            } catch (const std::exception &e) {
                res.status = 400;
                res.set_content("{\"error\":\"Invalid sound ID: " + std::string(e.what()) + "\"}", "application/json");
            }
        });



        // Get sound settings (favorites and custom volumes)
        server->Get("/api/sounds/settings", [](const httplib::Request &, httplib::Response &res) {
            try {
                nlohmann::json response;
                response["success"] = true;
                
                // Get favorite sound IDs
                std::vector<std::uint32_t> favoriteIds = Soundux::Globals::gData.getFavoriteIds();
                response["favorites"] = favoriteIds;
                
                // Get sounds with custom volumes
                std::vector<nlohmann::json> customVolumes;
                auto sounds = Soundux::Globals::gSounds.scoped();
                
                for (const auto &soundPair : *sounds) {
                    const auto &sound = soundPair.second.get();
                    if (sound.localVolume.has_value() || sound.remoteVolume.has_value()) {
                        nlohmann::json customVolume;
                        customVolume["id"] = sound.id;
                        
                        if (sound.localVolume.has_value()) {
                            customVolume["localVolume"] = *sound.localVolume;
                        } else {
                            customVolume["localVolume"] = Soundux::Globals::gSettings.localVolume;
                        }
                        
                        if (sound.remoteVolume.has_value()) {
                            customVolume["remoteVolume"] = *sound.remoteVolume;
                        } else {
                            customVolume["remoteVolume"] = Soundux::Globals::gSettings.remoteVolume;
                        }
                        
                        customVolumes.push_back(customVolume);
                    }
                }
                
                response["customVolumes"] = customVolumes;
                response["defaultLocalVolume"] = Soundux::Globals::gSettings.localVolume;
                response["defaultRemoteVolume"] = Soundux::Globals::gSettings.remoteVolume;
                
                res.set_content(response.dump(), "application/json");
            } catch (const std::exception &e) {
                res.status = 500;
                res.set_content("{\"error\":\"Failed to fetch sound settings: " + std::string(e.what()) + "\"}", "application/json");
            }
        });
        // the new public methods from WebView instead of trying to access protected methods

        // Toggle favorite status
        server->Post(R"(/api/sounds/(\d+)/favorite)", [](const httplib::Request &req, httplib::Response &res) {
            auto soundIdStr = req.matches[1];
            try {
                auto soundId = std::stoul(soundIdStr);
                
                // Parse request body
                auto json = nlohmann::json::parse(req.body);
                bool favorite = json["favorite"].get<bool>();
                
                // Get the WebView instance
                auto* webview = dynamic_cast<Soundux::Objects::WebView*>(Soundux::Globals::gGui.get());
                if (!webview) {
                    res.status = 500;
                    res.set_content("{\"error\":\"WebView interface not available\"}", "application/json");
                    return;
                }
                
                // Use the wrapper method
                if (webview->toggleFavoriteForWeb(soundId)) {
                    // Return success response
                    res.set_content("{\"success\":true}", "application/json");
                } else {
                    res.status = 404;
                    res.set_content("{\"error\":\"Sound not found\"}", "application/json");
                }
            } catch (const std::exception &e) {
                res.status = 400;
                res.set_content("{\"error\":\"Failed to set favorite status: " + std::string(e.what()) + "\"}", "application/json");
            }
        });

        // Set volume adjustment
        // Set volume with proper slider position mapping
        server->Post(R"(/api/sounds/(\d+)/volume)", [](const httplib::Request &req, httplib::Response &res) {
            auto soundIdStr = req.matches[1];
            try {
                auto soundId = std::stoul(soundIdStr);
                auto sound = Soundux::Globals::gData.getSound(soundId);
                
                if (!sound) {
                    res.status = 404;
                    res.set_content("{\"error\":\"Sound not found\"}", "application/json");
                    return;
                }
                
                // Parse slider position from request (-50 to +50)
                auto json = nlohmann::json::parse(req.body);
                int sliderPosition = json["sliderPosition"].get<int>();
                
                // Clamp slider position to valid range
                sliderPosition = std::min(50, std::max(-50, sliderPosition));
                
                // Get default volumes
                int defaultLocalVolume = Soundux::Globals::gSettings.localVolume;
                int defaultRemoteVolume = Soundux::Globals::gSettings.remoteVolume;
                
                // Get the WebView instance
                auto* webview = dynamic_cast<Soundux::Objects::WebView*>(Soundux::Globals::gGui.get());
                if (!webview) {
                    res.status = 500;
                    res.set_content("{\"error\":\"WebView interface not available\"}", "application/json");
                    return;
                }
                
                // If slider is at center, reset to defaults
                if (sliderPosition == 0) {
                    auto localResult = webview->setCustomLocalVolumeForWeb(soundId, std::nullopt);
                    auto remoteResult = webview->setCustomRemoteVolumeForWeb(soundId, std::nullopt);
                    
                    if (localResult && remoteResult) {
                        nlohmann::json response;
                        response["success"] = true;
                        response["sliderPosition"] = 0;
                        response["localVolume"] = defaultLocalVolume;
                        response["remoteVolume"] = defaultRemoteVolume;
                        response["hasCustomVolume"] = false;
                        
                        res.set_content(response.dump(), "application/json");
                    } else {
                        res.status = 500;
                        res.set_content("{\"error\":\"Failed to reset volume\"}", "application/json");
                    }
                    return;
                }
                
                // Calculate new volumes based on slider position
                int newLocalVolume, newRemoteVolume;
                
                if (sliderPosition > 0) {
                    // Increase volume (right side of slider): 100% to 200%
                    float factor = 1.0f + (static_cast<float>(sliderPosition) / 50.0f);
                    newLocalVolume = static_cast<int>(defaultLocalVolume * factor);
                    newRemoteVolume = static_cast<int>(defaultRemoteVolume * factor);
                } else {
                    // Decrease volume (left side of slider): 0% to 100%
                    float factor = (50.0f + static_cast<float>(sliderPosition)) / 50.0f;
                    newLocalVolume = static_cast<int>(defaultLocalVolume * factor);
                    newRemoteVolume = static_cast<int>(defaultRemoteVolume * factor);
                }
                
                // Ensure volumes don't go below 1
                newLocalVolume = std::max(1, newLocalVolume);
                newRemoteVolume = std::max(1, newRemoteVolume);
                
                // Apply the calculated volumes
                auto localResult = webview->setCustomLocalVolumeForWeb(soundId, newLocalVolume);
                auto remoteResult = webview->setCustomRemoteVolumeForWeb(soundId, newRemoteVolume);
                
                if (localResult && remoteResult) {
                    // Response with full details
                    nlohmann::json response;
                    response["success"] = true;
                    response["sliderPosition"] = sliderPosition;
                    response["localVolume"] = newLocalVolume;
                    response["remoteVolume"] = newRemoteVolume;
                    response["defaultLocalVolume"] = defaultLocalVolume;
                    response["defaultRemoteVolume"] = defaultRemoteVolume;
                    response["hasCustomVolume"] = true;
                    
                    res.set_content(response.dump(), "application/json");
                } else {
                    res.status = 500;
                    res.set_content("{\"error\":\"Failed to set volume values\"}", "application/json");
                }
            } catch (const std::exception &e) {
                res.status = 400;
                res.set_content("{\"error\":\"Failed to set volume: " + std::string(e.what()) + "\"}", "application/json");
            }
        });

        // Reset volume endpoint
        server->Post(R"(/api/sounds/(\d+)/volume/reset)", [](const httplib::Request &req, httplib::Response &res) {
            auto soundIdStr = req.matches[1];
            try {
                auto soundId = std::stoul(soundIdStr);
                auto sound = Soundux::Globals::gData.getSound(soundId);
                
                if (!sound) {
                    res.status = 404;
                    res.set_content("{\"error\":\"Sound not found\"}", "application/json");
                    return;
                }
                
                // Get the WebView instance
                auto* webview = dynamic_cast<Soundux::Objects::WebView*>(Soundux::Globals::gGui.get());
                if (!webview) {
                    res.status = 500;
                    res.set_content("{\"error\":\"WebView interface not available\"}", "application/json");
                    return;
                }
                
                // Reset volumes to default by passing std::nullopt
                auto localResult = webview->setCustomLocalVolumeForWeb(soundId, std::nullopt);
                auto remoteResult = webview->setCustomRemoteVolumeForWeb(soundId, std::nullopt);
                
                if (localResult && remoteResult) {
                    // Return success response with default values
                    nlohmann::json response;
                    response["success"] = true;
                    response["sliderPosition"] = 0;
                    response["localVolume"] = Soundux::Globals::gSettings.localVolume;
                    response["remoteVolume"] = Soundux::Globals::gSettings.remoteVolume;
                    response["hasCustomVolume"] = false;
                    
                    res.set_content(response.dump(), "application/json");
                } else {
                    res.status = 500;
                    res.set_content("{\"error\":\"Failed to reset volume\"}", "application/json");
                }
            } catch (const std::exception &e) {
                res.status = 400;
                res.set_content("{\"error\":\"Failed to reset volume: " + std::string(e.what()) + "\"}", "application/json");
            }
        });

        // Preview sound (headphones only)
        server->Post(R"(/api/sounds/(\d+)/preview)", [](const httplib::Request &req, httplib::Response &res) {
            auto soundIdStr = req.matches[1];
            try {
                auto soundId = std::stoul(soundIdStr);
                auto sound = Soundux::Globals::gData.getSound(soundId);
                
                if (!sound) {
                    res.status = 404;
                    res.set_content("{\"error\":\"Sound not found\"}", "application/json");
                    return;
                }
                
                // For preview, we'll just use the regular playback method
                // This will only play through headphones and not through microphone
                // because we're not setting up any sound routing here
                
                auto playingSound = Soundux::Globals::gAudio.play(*sound);
                if (playingSound) {
                    res.set_content("{\"success\":true}", "application/json");
                } else {
                    res.status = 500;
                    res.set_content("{\"error\":\"Failed to preview sound\"}", "application/json");
                }
            } catch (const std::exception &e) {
                res.status = 400;
                res.set_content("{\"error\":\"Failed to preview sound: " + std::string(e.what()) + "\"}", "application/json");
            }
        });
        
        
        
        
    }

    void WebServer::serveStaticFiles()
    {
        server->set_mount_point("/", webRoot.c_str());
    }
} // namespace Soundux::Objects