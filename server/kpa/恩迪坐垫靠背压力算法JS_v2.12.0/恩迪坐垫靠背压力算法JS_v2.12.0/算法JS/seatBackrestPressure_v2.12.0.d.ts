/**
 * seatBackrestPressure_v2.12.0.d.ts
 * 恩迪坐垫 endi-23x23 / 恩迪靠背 new-backrest-32x25 压力（力）、面积、逐格压强算法；与汽车座椅标定上位机 V2.7.110 同源。
 * 单位：压强 kPa（显示层 ÷10 得 N/cm²），力 N，面积 cm²。所有矩阵均为原生方向（未做显示旋转），行优先、左上原点。
 * 加载：CommonJS `require('./seatBackrestPressure_v2.12.0.js')`；浏览器 `<script>` 后为 `globalThis.SeatBackrestPressureV2120`。
 */

export type SensorType = "endi-23x23" | "new-backrest-32x25";
export type Matrix = number[][];

export interface SensorDefinition {
  sensorType: SensorType;
  /** 原生物理点行列：坐垫 23×23，靠背 32×25。 */
  physicalRows: number;
  physicalCols: number;
  /** 原生插值网格（上位机热力图同一网格）：坐垫 46×46，靠背 64×50。 */
  interpolatedRows: number;
  interpolatedCols: number;
  order: "row-major";
  origin: "top-left";
  /** 原始帧字节数（1024）与原始帧行宽（32）。 */
  rawFrameSize: number;
  rawStride: number;
  /** physical[r][c] = raw[wireMap[r*physicalCols+c]]；索引超出原始帧长度时取 0。 */
  wireMap: readonly number[];
  wireMapRule: string;
  /** 物理有效掩码（上位机显示用；力值链路不使用）。 */
  physicalValidMask: readonly (readonly boolean[])[];
  /** 物理点距 mm：[行, 列]，原生方向。坐垫 [20, 20]，靠背 [26, 20]。 */
  physicalPitchMm: readonly [number, number];
  /** 插值格尺寸 mm：[行, 列]，原生方向。坐垫 [10, 10]，靠背 [13, 10]。 */
  interpolatedCellMm: readonly [number, number];
  /** 算法核心方向点距 mm：坐垫 [20, 20]，靠背 25×32 方向 [20, 26]。 */
  algorithmPitchMm: readonly [number, number];
  pitchNote: string;
  /** 插值格面积 cm²：坐垫 1，靠背 1.3。 */
  interpolatedCellAreaCm2: number;
  /** 物理点代表面积 cm²（= 4 个插值格）：坐垫 4，靠背 5.2。 */
  physicalCellAreaCm2: number;
  algorithmOrientation: string;
  /** 上位机默认显示旋转（3 = 顺时针 270°）；本模块输出不旋转。 */
  defaultDisplayRotation: number;
  defaultDisplayRotationNote: string;
}

/** §6 单格修正（ADC 域：ADC' = a × ADC + b，进入算法之前）。null = 未标定 / 标定失败。 */
export interface CellCalibrationEntry { a: number; b: number }
export interface CellCalibrationTable {
  rows: number;
  cols: number;
  order: "row-major";
  origin: "top-left";
  domain: "adc";
  formula: string;
  /** 本版为 "uncalibrated"：没有独立逐格多档实测，cells 全部为 null，回落恒等（a=1, b=0）。 */
  status: "uncalibrated" | "calibrated" | "partial";
  calibratedCellCount: number;
  nullFallback: string;
  /** 长度严格 = rows × cols；索引 i = row × cols + col。 */
  cells: readonly (CellCalibrationEntry | null)[];
}

export interface MatrixPressureMapOptions {
  /** 显示热力图 ADC 补偿设置（只影响逐格压强的 ADC 权重，不影响力/面积）；缺省 = 上位机默认。 */
  adcCompensationSettings?: unknown;
  /** 与输出同形的有效掩码；false 的格输出 0（统计随之变化）。缺省不屏蔽。 */
  validMask?: boolean[][];
}

