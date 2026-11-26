# Validation

Validated locally on Windows, 2026-11-26, with Node.js 22.23.1. This is source extraction validation, not native device certification.

| Check | Result |
| --- | --- |
| TypeScript strict check, including native entry points and minimal TSX example | PASS (`npm run typecheck`) |
| Automated suite | PASS: 32 tests (`npm test`) |
| Original portable geometry/QR tests | 12 retained cases pass; uses generated rectangles/RGBA pixels, no personal images |
| Actual QR PNG generation and decode | PASS: qrcode produces PNG, existing decoder verifies exact example.com URL and rejects a different URL |
| Matrix RGBA round-trip | PASS at 3, 6, 12 pixels/module; blank input rejected |
| Real service with mocked native boundaries | PASS: single/multiple/off-center/no-face inputs, corrupt-image error, download/detector/renderer failures, plain fallback, gallery scoring/limit, jobs, cache/revision and final failure rejection |
| Original/extracted source comparison | PASS: 5 exact files, all 10 retained service function bodies and 17 retained renderer function bodies unchanged |
| Original/extracted geometry output comparison | PASS: 200 comparisons on the same synthetic fixtures across portrait/landscape/square/small/large sizes, edge positions and face counts 1, 2, 3, 4, 6; details in `tests/source-parity.json` |
| Dependency audit | PASS: `npm audit` reports 0 known vulnerabilities after the documented development-tool override |
| Expo fingerprint path matching after override | PASS: installed helper accepts a TypeScript glob match and rejects a JavaScript non-match |

## Not run

- Android/iOS compilation, installation, real ML Kit face detection or native Skia raster generation: **NOT RUN**. No configured native SDK/device environment was available for this extraction; iOS requires macOS/Xcode.
- Actual portrait photos, real multi-face photos, EXIF orientation variants and corrupt media through platform decoders: **NOT RUN**. Mocked metadata and errors are not EXIF/native tests.
- Byte/pixel parity of rendered native PNGs between original/extracted apps: **NOT RUN**. Function bodies and portable geometry outputs were compared instead.
- Native normalization, file/content URI handling, downloads, disk eviction, offline and permission behavior on devices: **NOT RUN**. Integrating apps must validate these paths.
- Physical QR printing, scanning with camera apps, durability and accessibility of a consuming app: **NOT RUN**.

No cloud build, OTA, Docker, deployment or app-store submission was used. There are no real customer photos, sample memorial identities or private QR URLs in the fixtures. Test URLs use example.com.

## Publication checks

The target's existing MIT license is retained unchanged; the supplied CITATION.cff is retained without invented release metadata. Third-party licenses and copyrights are included separately, and Google's SDKs/models are resolved as dependencies rather than copied. Google's terms and platform integration documentation were reviewed; SDKs are not covered by this project's MIT license.

Gitleaks 8.30.1 and explicit filename/content/URL/email checks were used on the publication files. The staged diff and resulting target-only Git history are scanned before push. The explicit scan includes the lockfile, which generic scanners may skip. These checks cover credential formats, credentialed URLs, environment/signing/media files, private service addresses and machine paths. Only public documentation/package/source URLs and the official support contact are intended. No automatic secret scan is a proof that all possible personal data has been detected; the deliberately selected source inventory was also reviewed.

The original app is kept outside this repository. Its tracked and non-ignored untracked files, Git HEAD, remotes and status are compared with a local pre-extraction snapshot. The snapshot and detailed audit logs stay outside both repositories.
