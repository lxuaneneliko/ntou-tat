# Third-Party Notices

The MIT License in [`LICENSE`](LICENSE) applies only to original NTOU TAT
source code. It does not grant rights to third-party software, content, data,
names, logos, trademarks, or externally hosted services.

## National Taiwan Ocean University materials

The following files contain or reproduce material associated with National
Taiwan Ocean University (NTOU):

- `public/ntou-emblem.png` and app-icon or splash-screen derivatives
- `public/audio/ntou-school-song.m4a` and the lyrics in `src/schoolSong.ts`
- `public/ntou-campus-map-2026.jpg`
- `src/data/graduationCurricula.json`
- `reports/graduation-curricula-audit.json`

These materials, the names "National Taiwan Ocean University", "NTOU", and
"海大", and related marks are excluded from the project's MIT License. Their
inclusion does not imply university endorsement and does not grant trademark
or content-redistribution rights. Any required permission must be obtained
separately from the relevant rights holder.

## Campus map data and services

- `src/data/ntou-map-buildings.json` and `src/data/ntou-map-professors.json`
  contain campus location indexes supplied through `ntoumap.com`. They are
  included with the author's permission, are attributed in the App, and are
  excluded from NTOU TAT's MIT License unless the relevant rights holder states
  otherwise.
- Map rendering uses [MapLibre GL JS](https://maplibre.org/) under BSD-3-Clause.
- Map styles and tiles are provided by [OpenFreeMap](https://openfreemap.org/)
  and OpenMapTiles with data from OpenStreetMap. Their upstream licenses and
  required attribution remain applicable.
- Optional walking routes are calculated by the public
  [FOSSGIS routing service](https://routing.openstreetmap.de/about.html) using
  OpenStreetMap data. Its usage policy, attribution and privacy terms apply.

## OCR components

- Portions under `src/utils/ddddocr_web_temp/` come from
  [`lyc8503/ddddocr_web`](https://github.com/lyc8503/ddddocr_web) and retain
  the MIT License included in that directory.
- `public/common_old.onnx` is derived from
  [`sml2h3/ddddocr`](https://github.com/sml2h3/ddddocr) and remains subject to
  its upstream MIT License.
- ONNX Runtime Web is distributed under the MIT License and carries its own
  [third-party notices](https://github.com/microsoft/onnxruntime/blob/v1.27.0/ThirdPartyNotices.txt).

## Android and Java components

- Eclipse Angus Mail / Jakarta Mail 2.0.0 is used under the EPL-2.0 option.
  Its [license and notice](https://github.com/eclipse-ee4j/angus-mail/tree/2.0.0)
  remain applicable.
- Google ML Kit and Google Play services are governed by Google's applicable
  terms and are not covered by the project's MIT License.

## Other dependencies

The iOS native package uses SwiftMail (BSD-2-Clause), SwiftSoup (MIT), Apple's SwiftNIO
and swift-log (Apache-2.0), and Capacitor (MIT). Their license files and transitive
dependency notices remain applicable. Apple AVFoundation and Vision provide QR
scanning on iOS; Google ML Kit is not included in the iOS target.

SwiftMail 1.11.0 is vendored in `ios/App/Vendor/SwiftMail` with its full original
license bundled as a resource. `UPSTREAM.md` records the source commit and the
Reply-To preservation patch; its BSD license is not replaced by this project's license.

Other dependencies are listed in `package.json`, `package-lock.json`, and the
Android Gradle files. Each remains governed by its own license and notices.
No third-party license or notice is replaced by the project's MIT License.
