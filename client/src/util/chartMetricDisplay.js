import { getPressureMetricDisplay } from './pressureMetrics'

// ADC is a visualization mode, never a physical calibration/export unit.
export function getChartMetricDisplay(mode, t, language) {
  if (mode !== 'adc') return getPressureMetricDisplay(mode, t, language)
  const english = String(language || '').toLowerCase().startsWith('en')
  const label = (key, zh, en) => {
    const translated = t?.(key)
    return translated && translated !== key ? translated : english ? en : zh
  }
  return {
    mode: 'adc', nextMode: 'pressure', unit: 'ADC', name: 'ADC',
    valuePrefix: 'adc', trendField: 'adcArr', unitLabel: 'ADC',
    curveLabel: label('adcCurve', 'ADC总和曲线', 'Total ADC Curve'),
    axisLabel: label('adcTotal', 'ADC总和', 'Total ADC') + '(ADC)',
    labels: {
      average: label('adcAverage', '平均ADC', 'Average ADC'),
      max: label('adcMax', '最大ADC', 'Maximum ADC'),
      total: label('adcTotal', 'ADC总和', 'Total ADC'),
    },
  }
}
