# Ondoki Desktop - Electron Edition

Cross-platform desktop application for screen recording and AI-powered guide generation.

## Features

- **Screen Recording**: Capture entire screens, specific displays, or individual windows
- **AI-Powered Annotations**: Automatically generate descriptions for recorded steps
- **Guide Generation**: Create comprehensive guides from recorded workflows  
- **Chat Integration**: Ask questions about your recordings with context-aware AI
- **Cloud Upload**: Share recordings with team members
- **Cross-Platform**: Works on Windows, macOS, and Linux

## Architecture

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Electron main process with Node.js services
- **IPC**: Type-safe communication between renderer and main processes
- **UI Components**: Modern, accessible components with dark theme support

## Prerequisites

- Node.js 18+ 
- npm or yarn package manager
- Operating system specific dependencies:
  - **Windows**: Windows 10+ (for native screen capture)
  - **macOS**: macOS 10.15+ (screen recording permissions required)
  - **Linux**: X11 or Wayland display server

## Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/myfoxit/ondoki-desktop-electron.git
   cd ondoki-desktop-electron
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the application**:
   ```bash
   npm run build
   ```

## Development

### Running in Development Mode

1. **Start the development server**:
   ```bash
   npm run dev
   ```
   This starts the Webpack dev server for hot reloading of the renderer process.

2. **In a separate terminal, start Electron**:
   ```bash
   npm run dev:electron
   ```

The app will open with hot reloading enabled. Changes to renderer code (React components) will update automatically, while changes to main process code require a restart.

### Development Scripts

- `npm run dev` - Start webpack dev server for renderer
- `npm run dev:electron` - Start Electron in development mode
- `npm run build` - Build both main and renderer processes
- `npm run build:main` - Build only the main process (TypeScript)
- `npm run build:renderer` - Build only the renderer (React + Webpack)
- `npm run start` - Build and start the production app
- `npm run lint` - Run ESLint on the source code
- `npm run lint:fix` - Run ESLint and fix auto-fixable issues
- `npm run clean` - Clean build artifacts

### Type Checking

Run TypeScript type checking without emitting files:
```bash
npx tsc --noEmit
```

This checks both main and renderer process code for type errors.

## Building for Production

### Local Build

Build the application for your current platform:
```bash
npm run build
npm start
```

### Creating Distributables

Use Electron Forge to create platform-specific packages:

```bash
# Create distributables for current platform
npm run make

# The output will be in the `out/` directory
```

### Cross-Platform Building

To build for other platforms, you can use Electron Forge makers:

**Windows** (from any platform):
```bash
npm run make -- --platform=win32
```

**macOS** (requires macOS):
```bash
npm run make -- --platform=darwin
```

**Linux** (from any platform):
```bash
npm run make -- --platform=linux
```

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Development settings
ELECTRON_IS_DEV=true
ONDOKI_API_BASE_URL=https://api.ondoki.com
ONDOKI_CHAT_API_URL=https://api.ondoki.com/chat

# Build settings
ELECTRON_BUILDER_ALLOW_UNSPENT_CACHE=true
```

### Application Settings

Settings are managed through the app's Settings window:

1. **Cloud Integration**: Configure API endpoints and authentication
2. **AI Provider**: Set up OpenAI, Anthropic, Azure, or custom AI services
3. **Recording Preferences**: Auto-annotation and guide generation options

Settings are stored in:
- **Windows**: `%APPDATA%/ondoki-desktop/config.json`
- **macOS**: `~/Library/Application Support/ondoki-desktop/config.json`  
- **Linux**: `~/.config/ondoki-desktop/config.json`

## Project Structure

```
src/
├── main/                 # Electron main process
│   ├── index.ts         # Main entry point
│   ├── preload.ts       # Preload script (IPC bridge)
│   ├── ipc-handlers.ts  # IPC handlers
│   ├── auth.ts          # Authentication service
│   ├── recording.ts     # Screen recording service
│   ├── chat.ts          # Chat/AI service
│   ├── settings.ts      # Settings management
│   ├── cloud-upload.ts  # Cloud upload service
│   ├── screenshot.ts    # Screenshot utilities
│   ├── smart-annotation.ts # AI step annotation
│   └── guide-generation.ts # Guide generation
│
└── renderer/            # React frontend
    ├── components/      # React components
    │   ├── MainWindow.tsx
    │   ├── ChatWindow.tsx  
    │   ├── CaptureSelector.tsx
    │   ├── ExportDialog.tsx
    │   ├── SettingsWindow.tsx
    │   ├── LlmSetupWizard.tsx
    │   └── GuidePreview.tsx
    ├── hooks/           # Custom React hooks
    │   ├── useAuth.ts
    │   ├── useRecording.ts
    │   ├── useChat.ts
    │   └── useElectronAPI.ts
    ├── styles/          # CSS and styling
    │   └── globals.css
    ├── App.tsx          # Main App component
    └── index.tsx        # Renderer entry point
```

## Key Components

### Main Process Services

- **AuthService**: Handles OAuth authentication and user management
- **RecordingService**: Manages screen capture and step recording
- **ChatService**: AI integration for annotations and chat
- **SettingsService**: Persistent configuration management
- **CloudUploadService**: Upload recordings to cloud storage

### React Components

- **MainWindow**: Primary UI for recording controls and project management
- **CaptureSelector**: Display/window selection for recording
- **ChatWindow**: Floating chat interface with AI assistant
- **ExportDialog**: Preview and export recorded workflows
- **SettingsWindow**: Application configuration interface
- **LlmSetupWizard**: Guided AI provider setup
- **GuidePreview**: Live preview of generated guides

### Custom Hooks

- **useAuth**: Authentication state and user management
- **useRecording**: Recording state and controls
- **useChat**: Chat history and AI interactions  
- **useElectronAPI**: Type-safe IPC communication

## Troubleshooting

### Common Issues

**Application won't start**:
- Check Node.js version (18+ required)
- Delete `node_modules` and run `npm install`
- Check for conflicting global packages

**Screen recording not working**:
- **macOS**: Grant screen recording permissions in System Preferences
- **Windows**: Check Windows version (10+ required)
- **Linux**: Ensure X11/Wayland is properly configured

**AI features not working**:
- Verify API keys in Settings
- Check internet connectivity
- Review API provider status and quotas

**Build failures**:
- Clear build cache: `npm run clean`
- Check TypeScript errors: `npx tsc --noEmit`
- Verify all dependencies are installed

### Performance Optimization

- Reduce screenshot quality in Settings for faster recording
- Disable auto-annotation for long recordings
- Clear old recording data periodically

### Debug Mode

Enable additional logging by setting environment variables:
```bash
DEBUG=ondoki:* npm run dev:electron
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and add tests
4. Run type checking: `npx tsc --noEmit`
5. Run linting: `npm run lint:fix`
6. Commit your changes: `git commit -am 'Add feature'`
7. Push to the branch: `git push origin feature-name`
8. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- Email: support@myfoxit.com
- Issues: GitHub Issues
- Documentation: https://docs.ondoki.com

---

Built with ❤️ by MyFoxIT