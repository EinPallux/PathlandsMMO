# Audio assets

Drop your music files here (the game references them by these exact names):

- `loginscreen.mp3` — plays on the title / character-select screens.
- `bgm.mp3` — the in-game background music (loops).

Both are optional: if a file is missing the game runs silently for that track —
no error. They loop seamlessly, so a track with a clean loop point works best.

In-game sound effects (skill cast, enemy defeat, level-up, quest complete) are
**synthesized in code** (WebAudio), so there are no SFX files to provide.

Provide your own audio — do not commit copyrighted music.
