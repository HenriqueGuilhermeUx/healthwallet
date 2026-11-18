# HealthWallet — iOS preparation

Existing Capacitor app: `br.com.healthwallet.app`; Capacitor major: 7; production web build: `pnpm build:prod` → `dist`.

## Mac build workflow (not executed)
1. Install Node, pnpm 9.15.9, Xcode and CocoaPods where required.
2. `pnpm install --frozen-lockfile`
3. `pnpm add @capacitor/ios@7.4.3` (review and commit package + lockfile separately).
4. `pnpm build:prod`
5. `pnpm exec cap add ios` if absent; otherwise `pnpm exec cap sync ios`.
6. `pnpm exec cap open ios`; configure Apple team and signing; test on a real iPhone.

## Sensitive checks before release
- Review `@capgo/capacitor-health` platform support and HealthKit entitlements, all permission explanations and actual health-data usage.
- Validate background/foreground behavior, login, account deletion, privacy policy and explicit consent.
- Test documents, uploads, user-controlled medical data, location consent and transport security.
- Ensure no medical-data permissions are claimed without actual functionality.
- Ensure correct legal publisher for health sector before App Store submission; PJ migration remains unresolved.
- Do not upload secrets or change Android production pipeline.

## Automated local preparation

After installing the matching `@capacitor/ios` package and checking its lockfile, run `node scripts/prepare-ios.mjs` from the repository root on macOS with Xcode installed. The script refuses non-macOS execution and missing iOS dependencies; it builds the correct web assets then creates/synchronizes the local Capacitor iOS project. It does **not** sign, archive, run device tests or submit anything to Apple.
