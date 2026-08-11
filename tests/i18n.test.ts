import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { LOCALE_STORAGE_KEY, createDomI18n, createI18n, resolveLocale, translate, zhCNMessages } from "../public/i18n.js";

describe("WebUI i18n", () => {
  test("resolves an explicit language before the system language", () => {
    expect(resolveLocale("zh-CN", ["en-US"])).toBe("zh-CN");
    expect(resolveLocale("en", ["zh-CN"])).toBe("en");
    expect(resolveLocale("system", ["zh-Hans-CN", "en"])).toBe("zh-CN");
    expect(resolveLocale("system", ["en-US"])).toBe("en");
  });

  test("persists a supported preference and notifies subscribers", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value) };
    const i18n = createI18n({ storage, languages: ["en-US"] });
    let observed = "";
    i18n.subscribe(locale => { observed = locale; });
    expect(i18n.setPreference("zh-CN")).toBe(true);
    expect(i18n.locale).toBe("zh-CN");
    expect(observed).toBe("zh-CN");
    expect(values.get(LOCALE_STORAGE_KEY)).toBe("zh-CN");
    expect(i18n.setPreference("invalid")).toBe(false);
  });

  test("uses English as the fallback and interpolates translated values", () => {
    zhCNMessages["Hello {name}"] = "你好，{name}";
    expect(translate("Hello {name}", "zh-CN", { name: "Codex" })).toBe("你好，Codex");
    expect(translate("Missing {value}", "zh-CN", { value: 2 })).toBe("Missing 2");
    expect(translate("Hello {name}", "en", { name: "Codex" })).toBe("Hello Codex");
    expect(translate("3 changed files", "zh-CN")).toBe("3 个文件已更改");
    expect(translate("Worked for 2m 8s", "zh-CN")).toBe("处理耗时 2m 8s");
    expect(translate("Custom (config.toml)", "zh-CN")).toBe("自定义（config.toml）");
    expect(translate("Unrestricted access to the internet and any file on your computer", "zh-CN")).toBe("不受限制地访问互联网和此电脑上的任意文件");
    expect(translate("Choose project folder", "zh-CN")).toBe("选择项目文件夹");
    expect(translate("No side tasks", "zh-CN")).toBe("没有子任务");
  });

  test("translates dynamic interface text without changing conversation content", async () => {
    const dom = new JSDOM("<!doctype html><html><body><button title='Open settings'>Settings</button><article class='message-text'>Settings</article><div class='activity-output' id='raw-output'>Running command</div><div class='activity-output'><div id='ui-output' data-i18n-ui>Image unavailable</div></div><div class='review-hunks'>Settings</div></body></html>", { url: "http://localhost" });
    const i18n = createI18n({ storage: dom.window.localStorage, languages: ["en"] });
    const binding = createDomI18n(i18n, { root: dom.window.document });
    i18n.setPreference("zh-CN");

    const button = dom.window.document.querySelector("button")!;
    expect(button.textContent).toBe("设置");
    expect(button.title).toBe("打开设置");
    expect(dom.window.document.querySelector(".message-text")!.textContent).toBe("Settings");
    expect(dom.window.document.querySelector("#raw-output")!.textContent).toBe("Running command");
    expect(dom.window.document.querySelector("#ui-output")!.textContent).toBe("图片不可用");
    expect(dom.window.document.querySelector(".review-hunks")!.textContent).toBe("Settings");
    expect(dom.window.document.documentElement.lang).toBe("zh-CN");

    const status = dom.window.document.createElement("span");
    status.textContent = "Running command";
    dom.window.document.body.append(status);
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));
    expect(status.textContent).toBe("正在运行命令");

    i18n.setPreference("en");
    expect(button.textContent).toBe("Settings");
    expect(button.title).toBe("Open settings");
    expect(status.textContent).toBe("Running command");
    expect(dom.window.document.querySelector("#ui-output")!.textContent).toBe("Image unavailable");
    binding.disconnect();
  });
});
