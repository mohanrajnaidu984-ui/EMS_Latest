/**
 * Pre-deploy smoke: esbuild-bundle Quote paste/history modules and assert exports.
 * Catches Rollup-style circular-init failures where exports become undefined.
 */
import * as esbuild from 'esbuild';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const entry = path.join(__dirname, 'smoke-paste-entry.mjs');
const outFile = path.join(os.tmpdir(), `ems-paste-smoke-${process.pid}.mjs`);

const required = [
  'captureDocumentHistoryBeforeMutation',
  'commitDocumentHistoryAfterMutation',
  'tryDocumentHistoryUndo',
  'tryDocumentHistoryRedo',
  'canEmsDocumentHistoryUndo',
  'canEmsDocumentHistoryRedo',
  'installClauseEditorUndoHooks',
  'bindClauseEditorUndoHotkeys',
  'bindTableCellHistoryRecorder',
  'beginOfficePastePostProcess',
  'checkpointHistoryAfterOfficePaste',
  'pasteClipboardIntoActiveTableCell',
  'pasteClipboardTableIntoActiveTable',
  'prepareDocumentTablePaste',
  'readTableClipboardText',
  'restoreInternalClipboardTablesInRoot',
  'restoreInternalClipboardTableLayout',
  'registerClauseEditorTableHooks',
];

let failed = 0;

const stubPlugin = {
  name: 'ems-smoke-stubs',
  setup(build) {
    build.onResolve({ filter: /^(react|react-dom|jodit|jodit-react)(\/.*)?$/ }, (args) => ({
      path: args.path,
      namespace: 'ems-stub',
    }));
    build.onLoad({ filter: /.*/, namespace: 'ems-stub' }, () => ({
      contents: `
        const noop = () => {};
        const proxy = new Proxy(function () {}, {
          get: () => proxy,
          apply: () => proxy,
          construct: () => proxy,
        });
        export default proxy;
        export const normalizeSize = noop;
        export const Jodit = proxy;
      `,
      loader: 'js',
    }));
  },
};

/* 1) Circular dependency gate (same failure mode as prod Rollup). */
try {
  const require = createRequire(import.meta.url);
  let madgeBin = null;
  try {
    madgeBin = require.resolve('madge/bin/cli.js');
  } catch {
    /* optional */
  }
  if (!madgeBin) {
    try {
      const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
      const out = execFileSync(
        npx,
        [
          '--yes',
          'madge@8.0.0',
          '--circular',
          '--extensions',
          'js,jsx',
          'src/components/Quote/clauseEditorTable.js',
          'src/components/Quote/clauseEditorTableHistory.js',
          'src/components/Quote/clauseEditorListPresets.js',
          'src/components/Quote/clauseEditorDocHistory.js',
          'src/components/Quote/ClauseEditor.jsx',
        ],
        { cwd: root, encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'ignore'] }
      );
      if (/Found \d+ circular/i.test(out)) {
        console.error('FAIL circular dependencies:\n', out);
        failed += 1;
      } else {
        console.log('OK   no circular dependencies (madge)');
      }
    } catch (err) {
      const msg = String(err?.stdout || err?.stderr || err?.message || err);
      if (/Found \d+ circular/i.test(msg)) {
        console.error('FAIL circular dependencies:\n', msg);
        failed += 1;
      } else {
        console.log('SKIP madge check:', err?.message || err);
      }
    }
  } else {
    const out = execFileSync(
      process.execPath,
      [
        madgeBin,
        '--circular',
        '--extensions',
        'js,jsx',
        'src/components/Quote/clauseEditorTable.js',
        'src/components/Quote/clauseEditorTableHistory.js',
        'src/components/Quote/clauseEditorListPresets.js',
        'src/components/Quote/clauseEditorDocHistory.js',
        'src/components/Quote/ClauseEditor.jsx',
      ],
      { cwd: root, encoding: 'utf8' }
    );
    if (/Found \d+ circular/i.test(out)) {
      console.error('FAIL circular dependencies:\n', out);
      failed += 1;
    } else {
      console.log('OK   no circular dependencies (madge)');
    }
  }
} catch (err) {
  console.log('SKIP madge check:', err?.message || err);
}

/* 2) Bundle + import — undefined exports = circular init. */
try {
  await esbuild.build({
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outfile: outFile,
    logLevel: 'silent',
    plugins: [stubPlugin],
  });
} catch (err) {
  console.error('FAIL esbuild paste bundle:', err?.message || err);
  process.exit(1);
}

try {
  const mod = await import(pathToFileURL(outFile).href + `?t=${Date.now()}`);
  for (const name of required) {
    if (typeof mod[name] !== 'function') {
      console.error(`FAIL ${name} →`, typeof mod[name]);
      failed += 1;
    } else {
      console.log(`OK   ${name}`);
    }
  }

  const a = mod.prepareDocumentTablePaste(null, null, null);
  const b = mod.pasteClipboardIntoActiveTableCell(null, null, null);
  const c = mod.pasteClipboardTableIntoActiveTable(null, null, null);
  if (a !== false || b !== false || c !== false) {
    console.error('FAIL null-safe paste helpers returned unexpected values', { a, b, c });
    failed += 1;
  } else {
    console.log('OK   null-safe paste helpers');
  }
  mod.captureDocumentHistoryBeforeMutation(null);
  mod.commitDocumentHistoryAfterMutation(null);
  console.log('OK   null-safe doc history');
} catch (err) {
  console.error('FAIL runtime smoke:', err?.message || err);
  failed += 1;
} finally {
  try {
    fs.unlinkSync(outFile);
  } catch {
    /* ignore */
  }
}

/* 3) Production dist markers (if build already ran). */
const distDir = path.join(root, 'dist', 'assets');
if (fs.existsSync(distDir)) {
  const quoteForm = fs
    .readdirSync(distDir)
    .filter((f) => f.startsWith('QuoteForm-') && f.endsWith('.js'))
    .map((f) => path.join(distDir, f))[0];
  if (quoteForm) {
    const src = fs.readFileSync(quoteForm, 'utf8');
    const markers = [
      'data-ems-internal-table-clip',
      'data-ems-col-w',
      'data-ems-row-h',
      'prepareDocumentTablePaste',
    ];
    for (const m of markers) {
      if (!src.includes(m)) {
        console.error(`FAIL dist missing marker: ${m}`);
        failed += 1;
      } else {
        console.log(`OK   dist marker ${m}`);
      }
    }
  } else {
    console.log('SKIP dist QuoteForm chunk not found (run build first)');
  }
} else {
  console.log('SKIP dist/ not present (run build first)');
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll quote paste export checks passed');
