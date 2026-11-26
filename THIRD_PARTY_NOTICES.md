# Third-party notices

The original integration and geometry are Hatırasına code under MIT. The ML Kit wrapper is the project's own small Expo module (`memorialever-face-detection`, internal version 1.0.0), not a third-party face detector package. Google developed ML Kit; no Google SDK binaries or model files are vendored here. Dependencies are obtained through npm, Gradle and CocoaPods. These notices describe the exact extraction baseline resolved from the app lockfile, not suggested newest versions.

| Package | Resolved source version | License | Upstream |
| --- | --- | --- | --- |
| `@shopify/react-native-skia` | 2.6.2 | MIT | https://github.com/Shopify/react-native-skia |
| `qrcode` | 1.5.4 | MIT | https://github.com/soldair/node-qrcode |
| `jsqr` | 1.4.0 | Apache-2.0 | https://github.com/cozmo/jsQR |
| `expo` | 57.0.34 | MIT | https://github.com/expo/expo |
| `expo-modules-core` | 57.0.26 | MIT | https://github.com/expo/expo |
| `expo-crypto` | 57.0.4 | MIT | https://github.com/expo/expo |
| `expo-file-system` | 57.0.7 | MIT | https://github.com/expo/expo |
| `expo-image-manipulator` | 57.0.23 | MIT | https://github.com/expo/expo |
| `react` | 19.2.3 | MIT | https://github.com/facebook/react |
| `react-native` | 0.86.3 | MIT | https://github.com/react/react-native |
| `typescript` | 6.0.3 | Apache-2.0 | https://github.com/microsoft/TypeScript |
| `@types/qrcode` | 1.5.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| `@types/react` | 19.2.18 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| `com.google.mlkit:face-detection` | 16.1.7 | Google ML Kit / Google APIs terms; not this MIT license | https://developers.google.com/ml-kit/vision/face-detection/android |
| `GoogleMLKit/FaceDetection` | 8.0.0 | Google ML Kit / Google APIs terms; not this MIT license | https://developers.google.com/ml-kit/vision/face-detection/ios |

The native SDK implementations are not published as this project's source. Google's official example repository is https://github.com/googlesamples/mlkit; its sample license must not be mistaken for the SDK terms. CocoaPods/Gradle resolve transitive native SDKs normally; inspect their installed notices when distributing an application. React Native Skia also brings native Skia and related third-party notices in its upstream distribution. This repository does not relicense those components.

The app also uses `react-native-qrcode-svg` 6.3.21 (MIT, https://github.com/Expensify/react-native-qrcode-svg) and `react-native-svg` 15.15.4 (MIT, https://github.com/software-mansion/react-native-svg) in other QR views. They are not used by this extracted Skia renderer and are not toolkit dependencies. Expo ImageManipulator performs normalization; no separate face-cropping/image-processing wrapper was found in this pipeline.

## Google terms and privacy

Reviewed on 2026-11-26: [ML Kit Terms & Privacy](https://developers.google.com/ml-kit/terms), incorporating [Google APIs Terms of Service](https://developers.google.com/terms). Models are related software; the terms restrict reverse engineering/extraction. This publication includes only the original integration, using normal SDK dependency mechanisms. MIT applies to the original code, not Google's SDK or models. Input processing is on-device, but ML Kit may contact Google for updates and reports performance/utilization metrics. Integrators are responsible for required user disclosures. Face detection locates faces; it does not identify people. No Google endorsement is implied.

## Preserved upstream license and copyright texts

The following texts were copied from the actual installed package distributions without alteration (no implementation code or binaries was vendored):

- `@shopify/react-native-skia`: [LICENSE.md](third-party-licenses/shopify-react-native-skia/LICENSE.md)
- `qrcode`: [license](third-party-licenses/qrcode/license)
- `jsqr`: [LICENSE](third-party-licenses/jsqr/LICENSE)
- `expo`: [LICENSE](third-party-licenses/expo/LICENSE)
- `expo-modules-core`: [LICENSE](third-party-licenses/expo-modules-core/LICENSE)
- `expo-crypto`: [LICENSE](third-party-licenses/expo-crypto/LICENSE)
- `expo-file-system`: [LICENSE](third-party-licenses/expo-file-system/LICENSE)
- `expo-image-manipulator`: [LICENSE](third-party-licenses/expo-image-manipulator/LICENSE)
- `react`: [LICENSE](third-party-licenses/react/LICENSE)
- `react-native`: [LICENSE](third-party-licenses/react-native/LICENSE)
- `typescript`: [LICENSE.txt](third-party-licenses/typescript/LICENSE.txt)
- `@types/qrcode`: [LICENSE](third-party-licenses/types-qrcode/LICENSE)
- `@types/react`: [LICENSE](third-party-licenses/types-react/LICENSE)

Lockfile dependencies retain their own licenses. Installations include those packages' license files; distributors must preserve applicable notices in their shipped products. TypeScript, type packages and native peer libraries appear here because they are used for checking or integration, even though their implementation source is not copied into this repository.

Standalone security override: `@expo/fingerprint` → `minimatch` 11.0.9 (ISC, https://github.com/isaacs/minimatch) addresses [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). It affects development tooling rather than QR processing. Its installed license/copyright text is preserved under `third-party-licenses/minimatch/`.
