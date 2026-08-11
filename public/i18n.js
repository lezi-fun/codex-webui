export const LOCALE_STORAGE_KEY = "codex-webui-locale";
export const LOCALE_PREFERENCES = Object.freeze(["system", "zh-CN", "en"]);

const ZH_CN = Object.create(null);

Object.assign(ZH_CN, {
  "Log in": "登录",
  "Log out": "退出登录",
  "Password": "密码",
  "Confirm password": "确认密码",
  "Set a LAN password": "设置局域网密码",
  "New password": "新密码",
  "Set password": "设置密码",
  "Setting password…": "正在设置密码…",
  "Logging in…": "正在登录…",
  "Password must be at least 12 characters": "密码至少需要 12 个字符",
  "Passwords do not match": "两次输入的密码不一致",
  "A password was already set. Log in to continue.": "密码已设置，请登录后继续。",
  "Unable to set the password": "无法设置密码",
  "Unable to log in": "无法登录",
  "Codex WebUI login": "Codex WebUI 登录",
  "Codex WebUI password setup": "Codex WebUI 密码设置",
  "New task": "新任务",
  "New chat": "新对话",
  "New tab": "新标签页",
  "Search": "搜索",
  "Search chats": "搜索对话",
  "Close search": "关闭搜索",
  "Projects": "项目",
  "Project": "项目",
  "Tasks": "任务",
  "Connecting": "正在连接",
  "Connecting to Codex": "正在连接 Codex",
  "Connecting to Codex…": "正在连接 Codex…",
  "Codex connected": "Codex 已连接",
  "Settings": "设置",
  "Profile": "个人资料",
  "Usage": "用量",
  "Keyboard shortcuts": "键盘快捷键",
  "Help": "帮助",
  "Open profile menu": "打开个人资料菜单",
  "Open settings": "打开设置",
  "Toggle sidebar": "切换侧边栏",
  "Toggle bottom panel": "切换底部面板",
  "Toggle terminal panel": "切换终端面板",
  "Toggle summary": "切换摘要",
  "Toggle side panel": "切换右侧面板",
  "What can I help?": "我能帮你做些什么？",
  "Do anything": "交给 Codex 处理",
  "Task prompt": "任务输入",
  "Composer suggestions": "输入建议",
  "Attached context": "已附加的上下文",
  "Attach files and folders": "附加文件和文件夹",
  "Start dictation": "开始听写",
  "Send message": "发送消息",
  "Change permissions": "更改权限",
  "Ask for approval": "请求审批",
  "How should Codex actions be approved?": "Codex 的操作应如何审批？",
  "Context usage": "上下文用量",
  "Reasoning effort": "思考强度",
  "Loading models…": "正在加载模型…",
  "None": "无",
  "Minimal": "最低",
  "Low": "低",
  "Medium": "中",
  "High": "高",
  "Extra High": "极高",
  "Max": "最大",
  "Ultra": "超高",
  "Review": "审阅",
  "Terminal": "终端",
  "Browser": "浏览器",
  "Files": "文件",
  "Side task": "子任务",
  "Side tasks": "子任务",
  "Summary": "摘要",
  "Environment": "环境",
  "Scheduled": "计划任务",
  "Computer Use": "电脑操作",
  "Computer use": "电脑操作",
  "Plan": "计划",
  "Sources": "来源",
  "Local workspace": "本地工作区",
  "Remote workspace": "远程工作区",
  "No project": "无项目",
  "No changes yet": "暂无更改",
  "Changes made by Codex will appear here.": "Codex 所做的更改会显示在这里。",
  "Switch to split diff": "切换到并排差异",
  "Switch to unified diff": "切换到统一差异",
  "Toggle word wrap": "切换自动换行",
  "Enable word wrap": "启用自动换行",
  "Disable word wrap": "关闭自动换行",
  "Collapse all diffs": "折叠所有差异",
  "Expand all diffs": "展开所有差异",
  "Undo changes": "撤销更改",
  "Reapply changes": "重新应用更改",
  "Changes reverted": "更改已撤销",
  "Changes reapplied": "更改已重新应用",
});

