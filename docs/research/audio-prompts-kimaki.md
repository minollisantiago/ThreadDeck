# Audio prompts and playback in ThreadDeck

Research/design only, 2026-10-28. Existing checkout:
`prototype/kimaki-chat-workspace`. No application changes, bot restart, credential
inspection, paid transcription requests, or live Discord sends were performed.

## Recommendation

Treat this as two independently useful slices: attachment playback first, then
record/upload an explicit **audio prompt** through the existing local Kimaki
bridge. Reuse Kimaki's transcription implementation and configuration, not a
second speech service in ThreadDeck. A normal Discord attachment is sufficient
for the initial published recording; an exact native Discord voice-message
envelope is not necessary for ThreadDeck's own audio-bubble UI.

Companion research: [browser and component tooling](audio-tooling.md).

## Verified local boundaries

| Boundary | Current behavior | Design consequence |
| --- | --- | --- |
| `src/chat/messages.tsx:30–34` | Image renderer or generic download card; no audio element | Add an audio-specific renderer, retaining download fallback |
| `server/chat.ts:60–66` | Only raster images get inline MIME; all other files become `application/octet-stream` + attachment disposition | Adding a play button alone does not fix the serving contract; explicitly allow safe audio MIME types |
| `server/attachments.ts` | Resolves an attachment from real message history, refreshes signed URL, validates CDN host, buffers at most 10 MiB | Reuse this authorization path; don't accept arbitrary audio URLs |
| `shared/chat.ts:5–10` | Loose Discord schemas preserve unknown top-level and attachment fields | Existing top-level `duration_secs`, `waveform`, flags/references can survive transport, but need typed validation before use |
| `shared/discord-attachments.ts` | Top-level attachments retained; synthesized Components V2 resources only normalize selected fields | Don't assume synthetic resources contain voice duration/waveform metadata |
| `src/chat/composer.tsx:51–63` | Generic files already upload as binary; drag/drop and file picker accept files | Dropped audio can already be published as a file, but that does not imply transcription |
| `server/chat.ts:70–85` | Stages opaque file IDs, 10 MiB/file, 128 files/256 MiB storage cap | Recording can reuse staging; temporary/durable retention needs explicit policy |
| `integrations/kimaki/adapter.mjs:92–109` | Publishes attributed bot message, then `runInSession` with local file URIs | This route bypasses Discord ingress voice detection |
| `integrations/kimaki/bridge-core.ts` | Durable request/hash receipts; unknown external effects are not automatically replayed | Preserve this behavior for audio; don't silently retranscribe/resubmit after timeouts |
| `electron/main.cjs:134–135` | Permission request/check handlers unconditionally deny | Recording is currently blocked in desktop; introduce narrowly scoped audio permission, not a global allow |

The fork baseline is explicitly Kimaki **1.4.0** in
`scripts/prepare-kimaki-fork.mjs`; inspecting it does not prove which binary a
currently running bot uses. Local installed source was checked against the
version-pinned published source below.

## How Kimaki actually handles Discord audio

Verified against published [Kimaki 1.4.0 ingress source][ingress] and
[voice source][voice], rather than assuming a transcription HTTP API exists.

```text
Authorized human Discord message + attachment
  -> ingress gates and project/thread lookup
  -> first isVoiceAttachment match
  -> download bytes + resolve project/agent context
  -> transcribe(...) -> parseVoiceMessage(...) -> Route
  -> publish transcription reply in existing thread
  -> dispatch route to session
```

- A special Discord voice flag is not required for recognition. Audio filename,
  MIME type, duration/waveform metadata are inspected. Visual media dimensions
  and video extensions exclude video; `.m4a` is intentionally recognized even
  when Discord labels it `video/mp4` (`voice.ts:88–153`).
- Only the first audio attachment is transcribed. Other attachments become
  prompt files. When voice is present, message text is not combined into the
  transcription route (`ingress.ts:243–255`). Mixed text/audio behavior therefore
  needs a deliberate bridge decision, not accidental imitation.
