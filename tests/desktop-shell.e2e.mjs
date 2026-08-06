import { chromium } from 'playwright';
import { launchOptions } from './browser-runtime.mjs';

const base=process.env.CODEX_WEBUI_TEST_URL||'http://127.0.0.1:8899';
const browser=await chromium.launch(launchOptions());
const page=await browser.newPage({viewport:{width:1120,height:760},colorScheme:'dark'});
page.setDefaultTimeout(7000);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.goto(base,{waitUntil:'networkidle'});
await page.waitForFunction(()=>globalThis.__codexWebuiDebug?.renderAccount);
await page.waitForFunction(()=>globalThis.__codexWebuiDebug.state.account!==null);

await page.evaluate(()=>{
  const api=globalThis.__codexWebuiDebug;
  api.renderAccount({type:'chatgpt',displayName:'Desktop User',avatarUrl:null,planType:'plus',initials:'DU'});
  api.setPermissionProfiles([
    {id:'team-safe',description:'Team workspace profile',allowed:true},
    {id:'managed-blocked',description:'Managed profile',allowed:false},
  ]);
});
await page.click('#accountButton');
const chatgpt=await page.evaluate(()=>({
  product:document.querySelector('#productModeButton strong')?.textContent.trim(),
  newChat:document.querySelector('#newTask span:nth-child(2)')?.textContent.trim(),
  search:document.querySelector('#threadSearch')?.placeholder,
  section:document.querySelector('.sidebar-section-label')?.textContent.trim(),
  footerName:document.querySelector('#accountName')?.textContent.trim(),
  footerMeta:document.querySelector('#accountFooterMeta')?.textContent.trim(),
  profileHidden:document.querySelector('#accountProfile')?.hidden,
  usageHidden:document.querySelector('#accountUsage')?.hidden,
  logoutHidden:document.querySelector('#accountLogout')?.hidden,
}));
await page.click('#accountSettings');
await page.waitForFunction(()=>document.querySelector('#settingsDialog').open);
const settingsShell=await page.evaluate(()=>({
  groups:[...document.querySelectorAll('[data-settings-group] h2')].map(node=>node.textContent.trim()),
  pages:[...document.querySelectorAll('[data-settings-page]')].map(node=>node.textContent.trim()),
  fullPage:getComputedStyle(document.querySelector('#settingsDialog')).position==='fixed',
}));
await page.click('[data-settings-page="agent"]');
const configuration=await page.evaluate(()=>({
  title:document.querySelector('#settingsPageTitle')?.textContent.trim(),
  values:[...document.querySelectorAll('#settingsPlaceholderRows .settings-row')].map(node=>node.textContent.trim()),
}));
await page.fill('#settingsSearch','browser');
const settingsSearch=await page.evaluate(()=>({
  visible:[...document.querySelectorAll('[data-settings-page]')].filter(node=>!node.hidden).map(node=>node.textContent.trim()),
  groups:[...document.querySelectorAll('[data-settings-group]')].filter(node=>!node.hidden).map(node=>node.querySelector('h2')?.textContent.trim()),
  clearVisible:!document.querySelector('#clearSettingsSearch').hidden,
}));
await page.click('[data-settings-page="browser-use"]');
await page.screenshot({path:'/tmp/codex-webui-settings-shell.png'});
await page.click('#clearSettingsSearch');
await page.click('[data-settings-page="general"]');
await page.click('#settingsAutoReviewRow .settings-switch');
const settings=await page.evaluate(()=>({
  open:document.querySelector('#settingsDialog').open,
  title:document.querySelector('#settingsTitle')?.textContent.trim(),
  page:document.querySelector('#settingsPageTitle')?.textContent.trim(),
  permission:document.querySelector('#settingsPermissionValue')?.textContent.trim(),
  autoReviewHidden:document.querySelector('#settingsAutoReviewRow')?.hidden,
  autoReviewChecked:document.querySelector('#settingsAutoReviewToggle')?.checked,
  fullAccessChecked:document.querySelector('#settingsFullAccessToggle')?.checked,
}));
await page.click('#closeSettings');

await page.click('#modeButton');
const permissionMenu=await page.evaluate(()=>({
  open:!document.querySelector('#permissionMenu').hidden,
  options:[...document.querySelectorAll('[data-permission-mode] strong')].map(node=>node.textContent.trim()),
  blockedDisabled:document.querySelector('[data-permission-mode="profile:managed-blocked"]')?.disabled,
}));
await page.screenshot({path:'/tmp/codex-webui-permissions-menu.png'});

