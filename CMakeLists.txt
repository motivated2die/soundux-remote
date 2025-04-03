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
    if(EXISTS "${dir_path}")
        message(STATUS "Contents of directory: ${dir_path}")
        file(GLOB dir_contents LIST_DIRECTORIES true "${dir_path}/*")
        foreach(item ${dir_contents})
            if(IS_DIRECTORY ${item})
                message(STATUS "  DIR:  ${item}")
            else()
                get_filename_component(filename ${item} NAME)
                message(STATUS "  FILE: ${filename}")
            endif()
        endforeach()
    else()
        message(STATUS "Directory does not exist (cannot print contents): ${dir_path}")
    endif()
endfunction()

# NOTE: We remove destination directories before copying later,
# so initial MAKE_DIRECTORY here isn't strictly necessary for 'web',
# but keep it for 'dist' and general structure.
file(MAKE_DIRECTORY "${CMAKE_BINARY_DIR}/dist")
if(CMAKE_CONFIGURATION_TYPES) # Check if multi-config generator (like MSVC)
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

if (UNIX AND NOT APPLE)
    list(APPEND CMAKE_MODULE_PATH ${CMAKE_CURRENT_SOURCE_DIR})
    find_package(PipeWire REQUIRED)

    find_package(PulseAudio)
    find_package(X11 REQUIRED)
    target_include_directories(soundux SYSTEM PRIVATE ${X11_INCLUDE_DIR} ${PipeWire_INCLUDE_DIRS} ${Spa_INCLUDE_DIRS})
    if(PulseAudio_FOUND)
         target_include_directories(soundux SYSTEM PRIVATE ${PULSEAUDIO_INCLUDE_DIR})
    endif()

    find_package(PkgConfig REQUIRED)
    pkg_check_modules(WNCK libwnck-3.0)
    if(WNCK_FOUND)
        target_include_directories(soundux PRIVATE ${WNCK_INCLUDE_DIRS})
        target_link_libraries(soundux PRIVATE ${WNCK_LIBRARIES})
    else()
         message(WARNING "libwnck-3.0 not found. Window title features might be limited.")
    endif()
    target_link_libraries(soundux PRIVATE ${X11_LIBRARIES} ${X11_Xinput_LIB} ${X11_XTest_LIB})
    if(PulseAudio_FOUND)
        target_link_libraries(soundux PRIVATE ${PULSEAUDIO_LIBRARY})
    endif()
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

target_link_libraries(soundux PRIVATE webview nfd tiny-process-library tray guard httplib lockpp)


