# Soundux Remote 🎮
A fork of the [Soundux cross-platform soundboard](https://github.com/Soundux/Soundux) with a new remote functionality for controlling your soundboard from any device on your local network.

> **I'm in no way affiliated with the (awesome!) original Soundux project or the team behind it!** This is an unofficial modified version mainly built and tested for Windows! For infos on how to install or use the original desktop app, visit their site https://soundux.rocks


## How to use the Soundux Web Remote! 🚀

This nifty feature lets you control your Soundux soundboard from any device with a web browser on your **local network** – think your phone 📱, tablet 📟, or another computer 💻, without needing to install anything extra on those devices.

Here's a quick overview of the Soundux Remote features. For a more complete set of info and guides, [check out the wiki section](https://github.com/motivated2die/soundux-remote/wiki).

## Project Gallery

| ![Image 1](https://github.com/user-attachments/assets/2b574460-eab9-4c01-b2ab-88d1091aafc8) | ![Image 2](https://github.com/user-attachments/assets/b1daa5f8-0560-483a-b00c-671a5e3076c2) | ![Image 3](https://github.com/user-attachments/assets/02dc2569-6054-4ce9-8fb8-91ab375d45ed) |
| --- | --- | --- |
| ![Image 4](https://github.com/user-attachments/assets/b1c99ca2-d93a-4308-bff9-607ec2644d95) | ![Image 5](https://github.com/user-attachments/assets/b9d4f3bf-fa3f-4bb7-8e78-ffd9771b1d70) | ![Image 6](https://github.com/user-attachments/assets/5b807afa-0b4c-473e-8312-c26287e3aeed) |


### Getting Started 🔌

1.  Make sure Soundux is running on your main computer.
2.  Right-click on the tray menu icon of the Soundux Windows application
3.  You will see the local IP-Address of your PC, followed by `:8080`.
    *   Example address: `http://192.168.1.100:8080`
4.  On your remote device (phone, tablet, etc.), open this address with a web browser.
5.  You should see the Soundux Web Remote interface!

<img src="https://github.com/user-attachments/assets/48b3ec8c-34e0-4708-8732-9a96a78c0711" height="200">

### How to Log Into Your Remote 🔒

**PIN Protection:** To prevent unauthorized access, Soundux uses a **PIN system**. The first time you connect (or after clearing sessions), you'll be asked for a 6-digit PIN.

*   🔒 **Find your PIN:** Right-click the Soundux tray icon on your main computer. The current PIN will be displayed in the menu.
*   Once you enter the correct PIN, your device will be remembered (using a cookie/token) for future sessions, unless you log out or reset sessions from the tray menu.

*The Web Remote is accessible by **any device** on your local Wi-Fi/network by default. Be mindful of where you use Soundux with the web server enabled.*

### The Interface at a Glance ✨

*   **Sounds Grid (Main Area):** Shows all the sounds in your currently selected tab. Tap to play! ▦
*   **Tabs Bar (Bottom):** Your soundboard tabs live here. Tap or swipe to switch between them. 📑 Includes a dedicated ⭐ **Favorites** tab!
*   **Header (Very Bottom):** Shows the Soundux logo, connection status, and the main action buttons like Push-to-Talk and the big red **STOP** button. 🛑
*   **Top Bar:** Contains controls like global Play/Pause, Edit Mode toggle, and App Settings. 🔝

### Core Controls 🎧

*   **Playing Sounds:** Simply tap any sound button in the grid to play it through Soundux. ▶️
*   **Stopping Sounds:** Hit the big red **STOP** button in the bottom header to immediately halt all playing sounds.
*   **Global Play/Pause:** The ▶️ / ⏸️ button in the **top bar** allows you to pause or resume *all* currently active sounds at once, useful for quick interruptions without stopping them completely.
*   **Push-to-Talk (PTT):** Tap and hold the 🎤 button in the bottom header to activate your configured PTT keys in Soundux (if any are set). This also temporarily pauses any playing sounds and unmutes your mic (if Soundux was muting it) for the duration you hold the button. Release to stop PTT and resume sounds/mic state.

### Navigation 🧭

*   **Switching Tabs:** Tap a tab in the bottom bar to switch. You can also **swipe left or right** anywhere in the main sounds grid area to navigate between tabs quickly.

### Customization & Editing 🛠️

Want to personalize your remote layout or sound settings? **Edit Mode** is your friend!

*   **Toggle Edit Mode:** Tap the **pencil icon** ✏️ in the top bar. The bar will turn green, and the icon will change to a checkmark ✅. Tap the checkmark to exit Edit Mode.
*   **Editing Layouts:**
    *   **Reorder Sounds:** While in Edit Mode, simply **tap and drag** sound buttons within the current tab to rearrange them.
    *   **Change View:** Tap the layout button in the top bar (visible only in Edit Mode) to cycle between different grid densities or a list view for the current tab.
*   **Editing Sound Buttons:** Need to tweak a specific sound?
    *   **Access:** In Edit Mode, simply **tap** a sound button. (Outside of Edit Mode, you can usually **long-press** or **right-click** a sound button).
    *   **The Settings Menu:** A panel will slide up from the bottom, allowing you to:
        *   **Favorite ⭐:** Toggle the star to add/remove the sound from your Favorites tab.
        *   **Preview 👂:** Play the sound locally on the remote device (if your browser supports it).
        *   **Volume 🔊:** Adjust the playback volume specifically for this sound relative to the default volume (uses a +/- slider). You can also reset it back to default.
        *   **Color 🎨:** Assign a background color to the button for visual organization.
        *   **Emoji ✨:** Add a background emoji to the button.

### App Settings ⚙️

Tap the **cogwheel icon** in the top bar to open the App Settings modal. Here you can:

*   **Set Preferences:**
    *   Toggle auto-fullscreen on interaction.
    *   Swap the position of the top-bar buttons (left/right alignment).
*   **Manage Layouts & Settings:**
    *   **Reset Visuals:** Long-press to reset colors/emojis for the current tab. 🔄
    *   **Reset Layout:** Long-press to reset the button order for the current tab/view. 🔄
    *   **Reset ALL:** Long-press to wipe *all* remote settings (visuals, layouts, favorites) back to default. 💣
    *   **Import/Export:** Save your current remote layout and customizations to a file 📤, or load a previously saved configuration 📥.

### Handy Tips ✨

*   **Add to Home Screen (PWA):** Most modern mobile browsers will let you "Add to Home Screen". This installs the Web Remote like an app for quick access and a more native feel! 📲
*   **Screen Wake Lock:** The remote tries to keep your device's screen awake while it's open, preventing it from locking during use. You'll see a small eye icon 👁️ in the bottom header indicating if the wake lock is active.

---

That's the Soundux Web Remote in a nutshell! It's designed to be intuitive, so feel free to explore and tap around (especially in Edit Mode!). Enjoy controlling your soundboard with ease! 🎉

## The Soundux Desktop Application

# 👀 Preview
| ![Dark Interface](https://raw.githubusercontent.com/Soundux/screenshots/screenshots/home-dark.png)                   | ![Light Interface](https://raw.githubusercontent.com/Soundux/screenshots/screenshots/home-light.png)                   |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| ![Settings Dark](https://raw.githubusercontent.com/Soundux/screenshots/screenshots/settings-dark.png)                | ![Settings Light](https://raw.githubusercontent.com/Soundux/screenshots/screenshots/settings-light.png)                |
| ![Search Dark](https://raw.githubusercontent.com/Soundux/screenshots/screenshots/search-dark.png)                    | ![Search Light](https://raw.githubusercontent.com/Soundux/screenshots/screenshots/search-light.png)                    |
| ![Application Passthrough](https://raw.githubusercontent.com/Soundux/screenshots/screenshots/pass-through-dark.png)  | ![Application Passthrough](https://raw.githubusercontent.com/Soundux/screenshots/screenshots/pass-through-light.png)   |
| ![Seek/Pause/Stop Dark](https://raw.githubusercontent.com/Soundux/screenshots/screenshots/multiple-playing-dark.png) | ![Seek/Pause/Stop Light](https://raw.githubusercontent.com/Soundux/screenshots/screenshots/multiple-playing-light.png) |
| ![Grid View Dark](https://raw.githubusercontent.com/Soundux/screenshots/screenshots/grid-view-dark.png)              | ![Grid View Light](https://raw.githubusercontent.com/Soundux/screenshots/screenshots/grid-view-light.png)              |

# 👋 Introduction
Soundux is a cross-platform soundboard that features a simple user interface.
With Soundux you can play audio to a specific application on Linux and to your VB-CABLE sink on Windows.

# 🏃 Runtime Dependencies
These are required to run the program

## 🐧 Linux
Please refer to your distro instructions on how to install
- [pulseaudio](https://gitlab.freedesktop.org/pulseaudio/pulseaudio) / [pipewire](https://pipewire.org/) >= 0.3.26
- Xorg
- Libwnck3 (optional, for icon support)
- Webkit2gtk
- libappindicator3
- [youtube-dl](https://youtube-dl.org/) & [ffmpeg](https://www.ffmpeg.org/) (optional, for downloader support)
## <img src="https://www.vectorlogo.zone/logos/microsoft/microsoft-icon.svg" height="20"/> Windows
- [VB-CABLE](https://vb-audio.com/Cable/) (Our installer automatically installs VB-CABLE)
- [Webview2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (Is also shipped with the installer)
- [youtube-dl](https://youtube-dl.org/) & [ffmpeg](https://www.ffmpeg.org/) (optional, for downloader support)

# 📥 Installation

## 🐧 Linux

### <img src="https://www.vectorlogo.zone/logos/archlinux/archlinux-icon.svg" height="20"/> Arch Linux and derivatives
You can install our package with your AUR helper of choice which will automatically compile and install the latest release version
```sh
yay -S soundux
```
We also provide a `soundux-git` package which compiles from the master branch

### <img src="https://www.vectorlogo.zone/logos/ubuntu/ubuntu-icon.svg" height="20"/> Ubuntu and derivatives
You can install Soundux via [pacstall](https://github.com/pacstall/pacstall)
```sh
sudo pacstall -I soundux
```

### <img src="https://www.vectorlogo.zone/logos/getfedora/getfedora-icon.svg" height="20"> Fedora
Soundux can be installed via this [COPR repository](https://copr.fedorainfracloud.org/coprs/rivenirvana/soundux/)
```sh
sudo dnf copr enable rivenirvana/soundux
sudo dnf install soundux
```

### <img src="https://www.vectorlogo.zone/logos/linuxfoundation/linuxfoundation-icon.svg" height="20" /> Distro-agnostic packages
You can grab the latest release from the Snap Store or Flathub

[![Get it from the Snap Store](https://snapcraft.io/static/images/badges/en/snap-store-black.svg)](https://snapcraft.io/soundux)

<a href='https://flathub.org/apps/details/io.github.Soundux'>
  <img width='240' alt='Download on Flathub' src='https://flathub.org/assets/badges/flathub-badge-en.png'/>
</a>

## <img src="https://www.vectorlogo.zone/logos/microsoft/microsoft-icon.svg" height="20"/> Windows
Download our installer or portable from [the latest release](https://github.com/Soundux/Soundux/releases/latest)

# 🪛 Compilation

## 🔗 Build Dependencies

### 🐧 Linux
- Webkit2gtk
- PulseAudio development headers
- PipeWire development headers
- X11 client-side development headers
- libappindicator3 development headers
- OpenSSL development headers
- G++ >= 9
  - Some distros still have G++ versions < 9 in their repos, using them will result in a build failure (for more information refer to [#71](https://github.com/Soundux/Soundux/issues/71)).

#### <img src="https://www.vectorlogo.zone/logos/debian/debian-icon.svg" height="20"/> Debian / <img src="https://www.vectorlogo.zone/logos/ubuntu/ubuntu-icon.svg" height="20"/> Ubuntu and derivatives
```sh
sudo apt install git build-essential cmake libx11-dev libxi-dev libwebkit2gtk-4.0-dev libappindicator3-dev libssl-dev libpulse-dev libpipewire-0.3-dev
```
> If you're on Ubuntu 20.04 or lower you might have to add the PipeWire PPA:
> `sudo add-apt-repository ppa:pipewire-debian/pipewire-upstream`
#### <img src="https://www.vectorlogo.zone/logos/getfedora/getfedora-icon.svg" height="20"> Fedora and derivatives
```sh
sudo dnf install git webkit2gtk3 cmake llvm clang libXi-devel gtk3-devel webkit2gtk3-devel libappindicator-gtk3-devel pulseaudio-libs-devel pipewire-devel
```

### <img src="https://www.vectorlogo.zone/logos/microsoft/microsoft-icon.svg" height="20"/> Windows
- Nuget
- MSVC
- CMake
- OpenSSL

## 👷 Build
Clone the repository
```sh
git clone https://github.com/Soundux/Soundux.git
cd Soundux
git submodule update --init --recursive
```
Create a build folder and start compilation
```sh
mkdir build
cd build
cmake ..
cmake --build . --config Release
```
To start the program
```sh
./soundux # .\soundux.exe on Windows
```

## 🖥️ Install

### 🐧 Linux
```sh
sudo make install
```

# 📝 Why _Soundux_?

The project started as a **Sound**board for Lin**ux**

# 🗒️ License
The code is licensed under [GPLv3](LICENSE)

# ✨ Contributors

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tr>
    <td align="center"><a href="https://github.com/Curve"><img src="https://avatars.githubusercontent.com/u/37805707?v=4?s=50" width="50px;" alt=""/><br /><sub><b>Noah</b></sub></a><br /><a href="https://github.com/Soundux/Soundux/issues?q=author%3ACurve" title="Bug reports">🐛</a> <a href="#business-Curve" title="Business development">💼</a> <a href="https://github.com/Soundux/Soundux/commits?author=Curve" title="Code">💻</a> <a href="#design-Curve" title="Design">🎨</a> <a href="#ideas-Curve" title="Ideas, Planning, & Feedback">🤔</a> <a href="#infra-Curve" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="#maintenance-Curve" title="Maintenance">🚧</a> <a href="#platform-Curve" title="Packaging/porting to new platform">📦</a> <a href="#projectManagement-Curve" title="Project Management">📆</a> <a href="#question-Curve" title="Answering Questions">💬</a> <a href="https://github.com/Soundux/Soundux/pulls?q=is%3Apr+reviewed-by%3ACurve" title="Reviewed Pull Requests">👀</a> <a href="https://github.com/Soundux/Soundux/commits?author=Curve" title="Tests">⚠️</a></td>
    <td align="center"><a href="https://github.com/D3SOX"><img src="https://avatars.githubusercontent.com/u/24937357?v=4?s=50" width="50px;" alt=""/><br /><sub><b>Nico</b></sub></a><br /><a href="https://github.com/Soundux/Soundux/issues?q=author%3AD3SOX" title="Bug reports">🐛</a> <a href="#business-D3SOX" title="Business development">💼</a> <a href="https://github.com/Soundux/Soundux/commits?author=D3SOX" title="Code">💻</a> <a href="#design-D3SOX" title="Design">🎨</a> <a href="#ideas-D3SOX" title="Ideas, Planning, & Feedback">🤔</a> <a href="#infra-D3SOX" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="#maintenance-D3SOX" title="Maintenance">🚧</a> <a href="#platform-D3SOX" title="Packaging/porting to new platform">📦</a> <a href="#projectManagement-D3SOX" title="Project Management">📆</a> <a href="#question-D3SOX" title="Answering Questions">💬</a> <a href="https://github.com/Soundux/Soundux/pulls?q=is%3Apr+reviewed-by%3AD3SOX" title="Reviewed Pull Requests">👀</a> <a href="https://github.com/Soundux/Soundux/commits?author=D3SOX" title="Tests">⚠️</a> <a href="#translation-D3SOX" title="Translation">🌍</a> <a href="#a11y-D3SOX" title="Accessibility">️️️️♿️</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/MrKingMichael"><img src="https://avatars.githubusercontent.com/u/30067605?v=4?s=50" width="50px;" alt=""/><br /><sub><b>Michael</b></sub></a><br /><a href="https://github.com/Soundux/Soundux/issues?q=author%3AMrKingMichael" title="Bug reports">🐛</a> <a href="#ideas-MrKingMichael" title="Ideas, Planning, & Feedback">🤔</a> <a href="#translation-MrKingMichael" title="Translation">🌍</a> <a href="https://github.com/Soundux/Soundux/commits?author=MrKingMichael" title="Tests">⚠️</a></td>
    <td align="center"><a href="https://github.com/BrandonKMLee"><img src="https://avatars.githubusercontent.com/u/58927531?v=4?s=50" width="50px;" alt=""/><br /><sub><b>BrandonKMLee</b></sub></a><br /><a href="#ideas-BrandonKMLee" title="Ideas, Planning, & Feedback">🤔</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/Toadfield"><img src="https://avatars.githubusercontent.com/u/68649672?v=4?s=50" width="50px;" alt=""/><br /><sub><b>Toadfield</b></sub></a><br /><a href="#ideas-Toadfield" title="Ideas, Planning, & Feedback">🤔</a> <a href="https://github.com/Soundux/Soundux/issues?q=author%3AToadfield" title="Bug reports">🐛</a></td>
    <td align="center"><a href="https://github.com/fubka"><img src="https://avatars.githubusercontent.com/u/44064746?v=4?s=50" width="50px;" alt=""/><br /><sub><b>fubka</b></sub></a><br /><a href="https://github.com/Soundux/Soundux/issues?q=author%3Afubka" title="Bug reports">🐛</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/TheOriginalTripleD"><img src="https://avatars.githubusercontent.com/u/6907054?v=4?s=50" width="50px;" alt=""/><br /><sub><b>TheOriginalTripleD</b></sub></a><br /><a href="#research-TheOriginalTripleD" title="Research">🔬</a></td>
    <td align="center"><a href="https://github.com/UltraBlackLinux"><img src="https://avatars.githubusercontent.com/u/62404294?v=4?s=50" width="50px;" alt=""/><br /><sub><b>UltraBlackLinux</b></sub></a><br /><a href="https://github.com/Soundux/Soundux/issues?q=author%3AUltraBlackLinux" title="Bug reports">🐛</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://bendem.be/"><img src="https://avatars.githubusercontent.com/u/2681677?v=4?s=50" width="50px;" alt=""/><br /><sub><b>bendem</b></sub></a><br /><a href="https://github.com/Soundux/Soundux/issues?q=author%3Abendem" title="Bug reports">🐛</a></td>
    <td align="center"><a href="https://edgar.bzh/"><img src="https://avatars.githubusercontent.com/u/46636609?v=4?s=50" width="50px;" alt=""/><br /><sub><b>Edgar Onghena</b></sub></a><br /><a href="https://github.com/Soundux/Soundux/issues?q=author%3Aedgarogh" title="Bug reports">🐛</a> <a href="#research-edgarogh" title="Research">🔬</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/moggesmith10"><img src="https://avatars.githubusercontent.com/u/33375517?v=4?s=50" width="50px;" alt=""/><br /><sub><b>moggesmith10</b></sub></a><br /><a href="#ideas-moggesmith10" title="Ideas, Planning, & Feedback">🤔</a></td>
    <td align="center"><a href="https://belmoussaoui.com/"><img src="https://avatars.githubusercontent.com/u/7660997?v=4?s=50" width="50px;" alt=""/><br /><sub><b>Bilal Elmoussaoui</b></sub></a><br /><a href="#platform-bilelmoussaoui" title="Packaging/porting to new platform">📦</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/thomasfinstad"><img src="https://avatars.githubusercontent.com/u/5358752?v=4?s=50" width="50px;" alt=""/><br /><sub><b>Thomas Finstad Larsen</b></sub></a><br /><a href="#ideas-thomasfinstad" title="Ideas, Planning, & Feedback">🤔</a></td>
    <td align="center"><a href="http://arthurmelton.me"><img src="https://avatars.githubusercontent.com/u/29708070?v=4?s=50" width="50px;" alt=""/><br /><sub><b>Arthur Melton</b></sub></a><br /><a href="#ideas-AMTitan" title="Ideas, Planning, & Feedback">🤔</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/serkan-maker"><img src="https://avatars.githubusercontent.com/u/63740626?v=4?s=50" width="50px;" alt=""/><br /><sub><b>Serkan ÖNDER</b></sub></a><br /><a href="#translation-serkan-maker" title="Translation">🌍</a></td>
    <td align="center"><a href="https://github.com/pizzadude"><img src="https://avatars.githubusercontent.com/u/1454420?v=4?s=50" width="50px;" alt=""/><br /><sub><b>PizzaDude</b></sub></a><br /><a href="https://github.com/Soundux/Soundux/issues?q=author%3Apizzadude" title="Bug reports">🐛</a> <a href="#research-pizzadude" title="Research">🔬</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/Kylianalex"><img src="https://avatars.githubusercontent.com/u/66625058?v=4?s=50" width="50px;" alt=""/><br /><sub><b>Kylianalex</b></sub></a><br /><a href="https://github.com/Soundux/Soundux/issues?q=author%3AKylianalex" title="Bug reports">🐛</a></td>
    <td align="center"><a href="http://gregerstoltnilsen.net/"><img src="https://avatars.githubusercontent.com/u/1364443?v=4?s=50" width="50px;" alt=""/><br /><sub><b>Greger</b></sub></a><br /><a href="https://github.com/Soundux/Soundux/issues?q=author%3Agregersn" title="Bug reports">🐛</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/rivenirvana"><img src="https://avatars.githubusercontent.com/u/43519644?v=4?s=50" width="50px;" alt=""/><br /><sub><b>Arvin Verain</b></sub></a><br /><a href="#platform-rivenirvana" title="Packaging/porting to new platform">📦</a></td>
    <td align="center"><a href="http://einfacheinalex.eu/"><img src="https://avatars.githubusercontent.com/u/20642291?v=4?s=50" width="50px;" alt=""/><br /><sub><b>EinfachEinAlex</b></sub></a><br /><a href="https://github.com/Soundux/Soundux/commits?author=EinfachEinAlex" title="Code">💻</a> <a href="#research-EinfachEinAlex" title="Research">🔬</a> <a href="https://github.com/Soundux/Soundux/commits?author=EinfachEinAlex" title="Tests">⚠️</a></td>
  </tr>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!
