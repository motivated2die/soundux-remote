cmake_minimum_required(VERSION 3.10)
project(soundux VERSION 0.2.8 DESCRIPTION "A crossplatform soundboard")

set(FULL_VERSION_STRING "0.2.8")
option(EMBED_PATH "The path used for embedding" "OFF")
option(USE_FLATPAK "Allows the program to run under flatpak" OFF)


file(GLOB src
    "src/*.cpp"
    "src/*/*.cpp"
    "src/*/*/*.cpp"
    "src/*/*/*/*.cpp"
    "src/*/*/*/*/*.cpp"
    "src/helper/webserver/*.cpp"
)

# Debug function to print directory contents
function(print_directory_contents dir_path)
    message(STATUS "Contents of directory: ${dir_path}")
    file(GLOB dir_contents "${dir_path}/*")
    foreach(item ${dir_contents})
        if(IS_DIRECTORY ${item})
            message(STATUS "  DIR:  ${item}")
        else()
            message(STATUS "  FILE: ${item}")
        endif()
    endforeach()
endfunction()

# Ensure directories exist early (less critical now with MAKE_DIRECTORY in function, but good practice)
file(MAKE_DIRECTORY "${CMAKE_BINARY_DIR}/web")
file(MAKE_DIRECTORY "${CMAKE_BINARY_DIR}/dist")
if(MSVC)
    file(MAKE_DIRECTORY "${CMAKE_BINARY_DIR}/Debug/web")
    file(MAKE_DIRECTORY "${CMAKE_BINARY_DIR}/Release/web")
    file(MAKE_DIRECTORY "${CMAKE_BINARY_DIR}/Debug/dist")
    file(MAKE_DIRECTORY "${CMAKE_BINARY_DIR}/Release/dist")
endif()


if (WIN32)
    add_executable(soundux WIN32 ${src} "assets/icon.rc")

    set(CompilerFlags
        CMAKE_CXX_FLAGS
        CMAKE_CXX_FLAGS_DEBUG
        CMAKE_CXX_FLAGS_RELEASE
        CMAKE_CXX_FLAGS_MINSIZEREL
        CMAKE_CXX_FLAGS_RELWITHDEBINFO
        CMAKE_C_FLAGS
        CMAKE_C_FLAGS_DEBUG
        CMAKE_C_FLAGS_RELEASE
        CMAKE_C_FLAGS_MINSIZEREL
        CMAKE_C_FLAGS_RELWITHDEBINFO
    )

    foreach(CompilerFlag ${CompilerFlags})
        # Use CACHE variables directly without intermediate variable
        string(REPLACE "/MD" "/MT" CURRENT_FLAGS "${${CompilerFlag}}")
        set(${CompilerFlag} "${CURRENT_FLAGS}" CACHE STRING "msvc compiler flags" FORCE)
        # Optional: Message only if flags changed or for debugging
        # message(STATUS "MSVC flags: ${CompilerFlag}:${${CompilerFlag}}")
    endforeach()

    target_compile_definitions(soundux PRIVATE WIN32_LEAN_AND_MEAN=1)
    target_compile_options(soundux PRIVATE /W4)
else()
    add_executable(soundux ${src})

    if (CMAKE_BUILD_TYPE STREQUAL "Debug")
        message(STATUS "Enabling warning and error flags for debug build")
        target_compile_options(soundux PRIVATE -Wall -Werror -Wextra -pedantic -Wno-unused-lambda-capture -Wno-gnu)
    endif()
endif()

target_compile_definitions(soundux PRIVATE SOUNDUX_VERSION="${FULL_VERSION_STRING}" WNCK_I_KNOW_THIS_IS_UNSTABLE=1)
target_include_directories(soundux SYSTEM PRIVATE "src")
target_include_directories(soundux SYSTEM PRIVATE "lib/miniaudio")
target_include_directories(soundux SYSTEM PRIVATE "lib/semver/include")
target_include_directories(soundux SYSTEM PRIVATE "lib/fancypp/include")
target_include_directories(soundux SYSTEM PRIVATE "lib/json/single_include")
target_include_directories(soundux SYSTEM PRIVATE "lib/guardpp/guard/include")

