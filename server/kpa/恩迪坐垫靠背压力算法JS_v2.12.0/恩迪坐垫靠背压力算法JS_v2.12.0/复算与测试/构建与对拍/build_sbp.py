#!/usr/bin/env python3
"""构建 seatBackrestPressure_v2.12.0.js（由上位机 V2.7.110 源码打包）。

用法：python3 build_sbp.py [输出目录，默认 ./dist]
1. esbuild 打包 kernel_entry.ts → kernel.cjs（CommonJS、neutral 平台、ES2019）
2. 靠背核心 process() 中 "timestampMs 缺省用 Date.now()" 的分支在本模块中不可达
   （静态路径传 0，会话路径总是传显式时间），替换为抛错，使模块不含系统时钟调用
3. 检查禁用调用（Date.now / Math.random / performance / process / require / import / localStorage / window / document / setTimeout）
4. 嵌入 wrapper.template.js 的 createLocalKernel() 函数体，写出 js，并记录源码 SHA256
"""
import hashlib, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
# 上位机源码目录：kernel_entry.ts 以相对路径 ../源码/client/src/lib/ 引用（交付包内为 复算与测试/源码，
# 由“上位机V2.7.110完整源码.zip”解压得到；需先在其中执行 pnpm install 以获得 esbuild）
SRC = os.path.normpath(os.path.join(HERE, "..", "源码"))
LIB = SRC + "/client/src/lib"
OUT = sys.argv[1] if len(sys.argv) > 1 else HERE + "/dist"
NAME = "seatBackrestPressure_v2.12.0"
SOURCES = [
    "sensorConfig.ts", "adcCompensation.ts", "endiSeatForce.ts", "endiBackrestForce.ts",
    "endiPointPressure.ts", "pressureUnits.ts", "version.ts",
    "endiCushion/endiCushionCore.js", "endiBackrest/endiBackrestCore.js",
]

def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()

os.makedirs(OUT, exist_ok=True)
kern = HERE + "/kernel.cjs"
subprocess.run([SRC + "/node_modules/.bin/esbuild", HERE + "/kernel_entry.ts", "--bundle", "--format=cjs",
                "--platform=neutral", "--target=es2019", "--legal-comments=none", "--log-level=warning",
                "--outfile=" + kern], check=True, cwd=HERE)
k = open(kern, encoding="utf-8").read()
# esbuild 的模块路径注释与源码所在目录有关，统一为 "// lib/<文件>"，保证任何目录下构建结果逐字节相同
k = re.sub(r"^// (?:[^\n]*/)?client/src/lib/([^\n]+)$", r"// lib/\1", k, flags=re.M)
assert "src_build" not in k and "/home/" not in k, "内核中残留本地路径"

old = "const t = timestampMs == null ? Date.now() : +timestampMs;"
assert k.count(old) == 1, "靠背核心 Date.now 分支位置变化"
k = k.replace(old, 'const t = timestampMs == null ? (() => { throw new TypeError("timestampMs 必须显式传入"); })() : +timestampMs;')
# 注释中的 Date.now 文字一并改写，便于全文检查
k = k.replace("缺省用 Date.now()", "必须显式传入")

forbidden = [r"Date\.now", r"Math\.random", r"\bperformance\.", r"\bprocess\.", r"\brequire\(", r"\bimport\(",
             r"localStorage", r"\bwindow\.", r"\bdocument\.", r"setTimeout", r"setInterval", r"\bfetch\(", r"XMLHttpRequest"]
hits = {f: len(re.findall(f, k)) for f in forbidden}
bad = {f: n for f, n in hits.items() if n}
assert not bad, "内核含禁用调用：%r" % bad

tpl = open(HERE + "/wrapper.template.js", encoding="utf-8").read()
src_hash = {s: sha(LIB + "/" + s) for s in SOURCES}
ver = re.search(r'APP_VERSION = "([^"]+)"', open(LIB + "/version.ts", encoding="utf-8").read()).group(1)
info = "source application %s; esbuild kernel sha256 %s" % (ver, hashlib.sha256(k.encode()).hexdigest())
indented = "\n".join(("    " + ln) if ln.strip() else ln for ln in k.splitlines())
assert tpl.count("/*__KERNEL__*/") == 1 and tpl.count("__BUILD_INFO__") == 1
js = tpl.replace("    /*__KERNEL__*/", indented).replace("__BUILD_INFO__", info)
wrapper_only = tpl.replace("/*__KERNEL__*/", "")
hits2 = {f: len(re.findall(f, wrapper_only)) for f in forbidden}
assert not any(hits2.values()), "外层包装含禁用调用：%r" % hits2

out_js = os.path.join(OUT, NAME + ".js")
open(out_js, "w", encoding="utf-8", newline="\n").write(js)
manifest = {
    "file": NAME + ".js",
    "version": "2.12.0",
    "sourceApplicationVersion": ver,
    "bytes": os.path.getsize(out_js),
    "sha256": sha(out_js),
    "kernelSha256": hashlib.sha256(k.encode()).hexdigest(),
    "sourceFilesSha256": src_hash,
    "forbiddenTokenCounts": hits,
    "dateNowBranch": "靠背核心 process() 缺省时间分支替换为抛错（不可达：静态 0 / 会话显式时间）",
}
json.dump(manifest, open(os.path.join(OUT, NAME + ".build.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(json.dumps({"js": out_js, "bytes": manifest["bytes"], "sha256": manifest["sha256"], "app": ver}, ensure_ascii=False))