# --- Asset Copying Logic ---
if (${EMBED_PATH} STREQUAL "OFF")
    message(STATUS "Main UI and Web server content will not be embedded")

    # --- Copy soundux-ui frontend files ---
    set(SOUNDUX_UI_SOURCE_DIR "${CMAKE_SOURCE_DIR}/src/ui/impl/webview/lib/soundux-ui/")
    set(SOUNDUX_UI_DEST_DIR "${CMAKE_BINARY_DIR}/dist") # Base destination

    if(EXISTS "${SOUNDUX_UI_SOURCE_DIR}")
        message(STATUS "Copying main UI from ${SOUNDUX_UI_SOURCE_DIR}")
        # Always ensure a fresh copy of UI files during configure
        file(REMOVE_RECURSE "${SOUNDUX_UI_DEST_DIR}")
        file(COPY "${SOUNDUX_UI_SOURCE_DIR}" DESTINATION "${SOUNDUX_UI_DEST_DIR}"
             FILE_PERMISSIONS OWNER_READ OWNER_WRITE GROUP_READ WORLD_READ)

        if (CMAKE_CONFIGURATION_TYPES) # Multi-config generators
             message(STATUS "Copying main UI to configuration-specific directories (Debug/Release)")
             file(REMOVE_RECURSE "${CMAKE_BINARY_DIR}/Debug/dist")
             file(REMOVE_RECURSE "${CMAKE_BINARY_DIR}/Release/dist")
             file(COPY "${SOUNDUX_UI_SOURCE_DIR}" DESTINATION "${CMAKE_BINARY_DIR}/Debug/dist"
                  FILE_PERMISSIONS OWNER_READ OWNER_WRITE GROUP_READ WORLD_READ)
             file(COPY "${SOUNDUX_UI_SOURCE_DIR}" DESTINATION "${CMAKE_BINARY_DIR}/Release/dist"
                  FILE_PERMISSIONS OWNER_READ OWNER_WRITE GROUP_READ WORLD_READ)
        endif()
        # Optional: Debug prints
        # message(STATUS "Main UI source: ${SOUNDUX_UI_SOURCE_DIR}")
        # print_directory_contents("${SOUNDUX_UI_SOURCE_DIR}")
        # print_directory_contents("${SOUNDUX_UI_DEST_DIR}") # Check base dest
        # if(CMAKE_CONFIGURATION_TYPES)
        #     print_directory_contents("${CMAKE_BINARY_DIR}/Release/dist") # Check Release dest
        # endif()
    else()
        message(WARNING "Main UI source directory not found: ${SOUNDUX_UI_SOURCE_DIR}")
    endif()


    # --- Copy web server content (with minification check) ---
    set(WEBSERVER_SOURCE_DIR "${CMAKE_SOURCE_DIR}/src/helper/webserver/html")
    set(WEBSERVER_DEST_DIR "${CMAKE_BINARY_DIR}/web") # Base destination

    # Function to copy web content with minification preference
    # This function will be called after the destination directory is cleared
    function(copy_web_content SOURCE_DIR DEST_DIR)
        # message(STATUS "Copying web content from ${SOURCE_DIR} to ${DEST_DIR}") # Keep message outside loop

        # Create destination directory (important after REMOVE_RECURSE)
        file(MAKE_DIRECTORY "${DEST_DIR}")

        # Get all files from source directory recursively
        file(GLOB_RECURSE ALL_FILES RELATIVE "${SOURCE_DIR}" "${SOURCE_DIR}/*") # Use RELATIVE for easier path handling

        # Process each file individually
        foreach(REL_PATH ${ALL_FILES})
            set(SOURCE_FILE "${SOURCE_DIR}/${REL_PATH}")
            set(DEST_FILE "${DEST_DIR}/${REL_PATH}")

            # Skip directories explicitly
            if(IS_DIRECTORY "${SOURCE_FILE}")
                continue()
            endif()

            # Get the directory of the destination file
            get_filename_component(DEST_PARENT_DIR "${DEST_FILE}" DIRECTORY)

            # Create the destination directory if it doesn't exist
            # This handles subdirectories within the web content
            file(MAKE_DIRECTORY "${DEST_PARENT_DIR}")

            # Check if this is a JS, CSS, or HTML file that *might* have a minified version
            if(SOURCE_FILE MATCHES "\\.(js|css|html)$" AND NOT SOURCE_FILE MATCHES "\\.min\\.(js|css|html)$")
                # This is a potential original file (e.g., styles.css)
                # Construct the potential minified filename (e.g., styles.min.css)
                string(REGEX REPLACE "(\\.(js|css|html)$)" ".min\\1" MINIFIED_SOURCE_FILE "${SOURCE_FILE}")

                # Check if the corresponding minified version exists in the source
                if(EXISTS "${MINIFIED_SOURCE_FILE}")
                    # Minified version exists. Copy IT to the destination, using the ORIGINAL name.
                    # message(STATUS "Using minified: ${MINIFIED_SOURCE_FILE} -> ${DEST_FILE}") # Verbose Debug
                    configure_file("${MINIFIED_SOURCE_FILE}" "${DEST_FILE}" COPYONLY)
                else()
                    # Minified version doesn't exist. Copy the ORIGINAL source file.
                    # message(STATUS "Using original: ${SOURCE_FILE} -> ${DEST_FILE}") # Verbose Debug
                    configure_file("${SOURCE_FILE}" "${DEST_FILE}" COPYONLY)
                endif()
            # Only copy other files if they are *not* the minified versions
            # (which were handled above or should be ignored)
            elseif(NOT SOURCE_FILE MATCHES "\\.min\\.(js|css|html)$")
                # This is some other file type (image, font, etc.) OR an original js/css/html
                # that did NOT have a .min version (handled by the 'else' above). Copy it directly.
                # message(STATUS "Copying other: ${SOURCE_FILE} -> ${DEST_FILE}") # Verbose Debug
                configure_file("${SOURCE_FILE}" "${DEST_FILE}" COPYONLY)
            # else: Implicitly skip the actual *.min.js/css/html files found during globbing,
            #       because they are handled only when their non-minified counterpart is processed.
            #       This prevents copying them twice or with the wrong name.
            endif()
        endforeach()
    endfunction()

    # Check if source web server content exists
    if(EXISTS "${WEBSERVER_SOURCE_DIR}")
        message(STATUS "Web server content source path: ${WEBSERVER_SOURCE_DIR}")
        message(STATUS "Web server content base destination path: ${WEBSERVER_DEST_DIR}")

        # --- Ensure fresh copy on every configure ---
        message(STATUS "Removing existing web content from build directory to ensure fresh copy...")
        file(REMOVE_RECURSE "${WEBSERVER_DEST_DIR}")
        # --- End ensure fresh copy ---

        # Copy to base build directory (will recreate WEBSERVER_DEST_DIR)
        message(STATUS "Copying web content (preferring minified versions)...")
        copy_web_content("${WEBSERVER_SOURCE_DIR}" "${WEBSERVER_DEST_DIR}")

        # Handle Debug/Release directories for multi-config generators (like MSVC)
        if(CMAKE_CONFIGURATION_TYPES)
            message(STATUS "Removing existing web content from configuration-specific directories...")
            file(REMOVE_RECURSE "${CMAKE_BINARY_DIR}/Debug/web")
            file(REMOVE_RECURSE "${CMAKE_BINARY_DIR}/Release/web")

            message(STATUS "Copying web server content to configuration-specific directories (Debug/Release)...")
            copy_web_content("${WEBSERVER_SOURCE_DIR}" "${CMAKE_BINARY_DIR}/Debug/web")
            copy_web_content("${WEBSERVER_SOURCE_DIR}" "${CMAKE_BINARY_DIR}/Release/web")
        endif()

        # --- Debugging Output ---
        message(STATUS "--- Contents after copy (Source) ---")
        print_directory_contents("${WEBSERVER_SOURCE_DIR}")
        message(STATUS "--- Contents after copy (Build Destination: ${WEBSERVER_DEST_DIR}) ---")
        print_directory_contents("${WEBSERVER_DEST_DIR}")
        if(CMAKE_CONFIGURATION_TYPES)
             message(STATUS "--- Contents after copy (Build Destination - Release: ${CMAKE_BINARY_DIR}/Release/web) ---")
            print_directory_contents("${CMAKE_BINARY_DIR}/Release/web")
        endif()
        # --- End Debugging Output ---

        # Basic check if copy seemed to work (e.g., index.html exists in dest if it exists in source)
        if(EXISTS "${WEBSERVER_SOURCE_DIR}/index.html" AND NOT EXISTS "${WEBSERVER_DEST_DIR}/index.html")
             message(WARNING "Web content copy may have failed: index.html missing in destination ${WEBSERVER_DEST_DIR}")
        endif()

    else()
        message(WARNING "Web server content source directory does not exist: ${WEBSERVER_SOURCE_DIR}")
    endif() # End if(EXISTS "${WEBSERVER_SOURCE_DIR}")

