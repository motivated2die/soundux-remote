// --- START OF FILE webserver.cpp ---
// Includes previous fixes for std::optional JSON serialization
// Integrates plan's authenticateRequest logic, keeps previous start/setupRoutes logic

#include "webserver.hpp"
#include <core/global/globals.hpp> // Access gConfig
#include <core/config/config.hpp> // Access Config class directly for save
#include <fancy.hpp>
#include <filesystem>
// #include <fancy.hpp> // Duplicate include removed
#include <ui/impl/webview/webview.hpp>
#include <random>
#include <sstream>
#include <iomanip>
#include <chrono>
#include <fstream>
#include <optional>
#include <nlohmann/json.hpp>
#include <vector>
#include <string>
#include <algorithm>

#if defined(__linux__)
#include <unistd.h>
#include <limits.h>
#endif


namespace Soundux::Objects
{
    // --- Authentication Logic Implementation ---
    
    // --- Helper function to save settings ---
    void saveSettingsImmediately(const std::string& reason) {
        try {
            Globals::gConfig.settings = Globals::gSettings;
            Globals::gConfig.data.set(Globals::gData);
            Globals::gConfig.save();
            Fancy::fancy.logTime().message() << "Settings saved immediately (" << reason << ")."; // CHANGED info() to message()
        } catch (const std::exception& e) {
            Fancy::fancy.logTime().failure() << "Failed to save settings immediately (" << reason << "): " << e.what();
        } catch (...) {
             Fancy::fancy.logTime().failure() << "Failed to save settings immediately (" << reason << "): Unknown error.";
        }
    }

