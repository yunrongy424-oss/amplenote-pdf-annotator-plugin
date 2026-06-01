# Submission Notes

## Bounty

- Platform: Amplenote Plugin Bounties
- Board: https://www.amplenote.com/bounty_plugins
- Task: PDF annotation tool
- Payout path: PayPal after publication to the Amplenote Plugin Directory and bounty claim email
- PayPal: 1005150221@qq.com

## Deliverable

- Source repo: `D:\AI\打工皇帝\bounties\shared\repos\amplenote-pdf-annotator-plugin`
- Generated Amplenote plugin note: `dist/AMPLENOTE_PLUGIN_NOTE.md`
- Tests: `node --test`

## Functional Coverage

- Choose a PDF from the current note.
- Open an embedded annotation dashboard.
- Create highlights and comments by dragging on rendered PDF pages.
- Save highlight/comment summaries as markdown in a `## PDF Annotations` note section.
- Attach a marked-up PDF copy back into the note when `app.attachNoteMedia()` accepts the PDF data URL.
- Fall back to a local marked-up PDF download when attachment upload is unavailable.

## Known API Limitation

The plugin cannot replace the source PDF attachment in-place because I did not find a current public Amplenote plugin API for arbitrary attachment replacement. The implementation first tries to attach the marked-up PDF back into the note with `app.attachNoteMedia()` and link it from the annotation section. If the client rejects the PDF upload because of file type, size, network, or account limitations, it falls back to `app.saveFile()` and still saves all annotation metadata/text into the note.

## Auth Boundary

Publishing to the Amplenote Plugin Directory and emailing the bounty claim require an Amplenote account and email authorization. Stop here for user-controlled auth unless a logged-in publishing session is explicitly available.
