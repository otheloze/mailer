# MYMAILMARKET Desktop (Windows)

An Electron app that runs the hosted emailer at https://mymailmarket.com in its own window. It holds no secrets. Sending, credits, trials and payments all stay on the server.

## Develop
```powershell
cd desktop
npm install          # also downloads the Electron binary (postinstall)
npm start            # opens the app against mymailmarket.com
```
Settings such as the site URL, allowed hosts and payment hosts are in `config.js`. `npm run icon` regenerates `build/icon.png`.

## Build an installer locally
```powershell
npm run dist         # -> dist/MYMAILMARKET-Setup.exe
```

## Publish a release (auto-update + website download)
1. One-time setup:
   - Create the **public** repo `otheloze/mymailmarket-desktop`.
   - Create a fine-grained token with *Contents: write* on that repo.
   - Save the token in the `mailer` repo as the Actions secret `DESKTOP_RELEASE_TOKEN`.
2. Tag and push:
   ```powershell
   git tag desktop-v1.0.0; git push origin desktop-v1.0.0
   ```
   The `Desktop release` workflow builds the installer and publishes `MYMAILMARKET-Setup.exe` and `latest.yml`.
   - The website's `/download` button always points at the latest release.
   - Installed apps update themselves.

The installer is unsigned, so Windows SmartScreen warns on first run. To sign it, add `CSC_LINK` and `CSC_KEY_PASSWORD` secrets to the workflow env.
