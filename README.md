# Superformula Live Studio

A dependency-light, mobile-first browser tool for exploring living 3D superformula particle forms. It creates repeatable random variations, seamless loader loops, microphone- and audio-file-reactive motion, and downloadable PNG, GIF, WebM, and JSON parameter files.

## What works

- Deterministic randomization: a seed recreates the same visual.
- Two visual modes: an organic 3D particle body and a seamless loading loop.
- Live speech response through the Web Audio API.
- Local audio-file playback and reactive rendering. Audio remains on the device.
- Device-local named presets and compact shareable URL parameters.
- Silent PNG, GIF, and WebM export with selectable length, color, and format.
- Installable PWA shell and responsive controls for mobile and desktop.

## Run locally

Microphone access and the service worker need a secure context. `localhost` qualifies:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Publish with GitHub Pages

1. Create an empty GitHub repository and upload this folder to its `main` branch.
2. In **Settings → Pages**, choose **GitHub Actions** as the source if GitHub does not select it automatically.
3. The included workflow publishes the site after every push to `main`.

GitHub Pages is publicly reachable for public repositories. Private Pages availability depends on the account plan. The page asks search engines not to index it, but that is not access control.

## Browser notes

- Chromium and Firefox usually provide the most reliable WebM export.
- Safari support for `MediaRecorder` varies by version. PNG and GIF remain available.
- GIF export loads the small [`gifenc`](https://github.com/mattdesl/gifenc) encoder from jsDelivr on demand and caps the longest side at 640 px to reduce mobile memory pressure.
- Exports intentionally contain the visual only; uploaded or microphone audio is never embedded.

## Design and references

The visual direction uses the cyan, violet, magenta, and near-black palette from the supplied references. Two curated starting values mirror parameter readouts visible in those references; other presets were tuned for stable radii and distinct silhouettes. Random ranges were also informed by the open-source experimentation in [`jasonwebb/SuperformulaSVG-for-web`](https://github.com/jasonwebb/SuperformulaSVG-for-web).

The requested reference repository, [`SkyWorksCoder/Superformula`](https://github.com/SkyWorksCoder/Superformula), contained a single `index.html` and no license file when reviewed. This project therefore uses an independent Canvas 2D implementation rather than copying that source.

The superformula was introduced by Johan Gielis. This tool applies a 2D superformula independently across longitude and latitude to form a 3D point field, then adds loop-safe deformation and audio-band modulation.

## Privacy

All rendering, microphone analysis, audio-file playback, presets, and exports happen in the browser. There is no backend, analytics, account, or upload endpoint.

## License

MIT. See [LICENSE](LICENSE).