await page.click('[data-permission-mode="guardian-approvals"]');
const guardian=await page.evaluate(()=>({
  selected:globalThis.__codexWebuiDebug.selectedPermission(),
  thread:globalThis.__codexWebuiDebug.permissionThreadPolicy(),
  turn:globalThis.__codexWebuiDebug.permissionTurnPolicy('/tmp/project'),
}));

await page.click('#modeButton');
await page.click('[data-permission-mode="profile:team-safe"]');
const profile=await page.evaluate(()=>({
  selected:globalThis.__codexWebuiDebug.selectedPermission(),
  thread:globalThis.__codexWebuiDebug.permissionThreadPolicy(),
  turn:globalThis.__codexWebuiDebug.permissionTurnPolicy('/tmp/project'),
}));

await page.click('#modeButton');
await page.click('[data-permission-mode="custom"]');
const custom=await page.evaluate(()=>({
  selected:globalThis.__codexWebuiDebug.selectedPermission(),
  thread:globalThis.__codexWebuiDebug.permissionThreadPolicy(),
  turn:globalThis.__codexWebuiDebug.permissionTurnPolicy('/tmp/project'),
}));

await page.click('#modeButton');
await page.click('[data-permission-mode="full-access"]');
await page.waitForFunction(()=>document.querySelector('#fullAccessDialog').open);
await page.click('#confirmFullAccess');
const fullAccess=await page.evaluate(()=>({
  label:document.querySelector('#modeButton .control-label').textContent.trim(),
  mode:globalThis.__codexWebuiDebug.state.permissionMode,
  selected:globalThis.__codexWebuiDebug.selectedPermission(),
  thread:globalThis.__codexWebuiDebug.permissionThreadPolicy(),
  turn:globalThis.__codexWebuiDebug.permissionTurnPolicy('/tmp/project'),
}));

await page.click('#accountButton');
await page.click('#accountSettings');
await page.click('#settingsFullAccessRow .settings-switch');
const fullAccessSettingOff=await page.evaluate(()=>({
  checked:document.querySelector('#settingsFullAccessToggle').checked,
  mode:globalThis.__codexWebuiDebug.state.permissionMode,
  visible:globalThis.__codexWebuiDebug.state.permissionVisibility.fullAccess,
}));
await page.click('#settingsFullAccessRow .settings-switch');
await page.waitForFunction(()=>document.querySelector('#fullAccessDialog').open);
await page.click('#confirmFullAccess');
const fullAccessSettingOn=await page.evaluate(()=>({
  checked:document.querySelector('#settingsFullAccessToggle').checked,
  mode:globalThis.__codexWebuiDebug.state.permissionMode,
  visible:globalThis.__codexWebuiDebug.state.permissionVisibility.fullAccess,
}));
await page.click('#closeSettings');

await page.evaluate(()=>globalThis.__codexWebuiDebug.renderAccount({type:'apiKey',displayName:'API key',avatarUrl:null,planType:null,initials:'AP'}));
await page.click('#accountButton');
const apiKey=await page.evaluate(()=>({
  footerName:document.querySelector('#accountName')?.textContent.trim(),
  footerMeta:document.querySelector('#accountFooterMeta')?.textContent.trim(),
  profileHidden:document.querySelector('#accountProfile')?.hidden,
  usageHidden:document.querySelector('#accountUsage')?.hidden,
  settingsHidden:document.querySelector('#accountSettings')?.hidden,
  logoutHidden:document.querySelector('#accountLogout')?.hidden,
}));
await page.click('#accountSettings');
const apiSettings=await page.evaluate(()=>({
  autoReviewHidden:document.querySelector('#settingsAutoReviewRow')?.hidden,
  selectedMode:globalThis.__codexWebuiDebug.state.permissionMode,
}));
await page.setViewportSize({width:390,height:844});
await page.screenshot({path:'/tmp/codex-webui-settings-mobile.png'});
const mobileSettings=await page.evaluate(()=>({
  dialog:document.querySelector('#settingsDialog').getBoundingClientRect().toJSON(),
  viewport:{width:innerWidth,height:innerHeight},
  horizontalOverflow:document.documentElement.scrollWidth>innerWidth,
  pageVisible:document.querySelector('#settingsDialog').dataset.mobilePage,
  navWidth:document.querySelector('.settings-nav').getBoundingClientRect().width,
  contentWidth:document.querySelector('.settings-content').getBoundingClientRect().width,
}));
await page.click('#settingsMobileBack');
const mobileSettingsNavigation=await page.evaluate(()=>({
  pageVisible:document.querySelector('#settingsDialog').dataset.mobilePage,
  navWidth:document.querySelector('.settings-nav').getBoundingClientRect().width,
  contentWidth:document.querySelector('.settings-content').getBoundingClientRect().width,
}));