Object.assign(ZH_CN, {
  "General": "通用",
  "Appearance": "外观",
  "Configuration": "配置",
  "Personal": "个人",
  "Integrations": "集成",
  "Coding": "编程",
  "Archived": "已归档",
  "Archived chats": "已归档的对话",
  "Plugins": "插件",
  "Skills": "技能",
  "Connections": "连接",
  "Cloud preferences": "云端偏好设置",
  "Cloud environments": "云端环境",
  "Code review": "代码审阅",
  "Git": "Git",
  "Hooks": "钩子",
  "Worktrees": "工作树",
  "Back to app": "返回应用",
  "Back to settings": "返回设置",
  "Search settings": "搜索设置",
  "Search settings…": "搜索设置…",
  "Clear settings search": "清除设置搜索",
  "No results found": "未找到结果",
  "Permissions": "权限",
  "Auto-review": "代我审批",
  "Show “Approve for me” in the composer": "在输入框中显示“代我审批”",
  "Full access": "完全访问权限",
  "Show unrestricted access in the composer": "在输入框中显示不受限制的访问权限",
  "Selected mode": "所选模式",
  "Permission mode used for new turns": "新任务使用的权限模式",
  "Working folder used for new chats": "新对话使用的工作文件夹",
  "Theme": "主题",
  "System": "系统",
  "Language": "语言",
  "Interface language": "界面语言",
  "System default": "跟随系统",
  "Interface scale": "界面缩放",
  "Default": "默认",
  "Model": "模型",
  "Approval": "审批",
  "Web search": "网页搜索",
  "Automatic": "自动",
  "Installed plugins": "已安装的插件",
  "Plugin sources": "插件来源",
  "Installed skills": "已安装的技能",
  "Not configured": "未配置",
  "Browser access": "浏览器访问",
  "Network access": "网络访问",
  "Inherited from permissions": "继承自权限设置",
  "Connected services": "已连接的服务",
  "Diff view": "差异视图",
  "Unified": "统一",
  "Branch format": "分支格式",
  "Environments": "环境",
  "Review instructions": "审阅说明",
  "Git integration": "Git 集成",
  "Configured hooks": "已配置的钩子",
  "Worktree behavior": "工作树行为",
  "Turn on Full Access?": "启用完全访问权限？",
  "Codex will be able to run commands, use the internet, and create and edit files anywhere on this computer without your permission.": "Codex 无需再次获得许可，即可运行命令、使用互联网，并在这台电脑的任意位置创建和编辑文件。",
  "Files and folders": "文件和文件夹",
  "Read, create, modify, upload, or delete files anywhere on this computer": "读取、创建、修改、上传或删除这台电脑任意位置的文件",
  "Terminal commands": "终端命令",
  "Run commands, install software, and change system settings": "运行命令、安装软件和更改系统设置",
  "Internet and connected apps": "互联网和已连接的应用",
  "Access websites, send data, and use enabled plugins": "访问网站、发送数据并使用已启用的插件",
  "Cancel": "取消",
  "Confirm": "确认",
  "Ready": "就绪",
  "Browser navigation": "浏览器导航",
  "Go back": "后退",
  "Go forward": "前进",
  "Refresh page": "刷新页面",
  "Browser URL": "浏览器网址",
  "Enter URL": "输入网址",
  "Go to URL": "打开网址",
  "Open in new tab": "在新标签页打开",
  "Enter a URL to browse": "输入网址开始浏览",
  "Pages stay in their original site context. Some sites do not allow embedding.": "网页会保留原站点上下文，部分网站不允许嵌入显示。",
  "Loading page…": "正在加载页面…",
  "Page could not be embedded": "无法嵌入此页面",
  "Open externally": "在外部打开",
  "Embedded browser page": "嵌入式浏览器页面",
  "Bottom panel": "底部面板",
  "Close bottom panel": "关闭底部面板",
  "Close panel": "关闭面板",
  "Close summary": "关闭摘要",
  "Open side panel tab": "打开右侧面板标签页",
  "Image": "图片",
  "Open original": "打开原图",
  "Close image viewer": "关闭图片查看器",
  "Image could not be loaded.": "无法加载图片。",
});

