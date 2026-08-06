# Codex Desktop ASAR Reference Map

This document maps WebUI surfaces to the unpacked Codex Desktop bundle. It is a
versioned implementation reference, not a claim that hashed asset names remain
stable across releases.

## Reference build

- Application: `/Applications/ChatGPT.app`
- Bundle ID: `com.openai.codex`
- Product version: `26.730.61639`
- Bundle build: `6234`
- Unpacked root: `.codex-desktop-reference/26.730.61639/app`
- Main renderer bundle: `webview/assets/app-initial-CKNQDTeE.js`

The unpacked directory is intentionally ignored by Git. Recreate it after an
application update or when the local reference directory is missing:

```bash
mkdir -p .codex-desktop-reference/26.730.61639
bunx --bun @electron/asar extract \
  /Applications/ChatGPT.app/Contents/Resources/app.asar \
  .codex-desktop-reference/26.730.61639/app
```

Before using this map after an update, read `CFBundleShortVersionString` and
replace the versioned directory. Asset hashes must be rediscovered for each
build.

## Evidence rules

1. Use the exported wrapper chunk when one exists. It is the most reliable way
   to identify a component after minification.
2. Use message IDs, data attributes, route strings, and exported component names
   as search anchors. Minified local function names can change every build.
3. Treat source evidence as authoritative for behavior and hierarchy. Visual
   measurements still require a side-by-side screenshot or live App inspection.
4. Record unknowns explicitly instead of inferring native behavior from the
   current WebUI.

## Current parity plan

| Order | Small problem | Native confirmation | WebUI work | Status |
| --- | --- | --- | --- | --- |
| 1 | Permission menu duplicates `custom` and omits `Approve for me` | Confirm fixed modes, managed profiles, visibility gates, descriptions, icons, and selected check | Normalize and deduplicate profiles; derive visibility from account/capabilities; add real-payload regression tests | Evidence complete |
| 2 | Composer shows only `Low`; model name is absent | Confirm trigger composition and compact/collapsed behavior | Keep model and effort as separate visible labels; repair empty display-name fallback and responsive hiding | Evidence complete |
| 3 | Context usage donut is missing | Confirm setting gate, data source, percentage calculation, tooltip, and footer position | Render from real token usage; hide only when native prerequisites fail | Evidence complete |
| 4 | Main left sidebar and profile footer differ | Confirm new-chat/project hierarchy, footer height, identity rules, API/Copilot fallbacks, and menu contents | Rebuild structure and account variants without fabricated identity data | Implemented; browser screenshot verified |
| 5 | Settings entry and opening position differ | Confirm entry route, return behavior, sidebar grouping, search, and responsive navigation | Replace modal assumptions with route-like full app content and native navigation position | Implemented; direct route and responsive layout verified |
| 6 | Regression pass | Compare desktop and mobile screenshots plus real RPC payloads | Add focused browser tests, run unit/check/build, commit and push each item separately | Pending |

## Element map

### Permission mode dropdown

| Field | Location or evidence |
| --- | --- |
| Exported component | `webview/assets/permissions-mode-dropdown-o_HIuu9s.js` exports `PermissionsModeDropdown` from `app-initial-CKNQDTeE.js` |
| Stable anchors | `composer.permissionsDropdown.guardianApproval.optionLabel`, `composer.permissionsDropdown.fullAccess.optionLabel`, `composer.permissionsDropdown.custom.optionLabel` |
| Native fixed options | `Ask for approval`, conditional `Approve for me`, conditional `Full access`, and one conditional `Custom (config.toml)` |
| Native managed profiles | The bundle maps the profile array once between fixed Full access and Custom. A profile uses its ID as the label and its description as subtext. |
| Native selected state | `RightIcon` is the check icon only for the active fixed mode or active profile. |
| Native custom behavior | `Custom (config.toml)` is a separate fixed option with `Uses permissions defined in config.toml`; it is not another managed profile. |
| Current WebUI | `public/index.html` `#permissionPicker`; `public/app.js` `permissionModes`, `setPermissionProfiles`, `renderPermissionMenu`; related CSS in `public/style.css` |
| Confirmed defect | `renderPermissionMenu` appends every server profile and then appends `custom`, while `setPermissionProfiles` does not reject reserved IDs or deduplicate IDs. Real payloads can therefore produce repeated Custom rows. |
| Test target | Feed duplicate/reserved profile IDs, ChatGPT and API account modes, unavailable auto-review, managed-disabled profiles, and a selected profile. |

