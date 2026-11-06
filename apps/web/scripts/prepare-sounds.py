#!/usr/bin/env python3
"""
Turns the source sounds in apps/web/audio/*.wav into the web app's copies in
apps/web/src/assets/sounds/*.m4a. Run after changing a sound, from the repo root:

    pnpm --filter @uat/web sounds

For each sound it:
1. cuts it at END_SECONDS, if it has an entry there (to drop unwanted parts,
   such as a stray note after the sound proper);
2. raises the volume, by the same amount for every sound so their balance is
   kept, until the loudest peak of all of them reaches PEAK_DBFS;
3. trims the silent tail of the louder sound: everything 0.2 s after it last
   rises above -50 dBFS, with a fade over those 0.2 s so there is no click.
   This comes after the gain, so it judges silence as it will be heard. The
   game waits for the "unknown" sound to end, so "ended" must mean as heard;
4. encodes to AAC (.m4a) with macOS's afconvert, about 1/20 the size of WAV.

Needs macOS (for afconvert) and 16-bit WAV sources.
"""
import math
import struct
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

# Relative to apps/web, wherever the script is run from.
WEB = Path(__file__).resolve().parent.parent
SOURCES = WEB / "audio"
OUTPUT = WEB / "src" / "assets" / "sounds"
NAMES = ["query", "unknown", "correct", "wrong", "enter", "leave", "title", "unmute"]
SILENCE_DBFS = -50   # quieter than this counts as silence
TAIL_SECONDS = 0.2   # kept, and faded, after the sound ends
PEAK_DBFS = -1.0     # the loudest peak across all sounds, after the gain
# Where to cut a sound short, in seconds from its start.
# Prefer fixing the source instead: the sounds are rendered from MIDI files
# in ../midi-playground (FluidSynth with p2.sf2), so an unwanted note is best
# removed there.
END_SECONDS: dict[str, float] = {}
BITRATE = 160_000

FULL_SCALE = 32768


def read(path):
    with wave.open(str(path)) as w:
        params = w.getparams()
        if params.sampwidth != 2:
            sys.exit(f"{path}: only 16-bit WAV is supported")
        n = params.nframes * params.nchannels
        return params, list(struct.unpack(f"<{n}h", w.readframes(params.nframes)))


def trim(params, samples):
    ch, rate = params.nchannels, params.framerate
    threshold = FULL_SCALE * 10 ** (SILENCE_DBFS / 20)
    frames = len(samples) // ch
    last = max(
        (i for i in range(frames) if any(abs(samples[i * ch + c]) > threshold for c in range(ch))),
        default=0,
    )
    end = min(frames, last + int(TAIL_SECONDS * rate))
    fade = int(TAIL_SECONDS * rate)
    out = samples[: end * ch]
    for i in range(max(0, end - fade), end):
        g = (end - i) / fade
        for c in range(ch):
            out[i * ch + c] = int(out[i * ch + c] * g)
    return out


def cut(params, samples, name):
    seconds = END_SECONDS.get(name)
    if seconds is None:
        return samples
    return samples[: int(seconds * params.framerate) * params.nchannels]


def main():
    sounds = {}
    for name in NAMES:
        params, samples = read(SOURCES / f"{name}.wav")
        sounds[name] = (params, cut(params, samples, name))

    loudest = max(max(abs(x) for x in s) for _, s in sounds.values())
    gain = FULL_SCALE * 10 ** (PEAK_DBFS / 20) / loudest
    print(f"loudest peak {20 * math.log10(loudest / FULL_SCALE):.1f} dBFS; "
          f"raising every sound by {20 * math.log10(gain):+.1f} dB")

    OUTPUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for name, (params, samples) in sounds.items():
            louder = [max(-FULL_SCALE, min(FULL_SCALE - 1, round(x * gain))) for x in samples]
            louder = trim(params, louder)
            wav = Path(tmp) / f"{name}.wav"
            with wave.open(str(wav), "wb") as w:
                w.setparams(params)
                w.writeframes(struct.pack(f"<{len(louder)}h", *louder))
            target = OUTPUT / f"{name}.m4a"
            subprocess.run(
                ["afconvert", "-f", "m4af", "-d", "aac", "-b", str(BITRATE), str(wav), str(target)],
                check=True,
            )
            peak = 20 * math.log10(max(abs(x) for x in louder) / FULL_SCALE)
            seconds = len(louder) / params.nchannels / params.framerate
            print(f"  {name:8} {seconds:5.2f} s, peak {peak:5.1f} dBFS -> {target}")


if __name__ == "__main__":
    main()
