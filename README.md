# Amplenote PDF Annotator Plugin

This repository contains a publishable Amplenote plugin note for the PDF annotation bounty.

The plugin lets a user:

- choose a PDF attachment from the current note;
- open an embedded PDF annotation workspace;
- drag page regions to create highlights or comments;
- save notes/highlights into a `## PDF Annotations` section in the note;
- attach a marked-up PDF copy back into the note when Amplenote accepts the PDF data URL;
- fall back to a local marked-up PDF download when attachment upload is unavailable.

## Amplenote API Boundary

The current public Amplenote plugin API supports reading note attachments, creating a CORS-proxied attachment URL for embed loading, opening embeds, replacing note markdown content, attaching media data URLs, and saving files to the user's device. I did not find a documented API for replacing an existing PDF attachment in-place. The plugin therefore tries the closest compliant path first: attach the annotated PDF data URL back to the note and link it from the annotation summary. If Amplenote rejects that PDF upload for file type, size, client, or network reasons, the plugin falls back to `app.saveFile()` while still saving the structured annotation summary directly into the note.

## Development

Use the bundled Node.js runtime if `node` is not on PATH:

```powershell
& 'C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test
& 'C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts\build-plugin-note.js
```

The generated plugin note is written to `dist/AMPLENOTE_PLUGIN_NOTE.md`.

## Source Notes

- Amplenote plugin development docs: https://www.amplenote.com/help/developing_amplenote_plugins
- Amplenote plugin app interface docs: https://www.amplenote.com/help/developing_amplenote_plugins/app_interface
- Amplenote plugin note interface docs: https://www.amplenote.com/help/developing_amplenote_plugins/note_interface
- Amplenote plugin embed docs: https://www.amplenote.com/help/developing_amplenote_plugins/embeds
- Prior art inspected for interaction ideas only: https://github.com/elias-sundqvist/obsidian-annotator
