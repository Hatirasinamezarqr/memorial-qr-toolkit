# Memorial QR Toolkit

**Face-aware portrait alignment and QR image generation, developed by [Hatırasına](https://hatirasina.com).**

Memorial QR Toolkit is a project derived from the portrait-processing workflow used in the Hatırasına mobile application. It brings together Google ML Kit face detection, portrait centering, and QR image generation for digital remembrance experiences.

[Official website](https://hatirasina.com) · [GitHub organization](https://github.com/Hatirasinamezarqr) · [Issues](https://github.com/Hatirasinamezarqr/memorial-qr-toolkit/issues)

## Project overview

A portrait can be positioned off-center in the original photograph. The Hatırasına workflow uses face detection to locate a face and align the portrait for use in a QR visual. The purpose of this repository is to make the relevant application component reusable without requiring access to the private Hatırasına application or its backend.

Google ML Kit provides the face detection technology. Hatırasına's contribution is the application-level integration, portrait alignment logic, and QR visual composition implemented in the original component.

## Features

- Face-aware portrait positioning using Google ML Kit.
- Automatic portrait centering for QR visual composition.
- Reusable source code extracted from the Hatırasına mobile application.

## How it works

```text
Input portrait
      |
      v
Google ML Kit Face Detection
      |
      v
Face location and portrait alignment
      |
      v
QR image composition
      |
      v
Resulting QR visual
```

ML Kit detects faces and provides location information; it does not identify individuals [1].

## Installation

Clone the repository:

```bash
git clone https://github.com/Hatirasinamezarqr/memorial-qr-toolkit.git
cd memorial-qr-toolkit
```

Install the checked-in source and its exact tested JavaScript dependencies:

Use Node.js 22.13 or newer (validation used 22.23.1). A narrowly scoped development-tool dependency override is documented in [EXTRACTION.md](EXTRACTION.md).

```bash
npm ci --ignore-scripts
npm run typecheck
npm test
```

There is no published npm package. This repository is a source component, not a standalone Expo application. In an existing Expo native app, copy `src/` to a local component directory and `modules/memorialever-face-detection/` to the app's `modules/` directory. Keep the native module's package name unchanged. Add this dependency to the consuming app's `package.json`:

```json
{ "dependencies": { "memorialever-face-detection": "file:modules/memorialever-face-detection" } }
```

Install the actual runtime dependencies (the extraction baseline uses the exact versions listed in `package.json` and the notices):

```bash
npx expo install expo-crypto expo-file-system expo-image-manipulator expo-modules-core @shopify/react-native-skia
npm install qrcode@1.5.4 jsqr@1.4.0
npm install
```

Use a native development build that includes the module. In the consuming app, local compilation is `npx expo run:android` or, on macOS with Xcode, `npx expo run:ios`. Expo Go cannot load this custom module. Configure the iOS deployment target to at least 16.4; CocoaPods resolves the pinned ML Kit dependency. Android SDK levels come from the consuming Expo app and the pinned ML Kit requirements. Native build commands have **not** been run for this extraction.

## Usage example

See [examples/PortraitQr.tsx](examples/PortraitQr.tsx) for loading, fallback and error handling. From that directory:

```ts
import { generateMemorialQr } from '../src/index.native';

const result = await generateMemorialQr({
  canonicalUrl: 'https://example.com',
  detail: {
    id: 'sample',
    portraitUrl: selectedLocalImageUri,
    portraitIdentity: 'selected-image-revision-1',
    photoCandidates: [],
  },
}, (state, diagnostics) => console.log(state, diagnostics?.fallbackReason));
// Display result.qrUri in a React Native Image. result.adaptive=false means plain fallback.
```

`selectedLocalImageUri` must come from your app's image selection flow (a readable `file:` URI after any required permissions). Android also accepts localized `content:` URIs. No picker or permission UI is included. `photoCandidates` optionally supplies up to two gallery alternatives as `{ identity, url }`; portrait takes precedence. Identities must change when bytes change, even when the URI is reused. `detail.id` namespaces cache entries. `debug` writes sensitive local debug images; leave it off for normal use (development mode also writes debug stages). The retained `localPortraitUri` field is legacy diagnostic input and does not override `detail.portraitUrl`.

`generateMemorialQr(input, onState?)` returns `Promise<MemorialQrResult>` with `qrUri`, `adaptive`, `cacheKey`, `sourceIdentity` and optional diagnostics, hole scale and debug URIs. Callers must handle rejection when even a plain QR cannot be rendered or validated. Portable geometry, QR matrix and decoder exports are available from `src/index.ts`.

## Supported platforms

| Platform | Included implementation | Extraction verification |
| --- | --- | --- |
| Android | Kotlin Expo module, ML Kit 16.1.7, native Skia renderer | TypeScript and mocked orchestration; native build/device tests NOT RUN |
| iOS | Swift Expo module, GoogleMLKit/FaceDetection 8.0.0, iOS 16.4+ in podspec | TypeScript and mocked orchestration; native build/device tests NOT RUN |
| Web / Node | Geometry, QR matrix and RGBA decoder utilities only | Local automated tests; no native photo QR generation |

Source baseline: Expo 57.0.34, React Native 0.86.3, React 19.2.3 and Skia 2.6.2, resolved from the application's lockfile. This is not a claim of compatibility with all versions or devices. See [VALIDATION.md](VALIDATION.md) for precise test scope.

For platform-specific face detection integration, refer to Google's Android and iOS documentation [2, 3]. For Expo projects requiring custom native dependencies, see Expo's development build documentation [5].

## Technical implementation

The app's `adaptive-qr` core is extracted into `src/`; the custom Expo wrapper is in `modules/memorialever-face-detection/`. No external ML Kit wrapper package is used. Both native modules request accurate bounding boxes, minimum face size 0.05, and disable landmarks, contours and classification. iOS passes UIImage orientation through to ML Kit; the JavaScript service first normalizes images using Expo ImageManipulator.

The unchanged geometry selects meaningful faces, handles groups of four or more, calculates bounded crops, centers the subject and maps face coordinates to a 1080×1080 Skia canvas. The renderer retains the original colors, blur, subject-fit rules, organic protective holes, alpha calculation and contrast retries. QR matrices use `qrcode` with H error correction and a four-module border. Finder/separator and quiet-zone regions are protected. Each candidate must decode to the exact URL at 25%, 50% and 100%, using the existing jsQR luminance-threshold ladder.

The application-specific owner hook, backend synchronization, share poster compositor, localization, built-in cover assets, billing and reward logic are excluded. [EXTRACTION.md](EXTRACTION.md) documents the small integration changes.

## Privacy and limitations

- Face detection is used for portrait alignment, not identity recognition or verification.
- Google documents ML Kit input processing as on-device [4]. This does not establish the privacy behavior of other parts of an integrating application.
- Use only photographs you have permission to process and share. Do not submit personal photographs or private memorial links in public issues.
- Face detection accuracy may vary with photo quality, pose, lighting, and visibility. A resulting QR image should be independently decoded and tested before physical production; successful digital decoding alone does not guarantee long-term physical readability.

- An undetected face in an explicit portrait keeps that portrait as a background without a face hole. Gallery images without meaningful faces are skipped. The best valid gallery candidate is considered only when the portrait cannot be prepared.
- Failed preparation, missing native module or failed adaptive validation falls back to a plain QR. A failure in the plain renderer still rejects; this is not a universal success guarantee.
- Remote image URIs are downloaded by Expo FileSystem; local file/content URIs are used directly. Sources, normalized images, QR outputs and debug images can persist in device cache. Cache eviction/cleanup is the integrating app's responsibility. Use non-sensitive revision identities and clear app cache when appropriate.
- There is no backend or automatic upload in this extraction. Development diagnostics can reveal source identities, face coordinates and local paths; do not attach logs or generated debug files containing personal data to public issues.
- ML Kit may contact Google for updates and sends performance/utilization metrics; integrating apps must make the required disclosures under [Google's terms](https://developers.google.com/ml-kit/terms).
- Decoder validation is a software check, not a guarantee for every scanner, screen, printed plaque, weather condition or future service lifetime. No physical durability or physical QR quality certification is provided.

## About Hatırasına

[Hatırasına](https://hatirasina.com) is a digital remembrance platform that helps families preserve the stories, photographs, videos, audio recordings, and memories of their loved ones through personalized digital memorial pages and QR memorial plaques.

- [Official website](https://hatirasina.com)
- [QR Memorial Plaques | Mezar QR Kod](https://hatirasina.com/tr/mezar-qr-kod)
- [Digital Memorial Pages | Dijital Anı Sayfası](https://hatirasina.com/tr/dijital-ani-sayfasi)

### Hatırasına hakkında

Hatırasına, sevdiklerinizin yaşam öykülerini, fotoğraflarını, videolarını ve ses kayıtlarını gelecek nesillere aktarmanıza yardımcı olan dijital anı platformudur. QR kodlu anı plakaları ile fiziksel anma alanlarını dijital anı sayfalarına bağlar.

## References and acknowledgments

The face detection functionality relies on Google ML Kit. Google and its contributors retain all rights in their respective technologies. Hatırasına is an independent project and does not claim ownership of Google's SDK or models, or endorsement by Google.

1. Google for Developers. [ML Kit — Face detection](https://developers.google.com/ml-kit/vision/face-detection).
2. Google for Developers. [Detect faces with ML Kit on Android](https://developers.google.com/ml-kit/vision/face-detection/android).
3. Google for Developers. [Detect faces with ML Kit on iOS](https://developers.google.com/ml-kit/vision/face-detection/ios).
4. Google for Developers. [ML Kit — Terms & Privacy](https://developers.google.com/ml-kit/terms).
5. Expo. [Introduction to development builds](https://docs.expo.dev/develop/development-builds/introduction/).
6. React Native. [Official documentation](https://reactnative.dev/).
7. Expo. [Official documentation](https://docs.expo.dev/).

Exact dependency versions, upstream repositories, licenses and preserved notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Citation

If you use this software in research, technical documentation, or another project, you may cite it as follows:

```bibtex
@misc{hatirasina_memorial_qr_toolkit_2026,
  author       = {{Hatırasına}},
  title        = {Memorial QR Toolkit},
  year         = {2026},
  howpublished = {GitHub repository},
  url          = {https://github.com/Hatirasinamezarqr/memorial-qr-toolkit}
}
```

For reproducibility, cite the release tag or commit hash actually used. See [CITATION.cff](CITATION.cff) for the corporate author metadata.

## License

Hatırasına's original code is released under the [MIT License](LICENSE). Third-party dependencies retain their own licenses and terms; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Google SDKs and models are not included and are not licensed by this project's MIT license.

## Official links and contact

### Official social media

- [Facebook](https://www.facebook.com/hatirasinaofficial/)
- [Instagram](https://www.instagram.com/hatirasina)
- [TikTok](https://www.tiktok.com/@hatirasina)
- [X (Twitter)](https://x.com/hatirasina_app)
- [Threads](https://www.threads.com/@hatirasina)

### Contact

- Website: [hatirasina.com](https://hatirasina.com)
- Email: [support@hatirasina.com](mailto:support@hatirasina.com)
- GitHub: [Hatirasinamezarqr](https://github.com/Hatirasinamezarqr)

---

*Remember the past. Preserve the stories. Connect generations.*
