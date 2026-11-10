// playwright-core from node_modules if present, else PLAYWRIGHT_CORE, else the copy this was first rendered with.
const { chromium } = (() => { try { return require('playwright-core'); } catch { return require(process.env.PLAYWRIGHT_CORE || '/Users/supabowl/organized-ai-course/node_modules/playwright-core'); } })();
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const FPS = 30, DIR = __dirname;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto('file://' + DIR + '/scenes.html'); await p.waitForTimeout(800);
  const durs = await p.evaluate(() => window.DURS);
  const files = [];
  for (let si = 0; si < durs.length; si++) {
    const out = `${DIR}/s${si}.mp4`, tmp = `${DIR}/s${si}.tmp.mp4`;
    const n = Math.round(durs[si] * FPS);
    const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), tmp]);
    const done = new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg ' + c))));
    for (let f = 0; f < n; f++) {
      await p.evaluate(([s, t]) => window.render(s, t), [si, f / FPS]);
      const buf = await p.screenshot({ type: 'jpeg', quality: 92 });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    }
    ff.stdin.end(); await done; fs.renameSync(tmp, out); files.push(out);
    console.log(`scene ${si} done (${n} frames)`);
  }
  // poster: install scene, fully revealed
  await p.evaluate(() => window.render(0, 4)); await p.screenshot({ path: DIR + '/poster.jpg', type: 'jpeg', quality: 88 });
  await b.close();
  fs.writeFileSync(DIR + '/list.txt', files.map(f => `file '${f}'`).join('\n'));
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', DIR + '/list.txt', '-c', 'copy', DIR + '/video.mp4']);
  // voiceover: each line starts 0.5s into its scene
  let start = 0; const inputs = [], filt = [];
  durs.forEach((d, i) => { inputs.push('-i', `${DIR}/vo/l${i}.aiff`); const ms = Math.round((start + 0.5) * 1000); filt.push(`[${i + 1}:a]aresample=48000,adelay=${ms}:all=1[a${i}]`); start += d; });
  const mix = filt.join(';') + ';' + durs.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${durs.length}:normalize=0,pan=stereo|c0=c0|c1=c0,apad[aout]`;
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', DIR + '/video.mp4', ...inputs, '-filter_complex', mix, '-map', '0:v', '-map', '[aout]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', DIR + '/demo.tmp.mp4']);
  fs.renameSync(DIR + '/demo.tmp.mp4', DIR + '/demo.mp4');
  console.log('DONE', fs.statSync(DIR + '/demo.mp4').size);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