### Model and reasoning selector

| Field | Location or evidence |
| --- | --- |
| Main implementation | `webview/assets/app-initial-CKNQDTeE.js`, function containing `data-codex-intelligence-trigger` and `data-composer-navigation-target="reasoning"` |
| Stable anchors | `composer.intelligenceDropdown.tooltip`, `composer.intelligenceDropdown.model.rowLabel`, `composer.intelligenceDropdown.effort.rowLabel`, `composer.modelSettings.errorGeneric` |
| Native trigger | The trigger renders a model label and an effort label in separate spans, followed by the selector chevron. It uses `stripGptPrefix: true`, which removes only the `GPT-` prefix, not the entire model label. |
| Native menu | The advanced view has distinct Model and Effort rows. Supported efforts come from the selected model; labels include Low, Medium, High, Extra High, Max, and Ultra when enabled. |
| Current WebUI | `public/index.html` `#modelPicker`, `#modelLabel`, `#effortLabel`; `public/app.js` `modelDisplay`, `syncModelLabel`, `renderModelMenuMain`, `renderModelSubmenu`; model CSS in `public/style.css` |
| Confirmed risk | `modelDisplay(model, true)` can become empty for malformed or prefix-only display names, and responsive rules may hide the first span. The repair must retain a model-ID fallback before applying compact labels. |
| Test target | Models with display name, missing display name, `GPT-` prefix, API account filtering, one effort, and multiple efforts; desktop and narrow composer widths. |

### Context usage donut

| Field | Location or evidence |
| --- | --- |
| Main implementation | `webview/assets/app-initial-CKNQDTeE.js`, `hJs` context indicator, `yJs` usage calculation, and `mXs` composer footer layout |
| Stable anchors | `composer.contextUsageIndicator.ariaLabel`, `composer.contextWindowUsageLabel`, `composer.contextWindowUsageStatusLeft`, `composer.contextWindowUsageTooltip`, `show-context-window-usage` |
| Native data | `modelContextWindow` and the latest `totalTokens`; percentage is `min(totalTokens, contextWindow) / contextWindow * 100`. |
| Native visibility | Hidden unless the `showContextWindowUsage` setting is enabled, token data is valid, and the local footer has enough space. It is not shown in cloud composer mode. |
| Native presentation | An `icon-xs` donut appears before the intelligence selector. Tooltip shows percent used/left and `{usedTokens}k / {contextWindow}k tokens used`. |
| Current WebUI | Token usage is already received in `public/app.js`; `.context-ring` CSS exists in `public/style.css`, but there is no corresponding composer DOM element in `public/index.html`. |
| Test target | No thread, no usage, valid usage, 50% threshold, over-limit clamping, setting off/on, and narrow footer layout. |

### Main sidebar and profile footer

