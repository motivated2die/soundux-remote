// --- START OF FILE webserver.hpp ---
// Add clearAllTokens method
#pragma once
#include <atomic>
#include <core/objects/settings.hpp>
#include <httplib.h>
#include <memory>
#include <string>
#include <thread>
#include <random>
#include <unordered_set>
#include <mutex>
#include <vector> // Include vector for authorizedTokens

namespace Soundux
{
    namespace Objects
    {
        class WebServer
        {
          private:
            std::atomic<bool> running = false;
            std::thread serverThread;
            std::unique_ptr<httplib::Server> server;
            std::string webRoot;
            std::string pinCode;
            std::unordered_set<std::string> validTokens; // In-memory active tokens
            std::mutex tokensMutex;

            void setupRoutes();
            void setupTabEndpoints();
            void setupSoundEndpoints();
            void setupAuthEndpoints();
            void serveStaticFiles();
            void generatePin();
            std::string generateToken(); // Modifies settings
            bool isValidToken(const std::string& token); // Reads settings
            bool authenticateRequest(const httplib::Request& req, httplib::Response& res);
            void loadPersistedTokens(); // ADDED: Load tokens on start

          public:
            WebServer();
            ~WebServer();

            bool start(const std::string &host, int port, const std::string &webRootPath);
            void stop();
            bool isRunning() const;
            const std::string& getPin() const { return pinCode; }

            // ADDED: Public method to clear all tokens
            void clearAllTokens();
        };
    } // namespace Objects
} // namespace Soundux
// --- END OF FILE webserver.hpp ---