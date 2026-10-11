# mori. language learning preview

An original, responsive web prototype for a language-learning and translation app. It is an early UI preview: it does not connect to an AI service, backend, or user account.

## Run it on Windows

1. Open this folder in VS Code.
2. Open **Terminal → New Terminal**.
3. Install project packages (first run only):

   ```powershell
   npm.cmd install
   ```

4. Start the local preview:

   ```powershell
   npm.cmd run dev
   ```

5. Open the local address printed in the terminal (usually `http://localhost:5173`).
6. To stop the preview, focus the terminal and press **Ctrl+C**.

Use `npm.cmd` in PowerShell: Windows may block the `npm.ps1` script based on its execution policy. There is no need to weaken that policy.

## What works in this preview

- Responsive home, tutor, translator, vocabulary, progress, and settings screens.
- Language selectors and swapping languages in the translator.
- A small set of clearly labeled sample translations for English to Chinese, Spanish, French, and Japanese.
- Browser-provided speech playback for sample text when the browser has a compatible voice installed.
- Navigation and example lesson interactions.

The sample learning statistics and tutor conversation are illustrative only. Speech recognition, two-way live translation, AI tutor replies, accounts, saved progress, and a backend are **not connected**. The prototype does not record audio. Live translation results must not be inferred from the sample phrases.

## Checks

Run the source linter and production build before sharing changes:

```powershell
npm.cmd run lint
npm.cmd run build
```

The build runs the TypeScript checks before creating the optimized files in `dist`.
