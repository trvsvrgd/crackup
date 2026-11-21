/** Offline Windows speech rendering; runtime uses bundled PCM, never a network TTS service. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { RESONANCE_MEMORY_FRAGMENTS } from '../shared/content/worldLore.js';
const output = path.resolve('public/assets/audio/lore');
fs.mkdirSync(output, { recursive: true });
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'crackup-lore-voices-'));
try {
  fs.writeFileSync(path.join(work, 'memories.json'), JSON.stringify(RESONANCE_MEMORY_FRAGMENTS));
  fs.writeFileSync(path.join(work, 'render.ps1'), `param([string]$Work)
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice('Microsoft Zira Desktop')
$synth.Rate = 3
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
try {
  foreach ($memory in (Get-Content -Raw -LiteralPath (Join-Path $Work 'memories.json') | ConvertFrom-Json)) {
    $synth.SetOutputToWaveFile((Join-Path $Work ($memory.id + '.wav')), $format)
    $synth.Speak($memory.transcript)
  }
} finally { $synth.Dispose() }
`);
  execFileSync('powershell.exe', ['-NoProfile', '-File', path.join(work, 'render.ps1'), '-Work', work]);
  const manifest = RESONANCE_MEMORY_FRAGMENTS.map(memory => {
    const wav = fs.readFileSync(path.join(work, `${memory.id}.wav`));
    let pcm: Buffer | undefined;
    for (let offset = 12; offset + 8 <= wav.length;) {
      const size = wav.readUInt32LE(offset + 4);
      if (wav.toString('ascii', offset, offset + 4) === 'data') pcm = wav.subarray(offset + 8, offset + 8 + size);
      offset += 8 + size + (size % 2);
    }
    if (!pcm?.length) throw new Error(`No PCM: ${memory.id}`);
    // Remove synthesized trailing silence before fitting the complete phrase into two seconds.
    let frames = pcm.length / 2;
    while (frames > 1 && Math.abs(pcm.readInt16LE((frames - 1) * 2)) < 80) frames--;
    frames = Math.min(pcm.length / 2, frames + 1102);
    const count = 44100, result = Buffer.alloc(44 + count * 2);
    result.write('RIFF'); result.writeUInt32LE(result.length - 8, 4); result.write('WAVEfmt ', 8);
    result.writeUInt32LE(16, 16); result.writeUInt16LE(1, 20); result.writeUInt16LE(1, 22);
    result.writeUInt32LE(22050, 24); result.writeUInt32LE(44100, 28); result.writeUInt16LE(2, 32); result.writeUInt16LE(16, 34);
    result.write('data', 36); result.writeUInt32LE(count * 2, 40);
    const ratio = Math.max(1, frames / count);
    for (let i = 0; i < count; i++) {
      const source = i * ratio, a = Math.floor(source), b = Math.min(frames - 1, a + 1);
      const value = a < frames ? pcm.readInt16LE(a * 2) * (1 - source + a) + pcm.readInt16LE(b * 2) * (source - a) : 0;
      result.writeInt16LE(Math.round(value), 44 + i * 2);
    }
    fs.writeFileSync(path.join(output, `${memory.id}.wav`), result);
    return { id: memory.id, citizenId: memory.citizenId, transcript: memory.transcript, durationMs: memory.durationMs, sha256: crypto.createHash('sha256').update(result).digest('hex') };
  });
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ source: 'Original CRACKUP transcripts rendered with installed Microsoft Zira Desktop speech synthesis; synthetic voices, not actor recordings.', generator: 'scripts/build-lore-voices.ts', entries: manifest }, null, 2) + '\n');
} finally { fs.rmSync(work, { recursive: true, force: true }); }