else() # This is the 'else' for if(${EMBED_PATH} STREQUAL "OFF")
    message(STATUS "Using embed path: ${EMBED_PATH}")
    if(TARGET webview)
        target_include_directories(webview PUBLIC ${EMBED_PATH})
    else()
        message(WARNING "Target 'webview' not found. Cannot add embed path include directory.")
    endif()
    target_compile_definitions(soundux PRIVATE IS_EMBEDDED=1)
endif() # End if(${EMBED_PATH} STREQUAL "OFF")

target_compile_features(soundux PRIVATE cxx_std_17)
set_target_properties(soundux PROPERTIES
                      CXX_STANDARD 17
                      CXX_EXTENSIONS OFF
                      CXX_STANDARD_REQUIRED ON)

set_target_properties(soundux PROPERTIES VERSION ${PROJECT_VERSION})

# Installation
# Use standard locations and components
install(TARGETS soundux RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR} COMPONENT Runtime)

if(USE_FLATPAK)
    # Flatpak specific definitions/linking (PulseAudio link already handled in UNIX block if found)
    target_compile_definitions(soundux PRIVATE USE_FLATPAK)

    if (${EMBED_PATH} STREQUAL "OFF")
        # Install the processed 'dist' directory from the build folder
        install(DIRECTORY "${CMAKE_BINARY_DIR}/dist/" # Trailing slash copies contents
                DESTINATION ${CMAKE_INSTALL_BINDIR}/dist COMPONENT Runtime) # Install relative to prefix/bin
    endif()
    # Install processed web content from build if it exists and not embedded
    if(EXISTS "${CMAKE_BINARY_DIR}/web" AND ${EMBED_PATH} STREQUAL "OFF")
        install(DIRECTORY "${CMAKE_BINARY_DIR}/web/" # Trailing slash copies contents
                DESTINATION ${CMAKE_INSTALL_DATADIR}/soundux/web COMPONENT Runtime) # Standard share location even for flatpak is often okay, adjust if needed
    endif()

    # Install Flatpak specific metadata if needed (adjust paths/names)
    # install(FILES ... DESTINATION ${CMAKE_INSTALL_DATADIR}/metainfo COMPONENT Runtime)
    # install(FILES ... DESTINATION ${CMAKE_INSTALL_DATADIR}/applications COMPONENT Runtime)
    # install(FILES ... DESTINATION ${CMAKE_INSTALL_DATADIR}/icons/hicolor/scalable/apps COMPONENT Runtime)