set(THREADS_PREFER_PTHREAD_FLAG ON)
find_package(Threads REQUIRED)
target_link_libraries(soundux PRIVATE Threads::Threads ${CMAKE_DL_LIBS})

if (UNIX AND NOT APPLE) # Added NOT APPLE check if X11/Wayland specific things are not needed on macOS
    list(APPEND CMAKE_MODULE_PATH ${CMAKE_CURRENT_SOURCE_DIR})
    find_package(PipeWire REQUIRED)

    find_package(PulseAudio) # Optional? Check if linking is needed if found
    find_package(X11 REQUIRED)
    target_include_directories(soundux SYSTEM PRIVATE ${X11_INCLUDE_DIR} ${PULSEAUDIO_INCLUDE_DIR} ${PipeWire_INCLUDE_DIRS} ${Spa_INCLUDE_DIRS})

    find_package(PkgConfig REQUIRED)
    pkg_check_modules(WNCK libwnck-3.0) # Check WNCK_FOUND before using variables
    if(WNCK_FOUND)
        target_include_directories(soundux PRIVATE ${WNCK_INCLUDE_DIRS})
        target_link_libraries(soundux PRIVATE ${WNCK_LIBRARIES})
    else()
         message(WARNING "libwnck-3.0 not found. Window title features might be limited.")
    endif()
    target_link_libraries(soundux PRIVATE ${X11_LIBRARIES} ${X11_Xinput_LIB} ${X11_XTest_LIB})
    if(PulseAudio_FOUND)
        target_link_libraries(soundux PRIVATE ${PULSEAUDIO_LIBRARY}) # Link if found
    endif()
    # Link PipeWire libraries
    target_link_libraries(soundux PRIVATE ${PipeWire_LIBRARIES} ${Spa_LIBRARIES})

endif()
if (WIN32)
    target_compile_definitions(soundux PRIVATE _CRT_SECURE_NO_WARNINGS=1 _SILENCE_ALL_CXX17_DEPRECATION_WARNINGS=1 _UNICODE=1)
endif()

add_subdirectory(src/ui/impl/webview/lib/webviewpp EXCLUDE_FROM_ALL)
add_subdirectory(lib/nativefiledialog-extended EXCLUDE_FROM_ALL)
add_subdirectory(lib/tiny-process-library EXCLUDE_FROM_ALL)
add_subdirectory(lib/backward-cpp EXCLUDE_FROM_ALL)
add_subdirectory(lib/traypp EXCLUDE_FROM_ALL)
add_subdirectory(lib/guardpp)
add_subdirectory(lib/lockpp)

add_backward(soundux)

if (WIN32)
    set(OPENSSL_USE_STATIC_LIBS TRUE)
    set(OPENSSL_MSVC_STATIC_RT  TRUE)
    set(BROTLI_USE_STATIC_LIBS TRUE)
endif()

set(HTTPLIB_REQUIRE_OPENSSL ON)
add_subdirectory(lib/cpp-httplib EXCLUDE_FROM_ALL)
target_include_directories(soundux SYSTEM PRIVATE "lib/cpp-httplib")

target_link_libraries(soundux PRIVATE webview nfd tiny-process-library tray guard httplib lockpp) # Add other libs like WNCK if needed

