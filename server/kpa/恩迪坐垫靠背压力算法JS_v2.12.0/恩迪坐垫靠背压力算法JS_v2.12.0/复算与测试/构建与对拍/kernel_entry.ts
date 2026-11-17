/**
 * seatBackrestPressure_v2.12.0 内核入口（esbuild 打包源）。
 *
 * 直接 import 上位机 V2.7.110 的算法源码，不复制、不改写，保证独立 JS 与上位机逐帧同源：
 *   raw 1024 字节 →(wireMap)→ 原生物理 ADC → lineInterp2x2（sourceMatrix）
 *   → ADC 补偿 + 固定 30 过滤（热力图显示 ADC）
 *   → 恩迪坐垫 / 靠背拟合算法（输入：未补偿原生物理 ADC）
 *   → attachEndiPointPressure（逐格压强，平均压强 = 格子平均）
 *
 * 打包后整段被包进 createLocalKernel() 函数体：每次调用得到一套全新的模块级状态
 * （坐垫/靠背实时会话 live、WeakMap 缓存），因此独立 JS 顶层没有可变状态。
 */
import { getSensorConfig, lineInterp2x2 } from "../源码/client/src/lib/sensorConfig";
import {
  compensateAndFilterAdcMatrix,
  DEFAULT_ADC_COMPENSATION_SETTINGS,
  normalizeAdcCompensationSettings,
  ADC_POST_COMPENSATION_FILTER_THRESHOLD,
  ADC_COMPENSATION_VERSION,
} from "../源码/client/src/lib/adcCompensation";
import * as seat from "../源码/client/src/lib/endiSeatForce";
import * as back from "../源码/client/src/lib/endiBackrestForce";
import {
  attachEndiPointPressure,
  endiPointPressureMatrix,
  endiContourOwnerMatrix,
  ENDI_POINT_PRESSURE_VERSION,
  ENDI_POINT_PRESSURE_FORMULA,
  ENDI_POINT_PRESSURE_HUMAN_PEAK_RULE,
} from "../源码/client/src/lib/endiPointPressure";
import { APP_VERSION } from "../源码/client/src/lib/version";
import {
  DEFAULT_PARAMS as SEAT_PARAMS,
  ENDI_CUSHION_CORE_VERSION,
  ENDI_CUSHION_CORE_SOURCE_SHA256,
} from "../源码/client/src/lib/endiCushion/endiCushionCore.js";
import {
  CALIB as BACK_CALIB,
  DEFAULT_CONFIG as BACK_CONFIG,
  ENDI_BACKREST_CORE_VERSION,
  ENDI_BACKREST_CORE_SOURCE_SHA256,
} from "../源码/client/src/lib/endiBackrest/endiBackrestCore.js";

type Matrix = number[][];
export type SensorType = "endi-23x23" | "new-backrest-32x25";

export interface FrameContext {
  timestampMs: number;
  streamId: string;
}

/** 传感器几何与线序（与上位机 sensorConfig 相同）。 */
export function sensorGeometry(type: SensorType) {
  const cfg = getSensorConfig(type);
  return {
    physicalRows: cfg.physicalRows,
    physicalCols: cfg.physicalCols,
    rows: cfg.rows,
    cols: cfg.cols,
    rawStride: cfg.rawStride,
    frameSize: cfg.frameSize,
    wireMap: Array.from(cfg.wireMap),
    physicalValidMask: cfg.physicalValidMask ? cfg.physicalValidMask.map((r) => r.slice()) : null,
  };
}

/**
 * 计算一帧（与上位机 Home.tsx calculateFrameForce + handleFrame 相同的调用顺序与参数）。
 * @param physical 原生方向未补偿物理 ADC（坐垫 23×23；靠背 32×25）
 * @param ctx      实时会话上下文；null = 上位机静态单帧路径（独立实例，process(0)）
 */
export function computeFrame(type: SensorType, physical: Matrix, ctx: FrameContext | null, adcSettings?: unknown) {
  const cfg = getSensorConfig(type);
  const sourceMatrix = lineInterp2x2(physical, cfg.physicalRows, cfg.physicalCols);
  const settings = adcSettings ? normalizeAdcCompensationSettings(adcSettings as never) : DEFAULT_ADC_COMPENSATION_SETTINGS;
  const heat = compensateAndFilterAdcMatrix(sourceMatrix, type, settings);
  const context = ctx ? { timestampMs: ctx.timestampMs, streamId: ctx.streamId } : undefined;
  const force = type === "endi-23x23"
    ? seat.calculateEndiSeatForce(physical, context)
    : back.calculateEndiBackrestForce(physical, context);
  attachEndiPointPressure(force, type, physical, heat);
  const area = type === "endi-23x23" ? seat.analyzeEndiSeatArea(sourceMatrix) : back.analyzeEndiBackrestArea(sourceMatrix);
  return {
    sourceMatrix,
    heatmapAdcMatrix: heat,
    force,
    pointPressureKPa: endiPointPressureMatrix(force),
    contourOwner: endiContourOwnerMatrix(force),
    area,
  };
}

