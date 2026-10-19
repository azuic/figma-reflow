# Privacy

Reflow runs locally within Figma's plugin sandbox. Its manifest declares `networkAccess.allowedDomains: ["none"]`.

- It does not send source text, shapes, fonts or document data to external servers.
- It does not include analytics, advertising, tracking, accounts or API keys.
- A local worker runs the bundled Pretext layout library. Font measurements are made with temporary native Figma text nodes, removed when measurement ends or the plugin closes.
- Source text remains in its original layer. The plugin stores node identifiers, padding, source recovery state and binding metadata in Figma plugin data so output can be resumed or removed. These values remain in the Figma file and follow Figma's normal document storage and collaboration behavior.
- Generated text is retained in the Figma file until removed. The **remove output** action deletes only plugin-generated output and restores the source's saved visibility and opacity.

The **built on pretext** credit opens the upstream project's GitHub page only when clicked. GitHub and Figma operate under their own policies. Bug reports submitted voluntarily through GitHub Issues are public; avoid including private document content.

Questions: [GitHub Issues](https://github.com/azuic/figma-reflow/issues).
