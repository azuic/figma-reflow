# Verification record

Verified on 2026-10-18 in this task workspace. Version 0.1.1 has passed the native Figma startup and basic reflow checks below. Continuous updates while holding a pointer drag are not yet claimed.

## Passed

- `npm run typecheck`: TypeScript 7.0.2 against official Figma plugin typings 1.142.0.
- `npm run build`: bundled native sandbox script, panel and actual Pretext 1.0.0 worker; full third-party license retained.
- `npm test`: **22 / 22** tests. See `tests/build.test.mjs`, `tests/layout.test.mjs` and `tests/lifecycle.test.mjs`.
- Distribution files resolve from `manifest.json`; extracted panel JavaScript and sandbox JavaScript parse. The build test prevents replacement-string expansion from corrupting embedded library source.
- Layout tests use actual bundled Pretext with deterministic host font widths: both sides of obstacles, movement, resizing, cache reuse, overlapping and fully blocked rows, overflow, paragraphs/blank lines, Unicode and combining sequences, long words, rotated coordinates, singular transforms and too-narrow slots.
- Lifecycle tests use an explicit **mock Figma API**, not Figma desktop. They cover stale revisions, source characters, original shape preservation, stop/resume, geometry signatures, output feedback prevention, useful validation errors, close-time probe removal, cleanup preserving foreign children, and recovery after manual output deletion.
- **Actual Chrome browser integration**: loaded built `dist/ui.html`, created the bundled worker, ran the native-measurement message protocol against a **mock host**, and moved/resized the fixture obstacle. Result:

```json
{
  "layouts": 2,
  "measurementBatches": 5,
  "nativeStrings": 64,
  "workerUsed": true,
  "geometryChangedLayout": true
}
```

The final browser fixture used `sandbox="allow-scripts"` without same-origin permission, `connect-src 'none'`, and explicit local blob/data worker permissions. The visible result was: **PASS: panel, worker, mock Figma measurement bridge, movement and resize layout**. The `nativeStrings` field counts strings requested from the mock host; it does not mean they were measured in Figma.

## Native Figma checks passed after the loading fix

The previously uncertain manifest import succeeded. The user reported the panel stuck at Loading; native inspection showed a demo and measurement node existed, but the UI ignored the sandbox’s responses. The cause was an `event.source === parent` requirement that did not match Figma’s host-message delivery. Version 0.1.1 accepts the expected plugin-message envelope and adds a `ui-ready` handshake, so the initial status can be replayed after the iframe installs its handlers. A regression test covers relayed messages with null/non-parent senders and verifies the readiness request.

Native checks in the separate test Design file (private test fixture; not distributed):

- Closed/restarted the development plugin from the rebuilt disk files: the panel displayed its ready instructions instead of Loading.
- Created a fresh safe demo: the panel displayed the complete source and **2 obstacles**, and enabled Start.
- Started live reflow: actual Figma font measurements and the bundled worker produced native editable output. The panel reported **34 fragments / 281 font measurements**, with overflow correctly disclosed.
- Selected the demo ellipse and nudged its X coordinate from 240 to **241** with the Right arrow. Generated native text content and fragment counts changed automatically.
- Changed the native ellipse Width from 200 to **260** through Figma’s properties. The panel reported a new layout with **35 fragments / 299 font measurements**; the layer contents changed to fit the new geometry.
- The blob worker successfully ran under the plugin manifest’s `networkAccess: none` in native Figma.

The previous user-created demo remains intact. A second safe demo was created for the acceptance check. No unrelated user document content was edited. Nothing was published or externally deployed.

Still unverified natively: updates before pointer release during continuous dragging, direct handle resizing/rotation timing, cleanup/reopen acceptance, non-default and missing-font cases, and source regions inside auto layout. Automated tests cover the underlying lifecycle/geometry cases but are not substitutes for those native UI checks.

## Smallest next step

The fixed plugin is already running in the test file. To test the remaining native cases:

1. If reopening later, run **Dynamic Reflow · Pretext** from Plugins → Development.
2. Load a previous output with Use selection, or click **Create demo → Start live reflow**.
3. Drag the orange ellipse slowly while holding the pointer, then resize/rotate the blue rectangle. Observe whether text and the rendered-layout counter update **before release**. Record page-event and input-change counter deltas. If reflow only occurs after release, report that limitation rather than claiming continuous dragging.
4. Resize/move the source box and verify output follows it. Stop and verify dragging no longer updates output; Start should regenerate.
5. Test source editing, overflow, padding, output cleanup and source opacity restoration. Verify generated fragments are editable after Stop.
6. Close/reopen, select the previous output, click Use selection, resume. Test a non-default installed font and then a missing font. Check a source in auto layout and a rotated source.

If native validation finds an issue, rebuild after fixing it and rerun the affected native cases. Keep the source and bundled output together when handing off.

## 0.2.0 compact panel acceptance

