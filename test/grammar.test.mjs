import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import textmate from 'vscode-textmate';
import oniguruma from 'vscode-oniguruma';

await oniguruma.loadWASM(await readFile(new URL('../node_modules/vscode-oniguruma/release/onig.wasm', import.meta.url)));
const registry = new textmate.Registry({
  onigLib: Promise.resolve({ createOnigScanner: patterns => new oniguruma.OnigScanner(patterns), createOnigString: source => new oniguruma.OnigString(source) }),
  loadGrammar: async () => textmate.parseRawGrammar(await readFile(new URL('../syntaxes/ason.tmLanguage.json', import.meta.url), 'utf8'), 'ason.json')
});
const grammar = await registry.loadGrammar('source.ason');
function tokenize(source) {
  let state = textmate.INITIAL;
  return source.split('\n').map(line => {
    const result = grammar.tokenizeLine(line, state);
    state = result.ruleStack;
    return result.tokens.map(token => ({ text: line.slice(token.startIndex, token.endIndex), scopes: token.scopes }));
  });
}
function scoped(source, text, scope) {
  const tokens = tokenize(source).flat();
  assert.ok(tokens.some(token => token.text.includes(text) && token.scopes.includes(scope)), JSON.stringify(tokens));
}

test('numbers, suffixes, bases and boundary spellings', () => {
  for (const number of ['123_456_u64', '0x54321_f32', '0x1.8p+2_f64', '0X_FF_u8', '0b_101_u32', '0o755', '1.0e-3_f32', 'NaN_f64', 'Inf']) {
    scoped(`[${number}]`, number, 'constant.numeric.ason');
  }
  const tokens = tokenize('{trueish: NaNvalue}').flat();
  assert.ok(!tokens.some(token => token.scopes.includes('constant.numeric.ason') || token.scopes.includes('constant.language.boolean.ason')));
});
test('nested comments retain outer state', () => {
  scoped('/* outer /* nested */\nstill outer */ 42', 'still outer', 'comment.block.ason');
  scoped('/* outer /* nested */\nstill outer */ 42', '42', 'constant.numeric.ason');
  scoped('// /* no nesting\ntrue', 'true', 'constant.language.boolean.ason');
});
test('raw hash delimiters match arbitrary opening hash count', () => {
  scoped('r###"one "## two\nthree"### true', 'three', 'string.quoted.double.raw.ason');
  scoped('r###"one "## two\nthree"### true', 'true', 'constant.language.boolean.ason');
  scoped('r"\\n"', '\\n', 'string.quoted.double.raw.ason');
});
test('trimmed strings do not process escapes or inline triple quotes', () => {
  const source = '"""\n  a """ \\x\n  b\n""" true';
  scoped(source, 'b', 'string.quoted.triple.ason');
  scoped(source, 'true', 'constant.language.boolean.ason');
});
test('unfinished strings/comments stay scoped on following lines', () => {
  scoped('"unfinished\nnext', 'next', 'string.quoted.double.ason');
  scoped('/* unfinished\nnext', 'next', 'comment.block.ason');
  scoped('r##"unfinished\nnext', 'next', 'string.quoted.double.raw.ason');
});
test('Unicode names, enum variants and specialized literals', () => {
  scoped('{中文: 类型::选项}', '中文', 'variable.other.property.ason');
  scoped('😀::值', '😀', 'entity.name.type.enum.ason');
  scoped('Type::Variant', 'Variant', 'constant.other.enum.ason');
  scoped('d"2024-03-16"', '2024', 'constant.other.datetime.ason');
  scoped('h"48 65"', '48', 'constant.other.bytes.ason');
  scoped("'中'", '中', 'string.quoted.single.ason');
});
test('normal escapes and unsupported escape sequences', () => {
  scoped('"a\\u{1f600}\\n"', '\\u{1f600}', 'constant.character.escape.ason');
  scoped('"a\\x41"', '\\x', 'invalid.illegal.escape.ason');
});