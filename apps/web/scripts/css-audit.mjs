#!/usr/bin/env node
/**
 * Audits every .css file under apps/web/src for CSS rot:
 *
 *   1. UNUSED CLASS SELECTORS   - classes referenced only in CSS, never in
 *      any .ts/.tsx/.html under apps/web/src (or apps/web/index.html),
 *      accounting for dynamically-built class names (template literals /
 *      string concatenation).
 *   2. SAME-CONTEXT DUPLICATE SELECTORS - the exact same selector text
 *      appearing more than once inside the same context (top level of a
 *      file, or the same @media/@supports block by its exact condition
 *      text, within one file).
 *   3. OVERRIDDEN DECLARATIONS ACROSS IDENTICAL @media BLOCKS - two
 *      separate @media blocks (same file) whose conditions are
 *      byte-identical; a selector+property declared in the earlier block
 *      and again in the later one is dead in the earlier block.
 *   4. SELECTOR OWNED BY MULTIPLE FILES - a class selector with rules in
 *      more than one stylesheet (excluding cards.css, which exclusively
 *      owns `.playing-card*` and nothing else may touch those anyway).
 *      Cross-file cascade order would then matter, which the CSS split is
 *      designed to make impossible.
 *
 * Usage:
 *   node scripts/css-audit.mjs [--allow-unused=foo,bar] [--json]
 *
 * Exit code: 1 if any finding is reported (after --allow-unused filtering),
 * 0 otherwise.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const allowUnused = new Set(
  args
    .filter((a) => a.startsWith('--allow-unused='))
    .flatMap((a) => a.slice('--allow-unused='.length).split(','))
    .map((s) => s.trim())
    .filter(Boolean),
);

// ---------------------------------------------------------------------------
// Comment stripping (preserves line numbers)
// ---------------------------------------------------------------------------

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (match) =>
    match.replace(/[^\n]/g, ' '),
  );
}

// ---------------------------------------------------------------------------
// Minimal CSS parser: brace-depth walk over the (comment-stripped) text.
// Produces a tree of frames:
//   { kind: 'root', children: [...] }
//   { kind: 'atrule', header, startLine, children: [...] }
//   { kind: 'rule', selector, startLine, declarations: [{ prop, value, text, line }] }
// No CSS nesting (&) is used in this codebase, so rule frames never nest
// further; at-rule frames (@media/@supports/@keyframes/...) may contain
// rule frames one level deep.
// ---------------------------------------------------------------------------

function parseCss(text) {
  const root = { kind: 'root', children: [] };
  const stack = [root];
  let current = root;

  let buf = '';
  let bufFirstLine = null;
  let line = 1;

  const flushDeclaration = (endLine) => {
    const decl = buf.trim();
    buf = '';
    if (current.kind === 'rule' && decl) {
      const colonIdx = decl.indexOf(':');
      const prop = colonIdx === -1 ? decl : decl.slice(0, colonIdx).trim();
      const value =
        colonIdx === -1 ? '' : decl.slice(colonIdx + 1).trim();
      current.declarations.push({
        prop,
        value,
        text: decl,
        line: bufFirstLine ?? endLine,
      });
    }
    bufFirstLine = null;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') {
      line++;
      buf += ch;
      continue;
    }
    if (ch === '{') {
      const header = buf.trim();
      buf = '';
      const startLine = bufFirstLine ?? line;
      bufFirstLine = null;
      let frame;
      if (header.startsWith('@')) {
        frame = { kind: 'atrule', header, startLine, children: [] };
      } else {
        frame = { kind: 'rule', selector: header, startLine, declarations: [] };
      }
      if (current.children) current.children.push(frame);
      stack.push(frame);
      current = frame;
      continue;
    }
    if (ch === '}') {
      // flush a trailing declaration without a terminating ';'
      if (current.kind === 'rule') flushDeclaration(line);
      buf = '';
      bufFirstLine = null;
      stack.pop();
      current = stack[stack.length - 1] ?? root;
      continue;
    }
    if (ch === ';') {
      if (current.kind === 'rule') {
        flushDeclaration(line);
      } else {
        buf = '';
        bufFirstLine = null;
      }
      continue;
    }
    if (!/\s/.test(ch) && bufFirstLine === null) bufFirstLine = line;
    buf += ch;
  }

  return root;
}

const normalizeSelector = (s) => s.replace(/\s+/g, ' ').trim();

function atRuleType(header) {
  const m = /^@([\w-]+)/.exec(header);
  return m ? m[1].toLowerCase() : '';
}

function atRuleCondition(header, type) {
  return header.slice(type.length + 1).trim();
}

// ---------------------------------------------------------------------------
// Walk a parsed file, collecting:
//   - all rule frames with their context key (per-file, top level or
//     @media/@supports condition)
//   - all class tokens appearing in selector text (for unused-class check)
// ---------------------------------------------------------------------------

function collectContexts(root, file) {
  /** @type {{contextKey: string, kind: 'top'|'media'|'supports', condition: string|null, rule: object}[]} */
  const entries = [];
  /** @type {{header: string, condition: string, startLine: number, rules: object[]}[]} */
  const mediaBlocks = [];

  const walkTop = (frame) => {
    for (const child of frame.children ?? []) {
      if (child.kind === 'rule') {
        entries.push({
          contextKey: `${file}::TOP`,
          kind: 'top',
          condition: null,
          rule: child,
        });
      } else if (child.kind === 'atrule') {
        const type = atRuleType(child.header);
        if (type === 'media' || type === 'supports') {
          const condition = atRuleCondition(child.header, type);
          const rules = (child.children ?? []).filter((c) => c.kind === 'rule');
          for (const rule of rules) {
            entries.push({
              contextKey: `${file}::${type}::${condition}`,
              kind: type,
              condition,
              rule,
            });
          }
          if (type === 'media') {
            mediaBlocks.push({
              header: child.header,
              condition,
              startLine: child.startLine,
              rules,
            });
          }
        }
        // @keyframes and other at-rules: not part of the duplicate-selector
        // / override checks (their "selectors" are keyframe stops, not
        // CSS class selectors, and the spec scopes this to top-level and
        // @media/@supports contexts).
      }
    }
  };

  walkTop(root);
  return { entries, mediaBlocks };
}