- Existing-thread transcripts are real Discord replies (`ingress.ts:261–264`).
  New sessions use `startSession(...showInput: true)` to expose the transcribed
  input (`ingress.ts:266–278`).
- Providers in order: OpenAI API key, OpenCode ChatGPT subscription credential,
  Gemini API key, then hosted Whisper for gateway installations. OpenAI uses
  `gpt-audio-1.5` via chat completions and a transcription/routing tool call; it is
  not simply always Whisper. Failures may fall through to the next provider
  (`voice.ts:411–435, 584–654`). No active user's provider was queried.
- OpenAI/Gemini can return `steer`, `queue`, `btw`, `new-session`, and agent
  selection. ChatGPT dictation and gateway Whisper return steer-only results.
  The ChatGPT endpoint is explicitly private/undocumented in Kimaki source;
  reuse it only indirectly through Kimaki, never make ThreadDeck depend on it.
- OpenAI conversion supports MP3/WAV directly, Ogg Opus through prism/opusscript,
  and M4A through ffmpeg. **WebM is a real integration trap:** `.webm` is excluded
  by voice detection and `openAIAudio` has no WebM branch. Do not rename WebM bytes
  to `.ogg` (`voice.ts:88–153, 296–375`).

### Why “upload it to Discord and let Kimaki notice” will not work here

ThreadDeck publishes using Kimaki's own bot identity. Kimaki deliberately ignores
its own `MESSAGE_CREATE` events except its specific remote-send envelope
(`ingress.ts:228–230, 307–311`). Remote-send envelopes use a separate file/send
path, not the normal voice recognizer. Generic bridge files likewise go directly
to `runInSession`. Reusing the pipeline requires an **explicit bridge semantic
action** in the maintained fork, not a second bot/user token or fake Discord
message object.

## Proposed architecture (not an existing API)

```text
Browser / Electron
  microphone -> MediaRecorder -> local preview -> explicit Send / Queue
  file picker / drop --------------------------------------+
                                                         |
  existing bounded upload -> opaque staged file ID -------+
                                                         v
ThreadDeck backend -> authenticated Kimaki bridge audio-prompt action
                        -> publish attributed recording in Discord
                        -> normalize media in Kimaki
                        -> existing transcribe(...) implementation
                        -> publish correlated transcription in Discord
                        -> shared semantic dispatch, exactly one owner
                                                         |
ThreadDeck history/changes <----- actual Discord messages -+
```

Proposed contract should identify one staged audio file as a prompt, explicitly
separate from “attach this audio as reference material.” Negotiate an audio-prompt
capability; an older bridge must not pretend a generic file send transcribed it.
No API keys or broad Kimaki credential go into the browser. Forwarding an existing
attachment should resolve authorized thread/message/attachment IDs, then stage or
reuse validated bytes; never trust an arbitrary client-supplied CDN URL. File
import is straightforward. Discord-native forwards are different: their audio
may be nested under `message_snapshots[].message.attachments`, not top-level
attachments ([Discord snapshot/forward contract][discord]). Neither the current
ThreadDeck attachment collector nor Kimaki's top-level ingress attachment scan
walks these snapshots. Supporting “forward a Discord voice note” therefore needs
explicit snapshot extraction, authorized resolution, provenance and fixture/live
verification; a forward alone is not proof that Kimaki will transcribe it.

Prefer a small shared Kimaki action wrapping transcription, transcript
publication and dispatch, callable by Discord ingress and the client bridge.
Keep caller-specific identity/authorization adapters separate. Reuse real
functions, not fabricated `Message` instances. Preserve publish-before-dispatch
and no-double-ingestion rules from the current bridge.

### Decisions to make before implementation

1. **Send versus review:** default recommendation is record -> preview recording
   -> Send -> Kimaki posts transcript -> runs, matching current Discord behavior.
   Reviewing/editing the transcript before execution is valuable but needs a
   separate transcribe-only/confirm lifecycle; it is not the current pipeline.