else() # Not Flatpak
    if (${EMBED_PATH} STREQUAL "OFF")
         # Install the processed 'dist' directory from the build folder
        install(DIRECTORY "${CMAKE_BINARY_DIR}/dist/" # Trailing slash copies contents
                DESTINATION ${CMAKE_INSTALL_BINDIR}/dist COMPONENT Runtime) # Install relative to prefix/bin
    endif()

    # Install Desktop/Metadata files (using standard variables)
    if(EXISTS "${CMAKE_SOURCE_DIR}/deployment/soundux.desktop")
        install(FILES "${CMAKE_SOURCE_DIR}/deployment/soundux.desktop"
                DESTINATION ${CMAKE_INSTALL_DATADIR}/applications COMPONENT Runtime)
    endif()
    if(EXISTS "${CMAKE_SOURCE_DIR}/deployment/appstream/io.github.Soundux.metainfo.xml")
        install(FILES "${CMAKE_SOURCE_DIR}/deployment/appstream/io.github.Soundux.metainfo.xml"
                DESTINATION ${CMAKE_INSTALL_DATADIR}/metainfo COMPONENT Runtime)
    endif()
     if(EXISTS "${CMAKE_SOURCE_DIR}/assets/soundux.png")
        install(FILES "${CMAKE_SOURCE_DIR}/assets/soundux.png"
                DESTINATION ${CMAKE_INSTALL_DATADIR}/pixmaps COMPONENT Runtime)
    endif()

    # Install processed web content from build if it exists and not embedded
    if(EXISTS "${CMAKE_BINARY_DIR}/web" AND ${EMBED_PATH} STREQUAL "OFF")
        set(WEB_INSTALL_DESTINATION "${CMAKE_INSTALL_DATADIR}/soundux/web") # Standard location under share
        message(STATUS "Web server content will be installed to: ${WEB_INSTALL_DESTINATION}")
        install(DIRECTORY "${CMAKE_BINARY_DIR}/web/" # Trailing slash copies contents
                DESTINATION ${WEB_INSTALL_DESTINATION} # Install relative to prefix/share
                COMPONENT Runtime
                FILES_MATCHING PATTERN "*" # Ensure all files and subdirs are matched
        )
    endif()

endif() # End if(USE_FLATPAK)

message(STATUS "Configuration done. Build directory: ${CMAKE_BINARY_DIR}")