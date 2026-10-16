# Eerie, echoing soundtrack for the D3MON world mockup, synced to the video's timeline.
import numpy as np, wave, sys

SR = 48000
DUR = 52.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)

def env(start, attack, hold, release, n=N):
    e = np.zeros(n)
    a0 = int(start * SR); a1 = a0 + int(attack * SR); h1 = a1 + int(hold * SR); r1 = h1 + int(release * SR)
    def seg(i0, i1, v0, v1):
        i0c, i1c = max(0, i0), min(n, i1)
        if i1c > i0c: e[i0c:i1c] = np.linspace(v0, v1, i1 - i0)[i0c - i0:i1c - i0]
    seg(a0, a1, 0, 1); seg(a1, h1, 1, 1); seg(h1, r1, 1, 0)
    return e

def lowpass(x, fc):
    # one-pole low-pass; fc may be an array (moving filter)
    a = np.exp(-2 * np.pi * np.broadcast_to(fc, x.shape) / SR)
    y = np.empty_like(x); z = 0.0
    for i in range(len(x)):
        z = (1 - a[i]) * x[i] + a[i] * z; y[i] = z
    return y

def lp_fast(x, fc):
    # fixed-cutoff one-pole low-pass, vectorised via recursion in blocks (good enough for noise beds)
    a = np.exp(-2 * np.pi * fc / SR)
    from itertools import accumulate
    y = np.fromiter(accumulate(x * (1 - a), lambda z, v: v + a * z), float, len(x))
    return y

def pan(sig, p):  # p: -1 left .. 1 right
    L[:] += sig * np.sqrt((1 - p) / 2); R[:] += sig * np.sqrt((1 + p) / 2)

def place(sig, at, p=0.0):
    i = int(at * SR); n = min(len(sig), N - i)
    s = np.zeros(N); s[i:i + n] = sig[:n]; pan(s, p)

def bell(f, dur=3.0, amp=.25):
    tt = np.arange(int(dur * SR)) / SR
    parts = [(1, 1), (2.76, .45), (5.40, .25), (8.93, .12)]
    return amp * sum(a * np.sin(2 * np.pi * f * m * tt) * np.exp(-tt * (1.4 + m * .6)) for m, a in parts) * np.minimum(1, tt * 400)

# ---- 1. the drone: low A with a dissonant neighbour, slowly breathing ----
fade_all = env(0, 3.5, DUR - 7.5, 4)
drone = (np.sin(2 * np.pi * 55 * t) * .30 + np.sin(2 * np.pi * 55.35 * t) * .22
         + np.sin(2 * np.pi * 82.41 * t) * .12 + np.sin(2 * np.pi * 58.27 * t) * .07 * (0.5 + .5 * np.sin(2 * np.pi * t / 13)))
drone *= (0.9 + .1 * np.sin(2 * np.pi * t / 9.0)) * fade_all
pan(drone * .9, -0.1); pan(np.sin(2 * np.pi * 110.4 * t) * .05 * fade_all * (0.5 + .5 * np.sin(2 * np.pi * t / 7)), .3)

# ---- 3. glassy high tones (a minor second, barely there) ----
glass = (np.sin(2 * np.pi * 1318.5 * t) + np.sin(2 * np.pi * 1396.9 * t) * .8) * .012
glass *= (0.5 + .5 * np.sin(2 * np.pi * t / 5.3)) * env(4, 4, 40, 6)
pan(glass, .5)

# ---- 4. the reveal (4–8 s): a long swell and a sub drop ----
sw = env(3.6, 3.2, .2, 1.2)
for f0, p in [(220, -.5), (220.9, .5), (329.6, -.2), (440.5, .3)]:
    pan(np.sin(2 * np.pi * f0 * t + 3 * np.sin(2 * np.pi * .23 * t)) * sw * .07, p)
tt = np.arange(int(4 * SR)) / SR
place(np.sin(2 * np.pi * (70 - 30 * tt / 4) * tt) * np.exp(-tt * .9) * .45, 6.8)