console.log(JSON.stringify({chatgpt,settingsShell,configuration,settingsSearch,settings,permissionMenu,guardian,profile,custom,fullAccess,fullAccessSettingOff,fullAccessSettingOn,apiKey,apiSettings,mobileSettings,mobileSettingsNavigation,errors},null,2));
await browser.close();
if(
  errors.length||
  chatgpt.product!=='Codex'||chatgpt.newChat!=='New chat'||chatgpt.search!=='Search chats'||chatgpt.section!=='Chats'||chatgpt.footerName!=='Desktop User'||chatgpt.footerMeta!=='Plus plan'||chatgpt.profileHidden||chatgpt.usageHidden||chatgpt.logoutHidden||
  settingsShell.groups.join('|')!=='Personal|Integrations|Coding|Archived'||!settingsShell.pages.includes('Configuration')||!settingsShell.pages.includes('Cloud preferences')||!settingsShell.fullPage||configuration.title!=='Configuration'||!configuration.values.some(value=>value.startsWith('Model'))||settingsSearch.visible.join('|')!=='Browser'||settingsSearch.groups.join('|')!=='Integrations'||!settingsSearch.clearVisible||
  !settings.open||settings.title!=='Settings'||settings.page!=='General'||settings.permission!=='Ask for approval'||settings.autoReviewHidden||!settings.autoReviewChecked||!settings.fullAccessChecked||
  !permissionMenu.open||permissionMenu.options.join('|')!=='Ask for approval|Approve for me|Full access|team-safe|managed-blocked|Custom (config.toml)'||!permissionMenu.blockedDisabled||
  guardian.selected.approvalsReviewer!=='auto_review'||guardian.thread.approvalPolicy!=='on-request'||guardian.thread.approvalsReviewer!=='auto_review'||guardian.thread.sandbox!=='workspace-write'||guardian.turn.approvalsReviewer!=='auto_review'||guardian.turn.sandboxPolicy.type!=='workspaceWrite'||guardian.turn.permissions!==null||
  profile.selected.profileId!=='team-safe'||profile.thread.permissions!=='team-safe'||Object.keys(profile.thread).length!==1||profile.turn.permissions!=='team-safe'||profile.turn.approvalPolicy!==null||profile.turn.approvalsReviewer!==null||'sandboxPolicy' in profile.turn||
  custom.selected.kind!=='custom'||Object.keys(custom.thread).length!==0||custom.turn.permissions!==null||custom.turn.approvalPolicy!==null||custom.turn.approvalsReviewer!==null||custom.turn.sandboxPolicy!==null||
  fullAccess.label!=='Full access'||fullAccess.mode!=='full-access'||fullAccess.selected.approvalPolicy!=='never'||fullAccess.selected.sandbox!=='danger-full-access'||fullAccess.thread.approvalPolicy!=='never'||fullAccess.thread.approvalsReviewer!=='user'||fullAccess.thread.sandbox!=='danger-full-access'||fullAccess.turn.sandboxPolicy.type!=='dangerFullAccess'||
  fullAccessSettingOff.checked||fullAccessSettingOff.visible||fullAccessSettingOff.mode!=='default'||!fullAccessSettingOn.checked||!fullAccessSettingOn.visible||fullAccessSettingOn.mode!=='default'||
  apiKey.footerName!=='API key'||apiKey.footerMeta!=='API key mode'||!apiKey.profileHidden||!apiKey.usageHidden||apiKey.settingsHidden||!apiKey.logoutHidden||!apiSettings.autoReviewHidden||mobileSettings.horizontalOverflow||mobileSettings.dialog.width!==mobileSettings.viewport.width||mobileSettings.pageVisible!=='true'||mobileSettings.navWidth!==0||mobileSettings.contentWidth!==mobileSettings.viewport.width||mobileSettingsNavigation.pageVisible!=='false'||mobileSettingsNavigation.navWidth!==mobileSettings.viewport.width||mobileSettingsNavigation.contentWidth!==0
)process.exit(1);
