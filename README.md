# DartForm

Web app for analyzing dart throw mechanics across three darts. Open in a phone browser, grant camera access, and get pose-derived feedback after each round.

## Stack

- Vite + React + TypeScript
- Browser camera (`getUserMedia`)
- MediaPipe Pose Landmarker (WASM via `@mediapipe/tasks-vision`)

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:5173` on your machine. Camera access works on `localhost` without HTTPS.

To test from a phone on the same Wi‑Fi:

```bash
npm run dev
```

Then open `http://YOUR_SERVER_IP:5173` on the phone. **HTTPS is required** for camera on non-localhost URLs — use the production deploy steps below for real phone testing.

## Production build

```bash
npm run build
```

Static files are output to `dist/`.

## Host on Linux (HTTPS required for camera)

Browsers only allow camera access on secure contexts (`https://` or `localhost`).

### Option A: Caddy (automatic HTTPS)

```bash
# Install Caddy, then:
sudo caddy file-server --root dist --listen :443 --domain your-domain.com
```

Or use a `Caddyfile`:

```
your-domain.com {
    root * /path/to/steady-dart/dist
    file_server
}
```

### Option B: nginx + Let's Encrypt

Serve `dist/` with nginx and certbot for TLS.

### Option C: LAN testing with a self-signed cert

Use `vite preview` with HTTPS or a reverse proxy with mkcert for local network testing.

## Usage

1. Open the site on your phone (over HTTPS).
2. Choose throwing hand (right/left).
3. Tap **Throw 3 darts**.
4. Point the camera so your throwing arm is visible in profile.
5. Throw three darts — each throw is auto-detected.
6. Review metrics on the results screen.

## Project layout

- `src/pages/` — Home, Capture, Results screens
- `src/hooks/usePoseCamera.ts` — camera + MediaPipe + throw detection
- `src/analysis/` — throw detection and round metrics (platform-agnostic)