2. **Queue authority:** recommend the visible Send/Queue selection takes
   precedence over inferred spoken routing. Otherwise a steer-only provider can
   unexpectedly interrupt work, or stripped routing words can disagree with UI.
   Decide whether spoken side-thread/new-session/agent routing is a later feature.
3. **Mixed content:** start with one audio prompt plus optional ordinary reference
   attachments, with clearly defined caption semantics. Consider deferring mixed
   typed instruction + audio and multiple audio prompts to avoid silent loss.
4. **Formats:** negotiate the actual MediaRecorder MIME, keep the true extension,
   and normalize WebM in the Kimaki boundary (requires an explicit conversion
   implementation/dependency decision). Prefer supported Ogg/M4A only when the
   browser really offers them; do not assume Chromium records Ogg.
5. **Durability:** add visible transcription progress/failure and persist successful
   transcript and publication IDs before dispatch. Restart or transport ambiguity
   must not charge/run twice by automatically starting over. The present receipt
   schema has no dedicated transcribing state.
6. **Storage/privacy:** recordings are retained locally and published to Discord;
   transcription may use provider fallback. State that clearly. Do not silently
   remove existing staged files that agents may still need.

## Playback and recording UX

```text
You                                     10:42
  [ Play ]  ||| |||||| ||| ||||  0:08 / 0:31   [1x] [Download]
  Transcription
  “Investigate why the attachment player cannot seek…”

Composer recording:
  [Cancel]  Recording 0:18  |||||| |||||   [Stop]
Composer preview:
  [Play]    Recording 0:31                [Discard] [Send / Queue]
```

Start with native HTML audio as the playback engine and small themed controls.
Provide keyboard-accessible play/pause and seek, elapsed/duration, speed, download,
loading/error/retry states; pause the previous clip when another starts, never
autoplay. Use Discord `waveform` when present and validated; fall back to a real
progress track rather than inventing a waveform. Decode/generate waveforms lazily
only if worth the memory/CPU; display-only metadata does not require Web Audio.
Keep the real transcript visible and preserve Discord message identity/reference,
even if visually grouped with its recording. Current bot/user grouping does not
understand transcription relationships; don't hide or duplicate messages based
on text matching.

Playback transport can begin with bounded buffered clips, but implement correct
MIME/disposition and test seek behavior. The current endpoint ignores Range and
always returns 200; efficient seeking needs proper 206/Content-Range handling or
a bounded downloaded Blob URL. Never label whole-file buffering as streaming.
Loading metadata for every clip currently downloads/refetches complete files, so
prefer lazy source assignment or `preload="none"`. Revoke Blob URLs on disposal.

Recording needs explicit mic permission, visible recording state, stop/cancel,
track cleanup on cancellation/unmount, recovery for device loss, duration/byte
limits, and no accidental send on thread switch. Consider keeping a recording
bound to its original thread or requiring explicit discard before navigation.
Desktop capture occurs in Windows Electron, not in the WSL backend. Narrowly
allow microphone access for the main trusted application origin/frame only;
keep HTML previews and other origins denied, and keep camera permission denied.

## Proposed delivery order and validation

1. Existing audio attachment playback, headers, lazy loading and fallback.
2. Explicit uploaded-file audio prompt through Kimaki, before microphone UI.
3. Recording/preview using the same path, with codec normalization and Electron
   permission support; polish Discord-like bubble/waveform afterward.

Future acceptance checks: Ogg voice attachments, MP3/WAV/M4A imports, Chromium
WebM recording, unsupported codecs, missing keys/ffmpeg, mic denial, interrupted
recording, signed-URL expiry, attachment authorization/size/Range, one active
player, queue versus send, old bridge capability fallback, duplicate request IDs,
restart after each external side effect, transcript publication failure, and
actual Discord transcript parity. Live test sends and provider charges need
explicit authorization; this research did not perform them.

[ingress]: https://unpkg.com/kimaki@1.4.0/src/ingress.ts
[voice]: https://unpkg.com/kimaki@1.4.0/src/voice.ts
[discord]: https://docs.discord.com/developers/resources/message#message-snapshot-object