/** 版本、规则常量与实测拟合参数（只读副本由外层冻结）。 */
export function metadata() {
  return {
    applicationVersion: APP_VERSION,
    adc: {
      compensationVersion: ADC_COMPENSATION_VERSION,
      postCompensationFilterThreshold: ADC_POST_COMPENSATION_FILTER_THRESHOLD,
      defaultSettings: DEFAULT_ADC_COMPENSATION_SETTINGS,
    },
    pointPressure: {
      version: ENDI_POINT_PRESSURE_VERSION,
      formula: ENDI_POINT_PRESSURE_FORMULA,
      humanPeakRule: ENDI_POINT_PRESSURE_HUMAN_PEAK_RULE,
    },
    seat: {
      algorithmId: seat.ENDI_SEAT_ALGORITHM_ID,
      algorithmLabel: seat.ENDI_SEAT_ALGORITHM_LABEL,
      modelVersion: seat.ENDI_SEAT_MODEL_VERSION,
      coreVersion: ENDI_CUSHION_CORE_VERSION,
      coreSourceSha256: ENDI_CUSHION_CORE_SOURCE_SHA256,
      gravity: seat.ENDI_SEAT_GRAVITY,
      unitMassKg: seat.ENDI_SEAT_UNIT_MASS_KG,
      baseAreaCm2: seat.ENDI_SEAT_BASE_AREA_CM2,
      areaThresholdAdc: seat.ENDI_SEAT_AREA_THRESHOLD_ADC,
      interpCellAreaCm2: 1,
      overRange: {
        forceThresholdN: seat.ENDI_SEAT_OVER_RANGE_FORCE_THRESHOLD_N,
        forceGain: seat.ENDI_SEAT_OVER_RANGE_GAIN,
        version: seat.ENDI_SEAT_OVER_RANGE_VERSION,
      },
      human: {
        frameAreaThresholdCm2: seat.ENDI_SEAT_HUMAN_AREA_THRESHOLD_CM2,
        frameForceThresholdN: seat.ENDI_SEAT_HUMAN_FORCE_THRESHOLD_N,
        forceFactor: seat.ENDI_SEAT_HUMAN_FORCE_FACTOR,
        areaFactor: seat.ENDI_SEAT_HUMAN_AREA_FACTOR,
        peakPressureGain: seat.ENDI_SEAT_HUMAN_PEAK_PRESSURE_GAIN,
        exitHoldMs: seat.ENDI_SEAT_HUMAN_EXIT_HOLD_MS,
        version: seat.ENDI_SEAT_HUMAN_VERSION,
      },
      params: SEAT_PARAMS,
    },
    backrest: {
      algorithmId: back.ENDI_BACKREST_ALGORITHM_ID,
      algorithmLabel: back.ENDI_BACKREST_ALGORITHM_LABEL,
      modelVersion: back.ENDI_BACKREST_MODEL_VERSION,
      coreVersion: ENDI_BACKREST_CORE_VERSION,
      coreSourceSha256: ENDI_BACKREST_CORE_SOURCE_SHA256,
      gravity: back.ENDI_BACKREST_GRAVITY,
      unitMassKg: back.ENDI_BACKREST_UNIT_MASS_KG,
      baseAreaCm2: back.ENDI_BACKREST_BASE_AREA_CM2,
      areaThresholdAdc: back.ENDI_BACKREST_AREA_THRESHOLD_ADC,
      interpCellAreaCm2: back.ENDI_BACKREST_CELL_AREA_CM2,
      positionCount: back.ENDI_BACKREST_POSITION_COUNT,
      overRange: {
        forceThresholdN: back.ENDI_BACKREST_OVER_RANGE_FORCE_THRESHOLD_N,
        forceGain: back.ENDI_BACKREST_OVER_RANGE_GAIN,
        areaGain: back.ENDI_BACKREST_OVER_RANGE_AREA_GAIN,
      },
      calib: BACK_CALIB,
      config: BACK_CONFIG,
    },
  };
}
