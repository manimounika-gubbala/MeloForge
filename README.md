# MeloForge

**Forge your sound with your voice.**

MeloForge is a voice-controlled beat sketchpad. Describe a sound in plain words, hear it play, then reshape it while it loops: *"make the drums faster," "add piano," "remove piano."* A finished song can't be edited by talking to it. MeloForge can.

> **Built entirely by voice.** This project was created for the Hacker House Goa **Wispr Flow Shortlisting Task**. Every line of code was produced by dictating prompts with [Wispr Flow](https://wisprflow.ai), not typed by hand. See the demo video below.

**Demo video:** [PASTE LINK HERE]

---

## What it does

- **Speak or type a command** and the pattern changes on screen and in the audio.
- **Edit mid-play.** The loop keeps running while you change it, so you can iterate like a live set instead of starting over.
- **16-step pattern sequencer** with six layers: Kick, Snare, Hi-hat, Bass, Melody, and Piano.
- **Tempo control** with a BPM readout and +/- buttons.
- **Live visual state.** Each layer's steps light up so you can see what the sound is made of.
- **Command feedback.** An "Interpreted Command" panel shows how your words were understood, including when nothing matched.
- **Type-to-talk fallback.** If speech recognition struggles (noisy room, unsupported browser), type the same command, or dictate it into the box with Wispr Flow.

## Try saying

| Say this | What happens |
|---|---|
| "Create a slow lo-fi beat at 80 BPM" | Sets a new pattern and tempo |
| "Add piano" | Turns the piano layer on |
| "Remove piano" | Turns the piano layer off |
| "Make the drums faster" | Raises the tempo |

## Honest scope

MeloForge is a **sketchpad, not a studio**. It plays simple synthesized loops, so it won't sound like a produced track. The point is the interaction: shaping music by talking to it, in real time.

## How it works

```
 voice / text  ->  command interpreter  ->  pattern + tempo state  ->  audio engine + sequencer grid
```

1. **Input.** The browser's Speech Recognition API turns your voice into text. Typed or dictated text goes through the same path.
2. **Interpretation.** The command is parsed into structured changes (which layers are on or off, what the tempo is) rather than regenerating audio. That's what makes "remove piano" a clean toggle.
3. **Playback.** The updated state drives the sequencer and the synth sounds.

<!-- Edit the three lines above to match your real implementation: rule-based parser vs LLM, and which audio library you used (Web Audio API, Tone.js, etc.). -->

## Getting started

**Requirements:** a modern Chromium-based browser (Chrome or Edge recommended for speech recognition) and a microphone.

```bash
# 1. Clone
git clone https://github.com/YOUR-USERNAME/YOUR-REPO.git
cd YOUR-REPO

# 2. Serve locally (any static server works)
python -m http.server 8000

# 3. Open
# http://localhost:8000
```

<!-- If your project needs an install step or an API key, add it here. If it needs a key, say how to set it without committing it. -->

Click **Tap to Speak**, allow microphone access, and say a command. Or type into the command box and press Enter.

## Tech stack

- HTML, CSS, JavaScript
- Web Speech API (browser speech recognition)
- [FILL IN: Web Audio API / Tone.js]
- [FILL IN: command parsing approach]

## How it was built (voice-driven development)

The whole project was built by speaking prompts through Wispr Flow into an AI coding tool, with no hand-written code. The screen recording shows the real build process from an empty folder to the working app, including the corrections and "no, make the grid bigger" moments along the way.

Build sequence, each step a spoken prompt:

1. Page layout and visual design
2. Play/stop transport and BPM control
3. The 16-step, six-layer sequencer grid
4. Command box and command interpreter
5. Microphone button and speech recognition
6. Live feedback panel and "Try saying" hints

## Known limitations

- Speech recognition accuracy depends on the browser and the room. Misheard words (for example "piiano") can fail to match a command, so the type-to-talk box is there as a fallback.
- The command vocabulary is limited. It understands the layers, tempo changes, and a few style words, not free-form descriptions.
- Sounds are simple synth voices, not realistic instruments.

## Roadmap

- Fuzzy matching so near-miss transcripts still work
- Richer commands ("add swing," "make the bass heavier," "strip it down to just the kick")
- Changes quantized to the next bar so edits always land on the beat
- More genres and keys
- Save and share sessions

## Acknowledgements

Built for **Hacker House Goa** using **Wispr Flow** for voice-driven development.