/** §2 逐格接口返回值。 */
export interface MatrixPressureMap {
  /** 与输入同形的逐格压强 kPa；无效格为 0（不会是 null/undefined）。 */
  kpa: Matrix;
  /** 由 kpa 直接统计：正值格算术平均，按 0.01 kPa 四舍五入；无接触为 0。 */
  avgKpa: number;
  /** 由 kpa 直接统计：最大值；无接触为 0。 */
  maxKpa: number;
  /** kpa 中正值格数。 */
  validCount: number;
  mode: "per-cell";
  unit: "kPa";
  /** physical：输入为原生物理矩阵，输出为物理点压强（= 该点 2×2 插值子格压强平均，力等价）；
   *  interpolated：输入为上位机 sourceMatrix（原生方向、未补偿插值 ADC），输出 = 上位机热力图逐格压强；
   *  empty：输入为空矩阵。 */
  grid: "physical" | "interpolated" | "empty";
  sensorType: SensorType;
  /** 同一帧静态单帧估算的总力 N、总面积 cm²（上位机静态单帧路径）。 */
  forceN: number;
  areaCm2: number;
  /** 上位机平均/最大压强卡片值（插值网格统计）；grid = interpolated 时与 avgKpa/maxKpa 相等。 */
  hostAveragePressureKPa?: number | null;
  hostMaxPressureKPa?: number | null;
  estimation?: "static-single-frame";
}

/** 一帧输入：raw（1024 字节原始帧，推荐）或 physical（原生物理矩阵），二选一；timestampMs 必须显式给出。 */
export interface SensorFrameInput {
  raw?: ArrayLike<number>;
  physical?: Matrix;
  timestampMs: number;
  /** 为 true 时会话在本帧前清空历史（等同 reset）。 */
  reset?: boolean;
}

export interface RegionResult {
  index: number;
  forceN: number;
  areaCm2: number;
  pressureKPa: number | null;
  /** 坐垫/靠背核心模式（标准档 / 估算 / 超量程估算 …）。 */
  mode: string | null;
  /** 系数类别：standard（×1）/ over_range（超量程，压力 ×2；靠背面积 ×2）/ human（仅坐垫真人估算，压力 ×0.4、面积 ×0.9）。 */
  factorKind: "standard" | "over_range" | "human" | string;
  forceFactor: number | null;
  areaFactor: number | null;
  overRange: boolean;
  /** 上位机诊断原样（只读参考）。 */
  diagnostics: Record<string, unknown>;
}

export interface SensorFrameResult {
  sensorType: SensorType;
  timestampMs: number;
  /** 总压力 N（各区两位小数后求和）= 上位机“压力”卡片。 */
  forceN: number;
  /** 总面积 cm² = 上位机“面积”卡片。 */
  areaCm2: number;
  /** 平均压强 kPa = 全部有压强插值格的算术平均 = 上位机“平均压强”卡片；无接触为 null。 */
  averagePressureKPa: number | null;
  /** 最大压强 kPa = 插值格最大值 = 上位机“最大压强”卡片；无接触为 null。 */
  maxPressureKPa: number | null;
  /** 最大压强所在插值格 [row, col]（原生方向）。 */
  maxPressureCell: [number, number] | null;
  /** 插值网格逐格压强 kPa（坐垫 46×46，靠背 64×50，原生方向）= 上位机压强热力图。 */
  pointPressureKPa: Matrix;
  /** 由 pointPressureKPa 直接统计：avgKpa === averagePressureKPa，maxKpa === maxPressureKPa（有接触时）。 */
  pointPressureStats: { validCount: number; avgKpa: number; maxKpa: number };
  /** 物理点压强 kPa（23×23 / 32×25）= 2×2 插值子格平均。 */
  physicalPressureKPa: Matrix;
  regions: RegionResult[];
  contourOwner: Matrix | null;
  areaContour: unknown;
  /** 上位机力值结果对象原样（JSON 结构与上位机逐帧一致）。 */
  forceMetrics: Record<string, unknown> | null;
  /** v2.11.x 兼容字段：areaCm2 与上面相同。 */
  areaMetrics: {
    algorithmId: string; sourceApplicationVersion: string; sensorType: SensorType; unit: "cm²";
    rows: number; cols: number; cellAreaCm2: number; areaCm2: number;
    regions: { index: number; areaCm2: number; factorKind: string; areaFactor: number | null }[];
  };
  /** v2.11.x 兼容字段：由 pointPressureKPa 直接统计，与 averagePressureKPa / maxPressureKPa 相同。 */
  pressureMetrics: {
    algorithmId: "endi-point-pressure"; sourceApplicationVersion: string; unit: "kPa"; mode: "per-cell"; grid: "interpolated";
    avgPressureKPa: number | null; maxPressureKPa: number | null; validCount: number; pointPressureCount: number;
    calibrationBranch: "endi-fitted"; humanCoefficient: null;
  };
  /** 解码后的原生物理 ADC。 */
  sourcePhysical: Matrix;
  /** 上位机 sourceMatrix：原生方向 lineInterp2x2 插值 ADC（未补偿）。 */
  sourceMatrix: Matrix;
  /** 上位机热力图 ADC（补偿 + 固定阈值 30 过滤后）。 */
  displayAdcMatrix: Matrix;
}

