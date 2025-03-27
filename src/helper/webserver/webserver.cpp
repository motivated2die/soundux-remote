// --- START OF FILE webserver.cpp ---

#include "webserver.hpp"
#include <core/global/globals.hpp>
#include <fancy.hpp>
#include <filesystem>
#include <fancy.hpp>
#include <ui/impl/webview/webview.hpp>
#include <random> // Added
#include <sstream> // Added
#include <iomanip> // Added
#include <chrono> // Added
#include <fstream> // Added for file checks/writes (though removed the write part)
#include <optional> // Ensure optional is included

// Include nlohmann/json forward declaration or full header if needed here
#include <nlohmann/json.hpp>


namespace Soundux::Objects
{
    // --- Authentication Logic Implementation ---

    // Generate a random 6-digit PIN
    void WebServer::generatePin()
    {
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_int_distribution<> distrib(0, 999999);

        int randomPin = distrib(gen);

        // Format as 6 digits with leading zeros
        std::stringstream ss;
        ss << std::setw(6) << std::setfill('0') << randomPin;
        pinCode = ss.str();

        Fancy::fancy.logTime().success() << "Generated remote access PIN: " << pinCode << std::endl;
        // Also update the setting so it can be persisted if needed, though it regenerates on start
        Soundux::Globals::gSettings.remotePin = pinCode;
    }

    // Generate a secure random token for session management
    std::string WebServer::generateToken()
    {
        const std::string chars =
            "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_int_distribution<> distrib(0, static_cast<int>(chars.size()) - 1);

        std::string token;
        token.reserve(32);
        // Generate a 32-character token
        for (int i = 0; i < 32; ++i) {
            token += chars[distrib(gen)];
        }

        // Add token to valid tokens
        {
            std::lock_guard<std::mutex> lock(tokensMutex);
            validTokens.insert(token);
            // Add to settings as well for persistence (optional, but allows remembering across restarts if saved)
            // Globals::gSettings.authorizedTokens.push_back(token); // Decide if persistence is desired
        }

        return token;
    }

    // Check if a token is valid
    bool WebServer::isValidToken(const std::string& token)
    {
        std::lock_guard<std::mutex> lock(tokensMutex);
        // Also check persisted tokens if implementing that feature
        // auto& persistedTokens = Globals::gSettings.authorizedTokens;
        // bool persisted = std::find(persistedTokens.begin(), persistedTokens.end(), token) != persistedTokens.end();
        // return persisted || (validTokens.find(token) != validTokens.end());
        return validTokens.find(token) != validTokens.end();
    }

    // Authentication middleware
    bool WebServer::authenticateRequest(const httplib::Request& req, httplib::Response& res)
    {
        // Check if authentication is required
        if (!Globals::gSettings.requirePin) {
            return true; // Authentication disabled, allow request
        }

        // Allow access to static assets (css, js, images etc.) without authentication
        // Adjust the pattern if your assets are structured differently
        if (req.path.find("/assets/") == 0 || req.path == "/manifest.json" || req.path == "/favicon.ico") {
             return true;
        }


        // Skip authentication for auth endpoints and the login page itself
        if (req.path.find("/api/auth/") == 0 || req.path == "/login.html") {
            return true;
        }

        // Check for valid token in cookies
        if (req.has_header("Cookie")) {
            std::string cookies = req.get_header_value("Cookie");

            // Parse cookies
            std::istringstream stream(cookies);
            std::string cookie;
            while (std::getline(stream, cookie, ';')) {
                // Trim leading whitespace
                size_t start = cookie.find_first_not_of(" ");
                if (start != std::string::npos) {
                    cookie = cookie.substr(start);
                }

                // Check for auth token
                const std::string authTokenPrefix = "soundux_auth=";
                if (cookie.rfind(authTokenPrefix, 0) == 0) {
                    std::string token = cookie.substr(authTokenPrefix.length());

                    if (isValidToken(token)) {
                        return true; // Valid token found, allow request
                    }
                }
            }
        }

        // No valid token found or authentication required

        // For API requests (except auth), return 401 Unauthorized
        if (req.path.find("/api/") == 0) {
            res.status = 401;
            res.set_content("{\"error\":\"Unauthorized\"}", "application/json");
            Fancy::fancy.logTime().warning() << "Unauthorized API request: " << req.method << " " << req.path << std::endl;
            return false; // Deny request
        }

        // For all other non-API, non-asset requests, redirect to login page
        res.status = 302; // Found (Temporary Redirect)
        res.set_header("Location", "/login.html");
        res.set_content("Redirecting to login...", "text/plain");
        Fancy::fancy.logTime().message() << "Redirecting to login page for: " << req.path << std::endl;
        return false; // Deny original request, redirect instead
    }

