# Attachment rows

The selected design is **A — Quiet rows**: a lightly outlined, single-line row for files without
a visual preview. Layout: file-type icon → bounded, ellipsized name → size → icon-only ghost actions.
Names expose their full value on hover/focus. Each action has a tooltip and an accessible name.

The same component renders published files, staged non-audio uploads and outgoing attachments.
Published HTML retains its preview action and the existing safety consent dialog; other files
offer download only. Staged files show readiness/removal, not premature download links. After a
reload, unavailable uploads show a warning and cannot be sent until removed and attached again.
Zero-byte files show `0 B`; older attachments without size metadata show `—`.

Screenshot thumbnails, their viewer and captions are unchanged. Existing audio players and audio
prompt controls also keep their specialized presentation. File size is local draft/pending metadata;
it is not added to the submission protocol.

The alternatives and the original fixture study are archived on branch
`prototype/attachment-studies` at commit `e97339a`. The user chose quiet rows in:
https://discord.com/channels/1526236793048141935/1564730499048677486