function collectClassTokensFromSelector(selector) {
  const out = new Set();
  const re = /\.([a-zA-Z_][\w-]*)/g;
  let m;
  while ((m = re.exec(selector))) out.add(m[0]); // keep leading dot for readability of prefix building below, stripped later
  return out;
}

// ---------------------------------------------------------------------------
// Subject-class extraction for finding 4 (cross-file ownership). Unlike
// collectClassTokensFromSelector above (which is deliberately broad, for
// "is this class referenced anywhere" in finding 1), this narrows to the
// class(es) actually being styled: per the split's own tie-break rules,
// only the FIRST comma-separated selector decides a rule's file, and within
// it only the class(es) in the rightmost compound that has any (falling
// back leftward through compounds with none), with any parenthesized
// pseudo-class argument (:has(...), :not(...)) stripped first so a class
// merely being TESTED FOR (not styled) isn't mistaken for the subject.
// ---------------------------------------------------------------------------

function splitTopLevelByComma(selector) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of selector) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

function splitIntoCompounds(selector) {
  const parts = [];
  let depthP = 0;
  let depthB = 0;
  let cur = '';
  for (const ch of selector) {
    if (ch === '(') depthP++;
    else if (ch === ')') depthP--;
    else if (ch === '[') depthB++;
    else if (ch === ']') depthB--;
    if (depthP === 0 && depthB === 0 && (ch === '>' || ch === '+' || ch === '~' || /\s/.test(ch))) {
      if (cur.trim()) parts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function stripParenGroups(s) {
  let out = '';
  let depth = 0;
  for (const ch of s) {
    if (ch === '(') { depth++; continue; }
    if (ch === ')') { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0) out += ch;
  }
  return out;
}

function subjectClassesOfFirstSelector(selector) {
  const first = splitTopLevelByComma(selector)[0]?.trim() ?? '';
  const compounds = splitIntoCompounds(first);
  for (let i = compounds.length - 1; i >= 0; i--) {
    const outsideParens = stripParenGroups(compounds[i]);
    const classes = outsideParens.match(/\.[a-zA-Z_][\w-]*/g);
    if (classes && classes.length > 0) return classes.map((c) => c.slice(1));
  }
  return [];
}

// ---------------------------------------------------------------------------
// Source scanning (for unused-class detection)
// ---------------------------------------------------------------------------

const SRC_EXT_RE = /\.(tsx?|jsx?|html)$/;

function walkSourceFiles(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSourceFiles(p, acc);
    } else if (SRC_EXT_RE.test(entry.name)) {
      acc.push(p);
    }
  }
  return acc;
}

// Every .css file under apps/web/src, named relative to webRoot (e.g.
// "src/styles.css", "src/styles/board.css"), sorted for stable output.
function walkCssFiles(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkCssFiles(p, acc);
    } else if (entry.name.endsWith('.css')) {
      acc.push(p);
    }
  }
  return acc;
}