    // Setup authentication endpoints
    void WebServer::setupAuthEndpoints()
    {
        // Login endpoint
        server->Post("/api/auth/login", [this](const httplib::Request& req, httplib::Response& res) {
            if (!Globals::gSettings.requirePin) {
                 res.status = 403; // Forbidden if auth is disabled
                 res.set_content("{\"success\":false,\"error\":\"Authentication is disabled\"}", "application/json");
                 return;
            }
            try {
                // Parse PIN from request
                auto json = nlohmann::json::parse(req.body);
                std::string submittedPin = json.value("pin", ""); // Use value for safety

                // Check if PIN is correct
                if (!pinCode.empty() && submittedPin == pinCode) {
                    // Generate session token
                    std::string token = generateToken();

                    // Calculate expiration (1 year from now)
                    auto now = std::chrono::system_clock::now();
                    auto expiration = now + std::chrono::hours(24 * 365); // TODO: Make duration configurable?
                    auto expTime = std::chrono::system_clock::to_time_t(expiration);

                    // Format expiration for cookie (RFC 1123 format)
                    std::tm gmt = *std::gmtime(&expTime); // Use gmtime for GMT/UTC
                    std::stringstream ss;
                    // Format: Wdy, DD Mon YYYY HH:MM:SS GMT
                    ss << std::put_time(&gmt, "%a, %d %b %Y %H:%M:%S GMT");

                    // Set cookie
                    // HttpOnly: Prevents access via JavaScript (XSS protection)
                    // SameSite=Strict: Prevents sending cookie on cross-site requests (CSRF protection)
                    // Secure: (Optional) Add '; Secure' if only serving over HTTPS
                    res.set_header("Set-Cookie",
                        "soundux_auth=" + token +
                        "; Path=/; Expires=" + ss.str() +
                        "; SameSite=Strict; HttpOnly"); // Added HttpOnly

                    res.set_content("{\"success\":true}", "application/json");
                    Fancy::fancy.logTime().success() << "Successful login via PIN" << std::endl;
                } else {
                    res.status = 401;
                    res.set_content("{\"success\":false,\"error\":\"Invalid PIN\"}", "application/json");
                    Fancy::fancy.logTime().warning() << "Failed login attempt with PIN: " << submittedPin << std::endl;
                     // Optional: Implement rate limiting or lockout after too many failed attempts
                }
            } catch (const nlohmann::json::parse_error& e) {
                res.status = 400; // Bad Request
                res.set_content("{\"success\":false,\"error\":\"Invalid JSON format: " + std::string(e.what()) + "\"}", "application/json");
            } catch (const std::exception& e) {
                res.status = 400; // Bad Request
                res.set_content("{\"success\":false,\"error\":\"Invalid request: " + std::string(e.what()) + "\"}", "application/json");
            }
        });

        // Session check endpoint (used by login page to see if already authenticated)
        server->Get("/api/auth/check", [this](const httplib::Request& req, httplib::Response& res) {
            // This endpoint itself doesn't need the full pre-routing auth check,
            // but we check the cookie directly here.
             if (!Globals::gSettings.requirePin) {
                 res.set_content("{\"authenticated\":true, \"reason\":\"Auth disabled\"}", "application/json");
                 return;
             }

            if (req.has_header("Cookie")) {
                std::string cookies = req.get_header_value("Cookie");
                std::istringstream stream(cookies);
                std::string cookie;
                while (std::getline(stream, cookie, ';')) {
                    size_t start = cookie.find_first_not_of(" ");
                    if (start != std::string::npos) cookie = cookie.substr(start);

                    const std::string authTokenPrefix = "soundux_auth=";
                    if (cookie.rfind(authTokenPrefix, 0) == 0) {
                        std::string token = cookie.substr(authTokenPrefix.length());
                        if (isValidToken(token)) {
                            res.set_content("{\"authenticated\":true}", "application/json");
                            return; // Found valid token
                        }
                    }
                }
            }

            // No valid token found
            res.status = 401;
            res.set_content("{\"authenticated\":false}", "application/json");
        });

        // Logout endpoint
        server->Post("/api/auth/logout", [this](const httplib::Request& req, httplib::Response& res) {
             std::string tokenToRemove;
             // Find the token being used
             if (req.has_header("Cookie")) {
                 std::string cookies = req.get_header_value("Cookie");
                 std::istringstream stream(cookies);
                 std::string cookie;
                 while (std::getline(stream, cookie, ';')) {
                     size_t start = cookie.find_first_not_of(" ");
                     if (start != std::string::npos) cookie = cookie.substr(start);
                     const std::string authTokenPrefix = "soundux_auth=";
                     if (cookie.rfind(authTokenPrefix, 0) == 0) {
                         tokenToRemove = cookie.substr(authTokenPrefix.length());
                         break;
                     }
                 }
             }

             // Invalidate the token server-side
             if (!tokenToRemove.empty()) {
                std::lock_guard<std::mutex> lock(tokensMutex);
                validTokens.erase(tokenToRemove);
                // Also remove from persisted list if using that
                // auto& persistedTokens = Globals::gSettings.authorizedTokens;
                // persistedTokens.erase(std::remove(persistedTokens.begin(), persistedTokens.end(), tokenToRemove), persistedTokens.end());
             }

            // Clear the cookie client-side by setting expiration in the past
            res.set_header("Set-Cookie",
                "soundux_auth=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict; HttpOnly");

            res.set_content("{\"success\":true}", "application/json");
             Fancy::fancy.logTime().message() << "User logged out" << std::endl;
        });
    }

    // --- End Authentication Logic ---


    // Updated Constructor
    WebServer::WebServer() : server(std::make_unique<httplib::Server>())
    {
        // Generate PIN when server is created
        generatePin();
    }

    WebServer::~WebServer()
    {
        stop();
    }

