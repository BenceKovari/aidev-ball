# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

Start development server:
```bash
npm install
npm run dev
```

Build for production:
```bash
npm run build
```

Preview production build:
```bash
npm run preview
```

## Project Architecture

This is a React + Vite microphone-controlled bouncing ball game that demonstrates real-time audio processing and physics simulation.

### Core Architecture Patterns

**Audio Processing Pipeline:**
- Uses Web Audio API with `MediaStream` source
- Real-time RMS (Root Mean Square) audio analysis via `AnalyserNode`
- Threshold-based detection with 80ms latch mechanism to prevent missed triggers
- Falls back from Float32Array to Uint8Array for cross-browser compatibility

**Physics System:**
- Simple gravity-based physics (`GRAVITY = 0.05`)
- Impulse-based bouncing with calculated velocity to reach top
- Game state managed through refs to avoid React closure issues

**Ref-Based State Management:**
- Critical game state (position, velocity, threshold) uses `useRef` to avoid stale closures
- UI state uses `useState` for React rendering
- `thresholdRef` pattern ensures slider updates affect detection logic immediately

**Canvas-Based Visual Effects:**
- Separate canvas overlay for particle-based fireworks
- High-DPI display support with `devicePixelRatio` scaling
- Particle system with physics and lifecycle management

### Key Technical Details

- **Threshold Closure Fix:** The main architectural feature - uses refs to ensure real-time threshold updates work with the audio processing loop
- **Audio Context Management:** Proper cleanup of audio streams and contexts on component unmount
- **Game Loop:** RequestAnimationFrame-based game loop with delta time calculations
- **Responsive Design:** Canvas and UI elements adapt to container dimensions