export type Stage = 'devices' | 'cleaning' | 'running' | 'settings' | 'items' | 'global';
export type Operation = 'devices.load' | 'cleaning.start' | 'running.control' | 'device.rename' | 'items.save';
export type Outcome = 'error' | 'timeout' | 'validation' | 'interrupted' | 'empty' | 'loading' | 'slow' | 'success';
export interface Scene {
  id: string;
  stage: Stage;
  name: string;
  operations: Operation[];
  outcome: Outcome;
  delay: number;
  prerequisite: string;
  process: string;
  message: string;
  recovery: string;
  retryLabel?: string;
  editLabel?: string;
}
export interface DemoPage {
  id: string;
  title: string;
  stage: Stage;
  operations: Operation[];
  notes: { title: string; body: string; target: string }[];
}
const note = (title: string, body: string, target: string) => ({ title, body, target });
export const pages: Record<string, DemoPage> = {
  devices: { id: 'devices', title: '设备列表', stage: 'devices', operations: ['devices.load', 'running.control'], notes: [
    note('清洗机入口', 'BW05S、BW05P、BW05A 各有独立设备入口。运行、预约与自定义模式按型号保存，返回设备列表后继续计时。', 'device'),
    note('列表状态', '加载、空态和失败场景替换列表内容；运行中仅显示工作周期剩余时间，不显示模式名称；预约中仅显示预计完成时间，按预约启动时间加工作周期时长计算，不包含保管时长，跨天同时显示日期。进入保管后显示“保管中”和剩余时间，剩余时间达到 1 小时显示小时，不足 1 小时显示分钟，不显示模式名称；恢复正常不重放启动操作。', 'content'),
    note('快捷暂停与启动', '设备工作中（含保管）时，卡片右侧箭头替换为暂停按钮，暂停后替换为启动按钮，启动继续原周期与剩余时间。按钮只控制对应设备，不进入详情；点击卡片其他区域进入控制页。指令处理中显示加载并禁止重复操作，成功后才改变运行状态；失败保留原状态，可重试或取消。预约、空闲和已完成设备保留箭头。', 'device'),
  ] },
  home: { id: 'home', title: '模式选择', stage: 'cleaning', operations: ['cleaning.start'], notes: [
    note('模式选择', '点击任意模式打开底部浮窗；预设模式名称固定，自定义模式仅可在浮窗内改名并本地保存，最多保存三个自定义模式。', 'content'),
    note('启动与预约', '浮窗统一提供定时启动与启动。预设清洗步骤不可取消，其余步骤可选；机器清洁固定清洗 20 分钟、烘干 10 分钟，两步均不可取消。固定时长不可修改；保管单独设置且不计入清洗周期。启动失败保留配置。', 'action'),
    note('机器清洁提醒', '完成第 10、20、30 次及后续每 10 次工作后，下次进入模式选择页时，在返回按钮下方显示可关闭的大圆角提醒，文案展示自上次机器清洁以来的实际完成次数。关闭后本轮不再提醒，到下一个 10 次节点重新出现。工作周期结束计数一次，保管不重复计次，未完成的工作不计次；机器清洁实际启动成功即从 0 重新统计，无论之后是否完成。仅选择、预约或启动失败不清零。各型号独立记录次数与关闭状态，刷新保留。', 'reminder'),
  ] },
  'custom-mode': { id: 'custom-mode', title: '自定义模式', stage: 'cleaning', operations: ['cleaning.start'], notes: [
    note('步骤与时长', '步骤默认不选。清洗 19–45 分钟、蒸汽 7–10 分钟、烘干 40–70 分钟、保管 10–72 小时。支持数字输入，超限提示并限制范围。至少选择一步才能启动或预约。', 'content'),
  ] },
  'run-control': { id: 'run-control', title: '运行控制', stage: 'running', operations: ['running.control'], notes: [
    note('清洗进度', '设备图下方显示步骤时间轴与剩余时长。返回设备列表继续计时；暂停时，自定义模式只能编辑尚未开始的步骤。设备列表在保管阶段显示“保管中”和剩余时间，达到 1 小时显示小时，不足 1 小时显示分钟，并隐藏模式名称。模拟故障期间停止推进。', 'content'),
    note('暂停与继续', '通过底部按钮发送控制操作；重试成功后才改变运行状态。停止仍沿用原确认弹窗。', 'action'),
  ] },
  'smart-mode': { id: 'smart-mode', title: '智能模式运行', stage: 'running', operations: ['running.control'], notes: [
    note('智能进度', '统一使用设备图与蓝色步骤时间轴。进度更新期间显示骨架屏，故障时冻结计时，不生成完成状态。', 'content'),
    note('运行操作', '暂停、继续及停止沿用原有操作，控制失败不提前写入状态。', 'action'),
  ] },
  settings: { id: 'settings', title: '设备设置', stage: 'settings', operations: [], notes: [
    note('设置入口', '设备信息、宝宝物品及其他设置进入现有页面。未实现的服务入口不虚构请求。', 'content'),
    note('耗材管理', '进入耗材管理页查看当前型号耗材的剩余次数，点击卡片查看详情。返回保留来源与清洗状态。', 'content'),
  ] },
  consumables: { id: 'consumables', title: '耗材管理', stage: 'settings', operations: [], notes: [
    note('耗材寿命', 'HEPA 按 360 次计算，演示剩余 216 次。支持软水滤芯的型号按 60 次计算，演示剩余 36 次。仅点击卡片时打开详情。', 'content'),
  ] },
  'device-info': { id: 'device-info', title: '设备信息', stage: 'settings', operations: ['device.rename'], notes: [
    note('设备名称', '点击名称编辑；保存失败保留输入，重试成功才写入名称。', 'content'),
    note('设备标识', 'SN 与 MAC 使用浏览器剪贴板；Wi-Fi 保留原演示提示。', 'content'),
  ] },
  'other-settings': { id: 'other-settings', title: '其他设置', stage: 'settings', operations: [], notes: [
    note('语言与外观', '中英文及深色模式与手机外工具同步。均为本地设置，不模拟系统权限。', 'content'),
  ] },
  'baby-items': { id: 'baby-items', title: '宝宝物品', stage: 'items', operations: [], notes: [
    note('物品列表', '按更换周期排序，进入详情可查看养护说明或编辑。新增与编辑页匹配保存异常。', 'content'),
  ] },
  'items-form': { id: 'items-form', title: '宝宝物品编辑', stage: 'items', operations: ['items.save'], notes: [
    note('物品信息', '填写名称、购买日期和类别；失败时保留表单，重试成功只保存一次。', 'content'),
    note('保存', '返回修改不提交，取消异常不清空输入。', 'action'),
  ] },
  notifications: { id: 'notifications', title: '系统通知', stage: 'devices', operations: [], notes: [
    note('通知样例', '展示时间延长、未启动及完成三类原有锁屏通知，不请求真实通知权限，也不改变实际清洗状态。', 'content'),
  ] },
};
const scene = (stage: Stage, suffix: string, name: string, operations: Operation[], outcome: Outcome, message: string, recovery: string): Scene => ({
  id: `${stage}.${suffix}`, stage, name, operations, outcome,
  delay: outcome === 'timeout' ? 4500 : outcome === 'slow' ? 5000 : 1000,
  prerequisite: '仅作用于本页已接入的模拟操作', process: '正在处理，请稍候…', message, recovery,
});
export const scenes: Scene[] = [
  scene('devices', 'loading', '持续加载中', ['devices.load'], 'loading', '正在查找演示设备', '取消等待或恢复正常后显示原设备。'),
  scene('devices', 'empty', '没有可用设备', ['devices.load'], 'empty', '还没有可用设备', '重新查找恢复演示列表，不绑定真实设备。'),
  scene('devices', 'failure', '设备列表加载失败', ['devices.load'], 'error', '暂时无法获取设备列表', '重试成功后显示原列表。'),
  scene('cleaning', 'failure', '清洗启动失败', ['cleaning.start'], 'error', '设备未确认启动，清洗尚未开始。', '保留模式配置，重试后才启动。'),
  scene('cleaning', 'timeout', '启动响应超时', ['cleaning.start'], 'timeout', '设备响应超时，本次未启动清洗。', '确认设备状态后重试，或取消。'),
  scene('running', 'failure', '运行控制失败', ['running.control'], 'error', '设备未确认控制指令，运行状态未修改。', '重试后才应用暂停或继续指令。'),
  scene('running', 'interrupted', '设备连接中断', ['running.control'], 'interrupted', '连接已中断，清洗进度暂不更新。', '重试恢复连接；不标记清洗完成。'),
  scene('settings', 'rename', '设备名称保存失败', ['device.rename'], 'error', '名称未修改，编辑内容仍保留。', '继续编辑或重试，成功后才保存名称。'),
  scene('items', 'save', '物品保存失败', ['items.save'], 'error', '物品未保存，当前输入已保留。', '修改输入或重试，成功后只保存一次。'),
  scene('items', 'validation', '物品信息校验不通过', ['items.save'], 'validation', '模拟校验未通过，物品未保存。', '核对名称和日期后重新提交。'),
  scene('global', 'offline', '断网（模拟）', [], 'error', '模拟网络不可用，本次操作未提交。', '模拟重连并重试，或恢复正常。'),
  scene('global', 'weak', '弱网（模拟）', [], 'slow', '模拟网络较慢，正在等待响应。', '选择场景仅展示；恢复连接后处理操作，可随时取消。'),
];
export const getScene = (id: string) => scenes.find(s => s.id === id);
export const scenesForOperations = (operations: Operation[]) => scenes.filter(s => s.stage !== 'global' && s.operations.some(op => operations.includes(op)));
