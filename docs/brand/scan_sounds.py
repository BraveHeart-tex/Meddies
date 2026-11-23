"""Synthesize the Meddies match sound, "Two capsules". Pure stdlib.

Run `python3 scan_sounds.py <out-dir>`. It writes a-two-capsules.wav deterministically; that
file ships unchanged as public/sounds/scan-match.wav, and a-two-capsules.wav here is its master.
"""
import math
import struct
import sys
import wave
from pathlib import Path

SR = 44100
OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)


def buf(seconds):
    return [0.0] * int(SR * seconds)


def env(t, attack, decay):
    """Soft attack, exponential decay."""
    a = min(1.0, t / attack) if attack > 0 else 1.0
    a = 0.5 - 0.5 * math.cos(math.pi * a)  # smooth attack curve
    return a * math.exp(-t / decay)


def mallet(out, start, freq, amp, decay=0.18, partials=((1, 1.0), (3.98, 0.12), (9.2, 0.03))):
    """Rounded marimba-like tone: sine fundamental, quiet inharmonic overtones that die fast."""
    s0 = int(start * SR)
    n = int(decay * 6 * SR)
    for i in range(n):
        if s0 + i >= len(out):
            break
        t = i / SR
        v = 0.0
        for k, (mult, pa) in enumerate(partials):
            d = decay / (1 + k * 2.5)  # higher partials decay faster
            v += pa * math.sin(2 * math.pi * freq * mult * t) * env(t, 0.004, d)
        out[s0 + i] += amp * v


def finish(samples, name, peak_db=-6.0):
    # fade tail, normalize, write 16-bit mono
    fade = int(0.02 * SR)
    for i in range(fade):
        samples[-1 - i] *= i / fade
    peak = max(abs(x) for x in samples) or 1.0
    gain = (10 ** (peak_db / 20)) / peak
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b"".join(struct.pack("<h", int(x * gain * 32767)) for x in samples))


def note(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


# "Two capsules": two soft mallet notes, rising major third (E5 -> G#5). Echoes the logo.
a = buf(0.6)
mallet(a, 0.00, note(76), 0.8)
mallet(a, 0.09, note(80), 1.0, decay=0.22)
finish(a, "a-two-capsules")


print("\n".join(str(p) for p in sorted(OUT.glob("*.wav"))))