# --- Asset Copying Logic ---
if (${EMBED_PATH} STREQUAL "OFF")
    message(STATUS "Main UI and Web server content will not be embedded")

    # --- Copy soundux-ui frontend files ---
    set(SOUNDUX_UI_SOURCE_DIR "${CMAKE_SOURCE_DIR}/src/ui/impl/webview/lib/soundux-ui/")
    set(SOUNDUX_UI_DEST_DIR "${CMAKE_BINARY_DIR}/dist") # Base destination

    if(EXISTS "${SOUNDUX_UI_SOURCE_DIR}")
        message(STATUS "Copying main UI from ${SOUNDUX_UI_SOURCE_DIR}")
        # Copy to base build destination
        file(COPY "${SOUNDUX_UI_SOURCE_DIR}" DESTINATION "${SOUNDUX_UI_DEST_DIR}"
             FILE_PERMISSIONS OWNER_READ OWNER_WRITE GROUP_READ WORLD_READ)

        # Copy to configuration-specific directories for multi-config generators (like MSVC)
        if (CMAKE_CONFIGURATION_TYPES) # Check if multi-config generator
             message(STATUS "Copying main UI to configuration-specific directories (Debug/Release)")
             file(COPY "${SOUNDUX_UI_SOURCE_DIR}" DESTINATION "${CMAKE_BINARY_DIR}/Debug/dist"
                  FILE_PERMISSIONS OWNER_READ OWNER_WRITE GROUP_READ WORLD_READ)
             file(COPY "${SOUNDUX_UI_SOURCE_DIR}" DESTINATION "${CMAKE_BINARY_DIR}/Release/dist"
                  FILE_PERMISSIONS OWNER_READ OWNER_WRITE GROUP_READ WORLD_READ)
        endif()

        message(STATUS "Main UI source: ${SOUNDUX_UI_SOURCE_DIR}")
        # Optional: Add print_directory_contents calls here if needed for debugging UI copy
        # print_directory_contents("${SOUNDUX_UI_SOURCE_DIR}")
        # print_directory_contents("${SOUNDUX_UI_DEST_DIR}")
    else()
        message(WARNING "Main UI source directory not found: ${SOUNDUX_UI_SOURCE_DIR}")
    endif()


    # --- Copy web server content (with minification check) ---
    set(WEBSERVER_SOURCE_DIR "${CMAKE_SOURCE_DIR}/src/helper/webserver/html")
    set(WEBSERVER_DEST_DIR "${CMAKE_BINARY_DIR}/web") # Base destination

    # Function to copy web content with minification preference
    function(copy_web_content SOURCE_DIR DEST_DIR)
        message(STATUS "Copying web content from ${SOURCE_DIR} to ${DEST_DIR}")

        # Create destination directory if it doesn't exist
        file(MAKE_DIRECTORY "${DEST_DIR}")

        # Get all files from source directory recursively
        file(GLOB_RECURSE ALL_FILES RELATIVE "${SOURCE_DIR}" "${SOURCE_DIR}/*") # Use RELATIVE for easier path handling

        # Process each file individually
        foreach(REL_PATH ${ALL_FILES})
            set(SOURCE_FILE "${SOURCE_DIR}/${REL_PATH}")
            set(DEST_FILE "${DEST_DIR}/${REL_PATH}")

            # Skip directories explicitly (GLOB_RECURSE includes them sometimes)
            if(IS_DIRECTORY "${SOURCE_FILE}")
                continue()
            endif()

            # Get the directory of the destination file
            get_filename_component(DEST_PARENT_DIR "${DEST_FILE}" DIRECTORY)

            # Create the destination directory if it doesn't exist
            file(MAKE_DIRECTORY "${DEST_PARENT_DIR}") # Use DEST_PARENT_DIR

            # Check if this is a JS, CSS, or HTML file that might have a minified version
            if(SOURCE_FILE MATCHES "\\.(js|css|html)$" AND NOT SOURCE_FILE MATCHES "\\.min\\.(js|css|html)$")
                # Construct the potential minified filename
                string(REGEX REPLACE "(\\.[^.]+)$" ".min\\1" MINIFIED_SOURCE_FILE "${SOURCE_FILE}")

                # Check if minified version exists
                if(EXISTS "${MINIFIED_SOURCE_FILE}")
                    # message(STATUS "Using minified version for: ${REL_PATH}") # Uncomment for verbose debug
                    # Copy the minified file but with the original name
                    configure_file("${MINIFIED_SOURCE_FILE}" "${DEST_FILE}" COPYONLY)
                else()
                    # Use the original file
                    # message(STATUS "Using original version for: ${REL_PATH}") # Uncomment for verbose debug
                    configure_file("${SOURCE_FILE}" "${DEST_FILE}" COPYONLY)
                endif()
            # Only copy other files if they are *not* the minified versions we might have already handled
            elseif(NOT SOURCE_FILE MATCHES "\\.min\\.(js|css|html)$")
                # For all other files (images, fonts, etc.), copy directly
                # message(STATUS "Copying other file: ${REL_PATH}") # Uncomment for verbose debug
                configure_file("${SOURCE_FILE}" "${DEST_FILE}" COPYONLY)
            # else: It's a .min.js/css/html file. Do nothing here, it was handled (or ignored if no original exists) in the first 'if' branch.
            endif()
        endforeach()
    endfunction()

    # Check if source web server content exists
    if(EXISTS "${WEBSERVER_SOURCE_DIR}")
        message(STATUS "Web server content source path: ${WEBSERVER_SOURCE_DIR}")
        message(STATUS "Web server content base destination path: ${WEBSERVER_DEST_DIR}")

        # Copy to base build directory
        copy_web_content("${WEBSERVER_SOURCE_DIR}" "${WEBSERVER_DEST_DIR}")

        # Copy to Debug/Release directories for multi-config generators (like MSVC)
        if(CMAKE_CONFIGURATION_TYPES)
            message(STATUS "Copying web server content to configuration-specific directories (Debug/Release)")
            copy_web_content("${WEBSERVER_SOURCE_DIR}" "${CMAKE_BINARY_DIR}/Debug/web")
            copy_web_content("${WEBSERVER_SOURCE_DIR}" "${CMAKE_BINARY_DIR}/Release/web")
        endif()

        # Print contents for debugging (check the base destination)
        message(STATUS "--- Contents after copy (Source) ---")
        print_directory_contents("${WEBSERVER_SOURCE_DIR}")
        message(STATUS "--- Contents after copy (Build Destination) ---")
        print_directory_contents("${WEBSERVER_DEST_DIR}")
        if(CMAKE_CONFIGURATION_TYPES)
             message(STATUS "--- Contents after copy (Build Destination - Release) ---")
            print_directory_contents("${CMAKE_BINARY_DIR}/Release/web") # Also check Release dir
        endif()

        # Basic check if copy seemed to work
        if(NOT EXISTS "${WEBSERVER_DEST_DIR}/index.html" AND EXISTS "${WEBSERVER_SOURCE_DIR}/index.html")
             message(WARNING "Web content copy operation might have failed for base dir. index.html missing in destination.")
        endif()

    else()
        message(WARNING "Web server content source directory does not exist: ${WEBSERVER_SOURCE_DIR}")
    endif()
