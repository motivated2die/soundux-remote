#include "config.hpp"
#include <chrono>
#include <fancy.hpp>
#include <filesystem>
#include <fstream>
#include <helper/json/bindings.hpp>
#include <string>

namespace Soundux::Objects
{
    const std::string Config::path = []() -> std::string {
#if defined(__linux__)
        const auto *configPath = std::getenv("XDG_CONFIG_HOME"); // NOLINT
        if (configPath)
        {
            return std::string(configPath) + "/Soundux/config.json";
        }
        return std::string(std::getenv("HOME")) + "/.config/Soundux/config.json"; // NOLINT
#elif defined(_WIN32)
        char *buffer;
        std::size_t size;
        _dupenv_s(&buffer, &size, "APPDATA");
        auto rtn = std::string(buffer) + "\\Soundux\\config.json";
        free(buffer);

        return rtn;
#endif
    }();

    void Config::save()
    {
        try
        {
            // Ensure config directory exists
            if (!std::filesystem::exists(path))
            {
                std::filesystem::path configFile(path);
                std::filesystem::create_directories(configFile.parent_path());
            }
            
            // Generate config content
            std::string configContent = nlohmann::json(*this).dump(4); // Pretty print with indentation
            
            // First write to a temporary file to prevent corruption if crash during write
            std::string tempPath = path + ".tmp";
            {
                std::ofstream tempFile(tempPath, std::ios::out | std::ios::trunc);
                if (!tempFile)
                {
                    throw std::runtime_error("Failed to open temporary config file for writing");
                }
                tempFile << configContent;
                tempFile.flush(); // Ensure data is written to disk
                tempFile.close(); // Close file explicitly
                
                if (tempFile.fail())
                {
                    throw std::runtime_error("Error while writing temporary config file");
                }
            }
            
            // Rename temp file to actual config file (atomic operation on most filesystems)
            std::error_code ec;
            std::filesystem::rename(tempPath, path, ec);
            if (ec)
            {
                // If rename fails, try copy and delete approach
                std::filesystem::copy_file(tempPath, path, 
                                          std::filesystem::copy_options::overwrite_existing, ec);
                std::filesystem::remove(tempPath, ec);
            }
            
            Fancy::fancy.logTime().success() << "Config written successfully" << std::endl;
        }
        catch (const std::exception &e)
        {
            Fancy::fancy.logTime().failure() << "Failed to write config: " << e.what() << std::endl;
        }
        catch (...)
        {
            Fancy::fancy.logTime().failure() << "Failed to write config" << std::endl;
        }
    }
    void Config::load()
    {
        try
        {
            if (!std::filesystem::exists(path))
            {
                Fancy::fancy.logTime().warning() << "Config not found" << std::endl;
                return;
            }

            std::ifstream configStream(path);
            std::string content((std::istreambuf_iterator<char>(configStream)), std::istreambuf_iterator<char>());
            auto json = nlohmann::json::parse(content, nullptr, false);
            if (json.is_discarded())
            {
                Fancy::fancy.logTime().failure() << "Config seems corrupted" << std::endl;
            }
            else
            {
                try
                {
                    auto conf = json.get<Config>();
                    data.set(conf.data);
                    settings = conf.settings;
                    Fancy::fancy.logTime().success() << "Config read" << std::endl;
                }
                catch (...)
                {
                    Fancy::fancy.logTime().warning()
                        << "Found possibly old config format, moving old config..." << std::endl;

                    std::filesystem::path configFile(path);
                    std::filesystem::rename(
                        path,
                        configFile.parent_path() /
                            ("soundux_config_old_" +
                             std::to_string(std::chrono::system_clock::now().time_since_epoch().count()) + ".json"));
                }
            }
            configStream.close();
        }
        catch (const std::exception &e)
        {
            Fancy::fancy.logTime().warning() << "Failed to read config: " << e.what() << std::endl;
        }
        catch (...)
        {
            Fancy::fancy.logTime().warning() << "Failed to read config" << std::endl;
        }
    }
} // namespace Soundux::Objects