- Added automatic selection preview and a single Start/Stop action. Regression tests verify empty and partial selection, complete pair binding, and pinned inputs while moving one shape.
- The built panel accepts Figma-relayed messages and still uses the startup handshake. The UI test now also verifies pill labels, the multi-shape name/count, tooltips, and Start/Stop message routing.
- Native Figma checks: with no selection, Text and Shape were inactive and Start was disabled; selecting only the text activated its named pill while leaving Shape inactive; Shift-selecting the ellipse displayed both names and enabled Start.
- Native Figma displayed the embedded Departure Mono heading, charcoal theme and cyan/yellow checklist accents. Opening More exposed the preserved secondary controls and expanded the panel; closing it restored the compact size. Left the panel in the compact ready state.
- No canvas content was changed during this UI acceptance check; only selection and the panel's disclosure state were changed. The text layout engine was not changed.

## 0.2.1 resize and padding acceptance

- Replaced the fixed-width body observer with a deliberate two-dimensional corner resize control; height-only disclosure changes preserve the chosen width, and manual resizing disables automatic fit. Width and height are clamped to safe bounds.
- Added half-pixel borders, lowercase UI labels/status/credit, and the footer “built on pretext.” Original selected-layer names and source text are preserved.
- Replaced the padding slider with a numeric input box and horizontal scrub icon, Shift fine scrubbing, typed input and keyboard adjustments.
- Native Figma: keyboard resizing grew the window from 340 × 320 to 390 × 370; a pointer drag then changed it to 340 × 395, and a second corner drag returned it to 340 × 320. This confirms the real sandbox resize path, not just a browser fixture.
- Native Figma: dragging the padding icon changed its displayed value from 12 to 32. Automated tests additionally verify clamping, fine control, typing, keyboard input, and that a released pointer no longer changes a value or window size.
- The suite now includes 18 passing tests. No text layout engine changes were made in this release.

## 0.2.2 individual input replacement

- Changed the two checks to persistent, outlined T and pentagon icons. Both pills are now accessible buttons with replace/cancel tooltips and a distinct picking state.
- Clicking a pill pauses live reflow and stages a replacement. The next matching canvas selection replaces only that input; the other input is retained. Start applies the staged pair. Clicking the same pill again cancels. Source-editing controls are disabled while a new pair is staged.
- Tests verify the UI's pick message routing and disabled Start while picking, individual source/shape replacement preserving the other node, retaining the old generated output, and cancellation restoring a normal binding. All 21 tests pass.
- Native visual/reselection acceptance for this release is blocked: the read-only Figma state request reported that the Mac was locked. The prior native checks above still apply to 0.2.1. No unlock or credential operation was attempted. Reopen the development plugin after manually unlocking the Mac to load 0.2.2.


## 0.2.3 disclosure height and icon alignment

- Reduced the T and pentagon SVGs from 13 px to 11 px inside fixed 12 × 12 px grid boxes. Both paths are centered on the same vertical axis, and block SVGs avoid inline baseline offsets.
- Removed the manual-resize override that prevented later height fitting. More and diagnostics now schedule a fresh natural-content measurement after layout, coalesce nested toggles, and send height-only resize requests to preserve the chosen width. Closing More no longer restores an outdated cached height.
- Typecheck, distribution build and all 22 automated tests pass. The new regression covers diagnostics closing, More closing after a tall manual resize, preserved width, after-layout measurement, hidden diagnostics, and coalesced nested toggles.
- Native visual/collapse acceptance remains unverified for this release: Figma displayed a blank loading view, accessibility tab actions timed out or returned AXError.cannotComplete, and the safe test tab could not be loaded reliably. No canvas edits were made during this check. Close and rerun the development plugin to load the rebuilt files when the Figma document has finished loading.


## 0.2.4 cap-height pill alignment

- Icons now use `1cap` of the same inherited 11 px font as the layer names, with tightly framed SVG artwork.
- Layer names use cap-to-baseline text box trimming and flex centering, with symmetric inner room so descenders and accents are retained when long names are ellipsized. Older engines that ignore text box trimming retain the single-line flex alignment.
- Typecheck, build and the existing 22 automated tests pass. This CSS-only update has not been visually verified in native Figma.


## 0.2.5 native collapse verification

- Replaced body measurement with a dedicated, naturally sized `#panel-content` flow root. Figma's viewport-sized body cannot become the requested content height. The body has no padding; the content wrapper owns all panel spacing.
- Disclosure fitting uses a zero-delay timer rather than depending on an iframe animation frame. A ResizeObserver watches only the inner content, allowing fonts and wrapped status text to update the natural height without observing the window's manually chosen height.
- Strengthened the regression fixture so body stays 900 px tall while content shrinks to 300 px. The previous body measurement would fail this test. Typecheck, distribution build and all 22 tests pass.
- Native Figma acceptance passed in the existing safe test Design file on 2026-10-19: expanded More and diagnostics; closing diagnostics reduced the actual window to its remaining content; closing More returned it to the compact panel with the footer near the bottom.
- Repeated after manually increasing width by 50 px and height by 50 px using the corner control's keyboard support. Diagnostics and More both shrank correctly, preserving the wider window. Left the running plugin compact at the manually chosen width. No canvas content was changed during these checks.