# *** This is the start of the 'else' branch for if(${EMBED_PATH} STREQUAL "OFF") ***
else()
    message(STATUS "Using embed path: ${EMBED_PATH}")
    # Ensure the webview target exists before trying to modify it
    # This assumes webviewpp creates a target named 'webview'
    if(TARGET webview)
        target_include_directories(webview PUBLIC ${EMBED_PATH})
    else()
        message(WARNING "Target 'webview' not found. Cannot add embed path include directory.")
    endif()
    target_compile_definitions(soundux PRIVATE IS_EMBEDDED=1)
endif() # *** Closes if(${EMBED_PATH} STREQUAL "OFF") ***

target_compile_features(soundux PRIVATE cxx_std_17)
set_target_properties(soundux PROPERTIES
                      CXX_STANDARD 17
                      CXX_EXTENSIONS OFF
                      CXX_STANDARD_REQUIRED ON)

set_target_properties(soundux PROPERTIES VERSION ${PROJECT_VERSION})
# set_target_properties(soundux PROPERTIES PROJECT_NAME ${PROJECT_NAME}) # PROJECT_NAME is already set by project()

# Installation
install(TARGETS soundux RUNTIME DESTINATION bin COMPONENT Runtime) # Use RUNTIME/bin more standard

if(USE_FLATPAK)
    target_compile_definitions(soundux PRIVATE USE_FLATPAK)
    # Link PulseAudio if found and using Flatpak (already handled above in UNIX block)

    if (${EMBED_PATH} STREQUAL "OFF")
        # Install the processed 'dist' directory from the build folder
        install(DIRECTORY "${CMAKE_BINARY_DIR}/dist/" # Trailing slash copies contents
                DESTINATION ${CMAKE_INSTALL_PREFIX}/bin/dist COMPONENT Runtime) # Install relative to prefix/bin
    endif()
    # Install processed web content from build if it exists
    if(EXISTS "${CMAKE_BINARY_DIR}/web")
        install(DIRECTORY "${CMAKE_BINARY_DIR}/web/" # Trailing slash copies contents
                DESTINATION ${CMAKE_INSTALL_PREFIX}/share/soundux/web COMPONENT Runtime) # Flatpak specific path
    endif()

    # Install Flatpak specific metadata if needed (adjust paths/names)
    # install(FILES ... DESTINATION share/metainfo)
    # install(FILES ... DESTINATION share/applications)
    # install(FILES ... DESTINATION share/icons/hicolor/scalable/apps)

