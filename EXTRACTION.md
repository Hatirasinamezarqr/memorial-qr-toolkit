# Extraction scope

The source was the existing Hatırasına `src/features/owner/adaptive-qr/` implementation and `modules/memorialever-face-detection/`, not a new algorithm. Only selected source files were copied; no application Git history, app assets or backend code was imported.

- `geometry.ts`, `qr-matrix.ts`, `qr-decoder.ts`, `cache.native.ts`, `face-detector.native.ts`: unchanged source (line endings normalized).
- `renderer.native.ts`: preserved QR rendering/validation functions; removed the app share-poster compositor, its `PosterCopy` type and poster-only pixel crop helper.
- `service.native.ts`: preserved QR preparation, selection, scoring, caching, jobs, fallback and generation. Removed poster functions, poster job map and imports for app localization, cover assets, Expo Asset and poster rendering.
- `types.ts`: replaced the private `OwnerMemorialDetail` import with its minimal structural input (`id`, portrait URI/identity, gallery candidates); removed poster result type. Existing QR result and diagnostics types remain.
- `cache-key.ts`: retained QR version/seed; excluded poster version/seed.
- Native Swift/Kotlin, module registration, entry point, Android manifest and ML Kit version pins: unchanged. Podspec only changes public project metadata, source URL and the owner-authorized MIT license. Internal historical module/class names and wrapper version 1.0.0 remain for compatibility; they are not a toolkit release version.
- Added source exports, minimal example, independent dependency configuration, tests and documentation. There is no published npm release.
- The standalone dependency graph overrides only `@expo/fingerprint`'s `minimatch` to 11.0.9 for GHSA-g3hv-75wg-m249. This is Expo development tooling, outside the QR algorithm. The installed fingerprint path-matching integration was smoke tested and `npm audit` reports no known vulnerabilities at validation time.

Excluded: private application screens, owner React hook, account/state coupling, social preview synchronization, server endpoints, media saving/permissions UI, branded poster templates and app cover images. Native web stubs returning an empty URI were not exported as working web generation.

The user-supplied README and CITATION.cff are the documentation basis. The existing target MIT LICENSE is preserved byte-for-byte. Original portable test cases are retained where they do not require app-private sources; URLs use example.com. Additional mock tests are explicitly orchestration tests, not native execution.
