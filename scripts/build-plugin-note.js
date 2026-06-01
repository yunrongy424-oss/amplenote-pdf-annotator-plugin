const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src", "plugin.js"), "utf8").trim();
const outDir = path.join(root, "dist");
fs.mkdirSync(outDir, { recursive: true });

const note = `# PDF Annotator

| Field | Value |
| --- | --- |
| Name | PDF Annotator |
| Description | Annotate PDFs attached to the current note, export a marked-up copy, and save highlight notes back into the note. |
| Version | 0.1.0 |
| Author | Slot B bounty implementation |
| Tags | pdf, annotation, highlights, comments |

\`\`\`javascript
${source}
\`\`\`

## Usage

1. Attach or embed a PDF in an Amplenote note.
2. Open the note menu and choose **Annotate PDF**.
3. Drag over a PDF page to create a highlight, or switch to Comment to attach text to a region.
4. Choose **Save Notes** to write the annotation summary into a **PDF Annotations** section in the note.
5. Choose **Export PDF** to attach a marked-up PDF copy back to the note when supported, or download it as a fallback.

## Attachment Limitation

The plugin reads PDF attachments through \`app.getNoteAttachments()\` and \`app.getAttachmentURL()\`, then opens an embed annotation UI with \`app.openEmbed\` or \`app.openSidebarEmbed\`.
Current public Amplenote plugin APIs expose \`app.attachNoteMedia()\` for data URL uploads and \`app.saveFile()\` for local downloads, but do not expose a documented way to replace an existing PDF attachment in-place. Because of that, the plugin first tries to attach the marked-up PDF back to the note and link it from the annotation summary. If Amplenote rejects that PDF upload, it downloads the marked-up PDF and still writes the structured annotation summary back into the note.
`;

fs.writeFileSync(path.join(outDir, "AMPLENOTE_PLUGIN_NOTE.md"), note);
console.log("Wrote dist/AMPLENOTE_PLUGIN_NOTE.md");
