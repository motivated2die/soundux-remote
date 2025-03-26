#pragma once
#include <atomic>
#include <core/objects/settings.hpp>
#include <httplib.h>
#include <memory>
#include <string>
#include <thread>

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

            void setupRoutes();
            void setupTabEndpoints();
            void setupSoundEndpoints();
            void serveStaticFiles();

          public:
            WebServer();
            ~WebServer();

            bool start(const std::string &host, int port, const std::string &webRootPath);
            void stop();
            bool isRunning() const;
        };
    } // namespace Objects
} // namespace Soundux