# ---- 5. corner chimes as each stat card appears ----
place(bell(311.1), 11.6, -.6)   # Bots, D#4
place(bell(233.1), 17.6, .6)    # Callers, A#3
place(bell(277.2), 23.6, -.3)   # Chart Scripts, C#4

# ---- 6. through the trailer screen (28.5 s): whoosh + digital crackle ----
tt = np.arange(int(1.6 * SR)) / SR
place(np.sin(2 * np.pi * np.cumsum(300 + 900 * (tt / 1.6) ** 2) / SR) * np.sin(np.pi * tt / 1.6) * .1, 27.5)
crk = (rng.random(int(.6 * SR)) < .02) * rng.standard_normal(int(.6 * SR)) * .5
place(crk * np.linspace(1, 0, len(crk)), 28.4, .2)

# ---- 7. calls arriving, sealed: sonar pings ----
for i, at in enumerate([31, 31.7, 32.4, 33.1, 33.8]):
    tt = np.arange(int(1.2 * SR)) / SR
    ping = np.sin(2 * np.pi * (1250 - 200 * tt) * tt) * np.exp(-tt * 7) * .16
    place(ping, at, [-.5, .5, -.2, .3, 0][i])

# ---- 8. THE LOCK (35 s): reversed swell into a deep boom, then a revealed chord ----
rev = lp_fast(rng.standard_normal(int(1.4 * SR)), 2500) * np.linspace(0, 1, int(1.4 * SR)) ** 3 * 1.1
place(rev, 35 - 1.4)
tt = np.arange(int(5 * SR)) / SR
place(np.sin(2 * np.pi * (85 * np.exp(-tt * .7) + 30) * tt) * np.exp(-tt * .8) * .8, 35)
for f, p in [(220, -.4), (261.6, .4), (329.6, 0)]:
    place(bell(f, 4, .14), 35.15, p)

# ---- 9. rising up the light column (37.6–41.5 s) ----
tt = np.arange(int(4.2 * SR)) / SR
f = 110 * 2 ** (tt / 4.2 * 2)          # two octaves up
rise = (np.sin(2 * np.pi * np.cumsum(f) / SR) * .12 + np.sin(2 * np.pi * np.cumsum(f * 1.5) / SR) * .05) * np.sin(np.pi * tt / 4.2)
place(rise, 37.6)

# ---- 10. the trade floor: a faint pulsing hum ----
pan(np.sin(2 * np.pi * 146.8 * t) * .05 * (0.5 + .5 * np.sin(2 * np.pi * t * 1.2)) * env(41.4, 1.5, 3.5, 2), .2)

# ---- 11. end title (47.6 s): a last deep hit that rings out ----
tt = np.arange(int(4.4 * SR)) / SR
place(np.sin(2 * np.pi * 41.2 * tt) * np.exp(-tt * .9) * .7 + bell(110, 4.4, .12), 47.6)

dry = np.stack([L, R], 1)

# ---- the big space: convolution with a 6-second dark stereo hall impulse ----
irn = int(6 * SR); it = np.arange(irn) / SR
ir = np.zeros((irn, 2))
for c in range(2):
    nz = lp_fast(rng.standard_normal(irn), 2200) + rng.standard_normal(irn) * .15
    ir[:, c] = nz * np.exp(-it * 1.05)
ir[: int(.045 * SR)] = 0                # pre-delay: the far walls
ir /= np.abs(ir).sum(0).max() / 18
nfft = 1 << int(np.ceil(np.log2(N + irn)))
wet = np.stack([np.fft.irfft(np.fft.rfft(dry[:, c], nfft) * np.fft.rfft(ir[:, c], nfft), nfft)[:N] for c in range(2)], 1)
mix = dry * .55 + wet * .9
rms = np.sqrt((mix ** 2).mean(0)); mix *= rms.mean() / rms        # balance left and right
mix /= np.abs(mix).max() / .9
out = (mix * 32767).astype(np.int16)
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())
print("ok")