function findCssFiles() {
  const srcDir = path.join(webRoot, 'src');
  return walkCssFiles(srcDir, [])
    .sort()
    .map((abs) => ({ name: path.relative(webRoot, abs), abs }));
}

function loadSourceText() {
  const srcDir = path.join(webRoot, 'src');
  const files = walkSourceFiles(srcDir, []);
  const indexHtml = path.join(webRoot, 'index.html');
  if (fs.existsSync(indexHtml)) files.push(indexHtml);
  return files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
}

// Extract the substrings of source that actually build a `className`, so the
// dynamic-prefix scan below only looks at expressions that produce CSS class
// names. Scanning the whole file for any `[\w-]+-${` template would also
// catch unrelated dash-joined template literals that happen to share a
// prefix with a real (and genuinely dead) CSS class - e.g. deckReference.ts's
// `property-${card.color}-${card.name}` asset-id builder, which is not a
// className but would otherwise "explain away" a dead `.property-set-view__*`
// class purely because it also starts with "property-".
function extractClassExpressions(src) {
  const spans = [];

  const captureBalanced = (text, openIdx, openCh, closeCh) => {
    let depth = 0;
    for (let i = openIdx; i < text.length; i++) {
      if (text[i] === openCh) depth++;
      else if (text[i] === closeCh) {
        depth--;
        if (depth === 0) return text.slice(openIdx + 1, i);
      }
    }
    return text.slice(openIdx + 1);
  };

  // JSX attribute: className={ ... }
  const jsxRe = /className\s*=\s*\{/g;
  let m;
  while ((m = jsxRe.exec(src))) {
    spans.push(captureBalanced(src, m.index + m[0].length - 1, '{', '}'));
  }

  // Variable assignment: const/let className|cls|classes|classNames = ...;
  const varRe = /\b(?:const|let)\s+(?:className|cls|classes|classNames)\s*=\s*/g;
  while ((m = varRe.exec(src))) {
    const start = m.index + m[0].length;
    let depth = 0;
    let end = src.length;
    for (let i = start; i < src.length; i++) {
      const ch = src[i];
      if (ch === '{' || ch === '(' || ch === '[') depth++;
      else if (ch === '}' || ch === ')' || ch === ']') depth--;
      else if (ch === ';' && depth <= 0) {
        end = i;
        break;
      }
    }
    spans.push(src.slice(start, end));
  }

  return spans.join('\n');
}

// Dynamic class-name prefixes: template literals like
// `playing-card--attn-${x}` or `game-prompt--${placement}`, and string
// concatenations like 'foo--' + x. Scoped to class-building expressions
// only (see extractClassExpressions) so unrelated dash-joined template
// literals elsewhere in the source can't mask a genuinely dead CSS class.
function collectDynamicPrefixes(src) {
  const prefixes = new Set();
  const classSrc = extractClassExpressions(src);

  // Backtick templates: any run of [\w-]+-${  inside a template literal.
  const templateRe = /([\w-]+-)\$\{/g;
  let m;
  while ((m = templateRe.exec(classSrc))) prefixes.add(m[1]);

  // String concatenation: 'foo--' + or "foo--" +
  const concatRe = /['"]([\w-]+-)['"]\s*\+/g;
  while ((m = concatRe.exec(classSrc))) prefixes.add(m[1]);

  return prefixes;
}

function isClassUsed(className, src, dynamicPrefixes) {
  const escaped = className.replace(/[-]/g, '\\-');
  const exactRe = new RegExp('(^|[^\\w-])' + escaped + '([^\\w-]|$)');
  if (exactRe.test(src)) return { used: true, reason: 'literal' };

  for (const prefix of dynamicPrefixes) {
    if (className.startsWith(prefix)) {
      return { used: true, reason: `dynamic prefix "${prefix}"` };
    }
  }
  return { used: false };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const files = findCssFiles();

  const findings = {
    unusedClasses: [],
    duplicateSelectors: [],
    overriddenDeclarations: [],
    multiFileSelectors: [],
  };

  // --- gather class selectors across both files, and parse trees ---------
  const allClassTokens = new Map(); // className -> [{file, line}]
  // className -> Map(file -> [line, ...]), excluding cards.css, for finding 4
  const classOwnership = new Map();
  const parsedFiles = [];

  for (const f of files) {
    const raw = fs.readFileSync(f.abs, 'utf8');
    const stripped = stripComments(raw);
    const root = parseCss(stripped);
    parsedFiles.push({ file: f.name, root });

    const { entries, mediaBlocks } = collectContexts(root, f.name);

    // classes referenced anywhere in a selector, for unused-class check
    for (const { rule } of entries) {
      const tokens = collectClassTokensFromSelector(rule.selector);
      for (const tok of tokens) {
        const className = tok.slice(1); // strip leading '.'
        if (/^\d/.test(className)) continue;
        if (!allClassTokens.has(className)) allClassTokens.set(className, []);
        allClassTokens.get(className).push({ file: f.name, line: rule.startLine });
      }

      // Finding 4: cross-file ownership, excluding cards.css (it
      // exclusively owns `.playing-card*` by a separate, dedicated audit).
      // Narrowed to the actual STYLED subject class(es) of the rule (see
      // subjectClassesOfFirstSelector) rather than every class token that
      // merely appears in the selector: a class named only as ancestor
      // context (e.g. `.app:has(.game-prompt) .opponent-spotlight`) or as a
      // later, non-tie-break selector in a comma list isn't "owned" by this
      // file just for being mentioned.
      if (f.name !== 'src/cards.css') {
        const subjectClasses = subjectClassesOfFirstSelector(rule.selector);
        for (const className of subjectClasses) {
          if (/^\d/.test(className)) continue;
          if (!classOwnership.has(className)) classOwnership.set(className, new Map());
          const byFile = classOwnership.get(className);
          if (!byFile.has(f.name)) byFile.set(f.name, []);
          byFile.get(f.name).push(rule.startLine);
        }
      }
    }

    // --- SAME-CONTEXT DUPLICATE SELECTORS -------------------------------
    const byContext = new Map(); // contextKey -> Map(normalizedSelector -> occurrences[])
    for (const { contextKey, rule } of entries) {
      const norm = normalizeSelector(rule.selector);
      if (!byContext.has(contextKey)) byContext.set(contextKey, new Map());
      const sel2occ = byContext.get(contextKey);
      if (!sel2occ.has(norm)) sel2occ.set(norm, []);
      sel2occ.get(norm).push(rule);
    }
    for (const [contextKey, sel2occ] of byContext) {
      for (const [selector, occurrences] of sel2occ) {
        if (occurrences.length > 1) {
          findings.duplicateSelectors.push({
            file: f.name,
            context: contextKey,
            selector,
            occurrences: occurrences.map((r) => r.startLine),
          });
        }
      }
    }

    // --- OVERRIDDEN DECLARATIONS ACROSS IDENTICAL @media BLOCKS ---------
    const byCondition = new Map(); // condition -> mediaBlock[]
    for (const block of mediaBlocks) {
      if (!byCondition.has(block.condition)) byCondition.set(block.condition, []);
      byCondition.get(block.condition).push(block);
    }
    for (const [condition, blocks] of byCondition) {
      if (blocks.length < 2) continue;
      blocks.sort((a, b) => a.startLine - b.startLine);
      // last-seen line for each selector+property, updated as we sweep
      // blocks in source order so chains of overrides are all reported.
      const lastSeen = new Map(); // "selector prop" -> line
      for (const block of blocks) {
        // within one block, only the LAST declaration of a given
        // selector+prop is what survives to compare forward, but since we
        // only care whether a selector+prop reappears in a later block at
        // all, use every declaration.
        const seenInThisBlock = new Set();
        for (const rule of block.rules) {
          const selector = normalizeSelector(rule.selector);
          for (const decl of rule.declarations) {
            const key = selector + ' ' + decl.prop;
            const prevLine = lastSeen.get(key);
            if (prevLine !== undefined) {
              findings.overriddenDeclarations.push({
                file: f.name,
                condition,
                selector,
                property: decl.prop,
                earlier: { line: prevLine },
                later: { line: decl.line },
              });
            }
            seenInThisBlock.add(key);
          }
        }
        for (const key of seenInThisBlock) lastSeen.set(key, blockLineFor(key, block));
      }
    }
  }

  // --- UNUSED CLASS SELECTORS --------------------------------------------
  const src = loadSourceText();
  const dynamicPrefixes = collectDynamicPrefixes(src);

  for (const [className, occurrences] of allClassTokens) {
    if (allowUnused.has(className)) continue;
    const { used } = isClassUsed(className, src, dynamicPrefixes);
    if (!used) {
      findings.unusedClasses.push({
        className,
        occurrences: occurrences.map((o) => `${o.file}:${o.line}`),
      });
    }
  }
  findings.unusedClasses.sort((a, b) => a.className.localeCompare(b.className));

  // --- SELECTOR OWNED BY MULTIPLE FILES -----------------------------------
  for (const [className, byFile] of classOwnership) {
    if (byFile.size > 1) {
      findings.multiFileSelectors.push({
        className,
        occurrences: [...byFile.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .flatMap(([file, lines]) => lines.map((line) => `${file}:${line}`)),
      });
    }
  }
  findings.multiFileSelectors.sort((a, b) => a.className.localeCompare(b.className));

  // --- report ---------------------------------------------------------
  const totalFindings =
    findings.unusedClasses.length +
    findings.duplicateSelectors.length +
    findings.overriddenDeclarations.length +
    findings.multiFileSelectors.length;

  if (jsonOutput) {
    console.log(JSON.stringify(findings, null, 2));
  } else {
    printHumanSummary(findings);
  }

  process.exit(totalFindings > 0 ? 1 : 0);
}

// Declarations within a single rule frame may repeat the same property
// (last one wins per normal CSS cascade); we want the LINE of the last
// occurrence of that property within the block as the "line in this
// block" for override-chaining purposes.
function blockLineFor(key, block) {
  const [selector, prop] = key.split(' ');
  let line;
  for (const rule of block.rules) {
    if (normalizeSelector(rule.selector) !== selector) continue;
    for (const decl of rule.declarations) {
      if (decl.prop === prop) line = decl.line;
    }
  }
  return line;
}

function printHumanSummary(findings) {
  console.log('CSS audit: every .css file under apps/web/src');
  console.log('='.repeat(72));

  console.log(`\n1) UNUSED CLASS SELECTORS (${findings.unusedClasses.length})`);
  if (findings.unusedClasses.length === 0) {
    console.log('   none');
  } else {
    for (const u of findings.unusedClasses) {
      console.log(`   .${u.className}`);
      for (const occ of u.occurrences) console.log(`       ${occ}`);
    }
  }

  console.log(
    `\n2) SAME-CONTEXT DUPLICATE SELECTORS (${findings.duplicateSelectors.length})`,
  );
  if (findings.duplicateSelectors.length === 0) {
    console.log('   none');
  } else {
    for (const d of findings.duplicateSelectors) {
      console.log(`   ${d.selector}  [${d.context}]`);
      for (const line of d.occurrences) console.log(`       ${d.file}:${line}`);
    }
  }

  console.log(
    `\n3) OVERRIDDEN DECLARATIONS ACROSS IDENTICAL @media BLOCKS (${findings.overriddenDeclarations.length})`,
  );
  if (findings.overriddenDeclarations.length === 0) {
    console.log('   none');
  } else {
    for (const o of findings.overriddenDeclarations) {
      console.log(
        `   ${o.selector} { ${o.property} }  @media ${o.condition}`,
      );
      console.log(`       dead:      ${o.file}:${o.earlier.line}`);
      console.log(`       overrides: ${o.file}:${o.later.line}`);
    }
  }

  console.log(
    `\n4) SELECTOR OWNED BY MULTIPLE FILES (${findings.multiFileSelectors.length})`,
  );
  if (findings.multiFileSelectors.length === 0) {
    console.log('   none');
  } else {
    for (const m of findings.multiFileSelectors) {
      console.log(`   .${m.className}`);
      for (const occ of m.occurrences) console.log(`       ${occ}`);
    }
  }

  const total =
    findings.unusedClasses.length +
    findings.duplicateSelectors.length +
    findings.overriddenDeclarations.length +
    findings.multiFileSelectors.length;
  console.log('\n' + '='.repeat(72));
  console.log(`TOTAL findings: ${total}`);
}

main();