    // Generate a random 6-digit PIN
    void WebServer::generatePin() // Keep previous implementation
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
        Soundux::Globals::gSettings.remotePin = pinCode;
    }

    // Generate a secure random token for session management
    std::string WebServer::generateToken()
    {
        const std::string chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_int_distribution<> distrib(0, static_cast<int>(chars.size()) - 1);
        std::string token;

        // Ensure token is generated correctly and is not empty
        do {
            token.clear(); // Clear in case of loop repeat (highly unlikely)
            token.reserve(32);
            for (int i = 0; i < 32; ++i) { token += chars[distrib(gen)]; }
        } while (token.length() != 32); // Guarantee 32 chars, implicitly non-empty

        // Assertion for extra safety during development
        assert(!token.empty() && token.length() == 32 && "Generated token has unexpected length or is empty!");

        std::cout << "[WebServer DEBUG] Generated token: [" << token << "] (Length: " << token.length() << ")" << std::endl;

        bool addedToSettings = false;
        {
            std::lock_guard<std::mutex> lock(tokensMutex);
            validTokens.insert(token); // Assumed non-empty now

            // Add to persisted list only if non-empty and not duplicate
            if (!token.empty() && std::find(Globals::gSettings.authorizedTokens.begin(),
                                             Globals::gSettings.authorizedTokens.end(), token) == Globals::gSettings.authorizedTokens.end())
            {
                 Globals::gSettings.authorizedTokens.push_back(token);
                 addedToSettings = true;
                 std::cout << "[WebServer DEBUG] Added valid token [" << token << "] to gSettings.authorizedTokens." << std::endl;
            } else if (token.empty()){
                 std::cerr << "[WebServer ERROR] Attempted to add EMPTY token to gSettings.authorizedTokens. SKIPPED." << std::endl;
            } else {
                 std::cout << "[WebServer DEBUG] Token [" << token << "] already exists in gSettings.authorizedTokens." << std::endl;
            }
        }
        if (addedToSettings) { // Only save if a valid token was actually added
            std::cout << "[WebServer DEBUG] Saving settings because new valid token added..." << std::endl;
            saveSettingsImmediately("New valid token generated");
        }
        return token;
    }




    // Check if a token is valid
    bool WebServer::isValidToken(const std::string& token)
    {
        std::cout << "[WebServer DEBUG] Validating token: [" << token << "]" << std::endl;
        // ---> Explicitly reject empty tokens <---
        if (token.empty()) {
             std::cerr << "[WebServer WARNING] Attempting to validate an EMPTY token! REJECTED." << std::endl;
             return false; // Reject empty tokens
        }

        std::lock_guard<std::mutex> lock(tokensMutex);
        if (validTokens.find(token) != validTokens.end()) {
            std::cout << "[WebServer DEBUG] Token [" << token << "] found in memory set." << std::endl;
            return true;
        }
        const auto& persistedTokens = Globals::gSettings.authorizedTokens;
        if (std::find(persistedTokens.begin(), persistedTokens.end(), token) != persistedTokens.end()) {
             std::cout << "[WebServer DEBUG] Token [" << token << "] found in persisted settings." << std::endl;
            return true;
        }
        std::cout << "[WebServer DEBUG] Token [" << token << "] NOT valid." << std::endl;
        return false;
    }




    // Authentication middleware - Using logic from latest plan
    bool WebServer::authenticateRequest(const httplib::Request& req, httplib::Response& res)
    {
        // Skip authentication for auth endpoints and login page
        if (req.path.find("/api/auth/") == 0 || req.path == "/login.html") {
            return true;
        }

        // Also skip authentication for resources needed by login page
        // Note: This check might be too broad if "/assets/" is used elsewhere. Refine if necessary.
        if (req.path.find("/assets/") == 0 || req.path == "/manifest.json" || req.path == "/favicon.ico") {
            return true;
        }

        // Check if authentication is required (from global settings)
        if (!Globals::gSettings.requirePin) {
            return true; // Auth disabled
        }

        // Check for valid token in cookies
        if (req.has_header("Cookie")) {
            std::string cookies = req.get_header_value("Cookie");
            // std::cout << "[WebServer DEBUG] authenticateRequest: Received Cookies: " << cookies << std::endl;
            std::istringstream stream(cookies);
            std::string cookie;
            while (std::getline(stream, cookie, ';')) {
                // ... trim cookie ...
                const std::string authTokenPrefix = "soundux_auth=";
                if (cookie.rfind(authTokenPrefix, 0) == 0) {
                    std::string token = cookie.substr(authTokenPrefix.length());
                    // std::cout << "[WebServer DEBUG] authenticateRequest: Found auth token in cookie: [" << token << "]" << std::endl;
                    // ---> isValidToken now handles empty check <---
                    if (isValidToken(token)) {
                        return true;
                    }
                }
            }
        }


        // No valid token found and auth required

        // For API requests (except auth/login page assets), return 401 Unauthorized
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


    // Setup authentication endpoints - Use implementation from previous response (plan was identical)
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
                    std::string token = generateToken(); // generateToken now guarantees non-empty
   
                    // ---> Add check before setting cookie <---
                    if (token.empty()) {
                        std::cerr << "[WebServer ERROR] generateToken returned EMPTY string! Cannot set cookie." << std::endl;
                        res.status = 500; // Internal Server Error
                        res.set_content("{\"success\":false,\"error\":\"Internal server error during token generation\"}", "application/json");
                        return;
                    }
   
                    std::cout << "[WebServer DEBUG] Setting cookie with token: [" << token << "]" << std::endl;

                    auto now = std::chrono::system_clock::now();
                    auto expiration = now + std::chrono::hours(24 * 365);
                    auto expTime = std::chrono::system_clock::to_time_t(expiration);
                    std::tm gmt = *std::gmtime(&expTime);
                    std::stringstream ss;
                    ss << std::put_time(&gmt, "%a, %d %b %Y %H:%M:%S GMT");

                    // FIX: Remove extra semicolon
                    std::string cookieValue = "soundux_auth=" + token + "; Path=/; Expires=" + ss.str() + "; SameSite=Strict; HttpOnly"; // <<< REMOVED extra ;

                    std::cout << "[WebServer DEBUG] Set-Cookie header: " << cookieValue << std::endl;
                    res.set_header("Set-Cookie", cookieValue);

                    res.set_content("{\"success\":true}", "application/json");

                    // ... (log success) ...
                } else {
   
   
                     res.status = 401;
                     res.set_content("{\"success\":false,\"error\":\"Invalid PIN\"}", "application/json");
                     Fancy::fancy.logTime().warning() << "Failed login attempt with PIN: " << submittedPin << std::endl;
                 }
             } catch (const nlohmann::json::parse_error& e) {
                 res.status = 400; // Bad Request
                 res.set_content("{\"success\":false,\"error\":\"Invalid JSON format: " + std::string(e.what()) + "\"}", "application/json");
             } catch (const std::exception& e) {
                 res.status = 400; // Bad Request
                 res.set_content("{\"success\":false,\"error\":\"Invalid request: " + std::string(e.what()) + "\"}", "application/json");
             }
         });

        // Session check endpoint
        server->Get("/api/auth/check", [this](const httplib::Request& req, httplib::Response& res) {
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
             res.status = 401;
             res.set_content("{\"authenticated\":false}", "application/json");
         });

        // Logout endpoint
        server->Post("/api/auth/logout", [this](const httplib::Request& req, httplib::Response& res) {
            std::string tokenToRemove;
            // ... (find tokenToRemove) ...

            bool removed = false;
            if (!tokenToRemove.empty()) {
               std::lock_guard<std::mutex> lock(tokensMutex);
               validTokens.erase(tokenToRemove);
               auto& persistedTokens = Globals::gSettings.authorizedTokens;
               auto it = std::find(persistedTokens.begin(), persistedTokens.end(), tokenToRemove);
               if (it != persistedTokens.end()) {
                   persistedTokens.erase(it);
                   removed = true;
                   Fancy::fancy.logTime().message() << "Removed token from persistent settings on logout.";
               }
            }
            // Only save if something was actually removed
            if (removed) {
                saveSettingsImmediately("Token removed on logout");
            }

           res.set_header("Set-Cookie", "soundux_auth=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict; HttpOnly");
           res.set_content("{\"success\":true}", "application/json");
            Fancy::fancy.logTime().message() << "User logged out.";
       });


    }


    
    // ADDED: Load persisted tokens into memory on startup
    void WebServer::loadPersistedTokens()
    {
        std::lock_guard<std::mutex> lock(tokensMutex);
        validTokens.clear();
        const auto& persistedTokens = Globals::gSettings.authorizedTokens;
        std::cout << "[WebServer DEBUG] Loading persisted tokens. Found " << persistedTokens.size() << " in settings:" << std::endl;
        for(const auto& t : persistedTokens) {
            // ---> Skip empty tokens found in settings <---
            if (t.empty()) {
                std::cerr << "[WebServer WARNING] Found and SKIPPED loading an EMPTY token string from settings!" << std::endl;
                continue; // Skip adding empty token to memory
            }
            std::cout << "  - Loading token: [" << t << "]" << std::endl;
            validTokens.insert(t); // Add valid token to memory set
        }
        std::cout << "[WebServer DEBUG] In-memory validTokens count after load: " << validTokens.size() << std::endl;
    }


    // Modified Constructor: Calls loadPersistedTokens
    WebServer::WebServer() : server(std::make_unique<httplib::Server>())
    {
        generatePin();
        loadPersistedTokens();
    }



    // ADDED: Method to clear all tokens
    void WebServer::clearAllTokens()
    {
        bool changed = false;
        {
            std::lock_guard<std::mutex> lock(tokensMutex);
            if (!validTokens.empty()) {
                validTokens.clear();
                changed = true;
            }
            if (!Globals::gSettings.authorizedTokens.empty()) {
                Globals::gSettings.authorizedTokens.clear();
                changed = true;
            }
        }
        if (changed) {
            Fancy::fancy.logTime().success() << "All remote authentication tokens cleared.";
            saveSettingsImmediately("All tokens cleared");
        } else {
             Fancy::fancy.logTime().message() << "No remote authentication tokens to clear.";
        }
    }

    // --- End Authentication Logic ---


    // Destructor - Keep previous implementation
    WebServer::~WebServer()
    {
        if (running.load()) {
             stop();
        } else {
             // Fancy::fancy.logTime().message() << "WebServer destructor: Server already stopped."; // Use cout if fancy is suspect
             std::cout << "[WebServer] Destructor: Server already stopped." << std::endl;
        }
    }



    // start method - Keep previous implementation (NO dynamic login.html creation)
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
                    char selfPath[PATH_MAX];
                    ssize_t len = readlink("/proc/self/exe", selfPath, sizeof(selfPath)-1);
                    if(len != -1) {
                      selfPath[len] = '\0';
                      basePath = std::filesystem::path(selfPath).parent_path().string();
                    } else {
                      Fancy::fancy.logTime().warning() << "Could not read /proc/self/exe, using fallback path." << std::endl;
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

        // Check if login.html exists in the web root - DO NOT CREATE IT
        std::filesystem::path loginPath = std::filesystem::path(webRoot) / "login.html";
        if (!std::filesystem::exists(loginPath))
        {
             Fancy::fancy.logTime().warning() << "login.html not found in web root: " << loginPath.string() << ". Authentication WILL NOT work correctly." << std::endl;
             // Consider returning false or disabling auth if login page is mandatory?
             // For now, just warn.
        }


        // --- Setup Routes ---
        setupRoutes(); // Includes pre-routing auth handler
        setupAuthEndpoints(); // Authentication specific endpoints (ADDED Call)
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

            if (!server->listen(host.c_str(), port))
            {
                Fancy::fancy.logTime().failure() << "Failed to start web server listener on " << host << ":" << port << std::endl;
                running = false;
            }
        });

        return true;
    }


    // stop method - Keep previous implementation
    void WebServer::stop() // Keep previous implementation
    {
        if (running)
        {
            running = false;
            if (server) {
                 Fancy::fancy.logTime().message() << "Stopping web server..." << std::endl;
                 server->stop();
            } else {
                 Fancy::fancy.logTime().warning() << "Web server stop called, but server object was null." << std::endl;
            }

            if (serverThread.joinable())
            {
                try {
                    std::future<void> future = std::async(std::launch::async, [&](){
                        serverThread.join();
                    });
                    if (future.wait_for(std::chrono::seconds(2)) == std::future_status::timeout) {
                        Fancy::fancy.logTime().warning() << "Web server thread did not join within the timeout period." << std::endl;
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

    // isRunning - Keep previous implementation
    bool WebServer::isRunning() const // Keep previous implementation
    {
        return running;
    }

    // setupRoutes - Keep previous implementation (uses HandlerResponse correctly)
    void WebServer::setupRoutes()
    {
        server->set_pre_routing_handler([this](const httplib::Request& req, httplib::Response& res) -> httplib::Server::HandlerResponse {
            if (authenticateRequest(req, res)) {
                return httplib::Server::HandlerResponse::Unhandled; // Continue
            } else {
                return httplib::Server::HandlerResponse::Handled; // Stop
            }
        });

        server->Get("/api/status", [](const httplib::Request &, httplib::Response &res) {
            res.set_content("{\"status\":\"ok\"}", "application/json");
        });

        server->set_default_headers({
            {"Access-Control-Allow-Origin", "*"},
            {"Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE"},
            {"Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie"},
            {"Access-Control-Allow-Credentials", "true"}
        });

        server->Options(".*", [](const httplib::Request &req, httplib::Response &res) {
             res.set_header("Access-Control-Allow-Origin", req.get_header_value("Origin").empty() ? "*" : req.get_header_value("Origin"));
             res.set_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
             res.set_header("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie");
             res.set_header("Access-Control-Allow-Credentials", "true");
             res.set_header("Access-Control-Max-Age", "86400");
             res.status = 204;
             res.set_content("", "text/plain");
        });
    }


    // setupTabEndpoints - Keep previous implementation (with nlohmann::json)
    void WebServer::setupTabEndpoints() // Keep previous implementation
    {
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

        server->Get(R"(/api/tabs/(\d+)/sounds)", [](const httplib::Request &req, httplib::Response &res) {
            auto tabIdStr = req.matches[1];
            try
            {
                auto tabId = std::stoul(tabIdStr.str());
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

    // setupSoundEndpoints - Keep previous implementation (with nlohmann::json and optional fixes)
    void WebServer::setupSoundEndpoints() // Keep previous implementation
    {
        // Play a specific sound
        server->Post(R"(/api/sounds/(\d+)/play)", [](const httplib::Request &req, httplib::Response &res) {
            auto soundIdStr = req.matches[1];
            try {
                auto soundId = std::stoul(soundIdStr.str());
                auto* webview = dynamic_cast<Soundux::Objects::WebView*>(Soundux::Globals::gGui.get());
                if (!webview) { res.status = 503; res.set_content("{\"error\":\"Sound playback service not available\"}", "application/json"); return; }
                auto playingSound = webview->playSoundById(soundId);
                if (playingSound) {
                    nlohmann::json response = {{"success", true}, {"id", soundId}, {"playingId", playingSound->id}, {"lengthInMs", playingSound->lengthInMs}, {"length", playingSound->length}, {"sampleRate", playingSound->sampleRate}};
                    res.set_content(response.dump(), "application/json");
                } else {
                    auto soundExists = Soundux::Globals::gData.getSound(soundId).has_value();
                    if (!soundExists) { res.status = 404; res.set_content("{\"error\":\"Sound not found\"}", "application/json"); }
                    else { res.status = 500; res.set_content("{\"error\":\"Failed to play sound\"}", "application/json"); }
                }
            } catch (const std::invalid_argument &) { res.status = 400; res.set_content("{\"error\":\"Invalid sound ID format\"}", "application/json"); }
            catch (const std::out_of_range &) { res.status = 400; res.set_content("{\"error\":\"Invalid sound ID value\"}", "application/json"); }
            catch (const std::exception &e) { res.status = 500; res.set_content("{\"error\":\"An unexpected error occurred: " + std::string(e.what()) + "\"}", "application/json"); }
        });

        // Get progress of currently playing sounds
        server->Get("/api/sounds/progress", [](const httplib::Request &, httplib::Response &res) {
            try {
                auto playingSounds = Soundux::Globals::gAudio.getPlayingSounds();
                nlohmann::json jsonArray = nlohmann::json::array();
                for (const auto &sound : playingSounds) {
                    nlohmann::json soundObj;
                    soundObj["id"] = sound.id; soundObj["soundId"] = sound.sound.id; soundObj["name"] = sound.sound.name;
                    soundObj["lengthInMs"] = sound.lengthInMs; soundObj["readInMs"] = sound.readInMs.load(std::memory_order_relaxed);
                    soundObj["paused"] = sound.paused.load(std::memory_order_relaxed); soundObj["repeat"] = sound.repeat.load(std::memory_order_relaxed);
                    jsonArray.push_back(soundObj);
                }
                res.set_content(jsonArray.dump(), "application/json");
            } catch (const std::exception &e) { res.status = 500; res.set_content("{\"error\":\"Failed to get sound progress: " + std::string(e.what()) + "\"}", "application/json"); }
        });

        // Stop all sounds
        server->Post("/api/sounds/stop", [](const httplib::Request &, httplib::Response &res) {
            try {
                auto* webview = dynamic_cast<Soundux::Objects::WebView*>(Soundux::Globals::gGui.get());
                if (webview) { webview->stopAllSounds(); res.set_content("{\"success\":true}", "application/json"); }
                else { res.status = 503; res.set_content("{\"error\":\"Sound control service not available\"}", "application/json"); }
            } catch (const std::exception &e) { res.status = 500; res.set_content("{\"error\":\"Failed to stop sounds: " + std::string(e.what()) + "\"}", "application/json"); }
        });

        // Get single sound details
        server->Get(R"(/api/sounds/(\d+))", [](const httplib::Request &req, httplib::Response &res) {
            auto soundIdStr = req.matches[1];
            try {
                auto soundId = std::stoul(soundIdStr.str());
                auto soundOpt = Soundux::Globals::gData.getSound(soundId);
                if (soundOpt) {
                    const Sound& sound = soundOpt->get();
                    std::string tabName = "Unknown"; std::uint32_t tabId = 0;
                    for (const auto &tab : Soundux::Globals::gData.getTabs()) {
                        for (const auto &tabSound : tab.sounds) { if (tabSound.id == soundId) { tabName = tab.name; tabId = tab.id; goto found_tab_single; } }
                    } found_tab_single:;
                    nlohmann::json response;
                    response["id"] = sound.id; response["name"] = sound.name; response["path"] = sound.path; response["isFavorite"] = sound.isFavorite; response["tabName"] = tabName; response["tabId"] = tabId;
                    int defaultLocalVolume = Soundux::Globals::gSettings.localVolume; int defaultRemoteVolume = Soundux::Globals::gSettings.remoteVolume;
                    response["defaultLocalVolume"] = defaultLocalVolume; response["defaultRemoteVolume"] = defaultRemoteVolume;
                    bool hasCustomLocal = sound.localVolume.has_value(); bool hasCustomRemote = sound.remoteVolume.has_value(); bool hasCustomVolume = hasCustomLocal || hasCustomRemote;
                    response["hasCustomVolume"] = hasCustomVolume; response["localVolume"] = sound.localVolume.value_or(defaultLocalVolume); response["remoteVolume"] = sound.remoteVolume.value_or(defaultRemoteVolume);
                    response["customLocalVolume"] = sound.localVolume.has_value() ? nlohmann::json(*sound.localVolume) : nlohmann::json(nullptr); // Fixed optional
                    response["customRemoteVolume"] = sound.remoteVolume.has_value() ? nlohmann::json(*sound.remoteVolume) : nlohmann::json(nullptr); // Fixed optional
                    float ratio = 1.0f; if (hasCustomLocal) { if (defaultLocalVolume > 0) ratio = static_cast<float>(*sound.localVolume) / static_cast<float>(defaultLocalVolume); else if (*sound.localVolume > 0) ratio = 2.0f; }
                    int sliderPosition = 0; if (ratio >= 0.0f && ratio <= 2.0f) sliderPosition = static_cast<int>(std::round((ratio - 1.0f) * 50.0f)); else if (ratio > 2.0f) sliderPosition = 50; else sliderPosition = -50;
                    response["sliderPosition"] = sliderPosition; response["volumeRatio"] = ratio;
                    res.set_content(response.dump(), "application/json");
                } else { res.status = 404; res.set_content("{\"error\":\"Sound not found\"}", "application/json"); }
            } catch (const std::invalid_argument &) { res.status = 400; res.set_content("{\"error\":\"Invalid sound ID format\"}", "application/json"); }
            catch (const std::out_of_range &) { res.status = 400; res.set_content("{\"error\":\"Invalid sound ID value\"}", "application/json"); }
            catch (const std::exception &e) { res.status = 500; res.set_content("{\"error\":\"Failed to get sound details: " + std::string(e.what()) + "\"}", "application/json"); }
        });

        // Get sound settings summary
        server->Get("/api/sounds/settings", [](const httplib::Request &, httplib::Response &res) {
             try {
                 nlohmann::json response; response["success"] = true;
                 response["favorites"] = Soundux::Globals::gData.getFavoriteIds();
                 nlohmann::json customVolumes = nlohmann::json::object();
                 auto sounds = Soundux::Globals::gSounds.scoped();
                 int defaultLocalVolume = Soundux::Globals::gSettings.localVolume; int defaultRemoteVolume = Soundux::Globals::gSettings.remoteVolume;
                 for (const auto &soundPair : *sounds) {
                     const auto &sound = soundPair.second.get();
                     bool hasCustomLocal = sound.localVolume.has_value(); bool hasCustomRemote = sound.remoteVolume.has_value();
                     if (hasCustomLocal || hasCustomRemote) {
                         nlohmann::json customVolumeInfo;
                         customVolumeInfo["localVolume"] = sound.localVolume.value_or(defaultLocalVolume);
                         customVolumeInfo["remoteVolume"] = sound.remoteVolume.value_or(defaultRemoteVolume);
                         customVolumeInfo["customLocalVolume"] = sound.localVolume.has_value() ? nlohmann::json(*sound.localVolume) : nlohmann::json(nullptr); // Fixed optional
                         customVolumeInfo["customRemoteVolume"] = sound.remoteVolume.has_value() ? nlohmann::json(*sound.remoteVolume) : nlohmann::json(nullptr); // Fixed optional
                         customVolumeInfo["hasCustomVolume"] = true;
                         float ratio = 1.0f; if (hasCustomLocal) { if (defaultLocalVolume > 0) ratio = static_cast<float>(*sound.localVolume) / static_cast<float>(defaultLocalVolume); else if (*sound.localVolume > 0) ratio = 2.0f; }
                         int sliderPosition = 0; if (ratio >= 0.0f && ratio <= 2.0f) sliderPosition = static_cast<int>(std::round((ratio - 1.0f) * 50.0f)); else if (ratio > 2.0f) sliderPosition = 50; else sliderPosition = -50;
                         customVolumeInfo["sliderPosition"] = sliderPosition;
                         customVolumes[std::to_string(sound.id)] = customVolumeInfo;
                     }
                 }
                 response["customVolumes"] = customVolumes; response["defaultLocalVolume"] = defaultLocalVolume; response["defaultRemoteVolume"] = defaultRemoteVolume; response["syncVolumes"] = Soundux::Globals::gSettings.syncVolumes;
                 res.set_content(response.dump(), "application/json");
             } catch (const std::exception &e) { res.status = 500; res.set_content("{\"error\":\"Failed to fetch sound settings: " + std::string(e.what()) + "\"}", "application/json"); }
         });

        // Toggle favorite status
        server->Post(R"(/api/sounds/(\d+)/favorite)", [](const httplib::Request &req, httplib::Response &res) {
            auto soundIdStr = req.matches[1];
            try {
                auto soundId = std::stoul(soundIdStr.str());
                auto* webview = dynamic_cast<Soundux::Objects::WebView*>(Soundux::Globals::gGui.get());
                if (!webview) { res.status = 503; res.set_content("{\"error\":\"Favorite toggle service not available\"}", "application/json"); return; }
                bool success = webview->toggleFavoriteForWeb(soundId);
                if (success) {
                    auto updatedSound = Soundux::Globals::gData.getSound(soundId);
                    bool isFavoriteNow = updatedSound ? updatedSound->get().isFavorite : false;
                    res.set_content("{\"success\":true, \"isFavorite\": " + std::string(isFavoriteNow ? "true" : "false") + "}", "application/json");
                } else { res.status = 404; res.set_content("{\"error\":\"Sound not found or failed to toggle favorite\"}", "application/json"); }
            } catch (const std::invalid_argument &) { res.status = 400; res.set_content("{\"error\":\"Invalid sound ID format\"}", "application/json"); }
            catch (const std::out_of_range &) { res.status = 400; res.set_content("{\"error\":\"Invalid sound ID value\"}", "application/json"); }
            catch (const std::exception &e) { res.status = 500; res.set_content("{\"error\":\"Failed to toggle favorite status: " + std::string(e.what()) + "\"}", "application/json"); }
        });

        // Set volume using slider position
        server->Post(R"(/api/sounds/(\d+)/volume)", [](const httplib::Request &req, httplib::Response &res) {
             auto soundIdStr = req.matches[1];
             try {
                 auto soundId = std::stoul(soundIdStr.str());
                 if (!Soundux::Globals::gData.getSound(soundId)) { res.status = 404; res.set_content("{\"error\":\"Sound not found\"}", "application/json"); return; }
                 auto json = nlohmann::json::parse(req.body);
                 int sliderPosition = std::min(50, std::max(-50, json.value("sliderPosition", 0)));
                 int defaultLocalVolume = Soundux::Globals::gSettings.localVolume; int defaultRemoteVolume = Soundux::Globals::gSettings.remoteVolume; bool syncVolumes = Soundux::Globals::gSettings.syncVolumes;
                 auto* webview = dynamic_cast<Soundux::Objects::WebView*>(Soundux::Globals::gGui.get());
                 if (!webview) { res.status = 503; res.set_content("{\"error\":\"Volume control service not available\"}", "application/json"); return; }

                 if (sliderPosition == 0) { // Reset case
                     auto localResult = webview->setCustomLocalVolumeForWeb(soundId, std::nullopt); auto remoteResult = webview->setCustomRemoteVolumeForWeb(soundId, std::nullopt);
                     if (localResult && remoteResult) {
                         nlohmann::json response = {{"success", true}, {"sliderPosition", 0}, {"localVolume", defaultLocalVolume}, {"remoteVolume", defaultRemoteVolume}, {"customLocalVolume", nullptr}, {"customRemoteVolume", nullptr}, {"hasCustomVolume", false}, {"defaultLocalVolume", defaultLocalVolume}, {"defaultRemoteVolume", defaultRemoteVolume}};
                         res.set_content(response.dump(), "application/json");
                     } else { res.status = 500; res.set_content("{\"error\":\"Failed to reset volume\"}", "application/json"); }
                     return;
                 }
                 // Set custom volume case
                 float factor = 1.0f + (static_cast<float>(sliderPosition) / 50.0f);
                 int newLocalVolume = std::min(200, std::max(0, static_cast<int>(std::round(defaultLocalVolume * factor))));
                 int newRemoteVolume = std::min(200, std::max(0, static_cast<int>(std::round(defaultRemoteVolume * factor))));
                 std::optional<Sound> localResult, remoteResult;
                 localResult = webview->setCustomLocalVolumeForWeb(soundId, newLocalVolume);
                 if (!syncVolumes) { remoteResult = webview->setCustomRemoteVolumeForWeb(soundId, newRemoteVolume); }
                 else { remoteResult = localResult; if(localResult) { auto updatedSound = Soundux::Globals::gData.getSound(soundId); if(updatedSound) newRemoteVolume = updatedSound->get().remoteVolume.value_or(defaultRemoteVolume); } }

                 if (localResult && remoteResult) {
                     nlohmann::json response = {{"success", true}, {"sliderPosition", sliderPosition}, {"localVolume", newLocalVolume}, {"remoteVolume", newRemoteVolume}, {"customLocalVolume", newLocalVolume}, {"customRemoteVolume", newRemoteVolume}, {"hasCustomVolume", true}, {"defaultLocalVolume", defaultLocalVolume}, {"defaultRemoteVolume", defaultRemoteVolume}};
                     res.set_content(response.dump(), "application/json");
                 } else { res.status = 500; res.set_content("{\"error\":\"Failed to set one or more volume values\"}", "application/json"); }
             } catch (const nlohmann::json::parse_error& e) { res.status = 400; res.set_content("{\"error\":\"Invalid JSON request: " + std::string(e.what()) + "\"}", "application/json"); }
             catch (const std::invalid_argument &) { res.status = 400; res.set_content("{\"error\":\"Invalid sound ID format\"}", "application/json"); }
             catch (const std::out_of_range &) { res.status = 400; res.set_content("{\"error\":\"Invalid sound ID or slider value\"}", "application/json"); }
             catch (const std::exception &e) { res.status = 500; res.set_content("{\"error\":\"Failed to set volume: " + std::string(e.what()) + "\"}", "application/json"); }
         });

        // Reset volume endpoint
        server->Post(R"(/api/sounds/(\d+)/volume/reset)", [](const httplib::Request &req, httplib::Response &res) {
            auto soundIdStr = req.matches[1];
            try {
                 auto soundId = std::stoul(soundIdStr.str());
                 if (!Soundux::Globals::gData.getSound(soundId)) { res.status = 404; res.set_content("{\"error\":\"Sound not found\"}", "application/json"); return; }
                 auto* webview = dynamic_cast<Soundux::Objects::WebView*>(Soundux::Globals::gGui.get());
                 if (!webview) { res.status = 503; res.set_content("{\"error\":\"Volume control service not available\"}", "application/json"); return; }
                 auto localResult = webview->setCustomLocalVolumeForWeb(soundId, std::nullopt); auto remoteResult = webview->setCustomRemoteVolumeForWeb(soundId, std::nullopt);
                 if (localResult && remoteResult) {
                     int defaultLocal = Soundux::Globals::gSettings.localVolume; int defaultRemote = Soundux::Globals::gSettings.remoteVolume;
                     nlohmann::json response = {{"success", true}, {"sliderPosition", 0}, {"localVolume", defaultLocal}, {"remoteVolume", defaultRemote}, {"customLocalVolume", nullptr}, {"customRemoteVolume", nullptr}, {"hasCustomVolume", false}, {"defaultLocalVolume", defaultLocal}, {"defaultRemoteVolume", defaultRemote}};
                     res.set_content(response.dump(), "application/json");
                 } else { res.status = 500; res.set_content("{\"error\":\"Failed to reset volume\"}", "application/json"); }
            } catch (const std::invalid_argument &) { res.status = 400; res.set_content("{\"error\":\"Invalid sound ID format\"}", "application/json"); }
            catch (const std::out_of_range &) { res.status = 400; res.set_content("{\"error\":\"Invalid sound ID value\"}", "application/json"); }
            catch (const std::exception &e) { res.status = 500; res.set_content("{\"error\":\"Failed to reset volume: " + std::string(e.what()) + "\"}", "application/json"); }
        });

        // Preview sound
        server->Post(R"(/api/sounds/(\d+)/preview)", [](const httplib::Request &req, httplib::Response &res) {
            auto soundIdStr = req.matches[1];
            try {
                 auto soundId = std::stoul(soundIdStr.str());
                 if (!Soundux::Globals::gData.getSound(soundId)) { res.status = 404; res.set_content("{\"error\":\"Sound not found\"}", "application/json"); return; }
                 auto* webview = dynamic_cast<Soundux::Objects::WebView*>(Soundux::Globals::gGui.get());
                 if (!webview) { res.status = 503; res.set_content("{\"error\":\"Sound preview service not available\"}", "application/json"); return; }
                 Fancy::fancy.logTime().message() << "Preview requested (using normal playback) for sound ID: " << soundId;
                 auto playingSound = webview->playSoundById(soundId); // Placeholder
                 if (playingSound) { nlohmann::json response = {{"success", true}, {"playingId", playingSound->id}}; res.set_content(response.dump(), "application/json"); }
                 else { res.status = 500; res.set_content("{\"error\":\"Failed to start preview playback\"}", "application/json"); }
            } catch (const std::invalid_argument &) { res.status = 400; res.set_content("{\"error\":\"Invalid sound ID format\"}", "application/json"); }
            catch (const std::out_of_range &) { res.status = 400; res.set_content("{\"error\":\"Invalid sound ID value\"}", "application/json"); }
            catch (const std::exception &e) { res.status = 500; res.set_content("{\"error\":\"Failed to preview sound: " + std::string(e.what()) + "\"}", "application/json"); }
        });
    }

    // serveStaticFiles - Keep previous implementation
    void WebServer::serveStaticFiles() // Keep previous implementation
    {
        bool success = server->set_mount_point("/", webRoot.c_str());
         if (!success) { Fancy::fancy.logTime().failure() << "Failed to set mount point '/' to directory: " << webRoot << std::endl; }
         else {
             Fancy::fancy.logTime().message() << "Serving static files from '" << webRoot << "' at '/'." << std::endl;
             server->Get("/", [this](const httplib::Request& req, httplib::Response& res) {
                 std::filesystem::path indexPath = std::filesystem::path(webRoot) / "index.html";
                  if (std::filesystem::exists(indexPath)) {
                      std::ifstream ifs(indexPath.string(), std::ios::in | std::ios::binary);
                      if (ifs) {
                          res.set_content_provider( ifs.seekg(0, std::ios::end).tellg(), "text/html",
                              [filePath = indexPath.string()](uint64_t offset, uint64_t length, httplib::DataSink &sink) {
                                  std::ifstream ifs_provider(filePath, std::ios::in | std::ios::binary);
                                  if (ifs_provider) { ifs_provider.seekg(offset); std::vector<char> buf(static_cast<size_t>(length)); ifs_provider.read(buf.data(), length); sink.write(buf.data(), ifs_provider.gcount()); return true; }
                                  return false; } );
                      } else { res.status = 500; res.set_content("Could not read index.html", "text/plain"); }
                  } else { res.status = 404; res.set_content("index.html not found", "text/plain"); } });

             server->Get("/login.html", [this](const httplib::Request& req, httplib::Response& res) {
                 std::filesystem::path loginPathFs = std::filesystem::path(webRoot) / "login.html";
                 if (std::filesystem::exists(loginPathFs)) {
                      std::ifstream ifs(loginPathFs.string(), std::ios::in | std::ios::binary);
                      if (ifs) {
                           res.set_content_provider( ifs.seekg(0, std::ios::end).tellg(), "text/html",
                               [filePath = loginPathFs.string()](uint64_t offset, uint64_t length, httplib::DataSink &sink) {
                                   std::ifstream ifs_provider(filePath, std::ios::in | std::ios::binary);
                                   if (ifs_provider) { ifs_provider.seekg(offset); std::vector<char> buf(static_cast<size_t>(length)); ifs_provider.read(buf.data(), length); sink.write(buf.data(), ifs_provider.gcount()); return true; }
                                   return false; } );
                      } else { res.status = 500; res.set_content("Could not read login.html", "text/plain"); }
                  } else { res.status = 404; res.set_content("login.html not found", "text/plain"); } });
         }
    }
} // namespace Soundux::Objects
// --- END OF FILE webserver.cpp ---