    // Updated start method
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
                    basePath + "/Release/web", // Adjusted common build output dirs
                    basePath + "/Debug/web",
                    basePath + "/../web",      // If exe is in bin/
                    basePath + "/../../web"    // If exe is in build/bin/
                };
            #else
                std::string basePath = "."; // Default to current dir
                try {
                    // Using canonical requires the path to exist, readlink is safer
                    char selfPath[PATH_MAX];
                    ssize_t len = readlink("/proc/self/exe", selfPath, sizeof(selfPath)-1);
                    if(len != -1) {
                      selfPath[len] = '\0';
                      basePath = std::filesystem::path(selfPath).parent_path().string();
                    } else {
                      Fancy::fancy.logTime().warning() << "Could not read /proc/self/exe, using fallback path." << std::endl;
                      // Fallback: use argument if available? Or assume cwd?
                      // basePath = std::filesystem::current_path().string();
                    }
                } catch (const std::exception& e) {
                     Fancy::fancy.logTime().warning() << "Error getting executable path: " << e.what() << std::endl;
                }


                possiblePaths = {
                    basePath + "/web",
                    basePath + "/../web",         // Common relative path
                    basePath + "/../share/soundux/web", // Relative from bin/
                    "/usr/share/soundux/web",     // Standard install locations
                    "/opt/soundux/web"
                };
            #endif

            for (const auto &path : possiblePaths)
            {
                 std::filesystem::path checkPath(path);
                 // Normalize path for comparison and existence check
                 try {
                    checkPath = std::filesystem::absolute(checkPath);
                    if (std::filesystem::exists(checkPath) && std::filesystem::is_directory(checkPath))
                    {
                        effectiveWebRoot = checkPath.string();
                        Fancy::fancy.logTime().success() << "Found web files at: " << effectiveWebRoot << std::endl;
                        break;
                    }
                 } catch (const std::filesystem::filesystem_error& e) {
                      Fancy::fancy.logTime().warning() << "Error checking path " << path << ": " << e.what() << std::endl;
                 }
            }
        }

        webRoot = effectiveWebRoot;

        if (webRoot.empty() || !std::filesystem::exists(webRoot) || !std::filesystem::is_directory(webRoot))
        {
            Fancy::fancy.logTime().failure() << "Web root directory not found or invalid. Looked in standard locations. Path searched: " << effectiveWebRoot << std::endl;
            return false;
        } else {
             Fancy::fancy.logTime().message() << "Using web root: " << webRoot << std::endl;
        }

        // Check if login.html exists in the web root
        std::filesystem::path loginPath = std::filesystem::path(webRoot) / "login.html";
        if (!std::filesystem::exists(loginPath))
        {
            // Log a warning instead of trying to create it.
            // Assume the build process or packaging places login.html correctly.
             Fancy::fancy.logTime().warning() << "login.html not found in web root: " << loginPath.string() << ". Authentication might not work correctly." << std::endl;
        }


        // --- Setup Routes ---
        setupRoutes(); // Includes pre-routing auth handler
        setupAuthEndpoints(); // Authentication specific endpoints
        setupTabEndpoints();
        setupSoundEndpoints();
        serveStaticFiles(); // Serve static files AFTER routes are defined

        running = true;
        serverThread = std::thread([this, host, port]() {
            Fancy::fancy.logTime().success() << "Starting web server on " << host << ":" << port << std::endl;
            if (Globals::gSettings.requirePin) {
                 Fancy::fancy.logTime().message() << "Remote PIN: " << pinCode << " (Authentication Required)" << std::endl;
            } else {
                 Fancy::fancy.logTime().warning() << "Web server started WITHOUT authentication (requirePin is false)" << std::endl;
            }

            // Enable Pipelining
            // server->new_task_queue = [] { return new httplib::ThreadPool(4); }; // Example: Use thread pool

            if (!server->listen(host.c_str(), port))
            {
                Fancy::fancy.logTime().failure() << "Failed to start web server listener on " << host << ":" << port << std::endl;
                running = false; // Ensure running state is updated on listen failure
            }
        });
        // Detach or Join? If joinable, destructor needs to handle it.
        // Detaching might be simpler if lifetime is managed by `running` flag and `stop()`.
        // Let's keep joinable and handle in stop() and destructor.
        // serverThread.detach(); // Simpler, but might hide errors on exit

        return true;
    }


    void WebServer::stop()
    {
        if (running)
        {
            running = false; // Signal thread to stop listening if possible (httplib stop does this)
            if (server) { // Check if server object exists
                 Fancy::fancy.logTime().message() << "Stopping web server..." << std::endl;
                 server->stop();
            } else {
                 Fancy::fancy.logTime().warning() << "Web server stop called, but server object was null." << std::endl;
            }

            // Join the server thread
            if (serverThread.joinable())
            {
                try {
                    // Use std::future with wait_for to implement a timeout
                    std::future<void> future = std::async(std::launch::async, [&](){
                        serverThread.join(); // Wait for the thread to finish
                    });

                    // Wait for thread to join with a timeout
                    if (future.wait_for(std::chrono::seconds(2)) == std::future_status::timeout) {
                        Fancy::fancy.logTime().warning() << "Web server thread did not join within the timeout period." << std::endl;
                        // Consider if more drastic measures are needed, like detaching or trying to cancel (if possible)
                        // Detaching here might lead to issues if the thread is still accessing resources.
                        // serverThread.detach(); // Use with caution
                    } else {
                         Fancy::fancy.logTime().success() << "Web server thread joined successfully." << std::endl;
                    }
                } catch (const std::system_error& e) {
                    Fancy::fancy.logTime().failure() << "System error joining web server thread: " << e.what() << std::endl;
                } catch (const std::exception& e) {
                     Fancy::fancy.logTime().failure() << "Exception joining web server thread: " << e.what() << std::endl;
                }
            } else {
                 Fancy::fancy.logTime().message() << "Web server thread was not joinable on stop." << std::endl;
            }

            Fancy::fancy.logTime().success() << "Web server stopped." << std::endl;
        } else {
             Fancy::fancy.logTime().message() << "Web server stop called, but it was not running." << std::endl;
        }
    }

    bool WebServer::isRunning() const
    {
        // Consider checking if the underlying socket is still listening if httplib provides a way
        return running;
    }

    // Updated setupRoutes
    void WebServer::setupRoutes()
    {
        // Add authentication middleware to all routes *before* defining them.
        // It will run for every request before the specific route handler.
        server->set_pre_routing_handler([this](const httplib::Request& req, httplib::Response& res) -> httplib::Server::HandlerResponse {
            if (authenticateRequest(req, res)) {
                return httplib::Server::HandlerResponse::Unhandled; // Continue to next handlers/routes
            } else {
                return httplib::Server::HandlerResponse::Handled; // Stop processing, response already set by authenticateRequest
            }
        });

        // Basic health check endpoint (still useful, will pass auth if enabled or called after login)
        server->Get("/api/status", [](const httplib::Request &, httplib::Response &res) {
            res.set_content("{\"status\":\"ok\"}", "application/json");
        });

        // CORS headers for all responses - Set AFTER pre-routing might be better?
        // Or set within handlers where needed. Let's try setting defaults.
        server->set_default_headers({
            // Be careful with "*" - restrict to specific origin in production if possible
            {"Access-Control-Allow-Origin", "*"}, // Or use req.get_header_value("Origin") ?
            {"Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE"},
            {"Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie"}, // Allow Cookie
            {"Access-Control-Allow-Credentials", "true"} // Needed for cookies
        });

        // Handle OPTIONS requests explicitly for CORS preflight
        server->Options(".*", [](const httplib::Request &req, httplib::Response &res) {
             // Respond to CORS preflight request
             res.set_header("Access-Control-Allow-Origin", req.get_header_value("Origin").empty() ? "*" : req.get_header_value("Origin"));
             res.set_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
             res.set_header("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie");
             res.set_header("Access-Control-Allow-Credentials", "true");
             res.set_header("Access-Control-Max-Age", "86400"); // Cache preflight response for 1 day
             res.status = 204; // No Content
             res.set_content("", "text/plain");
        });
    }


    void WebServer::setupTabEndpoints()
    {
        // Get all tabs
        server->Get("/api/tabs", [](const httplib::Request &, httplib::Response &res) {
            try {
                auto tabs = Soundux::Globals::gData.getTabs();
                nlohmann::json jsonTabs = nlohmann::json::array();
                for (const auto &tab : tabs)
                {
                    jsonTabs.push_back({
                        {"id", tab.id},
                        {"name", tab.name},
                        {"path", tab.path},
                        {"sortMode", static_cast<int>(tab.sortMode)}
                    });
                }
                res.set_content(jsonTabs.dump(), "application/json");
            } catch (const std::exception& e) {
                 res.status = 500;
                 res.set_content("{\"error\":\"Failed to get tabs: "+ std::string(e.what()) + "\"}", "application/json");
            }
        });

        // Get sounds in a specific tab
        server->Get(R"(/api/tabs/(\d+)/sounds)", [](const httplib::Request &req, httplib::Response &res) {
            auto tabIdStr = req.matches[1];
            try
            {
                auto tabId = std::stoul(tabIdStr.str()); // Use .str() for submatch
                auto tab = Soundux::Globals::gData.getTab(tabId);
                if (tab)
                {
                    nlohmann::json jsonSounds = nlohmann::json::array();
                    for (const auto &sound : tab->sounds)
                    {
                         jsonSounds.push_back({
                            {"id", sound.id},
                            {"name", sound.name},
                            {"path", sound.path},
                            {"isFavorite", sound.isFavorite}
                            // Add volume info here if needed directly
                         });
                    }
                    res.set_content(jsonSounds.dump(), "application/json");
                }
                else
                {
                    res.status = 404;
                    res.set_content("{\"error\":\"Tab not found\"}", "application/json");
                }
            }
            catch (const std::invalid_argument &) {
                res.status = 400;
                res.set_content("{\"error\":\"Invalid tab ID format\"}", "application/json");
            }
            catch (const std::out_of_range &) {
                 res.status = 400;
                 res.set_content("{\"error\":\"Invalid tab ID value\"}", "application/json");
            }
             catch (const std::exception &e) {
                 res.status = 500;
                 res.set_content("{\"error\":\"Failed to get sounds for tab: "+ std::string(e.what()) + "\"}", "application/json");
             }
        });

        // Get favorites
        server->Get("/api/favorites", [](const httplib::Request &, httplib::Response &res) {
             try {
                 auto favorites = Soundux::Globals::gData.getFavorites();
                 nlohmann::json jsonFavs = nlohmann::json::array();
                 for (const auto &sound : favorites)
                 {
                     jsonFavs.push_back({
                        {"id", sound.id},
                        {"name", sound.name},
                        {"path", sound.path},
                        {"isFavorite", true}
                     });
                 }
                 res.set_content(jsonFavs.dump(), "application/json");
             } catch (const std::exception& e) {
                 res.status = 500;
                 res.set_content("{\"error\":\"Failed to get favorites: "+ std::string(e.what()) + "\"}", "application/json");
             }
        });
    }

    void WebServer::setupSoundEndpoints()
    {
        // Play a specific sound
        server->Post(R"(/api/sounds/(\d+)/play)", [](const httplib::Request &req, httplib::Response &res) {
            auto soundIdStr = req.matches[1];
            try {
                auto soundId = std::stoul(soundIdStr.str());

                auto* webview = dynamic_cast<Soundux::Objects::WebView*>(Soundux::Globals::gGui.get());
                if (!webview) {
                    res.status = 503; // Service Unavailable
                    res.set_content("{\"error\":\"Sound playback service not available\"}", "application/json");
                    return;
                }

                auto playingSound = webview->playSoundById(soundId);

                if (playingSound) {
                    nlohmann::json response;
                    response["success"] = true;
                    response["id"] = soundId;
                    response["playingId"] = playingSound->id;
                    response["lengthInMs"] = playingSound->lengthInMs;
                    response["length"] = playingSound->length;
                    response["sampleRate"] = playingSound->sampleRate;
                    res.set_content(response.dump(), "application/json");
                } else {
                    // Could be sound not found or playback error
                    auto soundExists = Soundux::Globals::gData.getSound(soundId).has_value();
                    if (!soundExists) {
                        res.status = 404;
                        res.set_content("{\"error\":\"Sound not found\"}", "application/json");
                    } else {
                        res.status = 500;
                        res.set_content("{\"error\":\"Failed to play sound\"}", "application/json");
                    }
                }
            } catch (const std::invalid_argument &) {
                res.status = 400;
                res.set_content("{\"error\":\"Invalid sound ID format\"}", "application/json");
            } catch (const std::out_of_range &) {
                 res.status = 400;
                 res.set_content("{\"error\":\"Invalid sound ID value\"}", "application/json");
            } catch (const std::exception &e) {
                 res.status = 500;
                 res.set_content("{\"error\":\"An unexpected error occurred: " + std::string(e.what()) + "\"}", "application/json");
             }
        });

        // Get progress of currently playing sounds
        server->Get("/api/sounds/progress", [](const httplib::Request &, httplib::Response &res) {
            try {
                auto playingSounds = Soundux::Globals::gAudio.getPlayingSounds();
                nlohmann::json jsonArray = nlohmann::json::array();

                for (const auto &soundRef : playingSounds) {
                    // Assuming getPlayingSounds returns a container of PlayingSound or similar
                    // Need to ensure thread safety if accessing atomic members
                    // Let's assume PlayingSound members are safe to read or we copy safely
                    const auto& sound = soundRef; // Assuming direct access or safe copy
                    nlohmann::json soundObj;
                    soundObj["id"] = sound.id; // This is the PlayingSound instance ID
                    soundObj["soundId"] = sound.sound.id; // This is the original Sound ID
                    soundObj["name"] = sound.sound.name; // Add name for easier identification
                    soundObj["lengthInMs"] = sound.lengthInMs;
                    soundObj["readInMs"] = sound.readInMs.load(std::memory_order_relaxed); // Use relaxed if precise sync not needed here
                    soundObj["paused"] = sound.paused.load(std::memory_order_relaxed);
                    soundObj["repeat"] = sound.repeat.load(std::memory_order_relaxed);
                    jsonArray.push_back(soundObj);
                }

                res.set_content(jsonArray.dump(), "application/json");

            }
            catch (const std::exception &e) {
                res.status = 500;
                res.set_content("{\"error\":\"Failed to get sound progress: " + std::string(e.what()) + "\"}", "application/json");
            }
        });


        // Stop all sounds
        server->Post("/api/sounds/stop", [](const httplib::Request &, httplib::Response &res) {
            try {
                Fancy::fancy.logTime().message() << "WebServer: Received request to stop all sounds" << std::endl;

                auto* webview = dynamic_cast<Soundux::Objects::WebView*>(Soundux::Globals::gGui.get());
                if (webview) {
                    webview->stopAllSounds(); // Call the public wrapper
                    Fancy::fancy.logTime().success() << "WebServer: All sounds stopped successfully via WebView" << std::endl;
                    res.set_content("{\"success\":true}", "application/json");
                } else {
                     Fancy::fancy.logTime().warning() << "WebServer: WebView interface not available to stop sounds." << std::endl;
                    // Fallback? Directly call gAudio? Could lead to UI inconsistencies.
                    // Soundux::Globals::gAudio.stopSounds(); // Direct call - use with caution
                     res.status = 503; // Service Unavailable
                    res.set_content("{\"error\":\"Sound control service not available\"}", "application/json");
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
                auto soundId = std::stoul(soundIdStr.str());
                auto soundOpt = Soundux::Globals::gData.getSound(soundId); // Use optional directly

                if (soundOpt) {
                     const Sound& sound = soundOpt->get(); // Get reference

                    // Get tab information for this sound
                    std::string tabName = "Unknown"; // Default
                    std::uint32_t tabId = 0;         // Default
                    for (const auto &tab : Soundux::Globals::gData.getTabs()) {
                        for (const auto &tabSound : tab.sounds) {
                            if (tabSound.id == soundId) {
                                tabName = tab.name;
                                tabId = tab.id;
                                goto found_tab; // Exit nested loops once found
                            }
                        }
                    }
                    found_tab:; // Label for goto

                    // Build response JSON
                    nlohmann::json response;
                    response["id"] = sound.id;
                    response["name"] = sound.name;
                    response["path"] = sound.path;
                    response["isFavorite"] = sound.isFavorite;
                    response["tabName"] = tabName;
                    response["tabId"] = tabId;

                    // Get default volumes from global settings
                    int defaultLocalVolume = Soundux::Globals::gSettings.localVolume;
                    int defaultRemoteVolume = Soundux::Globals::gSettings.remoteVolume;

                    response["defaultLocalVolume"] = defaultLocalVolume;
                    response["defaultRemoteVolume"] = defaultRemoteVolume;

                    // Check if this sound has custom volume defined
                    bool hasCustomLocal = sound.localVolume.has_value();
                    bool hasCustomRemote = sound.remoteVolume.has_value();
                    bool hasCustomVolume = hasCustomLocal || hasCustomRemote;
                    response["hasCustomVolume"] = hasCustomVolume;

                    // Include current effective volumes
                    int localVolume = sound.localVolume.value_or(defaultLocalVolume);
                    int remoteVolume = sound.remoteVolume.value_or(defaultRemoteVolume);

                    response["localVolume"] = localVolume;
                    response["remoteVolume"] = remoteVolume;

                    // FIX: Assign optional correctly
                    response["customLocalVolume"] = sound.localVolume.has_value() ? nlohmann::json(*sound.localVolume) : nlohmann::json(nullptr);
                    response["customRemoteVolume"] = sound.remoteVolume.has_value() ? nlohmann::json(*sound.remoteVolume) : nlohmann::json(nullptr);

                    // Calculate slider position based on custom volume relative to default
                    // We need a consistent way to map volume to slider. Let's use the ratio.
                    // Use local volume ratio for simplicity, assuming syncVolumes is handled elsewhere if needed.
                    float ratio = 1.0f; // Default ratio
                    if (hasCustomLocal) {
                         if (defaultLocalVolume > 0) { // Avoid division by zero
                            ratio = static_cast<float>(*sound.localVolume) / static_cast<float>(defaultLocalVolume);
                         } else if (*sound.localVolume > 0) {
                            ratio = 2.0f; // Default is 0, custom is > 0, treat as max increase? Or handle differently?
                         } // If both are 0, ratio remains 1.0f
                    } else if (hasCustomRemote && !hasCustomLocal) {
                         // If only remote is custom, maybe base ratio on that? Needs defined logic.
                         // Let's stick to local for now for consistency. If no custom local, ratio is 1.0.
                    }

                    // Calculate slider position: -50 (0%) to 0 (100%) to +50 (200%)
                    int sliderPosition = 0;
                    // Map ratio [0, 2.0+] to slider [-50, +50]
                    // Ratio 1.0 -> Slider 0
                    // Ratio 0.0 -> Slider -50
                    // Ratio 2.0 -> Slider +50
                    if (ratio >= 0.0f && ratio <= 2.0f) {
                        sliderPosition = static_cast<int>(std::round((ratio - 1.0f) * 50.0f)); // Use round for better mapping
                    } else if (ratio > 2.0f) {
                        sliderPosition = 50; // Clamp max
                    } else { // ratio < 0 (should not happen for volume)
                        sliderPosition = -50; // Clamp min
                    }

                    response["sliderPosition"] = sliderPosition;
                    response["volumeRatio"] = ratio;


                    res.set_content(response.dump(), "application/json");
                } else {
                    res.status = 404;
                    res.set_content("{\"error\":\"Sound not found\"}", "application/json");
                }
            } catch (const std::invalid_argument &) {
                res.status = 400;
                res.set_content("{\"error\":\"Invalid sound ID format\"}", "application/json");
            } catch (const std::out_of_range &) {
                 res.status = 400;
                 res.set_content("{\"error\":\"Invalid sound ID value\"}", "application/json");
            } catch (const std::exception &e) {
                res.status = 500;
                res.set_content("{\"error\":\"Failed to get sound details: " + std::string(e.what()) + "\"}", "application/json");
            }
        });



        // Get sound settings (favorites and custom volumes) - Summary endpoint
        server->Get("/api/sounds/settings", [](const httplib::Request &, httplib::Response &res) {
            try {
                nlohmann::json response;
                response["success"] = true;

                // Get favorite sound IDs
                std::vector<std::uint32_t> favoriteIds = Soundux::Globals::gData.getFavoriteIds();
                response["favorites"] = favoriteIds;

                // Get sounds with custom volumes
                nlohmann::json customVolumes = nlohmann::json::object(); // Use object: { soundId: { local: val, remote: val } }
                auto sounds = Soundux::Globals::gSounds.scoped(); // Assuming this gives safe access

                int defaultLocalVolume = Soundux::Globals::gSettings.localVolume;
                int defaultRemoteVolume = Soundux::Globals::gSettings.remoteVolume;

                for (const auto &soundPair : *sounds) {
                    const auto &sound = soundPair.second.get();
                    bool hasCustomLocal = sound.localVolume.has_value();
                    bool hasCustomRemote = sound.remoteVolume.has_value();

                    if (hasCustomLocal || hasCustomRemote) {
                        nlohmann::json customVolumeInfo;
                        customVolumeInfo["localVolume"] = sound.localVolume.value_or(defaultLocalVolume); // Effective volume
                        customVolumeInfo["remoteVolume"] = sound.remoteVolume.value_or(defaultRemoteVolume); // Effective volume

                        // FIX: Assign optional correctly
                        customVolumeInfo["customLocalVolume"] = sound.localVolume.has_value() ? nlohmann::json(*sound.localVolume) : nlohmann::json(nullptr);
                        customVolumeInfo["customRemoteVolume"] = sound.remoteVolume.has_value() ? nlohmann::json(*sound.remoteVolume) : nlohmann::json(nullptr);

                        customVolumeInfo["hasCustomVolume"] = true;

                        // Calculate slider position (same logic as single sound endpoint)
                        float ratio = 1.0f;
                        if (hasCustomLocal) {
                            if (defaultLocalVolume > 0) ratio = static_cast<float>(*sound.localVolume) / static_cast<float>(defaultLocalVolume);
                            else if (*sound.localVolume > 0) ratio = 2.0f;
                        }
                        int sliderPosition = 0;
                         if (ratio >= 0.0f && ratio <= 2.0f) {
                             sliderPosition = static_cast<int>(std::round((ratio - 1.0f) * 50.0f)); // Use round
                         } else if (ratio > 2.0f) {
                             sliderPosition = 50;
                         } else {
                             sliderPosition = -50;
                         }
                        customVolumeInfo["sliderPosition"] = sliderPosition;


                        customVolumes[std::to_string(sound.id)] = customVolumeInfo;
                    }
                }

                response["customVolumes"] = customVolumes;
                response["defaultLocalVolume"] = defaultLocalVolume;
                response["defaultRemoteVolume"] = defaultRemoteVolume;
                response["syncVolumes"] = Soundux::Globals::gSettings.syncVolumes;


                res.set_content(response.dump(), "application/json");
            } catch (const std::exception &e) {
                res.status = 500;
                res.set_content("{\"error\":\"Failed to fetch sound settings: " + std::string(e.what()) + "\"}", "application/json");
            }
        });

        // Toggle favorite status
        server->Post(R"(/api/sounds/(\d+)/favorite)", [](const httplib::Request &req, httplib::Response &res) {
            auto soundIdStr = req.matches[1];
            try {
                auto soundId = std::stoul(soundIdStr.str());

                // Use the wrapper method on WebView
                auto* webview = dynamic_cast<Soundux::Objects::WebView*>(Soundux::Globals::gGui.get());
                if (!webview) {
                    res.status = 503;
                    res.set_content("{\"error\":\"Favorite toggle service not available\"}", "application/json");
                    return;
                }

                // The toggleFavoriteForWeb method now handles getting the current state and toggling it.
                bool success = webview->toggleFavoriteForWeb(soundId);

                if (success) {
                     // Get the new state to return it
                     auto updatedSound = Soundux::Globals::gData.getSound(soundId);
                     bool isFavoriteNow = updatedSound ? updatedSound->get().isFavorite : false; // Default to false if sound vanished?
                    res.set_content("{\"success\":true, \"isFavorite\": " + std::string(isFavoriteNow ? "true" : "false") + "}", "application/json");
                } else {
                    res.status = 404; // Sound not found is the likely reason for failure
                    res.set_content("{\"error\":\"Sound not found or failed to toggle favorite\"}", "application/json");
                }
            } catch (const std::invalid_argument &) {
                res.status = 400;
                res.set_content("{\"error\":\"Invalid sound ID format\"}", "application/json");
            } catch (const std::out_of_range &) {
                 res.status = 400;
                 res.set_content("{\"error\":\"Invalid sound ID value\"}", "application/json");
            } catch (const std::exception &e) {
                res.status = 500;
                res.set_content("{\"error\":\"Failed to toggle favorite status: " + std::string(e.what()) + "\"}", "application/json");
            }
        });


        // Set volume using slider position
        server->Post(R"(/api/sounds/(\d+)/volume)", [](const httplib::Request &req, httplib::Response &res) {
            auto soundIdStr = req.matches[1];
            try {
                auto soundId = std::stoul(soundIdStr.str());
                auto soundOpt = Soundux::Globals::gData.getSound(soundId);

                if (!soundOpt) {
                    res.status = 404;
                    res.set_content("{\"error\":\"Sound not found\"}", "application/json");
                    return;
                }

                // Parse slider position from request (-50 to +50)
                auto json = nlohmann::json::parse(req.body);
                int sliderPosition = json.value("sliderPosition", 0); // Default to 0 if missing

                // Clamp slider position to valid range [-50, 50]
                sliderPosition = std::min(50, std::max(-50, sliderPosition));

                // Get default volumes from global settings
                int defaultLocalVolume = Soundux::Globals::gSettings.localVolume;
                int defaultRemoteVolume = Soundux::Globals::gSettings.remoteVolume;
                bool syncVolumes = Soundux::Globals::gSettings.syncVolumes;

                // Get the WebView instance for applying changes
                auto* webview = dynamic_cast<Soundux::Objects::WebView*>(Soundux::Globals::gGui.get());
                if (!webview) {
                    res.status = 503;
                    res.set_content("{\"error\":\"Volume control service not available\"}", "application/json");
                    return;
                }

                // If slider is at center (0), reset to defaults by passing nullopt
                if (sliderPosition == 0) {
                    auto localResult = webview->setCustomLocalVolumeForWeb(soundId, std::nullopt);
                    auto remoteResult = webview->setCustomRemoteVolumeForWeb(soundId, std::nullopt);

                    if (localResult && remoteResult) {
                        nlohmann::json response;
                        response["success"] = true;
                        response["sliderPosition"] = 0;
                        response["localVolume"] = defaultLocalVolume; // Report effective volume
                        response["remoteVolume"] = defaultRemoteVolume; // Report effective volume
                        response["customLocalVolume"] = nullptr;
                        response["customRemoteVolume"] = nullptr;
                        response["hasCustomVolume"] = false;
                        response["defaultLocalVolume"] = defaultLocalVolume;
                        response["defaultRemoteVolume"] = defaultRemoteVolume;
                        res.set_content(response.dump(), "application/json");
                    } else {
                        res.status = 500;
                        res.set_content("{\"error\":\"Failed to reset volume\"}", "application/json");
                    }
                    return;
                }

                // Calculate new volumes based on slider position [-50, 50] mapping to [0%, 200%]
                // Ratio = 1.0 + (sliderPosition / 50.0)
                float factor = 1.0f + (static_cast<float>(sliderPosition) / 50.0f);

                // Calculate target volumes
                int newLocalVolume = static_cast<int>(std::round(defaultLocalVolume * factor));
                int newRemoteVolume = static_cast<int>(std::round(defaultRemoteVolume * factor));

                // Clamp volumes (e.g., 0 to 200 or higher?) Let's use 0-200 for now.
                newLocalVolume = std::min(200, std::max(0, newLocalVolume));
                newRemoteVolume = std::min(200, std::max(0, newRemoteVolume));

                // Apply the calculated volumes using WebView methods
                std::optional<Sound> localResult, remoteResult;
                localResult = webview->setCustomLocalVolumeForWeb(soundId, newLocalVolume);

                // Apply remote volume only if not syncing or if sync is handled internally by setCustom***VolumeForWeb
                if (!syncVolumes) {
                     remoteResult = webview->setCustomRemoteVolumeForWeb(soundId, newRemoteVolume);
                } else {
                     // If syncing, setting local should ideally trigger remote sync via changeSettings/onSettingsChanged mechanisms
                     // Let's assume setCustomLocalVolumeForWeb handles sync if syncVolumes is true.
                     // We might need to re-fetch the remote volume if it was auto-updated.
                     remoteResult = localResult; // Assume success if local success and syncing
                     if(localResult) {
                         // Refetch the possibly synced remote volume for the response
                         auto updatedSound = Soundux::Globals::gData.getSound(soundId);
                         if(updatedSound) newRemoteVolume = updatedSound->get().remoteVolume.value_or(defaultRemoteVolume);
                     }
                }


                if (localResult && remoteResult) {
                    // Response with full details
                    nlohmann::json response;
                    response["success"] = true;
                    response["sliderPosition"] = sliderPosition;
                    response["localVolume"] = newLocalVolume; // Report applied volume
                    response["remoteVolume"] = newRemoteVolume; // Report applied/synced volume
                    response["customLocalVolume"] = newLocalVolume; // Report the value that was set
                    response["customRemoteVolume"] = newRemoteVolume; // Report the value that was set (or synced to)
                    response["hasCustomVolume"] = true;
                    response["defaultLocalVolume"] = defaultLocalVolume;
                    response["defaultRemoteVolume"] = defaultRemoteVolume;

                    res.set_content(response.dump(), "application/json");
                } else {
                    res.status = 500;
                    res.set_content("{\"error\":\"Failed to set one or more volume values\"}", "application/json");
                }
            } catch (const nlohmann::json::parse_error& e) {
                 res.status = 400;
                 res.set_content("{\"error\":\"Invalid JSON request: " + std::string(e.what()) + "\"}", "application/json");
            } catch (const std::invalid_argument &) {
                res.status = 400;
                res.set_content("{\"error\":\"Invalid sound ID format\"}", "application/json");
            } catch (const std::out_of_range &) {
                 res.status = 400;
                 res.set_content("{\"error\":\"Invalid sound ID or slider value\"}", "application/json");
            } catch (const std::exception &e) {
                res.status = 500;
                res.set_content("{\"error\":\"Failed to set volume: " + std::string(e.what()) + "\"}", "application/json");
            }
        });

        // Reset volume endpoint (redundant if POST /volume with sliderPosition=0 works, but explicit is fine)
        server->Post(R"(/api/sounds/(\d+)/volume/reset)", [](const httplib::Request &req, httplib::Response &res) {
            auto soundIdStr = req.matches[1];
            try {
                auto soundId = std::stoul(soundIdStr.str());
                auto soundOpt = Soundux::Globals::gData.getSound(soundId);

                if (!soundOpt) {
                    res.status = 404;
                    res.set_content("{\"error\":\"Sound not found\"}", "application/json");
                    return;
                }

                // Get the WebView instance
                auto* webview = dynamic_cast<Soundux::Objects::WebView*>(Soundux::Globals::gGui.get());
                if (!webview) {
                    res.status = 503;
                    res.set_content("{\"error\":\"Volume control service not available\"}", "application/json");
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
                    response["customLocalVolume"] = nullptr;
                    response["customRemoteVolume"] = nullptr;
                    response["hasCustomVolume"] = false;
                    response["defaultLocalVolume"] = Soundux::Globals::gSettings.localVolume;
                    response["defaultRemoteVolume"] = Soundux::Globals::gSettings.remoteVolume;

                    res.set_content(response.dump(), "application/json");
                } else {
                    res.status = 500;
                    res.set_content("{\"error\":\"Failed to reset volume\"}", "application/json");
                }
            } catch (const std::invalid_argument &) {
                res.status = 400;
                res.set_content("{\"error\":\"Invalid sound ID format\"}", "application/json");
            } catch (const std::out_of_range &) {
                 res.status = 400;
                 res.set_content("{\"error\":\"Invalid sound ID value\"}", "application/json");
            } catch (const std::exception &e) {
                res.status = 500;
                res.set_content("{\"error\":\"Failed to reset volume: " + std::string(e.what()) + "\"}", "application/json");
            }
        });

        // Preview sound (headphones only - needs specific implementation in gAudio)
        server->Post(R"(/api/sounds/(\d+)/preview)", [](const httplib::Request &req, httplib::Response &res) {
            auto soundIdStr = req.matches[1];
            try {
                auto soundId = std::stoul(soundIdStr.str());
                auto soundOpt = Soundux::Globals::gData.getSound(soundId);

                if (!soundOpt) {
                    res.status = 404;
                    res.set_content("{\"error\":\"Sound not found\"}", "application/json");
                    return;
                }

                // TODO: Implement actual preview logic in gAudio or WebView
                // For now, simulate success or use normal playback as placeholder
                Fancy::fancy.logTime().message() << "Preview requested for sound ID: " << soundId << ". Using normal playback as placeholder." << std::endl;

                // Placeholder: Use normal playback via WebView
                auto* webview = dynamic_cast<Soundux::Objects::WebView*>(Soundux::Globals::gGui.get());
                 if (!webview) {
                     res.status = 503;
                     res.set_content("{\"error\":\"Sound preview service not available\"}", "application/json");
                     return;
                 }
                 auto playingSound = webview->playSoundById(soundId); // This uses normal playback, not true preview


                // // Alternative: Direct call to gAudio (if it has a preview method)
                // auto playingSound = Soundux::Globals::gAudio.preview(soundOpt->get()); // Assuming gAudio.preview exists

                if (playingSound) {
                     nlohmann::json response;
                     response["success"] = true;
                     response["playingId"] = playingSound->id;
                     // Add other relevant info from playingSound if needed
                     res.set_content(response.dump(), "application/json");
                } else {
                    res.status = 500;
                    res.set_content("{\"error\":\"Failed to start preview playback\"}", "application/json");
                }
            } catch (const std::invalid_argument &) {
                res.status = 400;
                res.set_content("{\"error\":\"Invalid sound ID format\"}", "application/json");
            } catch (const std::out_of_range &) {
                 res.status = 400;
                 res.set_content("{\"error\":\"Invalid sound ID value\"}", "application/json");
            } catch (const std::exception &e) {
                res.status = 500;
                res.set_content("{\"error\":\"Failed to preview sound: " + std::string(e.what()) + "\"}", "application/json");
            }
        });
    }

    void WebServer::serveStaticFiles()
    {
        // Serve static files from the webRoot directory
        // httplib::Server::set_mount_point should handle this.
        // The second argument `true` enables directory listing (consider disabling: `false`)
        bool success = server->set_mount_point("/", webRoot.c_str()); // Serve from root URL path

         if (!success) {
             Fancy::fancy.logTime().failure() << "Failed to set mount point '/' to directory: " << webRoot << std::endl;
         } else {
             Fancy::fancy.logTime().message() << "Serving static files from '" << webRoot << "' at '/'." << std::endl;

              // Explicitly handle index.html for the root path "/" if set_mount_point doesn't do it automatically
              // and authentication should allow access AFTER login.
              // The pre-routing handler redirects to login.html if not authenticated.
              // If authenticated, allow serving index.html.
              server->Get("/", [this](const httplib::Request& req, httplib::Response& res) {
                  // Authentication is already checked by pre-routing handler.
                  // If we reach here, user is authenticated or auth is disabled.
                  std::filesystem::path indexPath = std::filesystem::path(webRoot) / "index.html";
                   if (std::filesystem::exists(indexPath)) {
                       std::ifstream ifs(indexPath.string(), std::ios::in | std::ios::binary);
                       if (ifs) {
                           // Determine content type (usually text/html)
                           res.set_content_provider(
                               ifs.seekg(0, std::ios::end).tellg(), // file size
                               "text/html", // content type
                               [filePath = indexPath.string()](uint64_t offset, uint64_t length, httplib::DataSink &sink) { // Removed [&] capture
                                   std::ifstream ifs_provider(filePath, std::ios::in | std::ios::binary);
                                   if (ifs_provider) {
                                       ifs_provider.seekg(offset);
                                       std::vector<char> buf(static_cast<size_t>(length));
                                       ifs_provider.read(buf.data(), length);
                                       sink.write(buf.data(), ifs_provider.gcount());
                                       return true;
                                   }
                                   return false;
                               }
                           );
                       } else {
                            res.status = 500;
                            res.set_content("Could not read index.html", "text/plain");
                       }
                   } else {
                        res.status = 404;
                        res.set_content("index.html not found", "text/plain");
                   }
              });

             // Also handle login.html explicitly if needed, though mount point might cover it.
             server->Get("/login.html", [this](const httplib::Request& req, httplib::Response& res) {
                  // Auth check should allow this page.
                  std::filesystem::path loginPathFs = std::filesystem::path(webRoot) / "login.html";
                  if (std::filesystem::exists(loginPathFs)) {
                       std::ifstream ifs(loginPathFs.string(), std::ios::in | std::ios::binary);
                       if (ifs) {
                            res.set_content_provider(
                                ifs.seekg(0, std::ios::end).tellg(), "text/html",
                                [filePath = loginPathFs.string()](uint64_t offset, uint64_t length, httplib::DataSink &sink) { // Removed [&] capture
                                    std::ifstream ifs_provider(filePath, std::ios::in | std::ios::binary);
                                    if (ifs_provider) {
                                        ifs_provider.seekg(offset);
                                        std::vector<char> buf(static_cast<size_t>(length));
                                        ifs_provider.read(buf.data(), length);
                                        sink.write(buf.data(), ifs_provider.gcount());
                                        return true;
                                    } return false;
                                }
                            );
                       } else {
                            res.status = 500; res.set_content("Could not read login.html", "text/plain");
                       }
                   } else {
                       res.status = 404; res.set_content("login.html not found", "text/plain");
                   }
             });

         }

         // Optional: Set a handler for files not found within the mount point
         // server->set_file_request_handler([](const httplib::Request& req, httplib::Response& res) {
             // Default httplib handler might be sufficient? This overrides it.
         //    Fancy::fancy.logTime().warning() << "Static file not found (file_request_handler): " << req.path << std::endl;
         //    res.status = 404;
         //    res.set_content("File not found", "text/plain");
         //});

    }
} // namespace Soundux::Objects
