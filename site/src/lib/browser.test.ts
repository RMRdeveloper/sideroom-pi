import assert from 'node:assert/strict';
import test from 'node:test';
import { copyFor, LOCALES } from '../i18n/index.ts';

for (const locale of LOCALES) {
  test(`${locale}: browser copy explains selection, pairing and manual installation`, () => {
    const copy = copyFor(locale);
    const browser = copy.browser;
    assert.ok(copy.masthead.nav.browser);
    assert.ok(copy.inside.tools.some((tool) => tool.name === 'visual-context'));
    assert.match(
      browser.rows.map((row) => row.body).join(' '),
      /Alt\+Shift\+S/u,
    );
    assert.match(browser.rows.map((row) => row.body).join(' '), /Escape/u);
    assert.match(browser.installSteps.join(' '), /manifest\.json/u);
    assert.match(browser.installSteps.join(' '), /F7/u);
    assert.match(browser.installSteps.join(' '), /chrome:\/\/extensions/u);
    assert.match(browser.installSteps.join(' '), /edge:\/\/extensions/u);
    assert.match(browser.updateNote, /manual/u);
    assert.match(browser.downloadNote, /116/u);
    assert.match(browser.downloadNote, /Chrome/u);
    assert.match(browser.downloadNote, /Firefox/u);
  });

  test(`${locale}: both browser images describe what they show`, () => {
    const browser = copyFor(locale).browser;
    assert.ok(browser.selectionAlt.length > 20);
    assert.ok(browser.popupAlt.length > 20);
    assert.match(browser.selectionCaption, /Escape/u);
    assert.match(browser.popupCaption, /shortcut|atajo/u);
  });
}
