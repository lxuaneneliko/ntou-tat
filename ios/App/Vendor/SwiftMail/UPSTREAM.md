# SwiftMail snapshot

Upstream: https://github.com/Cocoanetics/SwiftMail
Version: 1.11.0, commit `a2d4a94f844db62843ef6aec16f3ed9462152acc`.

The library sources are retained under their original BSD-2-Clause license,
including the copyright notice in `Sources/SwiftMail/LICENSE` (bundled as a resource).
This library-only package excludes upstream CLI/demo/test targets and their dependencies.

Local patch: `FetchMessageInfoHandler.applyCollectedThreadingHeaders` no longer discards
`Reply-To` as an envelope field. Upstream MessageInfo has no corresponding
property, so removing it from the exclusion list preserves it in additionalFields.
This allows the iOS compose screen to use the actual reply address rather than
silently defaulting to the sender. Review/reapply this one-line change when updating.
