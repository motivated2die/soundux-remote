
#pragma once
#include <atomic>
#include <core/objects/settings.hpp>
#include <httplib.h>
#include <memory>
#include <string>
#include <thread>
#include <random> // Added
#include <unordered_set> // Added
#include <mutex> // Added

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

            // Authentication-related members
            std::string pinCode;
            std::unordered_set<std::string> validTokens;
            std::mutex tokensMutex;

            void setupRoutes();
            void setupTabEndpoints();
            void setupSoundEndpoints();
            void setupAuthEndpoints(); // Added
            void serveStaticFiles();

            // Authentication methods
            void generatePin(); // Added
            std::string generateToken(); // Added
            bool isValidToken(const std::string& token); // Added
            bool authenticateRequest(const httplib::Request& req, httplib::Response& res); // Added

          public:
            WebServer();
            ~WebServer();

            bool start(const std::string &host, int port, const std::string &webRootPath);
            void stop();
            bool isRunning() const;

            // Getter for the PIN code to display in UI
            const std::string& getPin() const { return pinCode; } // Added
        };
    } // namespace Objects
} // namespace Soundux