Object.assign(ZH_CN, {
  "Working": "正在处理",
  "Completed": "已完成",
  "Tool failed": "工具调用失败",
  "Thinking": "思考中",
  "Thought": "已思考",
  "Running command": "正在运行命令",
  "Ran command": "已运行命令",
  "Command failed": "命令运行失败",
  "Editing files": "正在编辑文件",
  "Edited a file": "已编辑 1 个文件",
  "Edited files": "已编辑文件",
  "File edit failed": "文件编辑失败",
  "Reading": "正在读取",
  "Read": "已读取",
  "Searching": "正在搜索",
  "Searched": "已搜索",
  "Listing": "正在列出",
  "Listed": "已列出",
  "Viewing images": "正在查看图片",
  "Viewed image": "已查看图片",
  "Viewed images": "已查看图片",
  "Image view failed": "图片查看失败",
  "Searching the web": "正在搜索网页",
  "Searched the web": "已搜索网页",
  "Search failed": "搜索失败",
  "Starting side task": "正在启动子任务",
  "Started side task": "已启动子任务",
  "Sending input to side task": "正在向子任务发送消息",
  "Sent input to side task": "已向子任务发送消息",
  "Resuming side task": "正在恢复子任务",
  "Resumed side task": "已恢复子任务",
  "Waiting for side tasks": "正在等待子任务",
  "Waited for side tasks": "已等待子任务",
  "Closing side task": "正在关闭子任务",
  "Closed side task": "已关闭子任务",
  "Updating side task": "正在更新子任务",
  "Updated side task": "已更新子任务",
  "Side task failed": "子任务失败",
  "Side task interrupted": "子任务已中断",
  "Side task active": "子任务正在运行",
  "Side task started": "子任务已启动",
  "Waiting for approval": "正在等待审批",
  "Worked": "处理过程",
  "Activity failed": "操作失败",
  "Read files": "已读取文件",
  "Ran commands": "已运行命令",
  "Edited files": "已编辑文件",
  "No output": "无输出",
  "Success": "成功",
  "Failed": "失败",
  "Stopped": "已停止",
  "Stopped command": "已停止命令",
  "Waiting for patch details…": "正在等待补丁详情…",
  "No patch details": "无补丁详情",
  "Plan mode": "规划模式",
  "Approve for me": "代我审批",
  "Always ask for permission before editing external files or using the internet": "编辑工作区外的文件或使用互联网前始终请求许可",
  "Only ask for actions detected as potentially unsafe": "仅在检测到可能不安全的操作时请求许可",
  "Not allowed by managed settings": "受管理设置限制，无法使用",
  "Custom": "自定义",
  "Custom (config.toml)": "自定义（config.toml）",
  "Custom permissions": "自定义权限",
  "Custom permission profile": "自定义权限配置",
  "Uses permissions defined in config.toml": "使用 config.toml 中定义的权限",
  "Unrestricted access to the internet and any file on your computer": "不受限制地访问互联网和此电脑上的任意文件",
  "API key mode": "API 密钥模式",
  "Codex account": "Codex 账户",
  "Reasoning": "思考强度",
  "Select model": "选择模型",
  "Back": "返回",
  "No matching tasks": "没有匹配的任务",
  "No subfolders": "没有子文件夹",
  "Loading folders…": "正在加载文件夹…",
  "No folder selected": "尚未选择文件夹",
  "Use this folder": "使用此文件夹",
  "Choose where new tasks should work.": "选择新任务的工作位置。",
  "None": "无",
  "Don't work in a project": "不在项目中工作",
  "Parent folder": "上一级文件夹",
  "Go": "前往",
  "Side tasks started by this chat will appear here.": "此对话启动的子任务会显示在这里。",
  "Scheduled task data requires the native desktop bridge.": "计划任务数据需要原生桌面桥接。",
  "Computer Use controls require the native desktop bridge.": "电脑操作控件需要原生桌面桥接。",
  "Plan data is not exposed by app-server.": "app-server 未提供计划数据。",
  "Side task data requires the native desktop bridge.": "子任务数据需要原生桌面桥接。",
  "Conversation source data is not exposed by app-server.": "app-server 未提供对话来源数据。",
});