| Field | Location or evidence |
| --- | --- |
| Main implementation | `webview/assets/app-initial-CKNQDTeE.js`, sidebar components around anchors `sidebarElectron.newThread`, `sidebarElectron.projectsNavLink`, `codex.profileFooter.*`, and `codex.profileDropdown.*` |
| Stable anchors | `sidebarElectron.workNewChatNavLink`, `codex.profileFooter.settingsFallback`, `codex.profileFooter.openProfileMenu`, `codex.profileFooter.openSettings`, `codex.profileDropdown.settingsPage`, `codex.profileDropdown.logOut` |
| Native footer | A toolbar-height footer with a subtle top divider. The trigger is one compact row: `icon-sm` avatar/icon plus a single truncated display label. It does not always show a second metadata line or a trailing chevron. |
| ChatGPT identity | Prefer profile display name/email and profile image; personal and workspace accounts have different fallbacks. |
| API and provider identity | API key, personal access token, Copilot, Bedrock, and custom model-provider modes use provider/settings fallbacks and provider-specific menu rows. The bundle explicitly includes `Logged in with API key`, `Logged in with Copilot`, and `Logged in with Amazon Bedrock`. |
| Settings behavior | When no authenticated profile menu is available, the footer button directly opens settings. Otherwise Settings is an item inside the profile dropdown. |
| Current WebUI | `public/index.html` `.sidebar`, `.sidebar-footer`, `#accountButton`, `#accountMenu`; `public/app.js` `renderAccount`, `toggleAccountMenu`; sidebar/profile CSS in `public/style.css` |
| Test target | ChatGPT personal/workspace, API key, Copilot/custom provider, missing avatar, failed avatar, unauthenticated/loading, sidebar collapsed, and mobile drawer. |

### Settings entry and settings page

| Field | Location or evidence |
| --- | --- |
| Exported component | `webview/assets/settings-page-HTSlOIF2.js` exports `SettingsPage` |
| Supporting chunks | `use-visible-settings-sections-ClZrtl0x.js`, `settings-route-state-h9bB_WA1.js`, `settings-host-dropdown-Bc872qtp.js`, and section-specific `*-settings-*.js` chunks |
| Layout implementation | `eDu` in `app-initial-CKNQDTeE.js` renders `zoom-adjusted-viewport`, a fixed-width left panel with an `h-toolbar` spacer, and the settings content region. |
| Navigation implementation | `Zt` in `settings-page-HTSlOIF2.js` renders Back to app, grouped icon rows, active state, host filtering, search, and the settings navigation label. `dn` renders the search field. |
| Route implementation | `Cn` selects `/settings/:section/*`, replaces the route when a section changes, and passes the return action to the navigation. `En` returns through history, a remembered location, or `/`. |
| Stable anchors | `settings.nav.back`, `settings.nav.ariaLabel`, `settings.search.label`, `settings.search.placeholder`, `/settings/${section}` |
| Native placement | Settings is a routed page (`/settings/:section`), rendered with a settings sidebar and content layout. Closing/back returns to the prior app route or `/`; it is not modeled as a centered modal card. |
| Native navigation | Sidebar supports Back to app, collapse/expand, grouped sections, icons, search, active state, host filtering, and responsive navigation. |
| Native section groups | Personal, Integrations, Coding, and Archived. Visibility is capability-driven and section chunks are loaded lazily. |
| Current WebUI | `public/index.html` `#settingsDialog`, `.settings-nav`, `#settingsContent`; `public/app.js` `settingsPages`, `setSettingsPage`, `openSettings`; settings CSS in `public/style.css` |
| Confirmed defect | The WebUI opens a top-level `<dialog>` and uses a hand-maintained partial section list. This cannot match native route history, entry placement, or capability-driven navigation without changing the page model. |
| Test target | Open from profile menu and direct footer fallback, preserve return route, direct section URL, search, back, collapsed nav, desktop/mobile layout, and unavailable sections. |

## Native settings section order

The 26.730.61639 bundle groups the visible settings sections in this order. The
actual list is filtered by account, platform, flags, host, and capability data.

- Personal: General, Import, Profile, Appearance, Voice, Configuration,
  Personalization, Pets, Keyboard shortcuts, Usage & billing, Debug
- Integrations: Computer history, Appshots, Codex Micro, MCP servers, Plugins,
  Skills, Browser, Computer use
- Coding: Hooks, Connections, Cloud preferences, Cloud environments, Code
  review, Git, Environments, Cloud Environments, Worktrees
- Archived: Archived chats

## Update checklist

When Codex Desktop updates:

1. Record the new product and bundle versions.
2. Extract the new ASAR into a new versioned directory.
3. Find `app-initial-*.js` and the exported wrapper chunks again.
4. Search each stable anchor in this document.
5. Update changed behavior and asset names before changing WebUI code.
6. Keep the previous version directory until the parity work for the new build is
   complete.