else() # Not Flatpak
    # Default install prefix might be better handled outside the script (e.g., cmake -DCMAKE_INSTALL_PREFIX=...)
    # set(CMAKE_INSTALL_PREFIX "/opt/soundux" CACHE PATH "Install path prefix, prepended onto install directories." FORCE)

    if (${EMBED_PATH} STREQUAL "OFF")
         # Install the processed 'dist' directory from the build folder
        install(DIRECTORY "${CMAKE_BINARY_DIR}/dist/" # Trailing slash copies contents
                DESTINATION ${CMAKE_INSTALL_PREFIX}/bin/dist COMPONENT Runtime) # Install relative to prefix/bin
    endif()

    # Install Desktop/Metadata files (adjust destination for standard FHS)
    install(FILES "${CMAKE_SOURCE_DIR}/deployment/soundux.desktop"
            DESTINATION ${CMAKE_INSTALL_DATADIR}/applications COMPONENT Runtime) # Use CMAKE_INSTALL_DATADIR
    install(FILES "${CMAKE_SOURCE_DIR}/deployment/appstream/io.github.Soundux.metainfo.xml"
            DESTINATION ${CMAKE_INSTALL_DATADIR}/metainfo COMPONENT Runtime) # Use CMAKE_INSTALL_DATADIR
    install(FILES "${CMAKE_SOURCE_DIR}/assets/soundux.png"
            DESTINATION ${CMAKE_INSTALL_DATADIR}/pixmaps COMPONENT Runtime) # Use CMAKE_INSTALL_DATADIR

    # Install processed web content from build if it exists
    if(EXISTS "${CMAKE_BINARY_DIR}/web")
        set(WEB_INSTALL_DESTINATION "${CMAKE_INSTALL_DATADIR}/soundux/web") # Standard location under share
        message(STATUS "Web server content will be installed to: ${WEB_INSTALL_DESTINATION}")
        install(DIRECTORY "${CMAKE_BINARY_DIR}/web/" # Trailing slash copies contents
                DESTINATION ${WEB_INSTALL_DESTINATION} # Install relative to prefix/share
                COMPONENT Runtime
                FILES_MATCHING PATTERN "*" # Ensure all files and subdirs are matched
        )
    endif()

endif()

message(STATUS "Configuration done. Build directory: ${CMAKE_BINARY_DIR}")