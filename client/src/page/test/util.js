import { graCenter, kurtosis, mean, normalPDF, skewness, variance } from "../../util/util"

// export const sitDataGenData = (arr) => {
//     const arrSmooth = graCenter([...arr], width, height)
//     const μ = mean(arr);
//     const Var = variance(arr, μ);
//     const σ = Math.sqrt(Var);
//     const Skew = skewness(arr, μ, σ);
//     const Kurt = kurtosis(arr, μ, σ);
//     const xData = Array.from({ length: 256 }, (_, i) => i);
//     const yData = xData.map(x => normalPDF(x, μ, σ));
//     const area = arr.filter((a) => a > 0).length
//     const press = arr.reduce((a, b) => a + b, 0)
// }

// 分压公式
export function pressFN(arr, width, height, valuePress, type = "row") {
    let wsPointData = [...arr];

    const value = Number(valuePress)
    

    if (type == "row") {
        let colArr = [];
        for (let i = 0; i < height; i++) {
            let total = 0;
            for (let j = 0; j < width; j++) {
                total += wsPointData[i * width + j];
            }
            colArr.push(total);
        }
        // //////okok
        for (let i = 0; i < height; i++) {
            // for (let j = 0; j < width; j++) {
            //     wsPointData[i * width + j] = parseInt(
            //         (wsPointData[i * width + j] /
            //             (value - colArr[i] <= 0 ? 1 : value - colArr[i])) *
            //         1000
            //     );
            // }
            for (let j = 0; j < width; j++) {
                wsPointData[i * width + j] = parseInt(
                  (wsPointData[i * width + j]
                    // *colArr[i]/100)


                    // + (wsPointData[i * width + j] != 0 ? colArr[i] / 2.2 : 0))/6
                  )
           
                );
            }
        }
    } else {
        let colArr = [];
        for (let i = 0; i < height; i++) {
            let total = 0;

            for (let j = 0; j < width; j++) {
                total += wsPointData[j * height + i];
            }
            console.log(wsPointData)
            colArr.push(total);
        }

        console.log(colArr)
        // //////okok
        for (let i = 0; i < height; i++) {
            for (let j = 0; j < width; j++) {
                wsPointData[j * height + i] = parseInt(
                    (wsPointData[j * height + i] /
                        (value - colArr[i] <= 0 ? 1 : value - colArr[i])) *
                    1000
                );
            }
        }
    }
    
    //////

    // wsPointData = wsPointData.map((a,index) => {return calculateY(a)})
    return wsPointData;
}

function gaussianKernel1D(sigma, radius) {
  const size = radius * 2 + 1;
  const kernel = new Array(size);
  const sigma2 = sigma * sigma;
  let sum = 0;

  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma2));
    kernel[i + radius] = v;
    sum += v;
  }

  // 归一化
  return kernel.map(v => v / sum);
}

export function gaussianBlur1D(data, sigma = 1, radius = 3) {
  const kernel = gaussianKernel1D(sigma, radius);
  const size = kernel.length;
  const r = Math.floor(size / 2);

  const result = new Array(data.length).fill(0);

  for (let i = 0; i < data.length; i++) {
    let sum = 0;

    for (let k = -r; k <= r; k++) {
      const idx = i + k;

      // 边界处理 (Clamp 边界)
      const safeIdx = Math.max(0, Math.min(data.length - 1, idx));

      sum += data[safeIdx] * kernel[k + r];
    }

    result[i] = sum;
  }

  return result;
}