export interface SensorSessionOptions { adcCompensationSettings?: unknown }
export interface SensorSession {
  readonly sensorType: SensorType;
  /** 按时间顺序逐帧调用；状态机（首次确认、加减判断、超量程/真人 500 ms 防抖、120 ms 过渡）保存在会话内。 */
  update(frame: SensorFrameInput): SensorFrameResult;
  reset(): void;
  frameCount(): number;
}

export interface SelfCheckResult {
  passed: boolean;
  version: string;
  sourceApplicationVersion: string;
  checks: { name: string; passed: boolean; detail: unknown }[];
}

export const VERSION: "2.12.0";
export const SOURCE_APPLICATION_VERSION: string;
export const SENSOR_TYPES: readonly SensorType[];
export const SENSOR_DEFINITIONS: Readonly<Record<SensorType, SensorDefinition>>;
export const CELL_CALIBRATION: Readonly<Record<SensorType, CellCalibrationTable>>;
/** 坐垫实测拟合参数（31 位置、σ、连续拟合 c0/k、标准块、阈值等），只读。 */
export const SEAT_CALIBRATION: Readonly<Record<string, any>>;
/** 靠背实测拟合参数（44 位置、σ、连续拟合 c0/k、阈值等），只读。 */
export const BACKREST_CALIBRATION: Readonly<Record<string, any>>;
export const ADC_COMPENSATION_DEFAULTS: Readonly<Record<string, any>>;
export const POINT_PRESSURE_RULES: Readonly<Record<string, any>>;

/** 1024 字节原始帧 → 原生物理矩阵（wireMap 解码）。 */
export function decodeRawFrame(raw: ArrayLike<number>, sensorType: SensorType): Matrix;
/** §2 逐格接口（单帧静态）。adcMatrix 为原生物理矩阵或上位机 sourceMatrix；其他尺寸或不支持的 sensorType 抛 TypeError。 */
export function calculateMatrixPressureMap(adcMatrix: Matrix, sensorType: SensorType, options?: MatrixPressureMapOptions): MatrixPressureMap;
/** 同 calculateMatrixPressureMap（按对接文档 §2 命名的别名）。 */
export function calculateDummyMatrixPressureMap(adcMatrix: Matrix, sensorType: SensorType, options?: MatrixPressureMapOptions): MatrixPressureMap;
/** 单帧静态完整结果（无历史）。 */
export function calculateSensorFrame(frame: SensorFrameInput, sensorType: SensorType, options?: SensorSessionOptions): SensorFrameResult;
/** 一段按时间顺序的帧序列（内部新建会话），与上位机实时逐帧结果一致。 */
export function calculateSensorSequence(frames: SensorFrameInput[], sensorType: SensorType, options?: SensorSessionOptions): SensorFrameResult[];
/** 实时会话（推荐的实时对接方式）。 */
export function createSensorSession(sensorType: SensorType, options?: SensorSessionOptions): SensorSession;
/** 最大压强显示值（kPa，两位小数）；恩迪链路不做 ×2 / ÷3。 */
export function getMaximumPressureDisplay(rawMaxKpa: number | null | undefined, sensorType: SensorType): number | null;
/** 显示层换算 kPa → N/cm²（÷10，按 0.001 N/cm² 取整，与上位机界面相同）。 */
export function kpaToNcm2(kpa: number | null | undefined): number | null;
/** v2.11.x 兼容名：返回逐格接口统计；humanCoefficient 已不使用。 */
export function calculatePressureMetricsFromMatrix(matrix: Matrix, sensorType?: SensorType, humanCoefficient?: number | null): {
  avgPressureKPa: number | null; maxPressureKPa: number | null; validCount: number; forceN: number; areaCm2: number;
  grid: MatrixPressureMap["grid"]; mode: "per-cell"; unit: "kPa"; humanCoefficientUsed: false; ignoredHumanCoefficient: number | null;
};
/** 坐垫连续拟合闭式曲线（均匀接触 nonZeroCount 个插值格、位置增益 1）：ADC → 压强 kPa，严格单调递增。 */
export function estimateAvgPressure(adc: number, nonZeroCount?: number): number | null;
/** 靠背连续拟合闭式曲线（同上）。 */
export function estimateBackrestAvgPressure(adc: number, nonZeroCount?: number): number | null;
export function runSelfCheck(): SelfCheckResult;
