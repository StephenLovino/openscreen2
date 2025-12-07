# Building AHA Clips

This guide explains how to build installers and packages for Windows (.exe), Linux (.deb), and macOS (.dmg).

## Prerequisites

1. **Node.js** (v18 or higher) and **pnpm** installed
2. **For Windows builds**: Build on Windows or use a Windows VM/CI
3. **For macOS builds**: Build on macOS (required for code signing, optional for unsigned builds)
4. **For Linux builds**: Build on Linux (recommended) or use Docker

## Build Commands

### Build for Current Platform
```bash
pnpm run build
```
This will build for the platform you're currently on.

### Build for Specific Platforms

#### Windows (.exe installer + portable)
```bash
pnpm run build:win
```
Outputs:
- `AHA Clips-Windows-x64-{version}-setup.exe` (NSIS installer)
- `AHA Clips-Windows-x64-{version}.exe` (Portable executable)

#### macOS (.dmg + .zip)
```bash
pnpm run build:mac
```
Outputs:
- `AHA Clips-Mac-x64-{version}.dmg` (for Intel Macs)
- `AHA Clips-Mac-arm64-{version}.dmg` (for Apple Silicon)
- `.zip` files for both architectures

#### Linux (.deb + AppImage)
```bash
pnpm run build:linux
```
Outputs:
- `AHA Clips-Linux-x64-{version}.deb` (Debian/Ubuntu package)
- `AHA Clips-Linux-x64-{version}.AppImage` (Portable AppImage)

### Build All Platforms (Cross-platform)
```bash
pnpm run build:all
```
**Note**: Cross-platform building has limitations:
- macOS builds require macOS
- Windows builds work best on Windows
- Linux builds work on Linux

### Build Specific Formats

#### Windows Portable Only
```bash
pnpm run build:win:portable
```

#### Linux .deb Only
```bash
pnpm run build:linux:deb
```

## Output Location

All built packages are saved to:
```
release/{version}/
```

For example: `release/0.0.0/AHA Clips-Windows-x64-0.0.0-setup.exe`

## Platform-Specific Notes

### Windows
- **NSIS Installer**: Full installer with options to choose installation directory
- **Portable**: Standalone .exe that doesn't require installation
- Both support x64 and ia32 (32-bit) architectures

### macOS
- **DMG**: Disk image installer (standard macOS format)
- **ZIP**: Compressed app bundle
- Supports both Intel (x64) and Apple Silicon (arm64)
- For distribution, consider code signing (requires Apple Developer account)

### Linux
- **DEB**: Debian package for Debian/Ubuntu-based distributions
  - Install with: `sudo dpkg -i AHA-Clips-Linux-x64-{version}.deb`
  - Fix dependencies: `sudo apt-get install -f`
- **AppImage**: Portable format that works on most Linux distributions
  - Make executable: `chmod +x AHA-Clips-Linux-x64-{version}.AppImage`
  - Run: `./AHA-Clips-Linux-x64-{version}.AppImage`

## Troubleshooting

### Build Fails
1. Ensure all dependencies are installed: `pnpm install`
2. Check that TypeScript compiles: `pnpm run lint`
3. Verify icons exist in `icons/icons/` directory

### Missing Icons
Icons should be located at:
- macOS: `icons/icons/mac/icon.icns`
- Windows: `icons/icons/win/icon.ico`
- Linux: `icons/icons/png/512x512.png`

### Cross-Platform Building
For best results, build each platform on its native OS:
- Use GitHub Actions, GitLab CI, or similar for automated builds
- Or use Docker containers for Linux builds
- Use macOS CI runners for macOS builds

## Version Management

Update the version in `package.json` before building:
```json
{
  "version": "1.0.0"
}
```

The version will automatically be included in the output filenames.