const ZH_CN_PATTERNS = [
  [/^(\d+) changed files?$/, match => `${match[1]} 个文件已更改`],
  [/^Review (\d+) changed files?$/, match => `审阅 ${match[1]} 个已更改文件`],
  [/^Load earlier messages \((\d+)\)$/, match => `加载更早的消息（${match[1]}）`],
  [/^Worked for (.+)$/, match => `处理耗时 ${match[1]}`],
  [/^Reasoning: (.+)$/, match => `思考强度：${translate(match[1], "zh-CN")}`],
  [/^Model: (.+)$/, match => `模型：${match[1]}`],
  [/^Context usage: (\d+)%$/, match => `上下文用量：${match[1]}%`],
  [/^(\d+)% full$/, match => `已使用 ${match[1]}%`],
  [/^(\d+)% used \((\d+)% left\)$/, match => `已使用 ${match[1]}%（剩余 ${match[2]}%）`],
  [/^(\d+)k \/ (\d+)k tokens used$/, match => `已使用 ${match[1]}k / ${match[2]}k 令牌`],
  [/^(\d+) images$/, match => `${match[1]} 张图片`],
  [/^(\d+) side tasks?$/, match => `${match[1]} 个子任务`],
  [/^Ran (.+)$/, match => `已运行 ${match[1]}`],
  [/^Stopped (.+)$/, match => `已停止 ${match[1]}`],
  [/^Exit code (\d+)$/, match => `退出码 ${match[1]}`],
  [/^What can I help with in (.+)\?$/, match => `我能为 ${match[1]} 做些什么？`],
  [/^Remove (.+)$/, match => `移除 ${match[1]}`],
];

export function resolveLocale(preference = "system", languages = []) {
  if (preference === "zh-CN") return "zh-CN";
  if (preference === "en") return "en";
  const values = Array.isArray(languages) ? languages : [languages];
  return values.some(value => /^zh(?:-|$)/i.test(String(value || ""))) ? "zh-CN" : "en";
}

function interpolate(template, values = {}) {
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => key in values ? String(values[key]) : match);
}

export function translate(message, locale = "en", values = {}) {
  const source = interpolate(message, values);
  if (locale !== "zh-CN") return source;
  const direct = ZH_CN[message] || ZH_CN[source];
  if (direct) return interpolate(direct, values);
  for (const [pattern, replacement] of ZH_CN_PATTERNS) {
    const match = source.match(pattern);
    if (match) return replacement(match);
  }
  return source;
}

