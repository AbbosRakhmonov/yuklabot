const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { materialPreview } = require("../src/dashboard/materialPreview");
const { getDashboardHtml } = require("../src/dashboard/dashboardView");

test("preview uses platform embed URLs and falls back on unsupported sources", () => {
  assert.equal(materialPreview("https://www.youtube.com/shorts/abcdefghijk"), "https://www.youtube-nocookie.com/embed/abcdefghijk");
  assert.equal(materialPreview("https://instagram.com/reel/abc_12/?igsh=123"), "https://www.instagram.com/reel/abc_12/embed/");
  assert.equal(materialPreview("https://www.tiktok.com/@sample/video/1234"), "https://www.tiktok.com/player/v1/1234");
  for (const url of ["https://vm.tiktok.com/test", "https://instagram.com/stories/sample/42",
    "invalid", "javascript:alert(1)", "https://youtube.com.example.com/watch?v=abcdefghijk"]) {
    assert.equal(materialPreview(url), null);
  }
});

test("dashboard inline scripts parse with history and preview controls", () => {
  const html = getDashboardHtml();
  assert.match(html, /id="previewDialog"/);
  for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
});
