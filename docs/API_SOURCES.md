# API Sources And Design Notes

Official Amplenote docs used while implementing:

- Developing Amplenote Plugins: https://www.amplenote.com/help/developing_amplenote_plugins
- App interface: https://www.amplenote.com/help/developing_amplenote_plugins/app_interface
- Note interface: https://www.amplenote.com/help/developing_amplenote_plugins/note_interface
- Embeds: https://www.amplenote.com/help/developing_amplenote_plugins/embeds

Implementation choices:

- PDF discovery uses `app.getNoteAttachments()` and filters attachment records by PDF mime type or `.pdf` filename.
- PDF loading uses `app.getAttachmentURL()` and Amplenote's documented CORS proxy URL so an embed can read the note attachment URL.
- The annotator UI is rendered with `renderEmbed`, because PDF page rendering and drag-based region selection need browser APIs.
- The embed calls back into the plugin through `window.callAmplenotePlugin()` and `onEmbedCall`.
- Annotation summaries are saved through `app.getNoteContent()` and `app.replaceNoteContent()` so the plugin can idempotently maintain one `## PDF Annotations` section.
- Marked-up PDF export first tries `app.attachNoteMedia()` with a PDF data URL, because the public API documents media upload from a data URL. The plugin then falls back to `app.saveFile()` because the public API does not document arbitrary PDF attachment replacement and may reject PDF uploads by file type, size, client, network, or account state.

Prior art inspected:

- Obsidian Annotator: https://github.com/elias-sundqvist/obsidian-annotator

I used the prior art only for high-level interaction/data-model ideas: page-relative region annotations, comment metadata, and a split between PDF rendering and markdown/text persistence. No Obsidian-specific code was copied.
