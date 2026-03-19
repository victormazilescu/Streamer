# Streamer

Browser-based overlay app for taking music metadata from Suno, rendering a live visualizer, and preparing a stream-ready scene for Twitch.

## Current goal

Build the smallest useful version first:

- paste a Suno playlist link
- load tracks
- detect or edit title and artist
- show a Winamp-style visualizer
- expose a clean browser scene for OBS
- stream that scene to Twitch through OBS

## What is already in this starter

- React + Vite + TypeScript app structure
- playlist URL input
- demo playlist
- editable title and artist fields
- now playing panel
- retro visualizer with 3 modes:
  - bars
  - wave
  - radial
- scene mode for OBS using `?scene=1`
- Web Audio analyser hookup

## Important limitation right now

The playlist loader is currently a stub.

That means:

- the UI is ready
- the visualizer is ready
- the real Suno playlist parsing is **not implemented yet**

This is intentional.

A browser app often cannot directly fetch and parse third-party pages because of CORS, authentication, and markup changes.

## Planned next step

Implement one of these:

1. small backend playlist parser
2. Chrome extension that reads the logged-in Suno tab
3. manual import fallback

Recommended next step: **small backend playlist parser**.

## Project structure

```text
.
├── index.html
├── package.json
├── README.md
├── tsconfig.json
├── vite.config.ts
└── src
    ├── App.tsx
    ├── main.tsx
    └── styles.css
