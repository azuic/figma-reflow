# Figma Community submission

## Listing

**Name:** reflow · built on pretext

**Tagline:** Editable text that flows around your shapes.

**Category:** Design tools → Format & resize

**Description:**

Wrap native, editable text around shapes in Figma. Select a text box and one or more shapes, set padding, then start reflow. Keep the panel open to update the layout as Figma exposes movement, resizing and rotation changes.

Built on Pretext by Cheng Lou and the Pretext contributors, inspired by the Pretext moving-shapes editorial demo:
https://github.com/chenglou/pretext
https://chenglou.me/pretext/editorial-engine/

This is an independent, open-source Figma integration by azuic. It is not an official Pretext or Figma product.

Features:
• Native editable text fragments, measured with the source font inside Figma.
• Live start/stop control and draggable padding input.
• Click the text or shape pill to replace an input.
• Original article and user shapes preserved; remove generated output safely.
• Compact, resizable dark panel with source editing and diagnostics under more.
• Local processing with no network access, accounts or analytics.

Use a fixed-size, left-aligned text box with one uniform style and zero letter/paragraph/list spacing. Rectangles and ellipses use their geometry; other shapes use conservative bounds. Generated output consists of separate editable line fragments. Edit the preserved source for changes that should survive the next reflow.

Keep the plugin open for live updates. Figma may defer intermediate geometry during pointer interactions; this is not a 60 fps guarantee. Stop reflow before editing output fragments.

Source, credits, licenses and support:
https://github.com/azuic/figma-reflow
https://github.com/azuic/figma-reflow/issues

Pretext is MIT licensed. Its complete license and third-party notices are included. Departure Mono by Helena Zhang is bundled under SIL OFL 1.1.

## Assets

- `icon.png`: 128 × 128, original Reflow icon.
- `thumbnail.png`: 1920 × 1080, original explanatory illustration of text flowing around shapes; not a screenshot.
- `render-assets.swift`: reproducible macOS AppKit asset generator.

## Submission state

Not yet submitted. Figma-assigned plugin ID: `1693872760886840748`. The listing text, icon, cover, creator handle `azuic`, public Community destination and GitHub Issues support URL are prepared in Figma desktop. The publish dialog currently blocks submission with: **“You must enable two-factor authentication to publish.”** The account owner must enable 2FA in Figma settings before submission can proceed. Submit free to Community as the owner's profile. The public source license is MIT; upstream notices remain included.

Figma's review status is separate from source publication. Only an **In review** or **Published** result from Figma confirms a completed submission.
