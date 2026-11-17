// 导出两个核心内置的连续拟合参数（c0、k、位置增益、节点、σ、点距），供 consistency.py 使用。
// 用法（在 复算与测试/ 下）：源码/node_modules/.bin/tsx 数据表/dump_params.ts /tmp/位置增益参数.json
import fs from "node:fs";
import { DEFAULT_PARAMS } from "../源码/client/src/lib/endiCushion/endiCushionCore.js";
import { CALIB, DEFAULT_CONFIG } from "../源码/client/src/lib/endiBackrest/endiBackrestCore.js";
const P: any = DEFAULT_PARAMS;
fs.writeFileSync(process.argv[2] ?? "位置增益参数.json", JSON.stringify({
  seat: { fit: P.fit, block: P.block_kg ?? P.mass_per_block ?? null, keys: Object.keys(P) },
  back: { fit: (CALIB as any).fit, sigmaMm: (CALIB as any).sigmaMm, pitchRowMm: (DEFAULT_CONFIG as any).pitchRowMm, pitchColMm: (DEFAULT_CONFIG as any).pitchColMm, fitC0: (DEFAULT_CONFIG as any).fitC0, fitK: (DEFAULT_CONFIG as any).fitK },
}));
