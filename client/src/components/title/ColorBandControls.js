import React, { useId } from 'react'
import { InputNumber, Slider } from 'antd'
import {
    DEFAULT_COLOR_BAND_RATIOS,
    getColorBandStops,
    normalizeColorBandRatios,
    updateColorBandRatio,
} from '../../util/mannequinColorBands'
import './ColorBandControls.scss'

const COLORS = ['#4D94E0', '#00BFE6', '#1AC759', '#FFE61A', '#FF9E00', '#F20A00']
const BAND_LABEL_KEYS = [
    'colorBandBlueCyan', 'colorBandCyanGreen', 'colorBandGreenYellow',
    'colorBandYellowOrange', 'colorBandOrangeRed',
]

/** Five transition widths span one pressure color range; changing them never changes readings. */
function ColorBandControls({ ratios, onChange, t, title, hint, defaultRatios = DEFAULT_COLOR_BAND_RATIOS }) {
    const id = useId()
    const values = normalizeColorBandRatios(ratios ?? defaultRatios)
    const heading = title || t('heatmapColorBands')
    const positions = [0, ...getColorBandStops(values).map(stop => stop * 100), 100]
    const gradient = `linear-gradient(to right, ${COLORS.map((color, index) => `${color} ${positions[index]}%`).join(', ')})`

    const changeBand = (index, value) => {
        if (value === null || value === undefined || value === '') return
        const numeric = Number(value)
        if (!Number.isFinite(numeric)) return
        onChange(updateColorBandRatio(values, index, numeric))
    }

    return (
        <section className="colorBandControls" aria-labelledby={`${id}-title`} data-testid="color-band-controls">
            <div className="colorBandControls__heading">
                <span id={`${id}-title`}>{heading}</span>
                <span className="colorBandControls__total">{t('colorBandTotal')}: 100%</span>
            </div>
            <div className="colorBandControls__preview" role="img" aria-label={t('colorBandPreview')} style={{ background: gradient }} />
            <p className="colorBandControls__hint" id={`${id}-hint`}>{hint || t('colorBandHint')}</p>
            <div className="colorBandControls__rows">
                {BAND_LABEL_KEYS.map((key, index) => {
                    const label = t(key)
                    const accessibleLabel = `${heading} ${label}`
                    return (
                        <div className="colorBandControls__row" key={key}>
                            <label htmlFor={`${id}-${index}`} className="colorBandControls__label">
                                <i aria-hidden="true" style={{ background: `linear-gradient(to right, ${COLORS[index]}, ${COLORS[index + 1]})` }} />
                                <span>{label}</span>
                            </label>
                            <Slider
                                min={1}
                                max={96}
                                step={1}
                                value={values[index]}
                                onChange={value => changeBand(index, value)}
                                ariaLabelForHandle={accessibleLabel}
                                tooltip={{ formatter: value => `${value}%` }}
                            />
                            <span className="colorBandControls__number">
                                <InputNumber
                                    id={`${id}-${index}`}
                                    aria-label={accessibleLabel}
                                    aria-describedby={`${id}-hint`}
                                    min={1}
                                    max={96}
                                    step={1}
                                    precision={0}
                                    controls={false}
                                    value={values[index]}
                                    onChange={value => changeBand(index, value)}
                                />
                                <span aria-hidden="true">%</span>
                            </span>
                        </div>
                    )
                })}
            </div>
            <button type="button" className="colorBandControls__reset" onClick={() => onChange(normalizeColorBandRatios(defaultRatios))}>
                {t('resetColorBands')}
            </button>
        </section>
    )
}

export default React.memo(ColorBandControls)