export function createI18n({ storage = globalThis.localStorage, languages = globalThis.navigator?.languages || [] } = {}) {
  let preference = storage?.getItem?.(LOCALE_STORAGE_KEY) || "system";
  if (!LOCALE_PREFERENCES.includes(preference)) preference = "system";
  let locale = resolveLocale(preference, languages);
  const listeners = new Set();
  const api = {
    get preference() { return preference; },
    get locale() { return locale; },
    t(message, values) { return translate(message, locale, values); },
    setPreference(next) {
      if (!LOCALE_PREFERENCES.includes(next)) return false;
      preference = next;
      locale = resolveLocale(preference, languages);
      storage?.setItem?.(LOCALE_STORAGE_KEY, preference);
      for (const listener of listeners) listener(locale, preference);
      return true;
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
  return api;
}

const DOM_I18N_EXCLUDE = [
  "[data-i18n-ignore]",
  "[contenteditable='true']",
  ".message-text",
  ".activity-detail",
  ".activity-output",
  ".approval-reason p",
  ".approval-subtitle",
  ".autocomplete-title",
  ".review-hunks",
  ".side-task-copy small",
  ".terminal-host",
  ".thread-item",
  ".user-message",
  ".thread-name",
  ".review-file-name",
  ".change-path",
  ".folder-item",
  "code",
  "pre",
  "#accountName",
  "#accountMenuName",
  "#accountMenuSubtitle",
  "#browserUrl",
  "#folderPathInput",
  "#folderSelection",
  "#imageViewerPath",
  "#projectName",
  "#projectPath",
  "#settingsAccountName",
  "#settingsAccountMeta",
  "#summaryWorkspace",
  "#threadPath",
  "#threadTitle",
].join(",");

const TRANSLATED_ATTRIBUTES = ["aria-label", "placeholder", "title"];

function translateTextValue(value, i18n) {
  const source = String(value || "");
  const trimmed = source.trim();
  if (!trimmed) return source;
  const translated = i18n.t(trimmed);
  return translated === trimmed ? source : source.replace(trimmed, translated);
}

function isExcluded(node) {
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  return Boolean(element?.closest?.(DOM_I18N_EXCLUDE));
}

export function createDomI18n(i18n, { root = globalThis.document } = {}) {
  if (!i18n || !root?.createTreeWalker) return { refresh() {}, disconnect() {} };

  const view = root.defaultView || root.ownerDocument?.defaultView || globalThis;
  const NodeFilterApi = view.NodeFilter || globalThis.NodeFilter;
  const MutationObserverApi = view.MutationObserver || globalThis.MutationObserver;
  const textState = new WeakMap();
  const attributeState = new WeakMap();

  function translateTextNode(node) {
    if (isExcluded(node)) return;
    const current = node.nodeValue || "";
    let state = textState.get(node);
    if (!state) {
      state = { source: current, last: current };
      textState.set(node, state);
    } else if (current !== state.last) {
      state.source = current;
    }
    const next = translateTextValue(state.source, i18n);
    state.last = next;
    if (current !== next) node.nodeValue = next;
  }

  function translateElementAttributes(element) {
    if (isExcluded(element)) return;
    let states = attributeState.get(element);
    if (!states) {
      states = new Map();
      attributeState.set(element, states);
    }
    for (const name of TRANSLATED_ATTRIBUTES) {
      if (!element.hasAttribute?.(name)) continue;
      const current = element.getAttribute(name) || "";
      let state = states.get(name);
      if (!state) {
        state = { source: current, last: current };
        states.set(name, state);
      } else if (current !== state.last) {
        state.source = current;
      }
      const next = translateTextValue(state.source, i18n);
      state.last = next;
      if (current !== next) element.setAttribute(name, next);
    }
  }

  function translateSubtree(node) {
    if (!node || isExcluded(node)) return;
    if (node.nodeType === 3) {
      translateTextNode(node);
      return;
    }
    if (node.nodeType === 1) translateElementAttributes(node);
    const walker = root.createTreeWalker(node, NodeFilterApi.SHOW_ELEMENT | NodeFilterApi.SHOW_TEXT);
    while (walker.nextNode()) {
      const current = walker.currentNode;
      if (current.nodeType === 3) translateTextNode(current);
      else translateElementAttributes(current);
    }
  }

  function refresh() {
    const documentElement = root.documentElement || root.ownerDocument?.documentElement;
    if (documentElement) documentElement.lang = i18n.locale;
    translateSubtree(root.documentElement || root);
  }

  const observer = MutationObserverApi ? new MutationObserverApi(records => {
    for (const record of records) {
      if (record.type === "characterData") translateTextNode(record.target);
      else if (record.type === "attributes") translateElementAttributes(record.target);
      else for (const node of record.addedNodes) translateSubtree(node);
    }
  }) : null;
  observer?.observe(root.documentElement || root, {
    attributes: true,
    attributeFilter: TRANSLATED_ATTRIBUTES,
    characterData: true,
    childList: true,
    subtree: true,
  });
  const unsubscribe = i18n.subscribe(refresh);
  refresh();

  return {
    refresh,
    disconnect() {
      observer?.disconnect();
      unsubscribe();
    },
  };
}

export { ZH_CN as zhCNMessages };
